import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  evaluateDataset,
  EvaluationDatasetValidationError,
  EvaluationVersionMismatchError,
  parseEvaluationDataset,
} from "../src/modules/evaluation";

interface CliOptions {
  datasetPath: string;
  outputPath: string;
  failOnGate: "none" | "offline" | "overall";
}

function parseArguments(values: string[]): CliOptions {
  let datasetPath = "";
  let outputPath = "";
  let failOnGate: CliOptions["failOnGate"] = "none";
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--dataset") datasetPath = values[++index] ?? "";
    else if (value === "--out") outputPath = values[++index] ?? "";
    else if (value === "--fail-on-offline-gate") failOnGate = "offline";
    else if (value === "--fail-on-overall-gate") failOnGate = "overall";
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  if (!datasetPath || !outputPath) throw new Error("REQUIRED_ARGUMENT_MISSING");
  return { datasetPath, outputPath, failOnGate };
}

function percentage(value: number | null): string {
  return value === null ? "N/A" : `${(value * 100).toFixed(1)}%`;
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const datasetPath = path.resolve(options.datasetPath);
  const outputPath = path.resolve(options.outputPath);
  const source = await readFile(datasetPath, "utf8");
  const fingerprint = createHash("sha256").update(source).digest("hex");
  let input: unknown;
  try {
    input = JSON.parse(source) as unknown;
  } catch {
    throw new Error("DATASET_JSON_INVALID");
  }
  const dataset = parseEvaluationDataset(input);
  const report = evaluateDataset(dataset, {
    datasetFingerprint: fingerprint,
    evaluatedAt: new Date().toISOString(),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Evaluation dataset: ${report.datasetId}@${report.datasetVersion}`);
  console.log(`Cases: ${report.metrics.caseCount}`);
  console.log(`Top 5 hit rate: ${percentage(report.metrics.top5.rate)}`);
  console.log(
    `High-confidence precision: ${percentage(report.metrics.highConfidencePrecision.rate)}`,
  );
  console.log(`Offline gate: ${report.gates.offlinePassed ? "PASS" : "FAIL"}`);
  console.log(`Overall gate: ${report.gates.overallPassed ? "PASS" : "FAIL"}`);
  console.log(`Report: ${outputPath}`);

  const selectedGatePassed = options.failOnGate === "offline"
    ? report.gates.offlinePassed
    : report.gates.overallPassed;
  if (options.failOnGate !== "none" && !selectedGatePassed) process.exitCode = 2;
}

main().catch((error: unknown) => {
  if (error instanceof EvaluationDatasetValidationError) {
    console.error("Evaluation failed: EVALUATION_DATASET_INVALID");
    for (const issue of error.issues) console.error(`- ${issue}`);
  } else if (error instanceof EvaluationVersionMismatchError) {
    console.error("Evaluation failed: EVALUATION_VERSION_MISMATCH");
    for (const mismatch of error.mismatches) console.error(`- ${mismatch}`);
  } else {
    const code = error instanceof Error ? error.message : "EVALUATION_FAILED";
    console.error(`Evaluation failed: ${code}`);
  }
  process.exitCode = 1;
});
