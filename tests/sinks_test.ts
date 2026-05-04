import { assertEquals } from "@std/assert";
import { SINKS } from "../src/sinks.ts";

Deno.test("SINKS has Node Permission Model EXEC entries", () => {
  assertEquals(SINKS.get("child_process.exec"), "EXEC_SHELL");
  assertEquals(SINKS.get("child_process.spawn"), "EXEC_PROCESS");
  assertEquals(SINKS.get("child_process.fork"), "EXEC_PROCESS");
  assertEquals(SINKS.get("process.kill"), "EXEC_PROCESS");
  assertEquals(SINKS.get("globalThis.eval"), "EXEC_EVAL");
});

Deno.test("SINKS has hand-curated NETWORK entries", () => {
  assertEquals(SINKS.get("globalThis.fetch"), "NETWORK_OUTBOUND");
  assertEquals(SINKS.get("http.request"), "NETWORK_OUTBOUND");
  assertEquals(SINKS.get("https.request"), "NETWORK_OUTBOUND");
});

Deno.test("SINKS has Node Permission Model READ entries", () => {
  assertEquals(SINKS.get("fs.readFileSync"), "READ_FS");
  assertEquals(SINKS.get("fs.promises.readFile"), "READ_FS");
});

Deno.test("SINKS has Node Permission Model WRITE entries", () => {
  assertEquals(SINKS.get("fs.writeFileSync"), "WRITE_FS");
  assertEquals(SINKS.get("fs.unlinkSync"), "WRITE_FS");
  assertEquals(SINKS.get("fs.rmSync"), "WRITE_FS");
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
  assertEquals(SINKS.get("axios.put"), "NETWORK_OUTBOUND");
  assertEquals(SINKS.get("axios.delete"), "NETWORK_OUTBOUND");
  assertEquals(SINKS.get("axios.patch"), "NETWORK_OUTBOUND");
});

Deno.test("SINKS has undici entries", () => {
  assertEquals(SINKS.get("undici.fetch"), "NETWORK_OUTBOUND");
  assertEquals(SINKS.get("undici.request"), "NETWORK_OUTBOUND");
});

Deno.test("SINKS has ws WebSocket entry", () => {
  assertEquals(SINKS.get("ws.WebSocket"), "NETWORK_OUTBOUND");
});

Deno.test("SINKS has mongodb entries", () => {
  assertEquals(SINKS.get("mongodb.MongoClient"), "NETWORK_OUTBOUND");
  assertEquals(SINKS.get("mongoose.connect"), "NETWORK_OUTBOUND");
});

Deno.test("SINKS has nodemailer/redis/ioredis entries", () => {
  assertEquals(SINKS.get("nodemailer.createTransport"), "NETWORK_OUTBOUND");
  assertEquals(SINKS.get("redis.createClient"), "NETWORK_OUTBOUND");
  assertEquals(SINKS.get("ioredis.default"), "NETWORK_OUTBOUND");
});

Deno.test("SINKS has node_fetch default entry", () => {
  assertEquals(SINKS.get("node_fetch.default"), "NETWORK_OUTBOUND");
});
