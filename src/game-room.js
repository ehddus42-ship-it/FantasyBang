// GameRoom Durable Object — 방 하나 = Durable Object 인스턴스 하나.
//
// 이 파일은 규칙을 다시 구현하지 않는다. newGame/applyEvent/publicView/privateView/
// setController/legalActions 를 core/index.js에서 그대로 가져와 "권위 상태"로만 사용한다.
// AI 좌석은 sim/policies.js의 chooseAction()으로 서버가 직접 진행시킨다(클라이언트는
// 더 이상 AI 턴을 계산하지 않는다 — 여러 클라이언트가 동시에 같은 AI 행동을 계산해
// 충돌하는 것을 막기 위함).
//
// 인수인계 문서의 필수 보장 사항:
// - eventId 멱등성        -> core/index.js의 applyEvent()가 appliedEventIds로 처리
// - seat 턴/반응 권한 검증  -> applyEvent()의 TURN_OWNERSHIP 검사
// - baseVersion 충돌 처리  -> applyEvent()의 VERSION_CONFLICT + 최신 publicView 반환
// - 서버만 전체 상태 보관   -> this.ctx.storage 에만 저장, 클라이언트에는 view만 전송
// - 공개/개인 뷰만 전송     -> publicView(state) / privateView(state, seat)
// - 재접속 시 좌석 소유권 확인 -> seatTokens 에 저장된 token과 대조

import {
  applyEvent,
  createEvent,
  legalActions,
  newGame,
  privateView,
  publicView,
  setController
} from '../games/fantasy-bang/build/app/core/index.js';
import { chooseAction } from '../games/fantasy-bang/build/app/sim/policies.js';

