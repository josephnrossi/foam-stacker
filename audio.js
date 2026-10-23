/* Foam Board Stacker – sound. Everything is synthesized with WebAudio at runtime (original, no audio files).
   makeEngine(ctx) works on a live AudioContext or an OfflineAudioContext (used to render the preview). */
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const N = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz

  function makeEngine(ctx) {
    // ---- mix: sfx + music(ducked) + ambience -> master -> compressor -> limiter -> out
    const master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    master.connect(comp).connect(lim).connect(ctx.destination);
    const sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
    const musicBus = ctx.createGain(); musicBus.gain.value = 0.32; const duckG = ctx.createGain(); musicBus.connect(duckG).connect(master);
    const ambBus = ctx.createGain(); ambBus.gain.value = 0.5; ambBus.connect(master);
    // shared white-noise buffer (2 s)
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), nd = nb.getChannelData(0);
    let seed = 1234567; for (let i = 0; i < nd.length; i++) { seed = (seed * 1103515245 + 12345) >>> 0; nd[i] = (seed / 4294967296) * 2 - 1; }

    // ---- primitives (all with short attack/release ramps: no clicks)
    function env(g, t, a, peak, hold, rel) {
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a);
      if (hold > 0) g.gain.setValueAtTime(peak, t + a + hold);
      g.gain.setTargetAtTime(0, t + a + hold, rel / 4); return t + a + hold + rel + 0.05;
    }
    function osc(t, { type = 'sine', f = 440, to = null, dur = 0.2, vol = 0.2, a = 0.004, hold = 0, dest = sfxBus, curve = 'exp', lp = 0, detune = 0 } = {}) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
      if (to) { if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur); else o.frequency.linearRampToValueAtTime(to, t + dur); }
      let n = o; if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
      n.connect(g).connect(dest); const end = env(g, t, a, vol, hold, Math.max(0.02, dur - a - hold)); o.start(t); o.stop(end); return o;
    }
    function noise(t, { dur = 0.1, vol = 0.2, type = 'highpass', f = 1000, to = null, q = 0.7, a = 0.002, hold = 0, dest = sfxBus } = {}) {
      const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = nb; s.loop = true;
      fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (to) fl.frequency.exponentialRampToValueAtTime(to, t + dur);
      s.connect(fl).connect(g).connect(dest); const end = env(g, t, a, vol, hold, Math.max(0.01, dur - a - hold)); s.start(t, (t * 7.31) % 1.5); s.stop(end); return s;
    }
    function duck(t, amt = 0.4, back = 0.35) { duckG.gain.cancelScheduledValues(t); duckG.gain.setTargetAtTime(amt, t, 0.015); duckG.gain.setTargetAtTime(1, t + 0.08, back / 3); }
    // formant "vowel" blip for the robot WID-WAW: sawtooth through two band-passes
    function vowel(t, { f0, f1, dur, F1a, F2a, F1b, F2b, vol = 0.22 }) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      const g = ctx.createGain(); g.connect(sfxBus); const end = env(g, t, 0.012, vol, dur * 0.6, dur * 0.4);
      for (const [a0, b0, w] of [[F1a, F1b, 1], [F2a, F2b, 0.6]]) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 7; bp.frequency.setValueAtTime(a0, t); bp.frequency.linearRampToValueAtTime(b0, t + dur * 0.5); const gg = ctx.createGain(); gg.gain.value = w * 3; o.connect(bp).connect(gg).connect(g); }
      o.start(t); o.stop(end);
    }

    // ---- the sound pack
    const S = {
      ui(t) { osc(t, { type: 'sine', f: 1250, to: 900, dur: 0.045, vol: 0.09 }); },
      extrude(t, d = 0.7) { // motor hum + roller clicks while the board pushes out (push ~71% of the cycle)
        const push = d * 0.72;
        osc(t, { type: 'sawtooth', f: 52, to: 58, dur: push, vol: 0.09, a: 0.05, hold: push - 0.12, lp: 320, curve: 'lin' });
        osc(t, { type: 'square', f: 104, to: 116, dur: push, vol: 0.035, a: 0.05, hold: push - 0.12, lp: 500, curve: 'lin' });
        for (let k = 0.06; k < push; k += 0.085) noise(t + k, { dur: 0.018, vol: 0.07, type: 'bandpass', f: 3200, q: 3 });
      },
      cut(t) { // saw "zzzt"
        const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(190, t); o.frequency.linearRampToValueAtTime(240, t + 0.17);
        lfo.frequency.value = 55; lg.gain.value = 0.5; lfo.connect(lg).connect(g.gain); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
        o.connect(bp).connect(g).connect(sfxBus); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.01); g.gain.setTargetAtTime(0, t + 0.15, 0.02);
        o.start(t); lfo.start(t); o.stop(t + 0.3); lfo.stop(t + 0.3);
        noise(t, { dur: 0.17, vol: 0.13, type: 'bandpass', f: 4200, q: 2 });
      },
      drop(t, inches = 0.1875, first = false) { // soft foam thunk; thicker = lower
        const f = clamp(210 / (1 + inches * 1.6), 70, 200);
        osc(t, { type: 'sine', f: f * 1.5, to: f, dur: 0.16, vol: 0.32 });
        noise(t, { dur: 0.07, vol: 0.12, type: 'lowpass', f: 700 });
        if (first) { osc(t + 0.004, { type: 'triangle', f: 410, to: 380, dur: 0.09, vol: 0.14 }); osc(t + 0.004, { type: 'triangle', f: 655, dur: 0.06, vol: 0.08 }); noise(t, { dur: 0.04, vol: 0.1, type: 'bandpass', f: 1300, q: 2 }); }
      },
      slice(t) { noise(t, { dur: 0.11, vol: 0.18, type: 'highpass', f: 2600, to: 5200 }); osc(t, { type: 'triangle', f: 1600, to: 700, dur: 0.07, vol: 0.05 }); S.fall(t + 0.06, 0.6); },
      fall(t, v = 1) { noise(t, { dur: 0.42, vol: 0.09 * v, type: 'bandpass', f: 1400, to: 260, q: 1.4, a: 0.05 }); },
      perfect(t, n = 1) { // rising chime: climbs a scale step per combo
        const steps = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19], r = N(72 + steps[clamp(n - 1, 0, steps.length - 1)]);
        [1, 1.26, 1.5].forEach((m, i) => { osc(t + i * 0.045, { type: 'triangle', f: r * m, dur: 0.42, vol: 0.13 }); osc(t + i * 0.045, { type: 'sine', f: r * m * 2, dur: 0.25, vol: 0.04 }); });
        S.cheer(t + 0.14);
      },
      cheer(t) { osc(t, { type: 'square', f: 880, to: 1320, dur: 0.06, vol: 0.035, lp: 3000 }); osc(t + 0.07, { type: 'square', f: 990, to: 1480, dur: 0.07, vol: 0.035, lp: 3000 }); },
      grow(t) { osc(t, { type: 'triangle', f: 660, to: 990, dur: 0.12, vol: 0.1 }); },
      bonus(t) { [0, 4, 7, 12].forEach((s, i) => osc(t + i * 0.06, { type: 'square', f: N(76 + s), dur: 0.1, vol: 0.05, lp: 3500 })); },
      adhereEarn(t) { osc(t, { type: 'sine', f: 280, to: 1500, dur: 0.1, vol: 0.2 }); noise(t + 0.02, { dur: 0.05, vol: 0.08, type: 'bandpass', f: 2400, q: 2 }); osc(t + 0.11, { type: 'triangle', f: N(84), dur: 0.18, vol: 0.07 }); },
      adhereFasten(t) { noise(t, { dur: 0.02, vol: 0.2, type: 'highpass', f: 3500 }); osc(t, { type: 'sine', f: 240, to: 150, dur: 0.07, vol: 0.18 }); noise(t + 0.07, { dur: 0.015, vol: 0.14, type: 'highpass', f: 4500 }); },
      widwaw(t) { // arcade stinger + robot "WID-WAW"
        osc(t, { type: 'sine', f: 140, to: 45, dur: 0.18, vol: 0.4 });
        [0, 4, 7, 12, 16].forEach((s, i) => osc(t + i * 0.045, { type: 'square', f: N(67 + s), dur: 0.09, vol: 0.06, lp: 4000 }));
        vowel(t + 0.26, { f0: 260, f1: 330, dur: 0.17, F1a: 300, F2a: 800, F1b: 330, F2b: 2300, vol: 0.2 });   // "WID": w -> i
        vowel(t + 0.47, { f0: 300, f1: 210, dur: 0.32, F1a: 300, F2a: 700, F1b: 720, F2b: 1100, vol: 0.22 });  // "WAW": w -> aw, pitch falls
        osc(t + 0.47, { type: 'square', f: 600, to: 420, dur: 0.3, vol: 0.02, lp: 1500 });
      },
      billLeave(t) { osc(t, { type: 'square', f: 880, to: 90, dur: 0.6, vol: 0.07, lp: 2200 }); osc(t, { type: 'sawtooth', f: 440, to: 55, dur: 0.6, vol: 0.05, lp: 900 }); noise(t + 0.05, { dur: 0.3, vol: 0.06, type: 'bandpass', f: 900, to: 200 }); },
      // ---- v9
      horn(t) { for (const [d, n] of [[0, 0], [0.32, 0.05]]) { osc(t + d, { type: 'square', f: 233, dur: 0.26, vol: 0.07, hold: 0.18, lp: 1400 }); osc(t + d, { type: 'square', f: 294, dur: 0.26, vol: 0.06, hold: 0.18, lp: 1400 }); } },
      skid(t) { for (let k = 0; k < 3; k++) osc(t + k * 0.16, { type: 'square', f: 1050, dur: 0.08, vol: 0.05, lp: 3000 }); noise(t + 0.05, { dur: 0.5, vol: 0.06, type: 'lowpass', f: 600, to: 250, a: 0.05 }); },
      truckload(t) { S.horn(t); [60, 64, 67, 72, 76, 79].forEach((n, i) => osc(t + 0.7 + i * 0.07, { type: 'square', f: N(n), dur: 0.12, vol: 0.05, lp: 4000 })); [72, 76, 79, 84].forEach(n => osc(t + 1.15, { type: 'triangle', f: N(n), dur: 0.7, vol: 0.07, hold: 0.2 })); },
      // ---- v8
      bom(t) { // Evan's "New BOM ready": two printer chirps + a bright two-note ding
        for (let k = 0; k < 5; k++) noise(t + k * 0.035, { dur: 0.02, vol: 0.08, type: 'bandpass', f: 2600 + k * 200, q: 4 });
        osc(t + 0.2, { type: 'square', f: N(79), dur: 0.09, vol: 0.06, lp: 4000 }); osc(t + 0.3, { type: 'triangle', f: N(84), dur: 0.3, vol: 0.12 });
      },
      rankUp(t) { [60, 64, 67, 72, 76].forEach((n, i) => osc(t + i * 0.07, { type: 'square', f: N(n + 7), dur: 0.1, vol: 0.05, lp: 4200 })); [67, 72, 76, 79].forEach(n => osc(t + 0.36, { type: 'triangle', f: N(n), dur: 0.6, vol: 0.07, hold: 0.15 })); },
      chip(t) { noise(t, { dur: 0.05, vol: 0.2, type: 'highpass', f: 5000 }); osc(t, { type: 'triangle', f: 2400, to: 1200, dur: 0.05, vol: 0.06 }); noise(t + 0.05, { dur: 0.03, vol: 0.1, type: 'highpass', f: 6500 }); },
      heat(t) { noise(t, { dur: 0.7, vol: 0.08, type: 'bandpass', f: 600, to: 3500, q: 1.2, a: 0.1 }); osc(t, { type: 'sine', f: 180, to: 320, dur: 0.6, vol: 0.06 }); },
      cold(t) { noise(t, { dur: 0.9, vol: 0.09, type: 'bandpass', f: 1800, to: 500, q: 2.5, a: 0.15 }); osc(t + 0.1, { type: 'triangle', f: N(88), dur: 0.25, vol: 0.04 }); osc(t + 0.25, { type: 'triangle', f: N(91), dur: 0.3, vol: 0.035 }); },
      snow(t) { [84, 88, 91, 96].forEach((n, i) => osc(t + i * 0.09, { type: 'sine', f: N(n), dur: 0.35, vol: 0.05 })); noise(t, { dur: 0.8, vol: 0.05, type: 'bandpass', f: 1500, to: 700, q: 2, a: 0.2 }); },
      over(t) { [67, 64, 60, 55].forEach((n, i) => osc(t + i * 0.16, { type: 'triangle', f: N(n), dur: i === 3 ? 0.6 : 0.16, vol: 0.16 })); osc(t + 0.48, { type: 'sine', f: N(43), dur: 0.6, vol: 0.12 }); },
      newBest(t) {
        [60, 64, 67, 72].forEach((n, i) => osc(t + i * 0.1, { type: 'square', f: N(n), dur: 0.1, vol: 0.06, lp: 3800 }));
        [60, 64, 67, 72].forEach(n => osc(t + 0.42, { type: 'triangle', f: N(n), dur: 0.8, vol: 0.09, hold: 0.3 }));
        osc(t + 0.42, { type: 'sine', f: N(48), dur: 0.8, vol: 0.15, hold: 0.3 });
      },
    };
    const DUCK = new Set(['perfect', 'widwaw', 'billLeave', 'over', 'newBest', 'adhereEarn', 'slice', 'cut', 'bonus', 'bom', 'rankUp', 'horn', 'skid', 'truckload']);
    function play(name, t, ...args) { if (!S[name]) return; S[name](t, ...args); if (DUCK.has(name)) duck(t); }

    // ---- rain loop (ambience)
    let rain = null;
    function rainOn(t) {
      if (rain) return; const s = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = nb; s.loop = true; lp.type = 'lowpass'; lp.frequency.value = 3200; hp.type = 'highpass'; hp.frequency.value = 400;
      s.connect(hp).connect(lp).connect(g).connect(ambBus); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.08, t + 0.8); s.start(t);
      const drips = []; for (let k = 0; k < 40; k++) drips.push(t + 0.3 + k * 0.23 + ((k * 37) % 11) / 60);
      rain = { s, g, drips }; for (const d of drips) osc(d, { type: 'sine', f: 1800 + ((d * 997) % 900), to: 900, dur: 0.05, vol: 0.035, dest: ambBus });
    }
    function rainOff(t) { if (!rain) return; rain.g.gain.cancelScheduledValues(t); rain.g.gain.setTargetAtTime(0, t, 0.25); rain.s.stop(t + 1.5); rain = null; }

    // ---- music: original procedural chiptune, I–V–vi–IV in C, 16th-note grid, scheduled one bar at a time
    const CH = [[48, [60, 64, 67]], [43, [59, 62, 67]], [45, [57, 60, 64]], [41, [57, 60, 65]]];
    const LEAD = [[0, 2, 1, 2, 0, -1, 2, -1, 1, 2, 0, -1, 2, 1, 0, -1], [2, -1, 1, 0, 2, 1, -1, 0, 1, -1, 2, 1, 0, -1, 1, 2]];
    function bar(t, i, bpm) {
      const st = 60 / bpm / 4, [root, tri] = CH[i % 4], pat = LEAD[(i >> 2) % 2];
      for (let k = 0; k < 16; k++) {
        const tt = t + k * st;
        if (k % 2 === 0) osc(tt, { type: 'triangle', f: N(root + (k % 4 === 2 ? 12 : 0)), dur: st * 1.7, vol: 0.32, dest: musicBus });
        if (pat[k] >= 0) osc(tt, { type: 'square', f: N(tri[pat[k]] + 12), dur: st * 0.9, vol: 0.07, lp: 2600, dest: musicBus });
        if (k % 4 === 0) osc(tt, { type: 'sine', f: 130, to: 42, dur: 0.12, vol: 0.45, dest: musicBus });
        if (k % 4 === 2) noise(tt, { dur: 0.03, vol: 0.12, type: 'highpass', f: 7000, dest: musicBus });
        if (k === 4 || k === 12) noise(tt, { dur: 0.09, vol: 0.16, type: 'bandpass', f: 1800, q: 0.8, dest: musicBus });
      }
      return 16 * st;
    }
    return { ctx, master, sfxBus, musicBus, play, rainOn, rainOff, bar, sounds: Object.keys(S) };
  }

  // ---------- runtime wrapper (live context, unlock, mute, music) ----------
  const st = { ctx: null, eng: null, unlocked: false, muted: false, music: false, musicActive: false, fast: false, rain: false, log: [], session: 'n/a', silentEl: false };
  function silentWavURL() { // 0.25 s of 8 kHz silence, generated (keeps iOS media session alive with the ring switch on silent)
    const n = 2000, b = new ArrayBuffer(44 + n * 2), v = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
  }
  function setSession() { try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; st.session = navigator.audioSession.type; } } catch (e) {} }
  setSession();
  function ensure() {
    if (!st.ctx) { try { st.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' }); st.eng = makeEngine(st.ctx); applyMute(true); } catch (e) { st.ctx = null; } }
    return st.ctx;
  }
  function unlock() { // call from a user gesture
    setSession(); const c = ensure(); if (!c) return null;
    if (c.state !== 'running') c.resume().catch(() => {});
    if (!st.unlocked) {
      try { const b = c.createBuffer(1, 1, c.sampleRate), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0); } catch (e) {}
      if (!navigator.audioSession) { // iOS < 17 fallback: a silent looping <audio> puts the page in "playback" so WebAudio ignores the silent switch
        try { const a = document.createElement('audio'); a.src = silentWavURL(); a.loop = true; a.setAttribute('playsinline', ''); a.setAttribute('x-webkit-airplay', 'deny'); a.preload = 'auto'; a.volume = 0.01; a.play().then(() => { st.silentEl = true; }).catch(() => {}); st.el = a; } catch (e) {}
      }
      st.unlocked = true;
    }
    return c;
  }
  function applyMute(now) { if (!st.eng) return; const g = st.eng.master.gain, t = st.ctx.currentTime; g.cancelScheduledValues(t); if (now) g.setValueAtTime(st.muted ? 0 : 0.9, t); else g.setTargetAtTime(st.muted ? 0 : 0.9, t, 0.03); }
  function play(name, ...args) {
    st.log.push(name); if (st.log.length > 400) st.log.shift();
    if (st.muted || !st.eng || st.ctx.state !== 'running') return;
    st.eng.play(name, st.ctx.currentTime + 0.005, ...args);
  }
  // music scheduler (lookahead): schedules whole bars just ahead of time; tempo changes take effect at the next bar
  let mNext = 0, mBar = 0, mTimer = 0;
  function musicTick() {
    if (!st.eng || st.ctx.state !== 'running') return;
    const want = st.music && st.musicActive && !st.muted;
    if (!want) { if (mTimer) { clearInterval(mTimer); mTimer = 0; } return; }
    const now = st.ctx.currentTime; if (mNext < now) mNext = now + 0.06;
    while (mNext < now + 0.35) { mNext += st.eng.bar(mNext, mBar++, st.fast ? 168 : 128); }
  }
  function syncMusic() { if (st.music && st.musicActive && !st.muted && st.eng) { if (!mTimer) { mTimer = setInterval(musicTick, 90); musicTick(); } } else musicTick(); }
  window.FBS_AUDIO = {
    makeEngine, unlock, play, state: st,
    setMuted(v) { st.muted = !!v; applyMute(false); if (st.muted && st.eng) st.eng.rainOff(st.ctx.currentTime); st.rain = false; syncMusic(); },
    setMusic(v) { st.music = !!v; syncMusic(); },
    setMusicActive(v) { if (st.musicActive !== !!v) { st.musicActive = !!v; syncMusic(); } },
    setFast(v) { st.fast = !!v; },
    setRain(v) { v = !!v && !st.muted; if (v === st.rain || !st.eng) return; st.rain = v; st.log.push(v ? 'rainOn' : 'rainOff'); if (st.ctx.state !== 'running') return; if (v) st.eng.rainOn(st.ctx.currentTime); else st.eng.rainOff(st.ctx.currentTime); },
    get running() { return !!(st.ctx && st.ctx.state === 'running'); },
  };
})();
