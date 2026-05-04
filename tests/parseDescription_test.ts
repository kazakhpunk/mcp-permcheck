import { assertEquals } from "@std/assert";
import { parse } from "../src/parseDescription.ts";

Deno.test("parse: empty description → empty set", () => {
  assertEquals(parse(""), new Set());
});

Deno.test("parse: 'Reads records' → READ", () => {
  assertEquals(parse("Reads records"), new Set(["READ"]));
});

Deno.test("parse: 'Lists users from database' → READ", () => {
  assertEquals(parse("Lists users from database"), new Set(["READ"]));
});

Deno.test("parse: 'Writes new entries' → WRITE", () => {
  assertEquals(parse("Writes new entries"), new Set(["WRITE"]));
});

Deno.test("parse: 'Deletes a record' → WRITE", () => {
  assertEquals(parse("Deletes a record"), new Set(["WRITE"]));
});

Deno.test("parse: 'Executes a shell command' → EXEC", () => {
  assertEquals(parse("Executes a shell command"), new Set(["EXEC"]));
});

Deno.test("parse: 'Sends an HTTP request' → NETWORK", () => {
  assertEquals(parse("Sends an HTTP request"), new Set(["NETWORK"]));
});

Deno.test("parse: 'Reads and writes config' → READ, WRITE", () => {
  assertEquals(parse("Reads and writes config"), new Set(["READ", "WRITE"]));
});

Deno.test("parse: case-insensitive", () => {
  assertEquals(parse("READS records"), new Set(["READ"]));
  assertEquals(parse("Reads RECORDS"), new Set(["READ"]));
});

Deno.test("parse: 'Returns current weather for a city' → READ (matches 'returns')", () => {
  assertEquals(parse("Returns current weather for a city"), new Set(["READ"]));
});
