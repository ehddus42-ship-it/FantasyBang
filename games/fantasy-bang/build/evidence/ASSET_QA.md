# Meshy 이미지 자산 검수

- 검수일: 2026-08-11
- 생성 모델: Meshy Image-to-Image API `nano-banana-2`
- 이번 일본 애니메이션풍 재생성 크레딧: 60 (영웅 10종 × 6)
- 누적 Meshy 크레딧: 126 (초기 영웅·배경 66 + 이번 영웅 재생성 60)
- 권리 경계: 기존 보드게임의 캐릭터·카드 도상·레이아웃을 참조하지 않은 오리지널 프롬프트
- 공통 스타일: 성인 영웅, 현대 일본 라이트노벨·모바일 RPG풍 얼굴과 선화, 셀 채색, 원소색 후광, 테두리 없는 풀블리드 배경

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

- 모든 초상은 1024×1024 원본이며 UI 크롭에서 얼굴·상징 무기·원소색이 함께 남는다.
- 초상끼리 주 실루엣과 색이 겹치지 않아 작은 모바일 좌석에서도 구분 가능하다.
- 배경은 중앙과 네 가장자리 좌석을 비워 두어 HUD·카드·상태 배지를 덮지 않는다.
- 생성 PNG는 웹용 JPEG로 최적화해 프로젝트에 반영했다. 영웅 초상 10종은 총 2,366,464 bytes이며 전체 정적 배포 예산 20MB 안을 유지한다.
