# QA REPORT — 룬 크라운: 그림자 맹세

## 1. 환경표

| 항목 | 실측 |
|---|---|
| 권위 verify source commit | `51ba37051beae24a21f9594300e91b02d2232499` |
| GitHub Pages 배포 commit | `db710ce461937a9c56ca4afc63de805fdc823348` |
| targetRuntime | GitHub Pages / 최신 Chromium·Safari 정적 ESM 브라우저 |
| testedRuntime | Windows 11, Node `v24.16.0` x64, Codex in-app Chromium |
| 기동 | `node scripts/serve.mjs` 후 `http://localhost:4173/` |
| 로컬 내비게이션 | 38 / 40 / 50ms |
| 총 배포 파일 | 3,222,024 bytes / 예산 20MB 이내 |
| 인터랙션→두 번째 페인트 | p50 27.9ms / p95 30.6ms / 최악 30.9ms, 40표본 |
| long task | 정상 속도 17턴 완주 전 구간 0건 |
| 런타임 로그 | Chromium console error/warning 0건 |
| 뷰포트 | 1024×700, 390×844 세로, 844×390 가로 |
| 모바일 | 가로 넘침 0, 터치 버튼 최소 44px, 기능 라벨 최소 12px |
| 요청 엔드포인트 | `localhost:4173` 아래 루트 HTML, CSS 2, ESM 모듈, 영웅 이미지, 배경만. 외부 런타임 요청 0 |

인터랙션 측정은 클릭 캡처 직전에서 두 번의 `requestAnimationFrame`까지를 재므로, 60Hz의 두 페인트를 포함한 보수적 상한이다. 지속 렌더 루프는 없고 상태 변경 때만 DOM을 교체한다.

## 2. 명령

| 명령/실행 | exit | 시간 | 환경 | source commit | 결과 |
|---|---:|---:|---|---|---|
| `node scripts/verify.mjs` | 0 | 95,621ms | Node v24.16.0 win32 x64 | `51ba370…` | PASS |
| `node --test games/fantasy-bang/build/app/tests/*.test.mjs` | 0 | 2,144ms | verify 내부 | 동일 | 8/8 PASS |
| `node games/fantasy-bang/build/app/sim/run.mjs --seeds 200 --out games/fantasy-bang/qa/evidence` | 0 | 93.36초 | verify 내부 | 동일 | G1–G6 PASS |
| `node scripts/serve.mjs` + Chromium 실입력 | 0 | 17턴 / 약 50초 자동 입력 상한 | 정상 AI 420ms 박자, 가속 없음 | 동일 | 완주·재시작 PASS |
| 비밀 패턴 스캔 | 0 | <1초 | `rg` | 동일 | API 키·Firebase 인증정보 0건 |

권위 로그: `qa/evidence/verify.log`. `qa/verification.json`의 `환경 / verify / suites / completeRun / checkpoints`가 모두 위 커밋을 가리킨다.

## 3. suite discovery

| suite | discovered from | files | runner | observed in verify | result |
|---|---|---|---|---|---|
| `suite:core-rules-and-multiplayer` | `package.json#scripts.test`, `BUILD_BRIEF.md`, `scripts/verify.mjs` | `build/app/tests/core.test.mjs`, `rules.test.mjs` | Node test runner | yes, 8 tests | PASS |
| `suite:simulation` | `package.json#scripts.simulate`, `BUILD_BRIEF.md`, `scripts/verify.mjs` | `build/app/sim/run.mjs`, `policies.js` | Node ESM CLI, 200 seeds | yes | PASS |
| GitHub Pages deploy | `.github/workflows/pages.yml` | static repository artifact | GitHub Actions run `31456133052` | verify suite와 별도의 deploy job | PASS, 26초 |

vendored·build-output·archived fixture는 없다. Pages workflow는 테스트 suite가 아니므로 `ORPHANED_TEST_SUITE`로 세지 않았다. 발견된 required suite는 권위 verify에 모두 포함됐다.

## 4. 통과·실패 항목

