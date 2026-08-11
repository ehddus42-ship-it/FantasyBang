import { seedNumber, shuffle, takeInt } from './rng.js';
import { CARD_TYPES, HEROES, ROLE, ROLE_GOALS, ROLE_LABELS, makeDeck } from './data.js';

const MAX_TURNS = 96;
const clone = value => structuredClone(value);
const alive = g => g.players.filter(p => p.alive);
const player = (g, seat) => g.players[seat];

function log(g, type, actor, target, text, cardType) {
  g.actionLog.push({ n: g.actionLog.length + 1, turn: g.totalTurns, type, actor, target, text, cardType });
  if (g.actionLog.length > 80) g.actionLog.shift();
}

function drawOne(g) {
  if (!g.deck.length && g.discard.length) {
    const living = alive(g);
    const finalDuel = living.length === 2
      && living.some(p => p.role === ROLE.GUARDIAN)
      && living.some(p => p.role === ROLE.LASTSTAR);
    if (g.reshuffles >= 2 && !(finalDuel && !g.finalDuelExtended)) {
      g.crownVerdict = true;
      return undefined;
    }
    if (g.reshuffles >= 2 && finalDuel) g.finalDuelExtended = true;
    g.deck = shuffle(g, g.discard);
    g.discard = [];
    g.reshuffles += 1;
  }
  if (!g.deck.length) g.crownVerdict = true;
  return g.deck.pop();
}

function draw(g, seat, count, reason = 'draw') {
  const p = player(g, seat);
  const drawn = [];
  for (let i = 0; i < count; i++) {
    const card = drawOne(g);
    if (!card) break;
    p.hand.push(card);
    drawn.push(card.type);
  }
  if (drawn.length) log(g, reason, seat, seat, `${p.hero.name} · 카드 +${drawn.length}`);
}

function distance(g, from, to) {
  const seats = alive(g).map(p => p.seat);
  const a = seats.indexOf(from), b = seats.indexOf(to);
  if (a < 0 || b < 0) return Infinity;
  const d = Math.abs(a - b);
  return Math.min(d, seats.length - d);
}

function attackRange(p) {
  let range = p.equipment?.range ?? 1;
  if (p.hero.id === 'liana') range += 1;
  if (p.hero.id === 'aurelia' && p.flags.reprisalActive) range += 1;
  return range;
}

function removeCard(g, seat, cardId) {
  const p = player(g, seat);
  const index = p.hand.findIndex(c => c.id === cardId);
  if (index < 0) throw new Error('손에 없는 카드다.');
  const [card] = p.hand.splice(index, 1);
  g.discard.push(card);
  return card;
}

function randomHand(g, seat) {
  const p = player(g, seat);
  if (!p.hand.length) return null;
  const i = takeInt(g, p.hand.length);
  return p.hand.splice(i, 1)[0];
}

function checkOver(g, killerSeat = null) {
  const guardian = g.players.find(p => p.role === ROLE.GUARDIAN);
  const hostileAlive = g.players.some(p => p.alive && (p.role === ROLE.RIFT || p.role === ROLE.LASTSTAR));
  if (!guardian.alive) {
    const killer = killerSeat == null ? null : player(g, killerSeat);
    if (killer?.role === ROLE.LASTSTAR && !g.players.some(p => p.alive && p.role === ROLE.RIFT)) finish(g, 'laststar', '야심가가 마지막에 왕을 쓰러뜨렸다.');
    else finish(g, 'rift', '왕이 쓰러져 반역자가 승리했다.');
  } else if (!hostileAlive) finish(g, 'guardian', '반역자와 야심가가 모두 탈락했다.');
  else if (g.crownVerdict) {
    const rifts = g.players.filter(p => p.alive && p.role === ROLE.RIFT).length;
    finish(g, rifts ? 'rift' : 'guardian', '카드 더미가 세 번 소진돼 생존 진영으로 승패를 결정했다.');
  }
  else if (g.totalTurns >= MAX_TURNS) {
    const rifts = g.players.filter(p => p.alive && p.role === ROLE.RIFT).length;
    finish(g, rifts ? 'rift' : 'guardian', '최대 턴에 도달해 생존 진영으로 승패를 결정했다.');
  }
}

