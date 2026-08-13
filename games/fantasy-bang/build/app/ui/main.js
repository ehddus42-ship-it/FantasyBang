import { CARD_TYPES, ROLE_LABELS, getState, legalActions, newGame, result } from '../core/index.js?v=20260812-cf2';
import { createLocalTransport } from '../core/transport.js?v=20260812-cf2';
import { createCloudflareTransport } from '../core/cloudflare-transport.js?v=20260812-cf2';
import { chooseAction } from '../sim/policies.js?v=20260812-cf2';
import { setMuted, sound } from './audio.js';

const app = document.querySelector('#app');
let transport;
let viewerSeat = 0;
let selectedCard = null;
let modal = null;
let toastText = '';
let onlineNotice = '';
let pendingPlayerCount = 4; // 방 만드는 중 titleScreen()이 다시 그려져도(알림 갱신 등) 방금 고른 값이 유지되도록.
let pendingHumanSeats = null; // null이면 populateHumanSeatOptions()가 총 인원과 같은 값(=전원 사람)을 기본값으로 쓴다.
let currentRoomId = null; // 로비 화면에서 방 코드를 보여주고 복사할 때 쓴다.
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
  slash: '거리 안의 상대 1명을 공격한다.', ward: '받는 공격 1회를 막는다.', heal: '거리 1 안의 생명력을 1 회복한다.',
  focus: '공격 사거리를 2 또는 3으로 바꾼다.', cut: '상대 장비 또는 카드 1장을 파괴한다.', steal: '가까운 상대 카드 1장을 훔친다.',
  duel: '서로 공격 카드를 내고 먼저 못 낸 쪽이 피해를 받는다.', storm: '다른 모두가 공격 카드를 버리거나 피해를 받는다.', foresight: '카드 2장을 더 뽑는다.'
};

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[c]));
}

