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
