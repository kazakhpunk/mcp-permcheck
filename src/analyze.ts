import ts from "typescript";
import { SINKS } from "./sinks.ts";
import type { CallSite, Leaf } from "./types.ts";

export interface ToolEntry {
  description: string;
  actual: Set<Leaf>;
  witnesses: Map<Leaf, CallSite[]>;
}

export interface AnalyseResult {
  byTool: Map<string, ToolEntry>;
  notes: string[];
}

export function extractActual(srcPath: string): AnalyseResult {
  const program = ts.createProgram({
    rootNames: [srcPath],
    options: { allowJs: false, noEmit: true, target: ts.ScriptTarget.ES2022 },
  });
  const sourceFile = program.getSourceFile(srcPath);
  if (!sourceFile) throw new Error(`could not load source: ${srcPath}`);
  const result: AnalyseResult = { byTool: new Map(), notes: [] };

  // Pass 1: index file-local function bodies by name.
  const fnsByName = new Map<string, ts.Node>();
  function indexFns(n: ts.Node) {
    if (ts.isFunctionDeclaration(n) && n.name) {
      fnsByName.set(n.name.text, n);
    } else if (ts.isVariableStatement(n)) {
      for (const decl of n.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isFunctionExpression(decl.initializer) || ts.isArrowFunction(decl.initializer))
        ) {
          fnsByName.set(decl.name.text, decl.initializer);
        }
      }
    }
    ts.forEachChild(n, indexFns);
  }
  indexFns(sourceFile);

  function recordSink(entry: ToolEntry, leaf: Leaf, site: CallSite) {
    entry.actual.add(leaf);
    const list = entry.witnesses.get(leaf) ?? [];
    list.push(site);
    entry.witnesses.set(leaf, list);
  }

  function siteOf(node: ts.Node, sf: ts.SourceFile, symbol: string): CallSite {
    const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
    return {
      file: sf.fileName.split("/").pop() ?? sf.fileName,
      line: line + 1,
      col: character + 1,
      symbol,
    };
  }

  function fqnOfCallee(call: ts.CallExpression, sf: ts.SourceFile): string | null {
    const expr = call.expression;
    if (ts.isPropertyAccessExpression(expr)) return expr.getText(sf);
    if (ts.isIdentifier(expr)) {
      if (SINKS.has(`globalThis.${expr.text}`)) return `globalThis.${expr.text}`;
      return null;
    }
    return null;
  }

  function classifySql(arg: ts.Expression): Leaf[] {
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
      const sql = arg.text.trim().toUpperCase();
      if (sql.startsWith("SELECT")) return ["READ"];
      if (/^(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER)\b/.test(sql)) {
        return ["WRITE"];
      }
      return ["READ", "WRITE"]; // unknown literal SQL — be conservative
    }
    return ["READ", "WRITE"]; // non-literal: over-approximate
  }

  function isSqlShapedCall(call: ts.CallExpression): boolean {
    const expr = call.expression;
    if (ts.isPropertyAccessExpression(expr)) {
      const name = expr.name.text;
      return name === "query" || name === "execute";
    }
    if (ts.isIdentifier(expr)) {
      return expr.text === "pgQuery" || expr.text === "query" || expr.text === "execute";
    }
    return false;
  }

  // Compute reachable function set from a starting node via BFS over Identifier callees.
  function reachableFrom(start: ts.Node): Set<ts.Node> {
    const reached = new Set<ts.Node>([start]);
    const queue: ts.Node[] = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      function findCalls(n: ts.Node) {
        if (ts.isCallExpression(n)) {
          const expr = n.expression;
          if (ts.isIdentifier(expr)) {
            const target = fnsByName.get(expr.text);
            if (target && !reached.has(target)) {
              reached.add(target);
              queue.push(target);
            }
          }
        }
        ts.forEachChild(n, findCalls);
      }
      findCalls(cur);
    }
    return reached;
  }

  function walkSinksIn(n: ts.Node, sf: ts.SourceFile, entry: ToolEntry) {
    function isProcessEnvAccess(node: ts.Node): boolean {
      // process.env.<X>
      if (ts.isPropertyAccessExpression(node)) {
        const obj = node.expression;
        if (
          ts.isPropertyAccessExpression(obj) &&
          ts.isIdentifier(obj.expression) &&
          obj.expression.text === "process" &&
          obj.name.text === "env"
        ) return true;
      }
      // process.env["X"]
      if (ts.isElementAccessExpression(node)) {
        const obj = node.expression;
        if (
          ts.isPropertyAccessExpression(obj) &&
          ts.isIdentifier(obj.expression) &&
          obj.expression.text === "process" &&
          obj.name.text === "env"
        ) return true;
      }
      return false;
    }

    function inner(node: ts.Node) {
      if (ts.isCallExpression(node)) {
        if (isSqlShapedCall(node) && node.arguments.length >= 1) {
          const leaves = classifySql(node.arguments[0]);
          const calleeText = node.expression.getText(sf);
          for (const leaf of leaves) recordSink(entry, leaf, siteOf(node, sf, calleeText));
        } else {
          const fqn = fqnOfCallee(node, sf);
          if (fqn) {
            const leaf = SINKS.get(fqn);
            if (leaf) recordSink(entry, leaf, siteOf(node, sf, fqn));
          }
        }
      } else if (isProcessEnvAccess(node)) {
        recordSink(entry, "READ", siteOf(node, sf, "process.env"));
      }
      ts.forEachChild(node, inner);
    }
    inner(n);
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isServerToolCall(node)) {
      const meta = parseServerToolCall(node, result.notes);
      if (meta) {
        const entry: ToolEntry = {
          description: meta.description,
          actual: new Set<Leaf>(),
          witnesses: new Map<Leaf, CallSite[]>(),
        };
        const handler = node.arguments[2];
        const reachable = reachableFrom(handler);
        for (const fn of reachable) walkSinksIn(fn, sourceFile!, entry);
        result.byTool.set(meta.name, entry);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return result;
}

function isServerToolCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  return ts.isPropertyAccessExpression(callee) && callee.name.text === "tool";
}

function parseServerToolCall(
  node: ts.CallExpression,
  notes: string[],
): { name: string; description: string } | null {
  if (node.arguments.length < 3) {
    notes.push("server.tool call with <3 arguments — skipping");
    return null;
  }
  const [nameArg, optsArg] = node.arguments;
  if (!ts.isStringLiteral(nameArg) && !ts.isNoSubstitutionTemplateLiteral(nameArg)) {
    notes.push("server.tool name is not a literal — skipping");
    return null;
  }
  if (!ts.isObjectLiteralExpression(optsArg)) {
    notes.push(`server.tool "${nameArg.text}" opts is not an object literal — skipping`);
    return null;
  }
  let description = "";
  for (const prop of optsArg.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ts.isIdentifier(prop.name) &&
      prop.name.text === "description" &&
      (ts.isStringLiteral(prop.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(prop.initializer))
    ) {
      description = prop.initializer.text;
    }
  }
  return { name: nameArg.text, description };
}