function heroImage(id) {
  const file = id === 'miriel' ? 'mirel' : id;
  return new URL(`../../../../../assets/heroes/${file}.jpg`, import.meta.url).href;
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
      <p class="eyebrow">3~6인 비밀 역할 카드전</p>
      <h1 id="game-title">반역</h1>
      <p class="subtitle">왕을 지킬 것인가, 쓰러뜨릴 것인가.</p>
      <div class="title-options"><label>플레이 인원 <select id="player-count">${[3, 4, 5, 6].map(n => `<option value="${n}" ${n === pendingPlayerCount ? 'selected' : ''}>${n === 3 ? '3인 특수전' : `${n}인`}</option>`).join('')}</select></label>
      <label>게임 시드 <input id="seed" value="game-042" maxlength="32"></label></div>
      <p class="player-note">3인은 공개 역할 특수전 · 4인은 부관 없음 · 5인부터 부관 참가</p>
      <p><button class="primary" id="summon">게임 시작 (혼자 + AI)</button></p>
      <div class="online-box">
        <p class="online-note">온라인 방 (베타) · 같은 방 코드로 다른 사람과 함께 플레이해.</p>
        <p><label>사람 자리 <select id="human-seats"></select></label></p>
        <p class="online-note">고른 인원만큼 사람 자리가 열려. 나머지는 처음부터 AI가 앉아.</p>
        <p><button id="create-room">온라인 방 만들기</button></p>
        <p class="join-row"><input id="join-code" placeholder="방 코드 입력" maxlength="16"><button id="join-room">입장</button></p>
        ${onlineNotice ? `<p class="online-status" role="status">${escapeHtml(onlineNotice)}</p>` : ''}
      </div>
      <button id="open-rules">규칙 보기</button>
    </section>
  </main>${modalHtml()}`;
  document.querySelector('#summon').addEventListener('click', () => begin(document.querySelector('#seed').value || 'game-042', Number(document.querySelector('#player-count').value)));
  document.querySelector('#player-count').addEventListener('change', e => { pendingPlayerCount = Number(e.target.value); populateHumanSeatOptions(); });
  populateHumanSeatOptions(pendingHumanSeats);
  document.querySelector('#human-seats').addEventListener('change', e => { pendingHumanSeats = Number(e.target.value); });
  document.querySelector('#create-room').addEventListener('click', () => {
    pendingPlayerCount = Number(document.querySelector('#player-count').value);
    pendingHumanSeats = Number(document.querySelector('#human-seats').value);
    createOnlineRoom(pendingPlayerCount, pendingHumanSeats, document.querySelector('#seed').value || 'game-042');
  });
  document.querySelector('#join-room').addEventListener('click', () => {
    const code = document.querySelector('#join-code').value.trim();
    if (code) joinOnlineRoom(code);
  });
  document.querySelector('#open-rules').addEventListener('click', () => { modal = 'rules'; titleScreen(); });
  bindModal();
}

// 방 만들기 화면에서 "총 인원"을 고르면 "사람 자리" 선택지도 그만큼(1..총 인원)으로 다시 그린다.
// 기본값은 총 인원과 같다(= AI 없이 전원 사람 자리를 기다림, 신고된 버그의 기본 동작을 그대로 고쳐 둔 상태).
// 총 인원을 줄였는데 이전에 골랐던 사람 자리 수가 그보다 크면 총 인원에 맞춰 줄인다.
function populateHumanSeatOptions(preferred) {
  const playerCountSel = document.querySelector('#player-count');
  const humanSeatsSel = document.querySelector('#human-seats');
  if (!playerCountSel || !humanSeatsSel) return;
  const total = Number(playerCountSel.value);
  const prev = preferred ?? (humanSeatsSel.value ? Number(humanSeatsSel.value) : total);
  const clamped = Math.min(Math.max(1, prev), total);
  humanSeatsSel.innerHTML = Array.from({ length: total }, (_, i) => i + 1)
    .map(n => `<option value="${n}" ${n === clamped ? 'selected' : ''}>${n}명${n < total ? ` · AI ${total - n}명` : ' · AI 없음'}</option>`)
    .join('');
}

function begin(seed, playerCount = 4) {
  transport = createLocalTransport(newGame(seed, { playerCount }));
  viewerSeat = 0;
  modal = 'oath';
  sound('play');
  render();
}

// --- 온라인 방(Cloudflare Durable Object) ------------------------------
// 방 생성/입장까지만 이번 단계 범위다. AI 진행과 규칙 판정은 서버(GameRoom)가 한다.

async function createOnlineRoom(playerCount, humanSeats, seed) {
  onlineNotice = '방을 만드는 중…';
  titleScreen();
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ playerCount, humanSeats, seed })
    });
    if (!res.ok) throw new Error('room-create-failed');
    const { roomId } = await res.json();
    joinOnlineRoom(roomId);
  } catch {
    onlineNotice = '방을 만들지 못했어. 잠시 뒤 다시 시도해줘.';
    titleScreen();
  }
}

function joinOnlineRoom(roomId) {
  currentRoomId = roomId;
  onlineNotice = `${roomId} 방에 접속하는 중…`;
  const savedSeat = localStorage.getItem(`rune-room-seat-${roomId}`);
  const savedToken = localStorage.getItem(`rune-room-token-${roomId}`);
  let gameHasStarted = false; // 로비 -> 실제 게임으로 넘어가는 순간에만 한 번 역할 확인 모달(oath)을 띄운다.
  transport = createCloudflareTransport({
    wsUrl: `/api/rooms/${roomId}/ws`,
    seat: savedSeat != null ? Number(savedSeat) : null,
    token: savedToken || null,
    onSeatAssigned: (seat, token) => {
      viewerSeat = seat;
      localStorage.setItem(`rune-room-seat-${roomId}`, String(seat));
      localStorage.setItem(`rune-room-token-${roomId}`, token);
      history.replaceState(null, '', `?room=${roomId}`);
      onlineNotice = '';
    },
    onRejected: reason => showToast(reason === 'VERSION_CONFLICT' ? '게임 상태가 바뀌었다. 최신 상태를 불러왔다.' : '그 행동은 지금 쓸 수 없다.')
  });
  transport.subscribe(() => {
    if (!gameHasStarted && transport.raw()) { gameHasStarted = true; modal = 'oath'; }
    render();
  });
  render();
}

function currentActor(g) { return g.phase === 'reaction' ? g.pending.target : g.turnSeat; }

function act(action) {
  const g = transport.raw();
  if (!g) return;
  const seat = currentActor(g);
  const before = g.actionLog.length;
  const outcome = transport.send(seat, action);
  if (!outcome.ok) { showToast(outcome.reason === 'VERSION_CONFLICT' ? '게임 상태가 바뀌었다. 최신 상태를 불러왔다.' : '그 행동은 지금 쓸 수 없다.'); return; }
  selectedCard = null;
  const after = transport.raw();
  const latest = after.actionLog.at(-1);
  if (after.over) { modal = 'result'; sound(after.winners.includes(viewerSeat) ? 'victory' : 'damage'); }
  else if (latest && after.actionLog.length > before) sound(latest.type === 'damage' ? 'damage' : latest.type === 'ward' ? 'ward' : latest.type === 'exile' ? 'exile' : 'play');
  render();
}

function scheduleAi() {
  clearTimeout(aiTimer);
  if (!transport || transport.isRemote) return; // 온라인 방에서는 서버(GameRoom)가 AI 턴을 진행시킨다.
  const g = transport.raw();
  if (!g || g.over || modal) return;
  const actor = currentActor(g);
  if (g.players[actor].controller !== 'ai') return;
  aiTimer = setTimeout(() => {
    const action = chooseAction(transport.raw(), 'baseline-recommended');
    if (action) act(action);
  }, reduced ? 80 : 420);
}

function seatHtml(p, state, targetSeats, playerCount) {
  const hearts = '◆'.repeat(Math.max(0, p.hp)) + '◇'.repeat(Math.max(0, p.maxHp - p.hp));
  const targetable = targetSeats.has(p.seat);
  const targetAttrs = targetable ? ` data-target-seat="${p.seat}" role="button" tabindex="0" aria-label="${p.hero.name}을 목표로 선택"` : ` aria-label="${p.hero.name}, 생명력 ${p.hp}"`;
  const angle = Math.PI / 2 - (Math.PI * 2 * p.seat / playerCount);
  const left = (50 + Math.cos(angle) * 33.5).toFixed(2);
  const verticalRadius = playerCount === 6 ? 34.5 : 32;
  const top = (50 + Math.sin(angle) * verticalRadius).toFixed(2);
  return `<article class="seat ${state.turnSeat === p.seat ? 'current' : ''} ${targetable ? 'targetable' : ''} ${p.alive ? '' : 'dead'}" data-seat="${p.seat}" style="left:${left}%;top:${top}%"${targetAttrs}>
    <img class="portrait" src="${heroImage(p.hero.id)}" alt="${p.hero.name} 초상" data-fallback="${p.hero.name.slice(0,1)}">
    <div class="seat-info"><h2>${p.hero.name}</h2>
      <div class="hp" aria-label="생명력 ${p.hp}/${p.maxHp}">${hearts}</div>
      <div class="meta">손패 ${p.handCount} · 거리 ${p.distanceFromTurn || 0}${p.equipment ? ` · 사거리 ${p.equipment.range}` : ''}</div>
      <div class="role">${p.role ? ROLE_LABELS[p.role] : '비공개 역할'}</div>
      <span class="controller-badge">${p.controller === 'human' ? '나' : 'AI'}</span>
    </div>
    ${targetable ? '<span class="target-prompt">목표로 선택</span>' : ''}
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
  if (action.type === 'discard') return `${CARD_TYPES[state.private.hand.find(c => c.id === action.cardId)?.type]?.name ?? '카드'}를 버린다`;
  if (action.type === 'react') return action.useWard ? '방어한다' : '피해를 받는다';
  if (action.target != null) {
    const card = state.private.hand.find(c => c.id === action.cardId);
    const verb = CARD_TYPES[card?.type]?.verb ?? '쓴다';
    const preview = card?.type === 'slash' ? ` · 방어하지 않으면 생명력·손패 한도 ${Math.max(0, state.players[action.target].hp - 1)}` : '';
    return `${state.players[action.target].hero.name}에게 ${verb}${preview}`;
  }
  return `${CARD_TYPES[state.private.hand.find(c => c.id === action.cardId)?.type]?.verb ?? '카드를 쓴다'}`;
}

