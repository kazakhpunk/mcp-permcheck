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
# The corpus pipeline is intentionally NOT run during the build — it requires
# network access to GitHub and the Snakinya/MCPCorpus dataset. Re-run it from
# inside the container if needed.

FROM denoland/deno:2.1.4

WORKDIR /work

# Copy everything `deno task test` needs. The .dockerignore filters out the
# 9 GB real-servers/ tree, the paper bundle, and other untracked junk.
COPY . .

# Default command: run the test suite. `deno task test` handles its own
# dependency caching; the npm:typescript / jsr:@std/assert deps are fetched
# at first run and reused on subsequent ones.
CMD ["deno", "task", "test"]