| 검사 | 결론 | 증거 |
|---|---|---|
| 콜드 스타트·로딩 | PASS | `01`, 내비게이션 38–50ms |
| 비밀 역할·손패 격리 | PASS | `privacy:views`; 실전 UI 시점 전환 제거 |
| 카드 뽑기·장비·거리·공격·방어 | PASS | `03`–`06`, rules tests |
| 추방·역할 공개·거리 재계산 | PASS | `07`, `design-invariants.md` |
| 승패·정산 반향 3종 | PASS | `08` |
| 같은 시드 재시작 | PASS | `15` |
| 결정론 | PASS | `rules:determinism` |
| 이벤트 멱등성·버전 충돌·턴 권한 | PASS | `multiplayer:event` |
| 데스크톱·모바일 세로/가로 | PASS | `03`, `11`, `12`; 넘침 수치 0 |
| 저모션·음소거 | PASS | 상태 보존 실입력; 시각 피드백 유지 |
| 12세 등급 | PASS | 비현실 마법 피해, 유혈·훼손·성적 표현 0 |
| 오토플레이 6게이트 | PASS | `sim-report.md` |
| Firebase 실제 네트워크 | 장르 범위 제외 | 이벤트·뷰·권한 계약만 현재 범위 |
| GitHub Pages 실배포 | PASS | Actions run `31456133052` 성공, 원격 타이틀·맹세 모달·영웅 4장·배경 로드 확인 |

## 5. 증거 경로

- 권위 검증: `qa/verification.json`, `qa/evidence/verify.log`
- 시뮬레이션: `qa/evidence/sim-report.md`, `sim-results.json`
- 설계 불변량: `qa/evidence/design-invariants.md`
- 전제·2분 이해도: `qa/evidence/premise-gate.md`, `onboarding.md`
- 시각: `qa/evidence/01-title-desktop.jpg`–`16-github-pages-live.jpg`
- 실배포: `https://ehddus42-ship-it.github.io/FantasyBang/`, Actions run `31456133052`
- 생성 자산: `build/evidence/ASSET_QA.md`

## 6. 미테스트 범위

| 범위 | 사유 | 필요한 것 |
|---|---|---|
| Safari 고유 렌더·터치·WebAudio | `NOT_RUN: 현 세션에 Safari 런타임 없음` | macOS/iOS 실기기 Safari |
| Firebase 4–7인 실시간 방·재접속·보안 규칙 | 내일 연결 범위 | Firebase 프로젝트, Auth, Emulator Suite, Security Rules |
| 5–7인 성약기사 실전 밸런스 | 현재 슬라이스는 4인 | 확장 역할표·카드 풀·인간 테스트 |
| 10–20분 인간 체감 박자·재방문·리텐션 | 자동 입력 완주는 체감 시간을 증명하지 못함 | `PLAYTEST_PROTOCOL.md` 8명 시연 |
| 스피커의 실제 효과음 청취 | `NOT_RUN: 브라우저 자동화에 오디오 청취 채널 없음` | 인간 청취. 선택/카드/결계/피해/추방/승패 트리거 코드와 시각 중복 피드백은 확인 |

## 7. 독립 검증

- 구현 요약을 인용하지 않고 QA가 `node scripts/verify.mjs`를 별도 실행했다.
- `GAME_DESIGN.md`의 문턱을 역산해 `design-invariants.md`로 코어 상수·실행 상태와 항목별 비교했다.
- Codex in-app Chromium에서 소스 내부 상태 주입 없이 보이는 DOM 컨트롤만 클릭해 정상 속도 17턴을 완주했다.
- 기획·코드·README를 주지 않은 깨끗한 컨텍스트 재정자가 순서 화면만 보고 전제 4문과 2분 이해도를 축자로 답했다.
- 플레이어 가시 한국어 문안을 M1–M10 패턴으로 소스 전수 스캔했다.
- 자격증명 패턴과 런타임 외부 요청을 별도 점검했다.

## 8. 발견·환류표