function publicAiHint(state) {
  const event = [...state.actionLog].reverse().find(entry => entry.actor != null && entry.target != null && state.players[entry.actor]?.controller === 'ai');
  if (!event) return 'AI는 공개된 거리·생명력·최근 행동을 읽고 표적을 고른다.';
  const actorName = state.players[event.actor]?.hero.name ?? 'AI';
  const targetName = state.players[event.target]?.hero.name ?? '표적';
  return `${actorName}는 공개된 거리·생명력·최근 행동을 보고 ${targetName}을 골랐다.`;
}

function render() {
  if (!transport) return titleScreen();
  const g = transport.raw();
  if (!g) {
    // 온라인 방인데 아직 게임이 시작 전이면(사람 자리가 다 안 찼거나 호스트가 시작을 안 눌렀으면)
    // 로비 화면을 보여준다 — 이게 없으면 방 만들자마자 AI로 게임이 시작되던 문제가 다시 생긴다.
    const lobby = transport.lobby?.();
    if (lobby) return lobbyScreen(lobby);
    return titleScreen(); // 그 외엔 서버의 첫 응답이 아직 도착하지 않은 것.
  }
  // 로컬 transport는 getState()로 뷰를 직접 계산한다. 온라인 transport는 서버가 이미
  // 계산해 보낸 privateView를 그대로 쓴다 — 다른 좌석의 손패가 애초에 클라이언트에 없기 때문이다.
  const state = transport.privateView ? transport.privateView() : getState(g, viewerSeat);
  const actor = currentActor(g);
  const canAct = g.players[actor].controller === 'human' && actor === viewerSeat && !modal;
  // legalActions(g)는 "현재 행동자의 실제 손패"가 필요하다. 온라인 transport의 raw()는
  // publicView라 다른 좌석의 손패가 없으므로, 내 차례일 때만 서버가 준 legalActions를 쓴다.
  const legal = !canAct ? [] : (state.legalActions ?? legalActions(g));
  const shownActions = legal.filter(a => a.type === 'endTurn' || a.type === 'hero' || a.type === 'react' || a.type === 'discard' || (a.type === 'play' && a.cardId === selectedCard));
  const targetActions = shownActions.filter(a => a.type === 'play' && a.target != null);
  const directActions = shownActions.filter(a => !(a.type === 'play' && a.target != null));
  const targetSeats = new Set(targetActions.map(a => a.target));
  const targetInstruction = targetActions.length ? '<span class="target-instruction">전장에서 빛나는 목표 캐릭터를 선택해.</span>' : '';
  const waitingMessage = state.phase === 'reaction'
    ? `${state.players[actor].hero.name}가 방어할지 피해를 받을지 고른다.`
    : '다음 행동을 기다리는 중.';
  app.innerHTML = `<a class="skip" href="#hand">손패로 건너뛴다</a><main class="screen game">
    <header class="topbar"><h1>반역 · ${state.players.length}인 · ${escapeHtml(state.seed)}</h1>
      <span class="private-view" aria-label="내 카드만 보는 화면">내 카드만 보는 중</span>
      <button id="rules">규칙</button><button id="sound" aria-pressed="${muted}">${muted ? '소리 켜기' : '소리 끄기'}</button><button id="access">접근성</button>
    </header>
    <div class="layout">
      <section class="board" data-player-count="${state.players.length}" aria-label="${state.players.length}명의 플레이어가 앉은 전장">${state.players.map(p => seatHtml(p, state, targetSeats, state.players.length)).join('')}
        <div class="crown-center"><div><b aria-hidden="true">${state.players.length === 3 ? '⚔' : '♛'}</b><div>${state.players.length === 3 ? '3인 최후 결투' : `왕의 생명력 ${state.crownHp}`}</div><small>${state.phase === 'reaction' ? '방어 선택' : `${state.round}라운드 · ${state.totalTurns}턴`}</small></div></div>
      </section>
      <aside class="side"><section class="panel"><h2>내 역할 · ${state.private.roleLabel}</h2><p class="goal">${state.private.goal}</p><small>${state.players.length === 3 ? '자기 목표를 직접 처치하면 승리한다. 다른 사람이 대신 처치하면 남은 둘이 최후까지 싸운다.' : '왕이 쓰러지거나 반역자와 야심가가 모두 탈락하면 게임이 끝난다.'}</small></section>
      <section class="panel"><h2>행동 기록</h2><p class="ai-hint">${escapeHtml(publicAiHint(state))}</p><ol class="log">${state.actionLog.slice(-12).reverse().map(e => `<li>${escapeHtml(e.text)}</li>`).join('') || '<li>첫 행동을 기다린다.</li>'}</ol></section></aside>
      <section class="hand-zone" id="hand"><div class="hand-title"><h2>${state.players[viewerSeat].hero.name}의 손패 ${state.private.hand.length}</h2><span>${actor === viewerSeat ? '네 차례' : `${state.players[actor].hero.name}의 차례`}</span></div>
        ${state.totalTurns <= 1 && actor === viewerSeat ? '<p class="first-hint">카드 두 장을 받았다. 원하는 카드부터 한 장 써 봐.</p>' : ''}
        <div class="cards">${state.private.hand.map(cardHtml).join('') || '<p>손에 남은 카드가 없다.</p>'}</div>
        <div class="actions">${canAct ? `${directActions.map((a, i) => `<button data-action="${i}" class="${a.type === 'endTurn' ? '' : 'primary'}">${actionLabel(a, state)}</button>`).join('')}${targetInstruction}` : `<span>${waitingMessage}</span>`}</div>
      </section>
    </div>
  </main>${toastText ? `<div class="toast" role="status" aria-live="polite">${escapeHtml(toastText)}</div>` : ''}${modalHtml(state)}`;

  document.querySelectorAll('.portrait').forEach(img => img.addEventListener('error', () => { const box = document.createElement('div'); box.className = 'portrait portrait-fallback'; box.textContent = img.dataset.fallback; box.setAttribute('aria-label', `${img.alt} 대체 실루엣`); img.replaceWith(box); }, { once: true }));
  document.querySelectorAll('[data-card]').forEach(button => button.addEventListener('click', () => { if (!canAct) return; selectedCard = selectedCard === button.dataset.card ? null : button.dataset.card; sound('select'); render(); }));
  document.querySelectorAll('[data-action]').forEach(button => button.addEventListener('click', () => act(directActions[Number(button.dataset.action)])));
  document.querySelectorAll('[data-target-seat]').forEach(seat => {
    const chooseTarget = () => {
      const action = targetActions.find(candidate => candidate.target === Number(seat.dataset.targetSeat));
      if (action) act(action);
    };
    seat.addEventListener('click', chooseTarget);
    seat.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      chooseTarget();
    });
  });
  document.querySelector('#rules').addEventListener('click', () => { modal = 'rules'; render(); });
  document.querySelector('#access').addEventListener('click', () => { modal = 'access'; render(); });
  document.querySelector('#sound').addEventListener('click', () => { muted = !muted; localStorage.setItem('rune-muted', muted ? '1' : '0'); setMuted(muted); render(); });
  bindModal();
  scheduleAi();
}