const MAX_AI_STEPS_PER_TURN = 40; // AI가 연속으로 행동을 이어가도 무한 루프에 빠지지 않도록 하는 안전 상한.

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.state = null;       // 권위 게임 상태 (core/index.js의 g). 메모리 캐시.
    this.seatTokens = null;  // { [seat: number]: token }
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    this.state = (await this.ctx.storage.get('state')) ?? null;
    this.seatTokens = (await this.ctx.storage.get('seatTokens')) ?? {};
    this.loaded = true;
  }

  async persist() {
    await this.ctx.storage.put('state', this.state);
    await this.ctx.storage.put('seatTokens', this.seatTokens);
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);

    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.state) return new Response('already-initialized', { status: 200 });
      let body = {};
      try { body = await request.json(); } catch { /* noop */ }
      const playerCount = Number(body.playerCount ?? 4);
      const seed = String(body.seed ?? 'room');
      const controllers = Array.from({ length: playerCount }, () => 'ai'); // 사람이 입장할 때마다 좌석을 human으로 바꾼다.
      this.state = newGame(seed, { playerCount, controllers });
      this.seatTokens = {};
      await this.persist();
      return new Response('ok', { status: 200 });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request, url);
    }

    return new Response('not-found', { status: 404 });
  }

  // 좌석 배정: token이 이미 등록된 좌석과 일치하면 재접속으로 그 좌석을 그대로 돌려준다.
  // 아니면 아직 아무도 소유하지 않은 좌석 중 가장 낮은 번호를 새로 배정한다.
  claimSeat(requestedSeat, token) {
    if (token) {
      for (const [seatStr, storedToken] of Object.entries(this.seatTokens)) {
        if (storedToken === token) return { seat: Number(seatStr), token, reconnect: true };
      }
    }
    const playerCount = this.state.players.length;
    let seat = requestedSeat != null && this.seatTokens[requestedSeat] == null ? requestedSeat : null;
    if (seat == null) {
      for (let i = 0; i < playerCount; i++) {
        if (this.seatTokens[i] == null) { seat = i; break; }
      }
    }
    if (seat == null) return null; // 방이 이미 가득 찼다.
    const newToken = crypto.randomUUID();
    this.seatTokens[seat] = newToken;
    return { seat, token: newToken, reconnect: false };
  }

  actingSeat() {
    if (!this.state || this.state.over) return null;
    return this.state.phase === 'reaction' ? this.state.pending.target : this.state.turnSeat;
  }

  // seat이 볼 privateView. 지금 그 seat이 행동할 차례라면 legalActions도 함께 담아 보낸다.
  // (legalActions는 항상 "현재 행동자"의 손패 정보에 의존하므로, 다른 좌석에게는 보내지 않는다.)
  viewFor(seat) {
    const view = privateView(this.state, seat);
    if (seat === this.actingSeat()) view.legalActions = legalActions(this.state);
    return view;
  }

  async handleWebSocketUpgrade(request, url) {
    if (!this.state) return new Response('room-not-initialized', { status: 404 });

    const requestedSeatParam = url.searchParams.get('seat');
    const requestedSeat = requestedSeatParam == null ? null : Number(requestedSeatParam);
    const token = url.searchParams.get('token');

    const claim = this.claimSeat(requestedSeat, token);
    if (!claim) return new Response('room-full', { status: 409 });

    if (!claim.reconnect) this.state = setController(this.state, claim.seat, 'human');
    await this.persist();

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: claim.seat, token: claim.token });

    server.send(JSON.stringify({
      type: 'welcome',
      seat: claim.seat,
      token: claim.token,
      publicState: publicView(this.state),
      privateState: this.viewFor(claim.seat)
    }));

    this.broadcastSync(); // 새 참가자로 인해 controller가 바뀐 것을 기존 접속자들에게 알린다.

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    await this.load();
    const attachment = ws.deserializeAttachment();
    if (!attachment) { ws.close(1008, 'no-seat'); return; }
    const seat = attachment.seat;

    let msg;
    try { msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch { return; }

    if (msg.type !== 'action') return;

    // 이벤트 계약: { gameId, eventId, sequence, seat, baseVersion, action }.
    // baseVersion은 반드시 "클라이언트가 마지막으로 본 stateVersion"이어야 신선도 검증이 의미가 있다.
    // (서버 현재 상태에서 새로 만들면 항상 baseVersion===stateVersion이 되어 충돌 검증이 무력화된다.)
    const event = {
      gameId: this.state.gameId,
      eventId: msg.eventId ?? crypto.randomUUID(),
      sequence: this.state.eventSeq + 1,
      seat,
      baseVersion: msg.baseVersion,
      action: msg.action
    };

    const outcome = applyEvent(this.state, event);
    if (!outcome.ok) {
      ws.send(JSON.stringify({
        type: 'action-rejected',
        reason: outcome.reason,
        publicState: outcome.snapshot,
        privateState: this.viewFor(seat)
      }));
      return;
    }

    this.state = outcome.state;
    this.advanceAi();
    await this.persist();
    this.broadcastSync();
  }

  // 현재 행동 차례가 AI 좌석이면 서버가 대신 진행시킨다. 사람 차례가 오거나 게임이 끝나면 멈춘다.
  advanceAi() {
    for (let i = 0; i < MAX_AI_STEPS_PER_TURN; i++) {
      const actorSeat = this.actingSeat();
      if (actorSeat == null) return;
      const actor = this.state.players[actorSeat];
      if (!actor || actor.controller !== 'ai') return;
      const action = chooseAction(this.state, 'baseline-recommended');
      if (!action) return;
      const event = createEvent(this.state, actorSeat, action); // 서버가 자기 자신의 현재 상태로 만드는 내부 이벤트라 안전하다.
      const outcome = applyEvent(this.state, event);
      if (!outcome.ok) return;
      this.state = outcome.state;
    }
  }

  broadcastSync() {
    const pub = publicView(this.state);
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!attachment) continue;
      try {
        ws.send(JSON.stringify({ type: 'sync', publicState: pub, privateState: this.viewFor(attachment.seat) }));
      } catch { /* 끊긴 소켓은 다음 getWebSockets()에서 자연히 제외된다. */ }
    }
  }

  async webSocketClose() { /* 좌석 소유권은 seatTokens에 남아 재접속으로 복구된다. */ }
  async webSocketError() { /* 위와 동일. */ }
}
