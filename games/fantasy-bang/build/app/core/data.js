export const ROLE = Object.freeze({ GUARDIAN: 'guardian', RIFT: 'rift', LASTSTAR: 'laststar', KNIGHT: 'knight' });

export const ROLE_LABELS = Object.freeze({
  guardian: '왕', rift: '반역자', laststar: '야심가', knight: '호위기사'
});

export const ROLE_GOALS = Object.freeze({
  guardian: '반역자 둘과 야심가를 모두 쓰러뜨려라.',
  rift: '정체를 숨기고 왕을 쓰러뜨려라.',
  laststar: '마지막까지 살아남아 왕을 직접 쓰러뜨려라.',
  knight: '왕을 지켜라. 반역자와 야심가를 모두 쓰러뜨려라.'
});

export const HEROES = Object.freeze([
  ['aurelia', '아우렐리아', '피해를 받은 뒤 다음 턴 첫 공격 사거리 +1'],
  ['selene', '셀레네', '다른 영웅을 회복하면 턴당 한 번 카드 1장 뽑기'],
  ['kai', '카이', '카드 파괴·카드 훔치기 거리 +1'],
  ['liana', '리아나', '기본 공격 사거리 +1'],
  ['bram', '브람', '라운드 첫 생명력 피해 1회 무효'],
  ['miriel', '미르엘', '턴당 한 번 카드 2장을 버려 생명력 1 회복'],
  ['ragna', '라그나', '생명력 1일 때 공격 카드를 두 번 사용'],
  ['yuna', '유나', '기본 뽑기 때 카드 3장을 보고 2장을 얻음'],
  ['theo', '테오', '사거리 강화 장비 뒤 턴당 한 번 카드 1장 뽑기'],
  ['nevia', '네비아', '공격 피해를 주면 대상의 다음 기본 뽑기 -1']
].map(([id, name, ability]) => Object.freeze({ id, name, ability })));

export const CARD_TYPES = Object.freeze({
  slash: { name: '공격', kind: 'attack', verb: '공격한다', count: 18 },
  ward: { name: '방어', kind: 'defense', verb: '방어한다', count: 12 },
  heal: { name: '회복', kind: 'support', verb: '회복시킨다', count: 6 },
  focus: { name: '사거리 강화', kind: 'equipment', verb: '사거리를 강화한다', count: 6 },
  cut: { name: '카드 파괴', kind: 'disrupt', verb: '카드를 파괴한다', count: 5 },
  steal: { name: '카드 훔치기', kind: 'disrupt', verb: '카드를 훔친다', count: 4 },
  duel: { name: '결투', kind: 'attack', verb: '결투를 건다', count: 3 },
  storm: { name: '전체 공격', kind: 'attack', verb: '모두를 공격한다', count: 2 },
  foresight: { name: '추가 뽑기', kind: 'draw', verb: '카드 두 장을 더 뽑는다', count: 4 }
});

export function makeDeck() {
  const cards = [];
  for (const [type, spec] of Object.entries(CARD_TYPES)) {
    for (let i = 1; i <= spec.count; i++) {
      cards.push({ id: `${type}-${i}`, type, focus: type === 'focus' ? (i % 2 ? 2 : 3) : undefined });
    }
  }
  return cards;
}
