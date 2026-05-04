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

Deno.test("parse: 'Reads and writes config' → READ, WRITE, ENV", () => {
  assertEquals(parse("Reads and writes config"), new Set(["READ", "WRITE", "ENV"]));
});

Deno.test("parse: case-insensitive", () => {
  assertEquals(parse("READS records"), new Set(["READ"]));
  assertEquals(parse("Reads RECORDS"), new Set(["READ"]));
});

Deno.test("parse: 'Reads API key from environment' → READ ∪ NETWORK ∪ ENV", () => {
  // 'api' matches NETWORK rule, 'api_key'/'environment' match ENV, 'reads' matches READ
  assertEquals(parse("Reads API key from environment"), new Set(["READ", "NETWORK", "ENV"]));
});

Deno.test("parse: 'Returns config value' → READ ∪ ENV", () => {
  assertEquals(parse("Returns config value"), new Set(["READ", "ENV"]));
});

Deno.test("parse: 'Stores credentials' → WRITE ∪ ENV", () => {
  assertEquals(parse("Stores credentials"), new Set(["WRITE", "ENV"]));
});

Deno.test("parse: 'Fetches a webhook' → NETWORK ∪ READ", () => {
  // 'webhook' is NETWORK, 'fetches' matches both NETWORK and READ
  assertEquals(parse("Fetches a webhook"), new Set(["NETWORK", "READ"]));
});

Deno.test("parse: 'Returns current weather for a city' → READ (matches 'returns')", () => {
  assertEquals(parse("Returns current weather for a city"), new Set(["READ"]));
});
