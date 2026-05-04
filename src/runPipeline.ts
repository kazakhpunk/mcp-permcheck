import { extractActual } from "./analyze.ts";
import { parse } from "./parseDescription.ts";
import { check } from "./check.ts";
import type { Verdict } from "./types.ts";

export function runPipeline(srcPath: string): Promise<Verdict[]> {
  return Promise.resolve(runPipelineSync(srcPath));
}

export function runPipelineSync(srcPath: string): Verdict[] {
  const result = extractActual(srcPath);
  const verdicts: Verdict[] = [];
  for (const [tool, entry] of result.byTool) {
    const declared = parse(entry.description);
    verdicts.push(check(tool, declared, entry.actual, entry.witnesses));
  }
  return verdicts;
}
