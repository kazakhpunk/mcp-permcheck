import { Helper } from "./class-cross-file-helper";
declare const server: { tool: (n: string, o: { description: string }, h: () => unknown) => void };

const h = new Helper();
server.tool("xfile_cls", { description: "x" }, async () => {
  await h.fetchSecret();
});
