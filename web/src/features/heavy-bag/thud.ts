// A punch thud, synthesised with Web Audio (no sound files): a short low-passed noise burst
// for the leather slap plus a falling low sine for the body of the bag.

let ctx: AudioContext | null = null;

export function thud(power: number) {
  ctx ??= new AudioContext();
  const now = ctx.currentTime;
  const volume = 0.15 + 0.35 * power;

  const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 3;
  const slap = ctx.createBufferSource();
  slap.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900 + 1400 * power;
  const slapGain = ctx.createGain();
  slapGain.gain.value = volume;
  slap.connect(filter).connect(slapGain).connect(ctx.destination);
  slap.start(now);

  const body = ctx.createOscillator();
  body.frequency.setValueAtTime(110, now);
  body.frequency.exponentialRampToValueAtTime(45, now + 0.25);
  const bodyGain = ctx.createGain();
  bodyGain.gain.setValueAtTime(volume, now);
  bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  body.connect(bodyGain).connect(ctx.destination);
  body.start(now);
  body.stop(now + 0.32);
}
