// Synthesized two-note chime (FOCUS_DESIGN §2.3): no audio files, never autoplays.
let ctx: AudioContext | null = null;

/** Call inside a user gesture (Start focus, Test chime) so the context may run. */
export function primeAudio(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

/** Soft bell: 659 Hz then 988 Hz, 180 ms apart, 1.6 s decay, peak 0.06, low-pass 3 kHz. Silent unless primed. */
export function playChime(): boolean {
  if (!ctx || ctx.state !== 'running') return false;
  const t0 = ctx.currentTime + 0.02;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3000;
  lp.connect(ctx.destination);
  [659, 988].forEach((freq, i) => {
    const start = t0 + i * 0.18;
    const osc = ctx!.createOscillator();
    const gain = ctx!.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.06, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.6);
    osc.connect(gain).connect(lp);
    osc.start(start);
    osc.stop(start + 1.7);
  });
  return true;
}