function finish(g, faction, reason) {
  g.over = true;
  g.phase = 'over';
  g.winningFaction = faction;
  g.endReason = reason;
  g.winners = g.players.filter(p => {
    if (faction === 'guardian') return p.role === ROLE.GUARDIAN || p.role === ROLE.KNIGHT;
    return p.role === faction;
  }).map(p => p.seat);
  log(g, 'ending', null, null, reason);
}

function damage(g, targetSeat, sourceSeat, cause) {
  const p = player(g, targetSeat);
  if (!p.alive) return;
  if (p.hero.id === 'bram' && !p.flags.bramShieldUsed) {
    p.flags.bramShieldUsed = true;
    log(g, 'guard', targetSeat, targetSeat, `${p.hero.name} · 성벽이 피해를 막았다`, cause);
    return;
  }
  p.hp -= 1;
  if (p.hero.id === 'aurelia') p.flags.reprisal = true;
  if (cause === 'slash' && player(g, sourceSeat)?.hero.id === 'nevia') p.status.frost = 1;
  log(g, 'damage', sourceSeat, targetSeat, `${p.hero.name} · 생명력 -1`, cause);
  if (p.hp <= 0) {
    p.alive = false;
    p.revealedRole = p.role;
    p.hand.forEach(c => g.discard.push(c));
    p.hand = [];
    if (p.equipment) g.discard.push(p.equipment);
    p.equipment = null;
    log(g, 'exile', sourceSeat, targetSeat, `${p.hero.name} 탈락 · 역할 ${ROLE_LABELS[p.role]} 공개`);
    if (p.role === ROLE.GUARDIAN) g.echoes.guardianFirstAttacker ??= sourceSeat;
    if (sourceSeat != null && player(g, sourceSeat)?.role === p.role) g.echoes.friendlyExile = true;
    checkOver(g, sourceSeat);
  }
}

function startTurn(g, seat) {
  if (g.over) return;
  g.turnSeat = seat;
  g.phase = 'action';
  g.pending = null;
  g.totalTurns += 1;
  if (seat === 0 && g.totalTurns > 1) g.round += 1;
  const p = player(g, seat);
  p.flags.slashes = 0;
  p.flags.heroUsed = false;
  p.flags.focusDrawUsed = false;
  if (p.hero.id === 'bram') p.flags.bramShieldUsed = false;
  if (p.hero.id === 'aurelia') p.flags.reprisalActive = p.flags.reprisal;
  p.flags.reprisal = false;
  const drawCount = Math.max(1, (p.hero.id === 'yuna' ? 3 : 2) - (p.status.frost ? 1 : 0));
  p.status.frost = 0;
  draw(g, seat, drawCount);
  if (p.hero.id === 'yuna' && drawCount === 3 && p.hand.length) {
    const tossed = p.hand.splice(takeInt(g, p.hand.length), 1)[0];
    g.discard.push(tossed);
    log(g, 'foresight', seat, seat, `${p.hero.name} · 카드 한 장을 버렸다`, tossed.type);
  }
  checkOver(g);
}

function nextTurn(g) {
  if (g.over) return;
  let next = g.turnSeat;
  do next = (next + 1) % g.players.length; while (!player(g, next).alive);
  startTurn(g, next);
}

function cardActions(g, p, card) {
  const actions = [];
  const others = alive(g).filter(q => q.seat !== p.seat);
  if (card.type === 'slash') {
    const limit = p.hero.id === 'ragna' && p.hp === 1 ? 2 : 1;
    if (p.flags.slashes < limit) for (const q of others) if (distance(g, p.seat, q.seat) <= attackRange(p)) actions.push({ type: 'play', cardId: card.id, target: q.seat });
  } else if (card.type === 'heal') {
    for (const q of alive(g)) if (q.hp < q.maxHp && distance(g, p.seat, q.seat) <= 1) actions.push({ type: 'play', cardId: card.id, target: q.seat });
  } else if (card.type === 'focus' || card.type === 'foresight' || card.type === 'storm') actions.push({ type: 'play', cardId: card.id });
  else if (card.type === 'cut' || card.type === 'steal' || card.type === 'duel') {
    const reach = card.type === 'duel' ? attackRange(p) : 1 + (p.hero.id === 'kai' ? 1 : 0);
    for (const q of others) if (distance(g, p.seat, q.seat) <= reach && (card.type === 'duel' || q.hand.length || q.equipment)) actions.push({ type: 'play', cardId: card.id, target: q.seat });
  }
  return actions;
}

