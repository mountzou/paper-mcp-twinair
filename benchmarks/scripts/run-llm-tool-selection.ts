import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

type Question = {
  question_id: string;
  category_id: string;
  question: string;
};

const questions = JSON.parse(
  readFileSync("benchmarks/datasets/questions.json", "utf-8")
) as Question[];

const tools = [
  {
    type: "function" as const,
    name: "get_current_sensor",
    description:
      "Use this only for FIWARE/TwinAIR questions asking for the latest/current values of one known sensor. Requires a full NGSI-LD sensor entity ID.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        entityId: {
          type: "string",
          description:
            "Full NGSI-LD entity ID, e.g. urn:ngsi-ld:hwsensors:17038"
        },
        type: {
          type: "string",
          enum: ["hwsensors", "wsensors", "vsensors"],
          default: "hwsensors"
        },
        raw: {
          type: "boolean",
          default: false
        }
      },
      required: ["entityId", "type", "raw"]
    }
  },
  {
    type: "function" as const,
    name: "search_current_sensors",
    description:
      "Use this only for FIWARE/TwinAIR questions asking to find sensors by room, pilot, type, or NGSI-LD condition. Do not use for one exact sensor ID.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["hwsensors", "wsensors", "vsensors"],
          default: "hwsensors"
        },
        q: {
          type: "string",
          description:
            'NGSI-LD query filter, e.g. refRoom=="urn:ngsi-ld:room:tri_khfh_main"'
        },
        raw: {
          type: "boolean",
          default: false
        }
      },
      required: ["type", "q", "raw"]
    }
  },
  {
    type: "function" as const,
    name: "get_history_sensor",
    description:
      "Use this only for FIWARE/TwinAIR questions asking for historical readings or aggregates for one known sensor over time.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        entityId: {
          type: "string"
        },
        type: {
          type: "string",
          enum: ["hwsensors", "wsensors", "vsensors"],
          default: "hwsensors"
        },
        attr: {
          type: "string",
          enum: [
            "airTemperature",
            "relativeHumidity",
            "co2",
            "eco2",
            "pm1",
            "pm25",
            "pm10",
            "tvoc",
            "formaldehyde",
            "barometricPressure",
            "noiseLevel",
            "light",
            "battery",
            "rssi"
          ]
        },
        fromDate: {
          type: "string"
        },
        toDate: {
          type: "string"
        },
        aggrPeriod: {
          type: "string",
          enum: ["minute", "hour", "day", "month"]
        },
        aggrMethod: {
          type: "string",
          enum: ["count", "sum", "avg", "min", "max"]
        },
        raw: {
          type: "boolean",
          default: false
        }
      },
      required: [
        "entityId",
        "type",
        "attr",
        "fromDate",
        "toDate",
        "aggrPeriod",
        "aggrMethod",
        "raw"
      ]
    }
  },
  {
    type: "function" as const,
    name: "get_history_room",
    description:
      "Use this only for FIWARE/TwinAIR questions asking for historical readings or aggregates for all sensors in a specific room.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        roomId: {
          type: "string"
        },
        type: {
          type: "string",
          enum: ["hwsensors", "wsensors", "vsensors"],
          default: "hwsensors"
        },
        attr: {
          type: "string",
          enum: [
            "airTemperature",
            "relativeHumidity",
            "co2",
            "eco2",
            "pm1",
            "pm25",
            "pm10",
            "tvoc",
            "formaldehyde",
            "barometricPressure",
            "noiseLevel",
            "light",
            "battery",
            "rssi"
          ]
        },
        fromDate: {
          type: "string"
        },
        toDate: {
          type: "string"
        },
        aggrPeriod: {
          type: "string",
          enum: ["minute", "hour", "day", "month"]
        },
        aggrMethod: {
          type: "string",
          enum: ["count", "sum", "avg", "min", "max"]
        },
        raw: {
          type: "boolean",
          default: false
        }
      },
      required: [
        "roomId",
        "type",
        "attr",
        "fromDate",
        "toDate",
        "aggrPeriod",
        "aggrMethod",
        "raw"
      ]
    }
  }
];

function extractFunctionCall(response: any) {
  const item = response.output?.find((x: any) => x.type === "function_call");

  if (!item) {
    return {
      tool_name: null,
      arguments: null
    };
  }

  return {
    tool_name: item.name,
    arguments: JSON.parse(item.arguments ?? "{}")
  };
}

function normalizeShortSensorIds(args: Record<string, unknown>) {
  if (
    typeof args.entityId === "string" &&
    /^[0-9]+$/.test(args.entityId)
  ) {
    return {
      ...args,
      entityId: `urn:ngsi-ld:hwsensors:${args.entityId}`
    };
  }

  return args;
}

const systemPrompt = `
You are evaluating FIWARE/TwinAIR MCP tool selection.

Select exactly one tool when the user asks a FIWARE/TwinAIR data question.

Rules:
- Current/latest/now/real-time values for one known sensor -> get_current_sensor.
- Finding sensors in a room, pilot, or condition -> search_current_sensors.
- Historical values, trends, averages, min, max, count for one known sensor -> get_history_sensor.
- Historical values or aggregates for all sensors in a room -> get_history_room.
- If the user gives a short hardware sensor ID like "17038", normalize it to "urn:ngsi-ld:hwsensors:17038".
- Use type "hwsensors" for hardware sensors.
- Use raw=false unless the user explicitly asks for raw output.
- Do not answer with prose if a tool call is appropriate.
`;

mkdirSync("benchmarks/results", { recursive: true });

const results = [];

for (const q of questions) {
  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: q.question
      }
    ],
    tools,
    tool_choice: "auto"
  });

  const call = extractFunctionCall(response);
  const normalizedArgs = call.arguments
    ? normalizeShortSensorIds(call.arguments)
    : null;

  results.push({
    question_id: q.question_id,
    category_id: q.category_id,
    question: q.question,
    predicted_tool: call.tool_name,
    predicted_params: normalizedArgs,
    response_id: response.id
  });

  console.log(`${q.question_id}: ${call.tool_name}`);
}

const outPath = `benchmarks/results/predictions_${Date.now()}.json`;

writeFileSync(outPath, JSON.stringify(results, null, 2));

console.log(`Wrote predictions to ${outPath}`);