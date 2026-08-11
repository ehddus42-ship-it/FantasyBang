let context;
let muted = false;

export function setMuted(value) { muted = Boolean(value); }

export function sound(kind = 'select') {
  if (muted) return;
  try {
    context ??= new (globalThis.AudioContext || globalThis.webkitAudioContext)();
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const tones = { select: [620, .035], play: [390, .08], ward: [820, .12], damage: [120, .16], exile: [180, .3], victory: [440, .4] };
    const [frequency, duration] = tones[kind] ?? tones.select;
    osc.type = kind === 'damage' ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    if (kind === 'victory') osc.frequency.exponentialRampToValueAtTime(660, now + duration);
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(.08, now + .01);
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    osc.connect(gain).connect(context.destination);
    osc.start(now); osc.stop(now + duration + .02);
  } catch { /* 시각 피드백이 항상 남는다. */ }
}
