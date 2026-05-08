/**
 * freeze-corpus.ts
 *
 * Captures, for every SUCCESS entry in corpus-results.json, the exact commit
 * SHA and entry-file path of the local clone under real-servers/. Writes
 * corpus-frozen.json which can later be replayed by:
 *
 *   deno run --allow-read --allow-write --allow-net --allow-run --allow-env \
 *     scripts/batch-analyze.ts --from-frozen
 *
 * The replay re-clones each repo at the recorded SHA and re-runs the pipeline,
 * giving byte-identical inputs without vendoring the full 9 GB of source.
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-run scripts/freeze-corpus.ts
 *
 * Outputs corpus-frozen.json with one entry per successful server.
 */

const CORPUS_PATH = "./corpus.json";
const RESULTS_PATH = "./corpus-results.json";
const REAL_SERVERS_DIR = "./real-servers";
const FROZEN_PATH = "./corpus-frozen.json";

interface CorpusEntry {
  name: string;
  cloneUrl: string;
  subpath: string | null;
  stars: number | null;
  source: string;
}

interface ResultEntry {
  name: string;
  outcome: string;
}

interface FrozenEntry {
  name: string;
  cloneUrl: string;
  subpath: string | null;
  sha: string;
  entryRelativePath: string;
}

interface FrozenFile {
  generated: string;
  pinnedAgainstResultsRanAt: string;
  totalCount: number;
  servers: FrozenEntry[];
}

async function run(
  cmd: string[],
  cwd?: string,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  try {
    const proc = new Deno.Command(cmd[0], {
      args: cmd.slice(1),
      cwd,
      stdout: "piped",
      stderr: "piped",
    });
    const output = await proc.output();
    return {
      success: output.success,
      stdout: new TextDecoder().decode(output.stdout),
      stderr: new TextDecoder().decode(output.stderr),
    };
  } catch (e) {
    return { success: false, stdout: "", stderr: String(e) };
  }
}

function flatName(cloneUrl: string): string {
  const withoutGit = cloneUrl.replace(/\.git$/, "");
  const parts = withoutGit.split("/");
  return `${parts[parts.length - 2] ?? "unknown"}__${parts[parts.length - 1] ?? "unknown"}`;
}

async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function grepForServerTool(dir: string): Promise<string | null> {
  const pattern =
    "server\\.tool\\|server\\.registerTool\\|setRequestHandler.*ListToolsRequestSchema\\|ListToolsRequestSchema.*setRequestHandler\\|\\.addTool({\\|\\.addTool( {";
  const result = await run(["grep", "-rl", "--include=*.ts", "-e", pattern, dir]);
  if (!result.success || !result.stdout.trim()) return null;
  const files = result.stdout.trim().split("\n").filter(Boolean);
  const preferred = files.find((f) => f.endsWith("/index.ts") || f.endsWith("\\index.ts"));
  return preferred ?? files[0];
}

function hasToolRegistration(content: string): boolean {
  return (
    content.includes("server.tool") ||
    content.includes("server.registerTool") ||
    content.includes("ListToolsRequestSchema") ||
    content.includes(".addTool(")
  );
}

async function findEntryFile(cloneDir: string, subpath: string | null): Promise<string | null> {
  const base = subpath ? `${cloneDir}/${subpath}` : cloneDir;
  const candidates = [`${base}/index.ts`, `${base}/src/index.ts`];
  for (const c of candidates) {
    if (await exists(c)) {
      const content = await Deno.readTextFile(c).catch(() => "");
      if (hasToolRegistration(content)) return c;
    }
  }
  return await grepForServerTool(base);
}

async function main() {
  console.log("=== freeze-corpus: capturing SHAs from local real-servers/ clones ===\n");

  const corpus: { servers: CorpusEntry[] } = JSON.parse(await Deno.readTextFile(CORPUS_PATH));
  const results: { ranAt: string; results: ResultEntry[] } = JSON.parse(
    await Deno.readTextFile(RESULTS_PATH),
  );

  const byName = new Map(corpus.servers.map((e) => [e.name, e]));
  const successes = results.results.filter((r) => r.outcome === "SUCCESS");
  console.log(`SUCCESS entries to freeze: ${successes.length}`);

  const frozen: FrozenEntry[] = [];
  let skipped = 0;

  for (const r of successes) {
    const entry = byName.get(r.name);
    if (!entry) {
      console.warn(`  skip ${r.name}: not in corpus.json`);
      skipped++;
      continue;
    }

    const cloneDir = `${REAL_SERVERS_DIR}/${flatName(entry.cloneUrl)}`;
    if (!(await exists(`${cloneDir}/.git`))) {
      console.warn(`  skip ${r.name}: no local clone at ${cloneDir}`);
      skipped++;
      continue;
    }

    const shaResult = await run(["git", "rev-parse", "HEAD"], cloneDir);
    if (!shaResult.success) {
      console.warn(`  skip ${r.name}: git rev-parse failed`);
      skipped++;
      continue;
    }
    const sha = shaResult.stdout.trim();

    const entryFileAbs = await findEntryFile(cloneDir, entry.subpath);
    if (!entryFileAbs) {
      console.warn(`  skip ${r.name}: entry file not found in ${cloneDir}`);
      skipped++;
      continue;
    }
    const entryRelativePath = entryFileAbs.startsWith(cloneDir + "/")
      ? entryFileAbs.slice(cloneDir.length + 1)
      : entryFileAbs;

    frozen.push({
      name: r.name,
      cloneUrl: entry.cloneUrl,
      subpath: entry.subpath,
      sha,
      entryRelativePath,
    });
  }

  const file: FrozenFile = {
    generated: new Date().toISOString(),
    pinnedAgainstResultsRanAt: results.ranAt,
    totalCount: frozen.length,
    servers: frozen,
  };

  await Deno.writeTextFile(FROZEN_PATH, JSON.stringify(file, null, 2));
  console.log(`\nWrote ${FROZEN_PATH} with ${frozen.length} pinned entries (${skipped} skipped).`);
}

await main();
