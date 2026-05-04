import { assertEquals } from "@std/assert";
import { check } from "../src/check.ts";
import type { CallSite, Leaf } from "../src/types.ts";

Deno.test("check: equal sets → OK", () => {
  const v = check(
    "list_users",
    new Set<Leaf>(["READ"]),
    new Set<Leaf>(["READ"]),
    new Map(),
  );
  assertEquals(v.kind, "OK");
});

Deno.test("check: actual ⊂ declared → OK", () => {
  const v = check(
    "list_users",
    new Set<Leaf>(["READ", "WRITE"]),
    new Set<Leaf>(["READ"]),
    new Map(),
  );
  assertEquals(v.kind, "OK");
});

Deno.test("check: actual has WRITE but declared READ → VIOLATION", () => {
  const sites: CallSite[] = [
    { file: "obvious.ts", line: 12, col: 5, symbol: "pg.Client.query" },
  ];
  const witnesses = new Map<Leaf, CallSite[]>([["WRITE", sites]]);
  const v = check(
    "query_data",
    new Set<Leaf>(["READ"]),
    new Set<Leaf>(["READ", "WRITE"]),
    witnesses,
  );
  assertEquals(v.kind, "VIOLATION");
  if (v.kind === "VIOLATION") {
    assertEquals(v.undeclared, new Set<Leaf>(["WRITE"]));
    assertEquals(v.witnesses.get("WRITE"), sites);
  }
});

Deno.test("check: VIOLATION carries declared and actual through", () => {
  const v = check(
    "query_data",
    new Set<Leaf>(["READ"]),
    new Set<Leaf>(["READ", "WRITE", "EXEC"]),
    new Map(),
  );
  assertEquals(v.kind, "VIOLATION");
  if (v.kind === "VIOLATION") {
    assertEquals(v.declared, new Set<Leaf>(["READ"]));
    assertEquals(v.actual, new Set<Leaf>(["READ", "WRITE", "EXEC"]));
    assertEquals(v.undeclared, new Set<Leaf>(["WRITE", "EXEC"]));
  }
});

Deno.test("check: empty declared with empty actual → OK", () => {
  const v = check(
    "noop",
    new Set<Leaf>(),
    new Set<Leaf>(),
    new Map(),
  );
  assertEquals(v.kind, "OK");
});
