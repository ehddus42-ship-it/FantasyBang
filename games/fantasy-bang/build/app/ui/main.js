import { CARD_TYPES, ROLE_LABELS, getState, legalActions, newGame, result } from '../core/index.js';
import { createLocalTransport } from '../core/transport.js';
import { chooseAction } from '../sim/policies.js';
import { setMuted, sound } from './audio.js';

const app = document.querySelector('#app');
let transport;
let viewerSeat = 0;
let selectedCard = null;
let modal = null;
let toastText = '';
let aiTimer = null;
let reduced = localStorage.getItem('rune-reduced') === '1';
let muted = localStorage.getItem('rune-muted') === '1';
let fontScale = Number(localStorage.getItem('rune-font') || 1);
setMuted(muted);
document.documentElement.style.setProperty('--scale', fontScale);
if (reduced) document.documentElement.classList.add('reduced');

const runtimeMetrics = { paintMs: [], longTasks: [] };
function publishRuntimeMetrics() {
  document.documentElement.dataset.runeMetrics = JSON.stringify(runtimeMetrics);
}
if ('PerformanceObserver' in globalThis) {
  try {
    new PerformanceObserver(list => {
      runtimeMetrics.longTasks.push(...list.getEntries().map(entry => Math.round(entry.duration * 10) / 10));
      runtimeMetrics.longTasks = runtimeMetrics.longTasks.slice(-40);
      publishRuntimeMetrics();
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* Long Task API is optional. */ }
}
document.addEventListener('click', () => {
  const started = performance.now();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    runtimeMetrics.paintMs.push(Math.round((performance.now() - started) * 10) / 10);
    runtimeMetrics.paintMs = runtimeMetrics.paintMs.slice(-40);
    publishRuntimeMetrics();
  }));
}, true);
publishRuntimeMetrics();

