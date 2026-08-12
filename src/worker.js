// Cloudflare Worker 엔트리.
// 정적 자산(HTML/CSS/JS/이미지)은 기본적으로 Workers Static Assets(ASSETS 바인딩)가 서빙한다.
// /api/* 요청만 이 스크립트가 먼저 받아서(run_worker_first) 방 생성과 WebSocket 업그레이드를 처리한다.
//
// 규칙 코어(games/fantasy-bang/build/app/core/index.js)는 여기서 다시 구현하지 않는다.
// 실제 게임 로직과 권위 상태는 GameRoom Durable Object가 core/index.js를 그대로 불러와 사용한다.

import { GameRoom } from './game-room.js';

export { GameRoom };

function jsonResponse(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init.headers ?? {}) }
  });
}

function makeRoomId() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

function roomStub(env, roomId) {
  const id = env.GAME_ROOM.idFromName(roomId);
  return env.GAME_ROOM.get(id);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 방 생성: POST /api/rooms { playerCount, seed }
    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch { /* 빈 본문 허용 */ }
      const playerCount = Number(body.playerCount ?? 4);
      const seed = String(body.seed ?? `room-${crypto.randomUUID().slice(0, 8)}`).slice(0, 64);
      if (!Number.isInteger(playerCount) || playerCount < 3 || playerCount > 6) {
        return jsonResponse({ error: 'INVALID_PLAYER_COUNT' }, { status: 400 });
      }

      const roomId = makeRoomId();
      const stub = roomStub(env, roomId);
      const initRes = await stub.fetch('https://game-room.internal/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ playerCount, seed })
      });
      if (!initRes.ok) return jsonResponse({ error: 'ROOM_INIT_FAILED' }, { status: 500 });
      return jsonResponse({ roomId, wsPath: `/api/rooms/${roomId}/ws` });
    }

    // 게임 방 WebSocket 연결: GET /api/rooms/:roomId/ws?seat=&token=
    const wsMatch = url.pathname.match(/^\/api\/rooms\/([a-z0-9]{4,32})\/ws$/i);
    if (wsMatch) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return jsonResponse({ error: 'EXPECTED_WEBSOCKET_UPGRADE' }, { status: 426 });
      }
      const stub = roomStub(env, wsMatch[1]);
      return stub.fetch(request);
    }

    // 그 외 /api/* 는 정의되지 않은 경로.
    if (url.pathname.startsWith('/api/')) {
      return jsonResponse({ error: 'NOT_FOUND' }, { status: 404 });
    }

    return env.ASSETS.fetch(request);
  }
};
