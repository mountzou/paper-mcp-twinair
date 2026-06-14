import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { quantumLeapGet } from "../fiware/quantumLeapClient.js";
import { shapeHistory } from "../formatters/historyFormatter.js";
import { normalizeDate } from "../utils/dates.js";
import { cleanParams } from "../utils/params.js";
import { DEFAULT_SENSOR_ATTRS } from "../formatters/sensorFormatter.js";

const rawDescription =
  "If false, return compact LLM-friendly JSON. If true, return the full raw FIWARE response for debugging or schema inspection.";

export function registerHistorySensorTools(server: McpServer) {
  server.tool(
    "get_history_sensor",
    "Use this when the user asks for historical sensor readings, trends, averages, min/max/count, or values over a time range for one known sensor. This calls QuantumLeap time-series data. Requires a sensor entityId and one sensor attribute. Use fromDate/toDate for explicit date ranges. Use lastN only for latest historical records without a date range. Do not use for current/latest state; use get_current_sensor instead.",
    {
      type: z
        .enum(["hwsensors", "wsensors", "vsensors"])
        .default("hwsensors")
        .describe("FIWARE sensor entity type. Use hwsensors for hardware sensors, wsensors for wearable sensors, or vsensors for virtual sensors."),
      entityId: z
        .string()
        .describe("Full NGSI-LD entity ID, e.g. urn:ngsi-ld:hwsensors:17038."),
      attr: z
        .enum(DEFAULT_SENSOR_ATTRS)
        .default("airTemperature")
        .describe("Sensor attribute to query. Supported values: " + DEFAULT_SENSOR_ATTRS.join(", ")),
      fromDate: z
        .string()
        .optional()
        .describe("Start datetime for historical queries. Prefer explicit UTC format, e.g. 2026-06-12T00:00:00Z. Bare ISO datetimes are treated as UTC."),
      toDate: z
        .string()
        .optional()
        .describe("End datetime for historical queries. Prefer explicit UTC format, e.g. 2026-06-12T23:59:59Z. Bare ISO datetimes are treated as UTC."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(100)
        .describe("Maximum number of historical records to return."),
      lastN: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .optional()
        .describe("Latest N historical records. Use only when fromDate/toDate are not provided; ignored when a date range is provided."),
      offset: z
        .number()
        .int()
        .min(0)
        .default(0)
        .describe("Pagination offset for QuantumLeap results."),
      aggrPeriod: z
        .enum(["minute", "hour", "day", "month"])
        .optional()
        .describe("Aggregation period for QuantumLeap, e.g. hour or day. Use together with aggrMethod."),
      aggrMethod: z
        .enum(["count", "sum", "avg", "min", "max"])
        .optional()
        .describe("Aggregation method for QuantumLeap. Use avg for averages, not mean."),
      raw: z.boolean().default(false).describe(rawDescription)
    },
    async ({
      type,
      entityId,
      attr,
      fromDate,
      toDate,
      limit,
      lastN,
      offset,
      aggrPeriod,
      aggrMethod,
      raw
    }) => {
      const path = `/v2/entities/${encodeURIComponent(entityId)}/attrs/${encodeURIComponent(attr)}`;
      const hasDateRange = Boolean(fromDate || toDate);

      const params = cleanParams({
        type,
        fromDate: normalizeDate(fromDate),
        toDate: normalizeDate(toDate),
        limit: String(limit),
        offset: String(offset),
        aggrPeriod,
        aggrMethod,
        lastN: !hasDateRange && lastN ? String(lastN) : undefined
      });

      const data = await quantumLeapGet(path, params);
      const result = raw ? data : shapeHistory(data);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
      };
    }
  );
}