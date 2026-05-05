/**
 * crawl-corpus.ts
 *
 * Assembles a corpus of TypeScript MCP servers from:
 *   a) modelcontextprotocol/servers subdirectories under src/
 *   b) GitHub Search API (unauthenticated)
 *
 * Usage:
 *   deno run --allow-net --allow-write scripts/crawl-corpus.ts
 *
 * Writes corpus.json in the project root.
 */

const CORPUS_PATH = "./corpus.json";
const MAX_SERVERS = 80;
const GITHUB_API = "https://api.github.com";
const MCP_SERVERS_REPO = "https://api.github.com/repos/modelcontextprotocol/servers";
const MCP_SERVERS_CLONE = "https://github.com/modelcontextprotocol/servers.git";

interface CorpusEntry {
  name: string;
  cloneUrl: string;
  subpath: string | null;
  stars: number | null;
  source: "modelcontextprotocol-servers" | "github-search";
}

interface CorpusFile {
  generated: string;
  totalCount: number;
  servers: CorpusEntry[];
}

// ---------------------------------------------------------------------------
// Part A: Enumerate TypeScript server subdirectories in modelcontextprotocol/servers
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
    // Check if the directory contains a package.json and a .ts file with server.tool or server.registerTool
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
// Part B: GitHub Search API
// ---------------------------------------------------------------------------

const EXCLUDE_PATTERNS = ["template", "boilerplate", "starter", "example"];

function shouldExclude(repoName: string): boolean {
  const lower = repoName.toLowerCase();
  return EXCLUDE_PATTERNS.some((p) => lower.includes(p));
}

interface GithubRepo {
  full_name: string;
  clone_url: string;
  stargazers_count: number;
  fork: boolean;
}

async function searchGithub(query: string): Promise<GithubRepo[]> {
  const url =
    `${GITHUB_API}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=100`;
  console.log(`Searching GitHub: ${query}`);

  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/vnd.github+json", "User-Agent": "sound-permissions-crawler" },
    });

    if (resp.status === 403 || resp.status === 429) {
      console.warn(`  WARNING: GitHub API rate limit hit (${resp.status}). Skipping query.`);
      return [];
    }

    if (!resp.ok) {
      console.warn(`  WARNING: GitHub API returned ${resp.status} for query "${query}"`);
      return [];
    }

    const data = await resp.json();
    console.log(`  Total hits: ${data.total_count ?? "unknown"}, fetched: ${data.items?.length ?? 0}`);
    return data.items ?? [];
  } catch (e) {
    console.warn(`  WARNING: GitHub search failed: ${e}`);
    return [];
  }
}

async function fetchGithubSearchEntries(alreadyNames: Set<string>): Promise<CorpusEntry[]> {
  const queries = [
    "mcp-server language:typescript",
    "model-context-protocol language:typescript",
  ];

  const seen = new Set<string>(alreadyNames);
  const entries: CorpusEntry[] = [];

  for (const query of queries) {
    const repos = await searchGithub(query);

    for (const repo of repos) {
      if (seen.has(repo.full_name)) continue;
      seen.add(repo.full_name);

      // Filter criteria
      if (repo.stargazers_count < 1) continue;
      if (shouldExclude(repo.full_name.split("/")[1])) continue;
      if (repo.fork) continue;

      entries.push({
        name: repo.full_name,
        cloneUrl: repo.clone_url,
        subpath: null,
        stars: repo.stargazers_count,
        source: "github-search",
      });
    }

    // Small delay between queries to be polite
    await new Promise((r) => setTimeout(r, 1000));
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("=== sound-permissions corpus crawler ===\n");

  const allServers: CorpusEntry[] = [];

  // Part A
  const mcpEntries = await fetchMcpServersSubdirs();
  allServers.push(...mcpEntries);
  console.log(`\nmodelcontextprotocol/servers: ${mcpEntries.length} servers\n`);

  // Part B
  const alreadyNames = new Set(allServers.map((e) => e.name));
  const githubEntries = await fetchGithubSearchEntries(alreadyNames);
  allServers.push(...githubEntries);
  console.log(`\nGitHub search: ${githubEntries.length} additional servers`);

  // Cap at MAX_SERVERS
  const capped = allServers.slice(0, MAX_SERVERS);
  if (allServers.length > MAX_SERVERS) {
    console.log(`\nCapping corpus at ${MAX_SERVERS} (had ${allServers.length})`);
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
