# Reproducible test environment for sound-permissions.
#
# Builds an image that contains Deno + the project source and runs the test
# suite by default. To reproduce the unit-test results from a clean machine:
#
#   docker build -t sound-permissions .
#   docker run --rm sound-permissions
#
# Expected output: "ok | 97 passed | 0 failed".
#
# To run the analyser ad-hoc on a TypeScript file you provide:
#
#   docker run --rm -v "$PWD/your-server.ts:/work/server.ts" \
#     sound-permissions \
#     deno run --allow-read --allow-env -e \
#       'import { runPipeline } from "./src/runPipeline.ts";
#        import { format } from "./src/report.ts";
#        for (const v of await runPipeline("/work/server.ts")) console.log(format(v));'
#
# The corpus pipeline is intentionally NOT run during the build — it requires
# network access to GitHub and the Snakinya/MCPCorpus dataset. Re-run it with
# `deno run --allow-net --allow-write --allow-read --allow-run scripts/crawl-corpus.ts`
# inside the container if needed.

# Pinned major version; bump intentionally so reproductions are deterministic.
FROM denoland/deno:2.1.4

WORKDIR /work

# Copy dependency manifests first for layer caching.
COPY deno.json deno.lock ./

# Pre-cache dependencies. `deno cache` over the test files warms the module
# graph; the test command below then runs offline-cacheable.
COPY src ./src
COPY tests ./tests
COPY demo-servers ./demo-servers
RUN deno cache tests/*_test.ts src/runPipeline.ts

# Copy remaining source needed at runtime (scripts, notebook, corpus snapshots).
COPY scripts ./scripts
COPY corpus.json corpus-results.json CORPUS_RESULTS.md README.md walkthrough.ipynb ./

# Default command: run the test suite. Override with `docker run ... <cmd>`.
CMD ["deno", "task", "test"]
