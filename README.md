# 반역

원형 좌석 거리와 비밀 역할 추리를 결합한 오리지널 판타지 카드 배틀이다. 현재 버전은 플레이어 1명과 AI 3명이 하는 4인 단판이며, GitHub Pages에서 바로 실행된다.

- 10종 영웅, 9종·60장 카드
- 공개 왕 1명, 비밀 반역자 2명, 비밀 야심가 1명
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

## Firebase 멀티플레이 다음 단계

규칙 코어와 전송 계층을 분리했다. `createLocalTransport()`는 현재 메모리에서 동작하지만, 다음 이벤트 계약을 그대로 Firebase 어댑터에 전달할 수 있다.

```text
{ gameId, eventId, sequence, seat, baseVersion, action }
```

이미 구현된 경계:

- 공개 상태와 좌석별 역할·손패 비공개 뷰
- 현재 턴/반응 좌석 권한 검사
- `eventId` 멱등성과 `baseVersion` 충돌 검사
- 재동기화용 스냅샷
- 좌석별 사람/AI 컨트롤러 교체

내일 Firebase에서는 방·로그인·재접속·4–7인 역할 배치를 붙이고, 클라이언트에는 반드시 자기 좌석의 `privateView` 만 전송해야 한다. 서버에서 전체 상태를 저장하더라도 다른 플레이어의 비밀 정보를 동일 문서로 배포하면 안 된다.

## 권리 경계

`BANG!`과 `Samurai Sword`의 일반적 플레이 구조만 참고했다. 원작 고유명·카드 문구·캐릭터·도상·레이아웃·미술 자산은 사용하지 않았다.