// 온라인 방이 아직 실제 게임을 시작하기 전(사람 자리가 다 안 찼거나 호스트가 시작을 안 눌렀을 때) 보여주는 화면.
// 여기서 보이는 좌석 목록은 서버 lobbySnapshotFor()가 보내주는 것 그대로다 — 다른 사람의 손패·역할은
// 게임이 시작되기 전이라 애초에 존재하지 않으니 이 화면이 노출할 정보 자체가 없다.
function lobbyScreen(lobby) {
  const isHost = lobby.seat === lobby.hostSeat;
  const claimed = new Set(lobby.claimedSeats);
  const aiSeats = new Set(lobby.aiSeats ?? []);
  const seats = Array.from({ length: lobby.playerCount }, (_, i) => i);
  const seatLabel = seat => {
    if (aiSeats.has(seat)) return { cls: 'ai', text: 'AI (자동)' };
    if (seat === lobby.seat) return { cls: 'me', text: seat === lobby.hostSeat ? '나 (방장)' : '나' };
    if (claimed.has(seat)) return { cls: 'claimed', text: seat === lobby.hostSeat ? '누군가 (방장)' : '누군가 입장함' };
    return { cls: 'open', text: '빈 자리 · 기다리는 중' };
  };
  const humanJoined = lobby.claimedSeats.length;
  app.innerHTML = `<main class="screen title">
    <section class="title-box" aria-labelledby="lobby-title">
      <div class="crown" aria-hidden="true">♛</div>
      <p class="eyebrow">온라인 방 대기 중</p>
      <h1 id="lobby-title">방 코드 ${escapeHtml(currentRoomId ?? '')}</h1>
      <p class="subtitle">사람 ${humanJoined}/${lobby.humanSeats}명 입장${aiSeats.size ? ` · AI ${aiSeats.size}명 예약됨` : ''}</p>
      <ul class="lobby-seats">${seats.map(seat => {
        const label = seatLabel(seat);
        return `<li class="lobby-seat ${label.cls}"><span class="lobby-seat-num">${seat + 1}번 자리</span><span class="lobby-seat-status">${label.text}</span></li>`;
      }).join('')}</ul>
      ${isHost
        ? `<p><button class="primary" id="lobby-start">${humanJoined >= lobby.humanSeats ? '게임 시작' : '지금 시작 (남은 사람 자리는 AI가 대신 앉아)'}</button></p>`
        : '<p class="online-note">방장이 시작하면 바로 게임으로 넘어가.</p>'}
      <p><button id="lobby-copy">방 코드 복사</button></p>
      <p><button id="lobby-leave">나가기</button></p>
    </section>
  </main>${modalHtml()}`;
  document.querySelector('#lobby-start')?.addEventListener('click', () => transport?.startGame?.());
  document.querySelector('#lobby-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(currentRoomId ?? ''); showToast('방 코드를 복사했어.'); }
    catch { showToast('복사에 실패했다. 방 코드를 직접 알려줘.'); }
  });
  document.querySelector('#lobby-leave').addEventListener('click', () => {
    transport?.close?.();
    transport = null;
    currentRoomId = null;
    history.replaceState(null, '', location.pathname);
    titleScreen();
  });
  bindModal();
}

