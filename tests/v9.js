/* v9 tests: skids (T.SKID_MAX), truckloads every 12 skids (bonus multiplier 1 + 0.5n), truck HUD, Team Drivers (after the first
   truckload, ×1.5 for 8 boards, never with Bill/BOM), bonus math, new rank thresholds, compact rank-up pill, sw fbs-v9, no errors.
   Run: node tests/v9.js [iphone15|se|pixel7|galaxy]  (server on :8833) */
const pw = require('/workspace/tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8833/';
const results = []; let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; results.push('PASS ' + n); } else { fail++; results.push('FAIL ' + n + (info !== undefined ? ' :: ' + JSON.stringify(info).slice(0, 700) : '')); } };
const wait = (p, ms) => p.waitForTimeout(ms);
// wait for a moving board, drop it centred (+off), then wait for the next board and the camera
const land = (p, off = 0, prod = null) => p.evaluate(async ([off, prod]) => {
  const F = window.__fbs, ready = () => new Promise(r => { let k = 0; const c = () => (F.S.moving || ++k > 400 ? r() : requestAnimationFrame(c)); c(); });
  await ready(); await F.finishExtrusion(); if (prod) F.setProduct(prod); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving, bm = F.bonusMult();
  F.setMovingX(tp.x + (tp.w - m.w) / 2 + off); F.drop(); const lp = S.stack[S.stack.length - 1].p, id = lp && (lp.trait && lp.trait.id), pid = lp && lp.id, pts = S.lastPts;
  await ready(); await F.finishExtrusion(); F.freeze();
  await new Promise(r => { let k = 0; const c = () => (Math.abs(F.S.cam - F.S.camT) < 0.3 || ++k > 300 ? r() : requestAnimationFrame(c)); c(); });
  const a = F.align(); return { pts, id, pid, bm, topY: a.topY, palletTop: a.palletTop, floors: a.floors, skids: S.skids, trucks: S.trucks, td: S.td && S.td.left, score: S.score };
}, [off, prod]);
const frames = (p, n = 20) => p.evaluate(n => new Promise(r => { let k = 0; const c = () => (++k >= n ? r() : requestAnimationFrame(c)); c(); }), n);
const hudCheck = p => p.evaluate(() => {
  const R = e => e.getBoundingClientRect(), hit = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
  const th = document.getElementById('truckHud'), t = R(th), sc = document.getElementById('score'), rg = document.createRange(); rg.selectNodeContents(sc); const st = rg.getBoundingClientRect();
  const btns = [...document.querySelectorAll('button')].filter(e => !e.hidden && e.offsetParent !== null && R(e).width).map(e => [e.id, R(e)]);
  const cs = getComputedStyle(th);
  return { vis: cs.display !== 'none' && cs.visibility !== 'hidden' && t.width > 20 && t.height > 10, onScreen: t.left >= 0 && t.top >= 0 && t.right <= innerWidth && t.bottom <= innerHeight, topLeft: innerWidth < 380 && innerHeight > innerWidth ? t.top < 160 && Math.abs(t.left + t.width / 2 - innerWidth / 2) < 4 : t.left < innerWidth / 3 && t.top < 80, // narrow portrait: centred pill row
    over: btns.filter(([, r]) => hit(r, t)).map(([id]) => id).concat(hit(st, t) ? ['score-digits'] : []), svg: !!document.querySelector('#truckRow svg'), row: document.getElementById('truckRow').textContent, rowHidden: document.getElementById('truckRow').hidden, skid: document.getElementById('skidRow').textContent };
});
async function suite(bt, dev, tag) {
  const b = await pw[bt].launch(); const T = n => `${tag}: ${n}`;
  const errs = [];
  const mk = async (land, url) => { const o = { ...pw.devices[dev] }; delete o.defaultBrowserType; if (land) o.viewport = { width: o.viewport.height, height: o.viewport.width };
    const p = await (await b.newContext(o)).newPage(); const l = land ? 'land' : 'port';
    p.on('pageerror', e => errs.push(l + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(l + ' console: ' + m.text()); });
    await p.goto(BASE + url); await wait(p, 500); await p.click('#btnPlay'); await wait(p, 300); return p; };

  for (const L of [false, true]) {
    const o = L ? 'landscape' : 'portrait';
    // ---------- skid completes at T.SKID_MAX, fresh pallet at the same level ----------
    const p = await mk(L, '?seed=7&nospot&nobill&skidmax=15');
    const a0 = await p.evaluate(() => window.__fbs.align());
    const rows = []; for (let i = 0; i < 14; i++) rows.push(await land(p, [0, 2, -2][i % 3]));
    const pre = await p.evaluate(() => ({ max: window.__fbs.T.SKID_MAX, skids: window.__fbs.S.skids, floors: window.__fbs.S.stack.length - 1, score: window.__fbs.S.score }));
    const r15 = await p.evaluate(async () => { const F = window.__fbs; await F.finishExtrusion(); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2); const s0 = S.score; F.drop();
      return { gain: S.score - s0, board: S.lastPts, skids: S.skids, stack: S.stack.length, base: !!S.stack[0].base, out: !!S.skidOut, outN: S.skidOut && S.skidOut.stack.length, moving: !!S.moving, row: document.getElementById('skidRow').textContent, w: S.stack[0].w }; });
    ok(T(`${o}: T.SKID_MAX = 15; no skid before board 15`), pre.max === 15 && pre.skids === 0 && pre.floors === 14, pre);
    ok(T(`${o}: board 15 completes the skid: it's carried off (16 layers incl. pallet), a fresh pallet starts, HUD shows Skid 2/12`), r15.skids === 1 && r15.stack === 1 && r15.base && r15.out && r15.outN === 16 && !r15.moving && r15.row === 'Skid 2/12', r15);
    ok(T(`${o}: skid bonus = 10 (board points + 10 at ×1)`), r15.gain === r15.board + 10, r15);
    await wait(p, 1300);
    const ns = await p.evaluate(() => { const F = window.__fbs, a = F.align(); return { moving: !!F.S.moving, out: !!F.S.skidOut, palletTop: a.palletTop, topY: a.topY, cam: F.S.cam, w: F.S.moving && F.S.moving.w }; });
    ok(T(`${o}: after the forklift swap a new board spawns over the fresh pallet`), ns.moving && !ns.out && ns.cam < 1, ns);
    ok(T(`${o}: the fresh pallet sits at the opening level (±2px)`), Math.abs(ns.palletTop - a0.palletTop) <= 2 && Math.abs(ns.topY - a0.palletTop) <= 2, { ns, start: a0.palletTop });
    const n2 = []; for (let i = 0; i < 3; i++) n2.push(await land(p));
    if (L) ok(T(`${o}: stacking on the new skid keeps the working level (±3px)`), n2.every(r => Math.abs(r.topY - a0.palletTop) <= 3), n2.map(r => r.topY));
    else ok(T(`${o}: new skid builds up from the fresh pallet`), n2[2].floors === 3 && n2[2].topY < a0.palletTop, n2.map(r => [r.floors, r.topY]));
    const h0 = await hudCheck(p);
    ok(T(`${o}: truck HUD top-left (narrow portrait: centred pill), on screen, Skid row visible, truck row hidden before any truckload`), h0.vis && h0.onScreen && h0.topLeft && h0.rowHidden && h0.skid === 'Skid 2/12', h0);

    // ---------- truckloads: every 12 skids, multiplier 1 + 0.5n, skid/truck bonuses ----------
    const tk = await p.evaluate(() => { const F = window.__fbs, S = F.S, out = [];
      for (let i = 2; i <= 25; i++) { const s0 = S.score, m0 = F.bonusMult(); F.completeSkid(); out.push({ n: S.skids, trucks: S.trucks, m: F.bonusMult(), gain: S.score - s0, m0 }); }
      return out; });
    const at = n => tk.find(x => x.n === n);
    ok(T(`${o}: no truckload before skid 12; truckload 1 at skid 12, 2 at 24`), at(11).trucks === 0 && at(12).trucks === 1 && at(23).trucks === 1 && at(24).trucks === 2 && at(25).trucks === 2, tk.map(x => [x.n, x.trucks]));
    ok(T(`${o}: multiplier = 1 + 0.5 × truckloads (1 → 1.5 → 2)`), at(11).m === 1 && at(12).m === 1.5 && at(24).m === 2, tk.map(x => [x.n, x.m]));
    ok(T(`${o}: bonuses: skid 10×mult, truckload +50×new mult (skid 12: 10+75=85, skid 13: 15, skid 24: 15+100=115)`), at(11).gain === 10 && at(12).gain === 85 && at(13).gain === 15 && at(24).gain === 115 && at(25).gain === 20, tk.map(x => [x.n, x.gain]));
    await wait(p, 1300); await land(p); await wait(p, 300);
    const h1 = await hudCheck(p);
    ok(T(`${o}: truck HUD shows the truck icon, ×2 truckloads and x2 multiplier`), h1.vis && !h1.rowHidden && h1.svg && /×2/.test(h1.row) && /x2\b/.test(h1.row), h1);
    ok(T(`${o}: truck HUD does not overlap any button or the score digits`), h1.over.length === 0, h1);
    await p.evaluate(() => { const S = window.__fbs.S; S.score = 12345; document.getElementById('score').textContent = S.score; }); await wait(p, 100);
    const h2 = await hudCheck(p);
    ok(T(`${o}: a 5-digit score still clears the truck HUD (score digits shrink if needed)`), h2.over.length === 0, h2);
    await p.close();

    // ---------- bonus math: same seed + placements, with and without a truckload ----------
    const pa = await mk(L, '?seed=11&nospot&nobill'), pb = await mk(L, '?seed=11&nospot&nobill');
    await pb.evaluate(() => { const F = window.__fbs; F.S.trucks = 1; F.updateTruckHud(); });
    const offs = [0, 0, 0, 30, 0, 0, 0, 0, -25, 0, 0, 0, 0, 0, 0, 0];
    const A = [], B = []; const prods = await pa.evaluate(() => window.__fbs.products.filter(x => x.gauges && x.gauges.length && x.gauges[0].inches).map(x => x.id));
    for (let i = 0; i < offs.length; i++) { const pr = prods[i % prods.length]; A.push(await land(pa, offs[i], pr)); B.push(await land(pb, offs[i], pr)); }
    const exp = (a, m) => { const base = a.id === 'heavy-duty' ? 2 : 1; return a.pts > base ? base + Math.round((a.pts - base) * m) : a.pts; };
    const bad = A.map((a, i) => [a.pts, B[i].pts, exp(a, 1.5), a.id]).filter(([, bp, e]) => bp !== e);
    ok(T(`${o}: bonus math: base points unmultiplied, only the bonus part ×1.5 (12 boards, identical runs)`), A.some(a => a.pts > 2) && A.some(a => a.pts <= 2) && bad.length === 0 && A.every((a, i) => a.pid === B[i].pid), { bad, A: A.map(a => a.pts), B: B.map(b => b.pts) });
    await pa.close();

    // ---------- Team Drivers ----------
    await pb.evaluate(() => window.__fbs.startTD()); await wait(pb, 120);
    const td0 = await pb.evaluate(() => { const F = window.__fbs, e = document.getElementById('tdBanner'); return { td: F.S.td && F.S.td.left, m: F.bonusMult(), banner: !e.hidden, text: e.textContent, hud: document.getElementById('truckRow').textContent, glow: document.getElementById('truckHud').classList.contains('td') }; });
    ok(T(`${o}: Team Drivers: ×1.5 on the truck multiplier (1.5 → 2.25), banner + HUD indicator`), td0.td === 8 && td0.m === 2.25 && td0.banner && /TEAM DRIVERS/.test(td0.text) && /2\.25/.test(td0.text) && /x2\.25/.test(td0.hud) && td0.glow, td0);
    const tdr = []; for (let i = 0; i < 8; i++) tdr.push(await land(pb));
    const td1 = await pb.evaluate(() => ({ td: window.__fbs.S.td, m: window.__fbs.bonusMult(), banner: !document.getElementById('tdBanner').hidden }));
    ok(T(`${o}: Team Drivers lasts 8 boards, then the multiplier returns to 1.5 and the banner hides`), tdr.slice(0, 7).every(r => r.td > 0) && tdr.every(r => r.bm === 2.25) && !td1.td && td1.m === 1.5 && !td1.banner, { left: tdr.map(r => r.td), bm: tdr.map(r => r.bm), td1 });
    await pb.evaluate(() => { const F = window.__fbs; F.S.trucks = 2; F.startTD(); }); await wait(pb, 60);
    ok(T(`${o}: Team Drivers on 2 truckloads: 2 → 3`), await pb.evaluate(() => window.__fbs.bonusMult()) === 3);
    await pb.evaluate(() => window.__fbs.endTD());
    // ---------- compact rank-up pill ----------
    await pb.evaluate(() => { const F = window.__fbs; F.S.trucks = 1; F.updateTruckHud(); F.startTD(); F.promote(4); }); await wait(pb, 350);
    const pr = await pb.evaluate(() => { const F = window.__fbs, S = F.S, a = F.align(), r = S.promoRect, td = document.getElementById('tdBanner').getBoundingClientRect(), tdh = document.getElementById('tdBanner').hidden;
      const hit = (x, y) => !(x.x + x.w <= y.left || x.x >= y.right || x.y + x.h <= y.top || x.y >= y.bottom);
      return { r, topY: a.topY, mt: S.moving ? S.moving.t : 0, W: innerWidth, overTD: !tdh && hit(r, td), land: a.land }; });
    ok(T(`${o}: rank-up is a compact pill (≤ 26px tall, ≤ 75% of the width)`), pr.r && pr.r.h <= 26 && pr.r.w <= pr.W * 0.75, pr);
    ok(T(`${o}: rank-up pill sits above the stack and the moving board`), pr.r && pr.r.y + pr.r.h <= pr.topY - pr.mt - 4, pr);
    ok(T(`${o}: rank-up pill doesn't overlap the Team Drivers banner`), !pr.overTD, pr);
    await wait(pb, 1600);
    ok(T(`${o}: rank-up pill is gone after ~1.6 s`), await pb.evaluate(() => !window.__fbs.S.promo && document.getElementById('nowBoard').style.visibility === ''));
    await pb.evaluate(() => window.__fbs.endTD());
    await pb.close();
  }

  // ---------- Team Drivers scheduling (events on) ----------
  const pe = await mk(false, '?seed=5&nospot&events');
  await pe.evaluate(() => { const S = window.__fbs.S; S.billNext = S.bomNext = Infinity; window.__fbs.endWeather(); });
  const s0 = await pe.evaluate(() => ({ next: window.__fbs.S.tdNext, max: window.__fbs.T.SKID_MAX }));
  await pe.evaluate(() => { window.__fbs.S.tdNext = 0; }); await frames(pe, 30);
  const s1 = await pe.evaluate(() => ({ td: window.__fbs.S.td, count: window.__fbs.S.tdCount }));
  ok(T('Team Drivers never fires before the first truckload (events on, timer forced due)'), s0.next === Infinity && !s1.td && s1.count === 0 && s0.max === 15, { s0, s1 });
  const s2 = await pe.evaluate(() => { const F = window.__fbs, S = F.S; for (let i = 0; i < 12; i++) F.completeSkid(); return { trucks: S.trucks, d: S.tdNext - S.playT }; });
  ok(T('first truckload schedules Team Drivers 25–45 s out'), s2.trucks === 1 && s2.d >= 25 - 0.1 && s2.d <= 45 + 0.1, s2);
  await wait(pe, 1300);
  await pe.evaluate(() => { const F = window.__fbs; F.startBill(); F.S.tdNext = 0; }); await frames(pe, 30);
  const s3 = await pe.evaluate(() => !!window.__fbs.S.td || !window.__fbs.S.bill);
  await pe.evaluate(() => { window.__fbs.S.tdNext = Infinity; window.__fbs.endBill(); }); await pe.waitForFunction(() => !window.__fbs.S.bill, null, { timeout: 5000 });
  await pe.evaluate(() => { window.__fbs.startBom(); window.__fbs.S.tdNext = 0; }); await frames(pe, 30);
  const s4 = await pe.evaluate(() => ({ td: !!window.__fbs.S.td, bom: !!window.__fbs.S.bom }));
  await pe.evaluate(() => window.__fbs.endBom()); await frames(pe, 30);
  const s5 = await pe.evaluate(() => ({ td: !!window.__fbs.S.td, count: window.__fbs.S.tdCount }));
  ok(T('Team Drivers waits while Bill or a BOM is running, then starts on its own'), !s3 && !s4.td && s4.bom && s5.td && s5.count === 1, { s3, s4, s5 });
  await pe.evaluate(() => { const S = window.__fbs.S; S.billNext = 0; S.bomNext = 0; S.floors = Math.max(S.floors, 30); });
  for (let i = 0; i < 3; i++) await land(pe);
  const s6 = await pe.evaluate(() => ({ td: !!window.__fbs.S.td, bill: !!window.__fbs.S.bill, bom: !!window.__fbs.S.bom }));
  ok(T('Bill and BOM stay out while Team Drivers runs (both timers forced due)'), s6.td && !s6.bill && !s6.bom, s6);
  await pe.close();

  // ---------- ranks + sw ----------
  const pz = await mk(false, '?seed=7&nospot&nobill');
  const rk = await pz.evaluate(() => { const F = window.__fbs, R = F.rankFor; return { th: F.RANKS.map(r => [r.name, r.score, r.trim]), a: R(24, 100), b: R(25, 55), c: R(649, 100), d: R(650, 86), e: R(1199, 100), f: R(1200, 91), g: R(1200, 92) }; });
  ok(T('ranks: v9 thresholds (25/55, 75/65, 175/72, 350/80, 650/86, 1200/92)'), JSON.stringify(rk.th) === JSON.stringify([['Temp', 0, 0], ['Material Handler', 25, 55], ['Lead', 75, 65], ['Shift Supervisor', 175, 72], ['Manager', 350, 80], ['Engineer', 650, 86], ['Board Member', 1200, 92]]), rk.th);
  ok(T('ranks: boundaries inclusive, trim still gates (1200 @91% = Engineer)'), rk.a === 0 && rk.b === 1 && rk.c === 4 && rk.d === 5 && rk.e === 5 && rk.f === 5 && rk.g === 6, rk);
  ok(T('service worker cache is fbs-v9'), /'fbs-v9'/.test(await pz.evaluate(() => fetch('sw.js').then(r => r.text()))));
  ok(T('no console/page errors'), errs.length === 0, errs);
  await b.close();
}
(async () => {
  const w = process.argv[2];
  if (!w || w === 'iphone15') await suite('webkit', 'iPhone 15', 'iphone15');
  if (!w || w === 'se') await suite('webkit', 'iPhone SE', 'iphoneSE');
  if (!w || w === 'pixel7') await suite('chromium', 'Pixel 7', 'pixel7');
  if (!w || w === 'galaxy') await suite('chromium', 'Galaxy S8', 'galaxyS8');
  console.log(results.join('\n')); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
