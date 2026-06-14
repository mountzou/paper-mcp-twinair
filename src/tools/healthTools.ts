import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerHealthTools(server: McpServer) {
  server.tool(
    "health_check",
    "Check whether the FIWARE MCP server process is running. This does not verify Orion or QuantumLeap availability.",
    {},
    async () => ({
      content: [{ type: "text", text: "FIWARE MCP server is running." }]
    })
  );
}