| 번호 | 심각도 | 귀속 단계 | 복검 증거 |
|---|---|---|---|
| 1 | `major` 해소 | build | 390px에서 그리드 min-content가 897px로 늘어나던 것을 `min-width:0`·width 100%로 수정. `11`, scrollWidth 390 |
| 2 | `major` 해소 | build | AI 좌석으로 시점을 바꾸어 비공개 역할/손패를 볼 수 있던 편의 UI 제거. `privacy:views`, `03` |
| 3 | `minor` 해소 | build | 공격 기록에 대상을 추가하고 AI 반응을 `결계 또는 피해를 고른다`로 명시. `06`, 깨끗한 재정자 복검 |
| 4 | `minor` 해소 | build | `왕관 인장`을 `왕관수호자 생명력`으로 수정하고 공격 후 손패 한도 미리보기 추가. `05`, `06` |
| 5 | 이번 최종 회차 미발견 | — | 열린 blocker 0, major 0 |

해소 항목은 최종 심각도 계수에 남기지 않되, 발견과 환류 이력은 숨기지 않았다.

## 9. 시뮬레이션 게이트 재실행

| 게이트 | 실측 | 임계 | 결론 |
|---|---:|---:|---|
| G1 지배 전략 부재 | 최고 점유 참격 23.1%, 대표 546상태 | ≤60% | PASS |
| G2 무작위 대비 우위 | 기준 47.5% vs 무작위 21.0%, +26.5%p | ≥25%p | PASS |
| G3 결정 엔트로피 | 0.849 | ≥0.35 | PASS |
| G4 데드락 | 빈 행동 0, 96턴 상한 0.0% | 0, <1% | PASS |
| G5 긴장 곡선 | 진폭 중앙 1.00, 회복 구간 97.0% | ≥0.35, >50% | PASS |
| G6 수치 예산 | 초기 등급 문턱 장르 미적용; 읽히지 않는 노출 필드 0 | 0 | PASS |

## 10. 시그니처 프레임 축차 대조

| 프레임 | 진짜 트리거 조작 경로 | 스크린샷 | 요소 대조 결론 |
|---|---|---|---|
| S1 균열왕관이 눈을 뜨다 | 새 페이지 진입 | `01-title-desktop.jpg` | 금빛 왕관, 남색 균열왕좌, 제목, CTA 출현 |
| S2 봉인을 혼자 읽는다 | `영웅을 소환한다` | `02-oath-desktop.jpg` | 리아나·수호자·개인 목표·종료 조건 출현 |
| S3 룬을 겨눈다 | 초점 장비→참격 카드 선택 | `05-target-selection-desktop.jpg` | 선택 카드 상승, 3명 표적 테두리, 대상별 손패 한도 미리보기 |
| S4 결계를 펼친다 | 아우렐리아 공격 | `06-reaction-desktop.jpg` | 즉시 반응, 반응 주체·선택 명시 |
| S5 맹세가 드러난다 | 결투로 아우렐리아 HP 0 | `07-first-exile-desktop.jpg` | 회색 추방 좌석, `최후성` 공개, 3인 결계 |
| S6 왕관이 주인을 고른다 | 왕관수호자 HP 0 | `08-result-desktop.jpg` | 패배 원인, 17턴, 승리 진영, 반향 3종, 재시작 |
| S7 판을 가리지 않고 읽는다 | 규칙/접근성 열기→닫기 | 런타임 DOM 실입력 | 턴·선택 상태 보존, 저모션 결과 보존 |

가짜 실행, 중복 타일, 글자 겹침, 잔상은 발견되지 않았다.

## 11. 캐논 대조표

| WORLD_CANON 항목 | 실제 게임 | 결론 |
|---|---|---|
| 균열왕관·균열왕좌·영혼인장·맹세·룬 경로 | 중앙 왕관, HP 마름모, 역할 봉인, 원형 거리 | 일치 |
| 왕관수호자 공개+HP 1 | 수호자만 공개, HP 5 | 일치 |
| 맹세는 본인만 읽고 추방 시 공개 | 좌석별 private view, `07` 역할 공개 | 일치 |
| 최단 룬 경로·초점 하나 | 원형 거리, 초점 교체 | 일치 |
| 상처가 손패 한도를 태움 | HP=정리 한도, 공격 미리보기 | 일치 |
| 턴당 주력 공세 1 | 슬래시 플래그, 라그나 예외 | 일치 |
| 추방은 불가역, 원이 닫힘 | 부활 없음, alive 좌석만 거리 사용 | 일치 |
| 역할 서열 | 수호/균열/최후성의 승리 조건 | 일치 |
| 성약기사 | 5–7인 다음 단계에만 예약 | 현재 4인 범위 제외, 누락 아님 |
| 영웅 10명·성인·능력 서열 | 데이터 10명, 오리지널 초상 10종, 고유 능력 | 일치 |

