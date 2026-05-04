import { assertEquals } from "@std/assert";
import { ALL_LEAVES, type Leaf } from "../src/types.ts";
import { join, meet, subseteq } from "../src/lattice.ts";

Deno.test("subseteq: empty is subset of anything", () => {
  assertEquals(subseteq(new Set<Leaf>(), new Set<Leaf>(["READ"])), true);
  assertEquals(subseteq(new Set<Leaf>(), new Set<Leaf>()), true);
});

Deno.test("subseteq: equal sets are subsets", () => {
  assertEquals(subseteq(new Set<Leaf>(["READ"]), new Set<Leaf>(["READ"])), true);
});

Deno.test("subseteq: strict subset", () => {
  assertEquals(
    subseteq(new Set<Leaf>(["READ"]), new Set<Leaf>(["READ", "WRITE"])),
    true,
  );
});

Deno.test("subseteq: non-subset returns false", () => {
  assertEquals(
    subseteq(new Set<Leaf>(["READ", "WRITE"]), new Set<Leaf>(["READ"])),
    false,
  );
});

Deno.test("subseteq: disjoint returns false", () => {
  assertEquals(
    subseteq(new Set<Leaf>(["EXEC"]), new Set<Leaf>(["READ"])),
    false,
  );
});

Deno.test("join: union of two sets", () => {
  assertEquals(
    join(new Set<Leaf>(["READ"]), new Set<Leaf>(["WRITE"])),
    new Set<Leaf>(["READ", "WRITE"]),
  );
});

Deno.test("meet: intersection of two sets", () => {
  assertEquals(
    meet(new Set<Leaf>(["READ", "WRITE"]), new Set<Leaf>(["WRITE", "EXEC"])),
    new Set<Leaf>(["WRITE"]),
  );
});

Deno.test("ALL_LEAVES has exactly five members", () => {
  assertEquals(ALL_LEAVES.size, 5);
});
