/**
 * 提示音。
 * iPad Safari 只允许在用户点击之后播放声音，并且 Web Audio 会被静音拨片静音，
 * 所以这里用一个共享的 <audio> 元素：在"开始扫码"的点击里用静音 WAV 解锁，
 * 之后每次只换 src 播放"叮"/"嘟嘟"，不再受手势限制。
 */
const RATE = 22050;

function wav(samples: Float32Array): string {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF');
  v.setUint32(4, 36 + samples.length * 2, true);
  w(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, 'data');
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s)) * 32767, true));
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

type Tone = { freq: number; start: number; dur: number; gain: number; decay: number; harmonics?: [number, number][] };

function synth(total: number, tones: Tone[]): Float32Array {
  const out = new Float32Array(Math.floor(total * RATE));
  for (const t of tones) {
    const parts: [number, number][] = [[1, 1], ...(t.harmonics ?? [])];
    const begin = Math.floor(t.start * RATE);
    const n = Math.floor(t.dur * RATE);
    for (let i = 0; i < n && begin + i < out.length; i++) {
      const time = i / RATE;
      const attack = Math.min(1, time / 0.004);
      const release = Math.min(1, (t.dur - time) / 0.01);
      const env = attack * release * Math.exp(-time * t.decay);
      let s = 0;
      for (const [m, a] of parts) s += a * Math.sin(2 * Math.PI * t.freq * m * time);
      out[begin + i] += s * env * t.gain;
    }
  }
  return out;
}

type Kind = 'ok' | 'dup' | 'err';
let audio: HTMLAudioElement | null = null;
let urls: Record<Kind | 'silent', string> | null = null;

function build() {
  if (urls) return urls;
  urls = {
    silent: wav(new Float32Array(Math.floor(RATE * 0.05))),
    // 清脆的"叮"
    ok: wav(synth(0.7, [{ freq: 1568, start: 0, dur: 0.7, gain: 0.5, decay: 6, harmonics: [[2.76, 0.35], [5.4, 0.12]] }])),
    // 低沉的两声"嘟嘟"，与"叮"明显不同
    dup: wav(synth(0.5, [
      { freq: 330, start: 0, dur: 0.15, gain: 0.6, decay: 2, harmonics: [[2, 0.3]] },
      { freq: 330, start: 0.24, dur: 0.15, gain: 0.6, decay: 2, harmonics: [[2, 0.3]] },
    ])),
    // 下行音：无法识别
    err: wav(synth(0.6, [
      { freq: 440, start: 0, dur: 0.18, gain: 0.55, decay: 1.5 },
      { freq: 262, start: 0.2, dur: 0.35, gain: 0.55, decay: 1.5 },
    ])),
  };
  return urls;
}

/** 必须在点击事件处理函数里调用 */
export function unlockSound(): void {
  try {
    const u = build();
    if (!audio) {
      audio = new Audio();
      audio.preload = 'auto';
    }
    audio.src = u.silent;
    void audio.play().catch(() => {});
  } catch {
    /* 没有声音也不影响打卡 */
  }
}

export function playSound(kind: Kind): void {
  try {
    const u = build();
    if (!audio) audio = new Audio();
    audio.pause();
    audio.src = u[kind];
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
