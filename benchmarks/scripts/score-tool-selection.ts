import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type ExpectedCase = {
  question_id: string;
  expected_tool: string;
  expected_params: Record<string, unknown>;
  expected_attr_in_answer?: string;
  expected_attrs_in_answer?: string[];
  expected_fields_in_answer?: string[];
  expected_behavior?: string;
  requires_entity_id_normalization?: boolean;
};

type Prediction = {
  question_id: string;
  predicted_tool: string | null;
  predicted_params: Record<string, unknown> | null;
};

type ParamCheck = {
  key: string;
  expected: unknown;
  predicted: unknown;
  correct: boolean;
};

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

function latestPredictionFile() {
  const dir = "benchmarks/results";
  const files = readdirSync(dir)
    .filter((file) => file.startsWith("predictions_") && file.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    throw new Error("No predictions_*.json file found in benchmarks/results.");
  }

  return join(dir, files[files.length - 1]);
}

function valuesEqual(expected: unknown, predicted: unknown) {
  return JSON.stringify(expected) === JSON.stringify(predicted);
}

function compareParams(
  expectedParams: Record<string, unknown>,
  predictedParams: Record<string, unknown> | null
) {
  const checks: ParamCheck[] = Object.entries(expectedParams).map(
    ([key, expectedValue]) => {
      const predictedValue = predictedParams?.[key];

      return {
        key,
        expected: expectedValue,
        predicted: predictedValue,
        correct: valuesEqual(expectedValue, predictedValue)
      };
    }
  );

  return {
    checks,
    correct: checks.every((check) => check.correct)
  };
}

function getExpectedAttrs(expectedCase: ExpectedCase): string[] {
  if (expectedCase.expected_attr_in_answer) {
    return [expectedCase.expected_attr_in_answer];
  }

  if (Array.isArray(expectedCase.expected_attrs_in_answer)) {
    return expectedCase.expected_attrs_in_answer;
  }

  return [];
}

function getExpectedFields(expectedCase: ExpectedCase): string[] {
  if (Array.isArray(expectedCase.expected_fields_in_answer)) {
    return expectedCase.expected_fields_in_answer;
  }

  return [];
}

const expectedPath = "benchmarks/datasets/expected_tool_calls.json";
const predictionsPath = process.argv[2] ?? latestPredictionFile();

const expected = readJson<ExpectedCase[]>(expectedPath);
const predictions = readJson<Prediction[]>(predictionsPath);

const predictionById = new Map(
  predictions.map((prediction) => [prediction.question_id, prediction])
);

const rows = expected.map((expectedCase) => {
  const prediction = predictionById.get(expectedCase.question_id);

  const toolCorrect = prediction?.predicted_tool === expectedCase.expected_tool;

  const paramComparison = compareParams(
    expectedCase.expected_params,
    prediction?.predicted_params ?? null
  );

  const expectedAttrs = getExpectedAttrs(expectedCase);
  const expectedFields = getExpectedFields(expectedCase);

  const answerAttrCheckRequired = expectedAttrs.length > 0;
  const answerFieldCheckRequired = expectedFields.length > 0;
  const answerBehaviorCheckRequired = Boolean(expectedCase.expected_behavior);

  return {
    question_id: expectedCase.question_id,

    expected_tool: expectedCase.expected_tool,
    predicted_tool: prediction?.predicted_tool ?? null,
    tool_correct: toolCorrect,

    expected_params: expectedCase.expected_params,
    predicted_params: prediction?.predicted_params ?? null,
    tool_arguments_correct: paramComparison.correct,
    param_checks: paramComparison.checks,

    requires_entity_id_normalization:
      expectedCase.requires_entity_id_normalization ?? false,

    expected_attrs: expectedAttrs,
    expected_fields: expectedFields,
    expected_behavior: expectedCase.expected_behavior ?? null,

    answer_attr_check_required: answerAttrCheckRequired,
    answer_field_check_required: answerFieldCheckRequired,
    answer_behavior_check_required: answerBehaviorCheckRequired,

    answer_level_scoring_status:
      answerAttrCheckRequired ||
      answerFieldCheckRequired ||
      answerBehaviorCheckRequired
        ? "not_evaluated_in_tool_selection_phase"
        : "not_required",

    all_tool_level_correct: toolCorrect && paramComparison.correct
  };
});

const total = rows.length;

const toolCorrect = rows.filter((row) => row.tool_correct).length;
const toolArgsCorrect = rows.filter((row) => row.tool_arguments_correct).length;
const allToolLevelCorrect = rows.filter((row) => row.all_tool_level_correct).length;

const answerAttrCheckRequired = rows.filter(
  (row) => row.answer_attr_check_required
).length;

const answerFieldCheckRequired = rows.filter(
  (row) => row.answer_field_check_required
).length;

const answerBehaviorCheckRequired = rows.filter(
  (row) => row.answer_behavior_check_required
).length;

const normalizationCases = rows.filter(
  (row) => row.requires_entity_id_normalization
);

const normalizationCorrect = normalizationCases.filter((row) => {
  const entityIdCheck = row.param_checks.find((check) => check.key === "entityId");
  return entityIdCheck?.correct === true;
}).length;

const summary = {
  predictions_file: predictionsPath,
  total,

  tool_accuracy: toolCorrect / total,
  tool_argument_accuracy: toolArgsCorrect / total,
  exact_tool_and_arguments_accuracy: allToolLevelCorrect / total,

  tool_correct: toolCorrect,
  tool_arguments_correct: toolArgsCorrect,
  all_tool_level_correct: allToolLevelCorrect,

  normalization_cases: normalizationCases.length,
  normalization_accuracy:
    normalizationCases.length > 0
      ? normalizationCorrect / normalizationCases.length
      : null,
  normalization_correct: normalizationCorrect,

  answer_level_checks_required: {
    attr_checks: answerAttrCheckRequired,
    field_checks: answerFieldCheckRequired,
    behavior_checks: answerBehaviorCheckRequired
  },

  note:
    "This scorer evaluates tool selection and tool arguments only. Attribute, field, and behavior checks require a later answer-level benchmark phase."
};

const output = {
  summary,
  rows
};

const outPath = `benchmarks/results/scores_${Date.now()}.json`;
writeFileSync(outPath, JSON.stringify(output, null, 2));

console.log(JSON.stringify(summary, null, 2));
console.log(`Wrote detailed scores to ${outPath}`);