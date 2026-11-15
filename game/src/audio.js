// Sound is synthesized, never loaded: a shot is a noise burst shaped by a low-pass and a short
// envelope, a reload is two clicks, a plant is a rising beep. Distance is applied by the caller
// through the listener position, so the world sounds like it has depth without a single file.
export function createAudio() {
  let ctx = null;
  let master = null;
  let listener = { x: 0, z: 0 };
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);

    const seconds = 1;
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function noise(duration, gain, filterType, frequency, q, delay = 0) {
    const c = ensure();
    if (!c) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const env = c.createGain();
    const t = c.currentTime + delay;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0008, t + duration);
    src.connect(filter).connect(env).connect(master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  function tone(freq, duration, gain, type = 'sine', delay = 0, sweepTo = null) {
    const c = ensure();
    if (!c) return;
    const osc = c.createOscillator();
    const env = c.createGain();
    const t = c.currentTime + delay;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0008, t + duration);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  const SOUNDS = {
    pistol: () => { noise(0.12, 0.5, 'bandpass', 1800, 0.9); tone(190, 0.09, 0.22, 'square'); },
    rifle: () => { noise(0.17, 0.62, 'bandpass', 1350, 0.8); tone(120, 0.12, 0.3, 'sawtooth'); },
    smg: () => { noise(0.1, 0.45, 'bandpass', 2200, 1.1); tone(240, 0.07, 0.18, 'square'); },
    shotgun: () => { noise(0.3, 0.7, 'lowpass', 900, 0.6); tone(90, 0.22, 0.34, 'sine'); },
    knife: () => { noise(0.09, 0.3, 'highpass', 2600, 0.7); },
    reload: () => { noise(0.05, 0.25, 'bandpass', 3000, 1.4); noise(0.06, 0.3, 'bandpass', 1800, 1.2, 0.16); },
    hit: () => { tone(880, 0.05, 0.16, 'square'); },
    killed: () => { tone(660, 0.07, 0.2, 'square'); tone(440, 0.1, 0.16, 'square', 0.06); },
    plant: () => { tone(520, 0.08, 0.18, 'sine'); },
    planted: () => { tone(700, 0.12, 0.22, 'square'); tone(900, 0.16, 0.2, 'square', 0.14); },
    defuse: () => { noise(0.06, 0.2, 'bandpass', 2400, 1.6); },
    win: () => { tone(523, 0.16, 0.22, 'triangle'); tone(659, 0.18, 0.22, 'triangle', 0.14); tone(784, 0.3, 0.24, 'triangle', 0.28); },
    lose: () => { tone(392, 0.2, 0.2, 'triangle'); tone(311, 0.26, 0.2, 'triangle', 0.16); },
    explode: () => { noise(0.7, 0.9, 'lowpass', 420, 0.6); tone(60, 0.6, 0.5, 'sine'); },
    footstep: () => { noise(0.05, 0.12, 'lowpass', 700, 0.8); },
    buy: () => { tone(1046, 0.06, 0.16, 'square'); tone(1318, 0.09, 0.14, 'square', 0.05); },
  };

  function play(name, volume = 1, x = null, z = null) {
    const fn = SOUNDS[name];
    if (!fn) return;
    let attenuation = volume;
    if (x !== null && z !== null) {
      const dist = Math.hypot(x - listener.x, z - listener.z);
      attenuation *= Math.max(0, 1 - dist / 58);
      if (attenuation <= 0.02) return;
    }
    const previous = master ? master.gain.value : 0.55;
    if (master) master.gain.value = Math.min(0.9, previous * 0.5 + 0.55 * attenuation);
    fn();
  }

  function setListener(x, z) {
    listener = { x, z };
  }

  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  return { play, setListener, resume, ensure };
}
