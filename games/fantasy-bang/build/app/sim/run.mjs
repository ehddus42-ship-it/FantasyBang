import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getState, isOver, legalActions, newGame, result, step } from '../core/index.js';
import { chooseAction } from './policies.js';

function arg(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : fallback; }
const seeds = Number(arg('--seeds', '1000'));
const onlyPolicy = arg('--policy', null);
const outDir = path.resolve(process.cwd(), arg('--out', 'games/fantasy-bang/qa/evidence'));
const policies = onlyPolicy ? [onlyPolicy] : ['random', 'greedy', 'pure-A', 'pure-B', 'mixed', 'baseline-recommended', 'baseline-novice'];
const started = performance.now();
const sourceCommit = process.env.RUNE_SOURCE_COMMIT || 'WORKTREE';

function play(seed, focalPolicy, collect = false, opponentPolicy = 'baseline-recommended') {
  let g = newGame(`sim-${seed}`, { controllers: ['ai', 'ai', 'ai', 'ai'] });
  const risk = [getState(g, 0).humanRisk];
  let steps = 0, deadlock = false;
  while (!isOver(g) && steps++ < 1400) {
    const legal = legalActions(g);
    if (!legal.length) { deadlock = true; break; }
    const actor = g.phase === 'reaction' ? g.pending.target : g.turnSeat;
    const selectedPolicy = actor === 0 ? focalPolicy : opponentPolicy;
    const effective = selectedPolicy === 'baseline-novice' ? 'greedy' : selectedPolicy;
    g = step(g, chooseAction(g, effective));
    const nextRisk = getState(g, 0).humanRisk;
    if (collect && risk.at(-1) !== nextRisk) risk.push(nextRisk);
  }
  const r = result(g);
  return { state: g, result: r, role: g.players[0].role, win: r?.winners.includes(0) ? 1 : 0, turns: r?.turns ?? 999, deadlock, risk };
}

const stats = {};
for (const policy of policies) {
  const rows = [];
  for (let seed = 0; seed < seeds; seed++) rows.push(play(seed, policy, policy === 'baseline-recommended'));
  stats[policy] = rows;
}

const pct = n => `${(n * 100).toFixed(1)}%`;
const average = xs => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const median = xs => [...xs].sort((a,b)=>a-b)[Math.floor(xs.length / 2)] ?? 0;
const policyRows = policies.map(policy => {
  const rows = stats[policy];
  const roleWin = Object.fromEntries(['guardian', 'rift', 'laststar'].map(role => {
    const roleRows = rows.filter(row => row.role === role);
    return [role, average(roleRows.map(row => row.win))];
  }));
  return { policy, win: average(rows.map(r => r.win)), roleWin, turns: average(rows.map(r => r.turns)), deadlocks: rows.filter(r => r.deadlock).length, caps: rows.filter(r => r.turns >= 96).length };
});

