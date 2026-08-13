// Cloudflare(Durable Object) 백엔드용 transport 어댑터.
// createLocalTransport()와 같은 모양(send/snapshot/raw/subscribe)을 흉내내지만,
// 권위 상태는 서버에만 있으므로 로컬에서 규칙을 다시 계산하지 않는다.
//
// v2: 방에 접속하면 곧바로 게임이 아니라 "로비"부터 시작될 수 있다(좌석이 다 찰 때까지,
// 또는 호스트가 시작을 누를 때까지). lobby()가 null이 아니면 아직 로비 단계라는 뜻이고,
// raw()가 null이 아니게 되는 순간부터 실제 게임이 시작된 것이다.
//
// 클라이언트가 받는 것은 항상 publicView / privateView 뿐이다 — 다른 좌석의
// 손패·역할은 이 모듈을 통해서도 절대 들어오지 않는다(서버가 이미 걸러서 보낸다).
//
// main.js에서 기대하는 사용법:
//   const t = createCloudflareTransport({ wsUrl, seat, token, onSeatAssigned, onRejected });
//   t.subscribe(() => render());   // 서버 push(로비 갱신, 다른 사람 턴, AI 턴 포함)가 오면 다시 그린다.
//   t.lobby()                      // 아직 게임 시작 전이면 로비 스냅샷, 시작됐으면 null
//   t.startGame()                  // 호스트가 "게임 시작"을 눌렀을 때
//   t.send(seat, action);          // 항상 { ok: true }를 즉시 반환(낙관적) — 실제 결과는 subscribe로 온다.
//   t.raw()                        // 마지막으로 받은 publicView (currentActor 등에 필요한 만큼만 있음)
//   t.privateView()                // 마지막으로 받은 privateView (내 손패 + 내 턴이면 legalActions 포함)

export function createCloudflareTransport({ wsUrl, seat = null, token = null, onSeatAssigned, onRejected } = {}) {
  const listeners = new Set();
  let latestPublic = null;
  let latestPrivate = null;
  let latestLobby = null;
  let mySeat = seat;
  let myToken = token;
  let socket = null;
  let ready = false;
  let closedByUser = false;
  const sendQueue = [];

  function notify() {
    for (const listener of listeners) listener();
  }

  // 서버가 좌석을 배정해주는 순간(로비 입장 때든, 이미 시작된 방에 바로 들어갈 때든)
  // 딱 한 번만 onSeatAssigned를 호출한다. 이후 같은 값이 다시 와도 조용히 갱신만 한다.
  function assignIdentity(nextSeat, nextToken) {
    const firstTime = mySeat == null;
    if (nextSeat != null) mySeat = nextSeat;
    if (nextToken) myToken = nextToken;
    if (firstTime && mySeat != null) onSeatAssigned?.(mySeat, myToken);
  }

  function buildUrl() {
    const url = new URL(wsUrl, location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    if (mySeat != null) url.searchParams.set('seat', String(mySeat));
    if (myToken) url.searchParams.set('token', myToken);
    return url;
  }

  function connect() {
    socket = new WebSocket(buildUrl());

    socket.addEventListener('open', () => {
      ready = true;
      while (sendQueue.length) socket.send(sendQueue.shift());
    });

    socket.addEventListener('message', event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'lobby') {
        assignIdentity(msg.seat, msg.token);
        latestLobby = msg;
        notify();
      } else if (msg.type === 'welcome') {
        assignIdentity(msg.seat, msg.token);
        latestLobby = null;
        latestPublic = msg.publicState;
        latestPrivate = msg.privateState;
        notify();
      } else if (msg.type === 'sync') {
        assignIdentity(msg.seat, msg.token);
        latestLobby = null; // 로비 중이던 사람도 이 메시지를 받으면 게임이 시작된 것이다.
        latestPublic = msg.publicState;
        latestPrivate = msg.privateState ?? latestPrivate;
        notify();
      } else if (msg.type === 'action-rejected') {
        if (msg.publicState) latestPublic = msg.publicState;
        if (msg.privateState) latestPrivate = msg.privateState;
        onRejected?.(msg.reason);
        notify();
      }
    });

    socket.addEventListener('close', () => {
      ready = false;
      if (!closedByUser) setTimeout(connect, 1500);
    });

    socket.addEventListener('error', () => { /* close 이벤트가 이어서 재연결을 시도한다. */ });
  }
  connect();

  return {
    isRemote: true,

    send(_seatArg, action, eventId) {
      const id = eventId ?? crypto.randomUUID();
      const baseVersion = latestPublic?.stateVersion ?? 0;
      const payload = JSON.stringify({ type: 'action', action, eventId: id, baseVersion });
      if (ready) socket.send(payload); else sendQueue.push(payload);
      return { ok: true }; // 실제 결과는 서버가 push하는 sync/action-rejected로 비동기 반영된다.
    },

    startGame() {
      const payload = JSON.stringify({ type: 'start' });
      if (ready) socket.send(payload); else sendQueue.push(payload);
    },

    lobby() { return latestLobby; },
    snapshot(seatArg = null) { return seatArg == null ? latestPublic : latestPrivate; },
    raw() { return latestPublic; },
    privateView() { return latestPrivate; },
    replace() { /* 서버가 유일한 권위 상태 소유자라 클라이언트가 직접 교체하지 않는다. */ },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },

    get seat() { return mySeat; },
    get token() { return myToken; },

    close() { closedByUser = true; socket?.close(); }
  };
}
