import { readFileSync } from 'node:fs';
import { evaluateRanking, parseLabelJsonl, assertDisjointSplit } from './rankingEvaluation.js';

const [labelsPath, kArg, testPath] = process.argv.slice(2);
if (!labelsPath || !kArg || !Number.isSafeInteger(Number(kArg)) || Number(kArg) < 1) {
  console.error('Usage: bun src/modules/evaluation/runEvaluation.ts labels.jsonl K [held-out-test.jsonl]');
  process.exitCode = 2;
} else {
  const labels = parseLabelJsonl(readFileSync(labelsPath, 'utf8'));
  if (testPath) {
    const test = parseLabelJsonl(readFileSync(testPath, 'utf8'));
    assertDisjointSplit(labels, test);
    console.log(JSON.stringify(evaluateRanking(test, Number(kArg)), null, 2));
  } else console.log(JSON.stringify(evaluateRanking(labels, Number(kArg)), null, 2));
}
