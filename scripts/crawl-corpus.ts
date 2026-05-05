/**
 * crawl-corpus.ts
 *
 * Assembles a corpus of TypeScript MCP servers from:
 *   a) modelcontextprotocol/servers subdirectories under src/ (high-quality reference servers)
 *   b) Snakinya/MCPCorpus — a public ~14K-server dataset with normalised GitHub metadata
 *      (cloned to real-servers/_mcpcorpus/; gitignored like the rest of real-servers/)
 *
 * Usage:
 *   deno run --allow-net --allow-write --allow-read --allow-run scripts/crawl-corpus.ts
 *
 * Writes corpus.json in the project root.
 * Idempotent: safe to re-run.
 */

const CORPUS_PATH = "./corpus.json";
const MAX_SERVERS = 500;
const MCPCORPUS_CLONE_URL = "https://github.com/Snakinya/MCPCorpus.git";
const MCPCORPUS_DIR = "./real-servers/_mcpcorpus";
const MCPCORPUS_DATA_FILE = `${MCPCORPUS_DIR}/Website/mcpso_servers_cleaned.json`;
const MCP_SERVERS_REPO = "https://api.github.com/repos/modelcontextprotocol/servers";
const MCP_SERVERS_CLONE = "https://github.com/modelcontextprotocol/servers.git";
const MIN_STARS = 2; // skip zero/one-star repos that are likely abandoned

interface CorpusEntry {
  name: string;
  cloneUrl: string;
  subpath: string | null;
  stars: number | null;
  source: "modelcontextprotocol-servers" | "mcpcorpus";
}

interface CorpusFile {
  generated: string;
  totalCount: number;
  servers: CorpusEntry[];
}

// ---------------------------------------------------------------------------
// Shell helper
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
// Part A: modelcontextprotocol/servers (reference servers)
// ---------------------------------------------------------------------------

