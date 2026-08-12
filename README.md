# 반역

원형 좌석 거리와 비밀 역할 추리를 결합한 오리지널 판타지 카드 배틀이다. 현재 버전은 플레이어 1명과 AI 2~5명이 하는 3~6인 단판이며, GitHub Pages에서 바로 실행된다.

- 10종 영웅, 9종·60장 카드
- 3인 공개 역할 특수전, 4~6인 공개 왕과 비밀 부관·반역자·야심가
- 마지막 피해로 캐릭터를 처치한 플레이어만 즉시 카드 3장 뽑기
- 시드 기반 결정론 코어
- 1440×900 PC 데스크톱 우선, 모바일 보조 대응 한국어 UI
- Meshy AI로 생성한 일본 애니메이션풍 영웅 초상 10종과 판타지 전장 배경

## 로컬 실행

```powershell
node scripts/serve.mjs
```

그런 뒤 `http://localhost:4173/`를 열면 된다. 설치할 의존성은 없다.

## 검증

```powershell
npm.cmd test
node scripts/verify.mjs
```

## Cloudflare 온라인 멀티플레이 (베타)

규칙 코어와 전송 계층을 분리해 둔 덕에, Firebase 대신 **Cloudflare Workers Static Assets + Durable Objects**로 실시간 3~6인 플레이를 구현했다.

```text
{ gameId, eventId, sequence, seat, baseVersion, action }
```

구조:

- `src/worker.js` — 정적 자산(HTML/CSS/JS/이미지)은 그대로 서빙하고, `/api/*` 요청만 Worker가 가로챈다.
- `src/game-room.js` — 방 하나 = `GameRoom` Durable Object 하나. 좌석 배정·재접속 토큰·이벤트 검증·AI 턴 진행을 여기서 처리한다.
- `games/fantasy-bang/build/app/core/cloudflare-transport.js` — 클라이언트 쪽 WebSocket transport. `createLocalTransport()`와 같은 모양(`send`/`raw`/`subscribe`)이라 UI 코드는 두 transport를 거의 그대로 오간다.

이미 구현된 경계 (`GameRoom`이 `core/index.js`의 `newGame/applyEvent/publicView/privateView/setController`를 그대로 사용한다):

- 공개 상태와 좌석별 역할·손패 비공개 뷰 — 서버는 항상 `publicView`/`privateView`만 클라이언트로 보낸다.
- 현재 턴/반응 좌석 권한 검사, `eventId` 멱등성, `baseVersion` 충돌 검사 — 전부 `applyEvent()`에서 그대로 재사용.
- 재접속: 브라우저 localStorage에 저장한 좌석 토큰으로 같은 좌석에 다시 접속.
- AI 좌석은 서버(`GameRoom.advanceAi()`)가 `sim/policies.js`의 `chooseAction()`으로 직접 진행시킨다 — 클라이언트는 더 이상 AI 턴을 계산하지 않는다.

로컬에서 Cloudflare 백엔드로 실행/검증:

```powershell
npm.cmd run dev:cf        # wrangler dev — 브라우저 두 탭으로 방 생성/입장 테스트
npm.cmd run deploy:dry    # 실제 배포 전 dry-run
npm.cmd run deploy:cf     # 실제 배포
```

GitHub Actions로 배포하려면 저장소 시크릿에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 등록한 뒤 `.github/workflows/deploy-cloudflare.yml`을 Actions 탭에서 수동 실행(`workflow_dispatch`)한다. 로컬 `wrangler dev` 검증과 dry-run을 통과하기 전까지는 push 자동 배포를 걸지 않았다.

**아직 미완성인 부분** (다음 단계): 방 생성 후 초대 링크 공유 UX 다듬기, 재접속 중 잠깐 끊긴 좌석을 AI가 대신 두지 않는 문제(사람이 돌아올 때까지 그 좌석은 멈춘다), 액션 전송 재시도/ack. GitHub Pages는 Cloudflare 배포를 실제로 검증하기 전까지 그대로 유지한다.

## 권리 경계

`BANG!`과 `Samurai Sword`의 일반적 플레이 구조만 참고했다. 원작 고유명·카드 문구·캐릭터·도상·레이아웃·미술 자산은 사용하지 않았다.
