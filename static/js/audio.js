// All sound is synthesized with WebAudio: no downloaded files, nothing to load or license-check.
const SFX = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let droneA, droneB, droneFilter, droneGain;
  let beatT = 0;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    droneFilter = ctx.createBiquadFilter(); droneFilter.type = 'lowpass'; droneFilter.frequency.value = 220;
    droneGain = ctx.createGain(); droneGain.gain.value = 0.04;
    droneA = ctx.createOscillator(); droneA.type = 'sawtooth'; droneA.frequency.value = 55;
    droneB = ctx.createOscillator(); droneB.type = 'sawtooth'; droneB.frequency.value = 55.3;
    droneA.connect(droneFilter); droneB.connect(droneFilter);
    droneFilter.connect(droneGain); droneGain.connect(master);
    droneA.start(); droneB.start();
  }

  function dest(pan) {
    if (!pan || !ctx.createStereoPanner) return master;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(master);
    return p;
  }

  function tone(freq, dur, type = 'square', gain = 0.08, pan = 0, slideTo = null) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest(pan));
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, freq, gain, pan = 0, type = 'bandpass', q = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest(pan));
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }

  let muted = false;

  return {
    init,
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.7; },
    isMuted: () => muted,
    // Heavy boot step. gain 0..1, pan -1 (left) .. 1 (right)
    footstep(gain, pan) {
      noise(0.12, 160, gain * 0.9, pan, 'lowpass');
      tone(75, 0.14, 'sine', gain * 0.8, pan, 40);
    },
    crack() { noise(0.08, 1800, 0.12, 0, 'highpass'); tone(180 + Math.random() * 80, 0.06, 'square', 0.03); },
    zap() { tone(1200, 0.07, 'square', 0.03, 0, 300); },
    hit() { noise(0.15, 900, 0.2); tone(140, 0.15, 'square', 0.06, 0, 70); },
    coin() { tone(988, 0.06, 'square', 0.04); setTimeout(() => tone(1319, 0.1, 'square', 0.04), 60); },
    fail() { tone(220, 0.35, 'sawtooth', 0.07, 0, 80); },
    good() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.14, 'square', 0.04), i * 80)); },
    pumpkin(i) { tone([262, 330, 392, 523][i], 0.32, 'triangle', 0.14); },
    sting() { tone(120, 0.9, 'sawtooth', 0.14, 0, 50); noise(0.7, 500, 0.18, 0, 'bandpass', 0.6); },
    boom(pan) { noise(0.4, 300, 0.35, pan, 'lowpass'); tone(90, 0.3, 'sine', 0.2, pan, 30); },
    heartbeat(g = 0.25) { tone(62, 0.12, 'sine', g); setTimeout(() => tone(55, 0.12, 'sine', g * 0.8), 170); },
    // Called every frame: music gets tighter and the heartbeat faster as awareness climbs.
    mood(awareness, chasing, dt) {
      if (!ctx) return;
      const t = ctx.currentTime;
      droneFilter.frequency.setTargetAtTime(chasing ? 1500 : 180 + awareness * 7, t, 0.4);
      droneGain.gain.setTargetAtTime(chasing ? 0.09 : 0.03 + awareness * 0.0004, t, 0.4);
      droneB.frequency.setTargetAtTime(awareness >= 50 || chasing ? 58.3 : 55.3, t, 0.8); // dissonant shift at stage 2
      beatT -= dt;
      if (awareness > 35 || chasing) {
        const interval = chasing ? 0.42 : 1.4 - awareness * 0.009;
        if (beatT <= 0) { beatT = interval; this.heartbeat(chasing ? 0.3 : 0.12 + awareness * 0.0015); }
      }
    },
  };
})();