async function fetchMcpServersSubdirs(): Promise<CorpusEntry[]> {
  const entries: CorpusEntry[] = [];

  console.log("Fetching modelcontextprotocol/servers src/ directory listing...");

  let srcContents: Array<{ type: string; name: string; path: string }> = [];
  try {
    const resp = await fetch(`${MCP_SERVERS_REPO}/contents/src`, {
      headers: { "Accept": "application/vnd.github+json", "User-Agent": "sound-permissions-crawler" },
    });
    if (!resp.ok) {
      console.warn(`  WARNING: GitHub API returned ${resp.status} for modelcontextprotocol/servers/src`);
      return entries;
    }
    srcContents = await resp.json();
  } catch (e) {
    console.warn(`  WARNING: Failed to fetch modelcontextprotocol/servers/src: ${e}`);
    return entries;
  }

  const dirs = srcContents.filter((x) => x.type === "dir");
  console.log(`  Found ${dirs.length} subdirectories under src/`);

  for (const dir of dirs) {
    const subpath = `src/${dir.name}`;
    let hasPackageJson = false;
    let hasTsWithServerTool = false;

    try {
      const contentsResp = await fetch(
        `${MCP_SERVERS_REPO}/contents/${subpath}`,
        { headers: { "Accept": "application/vnd.github+json", "User-Agent": "sound-permissions-crawler" } },
      );
      if (!contentsResp.ok) continue;
      const contents: Array<{ type: string; name: string; download_url: string | null }> =
        await contentsResp.json();

      hasPackageJson = contents.some((f) => f.type === "file" && f.name === "package.json");

      const tsFiles = contents.filter((f) => f.type === "file" && f.name.endsWith(".ts"));
      for (const tsFile of tsFiles) {
        if (!tsFile.download_url) continue;
        try {
          const src = await fetch(tsFile.download_url, {
            headers: { "User-Agent": "sound-permissions-crawler" },
          });
          if (!src.ok) continue;
          const text = await src.text();
          if (text.includes("server.tool") || text.includes("server.registerTool")) {
            hasTsWithServerTool = true;
            break;
          }
        } catch {
          // ignore individual file fetch errors
        }
      }

      // Also check src/ subdirectory if exists
      if (!hasTsWithServerTool) {
        const srcDir = contents.find((f) => f.type === "dir" && f.name === "src");
        if (srcDir) {
          try {
            const srcResp = await fetch(
              `${MCP_SERVERS_REPO}/contents/${subpath}/src`,
              { headers: { "Accept": "application/vnd.github+json", "User-Agent": "sound-permissions-crawler" } },
            );
            if (srcResp.ok) {
              const srcFiles: Array<{ type: string; name: string; download_url: string | null }> =
                await srcResp.json();
              for (const tsFile of srcFiles.filter((f) => f.type === "file" && f.name.endsWith(".ts"))) {
                if (!tsFile.download_url) continue;
                try {
                  const src = await fetch(tsFile.download_url, {
                    headers: { "User-Agent": "sound-permissions-crawler" },
                  });
                  if (!src.ok) continue;
                  const text = await src.text();
                  if (text.includes("server.tool") || text.includes("server.registerTool")) {
                    hasTsWithServerTool = true;
                    break;
                  }
                } catch {
                  // ignore
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      console.warn(`  WARNING: Failed to inspect ${subpath}: ${e}`);
      continue;
    }

    if (hasPackageJson && hasTsWithServerTool) {
      console.log(`  + modelcontextprotocol/servers#${dir.name}`);
      entries.push({
        name: `modelcontextprotocol/servers#${dir.name}`,
        cloneUrl: MCP_SERVERS_CLONE,
        subpath,
        stars: null,
        source: "modelcontextprotocol-servers",
      });
    }
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Part B: MCPCorpus
// ---------------------------------------------------------------------------

/** Clone or update the MCPCorpus dataset repo (sparse — we only need Website/). */
async function ensureMcpCorpus(): Promise<boolean> {
  // Check if already cloned
  try {
    await Deno.stat(MCPCORPUS_DATA_FILE);
    console.log("MCPCorpus already cloned; using cached copy.");
    return true;
  } catch {
    // Not cloned yet
  }

  console.log("Cloning Snakinya/MCPCorpus (sparse — Website/ only)...");
  await Deno.mkdir(MCPCORPUS_DIR, { recursive: true });

  // Init + sparse checkout to get only Website/mcpso_servers_cleaned.json
  const initResult = await run(["git", "init"], MCPCORPUS_DIR);
  if (!initResult.success) {
    console.warn(`  WARNING: git init failed: ${initResult.stderr.slice(0, 200)}`);
    return false;
  }

  const remoteResult = await run(
    ["git", "remote", "add", "origin", MCPCORPUS_CLONE_URL],
    MCPCORPUS_DIR,
  );
  if (!remoteResult.success) {
    // Remote might already exist if partially cloned
    console.warn(`  WARNING: git remote add: ${remoteResult.stderr.slice(0, 200)}`);
  }

  const sparseInitResult = await run(
    ["git", "sparse-checkout", "init", "--cone"],
    MCPCORPUS_DIR,
  );
  if (!sparseInitResult.success) {
    console.warn(`  WARNING: sparse-checkout init failed: ${sparseInitResult.stderr.slice(0, 200)}`);
    return false;
  }

  const sparseSetResult = await run(
    ["git", "sparse-checkout", "set", "Website"],
    MCPCORPUS_DIR,
  );
  if (!sparseSetResult.success) {
    console.warn(`  WARNING: sparse-checkout set failed: ${sparseSetResult.stderr.slice(0, 200)}`);
    return false;
  }

  console.log("  Fetching (depth=1)...");
  const fetchResult = await run(
    ["git", "fetch", "--depth=1", "origin", "main"],
    MCPCORPUS_DIR,
  );
  if (!fetchResult.success) {
    // Try master branch
    const fetchResult2 = await run(
      ["git", "fetch", "--depth=1", "origin", "master"],
      MCPCORPUS_DIR,
    );
    if (!fetchResult2.success) {
      console.warn(`  WARNING: git fetch failed: ${fetchResult2.stderr.slice(0, 200)}`);
      return false;
    }
    await run(["git", "checkout", "FETCH_HEAD"], MCPCORPUS_DIR);
  } else {
    await run(["git", "checkout", "FETCH_HEAD"], MCPCORPUS_DIR);
  }

  // Verify the data file is there
  try {
    await Deno.stat(MCPCORPUS_DATA_FILE);
    console.log("  MCPCorpus data file found.");
    return true;
  } catch {
    console.warn(`  WARNING: Expected data file not found at ${MCPCORPUS_DATA_FILE}`);
    return false;
  }
}

/** Parse MCPCorpus cleaned JSON and extract TypeScript server entries. */
interface McpCorpusRawEntry {
  id?: unknown;
  name?: unknown;
  url?: unknown;
  title?: unknown;
  description?: unknown;
  author_name?: unknown;
  github?: {
    full_name?: string;
    stargazers_count?: number;
    language?: string;
    archived?: boolean;
  } | null;
}

function extractSubpath(url: string): string | null {
  const m = url.match(/\/tree\/(?:main|master)\/(.+)/);
  if (m) return m[1].replace(/\/$/, "");
  return null;
}

async function loadMcpCorpusEntries(
  alreadyNames: Set<string>,
): Promise<CorpusEntry[]> {
  let raw: unknown;
  try {
    const text = await Deno.readTextFile(MCPCORPUS_DATA_FILE);
    raw = JSON.parse(text);
  } catch (e) {
    console.warn(`  WARNING: Failed to parse MCPCorpus data file: ${e}`);
    return [];
  }

  if (!Array.isArray(raw)) {
    console.warn("  WARNING: MCPCorpus data is not an array — schema may have changed. Skipping.");
    return [];
  }

  console.log(`  MCPCorpus: ${raw.length} total entries`);

  const entries: CorpusEntry[] = [];
  const seenKeys = new Set<string>(alreadyNames);

  let skippedNoGithub = 0;
  let skippedNotTs = 0;
  let skippedArchived = 0;
  let skippedLowStars = 0;
  let skippedDuplicate = 0;

  for (const item of raw as McpCorpusRawEntry[]) {
    // Tolerate schema changes: skip entries that lack expected fields
    const gh = item?.github;
    if (!gh || typeof gh !== "object") {
      skippedNoGithub++;
      continue;
    }

    const lang = gh.language;
    if (lang !== "TypeScript") {
      skippedNotTs++;
      continue;
    }

    if (gh.archived === true) {
      skippedArchived++;
      continue;
    }

    const fullName = gh.full_name;
    if (!fullName || typeof fullName !== "string") {
      skippedNoGithub++;
      continue;
    }

    const stars = typeof gh.stargazers_count === "number" ? gh.stargazers_count : 0;
    if (stars < MIN_STARS) {
      skippedLowStars++;
      continue;
    }

    const url = typeof item.url === "string" ? item.url : "";
    const subpath = url ? extractSubpath(url) : null;

    // Dedup key: repo + subpath
    const key = subpath ? `${fullName}#${subpath}` : fullName;
    if (seenKeys.has(key)) {
      skippedDuplicate++;
      continue;
    }
    seenKeys.add(key);

    const cloneUrl = `https://github.com/${fullName}.git`;

    entries.push({
      name: key,
      cloneUrl,
      subpath,
      stars,
      source: "mcpcorpus",
    });
  }

  console.log(`  Filter results: TS=${
    raw.length - skippedNotTs - skippedNoGithub
  } kept, archived=${skippedArchived} skipped, low-stars(<${MIN_STARS})=${skippedLowStars} skipped, dup=${skippedDuplicate} skipped, no-github=${skippedNoGithub} skipped`);
  console.log(`  MCPCorpus TypeScript entries (pre-cap): ${entries.length}`);

  return entries;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== sound-permissions corpus crawler (MCPCorpus edition) ===\n");

  const allServers: CorpusEntry[] = [];

  // Part A: modelcontextprotocol/servers reference servers
  const mcpEntries = await fetchMcpServersSubdirs();
  allServers.push(...mcpEntries);
  console.log(`\nmodelcontextprotocol/servers: ${mcpEntries.length} reference servers\n`);

  // Part B: MCPCorpus
  const corpusAvailable = await ensureMcpCorpus();
  if (!corpusAvailable) {
    console.warn(
      "WARNING: MCPCorpus not available. Corpus will only contain modelcontextprotocol/servers entries.",
    );
  } else {
    const alreadyNames = new Set(allServers.map((e) => e.name));
    // Also add bare repo names without subpath to prevent double-adding repo with/without subpath
    for (const e of allServers) {
      const bare = e.name.split("#")[0];
      alreadyNames.add(bare);
    }

    const mcpCorpusEntries = await loadMcpCorpusEntries(alreadyNames);

    // Sort by stars descending so the 500 cap picks the most popular servers
    mcpCorpusEntries.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));

    allServers.push(...mcpCorpusEntries);
    console.log(`\nMCPCorpus contribution: ${mcpCorpusEntries.length} additional TS servers`);
  }

  // Cap at MAX_SERVERS
  const capped = allServers.slice(0, MAX_SERVERS);
  if (allServers.length > MAX_SERVERS) {
    console.log(`\nCapping corpus at ${MAX_SERVERS} (had ${allServers.length} total)`);
  }

  const corpus: CorpusFile = {
    generated: new Date().toISOString(),
    totalCount: capped.length,
    servers: capped,
  };

  await Deno.writeTextFile(CORPUS_PATH, JSON.stringify(corpus, null, 2));
  console.log(`\nWrote ${CORPUS_PATH} with ${capped.length} servers.`);
}

await main();
