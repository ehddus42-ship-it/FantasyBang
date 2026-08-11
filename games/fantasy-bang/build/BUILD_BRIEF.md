# BUILD BRIEF — 룬 크라운: 그림자 맹세

## 완제품 목표

- 목표 플랫폼: 최신 Chromium/Safari 계열 브라우저와 GitHub Pages에서 실행되는 바닐라 HTML/CSS/JavaScript 정적 앱.
- 인도물: 저장소 루트 `index.html`이 `build/app/ui/main.js`를 import한다. 코어·UI·시뮬레이션의 캐노니컬 소스는 `build/app/` 아래에 있다.
- 수용자와 언어: 한국의 라이트~중도 전략/서브컬처 이용자, 첫 인터페이스 언어 한국어.
- 완전 체험: 사람 1명+AI 3명의 재시작 가능한 4인 완결 단판, 목표 10~20분.
- 뷰포트: 데스크톱 1440×900, 최소 1024×700, 모바일 최소 390×844 세로 및 가로 지원. 창 모드 브라우저.
- 성능 예산: 첫 상호작용 가능 2.5초 이내(일반 광대역), 전체 배포 파일 20MB 이내, 전환/이펙트 60fps 목표.

## 필독 설계

- `games/fantasy-bang/design/GAME_DESIGN.md`
- `games/fantasy-bang/design/ART_DIRECTION.md`

## 반드시 보존

핵심 순환은 `뽑기 → 장비·공격·지원·교란 → 반응 → 생명력만큼 손패 정리 → 다음 좌석`이다. 세계 규칙은 공격과 구원이 공개 충성 신호가 되고, 피해가 생명력과 손패 한도를 함께 줄이며, 첫 추방이 역할 공개와 거리 재계산을 일으키는 것이다. 시각 스타일은 청금색·자주색·금색의 마법 궁정, 중앙 균열왕관, 원형 좌석, 명확한 실루엣과 기능별 중복 부호다.

### 시그니처 순간

- S1 `균열왕관이 눈을 뜬다`: 타이틀 진입 때 금빛 왕관 균열, 영웅 후광, 제목과 시작 버튼이 차례로 나타난다.
- S2 `봉인을 혼자 읽는다`: 게임 시작과 시점 전환 뒤 선택 영웅·개인 역할·목표를 모달에서 공개한다.
- S3 `룬을 겨눈다`: 손패 카드를 선택하면 카드가 들리고 합법 행동 버튼에 대상 이름과 동사가 나타난다.
- S4 `결계를 펼친다`: 참격 대상의 즉시 반응 단계에서 결계 또는 피해 수용을 고른다.
- S5 `맹세가 드러난다`: 생명력 0에서 추방, 역할 공개, 다음 살아 있는 좌석 거리 재계산이 한 상태 전이로 처리된다.
- S6 `왕관이 주인을 고른다`: 종료 조건 성립 때 승패·승리 진영·턴 수와 재시작 입력이 표시된다.
- S7 `판을 가리지 않고 읽는다`: 규칙·접근성 모달이 선택 상태를 보존하고 닫힌다.

### 반증 가능한 시각 단언

- 배경은 자정 남색 패널, 금빛 중앙 왕관, 청금·자주 기능광을 쓴다.
- 데스크톱 판 중앙에 왕관, 둘레 네 좌석, 하단 손패가 배치된다. 모바일은 폭 900px/520px 중단점에서 세로로 리플로한다.
- 카드 기능은 색만이 아니라 테두리·룬 문자·동사·카드명으로 함께 구분한다.
- 순간 문자는 화면 중앙 아래 피드백 밴드에 남색 백플레이트와 크림색 윤곽으로 표시한다.
- 얼굴 중심, 생명력, 공개 역할, 카드명과 효과는 다른 UI에 가려지지 않아야 한다.

### 미술 필수 자산 키와 폴백

