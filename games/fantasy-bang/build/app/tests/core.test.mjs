import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES, HEROES, applyEvent, createEvent, getState, isOver, legalActions, newGame, publicView, result, roleMixFor, setController, step } from '../core/index.js';
import { chooseAction } from '../sim/policies.js';

test('rules:data — 10 heroes, 60 cards, four-seat role mix', () => {
  assert.equal(HEROES.length, 10);
  assert.equal(Object.values(CARD_TYPES).reduce((n, c) => n + c.count, 0), 60);
  const g = newGame('counts');
  assert.equal(g.players.length, 4);
  assert.deepEqual([...g.players.map(p => p.role)].sort(), ['guardian', 'laststar', 'rift', 'rift']);
  assert.equal(g.deck.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length + (p.equipment ? 1 : 0), 0), 60);
});

test('rules:player counts — official three-to-six role mixes and starting roles', () => {
  const expected = {
    3: ['knight', 'laststar', 'rift'],
    4: ['guardian', 'laststar', 'rift', 'rift'],
    5: ['guardian', 'knight', 'laststar', 'rift', 'rift'],
    6: ['guardian', 'knight', 'laststar', 'rift', 'rift', 'rift']
  };
  for (const [countText, roles] of Object.entries(expected)) {
    const count = Number(countText);
    assert.deepEqual(roleMixFor(count).sort(), roles);
    const g = newGame(`count-${count}`, { playerCount: count });
    assert.equal(g.players.length, count);
    assert.deepEqual(g.players.map(p => p.role).sort(), roles);
    assert.equal(g.players[g.turnSeat].role, count === 3 ? 'knight' : 'guardian');
    assert.equal(g.players.filter(p => p.revealedRole).length, count === 3 ? 3 : 1);
    assert.equal(g.deck.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length + (p.equipment ? 1 : 0), 0), 60);
  }
  assert.throws(() => roleMixFor(2), /3명부터 6명/);
  assert.throws(() => roleMixFor(7), /3명부터 6명/);
});

test('rules:three players — direct target elimination wins, otherwise survivors duel', () => {
  let direct = newGame('three-direct', { playerCount: 3, controllers: ['ai', 'ai', 'ai'] });
  const deputy = direct.players.find(p => p.role === 'knight');
  const ambitious = direct.players.find(p => p.role === 'laststar');
  const slash = direct.deck.find(c => c.type === 'slash');
  direct.deck = direct.deck.filter(c => c !== slash);
  direct.turnSeat = deputy.seat;
  direct.phase = 'action';
  deputy.hand.push(slash);
  ambitious.hp = 1;
  ambitious.hand = [];
  ambitious.flags.bramShieldUsed = true;
  direct = step(direct, legalActions(direct).find(a => a.cardId === slash.id && a.target === ambitious.seat));
  direct = step(direct, legalActions(direct).find(a => a.type === 'react' && !a.useWard));
  assert.equal(direct.over, true);
  assert.equal(direct.winningFaction, 'knight');
  assert.deepEqual(direct.winners, [deputy.seat]);

  let duel = newGame('three-wrong-target', { playerCount: 3, controllers: ['ai', 'ai', 'ai'] });
  const duelDeputy = duel.players.find(p => p.role === 'knight');
  const rebel = duel.players.find(p => p.role === 'rift');
  const duelSlash = duel.deck.find(c => c.type === 'slash');
  duel.deck = duel.deck.filter(c => c !== duelSlash);
  duel.turnSeat = duelDeputy.seat;
  duel.phase = 'action';
  duelDeputy.hand.push(duelSlash);
  rebel.hp = 1;
  rebel.hand = [];
  rebel.flags.bramShieldUsed = true;
  duel = step(duel, legalActions(duel).find(a => a.cardId === duelSlash.id && a.target === rebel.seat));
  duel = step(duel, legalActions(duel).find(a => a.type === 'react' && !a.useWard));
  assert.equal(duel.over, false);
  assert.equal(duel.threePlayerFinalDuel, true);
  assert.equal(duel.players.filter(p => p.alive).length, 2);
});