export function newGame(seed = 'betrayal', options = {}) {
  const g = {
    seed: String(seed), rngState: seedNumber(seed), stateVersion: 0, gameId: `betrayal-${seed}`,
    phase: 'setup', turnSeat: 0, round: 1, totalTurns: 0, over: false, pending: null,
    deck: [], discard: [], reshuffles: 0, crownVerdict: false, finalDuelExtended: false, players: [], actionLog: [], winners: [], winningFaction: null, endReason: null,
    echoes: { savedCrownAtOne: false, guardianFirstAttacker: null, friendlyExile: false },
    appliedEventIds: [], eventSeq: 0
  };
  const roles = shuffle(g, [ROLE.GUARDIAN, ROLE.RIFT, ROLE.RIFT, ROLE.LASTSTAR]);
  const heroes = shuffle(g, HEROES).slice(0, 4);
  const controllers = options.controllers ?? ['human', 'ai', 'ai', 'ai'];
  g.players = roles.map((role, seat) => ({
    seat, controller: controllers[seat] === 'human' ? 'human' : 'ai', role,
    revealedRole: role === ROLE.GUARDIAN ? role : null, hero: heroes[seat], alive: true,
    hp: role === ROLE.GUARDIAN ? 5 : 4,
    maxHp: role === ROLE.GUARDIAN ? 5 : 4,
    hand: [], equipment: null, status: { frost: 0 }, suspicion: [0, 0, 0, 0], threat: 0,
    flags: { slashes: 0, heroUsed: false, focusDrawUsed: false, bramShieldUsed: false, reprisal: false, reprisalActive: false }
  }));
  g.deck = shuffle(g, makeDeck());
  for (let i = 0; i < 4; i++) draw(g, i, 4, 'opening');
  startTurn(g, 0);
  return g;
}

export function getState(g, viewerSeat = 0) {
  return privateView(g, viewerSeat);
}

export function publicView(g) {
  return {
    seed: g.seed, stateVersion: g.stateVersion, gameId: g.gameId, phase: g.phase, turnSeat: g.turnSeat,
    round: g.round, totalTurns: g.totalTurns, deckCount: g.deck.length, discardCount: g.discard.length,
    reshuffles: g.reshuffles, crownVerdict: g.crownVerdict, finalDuelExtended: g.finalDuelExtended,
    players: g.players.map(p => ({ seat: p.seat, controller: p.controller, hero: p.hero, alive: p.alive, hp: p.hp, maxHp: p.maxHp, handCount: p.hand.length, equipment: p.equipment ? { type: p.equipment.type, range: p.equipment.focus } : null, distanceFromTurn: distance(g, g.turnSeat, p.seat), slashesUsed: p.flags.slashes, status: clone(p.status), role: p.revealedRole })),
    actionLog: clone(g.actionLog), crownHp: g.players.find(p => p.role === ROLE.GUARDIAN)?.hp ?? 0,
    aliveSeats: alive(g).map(p => p.seat), revealedRoleCount: g.players.filter(p => p.revealedRole).length,
    over: g.over, winningFaction: g.winningFaction, winners: [...g.winners], endReason: g.endReason, echoes: clone(g.echoes)
  };
}

export function privateView(g, viewerSeat) {
  const view = publicView(g);
  const mine = player(g, viewerSeat);
  view.viewerSeat = viewerSeat;
  view.private = mine ? { role: mine.role, roleLabel: ROLE_LABELS[mine.role], goal: ROLE_GOALS[mine.role], hand: clone(mine.hand) } : null;
  view.players = view.players.map(p => p.seat === viewerSeat ? { ...p, role: mine.role, hand: clone(mine.hand) } : p);
  view.pending = g.pending && g.pending.target === viewerSeat ? clone(g.pending) : g.pending ? { attacker: g.pending.attacker, target: g.pending.target, cardType: g.pending.cardType } : null;
  view.humanRisk = mine?.hand.length ?? 0;
  return view;
}

