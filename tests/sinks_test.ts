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
  assertEquals(SINKS.get("axios.put"), "NETWORK");
  assertEquals(SINKS.get("axios.delete"), "NETWORK");
  assertEquals(SINKS.get("axios.patch"), "NETWORK");
});

Deno.test("SINKS has undici entries", () => {
  assertEquals(SINKS.get("undici.fetch"), "NETWORK");
  assertEquals(SINKS.get("undici.request"), "NETWORK");
});

Deno.test("SINKS has ws WebSocket entry", () => {
  assertEquals(SINKS.get("ws.WebSocket"), "NETWORK");
});

Deno.test("SINKS has mongodb entries", () => {
  assertEquals(SINKS.get("mongodb.MongoClient"), "NETWORK");
  assertEquals(SINKS.get("mongoose.connect"), "NETWORK");
});

Deno.test("SINKS has nodemailer/redis/ioredis entries", () => {
  assertEquals(SINKS.get("nodemailer.createTransport"), "NETWORK");
  assertEquals(SINKS.get("redis.createClient"), "NETWORK");
  assertEquals(SINKS.get("ioredis.default"), "NETWORK");
});

Deno.test("SINKS has node_fetch default entry", () => {
  assertEquals(SINKS.get("node_fetch.default"), "NETWORK");
});
