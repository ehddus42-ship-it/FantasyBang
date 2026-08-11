export function seedNumber(seed) {
  const text = String(seed ?? 'rune-crown');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 0x6d2b79f5;
}

export function nextRng(state) {
  let t = (state + 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { state: t >>> 0, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 };
}

export function takeInt(holder, max) {
  const next = nextRng(holder.rngState);
  holder.rngState = next.state;
  return Math.floor(next.value * max);
}

export function shuffle(holder, values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = takeInt(holder, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
