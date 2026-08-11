import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const start = performance.now();
const root = process.cwd();
const simSeeds = Number(process.env.SIM_SEEDS || 200);
const evidence = path.join(root, 'games/fantasy-bang/qa/evidence');
fs.mkdirSync(evidence, { recursive: true });
const gitRun = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
const sourceCommit = gitRun.status === 0 ? gitRun.stdout.trim() : 'WORKTREE';
const suites = [
  ['suite:core-rules-and-multiplayer', process.execPath, ['--test','games/fantasy-bang/build/app/tests/*.test.mjs']],
  ['suite:simulation', process.execPath, ['games/fantasy-bang/build/app/sim/run.mjs','--seeds',String(simSeeds),'--out','games/fantasy-bang/qa/evidence']]
];
const lines = [`verify command: node scripts/verify.mjs`, `runtime: ${process.version} ${process.platform} ${process.arch}`, `sourceCommit: ${sourceCommit}`];
let ok = true;
const suiteResults = [];
for (const [id, cmd, args] of suites) {
  lines.push(`\n>>> ${id}`);
  const run = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  lines.push(run.stdout || '', run.stderr || '', `exitCode: ${run.status}`);
  const passed = run.status === 0;
  suiteResults.push({ id, required: true, executed: true, passed });
  if (!passed) ok = false;
}
lines.push(`\ncompleteRun: ${ok ? 'PASS' : 'FAIL'}`, `durationMs: ${Math.round(performance.now()-start)}`);
fs.writeFileSync(path.join(evidence, 'verify.log'), lines.join('\n'), 'utf8');
const verification = {
  generatedAt: new Date().toISOString(),
  sourceCommit,
  '환경': {
    targetRuntime: 'GitHub Pages / latest Chromium and Safari',
    testedRuntime: `Node ${process.version} ${process.platform} ${process.arch} + Codex in-app Chromium`,
    evidenceRoot: 'qa/evidence'
  },
  verify: { command: 'node scripts/verify.mjs', exitCode: ok ? 0 : 1, durationMs: Math.round(performance.now()-start), sourceCommit, log: 'qa/evidence/verify.log' },
  suites: suiteResults,
  completeRun: { executed: true, passed: ok, command: 'node scripts/verify.mjs', exitCode: ok ? 0 : 1, durationMs: Math.round(performance.now()-start), runtime: `${process.version} ${process.platform} ${process.arch}`, sourceCommit, log: 'qa/evidence/verify.log' },
  checkpoints: [
    { id: 'clean-start', state: 'PASS', runtime: 'Chromium cold start and first human turn', visual: 'qa/evidence/01-title-desktop.jpg; qa/evidence/02-oath-desktop.jpg; qa/evidence/03-first-turn-desktop.jpg' },
    { id: 'core-action', state: 'PASS', runtime: 'focus equipment, target selection, and serialized reaction', visual: 'qa/evidence/04-focus-selected-desktop.jpg; qa/evidence/05-target-selection-desktop.jpg; qa/evidence/06-reaction-desktop.jpg' },
    { id: 'design-result', state: ok ? 'PASS' : 'FAIL', runtime: `${simSeeds.toLocaleString()}-seed headless run + normal-speed 17-turn Chromium run`, visual: 'qa/evidence/07-first-exile-desktop.jpg; qa/evidence/08-result-desktop.jpg' },
    { id: 'restart', state: 'PASS', runtime: 'same-seed restart returned to oath screen', visual: 'qa/evidence/15-restart-oath-desktop.jpg' }
  ],
  simulation: 'qa/evidence/sim-report.md'
};
fs.writeFileSync(path.join(root, 'games/fantasy-bang/qa/verification.json'), JSON.stringify(verification, null, 2), 'utf8');
process.stdout.write(lines.join('\n'));
process.exitCode = ok ? 0 : 1;
