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
  if (!sourceFile) {
    throw new Error(`could not load source: ${srcPath}`);
  }
  const result: AnalyseResult = { byTool: new Map(), notes: [] };

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
    // PropertyAccess: foo.bar(...) or a.b.c(...)
    if (ts.isPropertyAccessExpression(expr)) {
      const text = expr.getText(sf); // "process.kill", "pg.query"
      return text;
    }
    // Identifier: bareName(...)
    if (ts.isIdentifier(expr)) {
      // Globals: fetch, eval, etc.
      if (SINKS.has(`globalThis.${expr.text}`)) return `globalThis.${expr.text}`;
      return null;
    }
    return null;
  }

  function visitToolHandler(handler: ts.Node, sf: ts.SourceFile, entry: ToolEntry) {
    function walk(n: ts.Node) {
      if (ts.isCallExpression(n)) {
        const fqn = fqnOfCallee(n, sf);
        if (fqn) {
          const leaf = SINKS.get(fqn);
          if (leaf) recordSink(entry, leaf, siteOf(n, sf, fqn));
        }
      }
      ts.forEachChild(n, walk);
    }
    walk(handler);
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
        visitToolHandler(handler, sourceFile!, entry);
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
