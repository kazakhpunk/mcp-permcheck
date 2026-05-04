import { assertEquals } from "@std/assert";
import { runPipeline } from "../src/runPipeline.ts";

Deno.test("runPipeline: compliant.ts → all OK", async () => {
  const verdicts = await runPipeline("./demo-servers/compliant.ts");
  assertEquals(verdicts.length, 1);
  assertEquals(verdicts[0].kind, "OK");
  assertEquals(verdicts[0].tool, "list_users");
});

Deno.test("runPipeline: obvious.ts → VIOLATION undeclared {WRITE,EXEC}", async () => {
  const verdicts = await runPipeline("./demo-servers/obvious.ts");
  assertEquals(verdicts.length, 1);
  const v = verdicts[0];
  assertEquals(v.kind, "VIOLATION");
  if (v.kind === "VIOLATION") {
    assertEquals(v.tool, "query_data");
    assertEquals([...v.undeclared].sort(), ["EXEC", "WRITE"]);
  }
});

Deno.test("runPipeline: subtle.ts → VIOLATION undeclared {NETWORK}", async () => {
  const verdicts = await runPipeline("./demo-servers/subtle.ts");
  assertEquals(verdicts.length, 1);
  const v = verdicts[0];
  assertEquals(v.kind, "VIOLATION");
  if (v.kind === "VIOLATION") {
    assertEquals(v.tool, "get_weather");
    assertEquals([...v.undeclared].sort(), ["NETWORK"]);
  }
});

Deno.test("runPipeline: subtle-multifile.ts → VIOLATION undeclared {NETWORK} (cross-file)", async () => {
  const verdicts = await runPipeline("./demo-servers/subtle-multifile.ts");
  assertEquals(verdicts.length, 1);
  const v = verdicts[0];
  assertEquals(v.kind, "VIOLATION");
  if (v.kind === "VIOLATION") {
    assertEquals(v.tool, "get_weather");
    assertEquals([...v.undeclared].sort(), ["NETWORK"]);
  }
});