const icons = { slash: '◆⚔', ward: '⬡', heal: '☾', focus: '◎', cut: '▱', steal: '⌁', duel: '⚔', storm: '✦', foresight: '✧' };
const descriptions = {
  slash: '사거리 안 한 영웅을 겨눈다.', ward: '참격을 즉시 막는다.', heal: '거리 1의 인장 하나를 살린다.',
  focus: '사거리를 바꾸는 유물을 장비한다.', cut: '장비나 무작위 손패를 끊는다.', steal: '가까운 손패 하나를 가져온다.',
  duel: '참격을 번갈아 버리는 결투다.', storm: '모두 참격을 버리거나 피해를 받는다.', foresight: '주문 두 장을 더 본다.'
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function heroImage(id) {
  const file = id === 'miriel' ? 'mirel' : id;
  return new URL(`../../../../../assets/heroes/${file}.png`, import.meta.url).href;
}

function showToast(text, kind = 'select') {
  toastText = text;
  sound(kind);
  render();
  setTimeout(() => { if (toastText === text) { toastText = ''; render(); } }, reduced ? 250 : 900);
}

function titleScreen() {
  app.innerHTML = `<main class="screen title">
    <section class="title-box" aria-labelledby="game-title">
      <div class="crown" aria-hidden="true">♛</div>
      <p class="eyebrow">네 개의 봉인 · 하나의 왕관</p>
      <h1 id="game-title">룬 크라운<br>그림자 맹세</h1>
      <p class="subtitle">공격도 구원도 충성의 증거가 된다.</p>
      <label>의식 시드 <input id="seed" value="moon-042" maxlength="32"></label>
      <p><button class="primary" id="summon">영웅을 소환한다</button></p>
      <button id="open-rules">규칙을 읽는다</button>
    </section>
  </main>${modalHtml()}`;
  document.querySelector('#summon').addEventListener('click', () => begin(document.querySelector('#seed').value || 'moon-042'));
  document.querySelector('#open-rules').addEventListener('click', () => { modal = 'rules'; titleScreen(); });
  bindModal();
}

function begin(seed) {
  transport = createLocalTransport(newGame(seed));
  viewerSeat = 0;
  modal = 'oath';
  sound('play');
  render();
}

function currentActor(g) { return g.phase === 'reaction' ? g.pending.target : g.turnSeat; }

function act(action) {
  const g = transport.raw();
  const seat = currentActor(g);
  const before = g.actionLog.length;
  const outcome = transport.send(seat, action);
  if (!outcome.ok) { showToast(outcome.reason === 'VERSION_CONFLICT' ? '룬이 어긋났다. 최신 판을 다시 읽는다.' : '그 행동은 지금 쓸 수 없다.'); return; }
  selectedCard = null;
  const after = transport.raw();
  const latest = after.actionLog.at(-1);
  if (after.over) { modal = 'result'; sound(after.winners.includes(viewerSeat) ? 'victory' : 'damage'); }
  else if (latest && after.actionLog.length > before) sound(latest.type === 'damage' ? 'damage' : latest.type === 'ward' ? 'ward' : 'play');
  render();
}

function scheduleAi() {
  clearTimeout(aiTimer);
  if (!transport) return;
  const g = transport.raw();
  if (g.over || modal) return;
  const actor = currentActor(g);
  if (g.players[actor].controller !== 'ai') return;
  aiTimer = setTimeout(() => {
    const action = chooseAction(transport.raw(), 'baseline-recommended');
    if (action) act(action);
  }, reduced ? 80 : 420);
}

function seatHtml(p, state, targetSeats) {
  const hearts = '◆'.repeat(Math.max(0, p.hp)) + '◇'.repeat(Math.max(0, p.maxHp - p.hp));
  return `<article class="seat ${state.turnSeat === p.seat ? 'current' : ''} ${targetSeats.has(p.seat) ? 'targetable' : ''} ${p.alive ? '' : 'dead'}" data-seat="${p.seat}" aria-label="${p.hero.name}, 생명력 ${p.hp}">
    <img class="portrait" src="${heroImage(p.hero.id)}" alt="${p.hero.name} 초상" data-fallback="${p.hero.name.slice(0,1)}">
    <div class="seat-info"><h2>${p.hero.name}</h2>
      <div class="hp" aria-label="생명력 ${p.hp}/${p.maxHp}">${hearts}</div>
      <div class="meta">손패 ${p.handCount} · 거리 ${p.distanceFromTurn || 0}${p.equipment ? ` · 초점 ${p.equipment.range}` : ''}</div>
      <div class="role">${p.role ? ROLE_LABELS[p.role] : '닫힌 맹세'}</div>
      <span class="controller-badge">${p.controller === 'human' ? '나' : 'AI'}</span>
    </div>
  </article>`;
}

function cardHtml(card) {
  const spec = CARD_TYPES[card.type];
  return `<button class="card ${spec.kind} ${selectedCard === card.id ? 'selected' : ''}" data-card="${card.id}" aria-pressed="${selectedCard === card.id}">
    <span class="rune" aria-hidden="true">${icons[card.type]}</span><strong>${spec.name}</strong><small>${descriptions[card.type]}</small>${card.focus ? `<p>사거리 ${card.focus}</p>` : ''}
  </button>`;
}

function actionLabel(action, state) {
  if (action.type === 'endTurn') return '턴을 넘긴다';
  if (action.type === 'hero') return '영웅 능력을 쓴다';
  if (action.type === 'discard') return `${CARD_TYPES[state.private.hand.find(c => c.id === action.cardId)?.type]?.name ?? '카드'}를 흘린다`;
  if (action.type === 'react') return action.useWard ? '결계를 펼친다' : '받아낸다';
  if (action.target != null) return `${state.players[action.target].hero.name}에게 ${CARD_TYPES[state.private.hand.find(c => c.id === action.cardId)?.type]?.verb ?? '쓴다'}`;
  return `${CARD_TYPES[state.private.hand.find(c => c.id === action.cardId)?.type]?.verb ?? '카드를 쓴다'}`;
}

function render() {
  if (!transport) return titleScreen();
  const g = transport.raw();
  const state = getState(g, viewerSeat);
  const actor = currentActor(g);
  const canAct = g.players[actor].controller === 'human' && actor === viewerSeat && !modal;
  const legal = legalActions(g);
  const shownActions = legal.filter(a => a.type === 'endTurn' || a.type === 'hero' || a.type === 'react' || a.type === 'discard' || (a.type === 'play' && a.cardId === selectedCard));
  const targetSeats = new Set(shownActions.filter(a => a.type === 'play' && a.target != null).map(a => a.target));
  const waitingMessage = state.phase === 'reaction'
    ? `${state.players[actor].hero.name}가 결계 또는 피해를 고른다.`
    : '룬이 다음 선택을 기다린다.';
  app.innerHTML = `<a class="skip" href="#hand">손패로 건너뛴다</a><main class="screen game">
    <header class="topbar"><h1>룬 크라운 · ${escapeHtml(state.seed)}</h1>
      <span class="private-view" aria-label="비공개 플레이어 시점">나의 비공개 시점</span>
      <button id="rules">규칙을 연다</button><button id="sound" aria-pressed="${muted}">${muted ? '소리를 켠다' : '소리를 끈다'}</button><button id="access">접근성을 연다</button>
    </header>
    <div class="layout">
      <section class="board" aria-label="원형 균열왕좌">${state.players.map(p => seatHtml(p, state, targetSeats)).join('')}
        <div class="crown-center"><div><b aria-hidden="true">♛</b><div>왕관 인장 ${state.crownHp}</div><small>${state.phase === 'reaction' ? '즉시 반응' : `${state.round}라운드 · ${state.totalTurns}턴`}</small></div></div>
      </section>
      <aside class="side"><section class="panel"><h2>나의 맹세 · ${state.private.roleLabel}</h2><p class="goal">${state.private.goal}</p><small>공통: 왕관수호자가 쓰러지거나 적대 맹세가 모두 드러나면 의식이 끝난다.</small></section>
      <section class="panel"><h2>행동 기록</h2><ol class="log">${state.actionLog.slice(-12).reverse().map(e => `<li>${escapeHtml(e.text)}</li>`).join('') || '<li>첫 주문을 기다린다.</li>'}</ol></section></aside>
      <section class="hand-zone" id="hand"><div class="hand-title"><h2>${state.players[viewerSeat].hero.name}의 손패 ${state.private.hand.length}</h2><span>${actor === viewerSeat ? '네 차례' : `${state.players[actor].hero.name}의 차례`}</span></div>
        ${state.totalTurns <= 1 && actor === viewerSeat ? '<p class="first-hint">주문 두 장을 받았다. 빛나는 카드부터 한 장 써 봐.</p>' : ''}
        <div class="cards">${state.private.hand.map(cardHtml).join('') || '<p>손에 남은 주문이 없다.</p>'}</div>
        <div class="actions">${canAct ? shownActions.map((a, i) => `<button data-action="${i}" class="${a.type === 'endTurn' ? '' : 'primary'}">${actionLabel(a, state)}</button>`).join('') : `<span>${waitingMessage}</span>`}</div>
      </section>
    </div>
  </main>${toastText ? `<div class="toast" role="status" aria-live="polite">${escapeHtml(toastText)}</div>` : ''}${modalHtml(state)}`;

  document.querySelectorAll('.portrait').forEach(img => img.addEventListener('error', () => { const box = document.createElement('div'); box.className = 'portrait portrait-fallback'; box.textContent = img.dataset.fallback; box.setAttribute('aria-label', `${img.alt} 대체 실루엣`); img.replaceWith(box); }, { once: true }));
  document.querySelectorAll('[data-card]').forEach(button => button.addEventListener('click', () => { if (!canAct) return; selectedCard = selectedCard === button.dataset.card ? null : button.dataset.card; sound('select'); render(); }));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => act(shownActions[Number(button.dataset.action)])));
  document.querySelector('#rules').addEventListener('click', () => { modal = 'rules'; render(); });
  document.querySelector('#access').addEventListener('click', () => { modal = 'access'; render(); });
  document.querySelector('#sound').addEventListener('click', () => { muted = !muted; localStorage.setItem('rune-muted', muted ? '1' : '0'); setMuted(muted); render(); });
  bindModal();
  scheduleAi();
}

