/* Foam Board Stacker – canvas 2D, delta-time loop. */
(function () {
  'use strict';
  const CFG = window.FBS_CONFIG, PRODUCTS = window.FBS_PRODUCTS, SPR = window.FBS_SPRITES;
  const $ = id => document.getElementById(id);
  const cv = $('game'); let ctx = cv.getContext('2d');
  const LS = { best: 'fbs.best', mute: 'fbs.mute', coll: 'fbs.collection' };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- tunables ----------
  const T = {
    PERFECT_PX: 4, GROW_AFTER: 3, GROW_PX: 5, DEPTH_X: 9, DEPTH_Y: 11,
    BASE_SPEED: 0.42, SPEED_STEP: 0.022, SPEED_MAX: 2.6, // speed as fraction of view width per second
    RAIN_EVERY: 15, RAIN_LEN: 5, MILESTONE: 20,
    PALLET_T: 16, DIE_X: 60, 
    EXTRUDE_PUSH: 0.22, EXTRUDE_CUT: 0.08, // extrusion: push-out + cut = 0.30 s
  };

  // ---------- RNG (seedable for tests) ----------
  const qs = new URLSearchParams(location.search);
  let seed = qs.has('seed') ? (+qs.get('seed') >>> 0) || 1 : (Math.random() * 2 ** 32) >>> 0;
  function rnd() { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const pick = a => a[Math.floor(rnd() * a.length)];

  // ---------- pure drop math (exported for tests) ----------
  // prev/cur: {x,w}. o: {perfectPx, stickPx, springBack, wrapPx}
  function computeDrop(prev, cur, o = {}) {
    const win = o.perfectPx == null ? T.PERFECT_PX : o.perfectPx;
    const dx = cur.x - prev.x, ad = Math.abs(dx);
    const left = Math.max(cur.x, prev.x), right = Math.min(cur.x + cur.w, prev.x + prev.w), ov = right - left;
    if (ov <= 0) return { hit: false, miss: true, x: cur.x, w: cur.w, cut: { x: cur.x, w: cur.w }, overhang: cur.w };
    if (ad <= win) return { hit: true, perfect: true, x: prev.x, w: cur.w, cut: null, overhang: 0, snapped: ad };
    let overhang = cur.w - ov;
    if (o.stickPx && overhang <= o.stickPx) return { hit: true, perfect: false, stuck: true, x: cur.x, w: cur.w, cut: null, overhang };
    const keep = o.springBack ? overhang * o.springBack : 0;
    const cutW = overhang - keep;
    const res = { hit: true, perfect: false, overhang, wrapped: !!(o.wrapPx && overhang <= o.wrapPx), kept: keep };
    if (dx > 0) { res.x = left; res.w = ov + keep; res.cut = { x: left + res.w, w: cutW }; }
    else { res.x = left - keep; res.w = ov + keep; res.cut = { x: cur.x, w: cutW }; }
    return res;
  }

  // ---------- audio ----------
  let actx = null, muted = store.get(LS.mute, false);
  function ac() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } } if (actx && actx.state === 'suspended') actx.resume(); return actx; }
  function tone(f, dur, type = 'sine', vol = 0.15, slide = 0, delay = 0) {
    if (muted) return; const a = ac(); if (!a) return;
    const t0 = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(a.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol = 0.12, hp = 1800) {
    if (muted) return; const a = ac(); if (!a) return;
    const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); s.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    s.connect(f).connect(g).connect(a.destination); s.start();
  }
  const sfx = {
    drop() { tone(150, 0.12, 'triangle', 0.22, -60); },
    slice() { noise(0.12, 0.14, 2500); tone(520, 0.06, 'square', 0.04, -200); },
    perfect(n) { const b = 520 * Math.pow(1.0595, Math.min(n, 14) * 2); tone(b, 0.16, 'sine', 0.16); tone(b * 1.5, 0.2, 'sine', 0.08, 0, 0.05); },
    grow() { tone(660, 0.1, 'triangle', 0.1, 300); },
    over() { tone(330, 0.25, 'sawtooth', 0.07, -180); tone(220, 0.4, 'sawtooth', 0.06, -120, 0.18); },
    extrude() { tone(90, 0.22, 'sawtooth', 0.035, 40); },
    cut() { noise(0.05, 0.12, 4000); tone(1400, 0.04, 'square', 0.03, -600); },
    bonus() { [660, 880, 1100].forEach((f, i) => tone(f, 0.12, 'triangle', 0.1, 0, i * 0.07)); },
  };
  const buzz = ms => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };

  // ---------- images ----------
  const img = src => { const i = new Image(); i.src = src; return i; };
  const emblem = img(CFG.BRAND_EMBLEM);

  // ---------- layout ----------
  const IS_ANDROID = /Android/i.test(navigator.userAgent);
  let W = 390, H = 844, DPR = 1, safeTop = 0, safeBot = 0;
  function measureSafe() {
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden';
    document.body.appendChild(d); const cs = getComputedStyle(d); safeTop = parseFloat(cs.paddingTop) || 0; safeBot = parseFloat(cs.paddingBottom) || 0; d.remove();
  }
  function resize() {
    W = window.innerWidth; H = window.innerHeight; DPR = Math.min(IS_ANDROID ? 2 : 3, window.devicePixelRatio || 1);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); measureSafe(); layoutBottom();
  }

  // ---------- state ----------
  let S = null;
  const best = () => store.get(LS.best, 0);
  let collection = new Set(store.get(LS.coll, []));
  const productById = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));
  const BOARDS = PRODUCTS.filter(p => p.kind !== 'accessory'), ACCESSORIES = PRODUCTS.filter(p => p.kind === 'accessory');
  const ADHERE_EVERY = 3, ADHERE_MAX = 2, ADHERE_POP = 'ADHERE™ — holds up to ½ lb/sq in, removes damage-free';
  // ---------- scale (hosts vs. boards, closer to real life) ----------
  // hosts: ~1.5x the v2 size, integer device-pixel scaling so the pixel art stays crisp
  function geo() {
    const base = W < 380 ? 1.3 : 1.5, sc = Math.max(1, Math.round(base * 1.5 * DPR) / DPR), hw = SPR.W * sc, hh = SPR.H * sc;
    const palletT = Math.max(14, Math.round(hh / 7)); // a pallet is ~1/12 a person; ~1/7 here so the deck still reads
    // starting board ~2-2.5x a host's height, but never under 55% of the screen width (playability)
    const bw = Math.round(Math.min(250, Math.max(W * 0.55, Math.min(2.5 * hh, W - 2 * hw - 30))));
    const oldW = Math.round(Math.min(W * 0.6, 250)); // v2 width: speed and px tolerances scale by bw/oldW so difficulty is unchanged
    // board thickness: ONE px-per-inch for every product and gauge (= hh/6, i.e. thickness exaggerated 12x vs. a 6 ft host)
    const ppi = hh / 6;
    return { sc, hw, hh, palletT, bw, k: bw / oldW, ppi };
  }
  const baseW = () => geo().bw;
  const thickFor = g => g.inches * ((S && S.ppi) || geo().ppi); // exactly proportional to the real gauge
  const K = () => (S && S.k) || geo().k;
  let bottomUI = 0; // px reserved at the bottom for the spotlight ticker
  function layoutBottom() { const t = $('bottomBar'); bottomUI = t && !t.hidden ? H - t.getBoundingClientRect().top : safeBot; }
  const groundY = () => { const g = geo(); return H - bottomUI - Math.max(24, Math.round(g.hh / 2 - g.palletT + 30)); }; // hosts stand in front of the pallet; their feet + names stay above the fact bar // screen y of world 0 (floor the pallet and hosts stand on)

  function lookFor(p) {
    const v = pick(p.look.variants);
    return { face: v[0], core: v[1], backing: p.look.backingVariants ? pick(p.look.backingVariants) : p.look.backing || null };
  }
  function newGame() {
    const G = geo(), bw = G.bw;
    S = {
      k: G.k, ppi: G.ppi, adhere: 0, adhereArmed: false, perfStreak: 0, rescueUsed: false,
      mode: 'play', t: 0, score: 0, floors: 0, height: 0, combo: 0, perfects: 0, maxCombo: 0,
      stack: [{ x: (W - bw) / 2, w: bw, y: 0, t: G.palletT, base: true }], extrudeLog: [], palletRect: null,
      falling: [], parts: [], flashes: [], cam: 0, camT: 0, shake: 0,
      heatNext: false, quickBond: 0, retryAvail: false, bonusNext: false,
      rain: 0, rainDrops: [], unlockedNow: [], hostState: [{ anim: 'idle', t: 0, bubble: null }, { anim: 'idle', t: 0, bubble: null }],
      moving: null, overT: 0, maxW: bw, seen: new Set(),
    };
    spawn();
  }
  function top() { return S.stack[S.stack.length - 1]; }
  function speedFor(p) {
    let s = Math.min(T.SPEED_MAX, 1 + S.floors * T.SPEED_STEP) * T.BASE_SPEED * Math.min(W, 520) * K();
    const id = p.trait.id;
    if (id === 'featherweight') s *= 0.7;
    if (id === 'heavy-duty') s *= 1.2;
    if (S.quickBond > 0) s *= 0.75;
    if (S.rain > 0 && !p.moistureResistant) s *= 1.15;
    return s;
  }
  function spawn() {
    const p = pick(BOARDS), tp = top(); // ADHERE™ is a fastener, never a board
    let w = tp.w;
    const bonus = S.bonusNext; S.bonusNext = false;
    if (bonus) w = Math.min(S.maxW, w + Math.round(12 * K()));
    const gauge = pick(p.gauges), m = { p, gauge, look: lookFor(p), w, t: thickFor(gauge), dir: 1, bonus, retry: false };
    m.y = tp.y + tp.t; m.speed = speedFor(p);
    m.extrude = { t: 0, start: performance.now(), cut: false }; m.x = T.DIE_X - w; // still inside the die
    S.moving = m; S.lineName = p.name + ' · ' + gauge.label; S.lineFlash = 0.6;
    if (S.quickBond > 0) S.quickBond--;
    updateNowBoard(); sfx.extrude();
  }
  function updateNowBoard() {
    const m = S && S.moving; const el = $('nowBoard');
    if (!m) { el.textContent = ''; return; }
    el.innerHTML = '';
    const b = document.createElement('b'); b.textContent = m.p.trait.name; el.append(b, document.createTextNode((m.bonus ? ' · Bonus!' : '') + (S.rain > 0 ? ' · ☔ Rain' : '')));
  }

  function drop() {
    if (!S || S.mode !== 'play' || !S.moving || S.moving.extrude) return; // must clear the extrusion line first
    const m = S.moving, tp = top(), id = m.p.trait.id;
    const k = K(); let perfectPx = T.PERFECT_PX * k;
    if (id === 'slide-align') perfectPx = 16 * k;
    if (S.heatNext) perfectPx *= 2;
    if (S.rain > 0 && !m.p.moistureResistant) perfectPx = 1 * k;
    S.heatNext = false;
    const armed = S.adhereArmed;
    const r = computeDrop(tp, m, { perfectPx, stickPx: armed ? 1e9 : id === 'self-adhesive' ? 14 * k : 0, springBack: id === 'spring-back' ? 0.25 : 0, wrapPx: id === 'v-cut-wrap' ? 10 * k : 0 });
    if (r.miss) {
      if (id === 'impact' && !m.retry) { // bounce back once
        m.retry = true; m.dir = 1; m.x = T.DIE_X; host(0, 'cheer', 'One more try!'); sfx.grow(); buzz(15); return;
      }
      if (S.adhere > 0 && !S.rescueUsed) { offerRescue(); return; }
      S.falling.push(mkPiece(m.x, m.w, m)); S.moving = null; sfx.over(); buzz([30, 40, 60]); S.shake = 8;
      S.mode = 'dying'; S.overT = 0.85; return;
    }
    // land
    const usedAdhere = armed && !r.perfect;
    const board = { adhered: usedAdhere ? { l: Math.max(r.x, tp.x), r: Math.min(r.x + r.w, tp.x + tp.w) } : null, x: r.x, w: r.w, y: tp.y + tp.t, t: m.t, gauge: m.gauge, p: m.p, look: m.look, landT: 0, extruded: m.extruded };
    S.stack.push(board);
    let pts = id === 'heavy-duty' ? 2 : 1, floorsAdd = pts;
    if (r.perfect) {
      S.combo += id === 'archival' ? 2 : 1; S.perfects++;
      pts += 1;
      if (S.combo >= T.GROW_AFTER) grow(board, T.GROW_PX * K());
      if (id === 'permanent') grow(board, 8 * K());
      if (id === 'heat-bond') S.heatNext = true;
      burst(board, 22); sfx.perfect(S.combo); buzz(12);
      host(0, 'cheer', 'Excellent', true); host(1, 'cheer', 'Good job', true); // every Perfect: both hosts cheer together
      S.perfStreak++; if (S.perfStreak % ADHERE_EVERY === 0) earnAdhere();
    } else {
      S.perfStreak = 0;
      if (usedAdhere) { S.adhereArmed = false; S.adhere--; updateAdhere(); sfx.grow(); }
      if (r.stuck) { sfx.drop(); flash(board.x + (r.x > tp.x ? board.w : 0), board, '#7cf0a5'); }
      else { sliced(r, m, board); }
      if (r.wrapped) { S.combo++; host(1, 'cheer', 'Wrapped!'); }
      else if (id !== 'clean-cut' && !usedAdhere) S.combo = 0; // ADHERE™ is damage-free: combo kept
      buzz(8);
    }
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    if (id === 'quick-bond') S.quickBond = 3;
    if (id === 'color-pop') pts += 3;
    if (id === 'velvet-black') pts += 5;
    if (m.bonus) { pts += 5; }
    if (id === 'rain-shield' && S.rain > 0) pts *= 2;
    S.score += pts; S.floors += floorsAdd; S.height = S.stack.length - 1;
    if (S.rain > 0) S.rain--;
    if (S.floors >= T.RAIN_EVERY && S.rain === 0 && Math.floor(S.floors / T.RAIN_EVERY) > (S.rainCount || 0)) { S.rainCount = Math.floor(S.floors / T.RAIN_EVERY); S.rain = T.RAIN_LEN; host(1, 'idle', 'Rain! ☔ Watch out'); }
    const ms = Math.floor(S.floors / T.MILESTONE); if (ms > (S.msCount || 0)) { S.msCount = ms; S.bonusNext = true; host(ms % 2, 'cheer', 'Bonus board for you!'); sfx.bonus(); }
    if (!collection.has(m.p.id)) { collection.add(m.p.id); store.set(LS.coll, [...collection]); S.unlockedNow.push(m.p.id); toast('New card: ' + m.p.name); }
    $('score').textContent = S.score;
    S.camT = camTarget(board.y + board.t);
    spawn();
  }
  function camTarget(topY) { // keep the stack top ~45% down the free play area between the HUD and the ground
    const hb = $('hud').getBoundingClientRect(), hudB = (hb.height ? hb.bottom : safeTop + 150) + Math.max(64, Math.round(geo().hh * 1.05 + 26)), // room for the extruder hopper + name plate
       g = groundY(), target = hudB + Math.max(40, g - hudB) * 0.35;
    return Math.max(0, topY - (g - target));
  }
  function grow(board, px) {
    const nw = Math.min(S.maxW, board.w + px); if (nw <= board.w) return;
    board.x -= (nw - board.w) / 2; board.w = nw; board.x = Math.max(-T.DEPTH_X, Math.min(W - nw, board.x)); sfx.grow();
    S.flashes.push({ kind: 'grow', b: board, t: 0.4 });
  }
  function mkPiece(x, w, m, y) {
    return { x, w, y: y == null ? m.y : y, t: m.t, look: m.look, p: m.p, vx: (x + w / 2 < W / 2 ? -1 : 1) * (40 + rnd() * 60), vy: 60, rot: 0, vr: (rnd() - 0.5) * 5 };
  }
  function sliced(r, m, board) {
    if (r.cut && r.cut.w > 0.5) {
      const pc = mkPiece(r.cut.x, r.cut.w, m, board.y); pc.vx = (r.cut.x > board.x ? 1 : -1) * (60 + rnd() * 80); pc.vr = (r.cut.x > board.x ? 1 : -1) * (2 + rnd() * 3);
      S.falling.push(pc); flash(r.cut.x > board.x ? r.cut.x : r.cut.x + r.cut.w, board, '#ffffff');
    }
    sfx.slice();
  }
  function flash(x, board, col) { S.flashes.push({ kind: 'slice', x, b: board, t: 0.25, col }); }
  function burst(board, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, sp = 80 + rnd() * 220;
      S.parts.push({ x: board.x + rnd() * board.w, y: board.y + board.t, vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + 60, life: 0.7 + rnd() * 0.4, t: 0, col: pick(['#f5c542', '#ffffff', '#8fb8ff', '#ff8fa3', '#7cf0a5']) });
    }
    S.flashes.push({ kind: 'ring', b: board, t: 0.35 });
  }
  function sparks(x, y) {
    for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4, sp = 120 + rnd() * 260; S.parts.push({ x, y, vx: Math.cos(a) * sp * 0.6, vy: -Math.sin(a) * sp, life: 0.25 + rnd() * 0.25, t: 0, col: pick(['#fff3b0', '#ffd75e', '#ff9d3a', '#ffffff']) }); }
    S.flashes.push({ kind: 'cut', t: 0.12, b: top() });
  }
  function host(i, anim, text, both) {
    if (!S) return; const h = S.hostState[i]; h.anim = anim; h.t = anim === 'cheer' ? 1.0 : 0; if (text) { h.bubble = { text, t: 1.5 }; if (!both) S.hostState[1 - i].bubble = null; }
  }

  // ---------- ADHERE™ power-up ----------
  function earnAdhere() {
    if (!collection.has('adhere')) { collection.add('adhere'); store.set(LS.coll, [...collection]); S.unlockedNow.push('adhere'); }
    if (S.adhere >= ADHERE_MAX) return;
    S.adhere++; S.adhereLog = (S.adhereLog || 0) + 1; updateAdhere(); toast(ADHERE_POP, '📌 +1 '); sfx.grow(); buzz(10);
  }
  function updateAdhere() {
    const b = $('btnAdhere'); if (!b) return; const n = S ? S.adhere : 0;
    b.hidden = !S || n <= 0; $('adhereCount').textContent = n; b.classList.toggle('armed', !!(S && S.adhereArmed));
    b.setAttribute('aria-label', `ADHERE fastener, ${n} left` + (S && S.adhereArmed ? ', armed' : '')); b.setAttribute('aria-pressed', S && S.adhereArmed ? 'true' : 'false');
  }
  function toggleAdhere() {
    if (!S || S.mode !== 'play' || S.adhere <= 0) return;
    S.adhereArmed = !S.adhereArmed; updateAdhere(); if (S.adhereArmed) toast(ADHERE_POP, '📌 Armed: '); buzz(6);
  }
  function offerRescue() { // once per game: a full miss can be saved with a fastener
    S.rescueUsed = true; S.mode = 'rescue'; $('rescue').hidden = false;
  }
  function rescue(yes) {
    if (!S || S.mode !== 'rescue') return; $('rescue').hidden = true; S.mode = 'play';
    if (yes) { S.adhere--; S.adhereArmed = false; updateAdhere(); const m = S.moving; m.dir = 1; m.x = T.DIE_X; host(0, 'cheer', 'Fastened!'); toast(ADHERE_POP, '📌 '); sfx.grow(); buzz(15); }
    else drop();
  }

  // ---------- toast ----------
  function toast(msg, icon) { // shown in the HUD pill so nothing stacks over the play area
    const el = $('deckBlurb'); el.textContent = (icon || '🃏 ') + msg; el.hidden = false; el.style.opacity = 1; clearTimeout(deckTimer);
    deckTimer = setTimeout(() => { el.style.opacity = 0; deckTimer = setTimeout(() => (el.hidden = true), 300); }, 1600);
  }


  // ---------- update ----------
  function update(dt) {
    if (!S) return;
    S.t += dt;
    S.cam += (S.camT - S.cam) * Math.min(1, dt * 6);
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 30);
    for (const h of S.hostState) { if (h.anim === 'cheer') { h.t -= dt; if (h.t <= 0) h.anim = 'idle'; } if (h.bubble) { h.bubble.t -= dt; if (h.bubble.t <= 0) h.bubble = null; } }
    if (S.mode === 'play' && S.moving) {
      const m = S.moving;
      if (m.extrude) {
        const e = m.extrude; e.t += dt; const P = T.EXTRUDE_PUSH;
        const k = Math.min(1, e.t / P); m.x = T.DIE_X - m.w + m.w * (1 - Math.pow(1 - k, 2));
        if (e.t >= P && !e.cut) { e.cut = true; e.cutAt = e.t; sparks(T.DIE_X + 2, m.y + m.t / 2); sfx.cut(); buzz(6); }
        if (e.t >= P + T.EXTRUDE_CUT) { m.x = T.DIE_X; m.extrude = null; m.extruded = true; S.extrudeLog.push({ ms: performance.now() - e.start, sim: e.t, id: m.p.id }); }
      } else if (m.speed > 0) { m.x += m.dir * m.speed * dt;
      const minX = T.DIE_X, maxX = W - m.w * 0.65;
      if (m.x > maxX) { m.x = maxX - (m.x - maxX); m.dir = -1; } else if (m.x < minX) { m.x = minX + (minX - m.x); m.dir = 1; } }
    }
    if (S.lineFlash > 0) S.lineFlash -= dt;
    for (const b of S.stack) if (b.landT != null && b.landT < 1) b.landT += dt * 6;
    for (let i = S.falling.length - 1; i >= 0; i--) { const f = S.falling[i]; f.vy -= 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; if (f.y < S.cam - H) S.falling.splice(i, 1); }
    for (let i = S.parts.length - 1; i >= 0; i--) { const p = S.parts[i]; p.t += dt; p.vy -= 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life) S.parts.splice(i, 1); }
    for (let i = S.flashes.length - 1; i >= 0; i--) { S.flashes[i].t -= dt; if (S.flashes[i].t <= 0) S.flashes.splice(i, 1); }
    if (S.rain > 0 || S.rainDrops.length) {
      if (S.rain > 0) for (let i = 0; i < 4; i++) S.rainDrops.push({ x: rnd() * W, y: -10, v: 600 + rnd() * 300 });
      for (let i = S.rainDrops.length - 1; i >= 0; i--) { const d = S.rainDrops[i]; d.y += d.v * dt; d.x -= 60 * dt; if (d.y > H) S.rainDrops.splice(i, 1); }
    }
    if (S.mode === 'dying') { S.overT -= dt; if (S.overT <= 0) gameOver(); }
  }

  // ---------- render ----------
  const sy = wy => groundY() - (wy - S.cam);
  function shade(hex, f) {
    const n = parseInt(hex.slice(1, 7), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function drawBoard(x, yb, w, t, look, p, opts = {}) {
    // yb: screen y of the bottom of the front edge
    const DX = T.DEPTH_X, DY = T.DEPTH_Y, yt = yb - t;
    const face = look.face, core = look.core, L = (p && p.look) || {};
    // top face
    ctx.fillStyle = shade(face, face === '#24252b' || face === '#1d1d22' ? 0.08 : -0.02);
    ctx.beginPath(); ctx.moveTo(x, yt); ctx.lineTo(x + w, yt); ctx.lineTo(x + w + DX, yt - DY); ctx.lineTo(x + DX, yt - DY); ctx.closePath(); ctx.fill();
    if (L.pattern === 'canvas') { ctx.fillStyle = '#00000012'; for (let i = 2; i < w; i += 3) ctx.fillRect(x + i + 2, yt - DY + 2, 1, DY - 3); }
    if (L.gloss) { ctx.fillStyle = '#ffffff22'; ctx.fillRect(x + DX * 0.6 + w * 0.15, yt - DY * 0.6, w * 0.25, 2); }
    // subtle brand print on the board face
    if (emblem.complete && emblem.naturalWidth && w > 40 && !opts.noPrint) {
      const eh = DY - 2, ew = eh * emblem.naturalWidth / emblem.naturalHeight;
      ctx.save(); ctx.globalAlpha = face === '#24252b' || face === '#1d1d22' ? 0.35 : 0.28; ctx.translate(x, yt); ctx.transform(1, 0, -DX / DY, 1, 0, 0);
      ctx.drawImage(emblem, w / 2 - ew / 2 + DX / 2, -DY + 1, ew, eh); ctx.restore();
    }
    // right side (end of board)
    ctx.fillStyle = shade(core, -0.28);
    ctx.beginPath(); ctx.moveTo(x + w, yt); ctx.lineTo(x + w + DX, yt - DY); ctx.lineTo(x + w + DX, yb - DY); ctx.lineTo(x + w, yb); ctx.closePath(); ctx.fill();
    // front edge: liner / foam core / liner (the foam-board look)
    const liner = L.solid ? 0 : Math.max(1, Math.min(L.liner || 2, t / 5));
    ctx.fillStyle = core; ctx.fillRect(x, yt, w, t);
    if (L.pattern === 'honeycomb') { ctx.strokeStyle = shade(core, -0.25); ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i < w; i += 7) { ctx.moveTo(x + i, yt + liner + 1); ctx.lineTo(x + i + 3.5, yb - liner - 1); ctx.lineTo(x + i + 7, yt + liner + 1); } ctx.stroke(); }
    else if (L.velvet) { ctx.fillStyle = '#ffffff08'; ctx.fillRect(x, yt + t * 0.45, w, 1); }
    else if (!L.solid) { ctx.fillStyle = '#0000000d'; ctx.fillRect(x, yt + t / 2, w, 1); }
    if (liner) { ctx.fillStyle = shade(face, -0.06); ctx.fillRect(x, yt, w, liner); ctx.fillStyle = shade(face, -0.12); ctx.fillRect(x, yb - liner, w, liner); }
    if (look.backing) { ctx.fillStyle = look.backing; ctx.fillRect(x, yb - 2, w, 2); if (L.pattern === 'grid') { ctx.fillStyle = '#7d8aa0'; for (let i = 3; i < w; i += 6) ctx.fillRect(x + i, yb - 2, 1, 2); } }
    ctx.fillStyle = '#00000030'; ctx.fillRect(x, yb - 1, w, 1);
    if (opts.bonus) { ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 2; ctx.strokeRect(x - 1, yt - 1, w + 2, t + 2); }
  }
  function drawTabs(b, yb) { // little ADHERE™ fastener tabs across the held joint
    for (const jx of [b.adhered.l, b.adhered.r]) {
      if (jx <= b.x + 1 || jx >= b.x + b.w - 1) continue;
      const tw = 12, th = Math.max(14, b.t + 12), x = Math.round(jx - tw / 2), y = Math.round(yb - b.t / 2 - th / 2);
      ctx.fillStyle = '#eef0f3'; ctx.fillRect(x, y, tw, th); ctx.fillStyle = '#c9ced8'; ctx.fillRect(x, y, tw, 3); ctx.fillStyle = '#7d8699'; ctx.fillRect(x + 5, y + 5, 2, 2); ctx.fillRect(x + 5, y + th - 5, 2, 2);
      ctx.strokeStyle = '#2b303f'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, tw - 1, th - 1);
      ctx.fillStyle = '#00000040'; ctx.fillRect(x + tw, y + 1, 1, th - 1);
    }
  }
  const WOOD = { top: '#d3a46a', face: '#c4935a', block: '#b5844e', dark: '#8a5f33', grain: '#a87a45', side: '#94683a' };
  function drawPallet(b) {
    const yb = Math.round(sy(b.y)), yt = Math.round(sy(b.y + b.t)), x = Math.round(b.x - 8), w = Math.round(b.w + 16), DX = T.DEPTH_X, DY = T.DEPTH_Y;
    // warehouse floor
    ctx.fillStyle = '#171a23'; ctx.fillRect(0, yb, W, H - yb + 400); ctx.fillStyle = '#2a2f3e'; ctx.fillRect(0, yb, W, 2);
    ctx.fillStyle = '#00000055'; ctx.beginPath(); ctx.ellipse(x + w / 2 + DX / 2, yb + 3, w / 2 + 10, 5, 0, 0, Math.PI * 2); ctx.fill();
    // top deck surface (planks run front-to-back)
    ctx.fillStyle = WOOD.top; ctx.beginPath(); ctx.moveTo(x, yt); ctx.lineTo(x + w, yt); ctx.lineTo(x + w + DX, yt - DY); ctx.lineTo(x + DX, yt - DY); ctx.closePath(); ctx.fill();
    const planks = Math.max(5, Math.round(w / 34)), pw = w / planks;
    for (let i = 1; i < planks; i++) { const px = Math.round(x + i * pw); ctx.fillStyle = '#1b130b'; ctx.beginPath(); ctx.moveTo(px - 2, yt); ctx.lineTo(px + 1, yt); ctx.lineTo(px + 1 + DX, yt - DY); ctx.lineTo(px - 2 + DX, yt - DY); ctx.closePath(); ctx.fill(); }
    // right side
    ctx.fillStyle = WOOD.side; ctx.beginPath(); ctx.moveTo(x + w, yt); ctx.lineTo(x + w + DX, yt - DY); ctx.lineTo(x + w + DX, yb - DY); ctx.lineTo(x + w, yb); ctx.closePath(); ctx.fill();
    // front: top deck board ends, blocks with forklift openings, bottom deck
    const deck = Math.max(3, Math.round(b.t * 0.28)), bot = Math.max(2, Math.round(b.t * 0.18)), bh = b.t - deck - bot;
    for (let i = 0; i < planks; i++) { const px = Math.round(x + i * pw), pww = Math.round(pw) - 2; ctx.fillStyle = WOOD.face; ctx.fillRect(px, yt, pww, deck); ctx.fillStyle = WOOD.grain; ctx.fillRect(px + 2, yt + 2, Math.max(2, pww - 6), 1); ctx.fillRect(px + 4, yt + 4, Math.max(2, pww / 2), 1); }
    ctx.fillStyle = '#0a0b0f'; ctx.fillRect(x, yt + deck, w, bh); // forklift openings (deep shadow)
    ctx.fillStyle = '#ffffff08'; ctx.fillRect(x, yt + deck, w, 2);
    const bw2 = Math.max(12, Math.round(w * 0.09));
    for (const bx of [x, Math.round(x + w / 2 - bw2 / 2), x + w - bw2]) {
      ctx.fillStyle = WOOD.block; ctx.fillRect(bx, yt + deck, bw2, bh);
      ctx.fillStyle = WOOD.dark; ctx.fillRect(bx, yt + deck, bw2, 1); ctx.fillRect(bx + bw2 - 2, yt + deck, 2, bh);
      ctx.fillStyle = WOOD.grain; for (let gy = 3; gy < bh - 1; gy += 4) ctx.fillRect(bx + 3 + (gy % 3), yt + deck + gy, bw2 - 8, 1);
      ctx.fillStyle = '#3a2a18'; ctx.fillRect(bx + 3, yt + deck + 2, 2, 2); ctx.fillRect(bx + bw2 - 6, yt + deck + bh - 5, 2, 2); // nails
    }
    ctx.fillStyle = WOOD.face; ctx.fillRect(x, yb - bot, w, bot); ctx.fillStyle = WOOD.grain; for (let i = 6; i < w - 10; i += 23) ctx.fillRect(x + i, yb - bot + 2, 12, 1);
    ctx.fillStyle = '#00000040'; ctx.fillRect(x, yb - 1, w, 1);
    S.palletRect = { x, y: yt - DY, w: w + DX, h: yb - yt + DY };
  }
  function drawLine(front) {
    // extrusion line pinned to the top of the stack (follows the camera); sized ~1-1.1x a host's height
    const tp = top(), m = S.moving, lineY = Math.round(sy(tp.y + tp.t)), t = m ? m.t : 9, D = T.DIE_X, now = performance.now() / 1000, E = geo().hh;
    const by = lineY - t, bodyTop = by - Math.round(E * 0.16), bodyBot = lineY + Math.round(E * 0.12), hopTop = bodyTop - Math.round(E * 0.62), floorY = Math.min(H + 10, Math.round(sy(0)));
    if (!front) {
      // conveyor bed + rollers (behind the stack)
      ctx.fillStyle = '#2b303f'; ctx.fillRect(D - 2, lineY + 8, 104, 4);
      const spin = (m && (m.extrude || m.speed > 0)) ? now * 18 : 0;
      for (let i = 0; i < 6; i++) { const rx = D + 7 + i * 17, ry = lineY + 5; ctx.fillStyle = '#8b93a8'; ctx.beginPath(); ctx.arc(rx, ry, 5, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#3b4052'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx - Math.cos(spin) * 4.5, ry - Math.sin(spin) * 4.5); ctx.lineTo(rx + Math.cos(spin) * 4.5, ry + Math.sin(spin) * 4.5); ctx.stroke(); }
      return;
    }
    // machine stand down to the floor (lifts with the stack)
    if (floorY > bodyBot) { ctx.fillStyle = '#262a36'; ctx.fillRect(6, bodyBot, 8, floorY - bodyBot); ctx.fillRect(D - 22, bodyBot, 8, floorY - bodyBot); ctx.fillStyle = '#323748'; for (let yy = bodyBot + 10; yy < floorY - 4; yy += 22) ctx.fillRect(6, yy, D - 20, 3); ctx.fillStyle = '#1c1f29'; ctx.fillRect(2, floorY - 3, D - 10, 3); }
    // gearbox / motor at the back
    ctx.fillStyle = '#3d4458'; ctx.fillRect(-2, bodyTop - Math.round(E * 0.2), 14, Math.round(E * 0.2)); ctx.fillStyle = '#2d8f6a'; ctx.fillRect(0, bodyTop - Math.round(E * 0.2) + 3, 3, 3);
    // barrel with heater bands
    const g = ctx.createLinearGradient(0, bodyTop, 0, bodyBot); g.addColorStop(0, '#7c849b'); g.addColorStop(0.5, '#565d73'); g.addColorStop(1, '#383d4d');
    ctx.fillStyle = g; ctx.fillRect(-4, bodyTop, D - 6, bodyBot - bodyTop);
    for (const hx of [6, 20, 34]) { ctx.fillStyle = '#b4582a'; ctx.fillRect(hx, bodyTop - 2, 8, bodyBot - bodyTop + 4); ctx.fillStyle = '#e07a3c'; ctx.fillRect(hx + 1, bodyTop - 1, 2, bodyBot - bodyTop + 2); ctx.fillStyle = '#6b2f14'; ctx.fillRect(hx + 7, bodyTop - 2, 1, bodyBot - bodyTop + 4); }
    // hopper with pellets
    const hx0 = 10, hx1 = 50, neck = 8;
    ctx.fillStyle = '#6d758b'; ctx.beginPath(); ctx.moveTo(hx0, hopTop); ctx.lineTo(hx1, hopTop); ctx.lineTo(30 + neck, bodyTop - Math.round(E * 0.12)); ctx.lineTo(30 + neck, bodyTop); ctx.lineTo(30 - neck, bodyTop); ctx.lineTo(30 - neck, bodyTop - Math.round(E * 0.12)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff14'; ctx.fillRect(hx0 + 4, hopTop + 3, 3, Math.round(E * 0.3));
    ctx.fillStyle = '#4b5265'; ctx.fillRect(hx0 - 2, hopTop - 3, hx1 - hx0 + 4, 4);
    ctx.fillStyle = '#e9edf3'; for (let i = 0; i < 12; i++) ctx.fillRect(hx0 + 4 + (i * 7) % (hx1 - hx0 - 8), hopTop + 2 + (i % 3) * 2, 2, 2); // pellets
    // die block with slit
    ctx.fillStyle = '#2a2e3a'; ctx.fillRect(D - 10, bodyTop - 6, 10, bodyBot - bodyTop + 12); ctx.fillStyle = '#4a5064'; ctx.fillRect(D - 10, bodyTop - 6, 10, 2); ctx.fillStyle = '#11131a'; ctx.fillRect(D - 2, by, 2, t);
    // cutoff knife
    const e = m && m.extrude, P = T.EXTRUDE_PUSH;
    let drop = 0; if (e && e.t >= P) drop = Math.min(1, (e.t - P) / (T.EXTRUDE_CUT * 0.6)) * (1 - Math.max(0, (e.t - P - T.EXTRUDE_CUT * 0.6) / (T.EXTRUDE_CUT * 0.4)));
    const kTop = by - T.DEPTH_Y - 22;
    ctx.fillStyle = '#3b4052'; ctx.fillRect(D - 4, kTop, 14, 10); ctx.fillStyle = '#f5c542'; ctx.fillRect(D - 4, kTop + 8, 14, 2);
    ctx.fillStyle = '#d7dde8'; ctx.fillRect(D + 1, kTop + 10 + drop * (t + T.DEPTH_Y + 12), 4, 11); ctx.fillStyle = '#ffffff'; ctx.fillRect(D + 1, kTop + 20 + drop * (t + T.DEPTH_Y + 12), 4, 1);
    // heat shimmer above the barrel
    ctx.strokeStyle = 'rgba(255,190,140,0.12)'; ctx.lineWidth = 1.5;
    for (let j = 0; j < 3; j++) { ctx.beginPath(); for (let k = 0; k <= 10; k++) { const yy = bodyTop - 4 - k * 3, xx = 2 + j * 22 + Math.sin(now * 7 + k * 0.9 + j * 2) * 2.2; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); }
    // stencilled product name plate
    if (S.lineName) {
      ctx.font = '800 10px ui-monospace,Menlo,monospace'; const txt = S.lineName.toUpperCase(), tw = Math.min(ctx.measureText(txt).width, W * 0.55);
      const px = 4, py = hopTop - 20; ctx.fillStyle = '#20242f'; ctx.fillRect(px, py, tw + 12, 15); ctx.fillStyle = S.lineFlash > 0 ? '#ffd75e' : '#f5c54299'; ctx.fillRect(px, py + 14, tw + 12, 1);
      ctx.fillStyle = S.lineFlash > 0 ? '#ffd75e' : '#c9a647'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, px + 6, py + 8, tw); ctx.textBaseline = 'alphabetic';
    }
    S.lineRect = { top: hopTop - 20, bottom: bodyBot, h: floorY - hopTop, E };
  }
  function drawHosts(dt) {
    const G = geo(), hw = G.hw, hh = G.hh;
    CFG.HOSTS.forEach((h, i) => {
      const st = S ? S.hostState[i] : { anim: 'idle' };
      const fr = st.anim === 'cheer' ? SPR.FRAMES.cheer[Math.floor(performance.now() / 180) % 2] : SPR.FRAMES.idle[Math.floor((performance.now() / 600 + i * 0.5)) % 2];
      // hosts stand so their vertical midpoint lines up with the pallet's top deck in the opening view
      const x = i === 0 ? 8 : W - 8 - hw, y = Math.round(groundY() - (S ? S.stack[0].t : G.palletT) - hh / 2);
      if (S) (S.hostRects || (S.hostRects = []))[i] = { x, y, w: hw, h: hh };
      ctx.fillStyle = '#00000066'; ctx.beginPath(); ctx.ellipse(x + hw / 2, y + hh + 1, hw * 0.45, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2f3e'; ctx.fillRect(x - 4, y + hh + 2, hw + 8, 2);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(SPR.frameCanvas(h, fr), Math.round(x), Math.round(y), hw, hh); ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = '#9aa3b7'; ctx.font = '600 11px -apple-system,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(h.short, x + hw / 2, y + hh + 13);
      if (st.bubble) bubble(st.bubble.text, x + hw / 2, y - 4, i === 0 ? 'left' : 'right', Math.min(1, st.bubble.t * 4));
    });
  }
  function bubble(text, cx, by, side, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.font = '700 13px -apple-system,system-ui,sans-serif';
    const tw = Math.min(ctx.measureText(text).width, W * 0.42), bw = tw + 16, bh = 26;
    // keep each bubble on its own side, clear of the stack and of the other host's bubble, and on screen
    const tp = S && top(), stL = tp ? tp.x - 4 : W / 2, stR = tp ? tp.x + tp.w + T.DEPTH_X + 4 : W / 2;
    let bx = side === 'left' ? Math.max(4, Math.min(cx - 18, stL - bw)) : Math.min(W - 4 - bw, Math.max(cx + 18 - bw, stR));
    bx = Math.max(4, Math.min(W - 4 - bw, bx)); let y = Math.max(4, by - bh - 8);
    if (tp && bx < stR && bx + bw > stL) { const stTop = sy(tp.y + tp.t) - T.DEPTH_Y; y = Math.min(y, stTop - bh - 10); } // narrow screens: lift it clear of the stack
    if (S) S.stackTopY = tp ? sy(tp.y + tp.t) - T.DEPTH_Y : H;
    if (S) (S.bubbleRects || (S.bubbleRects = {}))[side] = { x: bx, y, w: bw, h: bh, text };
    ctx.fillStyle = '#ffffff'; roundRect(bx, y, bw, bh, 10); ctx.fill();
    const tx = Math.max(bx + 10, Math.min(bx + bw - 10, cx)); ctx.beginPath(); ctx.moveTo(tx - 6, y + bh - 1); ctx.lineTo(tx + 6, y + bh - 1); ctx.lineTo(Math.max(bx + 6, Math.min(bx + bw - 6, cx)), y + bh + 7); ctx.fill();
    ctx.fillStyle = '#141824'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, bx + 9, y + bh / 2 + 1, tw); ctx.textBaseline = 'alphabetic'; ctx.restore();
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // backdrop: gets a little cooler as you climb
    const hgt = S ? Math.min(1, S.cam / 3000) : 0;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, shade('#141a2c', -hgt * 0.5)); g.addColorStop(1, '#0d0f16'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!S) return;
    ctx.save();
    if (S.shake) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    drawLine(false);
    ctx.fillStyle = '#ffffff08'; ctx.font = '600 11px system-ui,sans-serif'; ctx.textAlign = 'left';
    for (const b of S.stack) {
      if (b.base) { drawPallet(b); continue; }
      const yb = sy(b.y); if (yb < -60 || yb - b.t > H + 40) continue;
      const land = b.landT != null && b.landT < 1 ? (1 - b.landT) * 3 : 0;
      drawBoard(b.x, yb + land * 0, b.w, b.t, b.look, b.p);
      if (b.adhered) drawTabs(b, yb);
    }
    for (const f of S.falling) {
      const yb = sy(f.y); ctx.save(); ctx.translate(f.x + f.w / 2, yb - f.t / 2); ctx.rotate(f.rot); ctx.globalAlpha = 0.95;
      drawBoard(-f.w / 2, f.t / 2, f.w, f.t, f.look, f.p, { noPrint: f.w < 60 }); ctx.restore();
    }
    if (S.moving) {
      const m = S.moving;
      if (m.extrude) { ctx.save(); ctx.beginPath(); ctx.rect(T.DIE_X, -10, W, H + 20); ctx.clip(); drawBoard(m.x, sy(m.y), m.w, m.t, m.look, m.p, { bonus: m.bonus }); ctx.restore(); }
      else drawBoard(m.x, sy(m.y), m.w, m.t, m.look, m.p, { bonus: m.bonus });
    }
    drawLine(true);
    for (const fl of S.flashes) {
      const b = fl.b, yb = sy(b.y), a = Math.max(0, fl.t / 0.35);
      if (fl.kind === 'cut') { ctx.fillStyle = '#fff3b0'; ctx.globalAlpha = Math.max(0, fl.t / 0.12); const ly = sy(top().y + top().t); ctx.beginPath(); ctx.arc(T.DIE_X + 2, ly - (S.moving ? S.moving.t : 9) / 2, 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; continue; }
      if (fl.kind === 'slice') { ctx.fillStyle = fl.col; ctx.globalAlpha = a; ctx.fillRect(fl.x - 1.5, yb - b.t - T.DEPTH_Y - 6, 3, b.t + T.DEPTH_Y + 12); ctx.globalAlpha = 1; }
      if (fl.kind === 'ring' || fl.kind === 'grow') { ctx.strokeStyle = fl.kind === 'ring' ? '#f5c542' : '#7cf0a5'; ctx.globalAlpha = a; ctx.lineWidth = 2; const e = (1 - a) * 14; ctx.strokeRect(b.x - e, yb - b.t - T.DEPTH_Y - e, b.w + T.DEPTH_X + e * 2, b.t + T.DEPTH_Y + e * 2); ctx.globalAlpha = 1; }
    }
    for (const p of S.parts) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.col; ctx.fillRect(p.x - 2, sy(p.y) - 2, 4, 4); }
    ctx.globalAlpha = 1;
    if (S.rainDrops.length) { ctx.strokeStyle = '#8fb8ff66'; ctx.lineWidth = 1.2; ctx.beginPath(); for (const d of S.rainDrops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 4, d.y - 14); } ctx.stroke(); }
    if (S.combo >= 2 && S.mode === 'play') { ctx.fillStyle = '#f5c542'; ctx.font = '800 15px -apple-system,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Perfect ×' + S.combo, W / 2, (S.moving ? sy(S.moving.y) - S.moving.t - T.DEPTH_Y - 18 : H * 0.35)); }
    ctx.restore();
    drawHosts();
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    if (!S || S.mode === 'play' || S.mode === 'dying') update(dt);
    else if (S.mode === 'over') update(dt * 0.5);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- product spotlight + company fact (shuffle-bags, read-time based rotation) ----------
  const FACTS = window.FBS_FACTS || [];
  const words = t => (t.match(/\S+/g) || []).length;
  const durationFor = p => Math.max(7000, 2000 + 250 * words(p.name + ' ' + p.blurb));
  function bag(key, n) {
    const st = store.get(key, null);
    const b = st && Array.isArray(st.bag) && st.bag.length === n ? st : { bag: [], pos: n, last: -1 };
    return {
      st: b,
      cur() { return this.st.pos < n ? this.st.bag[this.st.pos] : this.st.last >= 0 ? this.st.last : 0; },
      next() {
        const s = this.st; s.pos++;
        if (s.pos >= n) { // reshuffle; never repeat across the boundary
          const prev = s.bag.length ? s.bag[n - 1] : s.last;
          const a = [...Array(n).keys()];
          for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
          if (n > 1 && a[0] === prev) { const j = 1 + Math.floor(Math.random() * (n - 1)); [a[0], a[j]] = [a[j], a[0]]; }
          s.bag = a; s.pos = 0;
        }
        s.last = s.bag[s.pos]; store.set(key, s); return s.last;
      },
    };
  }
  const pBag = bag('fbs.spotbag', PRODUCTS.length), fBag = bag('fbs.factbag', FACTS.length);
  if (pBag.st.pos >= PRODUCTS.length) pBag.next();
  if (FACTS.length && fBag.st.pos >= FACTS.length) fBag.next();
  const spot = { timer: 0, shownAt: performance.now(), history: [] };
  const curP = () => PRODUCTS[pBag.cur()], curF = () => FACTS[fBag.cur()];
  function spotFill(el, p, f, mode) {
    if (!el) return; el.innerHTML = '';
    const txt = document.createElement('div'); txt.className = 'txt';
    if (mode !== 'fact') {
      if (mode === 'card') { const k = document.createElement('span'); k.className = 'k'; k.textContent = 'Product spotlight'; txt.append(k); }
      const n = document.createElement('span'); n.className = 'n'; n.textContent = p.name;
      const b = document.createElement('span'); b.className = 'b'; b.textContent = ' – ' + p.blurb;
      txt.append(n, b);
    }
    if (f && mode === 'fact') {
      const fa = document.createElement('div'); fa.className = 'fa'; fa.textContent = f.text; fa.dataset.src = f.source; txt.append(fa);
      el.dataset.fact = f.id;
    }
    el.append(txt); el.dataset.id = p.id;
  }
  function spotRender() { // product trivia on top, company history below
    const p = curP(), f = curF();
    spotFill($('spotStart'), p, null, 'card'); spotFill($('spotOver'), p, null, 'card'); spotFill($('spotTicker'), p, null, 'ticker');
    for (const id of ['factStart', 'factOver', 'factBar']) spotFill($(id), p, f, 'fact');
  }
  const SPOT_IDS = ['spotStart', 'spotOver', 'spotTicker', 'factStart', 'factOver', 'factBar'];
  function spotAdvance() { // synchronous: product + fact change together
    const pi = pBag.next(); if (FACTS.length) fBag.next();
    spotRender(); spot.shownAt = performance.now(); spot.history.push({ id: PRODUCTS[pi].id, fact: curF() && curF().id, at: spot.shownAt });
    return PRODUCTS[pi].id;
  }
  function spotSchedule() {
    clearTimeout(spot.timer); if (qs.has('nospot')) return;
    spot.timer = setTimeout(() => {
      for (const id of SPOT_IDS) $(id).classList.add('fade');
      setTimeout(() => { spotAdvance(); for (const id of SPOT_IDS) $(id).classList.remove('fade'); spotSchedule(); }, 350);
    }, durationFor(curP()));
  }
  function sizeBottom() { // reserve the tallest ticker/fact so the layout never jumps between rotations
    const t = $('spotTicker'), fb = $('factBar'), bb = $('bottomBar'), hud = $('hud'); if (!t) return;
    const wasHidden = bb.hidden, hudHidden = hud.hidden; bb.hidden = false; hud.hidden = false; bb.style.visibility = hud.style.visibility = 'hidden';
    t.style.height = fb.style.height = 'auto'; let th = 0, fh = 0;
    for (const p of PRODUCTS) { spotFill(t, p, null, 'ticker'); th = Math.max(th, t.offsetHeight); }
    for (const f of FACTS) { spotFill(fb, PRODUCTS[0], f, 'fact'); fh = Math.max(fh, fb.offsetHeight); }
    t.style.height = th + 'px'; fb.style.height = fh + 'px'; bb.style.visibility = hud.style.visibility = ''; bb.hidden = wasHidden; hud.hidden = hudHidden; spotRender();
  }
  let deckTimer = 0;


  // ---------- screens ----------
  const screens = ['start', 'pause', 'over', 'coll', 'legal'];
  function show(id) { for (const s of screens) $(s).hidden = s !== id; $('hud').hidden = !(S && (S.mode === 'play' || S.mode === 'dying' || S.mode === 'pause') && (id == null || id === 'pause')); $('bottomBar').hidden = $('hud').hidden; if ($('hud').hidden) $('deckBlurb').hidden = true; layoutBottom(); }
  let collReturn = 'start';
  function start() { ac(); newGame(); $('score').textContent = '0'; $('best').textContent = 'Best ' + best(); show(null); $('rescue').hidden = true; updateAdhere(); host(0, 'cheer', 'Let\u2019s stack!'); }
  function pause() { if (!S || S.mode !== 'play') return; S.mode = 'pause'; show('pause'); }
  function resume() { if (!S || S.mode !== 'pause') return; S.mode = 'play'; last = performance.now(); show(null); }
  function gameOver() { $('rescue').hidden = true;
    S.mode = 'over'; const b = best(), nb = S.score > b; if (nb) store.set(LS.best, S.score);
    $('finalScore').textContent = S.score;
    $('finalMeta').textContent = `Height ${S.height} boards · ${S.perfects} perfect${S.perfects === 1 ? '' : 's'} · best ${Math.max(b, S.score)}`;
    $('newBest').hidden = !nb;
    $('unlockNote').textContent = S.unlockedNow.length ? `New cards: ${S.unlockedNow.map(id => productById[id].name).join(', ')}` : `Collection: ${BOARDS.filter(p => collection.has(p.id)).length}/${BOARDS.length} boards`;
    host(0, 'cheer', 'Great stack!'); host(1, 'cheer', 'Go again?');
    drawHostsInto($('overHosts'), 'cheer'); show('over'); $('best').textContent = 'Best ' + Math.max(b, S.score);
  }
  let legalReturn = 'start';
  function openLegal(from) { legalReturn = from; show('legal'); $('legal').scrollTop = 0; }
  function closeLegal() { show(legalReturn); }
  function openColl(from) { collReturn = from; renderCards(); show('coll'); }
  function closeColl() { if (collReturn === 'pause') show('pause'); else if (collReturn === 'over') show('over'); else { show('start'); } }

  function boardThumb(p, locked) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 96;
    const x2 = c.getContext('2d'); x2.scale(2, 2); const keep = ctx; ctx = x2;
    try {
      const look = { face: p.look.variants[0][0], core: p.look.variants[0][1], backing: p.look.backingVariants ? p.look.backingVariants[0] : p.look.backing || null };
      const tt = Math.min(p.look.t, 14);
      if (!locked && p.kind === 'accessory') { x2.fillStyle = '#eef0f3'; x2.fillRect(14, 12, 32, 28); x2.fillStyle = '#c9ced8'; x2.fillRect(14, 12, 32, 7); x2.fillStyle = '#9aa3b7'; for (const cx of [21, 30, 39]) x2.fillRect(cx - 2, 27, 4, 4); }
      else if (locked) { x2.fillStyle = '#2a2f3e'; x2.fillRect(8, 16, 44, 22); x2.fillStyle = '#9aa3b7'; x2.font = '800 16px system-ui'; x2.textAlign = 'center'; x2.fillText('?', 30, 33); }
      else { drawBoard(4, 44, 46, tt, look, p); drawBoard(8, 44 - tt, 40, tt, look, p); }
    } finally { ctx = keep; }
    return c;
  }
  function renderCards() {
    const box = $('cards'); box.innerHTML = '';
    const nB = BOARDS.filter(p => collection.has(p.id)).length;
    $('collCount').textContent = `${nB}/${BOARDS.length}`;
    const head = t => { const h = document.createElement('h3'); h.className = 'coll-h'; h.textContent = t; box.append(h); };
    for (const p of [...BOARDS, ...ACCESSORIES]) {
      if (p === BOARDS[0]) head(`Boards · ${nB}/${BOARDS.length}`);
      if (p === ACCESSORIES[0]) head('Accessory');
      const acc = p.kind === 'accessory';
      const locked = !collection.has(p.id) && !qs.has('unlockall');
      const card = document.createElement('article'); card.className = 'card' + (locked ? ' locked' : '') + (acc ? ' accessory' : ''); card.dataset.kind = p.kind; card.dataset.id = p.id; card.dataset.trait = p.trait.id;
      const th = boardThumb(p, locked);
      const body = document.createElement('div');
      const h3 = document.createElement('h3'); h3.textContent = p.name;
      const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = p.tagline;
      const desc = document.createElement('div'); desc.className = 'desc'; desc.textContent = p.description;
      const tr = document.createElement('div'); tr.className = 'trait';
      if (locked) tr.textContent = acc ? '🔒 Get 3 Perfects in a row to earn one and unlock it.' : '🔒 Stack this board to unlock its trait.';
      else { const b = document.createElement('b'); b.textContent = p.trait.name + ': '; tr.append(b, document.createTextNode(p.trait.text)); }
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = locked ? `${p.family}` : acc ? `${p.family} · accessory (power-up), not a board · ${p.trait.basis}` : `${p.family} · gauges in game: ${p.gauges.map(g => g.label).join(', ')}` + (p.description.includes(p.trait.basis) ? '' : ` · based on: “${p.trait.basis}”`) + (p.moistureResistant ? ' · moisture resistant: ignores rain' : '');
      body.append(h3, tag, desc, tr, meta); card.append(th, body); box.append(card);
    }
    const n = (window.FBS_NOT_IN_GAME || []).map(x => x.name).join(', ');
    $('collFoot').textContent = `Product names and descriptions are from ${CFG.BRAND_NAME}'s website. In-game traits are just for fun.` + (n ? ` Not included (no product page on the site): ${n}.` : '');
    $('collCountStart').textContent = `${nB}/${BOARDS.length}`;
  }

  function drawHostsInto(el, mode) {
    el.innerHTML = '';
    CFG.HOSTS.forEach((h, i) => {
      const f = document.createElement('figure'); const c = document.createElement('canvas'); c.width = SPR.W; c.height = SPR.H;
      const x = c.getContext('2d'); const fr = mode === 'cheer' ? 2 + i % 2 : (i === 0 ? 0 : 2);
      x.drawImage(SPR.frameCanvas(h, fr), 0, 0);
      const cap = document.createElement('figcaption'); cap.textContent = h.name; f.append(c, cap); el.append(f);
    });
  }

  // ---------- input ----------
  cv.addEventListener('pointerdown', e => { e.preventDefault(); if (S && S.mode === 'play') drop(); }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (S && S.mode === 'play') drop(); else if ($('start').hidden === false) start(); else if (!$('over').hidden) start(); }
    if (e.code === 'KeyA') toggleAdhere();
    if (e.code === 'KeyP' || e.code === 'Escape') { if (S && S.mode === 'play') pause(); else if (S && S.mode === 'pause') resume(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  function setMute(v) { muted = v; store.set(LS.mute, v); $('btnMute').textContent = v ? '🔇' : '🔊'; $('btnMute').setAttribute('aria-label', v ? 'Unmute sound' : 'Mute sound'); }
  $('btnMute').onclick = () => setMute(!muted);
  $('btnAdhere').onclick = toggleAdhere; $('btnRescueYes').onclick = () => rescue(true); $('btnRescueNo').onclick = () => rescue(false); $('btnPause').onclick = pause; $('btnResume').onclick = resume; $('btnRestart').onclick = start; $('btnPlay').onclick = start; $('btnRetry').onclick = start;
  $('btnHome').onclick = $('btnHome2').onclick = () => { S = null; renderCards(); show('start'); };
  $('btnCollStart').onclick = () => openColl('start'); $('btnCollPause').onclick = () => openColl('pause'); $('btnCollOver').onclick = () => openColl('over'); $('btnCollClose').onclick = closeColl;
  $('btnLegalStart').onclick = () => openLegal('start'); $('btnLegalPause').onclick = () => openLegal('pause'); $('btnLegalClose').onclick = closeLegal;

  // ---------- boot ----------
  function boot() {
    resize(); window.addEventListener('resize', resize); if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    // unlock WebAudio on the first tap/click/key; block long-press menus and double-tap zoom on controls
    const unlock = () => { ac(); window.removeEventListener('pointerdown', unlock, true); window.removeEventListener('keydown', unlock, true); };
    window.addEventListener('pointerdown', unlock, true); window.addEventListener('keydown', unlock, true);
    document.addEventListener('contextmenu', e => { if (!e.target.closest('#coll .desc')) e.preventDefault(); });
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', e => { if (!e.target.closest('.screen.scroll')) e.preventDefault(); }, { passive: false });
    setMute(muted);
    for (const id of ['startLogo', 'overLogo']) { $(id).src = CFG.BRAND_LOGO; $(id).alt = CFG.BRAND_NAME + ' logo'; }
    { const names = PRODUCTS.map(p => p.name); $('legalProducts').textContent = names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1]; }
    $('footBrand').textContent = `· Featuring ${CFG.BRAND_NAME} foam boards`;
    drawHostsInto($('startHosts'), 'present'); renderCards(); sizeBottom(); spotRender(); spotSchedule(); window.addEventListener('resize', sizeBottom);
    if (qs.has('sprites')) {
      const sh = $('spriteSheet'); sh.hidden = false;
      CFG.HOSTS.forEach(h => ['idle A', 'idle B', 'cheer A', 'cheer B'].forEach((lbl, fr) => {
        const f = document.createElement('figure'), c = document.createElement('canvas'); c.width = SPR.W; c.height = SPR.H; c.getContext('2d').drawImage(SPR.frameCanvas(h, fr), 0, 0);
        const cap = document.createElement('figcaption'); cap.textContent = `${h.short} · ${lbl}`; f.append(c, cap); sh.append(f);
      }));
    }
    requestAnimationFrame(frame);
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  // test hooks
  window.__fbs = {
    computeDrop, T, geo, boards: BOARDS, toggleAdhere, earnAdhere: () => earnAdhere(), rescue, get S() { return S; }, start, drop, pause, resume, products: PRODUCTS,
    setMovingX(x) { if (S && S.moving) S.moving.x = x; }, setProduct(id, gl) { if (S && S.moving) { const p = productById[id]; S.moving.p = p; S.moving.look = lookFor(p); const g = (gl && p.gauges.find(x => x.label === gl)) || p.gauges[0]; S.moving.gauge = g; S.moving.t = thickFor(g); S.lineName = p.name + ' · ' + g.label; S.moving.speed = speedFor(p); } },
    spot: { next: spotAdvance, render: spotRender, durationFor, get id() { return curP().id; }, get fact() { return curF() && curF().id; }, get shownAt() { return spot.shownAt; }, history: spot.history, bags: () => ({ p: pBag.st, f: fBag.st }) }, facts: FACTS, layoutBottom,
    finishExtrusion() { return new Promise(r => { const c = () => (!S || !S.moving || !S.moving.extrude) ? r() : requestAnimationFrame(c); c(); }); },
    freeze() { if (S && S.moving) S.moving.speed = 0; }, collection: () => [...collection],
  };
  boot();
})();
