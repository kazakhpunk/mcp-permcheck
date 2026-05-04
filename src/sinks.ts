import type { Leaf } from "./types.ts";

/**
 * v0 catalog. Sources:
 *   - fs.* and child_process.* rows: Node 20+ Permission Model API mapping.
 *   - Network rows: hand-curated; Node has no `--allow-net` permission.
 *
 * SQL-shaped APIs (e.g. `pg.Client.query`) are NOT in this map; they are
 * flow-sensitive and handled in src/analyze.ts as a special case.
 *
 * `process.env.X` reads are also handled in the analyser as a special case
 * (member access, not a call expression).
 */
export const SINKS: ReadonlyMap<string, Leaf> = new Map<string, Leaf>([
  // EXEC subtypes — Node --allow-child-process / --allow-worker / --allow-wasi
  ["child_process.exec", "EXEC_SHELL"],          // shell-invoking
  ["child_process.execSync", "EXEC_SHELL"],
  ["child_process.execFile", "EXEC_PROCESS"],    // direct binary, no shell
  ["child_process.execFileSync", "EXEC_PROCESS"],
  ["child_process.spawn", "EXEC_PROCESS"],
  ["child_process.spawnSync", "EXEC_PROCESS"],
  ["child_process.fork", "EXEC_PROCESS"],
  ["process.kill", "EXEC_PROCESS"],
  ["globalThis.eval", "EXEC_EVAL"],
  ["worker_threads.Worker", "EXEC_PROCESS"],

  // NETWORK_OUTBOUND — hand-curated, no Node permission equivalent
  ["globalThis.fetch", "NETWORK_OUTBOUND"],
  ["http.request", "NETWORK_OUTBOUND"],
  ["http.get", "NETWORK_OUTBOUND"],
  ["https.request", "NETWORK_OUTBOUND"],
  ["https.get", "NETWORK_OUTBOUND"],
  ["net.Socket", "NETWORK_OUTBOUND"],
  ["net.createConnection", "NETWORK_OUTBOUND"],
  ["net.connect", "NETWORK_OUTBOUND"],
  ["dgram.createSocket", "NETWORK_OUTBOUND"],
  // axios full surface (source-form keys — import-alias resolver maps `import axios from "axios"` → namespace `axios`)
  ["axios.get", "NETWORK_OUTBOUND"],
  ["axios.post", "NETWORK_OUTBOUND"],
  ["axios.put", "NETWORK_OUTBOUND"],
  ["axios.delete", "NETWORK_OUTBOUND"],
  ["axios.patch", "NETWORK_OUTBOUND"],
  ["axios.head", "NETWORK_OUTBOUND"],
  ["axios.options", "NETWORK_OUTBOUND"],
  ["axios.request", "NETWORK_OUTBOUND"],
  ["axios.postForm", "NETWORK_OUTBOUND"],
  ["axios.getUri", "NETWORK_OUTBOUND"],
  // undici (modern Node HTTP client)
  ["undici.fetch", "NETWORK_OUTBOUND"],
  ["undici.request", "NETWORK_OUTBOUND"],
  ["undici.Client", "NETWORK_OUTBOUND"],
  ["undici.Pool", "NETWORK_OUTBOUND"],
  // ws (WebSocket)
  ["ws.WebSocket", "NETWORK_OUTBOUND"],
  ["ws.WebSocketServer", "NETWORK_OUTBOUND"],
  // node-fetch
  ["node_fetch.default", "NETWORK_OUTBOUND"],
  // mongodb / mongoose
  ["mongodb.MongoClient", "NETWORK_OUTBOUND"],
  ["mongodb.connect", "NETWORK_OUTBOUND"],
  ["mongoose.connect", "NETWORK_OUTBOUND"],
  ["mongoose.createConnection", "NETWORK_OUTBOUND"],
  // nodemailer (creates SMTP client → opens connection on send)
  ["nodemailer.createTransport", "NETWORK_OUTBOUND"],
  // redis / ioredis
  ["redis.createClient", "NETWORK_OUTBOUND"],
  ["ioredis.default", "NETWORK_OUTBOUND"],
  ["ioredis.Redis", "NETWORK_OUTBOUND"],

  // READ_FS — Node --allow-fs-read
  ["fs.readFileSync", "READ_FS"],
  ["fs.readFile", "READ_FS"],
  ["fs.promises.readFile", "READ_FS"],
  ["fs.readdirSync", "READ_FS"],
  ["fs.readdir", "READ_FS"],
  ["fs.promises.readdir", "READ_FS"],
  ["fs.statSync", "READ_FS"],
  ["fs.promises.stat", "READ_FS"],

  // WRITE_FS — Node --allow-fs-write
  ["fs.writeFileSync", "WRITE_FS"],
  ["fs.writeFile", "WRITE_FS"],
  ["fs.promises.writeFile", "WRITE_FS"],
  ["fs.unlinkSync", "WRITE_FS"],
  ["fs.unlink", "WRITE_FS"],
  ["fs.promises.unlink", "WRITE_FS"],
  ["fs.rmSync", "WRITE_FS"],
  ["fs.rm", "WRITE_FS"],
  ["fs.mkdirSync", "WRITE_FS"],
  ["fs.appendFileSync", "WRITE_FS"],
]);
