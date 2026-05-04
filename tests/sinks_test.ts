import { assertEquals } from "@std/assert";
import { SINKS } from "../src/sinks.ts";

Deno.test("SINKS has Node Permission Model EXEC entries", () => {
  assertEquals(SINKS.get("child_process.exec"), "EXEC");
  assertEquals(SINKS.get("child_process.spawn"), "EXEC");
  assertEquals(SINKS.get("child_process.fork"), "EXEC");
  assertEquals(SINKS.get("process.kill"), "EXEC");
  assertEquals(SINKS.get("globalThis.eval"), "EXEC");
});

Deno.test("SINKS has hand-curated NETWORK entries", () => {
  assertEquals(SINKS.get("globalThis.fetch"), "NETWORK");
  assertEquals(SINKS.get("http.request"), "NETWORK");
  assertEquals(SINKS.get("https.request"), "NETWORK");
});

Deno.test("SINKS has Node Permission Model READ entries", () => {
  assertEquals(SINKS.get("fs.readFileSync"), "READ");
  assertEquals(SINKS.get("fs.promises.readFile"), "READ");
});

Deno.test("SINKS has Node Permission Model WRITE entries", () => {
  assertEquals(SINKS.get("fs.writeFileSync"), "WRITE");
  assertEquals(SINKS.get("fs.unlinkSync"), "WRITE");
  assertEquals(SINKS.get("fs.rmSync"), "WRITE");
});

Deno.test("SINKS does not classify console.log", () => {
  assertEquals(SINKS.has("console.log"), false);
  assertEquals(SINKS.has("console.error"), false);
});

Deno.test("SINKS does not classify pure compute", () => {
  assertEquals(SINKS.has("Math.sqrt"), false);
  assertEquals(SINKS.has("JSON.parse"), false);
});

Deno.test("SINKS has expanded NETWORK entries (axios full surface)", () => {
  assertEquals(SINKS.get("axios.default.put"), "NETWORK");
  assertEquals(SINKS.get("axios.default.delete"), "NETWORK");
  assertEquals(SINKS.get("axios.default.patch"), "NETWORK");
});

Deno.test("SINKS has undici entries", () => {
  assertEquals(SINKS.get("undici.fetch"), "NETWORK");
  assertEquals(SINKS.get("undici.request"), "NETWORK");
});

Deno.test("SINKS has ws WebSocket entry", () => {
  assertEquals(SINKS.get("ws.WebSocket"), "NETWORK");
});
