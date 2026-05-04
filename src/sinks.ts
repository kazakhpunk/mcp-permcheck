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
  // EXEC — Node --allow-child-process / --allow-worker / --allow-wasi
  ["child_process.exec", "EXEC"],
  ["child_process.execSync", "EXEC"],
  ["child_process.execFile", "EXEC"],
  ["child_process.execFileSync", "EXEC"],
  ["child_process.spawn", "EXEC"],
  ["child_process.spawnSync", "EXEC"],
  ["child_process.fork", "EXEC"],
  ["process.kill", "EXEC"],
  ["globalThis.eval", "EXEC"],
  ["worker_threads.Worker", "EXEC"],

  // NETWORK — hand-curated, no Node permission equivalent
  ["globalThis.fetch", "NETWORK"],
  ["http.request", "NETWORK"],
  ["http.get", "NETWORK"],
  ["https.request", "NETWORK"],
  ["https.get", "NETWORK"],
  ["net.Socket", "NETWORK"],
  ["net.createConnection", "NETWORK"],
  ["net.connect", "NETWORK"],
  ["dgram.createSocket", "NETWORK"],
  // axios full surface
  ["axios.default.put", "NETWORK"],
  ["axios.default.delete", "NETWORK"],
  ["axios.default.patch", "NETWORK"],
  ["axios.default.head", "NETWORK"],
  ["axios.default.options", "NETWORK"],
  ["axios.default.request", "NETWORK"],
  ["axios.default.postForm", "NETWORK"],
  ["axios.default.getUri", "NETWORK"],
  // undici (modern Node HTTP client)
  ["undici.fetch", "NETWORK"],
  ["undici.request", "NETWORK"],
  ["undici.Client", "NETWORK"],
  ["undici.Pool", "NETWORK"],
  // ws (WebSocket)
  ["ws.WebSocket", "NETWORK"],
  ["ws.WebSocketServer", "NETWORK"],

  // READ — Node --allow-fs-read
  ["fs.readFileSync", "READ"],
  ["fs.readFile", "READ"],
  ["fs.promises.readFile", "READ"],
  ["fs.readdirSync", "READ"],
  ["fs.readdir", "READ"],
  ["fs.promises.readdir", "READ"],
  ["fs.statSync", "READ"],
  ["fs.promises.stat", "READ"],

  // WRITE — Node --allow-fs-write
  ["fs.writeFileSync", "WRITE"],
  ["fs.writeFile", "WRITE"],
  ["fs.promises.writeFile", "WRITE"],
  ["fs.unlinkSync", "WRITE"],
  ["fs.unlink", "WRITE"],
  ["fs.promises.unlink", "WRITE"],
  ["fs.rmSync", "WRITE"],
  ["fs.rm", "WRITE"],
  ["fs.mkdirSync", "WRITE"],
  ["fs.appendFileSync", "WRITE"],
]);
