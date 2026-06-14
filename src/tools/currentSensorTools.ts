import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { orionGet } from "../fiware/orionClient.js";
import { shapeCurrentSensor } from "../formatters/sensorFormatter.js";

const rawDescription =
  "If false, return compact LLM-friendly JSON. If true, return the full raw FIWARE response for debugging or schema inspection.";

export function registerCurrentSensorTools(server: McpServer) {
  server.tool(
    "get_current_sensor",
    "Use this when the user asks for the latest/current values of one known sensor and provides a full entity ID. This calls Orion current-state data. Do not use for historical trends, averages over time, or date ranges; use get_history_sensor instead.",
    {
      entityId: z
        .string()
        .describe("Full NGSI-LD entity ID, e.g. urn:ngsi-ld:hwsensors:17038."),
      type: z
        .string()
        .default("hwsensors")
        .describe("FIWARE entity type. For hardware sensors, use hwsensors."),
      options: z
        .enum(["keyValues", "normalized", "concise"])
        .default("normalized")
        .describe("Orion response format. Use normalized for full NGSI-LD properties, keyValues for simpler values, or concise for compact NGSI-LD."),
      raw: z.boolean().default(false).describe(rawDescription)
    },
    async ({ entityId, type, options, raw }) => {
      const data = await orionGet(
        `/ngsi-ld/v1/entities/${encodeURIComponent(entityId)}`,
        { type, options }
      );

      const result = raw ? data : shapeCurrentSensor(data);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  );
}