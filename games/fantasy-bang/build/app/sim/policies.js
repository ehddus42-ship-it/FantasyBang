import { legalActions, ROLE } from '../core/index.js?v=20260812-cf1';

function hash(text) {
  let h = 2166136261;
  for (const c of String(text)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function actionCard(g, a) {
  const seat = g.phase === 'reaction' ? g.pending.target : g.turnSeat;
  return g.players[seat].hand.find(c => c.id === a.cardId);
}

function publicSuspicion(g, viewer, target) {
  const p = g.players[target];
  if (p.revealedRole === ROLE.GUARDIAN || p.revealedRole === ROLE.KNIGHT) return -99;
  if (p.revealedRole === ROLE.RIFT || p.revealedRole === ROLE.LASTSTAR) return 99;
  let score = g.players[viewer].suspicion[target] || 0;
  for (const e of g.actionLog) {
    if (e.actor !== target) continue;
    const victim = e.target == null ? null : g.players[e.target];
    if (victim?.revealedRole === ROLE.GUARDIAN) score += ['slash', 'duel', 'damage'].includes(e.type) ? 2 : e.type === 'heal' ? -2 : 0;
  }
  return score;
}

function expertSuspicion(g, viewer, target) {
  let score = publicSuspicion(g, viewer, target);
  for (const e of g.actionLog) {
    if (e.actor !== target || e.target == null) continue;
    const victimRole = g.players[e.target]?.revealedRole;
    const hostile = ['slash', 'duel', 'storm', 'damage', 'cut', 'steal'].includes(e.type);
    if (victimRole === ROLE.RIFT) score += hostile ? -3 : e.type === 'heal' ? 3 : 0;
    if (victimRole === ROLE.GUARDIAN) score += hostile ? 2 : e.type === 'heal' ? -2 : 0;
  }
  return score;
}

function seatDistance(g, from, to) {
  const seats = g.players.filter(p => p.alive).map(p => p.seat);
  const a = seats.indexOf(from), b = seats.indexOf(to);
  if (a < 0 || b < 0) return Infinity;
  const direct = Math.abs(a - b);
  return Math.min(direct, seats.length - direct);
}

function visibleAttackRange(p) {
  return (p.equipment?.focus ?? 1) + (p.hero.id === 'liana' ? 1 : 0) + (p.flags.reprisalActive ? 1 : 0);
}

export function chooseAction(g, policy = 'baseline-recommended') {
  const actions = legalActions(g);
  if (!actions.length) return null;
  if (policy === 'random') return actions[hash(`${g.seed}:${g.stateVersion}:random`) % actions.length];
  if (g.phase === 'reaction') {
    const ward = actions.find(a => a.useWard);
    if (policy === 'pure-A') return actions.find(a => !a.useWard);
    return ward ?? actions[0];
  }
  if (g.phase === 'discard') {
    const rank = { ward: 8, heal: 7, slash: 6, focus: 5, cut: 4, steal: 4, duel: 3, storm: 3, foresight: 2 };
    return [...actions].sort((a, b) => (rank[actionCard(g, a)?.type] ?? 0) - (rank[actionCard(g, b)?.type] ?? 0))[0];
  }
  const me = g.players[g.turnSeat];
  const guardian = g.players.find(p => p.role === ROLE.GUARDIAN);
  const riftsKnownDead = g.players.filter(p => p.revealedRole === ROLE.RIFT && !p.alive).length;
  const totalRifts = g.players.filter(p => p.role === ROLE.RIFT).length;
  const scored = actions.map((a, index) => {
    if (a.type === 'endTurn') return { a, s: -20, index };
    if (a.type === 'hero') return { a, s: me.hp <= 2 ? 75 : 10, index };
    const card = actionCard(g, a);
    const target = a.target == null ? null : g.players[a.target];
    let s = { slash: 45, heal: 30, focus: 24, cut: 34, steal: 30, duel: 36, storm: 28, foresight: 18 }[card?.type] ?? 0;
    if (target) {
      const suspicion = policy === 'baseline-recommended'
        ? expertSuspicion(g, me.seat, target.seat)
        : publicSuspicion(g, me.seat, target.seat);
      if (me.role === ROLE.RIFT) {
        if (target.revealedRole === ROLE.GUARDIAN) s += 160;
        else s -= suspicion * 20;
      }
      else if (me.role === ROLE.GUARDIAN || me.role === ROLE.KNIGHT) {
        if (g.players.length === 3 && me.role === ROLE.KNIGHT) {
          if (target.role === ROLE.LASTSTAR && ['slash', 'duel', 'cut', 'steal'].includes(card?.type)) s += 240;
          else if (['slash', 'duel', 'cut', 'steal'].includes(card?.type)) s -= 180;
        } else {
          s += suspicion * 20;
          if (suspicion <= 0 && ['slash', 'duel'].includes(card?.type)) s -= 90;
        }
      }
      else if (me.role === ROLE.LASTSTAR) {
        const attackCard = ['slash', 'duel', 'cut', 'steal'].includes(card?.type);
        if (attackCard && target.revealedRole === ROLE.GUARDIAN) s += riftsKnownDead >= totalRifts ? 110 : -90;
        else s += suspicion * 20;
      }
      if (card?.type === 'heal') {
        s = 15 + (target.maxHp - target.hp) * 12;
        if (target.seat === me.seat) s += me.hp <= 2 ? 65 : 28;
        if (me.role === ROLE.RIFT && target.revealedRole === ROLE.GUARDIAN) s -= 100;
        if (me.role === ROLE.RIFT && target.revealedRole !== ROLE.GUARDIAN) s += suspicion * 14;
        if (me.role === ROLE.LASTSTAR && target.revealedRole === ROLE.GUARDIAN && riftsKnownDead < totalRifts) s += 80;
        if (me.role === ROLE.GUARDIAN && target.revealedRole === ROLE.GUARDIAN) s += 60;
        if (me.role === ROLE.KNIGHT && target.revealedRole === ROLE.GUARDIAN) s += 110;
        if (g.players.length === 3 && target.seat === me.seat) s += 70;
      }
      if (target.hp === 1 && card?.type !== 'heal') s += 25;
      if (policy === 'baseline-recommended' && target.hp === 1 && ['slash', 'duel'].includes(card?.type)) s += 48;
      if (policy === 'baseline-recommended' && ['slash', 'duel'].includes(card?.type)) {
        const objectiveAttack = (me.role === ROLE.RIFT && target.revealedRole === ROLE.GUARDIAN)
          || ((me.role === ROLE.GUARDIAN || me.role === ROLE.KNIGHT) && suspicion > 0)
          || (me.role === ROLE.LASTSTAR && (suspicion > 0 || (target.revealedRole === ROLE.GUARDIAN && riftsKnownDead >= totalRifts)));
        if (objectiveAttack) s += 55;
      }
    }
    if ((me.role === ROLE.GUARDIAN || me.role === ROLE.KNIGHT) && card?.type === 'storm' && !g.players.filter(p => p.alive && p.seat !== me.seat).every(p => publicSuspicion(g, me.seat, p.seat) > 0)) s -= 90;
    if (policy === 'baseline-recommended' && card?.type === 'storm') {
      if (me.role === ROLE.RIFT) s += 130;
      else if (me.role === ROLE.GUARDIAN) s += 70;
    }
    if (policy === 'baseline-recommended' && card?.type === 'foresight') s += 24;
    if (policy === 'baseline-recommended' && card?.type === 'focus') {
      if ((me.equipment?.focus ?? 1) >= (card.focus ?? 1)) s -= 55;
      else s += 18;
      let objective = null;
      if (me.role === ROLE.RIFT) objective = guardian;
      else if (me.role === ROLE.LASTSTAR && riftsKnownDead >= totalRifts) objective = guardian;
      else if (me.role === ROLE.GUARDIAN || me.role === ROLE.KNIGHT || me.role === ROLE.LASTSTAR) {
        const candidates = g.players.filter(p => p.alive && p.seat !== me.seat)
          .map(p => ({ p, suspicion: expertSuspicion(g, me.seat, p.seat) }))
          .sort((a, b) => b.suspicion - a.suspicion);
        if (candidates[0]?.suspicion > 0) objective = candidates[0].p;
      }
      if (objective && seatDistance(g, me.seat, objective.seat) > visibleAttackRange(me)
        && seatDistance(g, me.seat, objective.seat) <= (card.focus ?? 1) + (me.hero.id === 'liana' ? 1 : 0)) s += 120;
    }
    if (policy === 'greedy') s = card?.type === 'slash' ? 100 : card?.type === 'duel' ? 80 : card?.type === 'storm' ? 70 : s;
    if (policy === 'pure-A') s = ['heal', 'focus', 'foresight'].includes(card?.type) ? 80 : 0;
    if (policy === 'pure-B') s = ['slash', 'duel', 'storm', 'cut', 'steal'].includes(card?.type) ? 80 : 0;
    if (policy === 'mixed') s += (g.totalTurns % 2 ? ['heal', 'focus'].includes(card?.type) : ['slash', 'duel'].includes(card?.type)) ? 25 : 0;
    return { a, s, index };
  });
  scored.sort((x, y) => y.s - x.s || x.index - y.index);
  return scored[0].a;
}
