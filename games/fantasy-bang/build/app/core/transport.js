import { applyEvent, createEvent, privateView, publicView } from './index.js?v=20260811-roles1';

/**
 * Firebase 대체 로컬 전송 계약.
 * send(event)만 Firebase transaction으로 교체하면 규칙 코드는 그대로 남는다.
 */
export function createLocalTransport(initialState) {
  let state = initialState;
  const listeners = new Set();
  return {
    send(seat, action, eventId) {
      const event = createEvent(state, seat, action, eventId);
      const outcome = applyEvent(state, event);
      if (outcome.ok && !outcome.duplicate) {
        state = outcome.state;
        for (const listener of listeners) listener({ event, publicState: publicView(state) });
      }
      return outcome;
    },
    snapshot(seat = null) { return seat == null ? publicView(state) : privateView(state, seat); },
    raw() { return state; },
    replace(next) { state = next; for (const listener of listeners) listener({ snapshot: publicView(state) }); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
}
