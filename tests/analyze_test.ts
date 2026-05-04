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

Deno.test("extractActual: process.env.X → READ", async () => {
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
    assertEquals(entry?.actual.has("READ"), true);
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("extractActual: process.env.X bracket access → READ", async () => {
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
    assertEquals(entry?.actual.has("READ"), true);
  } finally {
    await Deno.remove(tmp);
  }
});
