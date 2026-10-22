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
  const baseW = () => Math.round(Math.min(W * 0.6, 250));
  let bottomUI = 0; // px reserved at the bottom for the spotlight ticker
  function layoutBottom() { const t = $('bottomBar'); bottomUI = t && !t.hidden ? H - t.getBoundingClientRect().top : safeBot; }
  const groundY = () => H - bottomUI - 88; // screen y of world 0

  function lookFor(p) {
    const v = pick(p.look.variants);
    return { face: v[0], core: v[1], backing: p.look.backingVariants ? pick(p.look.backingVariants) : p.look.backing || null };
  }
  function newGame() {
    const bw = baseW();
    S = {
      mode: 'play', t: 0, score: 0, floors: 0, height: 0, combo: 0, perfects: 0, maxCombo: 0,
      stack: [{ x: (W - bw) / 2, w: bw, y: 0, t: 30, base: true }],
      falling: [], parts: [], flashes: [], cam: 0, camT: 0, shake: 0,
      heatNext: false, quickBond: 0, retryAvail: false, bonusNext: false,
      rain: 0, rainDrops: [], unlockedNow: [], hostState: [{ anim: 'idle', t: 0, bubble: null }, { anim: 'idle', t: 0, bubble: null }],
      moving: null, overT: 0, maxW: bw, seen: new Set(),
    };
    spawn();
  }
  function top() { return S.stack[S.stack.length - 1]; }
  function speedFor(p) {
    let s = Math.min(T.SPEED_MAX, 1 + S.floors * T.SPEED_STEP) * T.BASE_SPEED * Math.min(W, 520);
    const id = p.trait.id;
    if (id === 'featherweight') s *= 0.7;
    if (id === 'heavy-duty') s *= 1.2;
    if (S.quickBond > 0) s *= 0.75;
    if (S.rain > 0 && !p.moistureResistant) s *= 1.15;
    return s;
  }
  function spawn() {
    const p = pick(PRODUCTS), tp = top();
    let w = tp.w;
    const bonus = S.bonusNext; S.bonusNext = false;
    if (bonus) w = Math.min(S.maxW, w + 12);
    const fromLeft = S.stack.length % 2 === 0;
    const m = { p, look: lookFor(p), w, t: p.look.t, dir: fromLeft ? 1 : -1, bonus, retry: false };
    m.x = fromLeft ? -w * 0.35 : W - w * 0.65;
    m.y = tp.y + tp.t; m.speed = speedFor(p);
    S.moving = m;
    if (S.quickBond > 0) S.quickBond--;
    updateNowBoard();
    if (!S.seen.has(p.id)) { S.seen.add(p.id); deckShow(p); }
  }
  function updateNowBoard() {
    const m = S && S.moving; const el = $('nowBoard');
    if (!m) { el.textContent = ''; return; }
    el.innerHTML = '';
    const b = document.createElement('b'); b.textContent = m.p.name; el.append(b, document.createTextNode(' · ' + m.p.trait.name + (m.bonus ? ' · Bonus!' : '') + (S.rain > 0 ? ' · ☔ Rain' : '')));
  }

  function drop() {
    if (!S || S.mode !== 'play' || !S.moving) return;
    const m = S.moving, tp = top(), id = m.p.trait.id;
    let perfectPx = T.PERFECT_PX;
    if (id === 'slide-align') perfectPx = 16;
    if (S.heatNext) perfectPx *= 2;
    if (S.rain > 0 && !m.p.moistureResistant) perfectPx = 1;
    S.heatNext = false;
    const r = computeDrop(tp, m, { perfectPx, stickPx: id === 'self-adhesive' ? 14 : 0, springBack: id === 'spring-back' ? 0.25 : 0, wrapPx: id === 'v-cut-wrap' ? 10 : 0 });
    if (r.miss) {
      if (id === 'impact' && !m.retry) { // bounce back once
        m.retry = true; m.dir *= -1; m.x = m.dir > 0 ? -m.w * 0.35 : W - m.w * 0.65; host(0, 'cheer', 'One more try!'); sfx.grow(); buzz(15); return;
      }
      S.falling.push(mkPiece(m.x, m.w, m)); S.moving = null; sfx.over(); buzz([30, 40, 60]); S.shake = 8;
      S.mode = 'dying'; S.overT = 0.85; return;
    }
    // land
    const board = { x: r.x, w: r.w, y: tp.y + tp.t, t: m.t, p: m.p, look: m.look, landT: 0 };
    S.stack.push(board);
    let pts = id === 'heavy-duty' ? 2 : 1, floorsAdd = pts;
    if (r.perfect) {
      S.combo += id === 'archival' ? 2 : 1; S.perfects++;
      pts += 1;
      if (S.combo >= T.GROW_AFTER) grow(board, T.GROW_PX);
      if (id === 'permanent') grow(board, 8);
      if (id === 'heat-bond') S.heatNext = true;
      burst(board, 22); sfx.perfect(S.combo); buzz(12);
      host(S.combo % 2, 'cheer', pick(['Perfect!', 'Nice one!', 'Spot on!', 'Beautiful!', 'Clean!', 'Wow!']) + (S.combo > 1 ? ' ×' + S.combo : ''));
    } else {
      if (r.stuck) { sfx.drop(); flash(board.x + (r.x > tp.x ? board.w : 0), board, '#7cf0a5'); }
      else { sliced(r, m, board); }
      if (r.wrapped) { S.combo++; host(1, 'cheer', 'Wrapped!'); }
      else if (id !== 'clean-cut') S.combo = 0;
      buzz(8);
    }
    S.maxCombo = Math.max(S.maxCombo, S.combo);
    if (id === 'hang-tight') grow(board, 10);
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
    const hudB = safeTop + 150, g = groundY(), target = hudB + Math.max(60, g - hudB) * 0.45;
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
  function host(i, anim, text) {
    if (!S) return; const h = S.hostState[i]; h.anim = anim; h.t = anim === 'cheer' ? 1.0 : 0; if (text) { h.bubble = { text, t: 1.5 }; S.hostState[1 - i].bubble = null; }
  }

  // ---------- toast ----------
  function toast(msg) { // shown in the HUD pill so nothing stacks over the play area
    const el = $('deckBlurb'); el.textContent = '🃏 ' + msg; el.hidden = false; el.style.opacity = 1; clearTimeout(deckTimer);
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
      const m = S.moving; if (m.speed > 0) { m.x += m.dir * m.speed * dt;
      const minX = -m.w * 0.35, maxX = W - m.w * 0.65;
      if (m.x > maxX) { m.x = maxX - (m.x - maxX); m.dir = -1; } else if (m.x < minX) { m.x = minX + (minX - m.x); m.dir = 1; } }
    }
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
  function drawBase(b) {
    const yb = sy(b.y), yt = sy(b.y + b.t);
    const g = ctx.createLinearGradient(0, yt, 0, yb + 200); g.addColorStop(0, '#2a3044'); g.addColorStop(1, '#141824');
    ctx.fillStyle = g; ctx.fillRect(b.x - 6, yt, b.w + 12 + T.DEPTH_X, yb - yt + 400);
    ctx.fillStyle = '#353c55'; ctx.beginPath(); ctx.moveTo(b.x - 6, yt); ctx.lineTo(b.x + b.w + 6, yt); ctx.lineTo(b.x + b.w + 6 + T.DEPTH_X, yt - T.DEPTH_Y); ctx.lineTo(b.x - 6 + T.DEPTH_X, yt - T.DEPTH_Y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff10'; ctx.fillRect(b.x - 6, yt, b.w + 12, 2);
  }
  function drawHosts(dt) {
    const sc = W < 360 ? 1.3 : 1.5, hw = SPR.W * sc, hh = SPR.H * sc, yb = H - Math.max(bottomUI, safeBot) - 6;
    CFG.HOSTS.forEach((h, i) => {
      const st = S ? S.hostState[i] : { anim: 'idle' };
      const fr = st.anim === 'cheer' ? SPR.FRAMES.cheer[Math.floor(performance.now() / 180) % 2] : SPR.FRAMES.idle[Math.floor((performance.now() / 600 + i * 0.5)) % 2];
      const x = i === 0 ? 8 : W - 8 - hw, y = yb - hh - 14;
      ctx.imageSmoothingEnabled = false; ctx.drawImage(SPR.frameCanvas(h, fr), Math.round(x), Math.round(y), hw, hh); ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = '#9aa3b7'; ctx.font = '600 11px -apple-system,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(h.short, x + hw / 2, yb);
      if (st.bubble) bubble(st.bubble.text, x + hw / 2, y - 4, i === 0 ? 'left' : 'right', Math.min(1, st.bubble.t * 4));
    });
  }
  function bubble(text, cx, by, side, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.font = '700 13px -apple-system,system-ui,sans-serif';
    const tw = Math.min(ctx.measureText(text).width, W * 0.6), bw = tw + 18, bh = 26;
    let bx = side === 'left' ? Math.max(6, cx - 18) : Math.min(W - 6 - bw, cx + 18 - bw); const y = by - bh - 8;
    ctx.fillStyle = '#ffffff'; roundRect(bx, y, bw, bh, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 6, y + bh - 1); ctx.lineTo(cx + 6, y + bh - 1); ctx.lineTo(cx, y + bh + 7); ctx.fill();
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
    // faint height lines every 10 floors
    ctx.fillStyle = '#ffffff08'; ctx.font = '600 11px system-ui,sans-serif'; ctx.textAlign = 'left';
    for (const b of S.stack) {
      if (b.base) { drawBase(b); continue; }
      const yb = sy(b.y); if (yb < -60 || yb - b.t > H + 40) continue;
      const land = b.landT != null && b.landT < 1 ? (1 - b.landT) * 3 : 0;
      drawBoard(b.x, yb + land * 0, b.w, b.t, b.look, b.p);
    }
    for (const f of S.falling) {
      const yb = sy(f.y); ctx.save(); ctx.translate(f.x + f.w / 2, yb - f.t / 2); ctx.rotate(f.rot); ctx.globalAlpha = 0.95;
      drawBoard(-f.w / 2, f.t / 2, f.w, f.t, f.look, f.p, { noPrint: f.w < 60 }); ctx.restore();
    }
    if (S.moving) { const m = S.moving; drawBoard(m.x, sy(m.y), m.w, m.t, m.look, m.p, { bonus: m.bonus }); }
    for (const fl of S.flashes) {
      const b = fl.b, yb = sy(b.y), a = Math.max(0, fl.t / 0.35);
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
    if (f && (mode === 'card' || mode === 'fact')) {
      const fa = document.createElement('div'); fa.className = 'fa'; fa.textContent = f.text; fa.dataset.src = f.source; txt.append(fa);
      el.dataset.fact = f.id;
    }
    el.append(txt); el.dataset.id = p.id;
  }
  function spotRender() {
    const p = curP(), f = curF();
    spotFill($('spotStart'), p, f, 'card'); spotFill($('spotOver'), p, f, 'card');
    spotFill($('spotTicker'), p, null, 'ticker'); spotFill($('factBar'), p, f, 'fact');
  }
  const SPOT_IDS = ['spotStart', 'spotOver', 'spotTicker', 'factBar'];
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
    const t = $('spotTicker'), fb = $('factBar'), bb = $('bottomBar'); if (!t) return;
    const wasHidden = bb.hidden; bb.hidden = false; bb.style.visibility = 'hidden';
    t.style.height = fb.style.height = 'auto'; let th = 0, fh = 0;
    for (const p of PRODUCTS) { spotFill(t, p, null, 'ticker'); th = Math.max(th, t.offsetHeight); }
    for (const f of FACTS) { spotFill(fb, PRODUCTS[0], f, 'fact'); fh = Math.max(fh, fb.offsetHeight); }
    t.style.height = th + 'px'; fb.style.height = fh + 'px'; bb.style.visibility = ''; bb.hidden = wasHidden; spotRender();
  }
  let deckTimer = 0;
  function deckShow(p) { // name only; the ticker carries the blurb, rotation timing is untouched
    const el = $('deckBlurb'); el.textContent = 'Off the line: ' + p.name;
    el.hidden = false; el.style.opacity = 1; el.dataset.id = p.id; clearTimeout(deckTimer);
    deckTimer = setTimeout(() => { el.style.opacity = 0; deckTimer = setTimeout(() => (el.hidden = true), 300); }, 1800);
  }

  // ---------- screens ----------
  const screens = ['start', 'pause', 'over', 'coll', 'legal'];
  function show(id) { for (const s of screens) $(s).hidden = s !== id; $('hud').hidden = !(S && (S.mode === 'play' || S.mode === 'dying' || S.mode === 'pause') && (id == null || id === 'pause')); $('bottomBar').hidden = $('hud').hidden; if ($('hud').hidden) $('deckBlurb').hidden = true; layoutBottom(); }
  let collReturn = 'start';
  function start() { ac(); newGame(); $('score').textContent = '0'; $('best').textContent = 'Best ' + best(); show(null); host(0, 'cheer', 'Let\u2019s stack!'); }
  function pause() { if (!S || S.mode !== 'play') return; S.mode = 'pause'; show('pause'); }
  function resume() { if (!S || S.mode !== 'pause') return; S.mode = 'play'; last = performance.now(); show(null); }
  function gameOver() {
    S.mode = 'over'; const b = best(), nb = S.score > b; if (nb) store.set(LS.best, S.score);
    $('finalScore').textContent = S.score;
    $('finalMeta').textContent = `Height ${S.height} boards · ${S.perfects} perfect${S.perfects === 1 ? '' : 's'} · best ${Math.max(b, S.score)}`;
    $('newBest').hidden = !nb;
    $('unlockNote').textContent = S.unlockedNow.length ? `New cards: ${S.unlockedNow.map(id => productById[id].name).join(', ')}` : `Collection: ${collection.size}/${PRODUCTS.length} boards`;
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
      if (locked) { x2.fillStyle = '#2a2f3e'; x2.fillRect(8, 16, 44, 22); x2.fillStyle = '#9aa3b7'; x2.font = '800 16px system-ui'; x2.textAlign = 'center'; x2.fillText('?', 30, 33); }
      else { drawBoard(4, 44, 46, tt, look, p); drawBoard(8, 44 - tt, 40, tt, look, p); }
    } finally { ctx = keep; }
    return c;
  }
  function renderCards() {
    const box = $('cards'); box.innerHTML = '';
    $('collCount').textContent = `${collection.size}/${PRODUCTS.length}`;
    for (const p of PRODUCTS) {
      const locked = !collection.has(p.id) && !qs.has('unlockall');
      const card = document.createElement('article'); card.className = 'card' + (locked ? ' locked' : ''); card.dataset.id = p.id; card.dataset.trait = p.trait.id;
      const th = boardThumb(p, locked);
      const body = document.createElement('div');
      const h3 = document.createElement('h3'); h3.textContent = p.name;
      const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = p.tagline;
      const desc = document.createElement('div'); desc.className = 'desc'; desc.textContent = p.description;
      const tr = document.createElement('div'); tr.className = 'trait';
      if (locked) tr.textContent = '🔒 Stack this board to unlock its trait.';
      else { const b = document.createElement('b'); b.textContent = p.trait.name + ': '; tr.append(b, document.createTextNode(p.trait.text)); }
      const meta = document.createElement('div'); meta.className = 'meta';
      meta.textContent = locked ? `${p.family}` : `${p.family} · shown at ${p.gauge} · based on: “${p.trait.basis}”${p.moistureResistant ? ' · moisture resistant: ignores rain' : ''}`;
      body.append(h3, tag, desc, tr, meta); card.append(th, body); box.append(card);
    }
    const n = (window.FBS_NOT_IN_GAME || []).map(x => x.name).join(', ');
    $('collFoot').textContent = `Product names and descriptions are from ${CFG.BRAND_NAME}'s website. In-game traits are just for fun.` + (n ? ` Not included (no product page on the site): ${n}.` : '');
    $('collCountStart').textContent = `${collection.size}/${PRODUCTS.length}`;
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
    if (e.code === 'KeyP' || e.code === 'Escape') { if (S && S.mode === 'play') pause(); else if (S && S.mode === 'pause') resume(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  function setMute(v) { muted = v; store.set(LS.mute, v); $('btnMute').textContent = v ? '🔇' : '🔊'; $('btnMute').setAttribute('aria-label', v ? 'Unmute sound' : 'Mute sound'); }
  $('btnMute').onclick = () => setMute(!muted);
  $('btnPause').onclick = pause; $('btnResume').onclick = resume; $('btnRestart').onclick = start; $('btnPlay').onclick = start; $('btnRetry').onclick = start;
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
    computeDrop, T, get S() { return S; }, start, drop, pause, resume, products: PRODUCTS,
    setMovingX(x) { if (S && S.moving) S.moving.x = x; }, setProduct(id) { if (S && S.moving) { const p = productById[id]; S.moving.p = p; S.moving.look = lookFor(p); S.moving.t = p.look.t; S.moving.speed = speedFor(p); } },
    spot: { next: spotAdvance, render: spotRender, durationFor, get id() { return curP().id; }, get fact() { return curF() && curF().id; }, get shownAt() { return spot.shownAt; }, history: spot.history, bags: () => ({ p: pBag.st, f: fBag.st }) }, facts: FACTS, layoutBottom,
    freeze() { if (S && S.moving) S.moving.speed = 0; }, collection: () => [...collection],
  };
  boot();
})();
