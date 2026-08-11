export const ROLE = Object.freeze({ GUARDIAN: 'guardian', RIFT: 'rift', LASTSTAR: 'laststar', KNIGHT: 'knight' });

export const ROLE_LABELS = Object.freeze({
  guardian: '왕관수호자', rift: '균열단', laststar: '최후성', knight: '성약기사'
});

export const ROLE_GOALS = Object.freeze({
  guardian: '왕관은 숨지 못한다. 균열단 둘과 최후성을 모두 추방하라.',
  rift: '봉인을 숨겨라. 왕관수호자가 쓰러지는 순간 균열이 열린다.',
  laststar: '어느 편에도 서지 마라. 마지막에 왕관수호자를 직접 추방하라.',
  knight: '왕관 곁을 지켜라. 적대 맹세가 모두 꺼질 때까지 버텨라.'
});

export const HEROES = Object.freeze([
  ['aurelia', '아우렐리아', '피격 뒤 다음 턴 첫 참격 사거리 +1'],
  ['selene', '셀레네', '타인에게 가호를 쓰면 턴당 한 번 1장 뽑기'],
  ['kai', '카이', '절단·갈취의 거리 +1'],
  ['liana', '리아나', '기본 참격 사거리 +1'],
  ['bram', '브람', '라운드 첫 생명력 피해 1회 무효'],
  ['miriel', '미르엘', '턴당 한 번 카드 2장을 버려 1 회복'],
  ['ragna', '라그나', '생명력 1일 때 참격을 두 번 사용'],
  ['yuna', '유나', '기본 뽑기 때 3장을 보고 2장을 얻음'],
  ['theo', '테오', '초점 장비 뒤 턴당 한 번 1장 뽑기'],
  ['nevia', '네비아', '참격 피해를 주면 다음 기본 뽑기 -1']
].map(([id, name, ability]) => Object.freeze({ id, name, ability })));

export const CARD_TYPES = Object.freeze({
  slash: { name: '룬 참격', kind: 'attack', verb: '룬을 겨눈다', count: 18 },
  ward: { name: '결계', kind: 'defense', verb: '결계를 펼친다', count: 12 },
  heal: { name: '월광 가호', kind: 'support', verb: '인장을 살린다', count: 6 },
  focus: { name: '마도초점', kind: 'equipment', verb: '초점을 장비한다', count: 6 },
  cut: { name: '기억 절단', kind: 'disrupt', verb: '기억을 끊는다', count: 5 },
  steal: { name: '그림자 갈취', kind: 'disrupt', verb: '주문을 낚아챈다', count: 4 },
  duel: { name: '맹세 결투', kind: 'attack', verb: '결투를 건다', count: 3 },
  storm: { name: '균열 폭풍', kind: 'attack', verb: '폭풍을 연다', count: 2 },
  foresight: { name: '별의 예지', kind: 'draw', verb: '별을 읽는다', count: 4 }
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
