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
