/**
 * batch-analyze.ts
 *
 * Reads corpus.json, clones each repo (sparse where subpath is set), finds the
 * TypeScript entry file, and runs the sound-permissions pipeline. Writes
 * corpus-results.json.
 *
 * Usage:
 *   deno run --allow-read --allow-write --allow-net --allow-run --allow-env \
 *     scripts/batch-analyze.ts
 *
 * Idempotent: already-analysed entries (by name) are skipped.
 */

import { runPipeline } from "../src/runPipeline.ts";
import type { Verdict } from "../src/types.ts";

const CORPUS_PATH = "./corpus.json";
const RESULTS_PATH = "./corpus-results.json";
const FROZEN_PATH = "./corpus-frozen.json";
const REAL_SERVERS_DIR = "./real-servers";
const WALL_TIME_LIMIT_MS = 30 * 60 * 1000; // 30 minutes

type Outcome = "SUCCESS" | "CLONE_FAILED" | "NO_ENTRY_FILE" | "NO_TOOLS_FOUND" | "PARSE_ERROR";

interface ViolationDetail {
  tool: string;
  undeclared: string[];
  witnessCount: number;
}

interface ServerResult {
  name: string;
  outcome: Outcome;
  tools?: number;
  ok?: number;
  violation?: number;
  violationDetails?: ViolationDetail[];
  analysedAt?: string;
  error?: string;
}

interface ResultsFile {
  ranAt: string;
  totalAttempted: number;
  outcomes: Record<string, number>;
  results: ServerResult[];
}

interface CorpusEntry {
  name: string;
  cloneUrl: string;
  subpath: string | null;
  stars: number | null;
  source: string;
  /** Set in --from-frozen mode: pinned commit SHA from corpus-frozen.json. */
  frozenSha?: string;
  /** Set in --from-frozen mode: entry-file path relative to clone root. */
  frozenEntryRelativePath?: string;
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

// ---------------------------------------------------------------------------
// Shell helpers
// ---------------------------------------------------------------------------

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
    const stdout = new TextDecoder().decode(output.stdout);
    const stderr = new TextDecoder().decode(output.stderr);
    return { success: output.success, stdout, stderr };
  } catch (e) {
    return { success: false, stdout: "", stderr: String(e) };
  }
}

// ---------------------------------------------------------------------------
// Clone helpers
// ---------------------------------------------------------------------------

/** Convert a clone URL to a flat directory name under real-servers/. */
function flatName(cloneUrl: string): string {
  // e.g. https://github.com/owner/repo.git → owner__repo
  const withoutGit = cloneUrl.replace(/\.git$/, "");
  const parts = withoutGit.split("/");
  const owner = parts[parts.length - 2] ?? "unknown";
  const repo = parts[parts.length - 1] ?? "unknown";
  return `${owner}__${repo}`;
}