export function aiInspectionView(g) {
  const view = publicView(g);
  view.ai = g.players.map(p => ({ seat: p.seat, role: p.role, suspicion: [...p.suspicion], threat: p.threat }));
  return view;
}

export function legalActions(g) {
  if (g.over) return [{ type: 'restart', seed: g.seed }, { type: 'restart', seed: `${g.seed}-next` }];
  if (g.phase === 'reaction') {
    const p = player(g, g.pending.target);
    return [{ type: 'react', useWard: false }, ...p.hand.filter(c => c.type === 'ward').map(c => ({ type: 'react', useWard: true, cardId: c.id }))];
  }
  const p = player(g, g.turnSeat);
  if (g.phase === 'discard') return p.hand.map(c => ({ type: 'discard', cardId: c.id }));
  const actions = p.hand.flatMap(card => cardActions(g, p, card));
  if (p.hero.id === 'miriel' && !p.flags.heroUsed && p.hp < p.maxHp && p.hand.length >= 2) actions.push({ type: 'hero', cardIds: [p.hand[0].id, p.hand[1].id] });
  actions.push({ type: 'endTurn' });
  return actions;
}

function resolvePlay(g, action) {
  const p = player(g, g.turnSeat);
  const card = removeCard(g, p.seat, action.cardId);
  const q = action.target == null ? null : player(g, action.target);
  const targetText = q ? ` → ${q.hero.name}` : '';
  log(g, card.type, p.seat, action.target ?? null, `${p.hero.name} · ${CARD_TYPES[card.type].verb}${targetText}`, card.type);
  if (card.type === 'slash') {
    p.flags.slashes += 1;
    if (p.hero.id === 'aurelia') p.flags.reprisalActive = false;
    if (q.role === ROLE.GUARDIAN && p.role !== ROLE.GUARDIAN) g.echoes.guardianFirstAttacker ??= p.seat;
    g.pending = { attacker: p.seat, target: q.seat, cardType: 'slash' };
    g.phase = 'reaction';
  } else if (card.type === 'heal') {
    q.hp = Math.min(q.maxHp, q.hp + 1);
    if (q.role === ROLE.GUARDIAN && q.hp === 2) g.echoes.savedCrownAtOne = true;
    if (p.hero.id === 'selene' && q.seat !== p.seat && !p.flags.heroUsed) { p.flags.heroUsed = true; draw(g, p.seat, 1, 'hero'); }
  } else if (card.type === 'focus') {
    if (p.equipment) g.discard.push(p.equipment);
    p.equipment = card;
    const equippedDiscardIndex = g.discard.findIndex(c => c.id === card.id);
    if (equippedDiscardIndex >= 0) g.discard.splice(equippedDiscardIndex, 1);
    if (p.hero.id === 'theo' && !p.flags.focusDrawUsed) { p.flags.focusDrawUsed = true; draw(g, p.seat, 1, 'hero'); }
  } else if (card.type === 'cut') {
    const stolen = q.equipment ? (q.equipment) : randomHand(g, q.seat);
    if (q.equipment) q.equipment = null;
    if (stolen) g.discard.push(stolen);
  } else if (card.type === 'steal') {
    const stolen = randomHand(g, q.seat);
    if (stolen) p.hand.push(stolen);
  } else if (card.type === 'foresight') draw(g, p.seat, 2, 'foresight');
  else if (card.type === 'duel') {
    let attacker = p, defender = q;
    while (true) {
      const slash = defender.hand.find(c => c.type === 'slash');
      if (!slash) { damage(g, defender.seat, attacker.seat, 'duel'); break; }
      removeCard(g, defender.seat, slash.id);
      [attacker, defender] = [defender, attacker];
    }
  } else if (card.type === 'storm') {
    for (const target of alive(g).filter(x => x.seat !== p.seat)) {
      const slash = target.hand.find(c => c.type === 'slash');
      if (slash) removeCard(g, target.seat, slash.id); else damage(g, target.seat, p.seat, 'storm');
      if (g.over) break;
    }
  }
}