- `hero.aurelia`, `hero.selene`, `hero.kai`, `hero.liana`, `hero.bram`, `hero.miriel`, `hero.ragna`, `hero.yuna`, `hero.theo`, `hero.nevia`: `assets/heroes/*.jpg`. 로드 실패 시 영웅 첫 글자와 그라디언트 실루엣.
- `background.throne`: `assets/backgrounds/throne.jpg`. 로드 실패 시 CSS 자정 남색 방사 그라디언트.
- `role.guardian`, `role.knight`, `role.rift`, `role.laststar`, `seal.closed`: 문자·CSS 기하 문양으로 제공.
- `card.slash`, `card.ward`, `card.heal`, `card.focus`, `card.cut`, `card.steal`, `card.duel`, `card.storm`, `card.foresight`: 문자 룬+테두리+동사로 제공.
- `soulSeal`, `distanceKnot`: 채움/빈 마름모와 거리 숫자로 제공.
- 과도 상태: 추가 포즈·후광·입자·배경 음악은 정적 테두리와 무음으로 강등 가능. 생산 대기 등록처는 본 절이다.

동적 미디어는 없다. 음성 전략은 `none`이라 음성 자산 대장은 장르 미적용이다. WebAudio의 합성 효과음은 첫 사용자 제스처 뒤 선택·카드·방어·피해·승패에만 울리며 음소거 시 시각 상태가 그대로 남는다.

### 상태 연기 규칙

- 현재 턴 좌석은 금색 테두리, 추방 좌석은 회색·저명도, 공개 역할은 역할명 문자로 변한다.
- 생명력은 채운/빈 마름모와 숫자로 읽힌다.
- 공격·지원·교란은 행동 기록에 즉시 남고 AI의 공개 행동 기반 의심 갱신에 들어간다.
- `prefers-reduced-motion`과 앱의 움직임 줄이기 선택은 전환을 즉시 상태 교체로 강등한다. 결과와 반응 박자는 보존한다.

### 인터페이스 언어와 문안 성조

압축된 판타지 구어, 짧은 현재형, 세계 안의 물건과 동작으로 말한다. 버튼은 `영웅을 소환한다`, `맹세를 품는다`, `룬을 겨눈다`, `결계를 펼친다`, `턴을 넘긴다`, `새 의식을 연다`처럼 동사로 시작한다. 금지 문형은 `A가 아니라 B였다`, 전지 시점 스포일러, 괄호 조사, 문학투 상투구, `당신` 남발, `성공적으로`, `오류가 발생했습니다`, 설명충 대사다.

### 전제 화면 문구

- 영웅 공개: `너는 {영웅}. 균열왕좌에 소환됐다.`
- 왕관수호자: `왕관은 숨지 못한다. 균열단 둘과 최후성을 모두 추방하라.`
- 균열단: `봉인을 숨겨라. 왕관수호자가 쓰러지는 순간 균열이 열린다.`
- 최후성: `어느 편에도 서지 마라. 마지막에 왕관수호자를 직접 추방하라.`
- 상주 종료 조건: `왕관수호자가 쓰러지면 즉시 승패를 가른다. 적대 맹세가 모두 드러나도 의식은 끝난다.`
- 첫 행동: `주문 두 장을 받았다. 빛나는 카드부터 한 장 써 봐.`

### 동일 플레이 동사

1. `카드 두 장을 뽑는다.` — 턴 진입이 자동 입력하며 덱·손패·로그가 변한다.
2. `유물을 장비해 도달 가능한 대상을 바꾼다.` — 초점 카드를 눌러 장비하고 합법 참격 대상이 변한다.
3. `원형 좌석 거리로 대상을 선택한다.` — 카드 선택 뒤 대상별 행동 버튼을 누르며 합법 거리 검증을 거친다.
4. `공격하고 즉시 방어한다.` — 참격 뒤 반응 단계에서 결계를 펼치거나 받아내며 손패·생명력이 변한다.
5. `공개된 공격·지원·교란 행동으로 비밀 진영을 추론한다.` — 기록 패널과 공개 역할을 읽고 다음 카드·대상을 고르며 AI 의심 상태도 갱신된다.

