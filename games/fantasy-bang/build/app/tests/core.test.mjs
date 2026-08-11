import test from 'node:test';
import assert from 'node:assert/strict';
import { CARD_TYPES, HEROES, applyEvent, createEvent, getState, isOver, legalActions, newGame, publicView, result, setController, step } from '../core/index.js';
import { chooseAction } from '../sim/policies.js';

test('rules:data — 10 heroes, 60 cards, four-seat role mix', () => {
  assert.equal(HEROES.length, 10);
  assert.equal(Object.values(CARD_TYPES).reduce((n, c) => n + c.count, 0), 60);
  const g = newGame('counts');
  assert.equal(g.players.length, 4);
  assert.deepEqual([...g.players.map(p => p.role)].sort(), ['guardian', 'laststar', 'rift', 'rift']);
  assert.equal(g.deck.length + g.discard.length + g.players.reduce((n, p) => n + p.hand.length + (p.equipment ? 1 : 0), 0), 60);
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
  const wrong = createEvent(g, 2, action, 'wrong');
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