async function cloneRepo(
  cloneUrl: string,
  subpath: string | null,
  destDir: string,
  pinnedSha?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await Deno.stat(destDir);
    // Already exists — idempotent skip. (In frozen mode the caller is
    // responsible for verifying the existing clone matches pinnedSha.)
    return { success: true };
  } catch {
    // Directory does not exist — proceed with clone
  }

  if (pinnedSha) {
    // Frozen mode: init + fetch the exact SHA so the analysis is deterministic.
    await Deno.mkdir(destDir, { recursive: true });
    const initResult = await run(["git", "init"], destDir);
    if (!initResult.success) {
      return { success: false, error: `git init failed: ${initResult.stderr.slice(0, 300)}` };
    }
    const remoteResult = await run(["git", "remote", "add", "origin", cloneUrl], destDir);
    if (!remoteResult.success) {
      return {
        success: false,
        error: `git remote add failed: ${remoteResult.stderr.slice(0, 300)}`,
      };
    }
    if (subpath) {
      const sparseInit = await run(["git", "sparse-checkout", "init", "--cone"], destDir);
      if (!sparseInit.success) {
        return {
          success: false,
          error: `sparse-checkout init failed: ${sparseInit.stderr.slice(0, 300)}`,
        };
      }
      const sparseSet = await run(["git", "sparse-checkout", "set", subpath], destDir);
      if (!sparseSet.success) {
        return {
          success: false,
          error: `sparse-checkout set failed: ${sparseSet.stderr.slice(0, 300)}`,
        };
      }
    }
    const fetchResult = await run(
      ["git", "fetch", "--depth=1", "--filter=blob:none", "origin", pinnedSha],
      destDir,
    );
    if (!fetchResult.success) {
      return {
        success: false,
        error: `git fetch of pinned SHA failed: ${fetchResult.stderr.slice(0, 300)}`,
      };
    }
    const checkoutResult = await run(["git", "checkout", pinnedSha], destDir);
    if (!checkoutResult.success) {
      return {
        success: false,
        error: `git checkout of pinned SHA failed: ${checkoutResult.stderr.slice(0, 300)}`,
      };
    }
    return { success: true };
  }

  if (subpath) {
    // Sparse clone
    const cloneResult = await run([
      "git",
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      "--sparse",
      "--no-single-branch",
      cloneUrl,
      destDir,
    ]);
    if (!cloneResult.success) {
      return { success: false, error: `git clone failed: ${cloneResult.stderr.slice(0, 300)}` };
    }
    const sparseResult = await run(
      ["git", "sparse-checkout", "set", subpath],
      destDir,
    );
    if (!sparseResult.success) {
      return {
        success: false,
        error: `git sparse-checkout failed: ${sparseResult.stderr.slice(0, 300)}`,
      };
    }
  } else {
    // Full shallow clone
    const cloneResult = await run([
      "git",
      "clone",
      "--depth",
      "1",
      "--filter=blob:none",
      cloneUrl,
      destDir,
    ]);
    if (!cloneResult.success) {
      return { success: false, error: `git clone failed: ${cloneResult.stderr.slice(0, 300)}` };
    }
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Entry file discovery
// ---------------------------------------------------------------------------

async function grepForServerTool(dir: string): Promise<string | null> {
  // Search for .ts files containing any of the recognised tool-registration patterns:
  //   server.tool(), server.registerTool()  — original server.tool SDK
  //   setRequestHandler(ListToolsRequestSchema  — older SDK / raw SDK
  //   .addTool({  — fastmcp style
  const pattern =
    "server\\.tool\\|server\\.registerTool\\|setRequestHandler.*ListToolsRequestSchema\\|ListToolsRequestSchema.*setRequestHandler\\|\\.addTool({\\|\\.addTool( {";
  const result = await run([
    "grep",
    "-rl",
    "--include=*.ts",
    "-e",
    pattern,
    dir,
  ]);
  if (!result.success || !result.stdout.trim()) return null;
  const files = result.stdout.trim().split("\n").filter(Boolean);
  // Prefer index.ts at root or src/index.ts
  const preferred = files.find(
    (f) => f.endsWith("/index.ts") || f.endsWith("\\index.ts"),
  );
  return preferred ?? files[0];
}

async function exists(p: string): Promise<boolean> {
  try {
    await Deno.stat(p);
    return true;
  } catch {
    return false;
  }
}

/** Returns true if the file content contains a recognised tool-registration pattern. */
function hasToolRegistration(content: string): boolean {
  return (
    content.includes("server.tool") ||
    content.includes("server.registerTool") ||
    content.includes("ListToolsRequestSchema") ||
    content.includes(".addTool(")
  );
}

async function findEntryFile(
  cloneDir: string,
  subpath: string | null,
): Promise<string | null> {
  const base = subpath ? `${cloneDir}/${subpath}` : cloneDir;

  // Check canonical paths first
  const candidates = [
    `${base}/index.ts`,
    `${base}/src/index.ts`,
  ];
  for (const c of candidates) {
    if (await exists(c)) {
      const content = await Deno.readTextFile(c).catch(() => "");
      if (hasToolRegistration(content)) {
        return c;
      }
    }
  }

  // Fall back to grep
  return await grepForServerTool(base);
}

// ---------------------------------------------------------------------------
// Analyse a single entry
// ---------------------------------------------------------------------------

async function analyseEntry(
  entry: CorpusEntry,
): Promise<ServerResult> {
  const cloneDir = `${REAL_SERVERS_DIR}/${flatName(entry.cloneUrl)}`;

  // 1. Clone (at pinned SHA when running --from-frozen)
  const cloneRes = await cloneRepo(entry.cloneUrl, entry.subpath, cloneDir, entry.frozenSha);
  if (!cloneRes.success) {
    return { name: entry.name, outcome: "CLONE_FAILED", error: cloneRes.error };
  }

  // 2. Find entry file. In frozen mode the relative path is recorded; trust it
  // unless the file is actually missing.
  let entryFile: string | null;
  if (entry.frozenEntryRelativePath) {
    const candidate = `${cloneDir}/${entry.frozenEntryRelativePath}`;
    entryFile = (await exists(candidate)) ? candidate : await findEntryFile(cloneDir, entry.subpath);
  } else {
    entryFile = await findEntryFile(cloneDir, entry.subpath);
  }
  if (!entryFile) {
    return {
      name: entry.name,
      outcome: "NO_ENTRY_FILE",
      error: "no .ts file with server.tool() or server.registerTool() found",
    };
  }

  // 3. Run pipeline
  let verdicts: Verdict[];
  try {
    verdicts = await runPipeline(entryFile);
  } catch (e) {
    return {
      name: entry.name,
      outcome: "PARSE_ERROR",
      error: String(e).slice(0, 500),
    };
  }

  if (verdicts.length === 0) {
    return {
      name: entry.name,
      outcome: "NO_TOOLS_FOUND",
      error: "pipeline ran but no server.tool() or registerTool() calls detected",
    };
  }

  const okCount = verdicts.filter((v) => v.kind === "OK").length;
  const violations = verdicts.filter((v) => v.kind === "VIOLATION");
  const violationDetails: ViolationDetail[] = violations.map((v) => {
    if (v.kind !== "VIOLATION") return { tool: "", undeclared: [], witnessCount: 0 };
    const witnessCount = [...v.witnesses.values()].reduce((s, ws) => s + ws.length, 0);
    return {
      tool: v.tool,
      undeclared: [...v.undeclared],
      witnessCount,
    };
  });

  return {
    name: entry.name,
    outcome: "SUCCESS",
    tools: verdicts.length,
    ok: okCount,
    violation: violations.length,
    violationDetails,
    analysedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();

  // Parse flags
  const force = Deno.args.includes("--force") || Deno.args.includes("--rerun");
  const fromFrozen = Deno.args.includes("--from-frozen");

  // Read corpus, or in frozen mode, read corpus-frozen.json and rehydrate.
  let corpus: { totalCount: number; servers: CorpusEntry[] };
  if (fromFrozen) {
    let frozen: FrozenFile;
    try {
      frozen = JSON.parse(await Deno.readTextFile(FROZEN_PATH));
    } catch (e) {
      console.error(`Failed to read ${FROZEN_PATH}: ${e}`);
      console.error("Run: deno run --allow-read --allow-write --allow-run scripts/freeze-corpus.ts");
      Deno.exit(1);
    }
    console.log(
      `--from-frozen: replaying ${frozen.totalCount} entries pinned against ${frozen.pinnedAgainstResultsRanAt}`,
    );
    corpus = {
      totalCount: frozen.totalCount,
      servers: frozen.servers.map((f) => ({
        name: f.name,
        cloneUrl: f.cloneUrl,
        subpath: f.subpath,
        stars: null,
        source: "frozen",
        frozenSha: f.sha,
        frozenEntryRelativePath: f.entryRelativePath,
      })),
    };
  } else {
    try {
      corpus = JSON.parse(await Deno.readTextFile(CORPUS_PATH));
    } catch (e) {
      console.error(`Failed to read ${CORPUS_PATH}: ${e}`);
      console.error("Run: deno run --allow-net --allow-write scripts/crawl-corpus.ts");
      Deno.exit(1);
    }
  }

  // Load existing results (for idempotency; skipped when --force)
  let existingResults: ServerResult[] = [];
  if (!force) {
    try {
      const existing: ResultsFile = JSON.parse(await Deno.readTextFile(RESULTS_PATH));
      existingResults = existing.results ?? [];
      console.log(`Loaded ${existingResults.length} existing results from ${RESULTS_PATH}`);
    } catch {
      // No existing results — start fresh
    }
  } else {
    console.log("--force: re-analysing all servers from scratch");
  }

  const existingNames = new Set(existingResults.map((r) => r.name));
  const pending = corpus.servers.filter((s) => !existingNames.has(s.name));
  const allResults: ServerResult[] = [...existingResults];

  console.log(
    `\n=== batch-analyze: ${corpus.servers.length} total, ${existingResults.length} already done, ${pending.length} pending ===\n`,
  );

  // Ensure real-servers directory exists
  try {
    await Deno.mkdir(REAL_SERVERS_DIR, { recursive: true });
  } catch {
    // already exists
  }

  let i = existingResults.length;
  const total = corpus.servers.length;

  for (const entry of pending) {
    // Wall-time check
    if (Date.now() - startTime > WALL_TIME_LIMIT_MS) {
      console.warn("\n*** 30-minute wall-time cap reached. Stopping early. ***");
      break;
    }

    i++;
    const label = `[${i}/${total}] ${entry.name}`;
    process.stdout?.write(`${label} ... `);

    const result = await analyseEntry(entry);
    allResults.push(result);

    // Progress line
    let detail = result.outcome;
    if (result.outcome === "SUCCESS") {
      detail += ` (${result.tools} tools, ${result.violation} viol)`;
    } else if (result.error) {
      detail += `: ${result.error.slice(0, 60)}`;
    }
    console.log(detail);

    // Save after each entry (so partial results survive crashes)
    await saveResults(allResults, corpus.servers.length);
  }

  await saveResults(allResults, corpus.servers.length);
  console.log(`\nDone. Results written to ${RESULTS_PATH}`);
}

async function saveResults(results: ServerResult[], totalAttempted: number): Promise<void> {
  const outcomes: Record<string, number> = {};
  for (const r of results) {
    outcomes[r.outcome] = (outcomes[r.outcome] ?? 0) + 1;
  }

  const file: ResultsFile = {
    ranAt: new Date().toISOString(),
    totalAttempted,
    outcomes,
    results,
  };

  await Deno.writeTextFile(RESULTS_PATH, JSON.stringify(file, null, 2));
}

await main();
