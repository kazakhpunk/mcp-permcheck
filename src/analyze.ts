import ts from "typescript";
import { SINKS } from "./sinks.ts";
import type { CallSite, Leaf } from "./types.ts";

// ---------------------------------------------------------------------------
// Named-import / namespace-import alias resolution
// ---------------------------------------------------------------------------

const MODULE_NS: Record<string, string> = {
  "fs": "fs",
  "node:fs": "fs",
  "fs/promises": "fs.promises",
  "node:fs/promises": "fs.promises",
  "child_process": "child_process",
  "node:child_process": "child_process",
  "http": "http",
  "node:http": "http",
  "https": "https",
  "node:https": "https",
  "net": "net",
  "node:net": "net",
  "dgram": "dgram",
  "node:dgram": "dgram",
  "worker_threads": "worker_threads",
  "node:worker_threads": "worker_threads",
  "axios": "axios",
  "undici": "undici",
  "ws": "ws",
  "node-fetch": "node_fetch",
  "pg": "pg",
  "mongodb": "mongodb",
  "mongoose": "mongoose",
  "nodemailer": "nodemailer",
  "redis": "redis",
  "ioredis": "ioredis",
  "@prisma/client": "prisma",
};

type Aliases = { named: Map<string, string>; namespace: Map<string, string> };
const EMPTY_ALIASES: Aliases = { named: new Map(), namespace: new Map() };

function buildImportAliases(sf: ts.SourceFile): Aliases {
  const named = new Map<string, string>();
  const namespace = new Map<string, string>();
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue;
    if (!ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    const ns = MODULE_NS[stmt.moduleSpecifier.text];
    if (!ns) continue;
    const ic = stmt.importClause;
    if (!ic) continue;

    // Default import: register as callable (foo()) AND as namespace (foo.X)
    if (ic.name) {
      const local = ic.name.text;
      named.set(local, `${ns}.default`);
      namespace.set(local, ns);
    }
    if (ic.namedBindings) {
      const nb = ic.namedBindings;
      if (ts.isNamespaceImport(nb)) {
        namespace.set(nb.name.text, ns);
      } else if (ts.isNamedImports(nb)) {
        for (const elem of nb.elements) {
          const localName = elem.name.text;
          const exportName = elem.propertyName?.text ?? localName;
          named.set(localName, `${ns}.${exportName}`);
        }
      }
    }
  }
  return { named, namespace };
}

// ---------------------------------------------------------------------------
// Prisma flow-sensitive detector
// ---------------------------------------------------------------------------

const PRISMA_READ_VERBS = new Set([
  "findMany", "findFirst", "findUnique",
  "findFirstOrThrow", "findUniqueOrThrow",
  "count", "aggregate", "groupBy",
]);
const PRISMA_WRITE_VERBS = new Set([
  "create", "update", "delete", "upsert",
  "createMany", "updateMany", "deleteMany",
  "updateManyAndReturn",
]);

function isPrismaShapedCall(call: ts.CallExpression): { leaf: Leaf } | null {
  // Pattern: <receiver>.<model>.<verb>()
  // Examples: prisma.user.findMany();  db.user.create();  this.prisma.post.delete();
  const expr = call.expression;
  if (!ts.isPropertyAccessExpression(expr)) return null;
  const verb = expr.name.text;
  const isRead = PRISMA_READ_VERBS.has(verb);
  const isWrite = PRISMA_WRITE_VERBS.has(verb);
  if (!isRead && !isWrite) return null;
  // Check the receiver is itself a PropertyAccessExpression (for the .<model>. layer)
  if (!ts.isPropertyAccessExpression(expr.expression)) return null;
  return { leaf: isRead ? "READ_DB" : "WRITE_DB" };
}

// ---------------------------------------------------------------------------
// CallGraph data structures (exported)
// ---------------------------------------------------------------------------

export type CallEdgeTarget =
  | { kind: "fn"; node: ts.Node; name: string }
  | { kind: "sink"; fqn: string; leaf: Leaf };

export interface CallEdge {
  target: CallEdgeTarget;
  site: CallSite;
}

export interface CallGraphNode {
  fn: ts.Node; // function-like node
  name: string; // best-effort identifier
  file: string; // basename
  line: number; // 1-indexed
  edges: CallEdge[]; // outgoing edges
}

