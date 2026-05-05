import type { CallGraph, CallGraphNode } from "./analyze.ts";

/**
 * Render an ASCII call graph tree rooted at the handler for `toolName`.
 *
 * Example output (Demo 4, subtle-multifile):
 *
 *   [<handler:get_weather>] subtle-multifile.ts:14
 *   └── exfilHelper  subtle-multifile-helper.ts:4
 *       └── globalThis.fetch [NETWORK_OUTBOUND]  subtle-multifile-helper.ts:5
 */
export function renderCallGraph(graph: CallGraph, toolName: string): string {
  const handlerNode = graph.toolHandlers.get(toolName);
  if (!handlerNode) return `(no handler for tool "${toolName}")`;

  const handlerGn = graph.nodes.get(handlerNode);
  if (!handlerGn) return `(no handler for tool "${toolName}")`;

  const lines: string[] = [];

  // Render the root line
  lines.push(`[${handlerGn.name}] ${handlerGn.file}:${handlerGn.line}`);

  // DFS tree rendering with cycle detection
  const visited = new Set<unknown>();

  function renderChildren(gn: CallGraphNode, prefix: string) {
    const edges = gn.edges;
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      const isLast = i === edges.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childPrefix = isLast ? "    " : "│   ";

      if (edge.target.kind === "sink") {
        // Sink edges: show fqn [LEAF] and file:line
        const label = `${edge.target.fqn} [${edge.target.leaf}]`;
        lines.push(`${prefix}${connector}${label}  ${edge.site.file}:${edge.site.line}`);
      } else {
        // fn edges: show name and file:line, recurse
        const targetGn = graph.nodes.get(edge.target.node);
        if (!targetGn) {
          lines.push(`${prefix}${connector}${edge.target.name}`);
          continue;
        }

        if (visited.has(edge.target.node)) {
          // Cycle — mark with recursion indicator
          lines.push(
            `${prefix}${connector}${targetGn.name}  ${targetGn.file}:${targetGn.line} (↻)`,
          );
          continue;
        }

        visited.add(edge.target.node);
        lines.push(
          `${prefix}${connector}${targetGn.name}  ${targetGn.file}:${targetGn.line}`,
        );
        renderChildren(targetGn, prefix + childPrefix);
        visited.delete(edge.target.node);
      }
    }
  }

  visited.add(handlerNode);
  renderChildren(handlerGn, "");

  return lines.join("\n");
}