function modalHtml(state) {
  if (!modal) return '';
  if (modal === 'rules') return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="rules-title"><section class="modal-card rules"><h2 id="rules-title">게임 규칙</h2><p><b>뽑기 → 행동 → 방어 → 정리.</b> 자기 턴에 카드 두 장을 받고, 원하는 카드를 쓴 뒤, 생명력만큼 손패를 남겨.</p><p><b>인원 구성:</b> 3인 부관 1·반역자 1·야심가 1 / 4인 왕 1·반역자 2·야심가 1 / 5인 왕 1·부관 1·반역자 2·야심가 1 / 6인 왕 1·부관 1·반역자 3·야심가 1.</p><p><b>3인 특수전:</b> 모든 역할을 공개하고 부관부터 시작해. 부관은 야심가, 야심가는 반역자, 반역자는 부관을 직접 처치하면 승리해. 다른 사람이 대신 처치하면 남은 둘이 최후 생존전을 벌여.</p><p><b>부관:</b> 5인부터 왕과 같은 팀으로 참가해. 왕이 승리하면 부관도 함께 승리해. 왕이 부관을 직접 처치하면 처치 보상 없이 손패와 장비를 전부 버려.</p><p>공격이나 대상 효과 카드를 고른 뒤 전장에서 빛나는 목표 캐릭터를 선택해. 공격은 기본 거리 1에 닿고, 사거리 강화 카드를 장비하면 먼 상대도 공격할 수 있어. 피해를 받으면 생명력과 턴 종료 손패 한도가 함께 줄어.</p><p><b>마지막 피해로 캐릭터를 처치한 플레이어만 카드 3장을 즉시 뽑아.</b></p><p>4~6인전에서는 왕의 역할만 처음부터 공개되고 다른 역할은 탈락할 때 공개돼. 누가 누구를 공격하고 회복했는지 보고 편을 추리해.</p><p>키보드는 Tab으로 카드와 목표를 옮기고 Enter 또는 Space로 선택해.</p><button data-close>게임으로 돌아가기</button></section></div>`;
  if (modal === 'access') return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="access-title"><section class="modal-card"><h2 id="access-title">접근성</h2><label><input id="reduced" type="checkbox" ${reduced ? 'checked' : ''}> 움직임 줄이기</label><p>글자 크기</p><div class="actions"><button data-font="1">글자를 100%로 맞춘다</button><button data-font="1.15">글자를 115%로 늘린다</button><button data-font="1.3">글자를 130%로 늘린다</button></div><p>색 외에도 아이콘·테두리·동사로 카드 기능을 구분해.</p><button data-close>판으로 돌아간다</button></section></div>`;
  if (modal === 'oath' && state) return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="oath-title"><section class="modal-card"><div class="role-seal" aria-hidden="true">◉</div><h2 id="oath-title">너는 ${state.players[viewerSeat].hero.name}.</h2><h3>이번 역할: ${state.private.roleLabel}</h3><p>${state.private.goal}</p><p><b>왕이 쓰러지면 즉시 승패를 정해. 반역자와 야심가가 모두 탈락해도 게임이 끝나.</b></p><button class="primary" data-close>확인하고 시작</button></section></div>`;
  if (modal === 'result' && state) {
    const r = result(transport.raw());
    const won = r.winners.includes(viewerSeat);
    const firstAttacker = r.echoes.guardianFirstAttacker == null ? '왕을 처음 공격한 사람은 없었다.' : `${state.players[r.echoes.guardianFirstAttacker].hero.name}가 왕을 처음 공격했다.`;
    const saved = r.echoes.savedCrownAtOne ? '왕의 생명력이 1일 때 회복시켰다.' : '왕이 위험할 때 회복시킨 사람은 없었다.';
    const friendly = r.echoes.friendlyExile ? '같은 역할끼리 서로 탈락시켰다.' : '같은 역할끼리 서로 탈락시키지 않았다.';
    return `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="result-title"><section class="modal-card result"><div class="role-seal" aria-hidden="true">${won ? '♛' : '◇'}</div><h2 id="result-title">${won ? '승리!' : '패배'}</h2><p>${escapeHtml(r.reason)}</p><p>${r.turns}턴 · 승리 역할 ${ROLE_LABELS[r.outcome] ?? r.outcome}</p><ul class="echoes"><li>${escapeHtml(firstAttacker)}</li><li>${escapeHtml(saved)}</li><li>${escapeHtml(friendly)}</li></ul><div class="actions"><button class="primary" data-restart="same">같은 시드로 다시</button><button data-restart="new">새 게임</button></div></section></div>`;
  }
  return '';
}

function bindModal() {
  document.querySelector('[data-close]')?.addEventListener('click', () => { modal = null; if (transport) render(); else titleScreen(); });
  document.querySelector('#reduced')?.addEventListener('change', e => { reduced = e.target.checked; localStorage.setItem('rune-reduced', reduced ? '1' : '0'); document.documentElement.classList.toggle('reduced', reduced); });
  document.querySelectorAll('[data-font]').forEach(button => button.addEventListener('click', () => { fontScale = Number(button.dataset.font); localStorage.setItem('rune-font', fontScale); document.documentElement.style.setProperty('--scale', fontScale); }));
  document.querySelectorAll('[data-restart]').forEach(button => button.addEventListener('click', () => { const old = transport.raw(); const seed = button.dataset.restart === 'same' ? old.seed : `${old.seed}-${old.stateVersion}`; transport = createLocalTransport(newGame(seed, { controllers: old.players.map(p => p.controller) })); modal = 'oath'; render(); }));
}

const initialRoomId = new URLSearchParams(location.search).get('room');
if (initialRoomId) joinOnlineRoom(initialRoomId);
else titleScreen();
