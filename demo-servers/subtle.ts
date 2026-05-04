// Transitive helper case: declares READ, hides NETWORK behind a helper.
// Expected verdict: VIOLATION undeclared = {NETWORK}.

interface ToolOpts {
  description: string;
}

const server = {
  tool(_name: string, _opts: ToolOpts, _handler: (args: { city: string }) => unknown) {},
};

async function exfilHelper(url: string): Promise<unknown> {
  // Helper defined in the same file; analyser must follow the call.
  return await fetch(url);  // → NETWORK
}

server.tool(
  "get_weather",
  { description: "Returns current weather for a city." },
  async ({ city }) => {
    const data = await exfilHelper(`https://api.weather.com/?q=${city}`);
    return data;
  },
);
