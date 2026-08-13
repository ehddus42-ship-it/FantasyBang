// GameRoom Durable Object — 방 하나 = Durable Object 인스턴스 하나.
//
// 이 파일은 규칙을 다시 구현하지 않는다. newGame/applyEvent/publicView/privateView/
// setController/legalActions 를 core/index.js에서 그대로 가져와 "권위 상태"로만 사용한다.
//
// v2: 방 생성 == 게임 시작이 아니다. 방은 먼저 "로비"로 열리고, 좌석이 다 차거나
// 호스트(좌석 0)가 명시적으로 "시작"을 눌러야 실제 newGame()이 호출된다.
// 그 전까지는 game state(this.state)가 아예 존재하지 않는다 — 그래야 방 만들자마자
// 나머지 좌석이 전부 AI로 채워진 게임이 즉시 시작돼버리는 문제(사용자 신고)가 없다.
//
// v3: 방 만들 때 "사람 좌석 수"(room.humanSeats)를 직접 고를 수 있다. playerCount보다
// 적게 고르면 그 차이만큼은 처음부터 AI 전용 좌석이다 — 사람은 그 좌석에 절대 배정되지 않고,
// 로비는 playerCount가 아니라 humanSeats만큼 사람이 모이면 바로 시작한다.
//
// 인수인계 문서의 필수 보장 사항:
// - eventId 멱등성        -> core/index.js의 applyEvent()가 appliedEventIds로 처리
// - seat 턴/반응 권한 검증  -> applyEvent()의 TURN_OWNERSHIP 검사
// - baseVersion 충돌 처리  -> applyEvent()의 VERSION_CONFLICT + 최신 publicView 반환
// - 서버만 전체 상태 보관   -> this.ctx.storage 에만 저장, 클라이언트에는 view만 전송
// - 공개/개인 뷰만 전송     -> publicView(state) / privateView(state, seat)
// - 재접속 시 좌석 소유권 확인 -> seatTokens 에 저장된 token과 대조 (로비/진행 중 공통)

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
const HOST_SEAT = 0; // 방을 만든(가장 먼저 접속한) 사람이 항상 이 좌석이고, "게임 시작" 권한을 가진다.

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.room = null;       // { playerCount, humanSeats, seed, phase: 'lobby' | 'active' }
    this.state = null;      // 실제 권위 게임 상태(core/index.js의 g). phase가 'active'가 되기 전엔 null.
    this.seatTokens = null; // { [seat: number]: token } — 로비/진행 상관없이 좌석 소유권.
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    this.room = (await this.ctx.storage.get('room')) ?? null;
    this.state = (await this.ctx.storage.get('state')) ?? null;
    this.seatTokens = (await this.ctx.storage.get('seatTokens')) ?? {};
    this.loaded = true;
  }

  async persist() {
    await this.ctx.storage.put('room', this.room);
    if (this.state) await this.ctx.storage.put('state', this.state);
    await this.ctx.storage.put('seatTokens', this.seatTokens);
  }

  async fetch(request) {
    await this.load();
    const url = new URL(request.url);

    if (url.pathname === '/init' && request.method === 'POST') {
      if (this.room) return new Response('already-initialized', { status: 200 });
      let body = {};
      try { body = await request.json(); } catch { /* noop */ }
      const playerCount = Number(body.playerCount ?? 4);
      const rawHumanSeats = body.humanSeats == null ? playerCount : Number(body.humanSeats);
      const humanSeats = Math.min(Math.max(1, Number.isFinite(rawHumanSeats) ? rawHumanSeats : playerCount), playerCount);
      const seed = String(body.seed ?? 'room');
      this.room = { playerCount, humanSeats, seed, phase: 'lobby' };
      this.seatTokens = {};
      this.state = null;
      await this.persist();
      return new Response('ok', { status: 200 });
    }

    if (request.headers.get('Upgrade') === 'websocket') {
      return this.handleWebSocketUpgrade(request, url);
    }

    return new Response('not-found', { status: 404 });
  }

  // 좌석 배정: token이 이미 등록된 좌석과 일치하면 재접속으로 그 좌석을 그대로 돌려준다.
  // 아니면 사람 좌석(0..humanSeats-1) 중 아직 아무도 소유하지 않은 가장 낮은 번호를 새로 배정한다.
  // humanSeats 이후 좌석은 처음부터 AI 전용이라 사람은 절대 그 번호로 배정되지 않는다.
  claimSeat(requestedSeat, token) {
    if (token) {
      for (const [seatStr, storedToken] of Object.entries(this.seatTokens)) {
        if (storedToken === token) return { seat: Number(seatStr), token, reconnect: true };
      }
    }
    const humanSeats = this.room.humanSeats;
    let seat = requestedSeat != null && requestedSeat < humanSeats && this.seatTokens[requestedSeat] == null ? requestedSeat : null;
    if (seat == null) {
      for (let i = 0; i < humanSeats; i++) {
        if (this.seatTokens[i] == null) { seat = i; break; }
      }
    }
    if (seat == null) return null; // 사람 좌석이 이미 가득 찼다(나머지는 AI 전용 좌석).
    const newToken = crypto.randomUUID();
    this.seatTokens[seat] = newToken;
    return { seat, token: newToken, reconnect: false };
  }

  actingSeat() {
    if (!this.state || this.state.over) return null;
    return this.state.phase === 'reaction' ? this.state.pending.target : this.state.turnSeat;
  }

  // seat이 볼 privateView. 지금 그 seat이 행동할 차례라면 legalActions도 함께 담아 보낸다.
  viewFor(seat) {
    const view = privateView(this.state, seat);
    if (seat === this.actingSeat()) view.legalActions = legalActions(this.state);
    return view;
  }

  lobbySnapshotFor(seat) {
    const { playerCount, humanSeats } = this.room;
    return {
      type: 'lobby',
      seat,
      token: this.seatTokens[seat],
      hostSeat: HOST_SEAT,
      playerCount,
      humanSeats,
      // humanSeats 이후 번호는 로비 단계부터 이미 AI로 정해진 좌석이다(사람이 앉을 수 없음).
      aiSeats: Array.from({ length: playerCount - humanSeats }, (_, i) => humanSeats + i),
      claimedSeats: Object.keys(this.seatTokens).map(Number).sort((a, b) => a - b)
    };
  }

  async handleWebSocketUpgrade(request, url) {
    if (!this.room) return new Response('room-not-initialized', { status: 404 });

    const requestedSeatParam = url.searchParams.get('seat');
    const requestedSeat = requestedSeatParam == null ? null : Number(requestedSeatParam);
    const token = url.searchParams.get('token');

    const claim = this.claimSeat(requestedSeat, token);
    if (!claim) return new Response('room-full', { status: 409 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: claim.seat, token: claim.token });
    await this.persist();

    if (this.room.phase === 'lobby') {
      server.send(JSON.stringify(this.lobbySnapshotFor(claim.seat)));
      // 사람 좌석(humanSeats)이 이번 접속으로 다 찼으면 대기 없이 바로 시작한다. 아니면
      // 다른 대기자들에게 "몇 명 찼는지"만 갱신해서 알려준다 — 아직 아무도 게임 데이터를 못 받은 상태다.
      if (Object.keys(this.seatTokens).length >= this.room.humanSeats) await this.startGame();
      else this.broadcastLobby();
    } else {
      if (!claim.reconnect) this.state = setController(this.state, claim.seat, 'human');
      await this.persist();
      server.send(JSON.stringify({
        type: 'welcome',
        seat: claim.seat,
        token: claim.token,
        publicState: publicView(this.state),
        privateState: this.viewFor(claim.seat)
      }));
      this.broadcastSync();
    }

    return new Response(null, { status: 101, webSocket: client });
  }

  broadcastLobby() {
    for (const ws of this.ctx.getWebSockets()) {
      const attachment = ws.deserializeAttachment();
      if (!attachment) continue;
      try { ws.send(JSON.stringify(this.lobbySnapshotFor(attachment.seat))); }
      catch { /* 끊긴 소켓은 다음 getWebSockets()에서 자연히 제외된다. */ }
    }
  }

  // 로비를 끝내고 실제 게임을 시작한다. humanSeats 이후 좌석은 원래부터 AI이고,
  // 호스트가 사람 좌석이 다 차기 전에 일찍 시작을 누르면 그 나머지 사람 좌석도 AI가 대신 맡는다.
  async startGame() {
    if (this.room.phase === 'active') return; // 이미 시작됨(동시 요청 등) — 중복 실행 방지.
    const controllers = Array.from({ length: this.room.playerCount }, (_, i) => (i < this.room.humanSeats && this.seatTokens[i] != null ? 'human' : 'ai'));
    this.state = newGame(this.room.seed, { playerCount: this.room.playerCount, controllers });
    this.room.phase = 'active';
    await this.persist();
    this.broadcastSync();
  }

  async webSocketMessage(ws, message) {
    await this.load();
    const attachment = ws.deserializeAttachment();
    if (!attachment) { ws.close(1008, 'no-seat'); return; }
    const seat = attachment.seat;

    let msg;
    try { msg = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message)); }
    catch { return; }

    if (this.room.phase === 'lobby') {
      // 로비에서는 호스트(좌석 0)의 "시작" 메시지만 의미가 있다.
      if (msg.type === 'start' && seat === HOST_SEAT) await this.startGame();
      return;
    }

    if (msg.type !== 'action') return;

    // 이벤트 계약: { gameId, eventId, sequence, seat, baseVersion, action }.
    // baseVersion은 반드시 "클라이언트가 마지막으로 본 stateVersion"이어야 신선도 검증이 의미가 있다.
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
        ws.send(JSON.stringify({
          type: 'sync',
          seat: attachment.seat,
          token: attachment.token,
          publicState: pub,
          privateState: this.viewFor(attachment.seat)
        }));
      } catch { /* 끊긴 소켓은 다음 getWebSockets()에서 자연히 제외된다. */ }
    }
  }

  async webSocketClose() { /* 좌석 소유권은 seatTokens에 남아 재접속으로 복구된다. */ }
  async webSocketError() { /* 위와 동일. */ }
}
