# Meshy 이미지 자산 검수

- 검수일: 2026-08-11
- 생성 모델: Meshy Image API `nano-banana-2`
- 사용 크레딧: 66 (영웅 10종 + 배경 1종, 각 6)
- 권리 경계: 기존 보드게임의 캐릭터·카드 도상·레이아웃을 참조하지 않은 오리지널 프롬프트
- 공통 스타일: 성인 영웅, 만화풍 셀 셰이딩, 짙은 남색과 금색 장식, 카드 프레임, 원소색 후광

## 파일별 판독성

| 파일 | 캐릭터/용도 | 시각 식별자 | 결과 |
|---|---|---|---|
| `assets/heroes/aurelia.jpg` | 아우렐리아 | 태양빛 금갑과 검 | 통과 |
| `assets/heroes/selene.jpg` | 셀레네 | 은빛 월광과 치유 지팡이 | 통과 |
| `assets/heroes/kai.jpg` | 카이 | 보랏빛 그림자와 단검 | 통과 |
| `assets/heroes/liana.jpg` | 리아나 | 청록 바람과 활 | 통과 |
| `assets/heroes/bram.jpg` | 브람 | 중장갑과 대형 방패 | 통과 |
| `assets/heroes/mirel.jpg` | 미르엘 | 연금술 병과 분홍 초승달 | 통과 |
| `assets/heroes/ragna.jpg` | 라그나 | 붉은 용갑과 창 | 통과 |
| `assets/heroes/yuna.jpg` | 유나 | 별자리와 천구의 | 통과 |
| `assets/heroes/theo.jpg` | 테오 | 청색 룬검 | 통과 |
| `assets/heroes/nevia.jpg` | 네비아 | 얼음 결정과 옅은 청색 머리 | 통과 |
| `assets/backgrounds/throne.jpg` | 게임 보드 배경 | 금빛 균열 왕관, 네 좌석 원형 결계 | 통과 |

## 배치 검수

- 모든 초상은 세로 카드 크롭에서 얼굴·상징 무기·원소색이 함께 남는다.
- 초상끼리 주 실루엣과 색이 겹치지 않아 작은 모바일 좌석에서도 구분 가능하다.
- 배경은 중앙과 네 가장자리 좌석을 비워 두어 HUD·카드·상태 배지를 덮지 않는다.
- 모든 PNG를 포함한 이미지 총량은 약 9.3MB로 20MB 정적 배포 예산 안이다.
