import assert from "node:assert/strict";
import { runUnexpectedCasesEvaluation } from "../src/evaluation/unexpectedEval";

async function main() {
  const report = await runUnexpectedCasesEvaluation();

  console.log(
    `[backend/tests/unexpected_eval.test.ts] YAML Baseline Recall=${(report.yamlBaseline.recall * 100).toFixed(0)}% | Agent Recall=${(report.agentDetector.recall * 100).toFixed(0)}%, Precision=${(report.agentDetector.precision * 100).toFixed(0)}%, FP=${report.agentDetector.falsePositives}`
  );

  assert.equal(report.totalRows, 30);
  assert.equal(report.totalUnexpectedErrors, 10);
  assert.equal(report.yamlBaseline.truePositives, 0, "Les règles YAML ne doivent pas couvrir ces 10 cas imprévus");
  assert.equal(report.agentDetector.truePositives, 10);
  assert.equal(report.agentDetector.falsePositives, 0);
  assert.equal(report.agentDetector.precision, 1);
  assert.equal(report.agentDetector.recall, 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
