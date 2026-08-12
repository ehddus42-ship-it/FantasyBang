// Cloudflare Workers Static Assets로 배포할 파일만 dist/ 에 모은다.
// 저장소 전체를 정적 자산으로 내보내지 않기 위해, 실제 브라우저가 필요로 하는
// 파일만 명시적으로 골라서 복사한다 (design/canon/qa/테스트/시뮬레이션 스크립트는 제외).
//
// 사용: node scripts/build-static.mjs

import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');

const ENTRIES = [
  'index.html',
  '.nojekyll',
  'assets',
  'games/fantasy-bang/build/app/core/data.js',
  'games/fantasy-bang/build/app/core/index.js',
  'games/fantasy-bang/build/app/core/rng.js',
  'games/fantasy-bang/build/app/core/transport.js',
  'games/fantasy-bang/build/app/core/cloudflare-transport.js',
  'games/fantasy-bang/build/app/ui/main.js',
  'games/fantasy-bang/build/app/ui/audio.js',
  'games/fantasy-bang/build/app/ui/styles.css',
  'games/fantasy-bang/build/app/ui/responsive.css',
  'games/fantasy-bang/build/app/sim/policies.js' // 오프라인(로컬 AI) 싱글플레이 모드에서 여전히 필요하다.
];

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  for (const entry of ENTRIES) {
    const src = join(ROOT, entry);
    const dest = join(DIST, entry);
    await mkdir(dirname(dest), { recursive: true });
    await cp(src, dest, { recursive: true });
  }

  console.log(`build-static: dist/ 에 ${ENTRIES.length}개 항목을 복사했다.`);
}

main().catch(err => {
  console.error('build-static 실패:', err);
  process.exit(1);
});