근거 없이 격상된 인물, 가변 수치가 된 고정 규칙, 부활 같은 불가역 파괴는 없다.

## 12. 한국어 문안 감사

| 검사 | 히트 | 결론 |
|---|---:|---|
| M1 `A가 아니라 B` | 0 | PASS |
| M2 전지 시점 스포일러 | 0 | PASS |
| M3 괄호 조사 | 0 | PASS |
| M4 약화 부사군 | 0 | PASS |
| M5 번역투 직유 | 0 | PASS |
| M6 3연 대구·열거 | 0 | PASS |
| M7 `~다` 3문장 연속 | 플레이어 서술면 0 | PASS |
| M8 문학투 상투구 | 0 | PASS |
| M9 표정 상투구 | 0 | PASS |
| M10 만능 부사절 | 0 | PASS |
| C1 줄표·말줄임 남용 | 0 | PASS |
| C2 문어체 종결 | 0 | PASS |
| C3 성조 불일치 | 발견 0 | PASS |
| 고정 명령 버튼 동사형 | 13/13 | 100%, ≥80% |

7면(데이터 문안, 버튼/힌트, 잠금 사유, 오류/토스트, 관계 회독, 정산, 접근성)을 점검했다. 잠금·관계 대사가 없는 단판 카드 구조는 장르 미적용으로 분리했다. 10영웅은 현재 발화 대사가 아니라 능력·로그의 중립 시스템 문안으로만 등장하므로 인물별 화계 드리프는 발생하지 않았다.

## 13. 모델 시연 수기 — PASS 판정 불참

- 가장 망설인 지점: 첫 공격. 열린 적대 정보가 없어 누군가를 찍어야 했다. `공격과 구원이 충성 발언`의 탐색 성격은 살았지만 첫 판은 선택 근거가 약했다.
- 가장 무감한 지점: 손패가 많은 초반의 반복 카드 사용. 대상·손패 한도 미리보기와 AI 공개 힌트를 추가한 후 선택의 의미가 더 잘 보였다.
- 가장 늘어진 구간: 버림 단계가 연속되는 중반. `상처가 선택을 태운다`는 보이지만 인간 시연에서 박자를 다시 봐야 한다.
- 종료 후 재시작: 다른 맹세·영웅의 상호작용을 확인하려고 다시 하고 싶었다. 다만 재시작 의향은 인간 8명 프로토콜로 넘긴다.

## 14. 세 가지 재정

| 재정 | 결론 | 관찰 근거 |
|---|---|---|
| 첫 조작 | PASS | CTA→맹세→첫 카드가 먹히고, 힌트·대상·반응이 즉시 변화. 깨끗한 재정자가 1–4문을 전부 답하고 `BANG!`을 리터럴로 지목. 스킵 배치도 통과 |
| 핵심 판타지 연출 | PASS | 공격 로그가 대상과 충성 단서를 남기고, 상처가 HP/손패 한도를 함께 줄이며, 첫 추방이 역할·거리를 동시에 바꾸는 장면 출현 |
| 시그니처 프레임 부합 | PASS | S1–S7 진짜 트리거 프레임에 필수 요소 출현, 가림·중복 렌더 없음 |

## 15. PASS/FAIL 재정

**PASS** — 열린 `blocker` 0건, `major` 0건이고, 로딩·핵심 동작·추방·결말·재시작에 실행 증거가 있으며 200시드 시뮬레이션 6게이트가 모두 통과했다.

재미·장기 밸런스·리텐션·상업 완성도는 이 판정에 포함하지 않고 `PLAYTEST_PROTOCOL.md`로 인계한다.