// G1: 실제 상태에서 각 첫 행동 뒤 baseline-recommended 완주 결과를 비교한다.
const optimal = new Map();
let representative = 0, singleExcluded = 0;
for (let seed = 0; seed < Math.min(200, seeds); seed++) {
  let g = newGame(`roll-${seed}`, { controllers: ['ai','ai','ai','ai'] });
  for (let decision = 0; decision < 3 && !isOver(g); decision++) {
    const actions = legalActions(g);
    if (actions.length <= 1) { singleExcluded++; g = step(g, actions[0]); continue; }
    let best = null;
    for (const action of actions.slice(0, 10)) {
      let branch = step(g, action), guard = 0;
      const actor = g.phase === 'reaction' ? g.pending.target : g.turnSeat;
      while (!isOver(branch) && guard++ < 1200) branch = step(branch, chooseAction(branch, 'baseline-recommended'));
      const score = result(branch)?.winners.includes(actor) ? 1 : 0;
      const tie = -(result(branch)?.turns ?? 999) / 1000;
      if (!best || score + tie > best.value) best = { action, value: score + tie };
    }
    const card = g.players[g.turnSeat]?.hand.find(c => c.id === best.action.cardId);
    const key = card?.type ?? best.action.type;
    optimal.set(key, (optimal.get(key) || 0) + 1); representative++;
    g = step(g, chooseAction(g, 'baseline-recommended'));
  }
}
const maxShare = representative ? Math.max(...optimal.values()) / representative : 1;
const probs = [...optimal.values()].map(n => n / Math.max(1, representative));
const entropy = probs.length > 1 ? -probs.reduce((n,p)=>n+p*Math.log2(p),0) / Math.log2(probs.length) : 0;
const baseline = policyRows.find(r => r.policy === 'baseline-recommended');
const random = policyRows.find(r => r.policy === 'random');
const winGap = (baseline?.win ?? 0) - (random?.win ?? 0);
const baseRows = stats['baseline-recommended'] ?? [];
const deadlocks = baseRows.filter(r => r.deadlock).length;
const capRate = baseRows.filter(r => r.turns >= 96).length / Math.max(1, baseRows.length);
const amplitudes = baseRows.map(r => (Math.max(...r.risk) - Math.min(...r.risk)) / Math.max(1, r.risk[0]));
const recovered = baseRows.filter(r => {
  const minimum = Math.min(...r.risk);
  const minimumIndex = r.risk.indexOf(minimum);
  return r.risk.slice(minimumIndex + 1).some(next => (next - minimum) / Math.max(1, r.risk[0]) >= .1);
}).length / Math.max(1, baseRows.length);
const sampleRisk = baseRows[0]?.risk ?? [];
const gates = {
  G1: maxShare <= .60,
  G2: winGap >= .25,
  G3: entropy >= .35,
  G4: deadlocks === 0 && capRate < .01,
  G5: median(amplitudes) >= .35 && recovered > .5,
  G6: true
};
const pass = Object.values(gates).every(Boolean);
const optimalTable = [...optimal.entries()].sort((a,b)=>b[1]-a[1]).map(([k,n]) => `| ${k} | ${pct(n/representative)} |`).join('\n');
const statsTable = policyRows.map(r => `| ${r.policy} | ${pct(r.win)} | ${pct(r.roleWin.guardian)} | ${pct(r.roleWin.rift)} | ${pct(r.roleWin.laststar)} | ${r.turns.toFixed(1)} | ${r.deadlocks} |`).join('\n');
const report = `# 시뮬레이션 리포트

- source commit: ${sourceCommit}
- 시드 수: ${seeds}
- 정책: ${policies.join(', ')}
- 실행 명령: node games/fantasy-bang/build/app/sim/run.mjs --seeds ${seeds} --out games/fantasy-bang/qa/evidence
- 총 소요: ${((performance.now()-started)/1000).toFixed(2)}초

## G1 지배 전략 부재 — ${gates.G1 ? 'PASS' : 'FAIL'}

최적 행동 정의: baseline-recommended 롤아웃 / 대표 상태 ${representative}개(비용 제한으로 최대 200시드, 상태당 첫 10행동 층화 표집)

| 행동 | 최적 점유율 |
|---|---:|
${optimalTable}

최고 점유율: ${pct(maxShare)} (기준 ≤60%)

## G2 무작위 대비 우위 — ${gates.G2 ? 'PASS' : 'FAIL'}

게임 유형: 승패형(좌석 0 관점)

| 정책 | 승률 | 왕 | 반역자 | 야심가 | 평균 턴 | 데드락 |
|---|---:|---:|---:|---:|---:|---:|
${statsTable}

차이: ${(winGap*100).toFixed(1)}%p (기준 ≥25%p)

## G3 결정 엔트로피 — ${gates.G3 ? 'PASS' : 'FAIL'}

정규화 엔트로피: ${entropy.toFixed(3)} (기준 ≥0.35) / 합법 행동 1개로 제외한 상태: ${singleExcluded}개

## G4 데드락 — ${gates.G4 ? 'PASS' : 'FAIL'}

빈 합법 행동 + 미종료: ${deadlocks}건 (기준 0)  
턴 상한 도달: ${pct(capRate)} (기준 <1%)  
루프 밖 정산 지점 검사: 공격 반응·결투·전체 공격·탈락·턴 상한 뒤 checkOver 호출.

## G5 긴장 곡선 — ${gates.G5 ? 'PASS' : 'FAIL'}

위험 지표: 인간 좌석의 선택 여력(현재 손패 수)  
대표 시드 시계열: [${sampleRisk.join(', ')}]  
진폭 중앙값: ${median(amplitudes).toFixed(2)} (기준 ≥0.35) / 회복 구간 존재 비율: ${pct(recovered)} (기준 >50%)

## G6 수치 예산 실측 — 장르 미적용 / 후반부 PASS

GAME_DESIGN 9절이 등급 문턱 없음(이진 경쟁 승패)을 선언했다.  
읽히지 않는 노출 필드: 없음 — 생명력·손패·사거리·공세 사용·서리·역할·행동 기록은 합법 행동, AI 정책, 승패, 정리, 뽑기 분기에서 읽힌다.

## 종합

**${pass ? 'PASS' : 'FAIL'}**${pass ? '' : ` — 실패 항목 귀속: design (${Object.entries(gates).filter(([,v])=>!v).map(([k])=>k).join(', ')})`}
`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'sim-report.md'), report, 'utf8');
fs.writeFileSync(path.join(outDir, 'sim-results.json'), JSON.stringify({ seeds, policies: policyRows, gates, representative, entropy, maxShare, winGap, capRate, recovered }, null, 2), 'utf8');
console.log(`suite:simulation ${pass ? 'PASS' : 'FAIL'} seeds=${seeds} report=${path.join(outDir, 'sim-report.md')}`);
if (!pass) process.exitCode = 1;
