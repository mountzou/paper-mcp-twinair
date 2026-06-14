import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerHealthTools } from "./tools/healthTools.js";
import { registerCurrentSensorTools } from "./tools/currentSensorTools.js";
import { registerSearchSensorTools } from "./tools/searchSensorTools.js";
import { registerHistorySensorTools } from "./tools/historySensorTools.js";
import { registerHistoryRoomTools } from "./tools/historyRoomTools.js";

const server = new McpServer({
  name: "fiware-mcp-server",
  version: "0.1.0"
});

registerHealthTools(server);
registerCurrentSensorTools(server);
registerSearchSensorTools(server);
registerHistorySensorTools(server);
registerHistoryRoomTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);