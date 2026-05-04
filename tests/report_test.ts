import { assertEquals, assertStringIncludes } from "@std/assert";
import { format } from "../src/report.ts";
import type { Leaf } from "../src/types.ts";

Deno.test("format: OK verdict", () => {
  const out = format({
    kind: "OK",
    tool: "list_users",
    declared: new Set<Leaf>(["READ"]),
    actual: new Set<Leaf>(["READ"]),
  });
  assertStringIncludes(out, "OK");
  assertStringIncludes(out, "list_users");
  assertStringIncludes(out, "{READ}");
});

Deno.test("format: VIOLATION verdict shows undeclared and witnesses", () => {
  const out = format({
    kind: "VIOLATION",
    tool: "query_data",
    declared: new Set<Leaf>(["READ"]),
    actual: new Set<Leaf>(["READ", "WRITE", "EXEC"]),
    undeclared: new Set<Leaf>(["WRITE", "EXEC"]),
    witnesses: new Map([
      ["WRITE", [{ file: "obvious.ts", line: 12, col: 5, symbol: "pg.Client.query" }]],
      ["EXEC", [{ file: "obvious.ts", line: 13, col: 5, symbol: "process.kill" }]],
    ]),
  });
  assertStringIncludes(out, "VIOLATION");
  assertStringIncludes(out, "Undeclared:");
  assertStringIncludes(out, "WRITE");
  assertStringIncludes(out, "EXEC");
  assertStringIncludes(out, "obvious.ts:12");
  assertStringIncludes(out, "pg.Client.query");
  assertStringIncludes(out, "process.kill");
});

Deno.test("format: UNANALYZABLE includes reason", () => {
  const out = format({
    kind: "UNANALYZABLE",
    tool: "broken",
    reason: "parse error at line 4",
  });
  assertStringIncludes(out, "UNANALYZABLE");
  assertStringIncludes(out, "parse error at line 4");
});

Deno.test("format: leaves are sorted alphabetically in set rendering", () => {
  const out = format({
    kind: "OK",
    tool: "x",
    declared: new Set<Leaf>(["WRITE", "READ", "NETWORK"]),
    actual: new Set<Leaf>(),
  });
  // Sorted lexicographically: NETWORK, READ, WRITE
  assertEquals(out.includes("{NETWORK, READ, WRITE}"), true);
});
