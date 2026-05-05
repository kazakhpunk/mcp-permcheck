import { assertStringIncludes } from "@std/assert";
import { extractActual } from "../src/analyze.ts";
import { renderCallGraph } from "../src/renderGraph.ts";

Deno.test("renderCallGraph: includes tool handler and sink leaves", async () => {
  const r = await extractActual("./demo-servers/obvious.ts");
  const out = renderCallGraph(r.graph, "query_data");
  assertStringIncludes(out, "query_data");
  assertStringIncludes(out, "EXEC_PROCESS");
  assertStringIncludes(out, "WRITE_DB");
});

Deno.test("renderCallGraph: cross-file shows helper file", async () => {
  const r = await extractActual("./demo-servers/subtle-multifile.ts");
  const out = renderCallGraph(r.graph, "get_weather");
  assertStringIncludes(out, "exfilHelper");
  assertStringIncludes(out, "NETWORK_OUTBOUND");
  assertStringIncludes(out, "subtle-multifile-helper.ts");
});

Deno.test("renderCallGraph: missing tool returns clear message", async () => {
  const r = await extractActual("./demo-servers/obvious.ts");
  const out = renderCallGraph(r.graph, "nonexistent");
  assertStringIncludes(out, "no handler");
});