### 3단 아크

| 기 | 신규 사용 가능 동사·도달 공간 | 플레이 변화 | 관찰 가능한 종료 마커 |
|---|---|---|---|
| 탐색기 | `장비하기`; 기본 거리 밖 좌석을 마도초점으로 연다. | 첫 공격·지원 신호로 임시 진영 가설을 만든다. | 네 좌석이 첫 턴을 마친다. |
| 성장기 | `교란하기·타인 지원하기`; 손패·유물·회복 대상을 진영 판단에 쓴다. | 방어를 걷고 생존을 연장하며 첫 추방 순서를 설계한다. | 첫 영웅이 추방되고 맹세가 공개된다. |
| 성숙기 | `공개 역할로 재평가하기`; 추방으로 새로 가까워진 좌석에 도달한다. | 이전 행동을 다시 읽고 역할별 종료 조건을 직접 닫는다. | 왕관 추방 또는 적대 맹세 전원 추방. |

소셜 표현은 사람 1명+AI 3명의 순수 싱글이다. AI를 온라인 사람으로 표시하지 않는다. 모든 좌석은 사람/AI로 교체할 수 있다.

### 하네스 노출 상태 → 구현 심볼

- 시드·버전: `GameState.seed`, `GameState.stateVersion`
- 단계·턴·라운드: `phase`, `turnSeat`, `round`, `totalTurns`
- 좌석 공개 상태: `publicView().players[]`
- 자기 역할·손패: `privateView().private`, `getState()`
- 공개 행동·덱 수: `actionLog`, `deckCount`, `discardCount`
- 왕관·생존·공개 역할: `crownHp`, `aliveSeats`, `revealedRoleCount`
- AI 검사: `aiInspectionView().ai[]`
- 인간 위험 지표: `getState().humanRisk` = 현재 손패 수
- 종료·승리·반향: `over`, `winningFaction`, `winners`, `endReason`, `echoes`, `result()`
- 합법 행동: `legalActions()`의 `play`, `react`, `discard`, `endTurn`, `restart`, `hero`

## 범위

포함: 4인 완결 단판, 10영웅, 정확히 60장의 9카드군, 역할 추리, 원형 거리, 즉시 반응, AI, 같은/새 시드 재시작, 공개/좌석별 개인 뷰, 사람/AI 좌석 교체, 결정적 이벤트, 로컬 전송과 Firebase 전달 계약, 반응형 UI, WebAudio 피드백, 접근성/저모션, Node 테스트와 오토플레이.

제외: 실제 Firebase, 계정, 온라인 방, 5~7인 실전, 성약기사 실전 배치, 장기 성장, 결제, 장기 밸런스 확정.

## 구현 자유

의존성 없는 바닐라 ESM을 사용한다. 코어는 DOM·Canvas·타이머·`Math.random`·`Date.now`·`window`를 참조하지 않는다. `newGame / getState / legalActions / step / isOver / result` 여섯 함수를 노출한다. 모든 난수는 `rng.js`의 시드 상태를 통과한다. UI는 코어의 합법 행동과 상태만 렌더한다.

Firebase 확장 계약은 `{gameId,eventId,sequence,seat,baseVersion,action}` 이벤트, 한 번만 적용하는 `eventId`, 좌석/턴 권한 검사, 버전 충돌 스냅샷, 동일 전체 상태에서 파생한 공개/개인 뷰다. 현재 `createLocalTransport()`가 메모리에서 이를 구현한다.

## 툴체인과 권위 검증

