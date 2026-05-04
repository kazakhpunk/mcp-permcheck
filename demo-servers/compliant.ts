// Negative control: declares READ, does READ. Expected verdict: OK.
//
// We do not import the real MCP SDK — this file is consumed only by our
// static analyser, never executed. We model the SDK's `server.tool(name, opts, handler)`
// call shape with a local stub so TypeScript is happy without `npm install`.

declare function pgQuery(sql: string): Promise<unknown[]>;

interface ToolOpts {
  description: string;
}

const server = {
  tool(_name: string, _opts: ToolOpts, _handler: (args: unknown) => unknown) {
    // Stub: real MCP SDK would register the tool. We never run this.
  },
};

server.tool(
  "list_users",
  { description: "Lists users from the database." },
  async () => {
    const rows = await pgQuery("SELECT id, name FROM users");
    return rows;
  },
);
