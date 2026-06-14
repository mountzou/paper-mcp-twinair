import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { orionGet } from "../fiware/orionClient.js";
import { shapeCurrentSensors } from "../formatters/sensorFormatter.js";

const rawDescription =
  "If false, return compact LLM-friendly JSON. If true, return the full raw FIWARE response for debugging or schema inspection.";

export function registerSearchSensorTools(server: McpServer) {
  server.tool(
    "search_current_sensors",
    "Use this when the user wants to find current sensors matching a condition, such as all sensors of a type, sensors in a room, or sensors linked to a pilot. This calls Orion current-state data and returns matching sensors. Do not use when the user already provides one exact entity ID; use get_current_sensor instead. Do not use for historical data.",
    {
    type: z
        .enum(["hwsensors", "wsensors", "vsensors"])
        .default("hwsensors")
        .describe(
        "FIWARE sensor entity type to search. Use hwsensors for hardware sensors, wsensors for wearable sensors, or vsensors for virtual sensors."
        ),
    options: z
        .enum(["keyValues", "normalized", "concise"])
        .default("keyValues")
        .describe(
        "Orion response format. Use keyValues for simpler search results, normalized for full NGSI-LD properties, or concise for compact NGSI-LD."
        ),
    q: z
        .string()
        .optional()
        .describe(
        'Optional NGSI-LD query filter for Orion. Use this to filter sensors by relationships or attributes. Examples: refRoom=="urn:ngsi-ld:room:tri_khfh_main", refPilot=="urn:ngsi-ld:pilot:tri_khfh". Leave empty to return all sensors of the given type.'
        ),
    raw: z.boolean().default(false).describe(rawDescription)
    },
    async ({ type, options, q, raw }) => {
      const data = await orionGet("/ngsi-ld/v1/entities", {
        type,
        options,
        q: q ?? ""
      });

      const result = raw ? data : shapeCurrentSensors(data);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  );
}