test('rules:deputy — shares the king victory and king elimination discards every card', () => {
  let penalty = newGame('deputy-penalty', { playerCount: 5, controllers: ['ai', 'ai', 'ai', 'ai', 'ai'] });
  const king = penalty.players.find(p => p.role === 'guardian');
  const deputy = penalty.players.find(p => p.role === 'knight');
  const slash = penalty.deck.find(c => c.type === 'slash');
  const focus = penalty.deck.find(c => c.type === 'focus' && c.focus === 3);
  penalty.deck = penalty.deck.filter(c => c !== slash && c !== focus);
  penalty.turnSeat = king.seat;
  penalty.phase = 'action';
  king.hand.push(slash);
  king.equipment = focus;
  deputy.hp = 1;
  deputy.hand = [];
  deputy.flags.bramShieldUsed = true;
  penalty = step(penalty, legalActions(penalty).find(a => a.cardId === slash.id && a.target === deputy.seat));
  penalty = step(penalty, legalActions(penalty).find(a => a.type === 'react' && !a.useWard));
  assert.equal(king.seat, penalty.players.find(p => p.role === 'guardian').seat);
  assert.equal(penalty.players[king.seat].hand.length, 0);
  assert.equal(penalty.players[king.seat].equipment, null);
  assert.ok(penalty.actionLog.some(entry => entry.type === 'deputyPenalty'));
  assert.equal(penalty.actionLog.some(entry => entry.type === 'killReward' && entry.actor === king.seat), false);

  let team = newGame('deputy-team-win', { playerCount: 5, controllers: ['ai', 'ai', 'ai', 'ai', 'ai'] });
  for (const p of team.players) if (p.role === 'rift' || p.role === 'laststar') p.alive = false;
  const teamKing = team.players.find(p => p.role === 'guardian');
  const teamDeputy = team.players.find(p => p.role === 'knight');
  team.turnSeat = teamKing.seat;
  team.phase = 'action';
  team = step(team, { type: 'endTurn' });
  assert.equal(team.winningFaction, 'guardian');
  assert.ok(team.winners.includes(teamKing.seat));
  assert.ok(team.winners.includes(teamDeputy.seat));
});

test('rules:determinism — same seed and actions yield byte-identical state', () => {
  let a = newGame('fixed-seed'), b = newGame('fixed-seed');
  for (let i = 0; i < 40 && !isOver(a); i++) {
    const action = chooseAction(a, 'mixed');
    a = step(a, action); b = step(b, action);
    assert.deepEqual(a, b);
  }
});

test('privacy:views — public and another seat view never leak hidden role or hand', () => {
  const g = newGame('secrets');
  const pub = publicView(g);
  for (const p of pub.players) {
    if (p.role !== 'guardian') assert.equal(p.role, null);
    assert.equal('hand' in p, false);
  }
  const one = getState(g, 1);
  assert.deepEqual(one.private.hand, g.players[1].hand);
  assert.equal(one.players[2].hand, undefined);
  assert.equal(one.players[2].role, g.players[2].revealedRole);
});

test('rules:legality — every returned action applies and an invented action fails', () => {
  const g = newGame('legal');
  for (const action of legalActions(g)) assert.doesNotThrow(() => step(g, action));
  assert.throws(() => step(g, { type: 'play', cardId: 'fake-1', target: 3 }), /불법/);
});

test('multiplayer:event — ownership, versions, idempotency, and controller swap', () => {
  let g = newGame('events');
  const action = legalActions(g)[0];
  const wrongSeat = (g.turnSeat + 1) % g.players.length;
  const wrong = createEvent(g, wrongSeat, action, 'wrong');
  assert.equal(applyEvent(g, wrong).reason, 'TURN_OWNERSHIP');
  const event = createEvent(g, g.turnSeat, action, 'once');
  const applied = applyEvent(g, event);
  assert.equal(applied.ok, true);
  assert.equal(applyEvent(applied.state, event).duplicate, true);
  const stale = { ...createEvent(applied.state, applied.state.turnSeat, legalActions(applied.state)[0], 'stale'), baseVersion: 0 };
  assert.equal(applyEvent(applied.state, stale).reason, 'VERSION_CONFLICT');
  g = setController(g, 2, 'human');
  assert.equal(g.players[2].controller, 'human');
});

test('rules:completion — 128 seeds finish without deadlock within turn budget', () => {
  for (let seed = 0; seed < 128; seed++) {
    let g = newGame(`finish-${seed}`, { controllers: ['ai', 'ai', 'ai', 'ai'] });
    let actions = 0;
    while (!isOver(g) && actions++ < 1000) {
      const legal = legalActions(g);
      assert.ok(legal.length > 0);
      g = step(g, chooseAction(g, 'baseline-recommended'));
    }
    assert.equal(isOver(g), true, `seed ${seed}`);
    assert.ok(result(g).turns <= 96);
  }
});

test('rules:three-to-six completion — every supported player count reaches a result', () => {
  for (let count = 3; count <= 6; count++) {
    for (let seed = 0; seed < 16; seed++) {
      let g = newGame(`finish-${count}-${seed}`, { playerCount: count, controllers: Array(count).fill('ai') });
      let actions = 0;
      while (!isOver(g) && actions++ < 1200) g = step(g, chooseAction(g, 'baseline-recommended'));
      assert.equal(isOver(g), true, `${count}인 seed ${seed}`);
      assert.ok(result(g).turns <= 96);
    }
  }
});
