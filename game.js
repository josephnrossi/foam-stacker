/* Foam Board Stacker – canvas 2D, delta-time loop. */
(function () {
  'use strict';
  const CFG = window.FBS_CONFIG, PRODUCTS = window.FBS_PRODUCTS, SPR = window.FBS_SPRITES;
  const $ = id => document.getElementById(id);
  const cv = $('game'); let ctx = cv.getContext('2d');
  const LS = { rank: 'fbs.bestRank', best: 'fbs.best', mute: 'fbs.mute', music: 'fbs.music', coll: 'fbs.collection' };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };

  // ---------- tunables ----------
  const T = {
    PERFECT_PX: 4, GROW_AFTER: 3, GROW_PX: 5, DEPTH_X: 9, DEPTH_Y: 11,
    BASE_SPEED: 0.29, SPEED_STEP: 0.03, SPEED_MAX: 2.6, // fraction of view width/s: starts 30% slower, reaches the old start (0.42) at ~15 floors, caps at 0.75 (was 1.09)
    RAIN_EVERY: 15, RAIN_LEN: 5, MILESTONE: 20,
    // WIDWAW event: Bill VanHorn pops into Cyrus's spot; boards come out 40% faster and score 2x for ~11 s
    BILL_MIN: 25, BILL_MAX: 45, BILL_MIN_FLOORS: 10, BILL_DUR: 11, BILL_BOOST: 1.4, BILL_SCORE: 2, POOF: 0.35,
    PALLET_T: 16, DIE_X: 60, 
    EXTRUDE_PUSH: 0.5, EXTRUDE_CUT: 0.2, // extrusion: push-out + cut = 0.70 s (readable)
    // v8 weather: a random heat wave, cold snap or snow day every 18-34 s of play (from floor 5), lasting 7 boards
    WX_MIN: 18, WX_MAX: 34, WX_MIN_FLOORS: 5, WX_LEN: 7, HEAT_DRIFT: 0.35, COLD_SPEED: 1.12, SNOW_SPEED: 1.06, CHIP_BELOW: 0.88,
    // v8 "New BOM ready": Evan tweaks the extruder every 16-30 s (from floor 6); the next 5 boards come out at 50-85% or 115-150% of the width below
    BOM_MIN: 16, BOM_MAX: 30, BOM_MIN_FLOORS: 6, BOM_LEN: 5, BOM_LO: 0.5, BOM_HI: 1.5,
    // v9 skids + truckloads: a skid is full at 15 boards (it's forklifted off, a fresh pallet comes in); 12 skids = a truckload.
    // Each truckload adds +0.5x to the bonus multiplier. Team Drivers (after the 1st truckload) boosts it 50% for 8 boards.
    SKID_MAX: 15, SKIDS_PER_TRUCK: 12, TRUCK_STEP: 0.5, SKID_BONUS: 10, TRUCK_BONUS: 50, SKID_SWAP: 1.0,
    TD_MIN: 25, TD_MAX: 45, TD_LEN: 8, TD_BOOST: 1.5,
  };
  // v8 ranks: you're promoted when BOTH your score and your trim quality (average % of each board that stayed on the stack) clear the bar
  const RANKS = [
    { name: 'Temp', icon: '🪪', score: 0, trim: 0 },
    // v9: slower climb (skid + truckload bonuses and multipliers now feed the score); Board Member ≈ 3 truckloads of tidy stacking
    { name: 'Material Handler', icon: '📦', score: 25, trim: 55 },
    { name: 'Lead', icon: '🔧', score: 75, trim: 65 },
    { name: 'Shift Supervisor', icon: '📋', score: 175, trim: 72 },
    { name: 'Manager', icon: '💼', score: 350, trim: 80 },
    { name: 'Engineer', icon: '📐', score: 650, trim: 86 },
    { name: 'Board Member', icon: '🏛️', score: 1200, trim: 92 },
  ];
  function rankFor(score, trim) { let r = 0; RANKS.forEach((k, i) => { if (score >= k.score && trim >= k.trim) r = i; }); return r; }

  // ---------- RNG (seedable for tests) ----------
  const qs = new URLSearchParams(location.search);
  let seed = qs.has('seed') ? (+qs.get('seed') >>> 0) || 1 : (Math.random() * 2 ** 32) >>> 0;
  function rnd() { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  const pick = a => a[Math.floor(rnd() * a.length)];
  // random weather + BOM events are off in the deterministic test runs (?nobill / ?noevents) unless ?events is given
  const EVENTS = qs.has('events') || !(qs.has('nobill') || qs.has('noevents'));
  // skids: 15 boards in play; the deterministic test runs (?nobill/?noevents) keep one endless skid unless ?skidmax=N is given
  T.SKID_MAX = qs.has('skidmax') ? Math.max(2, +qs.get('skidmax') || 15) : EVENTS ? T.SKID_MAX : 1e6;

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

  // v8: drop math for a resized "New BOM" board (width differs from the board below). Perfect = centred within the window:
  // a narrower board lands whole, a wider one keeps its width (up to maxW). Otherwise every overhang is cut.
  function computeDropBom(prev, cur, o = {}) {
    const win = o.perfectPx == null ? T.PERFECT_PX : o.perfectPx;
    const left = Math.max(cur.x, prev.x), right = Math.min(cur.x + cur.w, prev.x + prev.w), ov = right - left;
    if (ov <= 0) return { hit: false, miss: true, x: cur.x, w: cur.w, cut: { x: cur.x, w: cur.w }, cuts: [], overhang: cur.w };
    const cdx = (cur.x + cur.w / 2) - (prev.x + prev.w / 2), cuts = [];
    if (Math.abs(cdx) <= win) {
      if (cur.w <= prev.w) return { hit: true, perfect: true, x: prev.x + (prev.w - cur.w) / 2, w: cur.w, cut: null, cuts, overhang: 0, snapped: Math.abs(cdx) };
      // a wider board dropped dead-centre is accounted for: it keeps its width (up to maxW, the excess is trimmed evenly)
      const keep = Math.min(cur.w, o.maxW || prev.w), x = prev.x + prev.w / 2 - keep / 2, side = (cur.w - keep) / 2;
      if (side > 0.5) cuts.push({ x: x - side, w: side }, { x: x + keep, w: side });
      return { hit: true, perfect: true, x, w: keep, cut: cuts[0] || null, cuts, overhang: cur.w - keep, snapped: Math.abs(cdx) };
    }
    if (o.stick) return { hit: true, perfect: false, stuck: true, x: cur.x, w: cur.w, cut: null, cuts, overhang: cur.w - ov };
    if (cur.x < prev.x) cuts.push({ x: cur.x, w: prev.x - cur.x });
    if (cur.x + cur.w > prev.x + prev.w) cuts.push({ x: prev.x + prev.w, w: cur.x + cur.w - prev.x - prev.w });
    return { hit: true, perfect: false, x: left, w: ov, cut: cuts[0] || null, cuts, overhang: cur.w - ov };
  }
  const overlapOf = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));

  // ---------- audio (synth engine in audio.js) ----------
  const AU = window.FBS_AUDIO; let muted = store.get(LS.mute, false), musicOn = store.get(LS.music, false);
  function ac() { return AU.unlock(); }
  const P = name => (...a) => AU.play(name, ...a);
  const sfx = {
    drop: P('drop'), slice: P('slice'), fall: P('fall'), perfect: P('perfect'), grow: P('grow'), over: P('over'), newBest: P('newBest'),
    extrude: P('extrude'), cut: P('cut'), bonus: P('bonus'), adhereEarn: P('adhereEarn'), adhereFasten: P('adhereFasten'),
    widwaw: P('widwaw'), billLeave: P('billLeave'), ui: P('ui'),
    horn: P('horn'), skid: P('skid'), truckload: P('truckload'),
    bom: P('bom'), rankUp: P('rankUp'), chip: P('chip'), heat: P('heat'), cold: P('cold'), snow: P('snow'),
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
  let booted = false;
  function resize() {
    W = window.innerWidth; H = window.innerHeight; DPR = Math.min(IS_ANDROID ? 2 : 3, window.devicePixelRatio || 1);
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); measureSafe();
    document.documentElement.classList.toggle('land', LANDSCAPE());
    if (booted) sizeBottom(); layoutBottom(); // bars re-measured for the new orientation BEFORE the ground line is derived from them
    if (S && S.stack) { const tp = S.stack[S.stack.length - 1]; S.camT = camTarget(tp.y + tp.t); } // re-aim the camera for the new layout (same world, same anchor)
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
  // ---------- one scene, one anchor ----------
  // The stack, pallet, floor, extrusion line and hosts all live in ONE scene: x in scene px (0..SW, centred on screen with
  // sceneX()), y in world units measured up from the warehouse floor and mapped to the screen by sy() with the single camera
  // offset S.cam. SW is fixed per game so a mid-game rotation re-centres the scene instead of pulling it apart.
  const LANDSCAPE = () => W > H && H < 560;
  const sceneW0 = () => Math.min(W, 440);
  const sceneW = () => (S && S.SW) || sceneW0();
  const sceneX = () => Math.round((W - sceneW()) / 2);
  function geo() {
    const SWv = sceneW(), base = LANDSCAPE() ? 1.0 : SWv < 380 ? 1.3 : 1.5, sc = Math.max(1, Math.round(base * 1.5 * DPR) / DPR), hw = SPR.W * sc, hh = SPR.H * sc;
    const palletT = Math.max(14, Math.round(hh / 7)); // a pallet is ~1/12 a person; ~1/7 here so the deck still reads
    // starting board ~2-2.5x a host's height, but never under 55% of the screen width (playability)
    const bw = Math.round(Math.min(250, Math.max(SWv * 0.55, Math.min(2.5 * hh, SWv - 2 * hw - 30))));
    const oldW = Math.round(Math.min(SWv * 0.6, 250)); // v2 width: speed and px tolerances scale by bw/oldW so difficulty is unchanged
    // board thickness: ONE px-per-inch for every product and gauge (= hh/6, i.e. thickness exaggerated 12x vs. a 6 ft host)
    const ppi = hh / 6;
    return { sc, hw, hh, palletT, bw, k: bw / oldW, ppi };
  }
  const baseW = () => geo().bw;
  const thickFor = g => g.inches * ((S && S.ppi) || geo().ppi); // exactly proportional to the real gauge
  const K = () => (S && S.k) || geo().k;
  let bottomUI = 0; // px reserved at the bottom for the spotlight ticker
  function layoutBottom() { const t = $('bottomBar'), k = $('spotTicker'), hud = $('hud'); let top = t && !t.hidden ? t.getBoundingClientRect().top : H - safeBot;
    if (LANDSCAPE() && k && hud && !hud.hidden) { const r = k.getBoundingClientRect(); if (r.height) top = Math.min(top, r.top); }
    bottomUI = H - top; }
  const palletTH = () => (S ? S.stack[0].t : geo().palletT);
  const groundY = () => { const g = geo(); return H - bottomUI - Math.max(24, Math.round(g.hh / 2 - palletTH() + 30)); }; // hosts stand in front of the pallet; their feet + names stay above the fact bar // screen y of world 0 (floor the pallet and hosts stand on)

  function lookFor(p) {
    const v = pick(p.look.variants);
    return { face: v[0], core: v[1], backing: p.look.backingVariants ? pick(p.look.backingVariants) : p.look.backing || null };
  }
  function newGame() {
    const G = geo(), bw = G.bw, SW = sceneW0();
    S = {
      SW, k: G.k, ppi: G.ppi, playT: 0, bill: null, billCount: 0, billNext: qs.has('nobill') ? Infinity : T.BILL_MIN + rnd() * (T.BILL_MAX - T.BILL_MIN), /* ?nobill: tests force the event via a hook */ poofs: [], adhere: 0, adhereArmed: false, perfStreak: 0, rescueUsed: false,
      mode: 'play', t: 0, score: 0, floors: 0, height: 0, combo: 0, perfects: 0, maxCombo: 0,
      stack: [{ x: (SW - bw) / 2, w: bw, y: 0, t: G.palletT, base: true }], extrudeLog: [], palletRect: null,
      falling: [], parts: [], flashes: [], cam: 0, camT: 0, shake: 0,
      heatNext: false, quickBond: 0, retryAvail: false, bonusNext: false,
      rain: 0, rainDrops: [], unlockedNow: [], hostState: [{ anim: 'idle', t: 0, bubble: null }, { anim: 'idle', t: 0, bubble: null }],
      moving: null, overT: 0, maxW: bw, seen: new Set(),
      // v8
      wx: null, wxA: 0, wxType: null, wxNext: EVENTS ? T.WX_MIN + rnd() * (T.WX_MAX - T.WX_MIN) : Infinity, wxCount: 0, flakes: [], shimmer: 0,
      bom: null, bomNext: EVENTS ? T.BOM_MIN + rnd() * (T.BOM_MAX - T.BOM_MIN) : Infinity, bomCount: 0,
      trimSum: 0, trimN: 0, rank: 0, promo: null, popups: [], flashA: 0, chips: 0,
      // v9
      skids: 0, trucks: 0, boardsTotal: 0, skidOut: null, skidWait: 0, td: null, tdNext: Infinity, tdCount: 0, truckFx: null,
    };
    spawn(); updateTruckHud();
  }
  function top() { return S.stack[S.stack.length - 1]; }
  function speedFor(p) {
    let s = Math.min(T.SPEED_MAX, 1 + S.floors * T.SPEED_STEP) * T.BASE_SPEED * Math.min(sceneW(), 520) * K();
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
    // v8: Evan's extruder tweak ("New BOM ready")
    if (S.bom && S.bom.left <= 0) endBom();
    if (!S.bom && !S.td && S.playT >= S.bomNext && S.floors >= T.BOM_MIN_FLOORS && !(S.bill && S.bill.on)) startBom();
    let bomF = 0;
    if (S.bom && !bonus) {
      bomF = rnd() < 0.5 ? T.BOM_LO + rnd() * 0.35 : T.BOM_HI - rnd() * 0.35; // never ~100%: the change is always visible
      if (S.bom.force) { bomF = S.bom.force; S.bom.force = 0; }
      const minW = Math.min(tp.w, Math.round(26 * K())), maxW = Math.round(Math.min(sceneW() - T.DIE_X - 12, S.maxW * 1.5));
      w = Math.max(minW, Math.min(maxW, Math.round(S.bom.spec * bomF))); bomF = w / tp.w; S.bom.left--; // ±50% of the spec width (no compounding)
    } else if (S.bomSpec && !bonus) { // "Back to spec": one board at the pre-BOM width; drop it dead-centre to win the width back
      w = Math.max(Math.round(26 * K()), Math.min(S.maxW, Math.round(S.bomSpec))); S.bomSpec = 0; if (Math.abs(w / tp.w - 1) > 0.04) bomF = w / tp.w;
    }
    const gauge = pick(p.gauges), m = { p, gauge, look: lookFor(p), w, t: thickFor(gauge), dir: 1, bonus, retry: false, bom: bomF || 0 };
    m.y = tp.y + tp.t; m.speed = speedFor(p);
    m.extrude = { t: 0, start: performance.now(), cut: false }; m.x = T.DIE_X - w; // still inside the die
    S.moving = m; S.lineName = p.name + ' · ' + gauge.label + (bomF ? ' · W ' + Math.round(bomF * 100) + '%' : ''); S.lineFlash = 0.6;
    if (S.quickBond > 0) S.quickBond--;
    updateNowBoard(); sfx.extrude((T.EXTRUDE_PUSH + T.EXTRUDE_CUT) / boost());
  }
  function updateNowBoard() {
    const m = S && S.moving; const el = $('nowBoard');
    if (!m) { el.textContent = ''; return; }
    el.innerHTML = '';
    const W8 = { heat: '☀️ Heat', cold: '🥶 Cold', snow: '❄️ Snow' };
    if (S.wx) { const c = document.createElement('span'); c.className = 'wxchip ' + S.wx.type; c.textContent = W8[S.wx.type] + ' ' + S.wx.left; el.append(c); } // weather indicator (boards left)
    if (m.bom) { const c = document.createElement('span'); c.className = 'wxchip bom'; c.textContent = '📋 ' + Math.round(m.bom * 100) + '%'; el.append(c); }
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
    const r = m.bom ? computeDropBom(tp, m, { perfectPx, stick: armed, maxW: S.maxW })
      : computeDrop(tp, m, { perfectPx, stickPx: armed ? 1e9 : id === 'self-adhesive' ? 14 * k : 0, springBack: id === 'spring-back' ? 0.25 : 0, wrapPx: id === 'v-cut-wrap' ? 10 * k : 0 });
    if (r.miss) {
      if (id === 'impact' && !m.retry) { // bounce back once
        m.retry = true; m.dir = 1; m.x = T.DIE_X; host(0, 'cheer', 'One more try!'); sfx.grow(); buzz(15); return;
      }
      if (S.adhere > 0 && !S.rescueUsed) { offerRescue(); return; }
      S.falling.push(mkPiece(m.x, m.w, m)); S.moving = null; sfx.fall(1.4); buzz([30, 40, 60]); S.shake = 8;
      S.mode = 'dying'; S.overT = 0.85; return;
    }
    // land
    const usedAdhere = armed && !r.perfect;
    const board = { adhered: usedAdhere ? { l: Math.max(r.x, tp.x), r: Math.min(r.x + r.w, tp.x + tp.w) } : null, x: r.x, w: r.w, y: tp.y + tp.t, t: m.t, gauge: m.gauge, p: m.p, look: m.look, landT: 0, extruded: m.extruded };
    // v8 trim quality: share of the board that could stay on (overlap vs. the narrower of the two) – 100% for a Perfect
    const q = r.perfect ? 1 : Math.min(1, overlapOf(m, tp) / Math.max(1, Math.min(m.w, tp.w))); S.trimSum += q; S.trimN++; board.q = q;
    S.stack.push(board); sfx.drop(m.gauge ? m.gauge.inches : 0.1875, S.stack.length === 2); // foam thunk (lower for thicker), wood knock on the pallet
    let pts = id === 'heavy-duty' ? 2 : 1, floorsAdd = pts;
    if (r.perfect) {
      S.combo += id === 'archival' ? 2 : 1; S.perfects++;
      pts += 1;
      if (S.combo >= T.GROW_AFTER) grow(board, T.GROW_PX * K());
      if (id === 'permanent') grow(board, 8 * K());
      if (id === 'heat-bond') S.heatNext = true;
      burst(board, 22); sfx.perfect(S.combo); buzz(12);
      if (r.cuts && r.cuts.length) for (const c of r.cuts) sliced({ cut: c }, m, board); // a wide BOM board centred: trimmed evenly on both sides
      if (S.combo >= 5) S.flashA = Math.min(0.22, 0.08 + S.combo * 0.015); // screen flash on a long Perfect streak
      host(0, 'cheer', 'Excellent', true); host(1, 'cheer', 'Good job', true); // every Perfect: both hosts cheer together
      S.perfStreak++; if (S.perfStreak % ADHERE_EVERY === 0) S.earnNow = true;
    } else {
      S.perfStreak = 0;
      if (usedAdhere) { S.adhereArmed = false; S.adhere--; updateAdhere(); sfx.adhereFasten(); }
      if (r.stuck) { flash(board.x + (r.x > tp.x ? board.w : 0), board, '#7cf0a5'); }
      else { if (r.cuts) { for (const c of r.cuts) sliced({ cut: c }, m, board); if (!r.cuts.length) sfx.slice(); } else sliced(r, m, board); if (S.wx && S.wx.type === 'cold' && q < T.CHIP_BELOW && !r.perfect) chip(board, r, m); }
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
    { const bm = bonusMult(); if (bm > 1 && pts > floorsAdd) pts = floorsAdd + Math.round((pts - floorsAdd) * bm); } // v9 truckload multiplier on the bonus part
    if (S.bill && S.bill.on) pts *= T.BILL_SCORE; // WIDWAW: every board is worth 2x (multiplies trait bonuses)
    S.lastPts = pts; S.score += pts; S.floors += floorsAdd; S.boardsTotal++; S.height = S.boardsTotal;
    popup('+' + pts, board, r.perfect ? '#f5c542' : '#e9edf5'); dust(board);
    if (S.rain > 0) S.rain--;
    if (S.wx) { S.wx.left--; if (S.wx.left <= 0) endWeather(); }
    if (S.td) { S.td.left--; updateTdBar(); if (S.td.left <= 0) endTD(); }
    { const nr = rankFor(S.score, trimPct()); if (nr > S.rank) { S.rank = nr; promote(nr); } }
    if (S.floors >= T.RAIN_EVERY && S.rain === 0 && !S.bill && !S.wx && Math.floor(S.floors / T.RAIN_EVERY) > (S.rainCount || 0)) { S.rainCount = Math.floor(S.floors / T.RAIN_EVERY); S.rain = T.RAIN_LEN; host(1, 'idle', 'Rain! ☔ Watch out'); }
    const ms = Math.floor(S.floors / T.MILESTONE); if (ms > (S.msCount || 0)) { S.msCount = ms; S.bonusNext = true; host(ms % 2, 'cheer', 'Bonus board for you!'); sfx.bonus(); }
    if (!collection.has(m.p.id)) { collection.add(m.p.id); store.set(LS.coll, [...collection]); S.unlockedNow.push(m.p.id); toast('New card: ' + m.p.name); }
    if (S.earnNow) { S.earnNow = false; earnAdhere(); } // after the card toast so the ADHERE™ pop-up isn't overwritten
    $('score').textContent = S.score;
    S.camT = camTarget(board.y + board.t);
    if (S.stack.length - 1 >= T.SKID_MAX) completeSkid(); else spawn();
    updateTruckHud();
  }
  // ---------- v9 skids, truckloads, Team Drivers ----------
  const bonusMult = () => (1 + T.TRUCK_STEP * ((S && S.trucks) || 0)) * (S && S.td ? T.TD_BOOST : 1);
  function completeSkid() {
    const G = geo(), oldCam = S.cam;
    S.skids++; const full = S.skids % T.SKIDS_PER_TRUCK === 0;
    S.skidOut = { stack: S.stack, cam: oldCam, t: 0 }; S.moving = null; S.skidWait = T.SKID_SWAP;
    S.stack = [{ x: (S.SW - G.bw) / 2, w: G.bw, y: 0, t: G.palletT, base: true }]; S.cam = S.camT = 0; S.flashes = [];
    for (const f of S.falling) f.y -= oldCam; for (const q of S.parts) q.y -= oldCam; for (const u of S.popups) u.wy -= oldCam; // keep them where they are on screen
    let pts = Math.round(T.SKID_BONUS * bonusMult());
    if (full) { S.trucks++; pts += Math.round(T.TRUCK_BONUS * bonusMult()); S.truckFx = { t: 0 }; if (S.trucks === 1 && EVENTS) S.tdNext = S.playT + T.TD_MIN + rnd() * (T.TD_MAX - T.TD_MIN);
      host(0, 'cheer', 'Truckload!'); host(1, 'cheer', 'Bonuses ×' + fmtM(1 + T.TRUCK_STEP * S.trucks), true); toast(`Truckload ${S.trucks}! Bonuses now ×${fmtM(1 + T.TRUCK_STEP * S.trucks)}`, '🚚 '); sfx.truckload(); buzz([20, 40, 20, 40]); }
    else { host(1, 'cheer', 'Skid complete!'); toast(`Skid ${S.skids % T.SKIDS_PER_TRUCK}/${T.SKIDS_PER_TRUCK} loaded · fresh pallet`, '📦 '); sfx.skid(); buzz([10, 20, 10]); }
    S.score += pts; $('score').textContent = S.score; S.popups.push({ text: (full ? 'Truckload +' : 'Skid +') + pts, x: sceneW() / 2, wy: S.stack[0].t + 40, t: 0, life: 1.4, col: '#7cf0a5' });
    { const nr = rankFor(S.score, trimPct()); if (nr > S.rank) { S.rank = nr; promote(nr); } }
    updateTruckHud();
  }
  function fitScore() { // v9: scale the score digits down (layout unchanged, never below 55%) so they never run under the truck HUD
    const sc = $('score'), th = $('truckHud'); if (!sc || !th) return; sc.style.transform = '';
    const t = th.getBoundingClientRect(); if (!t.width) return; const rg = document.createRange(); rg.selectNodeContents(sc); const r = rg.getBoundingClientRect(); if (!r.width) return;
    if (t.bottom <= r.top || t.top >= r.bottom || r.left >= t.right + 6) return; // not in the same row, or already clear
    const cx = r.left + r.width / 2, k = Math.max(0.55, Math.min(1, (cx - (t.right + 6)) / (r.width / 2)));
    sc.style.transformOrigin = '50% 50%'; sc.style.transform = 'scale(' + k.toFixed(3) + ')';
  }
  if (window.MutationObserver) new MutationObserver(() => fitScore()).observe($('score'), { childList: true, characterData: true, subtree: true });
  window.addEventListener('resize', () => requestAnimationFrame(fitScore));
  const fmtM = m => (Math.round(m * 100) / 100).toString().replace(/(\.\d)0$/, '$1');
  function startTD() {
    if (!S || S.td || !S.trucks) return; S.td = { left: T.TD_LEN }; S.tdCount++;
    host(1, 'cheer', 'Team Drivers!'); $('tdBanner').hidden = false; $('tdMult').textContent = '×' + fmtM(bonusMult()); updateTdBar(); sfx.horn(); buzz([10, 30, 10]); updateTruckHud();
  }
  function endTD() { if (!S || !S.td) return; S.td = null; $('tdBanner').hidden = true; S.tdNext = S.playT + T.TD_MIN + rnd() * (T.TD_MAX - T.TD_MIN); updateTruckHud(); }
  function updateTdBar() { const el = $('tdBar'); if (el && S && S.td) el.style.width = (S.td.left / T.TD_LEN * 100).toFixed(1) + '%'; }
  const TRUCK_SVG = '<svg viewBox="0 0 22 12" width="22" height="12" aria-hidden="true" shape-rendering="crispEdges"><rect x="0" y="1" width="13" height="7" fill="#eef0f3"/><rect x="1" y="2" width="11" height="1" fill="#f5c542"/><rect x="13" y="3" width="6" height="5" fill="#2f6fd6"/><rect x="15" y="4" width="3" height="2" fill="#bfe0ff"/><rect x="19" y="6" width="2" height="2" fill="#2f6fd6"/><rect x="0" y="8" width="21" height="1" fill="#3b4052"/><rect x="2" y="9" width="3" height="3" fill="#141824"/><rect x="8" y="9" width="3" height="3" fill="#141824"/><rect x="15" y="9" width="3" height="3" fill="#141824"/></svg>';
  function updateTruckHud() {
    const el = $('truckHud'); if (!el || !S) return; const n = S.skids % T.SKIDS_PER_TRUCK + 1, b = S.stack.length - 1;
    $('truckRow').innerHTML = S.trucks ? TRUCK_SVG + (S.trucks > 1 ? '<b>×' + S.trucks + '</b>' : '') + '<i class="' + (S.td ? 'td' : '') + '">x' + fmtM(bonusMult()) + '</i>' : '';
    $('truckRow').hidden = !S.trucks; $('skidRow').textContent = `Skid ${n}/${T.SKIDS_PER_TRUCK}`; $('skidBar').style.width = (b / T.SKID_MAX * 100).toFixed(1) + '%';
    el.classList.toggle('td', !!S.td); el.dataset.trucks = S.trucks; el.dataset.mult = bonusMult(); fitScore();
  }
  function camTarget(topY) { // keep the stack top ~45% down the free play area between the HUD and the ground
    // v8.1 landscape: one constant working level. The top of the stack always sits where the pallet's top deck (the hosts'
    // waists) is in the opening view, from the first board on; the stack scrolls down underneath it. (v8 and earlier let the
    // top climb ~35-65 px toward the HUD for the first 15-20 boards, then scrolled the pallet and hosts off the bottom.)
    if (LANDSCAPE()) return Math.max(0, topY - palletTH());
    const g = groundY(), E = geo().hh, hopper = Math.round(E * 0.78) + 24; // extruder hopper + name plate above the stack top
    let hudB;
    if (LANDSCAPE()) { // the hopper sits beside the centred HUD column, so only the score/pill above the stack and the screen top matter
      const sb = $('hud').querySelector('.scorebox').getBoundingClientRect(), nb = $('nowBoard').getBoundingClientRect();
      hudB = Math.max(sb.bottom || 0, nb.height ? nb.bottom : 0, safeTop) + 34; // + the "Perfect ×N" line above the moving board hudB = Math.max(hudB, safeTop + hopper);
    } else { const hb = $('hud').getBoundingClientRect(); hudB = (hb.height ? hb.bottom : safeTop + 150) + Math.max(64, Math.round(E * 1.05 + 26)); }
    const target = Math.min(g - 24, hudB + Math.max(40, g - hudB) * 0.35); // never below the pallet: an empty stack always starts at cam 0
    return Math.max(0, topY - (g - target));
  }
  function grow(board, px) {
    const nw = Math.min(S.maxW, board.w + px); if (nw <= board.w) return;
    board.x -= (nw - board.w) / 2; board.w = nw; board.x = Math.max(-T.DEPTH_X, Math.min(sceneW() - nw, board.x)); sfx.grow();
    S.flashes.push({ kind: 'grow', b: board, t: 0.4 });
  }
  function mkPiece(x, w, m, y) {
    return { x, w, y: y == null ? m.y : y, t: m.t, look: m.look, p: m.p, vx: (x + w / 2 < sceneW() / 2 ? -1 : 1) * (40 + rnd() * 60), vy: 60, rot: 0, vr: (rnd() - 0.5) * 5 };
  }
  function sliced(r, m, board) {
    if (r.cut && r.cut.w > 0.5) {
      const pc = mkPiece(r.cut.x, r.cut.w, m, board.y); pc.vx = (r.cut.x > board.x ? 1 : -1) * (60 + rnd() * 80); pc.vr = (r.cut.x > board.x ? 1 : -1) * (2 + rnd() * 3);
      S.falling.push(pc); const ex = r.cut.x > board.x ? r.cut.x : r.cut.x + r.cut.w; flash(ex, board, '#ffffff'); crumbs(ex, board, m.look);
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
  // ---------- v8 effects ----------
  function popup(text, board, col) { S.popups.push({ text, x: board.x + board.w / 2, wy: board.y + board.t + 6, t: 0, life: 0.9, col }); }
  function dust(board) { // soft puffs at both ends of a landed board
    for (const ex of [board.x, board.x + board.w]) for (let i = 0; i < 4; i++) S.parts.push({ x: ex + (rnd() - 0.5) * 6, y: board.y + board.t * 0.3, vx: (ex === board.x ? -1 : 1) * (20 + rnd() * 50), vy: 20 + rnd() * 40, life: 0.35 + rnd() * 0.2, t: 0, col: '#c9d0de', g: 0.2, sz: 3 });
  }
  function crumbs(x, board, look) { // foam crumbs from a trimmed edge
    for (let i = 0; i < 7; i++) S.parts.push({ x, y: board.y + rnd() * board.t, vx: (rnd() - 0.5) * 160, vy: rnd() * 120, life: 0.45 + rnd() * 0.3, t: 0, col: i % 2 ? look.core : look.face, sz: 2 + (i % 2) });
  }
  function chip(board, r, m) { // v8 cold: brittle board – a sloppy trim chips a little extra off the cut edge
    const amt = Math.min(Math.round(3 * K()), Math.max(0, board.w * 0.05)); if (amt < 1 || board.w - amt < 8) return;
    const rightSide = (r.cuts && r.cuts.length ? r.cuts[0].x : r.cut ? r.cut.x : 0) > board.x;
    const cx = rightSide ? board.x + board.w - amt : board.x; board.w -= amt; if (!rightSide) board.x += amt;
    S.falling.push(mkPiece(cx, amt, m, board.y)); S.chips++;
    for (let i = 0; i < 10; i++) S.parts.push({ x: cx + amt / 2, y: board.y + board.t / 2, vx: (rightSide ? 1 : -1) * (60 + rnd() * 160), vy: 40 + rnd() * 160, life: 0.5 + rnd() * 0.3, t: 0, col: pick(['#dff3ff', '#a9d8ff', '#ffffff']), sz: 2 });
    S.popups.push({ text: 'Chipped! 🥶', x: cx + amt / 2, wy: board.y + board.t + 22, t: 0, life: 1.1, col: '#a9d8ff' }); sfx.chip(); buzz([6, 20, 6]);
  }
  const trimPct = () => (S && S.trimN ? Math.round(S.trimSum / S.trimN * 100) : 100);
  function promote(i) {
    const k = RANKS[i]; S.promo = { text: 'Promoted: ' + k.name, icon: k.icon, t: 0, life: 1.6 };
    for (let n = 0; n < 16; n++) S.parts.push({ x: sceneW() / 2 + (rnd() - 0.5) * 160, y: S.cam + groundY() - promoY() - 12, vx: (rnd() - 0.5) * 120, vy: 30 + rnd() * 50, life: 0.9 + rnd() * 0.4, t: 0, col: pick(['#f5c542', '#7cf0a5', '#8fb8ff', '#ff8fa3', '#ffffff']), sz: 4, g: 0.12, conf: true, rot: rnd() * 6 }); // confetti
    sfx.rankUp(); buzz([10, 30, 10]);
  }
  // ---------- v8 weather ----------
  const WX_SAY = { heat: [1, 'Heat wave! Boards go soft'], cold: [1, 'Cold snap! Boards get brittle'], snow: [0, 'Snow day! Hats on'] };
  const WX_TOAST = { heat: 'Heat wave: soft, warm boards wobble and drift', cold: 'Cold snap: stiff boards slide faster; sloppy trims chip', snow: 'Snow: slick boards slide a little faster' };
  function startWeather(type) {
    if (!S || S.wx) return; if (!type) { const opts = ['heat', 'cold', 'snow'].filter(t => t !== S.wxLast); type = pick(opts); } S.wxLast = type; // never the same weather twice in a row
    S.wx = { type, left: T.WX_LEN, t: 0 }; S.wxType = type; S.wxCount++;
    const [hi, say] = WX_SAY[type]; host(hi, 'cheer', say); toast(WX_TOAST[type], { heat: '☀️ ', cold: '🥶 ', snow: '❄️ ' }[type]); sfx[type](); updateNowBoard();
  }
  function endWeather() { if (!S || !S.wx) return; S.wx = null; S.wxNext = S.playT + T.WX_MIN + rnd() * (T.WX_MAX - T.WX_MIN); updateNowBoard(); }
  function updateWeather(dt) {
    if (!S.wx && S.playT >= S.wxNext && S.floors >= T.WX_MIN_FLOORS && !(S.rain > 0)) startWeather();
    S.wxA += ((S.wx ? 1 : 0) - S.wxA) * Math.min(1, dt * 2.5); if (!S.wx && S.wxA < 0.01) { S.wxA = 0; S.wxType = null; }
    if (S.wx) S.wx.t += dt;
    const ty = S.wxType;
    if ((ty === 'snow' || ty === 'cold') && S.wxA > 0.05) { const n = ty === 'snow' ? 1.2 : 0.25; if (rnd() < n * S.wxA * dt * 60 / 2) S.flakes.push({ x: rnd() * (W + 40) - sceneX() - 20, y: -8, v: 40 + rnd() * 50, r: 1 + rnd() * 2.2, ph: rnd() * 6 }); }
    for (let i = S.flakes.length - 1; i >= 0; i--) { const f = S.flakes[i]; f.y += f.v * dt; f.x += Math.sin(S.t * 1.5 + f.ph) * 18 * dt - 8 * dt; if (f.y > H + 6 || S.flakes.length > 160) S.flakes.splice(i, 1); }
  }
  // ---------- v8 "New BOM ready" ----------
  function startBom(force) {
    if (!S || S.bom) return; S.bom = { left: T.BOM_LEN, force: force || 0, spec: top().w }; S.bomCount++;
    host(0, 'cheer', 'New BOM ready'); toast('Evan tweaked the extruder: board widths now vary ±50%', '📋 '); sfx.bom(); buzz([8, 30, 8]);
    S.flashes.push({ kind: 'bom', t: 0.6, b: top() });
  }
  function endBom() { if (!S || !S.bom) return; S.bomSpec = S.bom.spec; S.bom = null; S.bomNext = S.playT + T.BOM_MIN + rnd() * (T.BOM_MAX - T.BOM_MIN); host(0, 'idle', 'Back to spec'); }

  function host(i, anim, text, both) {
    if (!S) return; const h = S.hostState[i]; h.anim = anim; h.t = anim === 'cheer' ? 1.0 : 0; if (text) { h.bubble = { text, t: 1.5 }; if (!both) S.hostState[1 - i].bubble = null; }
  }

  // ---------- ADHERE™ power-up ----------
  function earnAdhere() {
    if (!collection.has('adhere')) { collection.add('adhere'); store.set(LS.coll, [...collection]); S.unlockedNow.push('adhere'); }
    if (S.adhere >= ADHERE_MAX) return;
    S.adhere++; S.adhereLog = (S.adhereLog || 0) + 1; updateAdhere(); toast(ADHERE_POP, '📌 +1 '); sfx.adhereEarn(); buzz(10);
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
    if (yes) { S.adhere--; S.adhereArmed = false; updateAdhere(); const m = S.moving; m.dir = 1; m.x = T.DIE_X; host(0, 'cheer', 'Fastened!'); toast(ADHERE_POP, '📌 '); sfx.adhereFasten(); buzz(15); }
    else drop();
  }

  // ---------- WIDWAW: Bill VanHorn event ----------
  const boost = () => (S && S.bill && S.bill.on ? T.BILL_BOOST : 1); // applied on top of the board's own speed, so the exit restores it exactly
  // hosts stand in front of the pallet with their midsection on its top deck: world y of the waist = pallet top (stack[0].t).
  // Same anchor for Evan, Cyrus and Bill, scrolled by the same camera as the stack.
  // portrait: hosts ride with the pallet (waist on its top deck). landscape (v8.1): hosts stay at the constant working level –
  // the same spot as the pallet top in the opening view – on a steel mezzanine once the floor scrolls away beneath them.
  const workLevel = () => groundY() - palletTH(); // screen y of the working level (pallet top at cam 0)
  function hostPos(i) { const G = geo(), x = i === 0 ? 8 : sceneW() - 8 - G.hw, land = LANDSCAPE() && S, wy = palletTH() + (land ? S.cam : 0);
    return { x, wy, y: Math.round((land ? workLevel() : S ? sy(wy) : groundY() - wy) - G.hh / 2), w: G.hw, h: G.hh }; }
  function hostSlot() { const h = hostPos(1); return { x: h.x + h.w / 2, wy: h.wy }; }
  function startBill() {
    if (!S || S.bill) return;
    S.bill = { t: 0, dur: T.BILL_DUR, on: true, phase: 'in', outT: 0 }; S.billCount++;
    const h = S.hostState[1]; h.anim = 'cheer'; h.t = 1.4; h.bubble = { text: 'WIDWAW', t: 2.4 };
    const sl = hostSlot(); S.poofs.push({ x: sl.x, wy: sl.wy, t: 0 });
    $('billBanner').hidden = false; updateBillBar(); sfx.widwaw(); AU.setFast(true); buzz([10, 30, 10]);
  }
  function endBill() {
    if (!S || !S.bill || !S.bill.on) return;
    S.bill.on = false; S.bill.phase = 'out'; S.bill.outT = 0; S.hostState[1].bubble = null; S.hostState[1].anim = 'idle';
    const sl = hostSlot(); S.poofs.push({ x: sl.x, wy: sl.wy, t: 0 }); $('billBanner').hidden = true; sfx.billLeave(); AU.setFast(false);
  }
  function updateBill(dt) {
    const b = S.bill;
    if (!b) { if (S.playT >= S.billNext && S.floors >= T.BILL_MIN_FLOORS && !(S.rain > 0) && !S.td && !S.skidWait) startBill(); return; }
    if (b.on) { b.t += dt; if (b.phase === 'in' && b.t >= T.POOF) b.phase = 'on'; updateBillBar(); if (b.t >= b.dur) endBill(); }
    else { b.outT += dt; if (b.outT >= T.POOF) { S.bill = null; S.billNext = S.playT + T.BILL_MIN + rnd() * (T.BILL_MAX - T.BILL_MIN); } }
  }
  function updateBillBar() { const b = S && S.bill; const el = $('billBar'); if (el && b) el.style.width = (Math.max(0, 1 - b.t / b.dur) * 100).toFixed(1) + '%'; }
  function drawPoofs() {
    for (const p of S.poofs) {
      const k = p.t / T.POOF, a = 1 - k, r = 10 + k * 34, py = sy(p.wy);
      ctx.save(); ctx.globalAlpha = a * 0.9; ctx.fillStyle = '#e9edf5';
      for (let i = 0; i < 7; i++) { const an = i / 7 * Math.PI * 2; ctx.beginPath(); ctx.arc(p.x + Math.cos(an) * r * 0.7, py + Math.sin(an) * r * 0.5, 9 + 8 * (1 - k), 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#f5c542'; for (let i = 0; i < 6; i++) { const an = i / 6 * Math.PI * 2 + 0.4; ctx.fillRect(p.x + Math.cos(an) * r * 1.2, py + Math.sin(an) * r * 0.9, 3, 3); }
      ctx.restore();
    }
  }

  function wxSpeed() { // v8 weather on the slide speed (heat: a soft, uneven drift; cold/snow: stiff/slick, a bit faster)
    const ty = S.wx && S.wx.type; if (!ty) return 1;
    if (ty === 'heat') return 1 + T.HEAT_DRIFT * Math.sin(S.t * 4.2) * Math.min(1, S.wxA * 1.5);
    return ty === 'cold' ? T.COLD_SPEED : T.SNOW_SPEED;
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
    if (S.mode === 'play') { S.playT += dt; updateBill(dt); }
    if (S.mode === 'play' || S.mode === 'dying' || S.mode === 'over') updateWeather(dt);
    if (S.skidOut) { S.skidOut.t += dt; if (S.skidOut.t > T.SKID_SWAP + 0.2) S.skidOut = null; }
    if (S.truckFx) { S.truckFx.t += dt; if (S.truckFx.t > 2.6) S.truckFx = null; }
    if (S.mode === 'play') {
      if (S.skidWait > 0) { S.skidWait -= dt; if (S.skidWait <= 0) { S.skidWait = 0; spawn(); } }
      if (!S.td && S.trucks && S.playT >= S.tdNext && !S.bill && !S.bom && !S.skidWait) startTD();
    }
    for (let i = S.popups.length - 1; i >= 0; i--) { const u = S.popups[i]; u.t += dt; if (u.t > u.life) S.popups.splice(i, 1); }
    if (S.promo) { S.promo.t += dt; if (S.promo.t > S.promo.life) S.promo = null; }
    if (S.flashA > 0) S.flashA = Math.max(0, S.flashA - dt * 0.6);
    for (let i = S.poofs.length - 1; i >= 0; i--) { S.poofs[i].t += dt; if (S.poofs[i].t > T.POOF) S.poofs.splice(i, 1); }
    if (S.mode === 'play' && S.moving) {
      const m = S.moving;
      if (m.extrude) {
        const e = m.extrude; e.t += dt * boost(); const P = T.EXTRUDE_PUSH;
        const k = Math.min(1, e.t / P); m.x = T.DIE_X - m.w + m.w * (1 - Math.pow(1 - k, 2));
        if (e.t >= P && !e.cut) { e.cut = true; e.cutAt = e.t; sparks(T.DIE_X + 2, m.y + m.t / 2); sfx.cut(); buzz(6); }
        if (e.t >= P + T.EXTRUDE_CUT) { m.x = T.DIE_X; m.extrude = null; m.extruded = true; S.extrudeLog.push({ ms: performance.now() - e.start, sim: e.t, id: m.p.id }); }
      } else if (m.speed > 0) { m.x += m.dir * m.speed * boost() * wxSpeed() * dt;
      const minX = T.DIE_X, maxX = sceneW() - m.w * 0.65;
      if (m.x > maxX) { m.x = maxX - (m.x - maxX); m.dir = -1; } else if (m.x < minX) { m.x = minX + (minX - m.x); m.dir = 1; } }
    }
    if (S.lineFlash > 0) S.lineFlash -= dt;
    for (const b of S.stack) if (b.landT != null && b.landT < 1) b.landT += dt * 6;
    for (let i = S.falling.length - 1; i >= 0; i--) { const f = S.falling[i]; f.vy -= 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; if (f.y < S.cam - H) S.falling.splice(i, 1); }
    if (S.parts.length > 420) S.parts.splice(0, S.parts.length - 420); // cap for older phones
    for (let i = S.parts.length - 1; i >= 0; i--) { const p = S.parts[i]; p.t += dt; p.vy -= 600 * (p.g == null ? 1 : p.g) * dt; if (p.conf) p.rot += dt * 6; p.x += p.vx * dt; p.y += p.vy * dt; if (p.t > p.life) S.parts.splice(i, 1); }
    for (let i = S.flashes.length - 1; i >= 0; i--) { S.flashes[i].t -= dt; if (S.flashes[i].t <= 0) S.flashes.splice(i, 1); }
    if (S.rain > 0 || S.rainDrops.length) {
      if (S.rain > 0) for (let i = 0; i < 4; i++) S.rainDrops.push({ x: rnd() * W - sceneX(), y: -10, v: 600 + rnd() * 300 });
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
  // v8 heat: draw a board softened/sagging – vertical strips offset by a droop curve (ends dip, a slow warp wave)
  function drawBoardSag(x, yb, w, t, look, p, opts, sag) {
    if (!sag || w < 24) return drawBoard(x, yb, w, t, look, p, opts);
    const n = 14, sw = w / n;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, dy = sag * ((2 * u - 1) ** 2) + sag * 0.25 * Math.sin(u * Math.PI * 2 + S.t * 3);
      ctx.save(); ctx.beginPath(); ctx.rect(x + i * sw - (i ? 0 : 2), -1e4, sw + (i === n - 1 ? T.DEPTH_X + 4 : 0.75) + (i ? 0 : 2), 3e4); ctx.clip();
      ctx.translate(0, dy); drawBoard(x, yb, w, t, look, p, opts); ctx.restore();
    }
  }
  function topFace(x, yt, w, col) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, yt); ctx.lineTo(x + w, yt); ctx.lineTo(x + w + T.DEPTH_X, yt - T.DEPTH_Y); ctx.lineTo(x + T.DEPTH_X, yt - T.DEPTH_Y); ctx.closePath(); ctx.fill(); }
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
    const ox = sceneX(); ctx.fillStyle = '#171a23'; ctx.fillRect(-ox, yb, W, H - yb + 400); ctx.fillStyle = '#2a2f3e'; ctx.fillRect(-ox, yb, W, 2);
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
    S.palletTopY = yt; S.floorY = yb;
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
      ctx.font = '800 10px ui-monospace,Menlo,monospace'; const txt = S.lineName.toUpperCase(); let cap = W * 0.55;
      if (LANDSCAPE()) { const nb = $('nowBoard').getBoundingClientRect(); if (nb.width) cap = Math.min(cap, nb.left - sceneX() - 20); } // landscape: stay left of the HUD pill
      const tw = Math.min(ctx.measureText(txt).width, Math.max(90, cap));
      const px = 4, py = hopTop - 20; ctx.fillStyle = '#20242f'; ctx.fillRect(px, py, tw + 12, 15); ctx.fillStyle = S.lineFlash > 0 ? '#ffd75e' : '#f5c54299'; ctx.fillRect(px, py + 14, tw + 12, 1);
      ctx.fillStyle = S.lineFlash > 0 ? '#ffd75e' : '#c9a647'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(txt, px + 6, py + 8, tw); ctx.textBaseline = 'alphabetic';
    }
    S.lineRect = { top: hopTop - 20, bottom: bodyBot, h: floorY - hopTop, E };
  }
  function drawHosts(dt) {
    const G = geo(), hw = G.hw, hh = G.hh;
    CFG.HOSTS.forEach((h0, i) => {
      const b = S && S.bill, guest = i === 1 && b && b.on && CFG.GUEST, h = guest || h0;
      if (i === 1 && S) S.slot1 = h.id;
      const st = S ? S.hostState[i] : { anim: 'idle' };
      const fr = st.anim === 'cheer' ? SPR.FRAMES.cheer[Math.floor(performance.now() / 180) % 2] : SPR.FRAMES.idle[Math.floor((performance.now() / 600 + i * 0.5)) % 2];
      // hosts stand so their vertical midpoint lines up with the pallet's top deck in the opening view
      const hp = hostPos(i), x = hp.x, y = hp.y;
      // pop-in bounce: Bill on arrival, Cyrus on return
      const popT = i === 1 && b ? (b.on ? b.t : b.outT) : -1, popY = popT >= 0 && popT < T.POOF + 0.25 ? -Math.round(Math.abs(Math.sin(Math.min(1, popT / (T.POOF + 0.25)) * Math.PI * 1.5)) * 16 * (1 - popT / (T.POOF + 0.25))) : 0;
      if (S) (S.hostRects || (S.hostRects = []))[i] = { x, y, w: hw, h: hh, ox: sceneX() };
      if (S) { const fy = Math.round(sy(0)), feet = y + hh + 2; if (fy > feet + 3) drawMezz(x - 6, feet, hw + 12, Math.min(fy, H + 10)); } // landscape: catwalk under the hosts
      ctx.fillStyle = '#00000066'; ctx.beginPath(); ctx.ellipse(x + hw / 2, y + hh + 1, hw * 0.45, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2f3e'; ctx.fillRect(x - 4, y + hh + 2, hw + 8, 2);
      ctx.imageSmoothingEnabled = false; ctx.drawImage(SPR.frameCanvas(h, fr), Math.round(x), Math.round(y + popY), hw, hh);
      if (S && i === 0) S.hatsOn = 0;
      if (S && S.wxType === 'snow' && S.wxA > 0.3) { S.hatsOn++; const sc = hw / SPR.W; ctx.drawImage(SPR.hatCanvas(h, fr), Math.round(x), Math.round(y + popY + SPR.HAT_OY * sc), hw, 16 * sc); } // v8: winter hats while it snows
      ctx.imageSmoothingEnabled = true;
      ctx.fillStyle = '#9aa3b7'; ctx.font = '600 11px -apple-system,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText(h.short, x + hw / 2, y + hh + 13);
      if (st.bubble) bubble(st.bubble.text, x + hw / 2, y - 4, i === 0 ? 'left' : 'right', Math.min(1, st.bubble.t * 4));
    });
  }
  function drawMezz(x, top, w, floor) { // steel mezzanine deck + legs + braces down to the warehouse floor
    ctx.fillStyle = '#262a36'; ctx.fillRect(x + 3, top + 6, 5, floor - top - 6); ctx.fillRect(x + w - 8, top + 6, 5, floor - top - 6);
    ctx.strokeStyle = '#323748'; ctx.lineWidth = 2; ctx.beginPath(); for (let yy = top + 10; yy + 24 < floor; yy += 26) { ctx.moveTo(x + 6, yy); ctx.lineTo(x + w - 6, yy + 24); ctx.moveTo(x + w - 6, yy); ctx.lineTo(x + 6, yy + 24); } ctx.stroke();
    ctx.fillStyle = '#3d4458'; ctx.fillRect(x, top, w, 6); ctx.fillStyle = '#5a627a'; ctx.fillRect(x, top, w, 1); ctx.fillStyle = '#f5c54299'; for (let i = 2; i < w - 4; i += 8) ctx.fillRect(x + i, top + 4, 4, 2); // deck with a hazard edge
  }
  function bubble(text, cx, by, side, a) {
    ctx.save(); ctx.globalAlpha = a; ctx.font = '700 13px -apple-system,system-ui,sans-serif';
    const tw = Math.min(ctx.measureText(text).width, W * 0.42), bw = tw + 16, bh = 26, L = -sceneX(), Rr = W - sceneX();
    // keep each bubble on its own side, clear of the stack and of the other host's bubble, and on screen
    const tp = S && top(), stL = tp ? tp.x - 4 : W / 2, stR = tp ? tp.x + tp.w + T.DEPTH_X + 4 : W / 2;
    let bx = side === 'left' ? Math.max(L + 4, Math.min(cx - 18, stL - bw)) : Math.min(Rr - 4 - bw, Math.max(cx + 18 - bw, stR));
    bx = Math.max(L + 4, Math.min(Rr - 4 - bw, bx)); let y = Math.max(4, Math.min(by - bh - 8, H - bottomUI - bh - 12)); // hosts scrolled off the bottom: keep the line on screen
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
    const wxA = S.wxA, wxT = S.wxType;
    if (wxT && wxA > 0.01) { // v8 weather sky tint
      const tg = ctx.createLinearGradient(0, 0, 0, H * 0.8);
      if (wxT === 'heat') { tg.addColorStop(0, `rgba(255,120,40,${0.30 * wxA})`); tg.addColorStop(1, 'rgba(255,120,40,0)'); }
      else { tg.addColorStop(0, `rgba(150,200,255,${(wxT === 'snow' ? 0.22 : 0.18) * wxA})`); tg.addColorStop(1, 'rgba(150,200,255,0)'); }
      ctx.fillStyle = tg; ctx.fillRect(0, 0, W, H);
      if (wxT === 'heat') { const sx = W * 0.84, syy = Math.round(H * 0.47); ctx.globalAlpha = 0.5 * wxA; ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.arc(sx, syy, 26, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 0.18 * wxA; ctx.beginPath(); ctx.arc(sx, syy, 44 + Math.sin(S.t * 2) * 4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    }
    ctx.save();
    if (S.shake) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    ctx.translate(sceneX(), 0); // centre the scene; everything below shares this x offset and the sy() camera
    drawLine(false);
    ctx.fillStyle = '#ffffff08'; ctx.font = '600 11px system-ui,sans-serif'; ctx.textAlign = 'left';
    for (const b of S.stack) {
      if (b.base) { drawPallet(b); continue; }
      const yb = sy(b.y); if (yb < -60 || yb - b.t > H + 40) continue;
      const land = b.landT != null && b.landT < 1 ? (1 - b.landT) * 3 : 0;
      const fromTop = S.stack.length - 1 - S.stack.indexOf(b);
      if (wxT === 'heat' && wxA > 0.05 && fromTop < 3) drawBoardSag(b.x, yb, b.w, b.t, b.look, b.p, {}, (3.2 - fromTop * 0.9) * wxA); // top boards go soft in the heat
      else drawBoard(b.x, yb + land * 0, b.w, b.t, b.look, b.p);
      if (b.adhered) drawTabs(b, yb);
      if ((wxT === 'cold' || wxT === 'snow') && wxA > 0.05) { // frost on every board; a snow cap builds on the top one
        topFace(b.x, yb - b.t, b.w, `rgba(220,240,255,${0.28 * wxA})`);
        ctx.fillStyle = `rgba(235,247,255,${0.5 * wxA})`; for (let i = 3; i < b.w - 2; i += 9) ctx.fillRect(b.x + i, yb - b.t + 1 + ((i * 7) % 3), 2, 1);
        if (wxT === 'snow' && fromTop === 0) { const yt = yb - b.t; ctx.fillStyle = `rgba(250,252,255,${0.95 * wxA})`; ctx.beginPath(); ctx.moveTo(b.x - 1, yt + 1); for (let i = 0; i <= 8; i++) ctx.lineTo(b.x + i * b.w / 8, yt - 2 - ((i * 5) % 3)); ctx.lineTo(b.x + b.w + T.DEPTH_X, yt - T.DEPTH_Y - 1); ctx.lineTo(b.x + T.DEPTH_X, yt - T.DEPTH_Y - 2); ctx.closePath(); ctx.fill(); }
      }
    }
    if (S.skidOut) drawSkidOut(S.skidOut); // in front of the fresh pallet so the forklift and the outgoing skid read clearly
    for (const f of S.falling) {
      const yb = sy(f.y); ctx.save(); ctx.translate(f.x + f.w / 2, yb - f.t / 2); ctx.rotate(f.rot); ctx.globalAlpha = 0.95;
      drawBoard(-f.w / 2, f.t / 2, f.w, f.t, f.look, f.p, { noPrint: f.w < 60 }); ctx.restore();
    }
    if (S.moving) {
      const m = S.moving;
      const sag = wxT === 'heat' ? 6 * wxA : 0;
      if (m.extrude) { ctx.save(); ctx.beginPath(); ctx.rect(T.DIE_X, -10, W + sceneW(), H + 20); ctx.clip(); drawBoardSag(m.x, sy(m.y), m.w, m.t, m.look, m.p, { bonus: m.bonus }, sag); ctx.restore(); }
      else drawBoardSag(m.x, sy(m.y), m.w, m.t, m.look, m.p, { bonus: m.bonus }, sag);
      if (m.bom) { // v8: width call-out over a resized BOM board, vs. a dashed ghost of the board below
        const tp = top(), yb = sy(m.y), yT = yb - m.t - T.DEPTH_Y - 6, big = m.bom > 1;
        ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#ffd75e99'; ctx.lineWidth = 1; ctx.strokeRect(tp.x + 0.5, sy(tp.y + tp.t) - T.DEPTH_Y + 0.5, tp.w + T.DEPTH_X - 1, T.DEPTH_Y - 1); ctx.restore();
        ctx.strokeStyle = big ? '#ff9d6e' : '#7cf0a5'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(m.x, yT); ctx.lineTo(m.x + m.w, yT); ctx.moveTo(m.x, yT - 4); ctx.lineTo(m.x, yT + 4); ctx.moveTo(m.x + m.w, yT - 4); ctx.lineTo(m.x + m.w, yT + 4); ctx.stroke();
        const lbl = (big ? '▲ ' : '▼ ') + Math.round(m.bom * 100) + '%'; ctx.font = '800 11px -apple-system,system-ui,sans-serif'; const lw = ctx.measureText(lbl).width + 10;
        ctx.fillStyle = '#0d0f16dd'; roundRect(m.x + m.w / 2 - lw / 2, yT - 9, lw, 16, 6); ctx.fill(); ctx.fillStyle = big ? '#ff9d6e' : '#7cf0a5'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lbl, m.x + m.w / 2, yT); ctx.textBaseline = 'alphabetic';
      }
    }
    drawLine(true);
    for (const fl of S.flashes) {
      const b = fl.b, yb = sy(b.y), a = Math.max(0, fl.t / 0.35);
      if (fl.kind === 'bom') { const ly = sy(top().y + top().t), r0 = (1 - fl.t / 0.6) * 46; ctx.strokeStyle = '#7cf0a5'; ctx.globalAlpha = Math.max(0, fl.t / 0.6); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(T.DIE_X - 6, ly - 10, 8 + r0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; continue; }
      if (fl.kind === 'cut') { ctx.fillStyle = '#fff3b0'; ctx.globalAlpha = Math.max(0, fl.t / 0.12); const ly = sy(top().y + top().t); ctx.beginPath(); ctx.arc(T.DIE_X + 2, ly - (S.moving ? S.moving.t : 9) / 2, 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; continue; }
      if (fl.kind === 'slice') { ctx.fillStyle = fl.col; ctx.globalAlpha = a; ctx.fillRect(fl.x - 1.5, yb - b.t - T.DEPTH_Y - 6, 3, b.t + T.DEPTH_Y + 12); ctx.globalAlpha = 1; }
      if (fl.kind === 'ring' || fl.kind === 'grow') { ctx.strokeStyle = fl.kind === 'ring' ? '#f5c542' : '#7cf0a5'; ctx.globalAlpha = a; ctx.lineWidth = 2; const e = (1 - a) * 14; ctx.strokeRect(b.x - e, yb - b.t - T.DEPTH_Y - e, b.w + T.DEPTH_X + e * 2, b.t + T.DEPTH_Y + e * 2); ctx.globalAlpha = 1; }
    }
    for (const p of S.parts) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.col; const z = p.sz || 4;
      if (p.conf) { const cw = 1 + Math.abs(Math.cos(p.rot)) * 5; ctx.fillRect(p.x - cw / 2, sy(p.y) - 2, cw, 4); } else ctx.fillRect(p.x - z / 2, sy(p.y) - z / 2, z, z); }
    ctx.globalAlpha = 1;
    for (const u of S.popups) { const k = u.t / u.life, py = sy(u.wy) - k * 34; ctx.globalAlpha = Math.max(0, 1 - k * k); ctx.font = `900 ${Math.round(15 + (1 - k) * 3)}px -apple-system,system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#0d0f16cc'; ctx.strokeText(u.text, u.x, py); ctx.fillStyle = u.col; ctx.fillText(u.text, u.x, py); }
    ctx.globalAlpha = 1;
    if (S.rainDrops.length) { ctx.strokeStyle = '#8fb8ff66'; ctx.lineWidth = 1.2; ctx.beginPath(); for (const d of S.rainDrops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 4, d.y - 14); } ctx.stroke(); }
    if (S.combo >= 2 && S.mode === 'play' && !(S.promo && LANDSCAPE())) { ctx.fillStyle = '#f5c542'; ctx.font = `800 ${15 + Math.round(Math.max(0, (S.flashA || 0)) * 20)}px -apple-system,system-ui,sans-serif`; ctx.textAlign = 'center'; ctx.fillText('Perfect ×' + S.combo, sceneW() / 2, (S.moving ? sy(S.moving.y) - S.moving.t - T.DEPTH_Y - 18 : H * 0.35)); }
    drawHosts(); drawPoofs();
    drawWeatherFront(wxT, wxA);
    ctx.restore();
    if (S.flashA > 0) { ctx.fillStyle = `rgba(255,248,220,${S.flashA})`; ctx.fillRect(0, 0, W, H); }
    if (wxT && wxA > 0.01) drawWeatherScreen(wxT, wxA);
    if (S.truckFx) drawTruckBy(S.truckFx);
    { const nb = $('nowBoard'), hide = !!(S.promo && LANDSCAPE()) ? 'hidden' : ''; if (nb && nb.style.visibility !== hide) nb.style.visibility = hide; }
    if (S.promo) drawPromo(S.promo);
  }
  function drawSkidOut(o) { // the full skid is lifted a touch and forklifted off to the right
    const k = Math.min(1, o.t / T.SKID_SWAP), dx = Math.pow(k, 1.8) * (W + 60), lift = Math.min(1, k * 4) * 6, saveCam = S.cam, keep = { r: S.palletRect, t: S.palletTopY, f: S.floorY };
    ctx.save(); ctx.translate(dx, -lift); S.cam = o.cam; ctx.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3 * 0.6;
    for (const b of o.stack) { if (b.base) { const yb = Math.round(sy(b.y)); if (yb > -40 && yb - b.t < H + 40) { drawPalletOnly(b); drawForklift(b.x - 8, yb); } continue; } const yb = sy(b.y); if (yb < -60 || yb - b.t > H + 40) continue; drawBoard(b.x, yb, b.w, b.t, b.look, b.p); }
    const tp = o.stack[o.stack.length - 1], ty = sy(tp.y + tp.t) - T.DEPTH_Y - 6; ctx.fillStyle = '#7cf0a5'; ctx.font = '900 13px -apple-system,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✓ SKID ' + (((S.skids - 1) % T.SKIDS_PER_TRUCK) + 1) + '/' + T.SKIDS_PER_TRUCK, tp.x + tp.w / 2, ty);
    S.cam = saveCam; S.palletRect = keep.r; S.palletTopY = keep.t; S.floorY = keep.f; ctx.restore();
  }
  function drawPalletOnly(b) { drawPallet(b); }
  function drawForklift(x, yb) { // little yellow forklift on the pallet's left, tines under the deck
    const y = yb; ctx.fillStyle = '#f5c542'; ctx.fillRect(x - 34, y - 26, 26, 18); ctx.fillStyle = '#c99a24'; ctx.fillRect(x - 34, y - 10, 26, 3);
    ctx.fillStyle = '#2b303f'; ctx.fillRect(x - 30, y - 40, 2, 16); ctx.fillRect(x - 14, y - 40, 2, 16); ctx.fillRect(x - 30, y - 41, 18, 2); // cage
    ctx.fillStyle = '#3b4052'; ctx.fillRect(x - 8, y - 44, 3, 44); ctx.fillStyle = '#9aa3b7'; ctx.fillRect(x - 5, y - 6, 14, 2); // mast + tines
    ctx.fillStyle = '#141824'; for (const wx of [x - 30, x - 16]) { ctx.beginPath(); ctx.arc(wx, y - 4, 5, 0, Math.PI * 2); ctx.fill(); }
  }
  function drawTruckBy(f) { // a box truck drives across under the HUD on a truckload
    const k = f.t / 2.6, s = Math.max(2, Math.round(Math.min(W, 600) / 160)), w = 22 * s, x = -w + k * (W + w * 2), y = Math.round(H * (LANDSCAPE() ? 0.3 : 0.36));
    ctx.save(); ctx.translate(Math.round(x), y); ctx.scale(s, s);
    const R = (a, b, c, d, col) => { ctx.fillStyle = col; ctx.fillRect(a, b, c, d); };
    R(0, 1, 13, 7, '#eef0f3'); R(1, 2, 11, 1, '#f5c542'); R(13, 3, 6, 5, '#2f6fd6'); R(15, 4, 3, 2, '#bfe0ff'); R(19, 6, 2, 2, '#2f6fd6'); R(0, 8, 21, 1, '#3b4052');
    R(2, 9, 3, 3, '#141824'); R(8, 9, 3, 3, '#141824'); R(15, 9, 3, 3, '#141824'); ctx.restore();
    ctx.fillStyle = '#f5c542'; ctx.font = '900 12px -apple-system,system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TRUCKLOAD ' + S.trucks + ' · bonuses ×' + fmtM(1 + T.TRUCK_STEP * S.trucks), Math.round(x + w / 2), y - 6);
  }
  function drawWeatherFront(ty, a) { // scene space: snowflakes, heat shimmer
    if (S.flakes.length) { ctx.fillStyle = '#ffffff'; for (const f of S.flakes) { ctx.globalAlpha = 0.85 * Math.max(a, 0.3); ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
    if (ty === 'heat' && a > 0.05) { // rising heat shimmer over the stack
      const tp = top(), y0 = sy(tp.y + tp.t) + 20; ctx.strokeStyle = `rgba(255,232,205,${0.2 * a})`; ctx.lineWidth = 1.5;
      for (let j = 0; j < 7; j++) { const bx = tp.x - 20 + j * (tp.w + 40) / 6; ctx.beginPath(); for (let k = 0; k <= 14; k++) { const yy = y0 - k * 9 - ((S.t * 40 + j * 13) % 9), xx = bx + Math.sin(S.t * 5 + k * 0.7 + j) * 3; if (k) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); }
    }
  }
  function drawWeatherScreen(ty, a) { // screen space: heat haze / frosted corners
    if (ty === 'heat') { const g = ctx.createLinearGradient(0, H, 0, H * 0.55); g.addColorStop(0, `rgba(255,140,60,${0.14 * a})`); g.addColorStop(1, 'rgba(255,140,60,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); return; }
    const R = Math.max(W, H) * 0.75, g = ctx.createRadialGradient(W / 2, H / 2, R * 0.55, W / 2, H / 2, R); g.addColorStop(0, 'rgba(200,230,255,0)'); g.addColorStop(1, `rgba(200,230,255,${(ty === 'cold' ? 0.42 : 0.3) * a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(235,247,255,${0.45 * a})`; ctx.lineWidth = 1.2; ctx.beginPath(); // ice crystals in the corners
    for (const [cx, cy] of [[8, 8], [W - 8, 8], [8, H - 8], [W - 8, H - 8]]) for (let i = 0; i < 3; i++) { const r = 10 + i * 9, ox = cx + (cx < W / 2 ? r : -r), oy = cy + (cy < H / 2 ? r * 0.6 : -r * 0.6); for (let k = 0; k < 3; k++) { const an = k * Math.PI / 3; ctx.moveTo(ox - Math.cos(an) * 5, oy - Math.sin(an) * 5); ctx.lineTo(ox + Math.cos(an) * 5, oy + Math.sin(an) * 5); } }
    ctx.stroke();
  }
  function drawPromo(p) { // v9: compact rank-up toast just under the HUD, clear of the stack and drop line
    const k = p.t / p.life, a = Math.min(1, p.t / 0.18) * (k > 0.8 ? (1 - k) / 0.2 : 1), slide = (1 - Math.min(1, p.t / 0.22)) * -8;
    ctx.save(); ctx.globalAlpha = a; ctx.font = '800 12.5px -apple-system,system-ui,sans-serif';
    const txt = p.icon + ' ' + p.text, tw = Math.min(ctx.measureText(txt).width, W * 0.7) + 22, h = 24, y = Math.round(promoY() + slide), x = Math.round(W / 2 - tw / 2);
    ctx.fillStyle = '#0d0f16ee'; roundRect(x, y, tw, h, 12); ctx.fill(); ctx.strokeStyle = '#f5c542'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#ffd75e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, W / 2, y + h / 2 + 1, W * 0.7); ctx.restore();
    if (S) S.promoRect = { x, y, w: tw, h };
  }
  function promoY() { // portrait: under the HUD and under any Bill / Team Drivers banner; landscape: in place of the board-name pill (hidden meanwhile)
    if (LANDSCAPE()) { const r = $('nowBoard').getBoundingClientRect(); return r.height ? Math.round(r.top + (r.height - 24) / 2) : safeTop + 70; }
    let b = 0; for (const id of ['hud', 'billBanner', 'tdBanner']) { const e = $(id); if (!e || e.hidden) continue; const r = e.getBoundingClientRect(); if (r.height) b = Math.max(b, r.bottom); }
    return (b || safeTop + 120) + 6;
  }

  // ---------- loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    AU.setRain(!!S && S.mode === 'play' && S.rain > 0); AU.setMusicActive(!!S && (S.mode === 'play' || S.mode === 'rescue' || S.mode === 'dying'));
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
  function start() { ac(); AU.setFast(false); newGame(); $('score').textContent = '0'; $('best').textContent = 'Best ' + best(); show(null); $('rescue').hidden = true; $('billBanner').hidden = true; $('tdBanner').hidden = true; updateAdhere(); host(0, 'cheer', 'Let\u2019s stack!'); }
  function pause() { if (!S || S.mode !== 'play') return; S.mode = 'pause'; show('pause'); }
  function resume() { if (!S || S.mode !== 'pause') return; S.mode = 'play'; last = performance.now(); show(null); }
  function gameOver() { $('rescue').hidden = true; $('billBanner').hidden = true; $('tdBanner').hidden = true;
    S.mode = 'over'; const b = best(), nb = S.score > b; if (nb) store.set(LS.best, S.score); if (nb && b > 0) sfx.newBest(); else sfx.over();
    $('finalScore').textContent = S.score;
    $('finalMeta').textContent = `${S.height} boards · ${S.skids} skid${S.skids === 1 ? '' : 's'}${S.trucks ? ' · ' + S.trucks + ' truckload' + (S.trucks > 1 ? 's' : '') : ''} · ${S.perfects} perfect${S.perfects === 1 ? '' : 's'} · best ${Math.max(b, S.score)}`;
    $('newBest').hidden = !nb;
    { // v8 rank: the highest rank reached this run (score AND trim quality); best rank kept on this device
      const ri = Math.max(S.rank, rankFor(S.score, trimPct())), k = RANKS[ri], bestR = Math.max(ri, store.get(LS.rank, 0)), newR = ri > store.get(LS.rank, 0); store.set(LS.rank, bestR);
      $('rankIcon').textContent = k.icon; $('rankName').textContent = k.name; $('rankBox').dataset.rank = ri;
      const nx = RANKS[ri + 1];
      $('rankLbl').textContent = 'Rank' + (newR && ri > 0 ? ' · new best!' : ` · best: ${RANKS[bestR].name}`);
      $('rankMeta').textContent = `Trim quality ${trimPct()}%` + (nx ? ` · Next: ${nx.name} at ${nx.score} pts + ${nx.trim}%` : ' · Top rank!');
    }
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
  function setMute(v) { muted = v; store.set(LS.mute, v); AU.setMuted(v); for (const id of ['btnMute', 'btnMuteStart']) { const b = $(id); if (!b) continue; b.textContent = v ? '🔇' : '🔊'; b.setAttribute('aria-label', v ? 'Unmute sound' : 'Mute sound'); b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.classList.toggle('off', v); } }
  function setMusic(v) { musicOn = v; store.set(LS.music, v); AU.setMusic(v); for (const id of ['btnMusic', 'btnMusicStart']) { const b = $(id); if (!b) continue; b.classList.toggle('off', !v); b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.setAttribute('aria-label', v ? 'Music on' : 'Music off'); } }
  $('btnMute').onclick = $('btnMuteStart').onclick = () => { ac(); setMute(!muted); if (!muted) sfx.ui(); };
  $('btnMusic').onclick = $('btnMusicStart').onclick = () => { ac(); setMusic(!musicOn); sfx.ui(); };
  $('btnAdhere').onclick = toggleAdhere; $('btnRescueYes').onclick = () => rescue(true); $('btnRescueNo').onclick = () => rescue(false); $('btnPause').onclick = pause; $('btnResume').onclick = resume; $('btnRestart').onclick = start; $('btnPlay').onclick = start; $('btnRetry').onclick = start;
  $('btnHome').onclick = $('btnHome2').onclick = () => { S = null; renderCards(); show('start'); };
  $('btnCollStart').onclick = () => openColl('start'); $('btnCollPause').onclick = () => openColl('pause'); $('btnCollOver').onclick = () => openColl('over'); $('btnCollClose').onclick = closeColl;
  $('btnLegalStart').onclick = () => openLegal('start'); $('btnLegalPause').onclick = () => openLegal('pause'); $('btnLegalClose').onclick = closeLegal;

  // ---------- boot ----------
  function boot() {
    resize(); window.addEventListener('resize', resize); if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
    window.addEventListener('orientationchange', () => setTimeout(resize, 200));
    // unlock WebAudio on the first tap/click/key; block long-press menus and double-tap zoom on controls
    // first pointerdown/touch/key anywhere unlocks audio (iOS: audioSession 'playback' or a silent <audio> loop so the ring switch doesn't mute it)
    const unlock = () => { ac(); if (AU.running) for (const ev of ['pointerdown', 'touchend', 'keydown']) window.removeEventListener(ev, unlock, true); };
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, true);
    document.addEventListener('click', e => { const b = e.target.closest('button'); if (b && !['btnMute', 'btnMuteStart', 'btnMusic', 'btnMusicStart'].includes(b.id)) sfx.ui(); }, true);
    document.addEventListener('contextmenu', e => { if (!e.target.closest('#coll .desc')) e.preventDefault(); });
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
    document.addEventListener('touchmove', e => { if (!e.target.closest('.screen.scroll')) e.preventDefault(); }, { passive: false });
    setMute(muted); setMusic(musicOn);
    for (const id of ['startLogo', 'overLogo']) { $(id).src = CFG.BRAND_LOGO; $(id).alt = CFG.BRAND_NAME + ' logo'; }
    { const names = PRODUCTS.map(p => p.name); $('legalProducts').textContent = names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1]; }
    $('footBrand').textContent = `· Featuring ${CFG.BRAND_NAME} foam boards`;
    drawHostsInto($('startHosts'), 'present'); renderCards(); booted = true; sizeBottom(); layoutBottom(); spotRender(); spotSchedule();
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
    computeDrop, computeDropBom, RANKS, rankFor, trimPct, startWeather, endWeather, startBom, endBom, promote: i => promote(i), completeSkid: () => completeSkid(), startTD: () => startTD(), endTD: () => endTD(), bonusMult, updateTruckHud, wxSpeed: () => wxSpeed(), T, geo, audio: AU, startBill, endBill, boost, updateBill, boards: BOARDS, toggleAdhere, earnAdhere: () => earnAdhere(), rescue, get S() { return S; }, start, drop, pause, resume, products: PRODUCTS,
    setMovingX(x) { if (S && S.moving) S.moving.x = x; }, setProduct(id, gl) { if (S && S.moving) { const p = productById[id]; S.moving.p = p; S.moving.look = lookFor(p); const g = (gl && p.gauges.find(x => x.label === gl)) || p.gauges[0]; S.moving.gauge = g; S.moving.t = thickFor(g); S.lineName = p.name + ' · ' + g.label; S.moving.speed = speedFor(p); } },
    spot: { next: spotAdvance, render: spotRender, durationFor, get id() { return curP().id; }, get fact() { return curF() && curF().id; }, get shownAt() { return spot.shownAt; }, history: spot.history, bags: () => ({ p: pBag.st, f: fBag.st }) }, facts: FACTS, layoutBottom,
    finishExtrusion() { return new Promise(r => { const c = () => (!S || !S.moving || !S.moving.extrude) ? r() : requestAnimationFrame(c); c(); }); },
    freeze() { if (S && S.moving) S.moving.speed = 0; },
    align() { // screen-space alignment snapshot (scene x offset applied) for the v6 anchor tests
      if (!S || !S.hostRects || S.palletTopY == null) return null; const ox = sceneX(), pr = S.palletRect;
      const tp = S.stack[S.stack.length - 1];
      return { land: LANDSCAPE(), workLevel: workLevel(), topY: sy(tp.y + tp.t), W, H, cam: S.cam, camT: S.camT, floors: S.stack.length - 1, palletTop: S.palletTopY, floorY: S.floorY, palletL: pr.x + ox, palletR: pr.x + pr.w + ox, bottomUI, slot1: S.slot1,
        hosts: S.hostRects.map(h => ({ x: h.x + h.ox, w: h.w, mid: h.y + h.h / 2, top: h.y })), stackL: S.stack[S.stack.length - 1].x + ox };
    }, collection: () => [...collection],
  };
  boot();
})();
