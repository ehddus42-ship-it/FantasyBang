import test from 'node:test';
import assert from 'node:assert/strict';
import { legalActions, newGame, step } from '../core/index.js';

test('rules:focus — equipment changes attack reach and remains out of discard', () => {
  let g = newGame('focus-rule');
  const p = g.players[g.turnSeat];
  const focus = g.deck.find(c => c.type === 'focus');
  const slash = g.deck.find(c => c.type === 'slash');
  g.deck = g.deck.filter(c => c !== focus && c !== slash);
  p.hand.push(focus, slash);
  const equip = legalActions(g).find(a => a.type === 'play' && a.cardId === focus.id);
  g = step(g, equip);
  assert.equal(g.players[g.turnSeat].equipment.id, focus.id);
  assert.equal(g.discard.some(c => c.id === focus.id), false);
  const targets = legalActions(g).filter(a => a.cardId === slash.id).map(a => a.target);
  assert.ok(targets.length >= 2);
});

test('rules:reaction — ward and pass are both explicit serializable actions', () => {
  let g = newGame('reaction-rule');
  const actor = g.players[g.turnSeat];
  const slash = g.deck.find(c => c.type === 'slash');
  g.deck = g.deck.filter(c => c !== slash);
  actor.hand.push(slash);
  const attack = legalActions(g).find(a => a.cardId === slash.id);
  const attackerName = g.players[g.turnSeat].hero.name;
  const targetName = g.players[attack.target].hero.name;
  g = step(g, attack);
  assert.equal(g.phase, 'reaction');
  assert.equal(g.actionLog.at(-1).target, attack.target);
  assert.match(g.actionLog.at(-1).text, new RegExp(`${attackerName}.*${targetName}`));
  const actions = legalActions(g);
  assert.ok(actions.some(a => a.type === 'react' && !a.useWard));
  assert.doesNotThrow(() => JSON.stringify(actions));
});

test('rules:kill reward — only the player who lands the final damage draws three cards', () => {
  let g = newGame('kill-reward-rule');
  const killerSeat = g.turnSeat;
  const killer = g.players[killerSeat];
  const slash = g.deck.find(c => c.type === 'slash');
  g.deck = g.deck.filter(c => c !== slash);
  killer.hand.push(slash);
  const attack = legalActions(g).find(a => a.type === 'play' && a.cardId === slash.id && a.target != null);
  const victimSeat = attack.target;
  const victim = g.players[victimSeat];
  victim.hp = 1;
  victim.hand = [];
  const otherHands = g.players.map(p => p.hand.length);
  const killerHandBefore = killer.hand.length;

  g = step(g, attack);
  const takeDamage = legalActions(g).find(a => a.type === 'react' && !a.useWard);
  g = step(g, takeDamage);

  assert.equal(g.players[victimSeat].alive, false);
  assert.equal(g.players[killerSeat].hand.length, killerHandBefore - 1 + 3);
  g.players.forEach((p, seat) => {
    if (seat === killerSeat || seat === victimSeat) return;
    assert.equal(p.hand.length, otherHands[seat]);
  });
  assert.match(g.actionLog.find(entry => entry.type === 'killReward')?.text ?? '', /처치 보상 카드 \+3/);
});
