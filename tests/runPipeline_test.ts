import { assertEquals } from "@std/assert";
import { runPipeline } from "../src/runPipeline.ts";

Deno.test("runPipeline: compliant.ts → all OK", async () => {
  const verdicts = await runPipeline("./demo-servers/compliant.ts");
  assertEquals(verdicts.length, 1);
  assertEquals(verdicts[0].kind, "OK");
  assertEquals(verdicts[0].tool, "list_users");
});

Deno.test("runPipeline: obvious.ts → VIOLATION undeclared {WRITE_DB,EXEC_PROCESS}", async () => {
  const verdicts = await runPipeline("./demo-servers/obvious.ts");
  assertEquals(verdicts.length, 1);
  const v = verdicts[0];
  assertEquals(v.kind, "VIOLATION");
  if (v.kind === "VIOLATION") {
    assertEquals(v.tool, "query_data");
    assertEquals([...v.undeclared].sort(), ["EXEC_PROCESS", "WRITE_DB"]);
  }
});

Deno.test("runPipeline: subtle.ts → VIOLATION undeclared {NETWORK_OUTBOUND}", async () => {
  const verdicts = await runPipeline("./demo-servers/subtle.ts");
  assertEquals(verdicts.length, 1);
  const v = verdicts[0];
  assertEquals(v.kind, "VIOLATION");
  if (v.kind === "VIOLATION") {
    assertEquals(v.tool, "get_weather");
    assertEquals([...v.undeclared].sort(), ["NETWORK_OUTBOUND"]);
  }
});

Deno.test("runPipeline: subtle-multifile.ts → VIOLATION undeclared {NETWORK_OUTBOUND} (cross-file)", async () => {
  const verdicts = await runPipeline("./demo-servers/subtle-multifile.ts");
  assertEquals(verdicts.length, 1);
  const v = verdicts[0];
  assertEquals(v.kind, "VIOLATION");
  if (v.kind === "VIOLATION") {
    assertEquals(v.tool, "get_weather");
    assertEquals([...v.undeclared].sort(), ["NETWORK_OUTBOUND"]);
  }
});

Deno.test("runPipeline: env-var reading tool that didn't declare ENV → VIOLATION undeclared {ENV}", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("readsHome", { description: "Returns the user's home directory." }, () => {
  return process.env.HOME;
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const verdicts = await runPipeline(tmp);
    const v = verdicts[0];
    assertEquals(v.kind, "VIOLATION");
    if (v.kind === "VIOLATION") {
      assertEquals(v.undeclared.has("ENV"), true);
    }
  } finally {
    await Deno.remove(tmp);
  }
});

Deno.test("runPipeline: env-var reading tool that DID declare ENV → OK", async () => {
  const src = `
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };
server.tool("getEnv", { description: "Reads environment variables." }, () => {
  return process.env.HOME;
});
`;
  const tmp = await Deno.makeTempFile({ suffix: ".ts" });
  await Deno.writeTextFile(tmp, src);
  try {
    const verdicts = await runPipeline(tmp);
    const v = verdicts[0];
    assertEquals(v.kind, "OK");
  } finally {
    await Deno.remove(tmp);
  }
});