export interface CallGraph {
  nodes: Map<ts.Node, CallGraphNode>; // all registered function-like nodes
  toolHandlers: Map<string, ts.Node>; // tool name → handler entry node
  notes: string[];
}

// ---------------------------------------------------------------------------
// ToolEntry / AnalyseResult
// ---------------------------------------------------------------------------

export interface ToolEntry {
  description: string;
  actual: Set<Leaf>;
  witnesses: Map<Leaf, CallSite[]>;
}

export interface AnalyseResult {
  byTool: Map<string, ToolEntry>;
  notes: string[];
  graph: CallGraph;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function extractActual(srcPath: string): AnalyseResult {
  const program = ts.createProgram({
    rootNames: [srcPath],
    options: { allowJs: false, noEmit: true, target: ts.ScriptTarget.ES2022 },
  });
  const sourceFile = program.getSourceFile(srcPath);
  if (!sourceFile) throw new Error(`could not load source: ${srcPath}`);
  const checker = program.getTypeChecker();

  // Determine project root as the directory of srcPath.
  const projectRoot = program.getCurrentDirectory();

  // Per-source-file alias cache (built lazily)
  const aliasCache = new Map<ts.SourceFile, Aliases>();
  function aliasesFor(sf: ts.SourceFile): Aliases {
    let a = aliasCache.get(sf);
    if (!a) { a = buildImportAliases(sf); aliasCache.set(sf, a); }
    return a;
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

  function fqnOfCallee(call: ts.CallExpression, sf: ts.SourceFile, aliases: Aliases): string | null {
    const expr = call.expression;
    if (ts.isIdentifier(expr)) {
      // 1. Named-import alias (e.g., `import { readFile } from "fs"; readFile()`)
      const aliased = aliases.named.get(expr.text);
      if (aliased) return aliased;
      // 2. Global (e.g., bare `fetch()`, `eval()`)
      if (SINKS.has(`globalThis.${expr.text}`)) return `globalThis.${expr.text}`;
      return null;
    }
    if (ts.isPropertyAccessExpression(expr)) {
      // 1. If the receiver is a namespace alias, rewrite the namespace
      if (ts.isIdentifier(expr.expression)) {
        const ns = aliases.namespace.get(expr.expression.text);
        if (ns) return `${ns}.${expr.name.text}`;
      }
      // 2. Otherwise fall back to source text (handles process.kill, fs.readFile
      //    when fs isn't imported — TS uses ambient declarations)
      return expr.getText(sf);
    }
    return null;
  }

  function classifySql(arg: ts.Expression): Leaf[] {
    if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) {
      const sql = arg.text.trim().toUpperCase();
      if (sql.startsWith("SELECT")) return ["READ_DB"];
      if (/^(INSERT|UPDATE|DELETE|DROP|TRUNCATE|CREATE|ALTER)\b/.test(sql)) {
        return ["WRITE_DB"];
      }
      return ["READ_DB", "WRITE_DB"]; // unknown literal SQL — be conservative
    }
    return ["READ_DB", "WRITE_DB"]; // non-literal: over-approximate
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

  // ---------------------------------------------------------------------------
  // Phase A: Build the CallGraph
  // ---------------------------------------------------------------------------

  const graph: CallGraph = {
    nodes: new Map(),
    toolHandlers: new Map(),
    notes: [],
  };

  // Helper: name a function-like node based on context
  function nameForNode(n: ts.Node, fallback: string): string {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) {
      const cls = n.parent;
      if (ts.isClassDeclaration(cls) && cls.name) {
        return `${cls.name.text}.${n.name.text}`;
      }
      return n.name.text;
    }
    return fallback;
  }

  // Pre-register a node into the graph if not already registered
  function registerNode(node: ts.Node, name: string): CallGraphNode {
    let gn = graph.nodes.get(node);
    if (!gn) {
      const sf = node.getSourceFile();
      const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
      gn = {
        fn: node,
        name,
        file: sf.fileName.split("/").pop() ?? sf.fileName,
        line: line + 1,
        edges: [],
      };
      graph.nodes.set(node, gn);
    }
    return gn;
  }

  // fnsByName: same name-based index as before, for identifier resolution
  const fnsByName = new Map<string, ts.Node>();

  // Step A1: Pre-register all function-like nodes in user-code source files
  function indexFns(n: ts.Node) {
    if (ts.isFunctionDeclaration(n) && n.name) {
      const name = n.name.text;
      fnsByName.set(name, n);
      registerNode(n, name);
    } else if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) {
      const methodName = nameForNode(n, n.name.text);
      registerNode(n, methodName);
    } else if (ts.isVariableStatement(n)) {
      for (const decl of n.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isFunctionExpression(decl.initializer) || ts.isArrowFunction(decl.initializer))
        ) {
          const name = decl.name.text;
          fnsByName.set(name, decl.initializer);
          registerNode(decl.initializer, name);
        }
      }
    }
    ts.forEachChild(n, indexFns);
  }

  // Index all user-code source files (not declaration files, not node_modules, not outside project root).
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile) continue;
    if (sf.fileName.includes("node_modules")) continue;
    if (!sf.fileName.startsWith(projectRoot)) continue;
    indexFns(sf);
  }

  // Step A2: Pre-register tool handlers from server.tool() calls
  function collectToolHandlers(n: ts.Node) {
    if (ts.isCallExpression(n) && isServerToolCall(n)) {
      const meta = parseServerToolCall(n, graph.notes);
      if (meta && n.arguments.length >= 3) {
        const handlerArg = n.arguments[2];
        const handlerName = `<handler:${meta.name}>`;
        registerNode(handlerArg, handlerName);
        graph.toolHandlers.set(meta.name, handlerArg);
      }
    }
    ts.forEachChild(n, collectToolHandlers);
  }
  collectToolHandlers(sourceFile);

  // Step A3: Walk each registered node's body and emit edges
  // (stop at nested function boundaries)
  function isProcessEnvAccess(node: ts.Node): boolean {
    if (ts.isPropertyAccessExpression(node)) {
      const obj = node.expression;
      if (
        ts.isPropertyAccessExpression(obj) &&
        ts.isIdentifier(obj.expression) &&
        obj.expression.text === "process" &&
        obj.name.text === "env"
      ) return true;
    }
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

  // Callback counter per node (for stable naming of inline callbacks)
  let callbackCounter = 0;

  // Returns true if the node is in a declaration file or node_modules (not user code).
  function isExternalNode(n: ts.Node): boolean {
    const sf = n.getSourceFile();
    return sf.isDeclarationFile ||
      sf.fileName.includes("node_modules") ||
      !sf.fileName.startsWith(projectRoot);
  }

  function resolveCallTargetNode(call: ts.CallExpression): ts.Node | null {
    const expr = call.expression;

    if (ts.isIdentifier(expr)) {
      // Direct name lookup first (guaranteed to be user code since indexFns only indexes user code)
      const target: ts.Node | undefined = fnsByName.get(expr.text);
      if (target) return target;

      // TS type-checker fallback — but ONLY for user-code nodes
      const symbol = checker.getSymbolAtLocation(expr);
      if (symbol) {
        const aliased = symbol.flags & ts.SymbolFlags.Alias
          ? checker.getAliasedSymbol(symbol)
          : symbol;
        for (const d of aliased.getDeclarations() ?? []) {
          // Skip declaration files and node_modules
          if (d.getSourceFile().isDeclarationFile) continue;
          if (d.getSourceFile().fileName.includes("node_modules")) continue;
          if (
            ts.isFunctionDeclaration(d) ||
            ts.isFunctionExpression(d) ||
            ts.isArrowFunction(d)
          ) {
            return d;
          }
          if (
            ts.isVariableDeclaration(d) &&
            d.initializer &&
            (ts.isFunctionExpression(d.initializer) || ts.isArrowFunction(d.initializer))
          ) {
            return d.initializer;
          }
        }
      }
    }

    if (ts.isPropertyAccessExpression(expr)) {
      const symbol = checker.getSymbolAtLocation(expr.name);
      if (symbol) {
        for (const d of symbol.getDeclarations() ?? []) {
          // Skip declaration files and node_modules
          if (d.getSourceFile().isDeclarationFile) continue;
          if (d.getSourceFile().fileName.includes("node_modules")) continue;
          if (ts.isMethodDeclaration(d) && d.body) {
            return d;
          }
        }
      }
    }

    return null;
  }

  function buildEdgesFor(gn: CallGraphNode) {
    const sf = gn.fn.getSourceFile();
    const aliases = aliasesFor(sf);

    function inner(node: ts.Node, isRoot: boolean) {
      // Stop at nested function boundaries (not the root)
      if (
        !isRoot &&
        (ts.isFunctionExpression(node) ||
          ts.isArrowFunction(node) ||
          ts.isFunctionDeclaration(node) ||
          ts.isMethodDeclaration(node))
      ) {
        return;
      }

      if (ts.isCallExpression(node)) {
        const prisma = isPrismaShapedCall(node);
        if (prisma) {
          const calleeText = node.expression.getText(sf);
          gn.edges.push({
            target: { kind: "sink", fqn: calleeText, leaf: prisma.leaf },
            site: siteOf(node, sf, calleeText),
          });
        } else if (isSqlShapedCall(node) && node.arguments.length >= 1) {
          const leaves = classifySql(node.arguments[0]);
          const calleeText = node.expression.getText(sf);
          for (const leaf of leaves) {
            gn.edges.push({
              target: { kind: "sink", fqn: calleeText, leaf },
              site: siteOf(node, sf, calleeText),
            });
          }
        } else {
          // Try to resolve to a known function node
          const targetNode = resolveCallTargetNode(node);
          if (targetNode && graph.nodes.has(targetNode)) {
            const targetGn = graph.nodes.get(targetNode)!;
            gn.edges.push({
              target: { kind: "fn", node: targetNode, name: targetGn.name },
              site: siteOf(node, sf, targetGn.name),
            });
          } else if (targetNode && !graph.nodes.has(targetNode)) {
            // Node exists but wasn't pre-registered (e.g. cross-file resolved node)
            const targetName = nameForNode(targetNode, "<unknown>");
            const targetGn2 = registerNode(targetNode, targetName);
            // We'll need to build edges for this node too; handle by
            // registering it and then building its edges after this pass.
            gn.edges.push({
              target: { kind: "fn", node: targetNode, name: targetGn2.name },
              site: siteOf(node, sf, targetGn2.name),
            });
          } else {
            // Try FQN sink lookup
            const fqn = fqnOfCallee(node, sf, aliases);
            if (fqn) {
              const leaf = SINKS.get(fqn);
              if (leaf) {
                gn.edges.push({
                  target: { kind: "sink", fqn, leaf },
                  site: siteOf(node, sf, fqn),
                });
              }
            }
          }

          // Handle async-shape callbacks (promise chains, schedulers)
          const asyncShape = getCalleeAsyncShape(node);
          if (asyncShape !== null) {
            const argIndices = asyncShape.kind === "promise-chain" ? [0, 1] : [0];
            for (const i of argIndices) {
              const arg = node.arguments[i];
              if (arg && (ts.isFunctionExpression(arg) || ts.isArrowFunction(arg))) {
                const cbName = `<callback@${callbackCounter++}>`;
                const cbGn = registerNode(arg, cbName);
                gn.edges.push({
                  target: { kind: "fn", node: arg, name: cbGn.name },
                  site: siteOf(node, sf, cbName),
                });
              }
            }
          }
        }
      } else if (isProcessEnvAccess(node)) {
        gn.edges.push({
          target: { kind: "sink", fqn: "process.env", leaf: "ENV" },
          site: siteOf(node, sf, "process.env"),
        });
      }

      ts.forEachChild(node, (child) => inner(child, false));
    }

    inner(gn.fn, true);
  }

  // Build edges for all pre-registered nodes; use a "built" set to track which
  // nodes have already had their edges computed. New nodes discovered during
  // edge-building (e.g. cross-file resolved nodes) are processed in subsequent
  // iterations until fixpoint.
  const edgesBuilt = new Set<ts.Node>();
  let prevSize = 0;
  while (graph.nodes.size !== prevSize) {
    prevSize = graph.nodes.size;
    // Take a snapshot of current nodes to iterate over
    const snapshot = [...graph.nodes.values()];
    for (const gn of snapshot) {
      if (!edgesBuilt.has(gn.fn)) {
        edgesBuilt.add(gn.fn);
        buildEdgesFor(gn);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Phase B: Per-tool DFS traversal to compute P_Actual
  // ---------------------------------------------------------------------------

  const result: AnalyseResult = { byTool: new Map(), notes: graph.notes, graph };

  function recordSink(entry: ToolEntry, leaf: Leaf, site: CallSite) {
    entry.actual.add(leaf);
    const list = entry.witnesses.get(leaf) ?? [];
    list.push(site);
    entry.witnesses.set(leaf, list);
  }

  function dfsCollectSinks(
    handlerNode: ts.Node,
    entry: ToolEntry,
  ): void {
    const visited = new Set<ts.Node>();

    function dfs(node: ts.Node): void {
      if (visited.has(node)) return;
      visited.add(node);
      const gn = graph.nodes.get(node);
      if (!gn) return;
      for (const edge of gn.edges) {
        if (edge.target.kind === "sink") {
          recordSink(entry, edge.target.leaf, edge.site);
        } else {
          // fn edge: recurse
          dfs(edge.target.node);
        }
      }
    }

    dfs(handlerNode);
  }

  // Walk server.tool() calls on the source file to build byTool entries
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && isServerToolCall(node)) {
      const meta = parseServerToolCall(node, result.notes);
      if (meta) {
        const entry: ToolEntry = {
          description: meta.description,
          actual: new Set<Leaf>(),
          witnesses: new Map<Leaf, CallSite[]>(),
        };
        const handlerNode = graph.toolHandlers.get(meta.name);
        if (handlerNode) {
          dfsCollectSinks(handlerNode, entry);
        }
        result.byTool.set(meta.name, entry);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  return result;
}

// ---------------------------------------------------------------------------
// Helpers (file-level, not exported)
// ---------------------------------------------------------------------------

function isServerToolCall(node: ts.CallExpression): boolean {
  const callee = node.expression;
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const name = callee.name.text;
  // Match both the older server.tool() API and the current server.registerTool() API.
  return name === "tool" || name === "registerTool";
}

type AsyncShape = { kind: "promise-chain" } | { kind: "scheduler" } | null;

/**
 * If `call` is a promise-chain method (.then/.catch/.finally) or an async
 * scheduling primitive (setTimeout, setInterval, setImmediate, queueMicrotask,
 * process.nextTick), return the corresponding shape descriptor so the BFS can
 * follow the callback arguments. Returns null for everything else (including
 * array iteration methods like .map/.forEach which are intentionally excluded).
 */
function getCalleeAsyncShape(call: ts.CallExpression): AsyncShape {
  const expr = call.expression;
  // Promise chain: anything.then/.catch/.finally
  if (ts.isPropertyAccessExpression(expr)) {
    const name = expr.name.text;
    if (name === "then" || name === "catch" || name === "finally") {
      return { kind: "promise-chain" };
    }
    // process.nextTick
    if (
      name === "nextTick" &&
      ts.isIdentifier(expr.expression) &&
      expr.expression.text === "process"
    ) {
      return { kind: "scheduler" };
    }
  }
  // Scheduler globals: setTimeout/setImmediate/setInterval/queueMicrotask
  if (ts.isIdentifier(expr)) {
    const name = expr.text;
    if (
      name === "setTimeout" ||
      name === "setImmediate" ||
      name === "setInterval" ||
      name === "queueMicrotask"
    ) {
      return { kind: "scheduler" };
    }
  }
  return null;
}

/**
 * Fold a TypeScript expression into a string, handling:
 *   - string literals and no-substitution template literals
 *   - binary `+` concatenation of the above
 * Returns the concatenated string, or null if any operand is non-literal.
 */
function foldStringExpr(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = foldStringExpr(node.left);
    const right = foldStringExpr(node.right);
    if (left !== null && right !== null) return left + right;
  }
  return null;
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
      prop.name.text === "description"
    ) {
      const folded = foldStringExpr(prop.initializer as ts.Expression);
      if (folded !== null) {
        description = folded;
      }
    }
  }
  return { name: nameArg.text, description };
}
