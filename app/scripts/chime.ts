/// <reference types="bun" />
const RATE = 44100;
const OUT = new URL('../assets/sounds/', import.meta.url).pathname;

type Tone = { at: number; freq: number; length: number; gain: number };

function render(tones: Tone[], total: number) {
  const samples = new Float32Array(Math.ceil(total * RATE));
  for (const tone of tones) {
    const start = Math.floor(tone.at * RATE);
    const n = Math.floor(tone.length * RATE);
    for (let i = 0; i < n && start + i < samples.length; i++) {
      const t = i / RATE;
      const attack = Math.min(1, t / 0.006);
      const decay = Math.exp(-t * (4.2 / tone.length));
      const body = Math.sin(2 * Math.PI * tone.freq * t) + 0.32 * Math.sin(2 * Math.PI * tone.freq * 2 * t) + 0.1 * Math.sin(2 * Math.PI * tone.freq * 3 * t);
      samples[start + i] += body * attack * decay * tone.gain;
    }
  }
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const scale = peak > 0 ? 0.82 / peak : 1;
  const fade = Math.floor(0.01 * RATE);
  for (let i = 0; i < fade; i++) samples[samples.length - 1 - i] *= i / fade;
  return samples.map((s) => s * scale);
}

function wav(samples: Float32Array) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const chime = render(
  [
    { at: 0, freq: 783.99, length: 0.55, gain: 1 },
    { at: 0.17, freq: 1174.66, length: 0.75, gain: 0.9 },
  ],
  0.95,
);

const beep = render(
  [
    { at: 0, freq: 1318.5, length: 0.12, gain: 1 },
    { at: 0.16, freq: 1318.5, length: 0.12, gain: 1 },
  ],
  0.32,
);

await Bun.write(`${OUT}chime.wav`, wav(chime));
await Bun.write(`${OUT}beep.wav`, wav(beep));
await Bun.write(`${OUT}silence.wav`, wav(new Float32Array(Math.floor(0.08 * RATE))));
console.log(`wrote chime.wav, beep.wav and silence.wav to ${OUT}`);