```yaml
toolchain:
  targetPlatform: GitHub Pages / latest Chromium and Safari
  targetRuntime: static browser ESM
  testedRuntime: Node.js core/headless simulation on Windows and Codex in-app Chromium browser
  engine: vanilla HTML/CSS/JavaScript
  engineVersion: N/A
  runtime: Node.js
  runtimeVersion: v24.16.0
  packageManager: npm@11.13.0
  browser: Chromium at 1024×700, 390×844 portrait, and 844×390 landscape
commands:
  install: NONE
  buildOrExport: NONE
  start: node scripts/serve.mjs
  verify: node scripts/verify.mjs
  simulate: node games/fantasy-bang/build/app/sim/run.mjs --seeds 200 --out games/fantasy-bang/qa/evidence
verification:
  suites: [suite:core-rules-and-multiplayer, suite:simulation]
  completeRun: games/fantasy-bang/qa/verification.json#completeRun
  evidenceIndex: games/fantasy-bang/qa/verification.json#checkpoints
  simulation: games/fantasy-bang/qa/evidence/sim-report.md
```

## 완료 증거와 현재 제한

- `npm.cmd test`: 8/8 PASS. 10영웅·60장·역할 구성, 결정성, 공개/개인 필터, 합법 행동, 이벤트 권한/중복/버전 충돌, 좌석 교체, 128시드 완주, 초점 사거리, 즉시 반응을 검사했다.
- 200시드 × 7정책 권위 실행: G1~G6 전체 PASS. 전략 기준 정책은 진짜 균등 무작위보다 승률 26.5%p 우위, 턴 상한·데드락 0건, 선택 여력 회복 구간 97.0%다. 실제 수치는 `qa/evidence/sim-report.md`에 있다.
- 1,000시드는 예상 총 실행이 3분을 넘어 오토플레이 계약이 허용한 200시드 층화 표본으로 낮췄고, 축소 사실·사유·대표 상태 수를 리포트에 명시했다.
- Chromium 실게임: 고정 시드 `moon-042`를 정상 속도로 17턴 완주해 균열단 승리, 첫 추방, 즉시 반응, 결과 화면, 같은 시드 재시작을 확인했다. 런타임 콘솔 오류는 0건이다.
- 크기·입력: 1024×700, 390×844, 844×390에서 가로 넘침 0, 모바일 터치 버튼 최소 44px을 확인했다. 역할/손패 시점 전환 UI는 실전 화면에서 제거해 타 좌석 비공개 정보를 열람할 수 없다.
- 성능·용량: 로컬 브라우저 내비게이션 38–50ms, 사용자 입력→두 번째 페인트 p50 27.9ms / p95 30.6ms / 최악 30.9ms, long task 0건이다. 전체 파일은 3,222,024 bytes로 20MB 상한 이내다.
- targetRuntime과 testedRuntime 차이: Safari 고유 터치/성능은 `NOT_RUN: 현 세션에 Safari 런타임 없음`이다. GitHub Pages Actions run `31456133052`는 26초에 성공했고, 원격 Chromium에서 타이틀·맹세 모달·영웅 이미지·배경을 재확인했다.

장르 충실도 4문은 세계/AI가 행동 기록에 반응하고, 각 카드가 구별된 상태를 바꾸며, 비밀 맹세가 반복 공격·지원 동사에 연결되고, 합법 행동이 복수 선택지를 제공함으로 이행됐다. 독립 200시드 재실행에서 G1–G6가 전부 통과해 현 프로토타입 밸런스 게이트는 GO다.

## 최종 범위 대조 — 2026-08-11

- 증가: 없음.
- 감소: 실제 Firebase·5~7인·성약기사 실전 배치는 계획대로 제외했다. 발행 이미지 11개는 외부 병렬 작업이 제공했으며 코드는 결손 폴백도 유지한다.
- 미완 검증: Safari 고유 런타임과 실제 Firebase 네트워크. Chromium 시각/입력/반응형, 헤드리스 규칙·멀티플레이 계약·200시드 권위 시뮬레이션은 통과했다.