function updateBeliefs(g, action, actor, cardType) {
  if (action.type !== 'play') return;
  const card = CARD_TYPES[cardType];
  const target = action.target == null ? null : player(g, action.target);
  for (const observer of g.players.filter(p => p.alive && p.seat !== actor)) {
    if (target?.revealedRole === ROLE.GUARDIAN) observer.suspicion[actor] += card?.kind === 'support' ? -2 : 2;
    observer.threat = Math.max(...g.players.map(p => p.hp ? (p.hand.length + attackRange(p)) / p.hp : 0));
  }
}

export function step(input, action) {
  if (!action || typeof action !== 'object') throw new Error('직렬화 가능한 행동 객체가 필요하다.');
  if (input.over && action.type === 'restart') return newGame(action.seed, { controllers: input.players.map(p => p.controller) });
  const legal = legalActions(input);
  const key = a => JSON.stringify(a);
  if (!legal.some(a => key(a) === key(action))) throw new Error('현재 상태에서 불법인 행동이다.');
  const g = clone(input);
  const actor = g.phase === 'reaction' ? g.pending.target : g.turnSeat;
  const cardType = action.type === 'play' ? player(g, actor)?.hand.find(c => c.id === action.cardId)?.type : null;
  updateBeliefs(g, action, actor, cardType);
  if (action.type === 'play') resolvePlay(g, action);
  else if (action.type === 'react') {
    const pending = g.pending;
    if (action.useWard) {
      removeCard(g, pending.target, action.cardId);
      log(g, 'ward', pending.target, pending.target, `${player(g, pending.target).hero.name} · 방어 카드를 썼다`, 'ward');
    } else damage(g, pending.target, pending.attacker, pending.cardType);
    g.pending = null;
    if (!g.over) g.phase = 'action';
  } else if (action.type === 'hero') {
    action.cardIds.forEach(id => removeCard(g, g.turnSeat, id));
    const p = player(g, g.turnSeat); p.hp = Math.min(p.maxHp, p.hp + 1); p.flags.heroUsed = true;
    log(g, 'hero', p.seat, p.seat, `${p.hero.name} · 카드 두 장을 버리고 생명력 1 회복`);
  } else if (action.type === 'endTurn') {
    const p = player(g, g.turnSeat);
    if (p.hand.length > p.hp) g.phase = 'discard'; else nextTurn(g);
  } else if (action.type === 'discard') {
    removeCard(g, g.turnSeat, action.cardId);
    if (player(g, g.turnSeat).hand.length <= player(g, g.turnSeat).hp) nextTurn(g);
  }
  g.stateVersion += 1;
  checkOver(g, actor);
  return g;
}

export function isOver(g) { return Boolean(g.over); }

export function result(g) {
  if (!g.over) return null;
  return { outcome: g.winningFaction, score: g.winners.includes(0) ? 1 : 0, turns: g.totalTurns, winners: [...g.winners], reason: g.endReason, echoes: clone(g.echoes) };
}

export function setController(g, seat, controller) {
  if (!['human', 'ai'].includes(controller) || !player(g, seat)) throw new Error('좌석 또는 조종자 유형이 잘못됐다.');
  const next = clone(g); next.players[seat].controller = controller; next.stateVersion += 1; return next;
}

export function createEvent(g, seat, action, eventId = `${g.gameId}:${g.eventSeq + 1}`) {
  return { gameId: g.gameId, eventId, sequence: g.eventSeq + 1, seat, baseVersion: g.stateVersion, action: clone(action) };
}

export function applyEvent(g, event) {
  if (event.gameId !== g.gameId) return { ok: false, reason: 'GAME_MISMATCH', snapshot: publicView(g) };
  if (g.appliedEventIds.includes(event.eventId)) return { ok: true, duplicate: true, state: g };
  const authorized = g.phase === 'reaction' ? g.pending?.target : g.turnSeat;
  if (event.baseVersion !== g.stateVersion) return { ok: false, reason: 'VERSION_CONFLICT', snapshot: publicView(g) };
  if (event.seat !== authorized) return { ok: false, reason: 'TURN_OWNERSHIP', snapshot: publicView(g) };
  const next = step(g, event.action);
  next.appliedEventIds.push(event.eventId); next.eventSeq = event.sequence;
  return { ok: true, state: next, publicState: publicView(next), privateStates: next.players.map(p => privateView(next, p.seat)) };
}

export { CARD_TYPES, HEROES, ROLE, ROLE_GOALS, ROLE_LABELS };