function modalHtml(state) {
  if (!modal) return '';
  if (modal === 'rules') return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="rules-title"><section class="modal-card rules"><h2 id="rules-title">균열왕좌의 규칙</h2><p><b>뽑기 → 행동 → 반응 → 정리.</b> 자기 턴에 주문 두 장을 받고, 카드를 쓰고, 생명력만큼 손패를 남겨.</p><p>참격은 기본 거리 1에 닿아. 마도초점은 먼 좌석을 열어. 피해를 받으면 생명력과 턴 종료 손패 한도가 함께 줄어.</p><p>왕관수호자는 공개돼. 나머지 맹세는 추방될 때 드러나. 공격과 지원 기록을 읽고 편을 가려.</p><p>키보드는 Tab으로 카드와 버튼을 옮기고 Enter 또는 Space로 선택해.</p><button data-close>판으로 돌아간다</button></section></div>`;
  if (modal === 'access') return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="access-title"><section class="modal-card"><h2 id="access-title">접근성</h2><label><input id="reduced" type="checkbox" ${reduced ? 'checked' : ''}> 움직임 줄이기</label><p>글자 크기</p><div class="actions"><button data-font="1">글자를 100%로 맞춘다</button><button data-font="1.15">글자를 115%로 늘린다</button><button data-font="1.3">글자를 130%로 늘린다</button></div><p>색 외에도 아이콘·테두리·동사로 카드 기능을 구분해.</p><button data-close>판으로 돌아간다</button></section></div>`;
  if (modal === 'oath' && state) return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="oath-title"><section class="modal-card"><div class="role-seal" aria-hidden="true">◉</div><h2 id="oath-title">너는 ${state.players[viewerSeat].hero.name}. 균열왕좌에 소환됐다.</h2><h3>${state.private.roleLabel}</h3><p>${state.private.goal}</p><p><b>왕관수호자가 쓰러지면 즉시 승패를 가른다. 적대 맹세가 모두 드러나도 의식은 끝난다.</b></p><button class="primary" data-close>맹세를 품는다</button></section></div>`;
  if (modal === 'result' && state) { const r = result(transport.raw()); const won = r.winners.includes(viewerSeat); return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><section class="modal-card result"><div class="role-seal" aria-hidden="true">${won ? '♛' : '◇'}</div><h2 id="result-title">${won ? '왕관이 네 맹세를 골랐다' : '네 맹세가 왕관에서 멀어졌다'}</h2><p>${escapeHtml(r.reason)}</p><p>${r.turns}턴 · 승리 진영 ${ROLE_LABELS[r.outcome] ?? r.outcome}</p><div class="actions"><button class="primary" data-restart="same">같은 시드로 다시 맞선다</button><button data-restart="new">새 의식을 연다</button></div></section></div>`; }
  return '';
}

function bindModal() {
  document.querySelector('[data-close]')?.addEventListener('click', () => { modal = null; if (transport) render(); else titleScreen(); });
  document.querySelector('#reduced')?.addEventListener('change', e => { reduced = e.target.checked; localStorage.setItem('rune-reduced', reduced ? '1' : '0'); document.documentElement.classList.toggle('reduced', reduced); });
  document.querySelectorAll('[data-font]').forEach(button => button.addEventListener('click', () => { fontScale = Number(button.dataset.font); localStorage.setItem('rune-font', fontScale); document.documentElement.style.setProperty('--scale', fontScale); }));
  document.querySelectorAll('[data-restart]').forEach(button => button.addEventListener('click', () => { const old = transport.raw(); const seed = button.dataset.restart === 'same' ? old.seed : `${old.seed}-${old.stateVersion}`; transport = createLocalTransport(newGame(seed, { controllers: old.players.map(p => p.controller) })); modal = 'oath'; render(); }));
}

titleScreen();
