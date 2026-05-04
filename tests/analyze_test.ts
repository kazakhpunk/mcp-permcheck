import { assertEquals } from "@std/assert";
import { extractActual } from "../src/analyze.ts";

Deno.test("extractActual: finds tools by server.tool() shape", async () => {
  const result = await extractActual("./demo-servers/compliant.ts");
  assertEquals([...result.byTool.keys()].sort(), ["list_users"]);
});

Deno.test("extractActual: captures the description string", async () => {
  const result = await extractActual("./demo-servers/compliant.ts");
  const entry = result.byTool.get("list_users");
  assertEquals(entry?.description, "Lists users from the database.");
});

Deno.test("extractActual: captures multiple tools", async () => {
  // We'll write a temp source with two tools to make sure aggregation works.
  const src = `
const server = { tool(_n: string, _o: { description: string }, _h: () => unknown) {} };
server.tool("a", { description: "Reads things." }, () => {});
server.tool("b", { description: "Writes things." }, () => {});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    assertEquals([...result.byTool.keys()].sort(), ["a", "b"]);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: detects fetch() as NETWORK", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("net", { description: "anything" }, async () => {
  await fetch("https://example.com");
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("net");
    assertEquals(entry?.actual.has("NETWORK"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: detects process.kill as EXEC", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: (a: { pid: number }) => unknown) => void };
server.tool("k", { description: "anything" }, async ({ pid }) => {
  process.kill(pid);
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("k");
    assertEquals(entry?.actual.has("EXEC"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: clean tool has empty actual", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("noop", { description: "anything" }, () => {
  return { ok: true };
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("noop");
    assertEquals(entry?.actual.size, 0);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: follows intra-file helper functions (subtle.ts)", async () => {
  const result = await extractActual("./demo-servers/subtle.ts");
  const entry = result.byTool.get("get_weather");
  assertEquals(entry?.actual.has("NETWORK"), true);
});

Deno.test("extractActual: does not loop on mutual recursion", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
function a(): unknown { return b(); }
function b(): unknown { return a(); }
server.tool("rec", { description: "x" }, () => a());
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("rec");
    assertEquals(entry?.actual.size, 0);  // no sinks reachable; just must terminate
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: SQL SELECT → READ", async () => {
  const result = await extractActual("./demo-servers/compliant.ts");
  const entry = result.byTool.get("list_users");
  assertEquals(entry?.actual.has("READ"), true);
  assertEquals(entry?.actual.has("WRITE"), false);
});

Deno.test("extractActual: SQL DELETE → WRITE", async () => {
  const result = await extractActual("./demo-servers/obvious.ts");
  const entry = result.byTool.get("query_data");
  assertEquals(entry?.actual.has("WRITE"), true);
});

Deno.test("extractActual: dynamic SQL string → READ ∪ WRITE", async () => {
  const src = `
declare function pgQuery(sql: string): Promise<unknown[]>;
declare const server: { tool: (n: string, o: { description: string }, h: (a: { sql: string }) => unknown) => void };
server.tool("dyn", { description: "x" }, async ({ sql }) => {
  await pgQuery(sql);
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("dyn");
    assertEquals(entry?.actual.has("READ"), true);
    assertEquals(entry?.actual.has("WRITE"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: process.env.X → ENV", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("env", { description: "x" }, () => {
  return process.env.HOME;
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("env");
    assertEquals(entry?.actual.has("ENV"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: process.env.X bracket access → ENV", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("env2", { description: "x" }, () => {
  return process.env["HOME"];
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("env2");
    assertEquals(entry?.actual.has("ENV"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: follows imported user functions across files", async () => {
  const result = await extractActual("./demo-servers/subtle-multifile.ts");
  const entry = result.byTool.get("get_weather");
  assertEquals(entry?.actual.has("NETWORK"), true);
});

Deno.test("extractActual: cross-file witnesses reference the helper file, not the entry", async () => {
  const result = await extractActual("./demo-servers/subtle-multifile.ts");
  const entry = result.byTool.get("get_weather");
  const networkSites = entry?.witnesses.get("NETWORK") ?? [];
  // The witness for fetch() should be in subtle-multifile-helper.ts, not subtle-multifile.ts
  assertEquals(networkSites.length > 0, true);
  assertEquals(networkSites[0].file, "subtle-multifile-helper.ts");
});

Deno.test("extractActual: named import { readFile } from node:fs/promises → READ", async () => {
  const src = `
import { readFile } from "node:fs/promises";
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("rf", { description: "x" }, async () => {
  await readFile("/etc/passwd");
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("rf");
    assertEquals(entry?.actual.has("READ"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: aliased named import { readFile as rf } → READ", async () => {
  const src = `
import { readFile as rf } from "node:fs/promises";
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("aliased", { description: "x" }, async () => {
  await rf("/etc/passwd");
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("aliased");
    assertEquals(entry?.actual.has("READ"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: namespace import * as fsp → fsp.readFile → READ", async () => {
  const src = `
import * as fsp from "node:fs/promises";
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("ns", { description: "x" }, async () => {
  await fsp.readFile("/etc/passwd");
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("ns");
    assertEquals(entry?.actual.has("READ"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: default import nodeFetch from node-fetch → NETWORK", async () => {
  const src = `
import nodeFetch from "node-fetch";
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("nf", { description: "x" }, async () => {
  await nodeFetch("https://example.com");
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("nf");
    assertEquals(entry?.actual.has("NETWORK"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: default import axios → axios.post → NETWORK", async () => {
  const src = `
import axios from "axios";
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("ax", { description: "x" }, async () => {
  await axios.post("https://example.com", { hi: 1 });
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("ax");
    assertEquals(entry?.actual.has("NETWORK"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: prisma-shaped call findMany → READ", async () => {
  const src = `
declare const prisma: any;
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("pr", { description: "x" }, async () => {
  await prisma.user.findMany();
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("pr");
    assertEquals(entry?.actual.has("READ"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: prisma-shaped call create → WRITE", async () => {
  const src = `
declare const prisma: any;
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("pc", { description: "x" }, async () => {
  await prisma.user.create({ data: { name: "x" } });
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("pc");
    assertEquals(entry?.actual.has("WRITE"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: .then(callback) callback is reachable", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
declare function pgQuery(sql: string): Promise<unknown[]>;
server.tool("then", { description: "x" }, async () => {
  return pgQuery("SELECT 1").then(() => {
    process.kill(1);
  });
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("then");
    assertEquals(entry?.actual.has("EXEC"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: .catch(callback) callback is reachable", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
declare function pgQuery(sql: string): Promise<unknown[]>;
server.tool("catch", { description: "x" }, async () => {
  return pgQuery("SELECT 1").catch(() => {
    process.kill(1);
  });
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("catch");
    assertEquals(entry?.actual.has("EXEC"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: setTimeout callback is reachable", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("timer", { description: "x" }, () => {
  setTimeout(() => {
    fetch("https://example.com");
  }, 100);
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("timer");
    assertEquals(entry?.actual.has("NETWORK"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: queueMicrotask callback is reachable", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("micro", { description: "x" }, () => {
  queueMicrotask(() => {
    process.kill(1);
  });
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("micro");
    assertEquals(entry?.actual.has("EXEC"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: array .map callback NOT followed (intentional false-negative)", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: (a: { items: unknown[] }) => unknown) => void };
server.tool("noisy", { description: "x" }, ({ items }) => {
  return items.map(() => fetch("https://example.com"));
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const result = await extractActual(tmp);
    const entry = result.byTool.get("noisy");
    // Array methods NOT followed in v0.7. Documented limitation.
    assertEquals(entry?.actual.has("NETWORK"), false);
  } finally {
    await Deno.remove(tmp);
  }
});
