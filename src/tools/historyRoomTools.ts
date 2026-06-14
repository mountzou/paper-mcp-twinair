import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { orionGet } from "../fiware/orionClient.js";
import { quantumLeapGet } from "../fiware/quantumLeapClient.js";
import { normalizeDate } from "../utils/dates.js";
import { cleanParams } from "../utils/params.js";
import { DEFAULT_SENSOR_ATTRS } from "../formatters/sensorFormatter.js";

type AggregationMethod = "count" | "sum" | "avg" | "min" | "max";

const rawDescription =
  "If false, return compact LLM-friendly JSON. If true, return the full raw FIWARE/QuantumLeap responses.";

function firstValue(data: any) {
  return Array.isArray(data?.values) ? data.values[0] ?? null : null;
}

function firstTimestamp(data: any) {
  return Array.isArray(data?.index) ? data.index[0] ?? null : null;
}

function aggregateAcrossSensors(values: unknown[], method: AggregationMethod): number | null {
  const nums = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );

  if (method === "count") return nums.length;
  if (nums.length === 0) return null;

  if (method === "sum") return nums.reduce((acc, value) => acc + value, 0);
  if (method === "avg") return nums.reduce((acc, value) => acc + value, 0) / nums.length;
  if (method === "min") return Math.min(...nums);
  if (method === "max") return Math.max(...nums);

  return null;
}

export function registerHistoryRoomTools(server: McpServer) {
  server.tool(
    "get_history_room",
    "Use this for historical readings or aggregates for all sensors in a specific FIWARE/TwinAIR room. It finds sensors in the room using Orion, then queries QuantumLeap history for each sensor, then computes a room-level aggregate across sensors. Use get_history_sensor for one known sensor.",
    {
      roomId: z
        .string()
        .describe("Full NGSI-LD room ID, e.g. urn:ngsi-ld:room:tri_khfh_main."),
      type: z
        .enum(["hwsensors", "wsensors", "vsensors"])
        .default("hwsensors")
        .describe("Sensor entity type: hwsensors, wsensors, or vsensors."),
    attr: z
        .enum(DEFAULT_SENSOR_ATTRS)
        .default("airTemperature")
        .describe("Sensor attribute to query. Supported values: " + DEFAULT_SENSOR_ATTRS.join(", ")),
      fromDate: z
        .string()
        .optional()
        .describe("Start datetime, e.g. 2026-06-12T00:00:00Z."),
      toDate: z
        .string()
        .optional()
        .describe("End datetime, e.g. 2026-06-12T23:59:59Z."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Maximum number of QuantumLeap records per sensor."),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Pagination offset for QuantumLeap results."),
      aggrPeriod: z
        .enum(["minute", "hour", "day", "month"])
        .default("day")
        .describe("Temporal aggregation period applied by QuantumLeap to each sensor."),
      aggrMethod: z
        .enum(["count", "sum", "avg", "min", "max"])
        .default("avg")
        .describe(
          "Aggregation method. QuantumLeap applies this over time per sensor; the MCP then applies the same method across all room sensors."
        ),
      raw: z.boolean().default(false).describe(rawDescription)
    },
    async ({
      roomId,
      type,
      attr,
      fromDate,
      toDate,
      limit,
      offset,
      aggrPeriod,
      aggrMethod,
      raw
    }) => {
      const normalizedFromDate = normalizeDate(fromDate);
      const normalizedToDate = normalizeDate(toDate);

      const sensors = await orionGet("/ngsi-ld/v1/entities", {
        type,
        options: "keyValues",
        q: `refRoom=="${roomId}"`
      });

      if (!Array.isArray(sensors)) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  error: true,
                  message: "Expected Orion to return an array of sensors.",
                  orionResponse: sensors
                },
                null,
                2
              )
            }
          ]
        };
      }

      const rows = await Promise.all(
        sensors.map(async (sensor: any) => {
          const entityId = sensor.id;
          const name = sensor.name;

          if (!entityId) {
            return {
              entityId: null,
              name,
              status: "error",
              timestamp: null,
              value: null,
              error: "Sensor has no entity ID.",
              raw: null
            };
          }

          const history = await quantumLeapGet(
            `/v2/entities/${encodeURIComponent(entityId)}/attrs/${encodeURIComponent(attr)}`,
            cleanParams({
              type,
              fromDate: normalizedFromDate,
              toDate: normalizedToDate,
              limit: String(limit),
              offset: String(offset),
              aggrPeriod,
              aggrMethod
            })
          );

          if (history?.error) {
            return {
              entityId,
              name,
              status: "error",
              timestamp: null,
              value: null,
              error: history,
              raw: history
            };
          }

          const timestamp = firstTimestamp(history);
          const value = firstValue(history);

          return {
            entityId,
            name,
            status: value === null ? "no_data" : "ok",
            timestamp,
            value,
            raw: history
          };
        })
      );

      const roomAggregate = aggregateAcrossSensors(
        rows.map((row) => row.value),
        aggrMethod
      );

      const compactRows = rows.map(({ raw, ...row }) => row);

      const compact = {
        roomId,
        type,
        attr,
        fromDate: normalizedFromDate,
        toDate: normalizedToDate,
        aggrPeriod,
        aggrMethod,
        sensorCount: rows.length,
        successCount: rows.filter((row) => row.status === "ok").length,
        noDataCount: rows.filter((row) => row.status === "no_data").length,
        errorCount: rows.filter((row) => row.status === "error").length,
        roomAggregate,
        sensors: compactRows
      };

      const result = raw
        ? {
            ...compact,
            raw: {
              sensors,
              histories: rows.map((row) => ({
                entityId: row.entityId,
                name: row.name,
                response: row.raw
              }))
            }
          }
        : compact;

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  );
}