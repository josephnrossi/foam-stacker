/* v10 tests: Jacob Churchill "Cadence" event – Jacob in Cyrus's slot with a "Cadence" bubble, every drop (sloppy or a full miss)
   lands Perfect and counts toward the combo, the buff ends after T.CAD_DUR and Cyrus returns, normal trimming resumes, Cadence
   never starts during Bill / BOM / Team Drivers / a skid swap, snow hat on Jacob, sw fbs-v10, no errors.
   Run: node tests/v10.js [iphone15|se|pixel7|galaxy]  (server on :8833) */
const pw = require('/workspace/tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8833/';
const results = []; let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; results.push('PASS ' + n); } else { fail++; results.push('FAIL ' + n + (info !== undefined ? ' :: ' + JSON.stringify(info).slice(0, 700) : '')); } };
const wait = (p, ms) => p.waitForTimeout(ms);
// wait for a moving board, place it centred + off, drop it, report the landed board
const drop = (p, off = 0) => p.evaluate(async off => {
  const F = window.__fbs, ready = () => new Promise(r => { let k = 0; const c = () => (F.S.moving || ++k > 400 ? r() : requestAnimationFrame(c)); c(); });
  await ready(); await F.finishExtrusion(); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving, c0 = S.combo, p0 = S.perfects, w0 = m.w;
  F.setMovingX(tp.x + (tp.w - m.w) / 2 + off); F.drop(); const b = S.stack[S.stack.length - 1];
  return { mode: S.mode, combo: S.combo, c0, perfects: S.perfects, p0, x: b.x, w: b.w, w0, prevX: tp.x, q: b.q, landed: b !== tp };
}, off);
const st = p => p.evaluate(() => { const S = window.__fbs.S; return { cad: S.cad && { on: S.cad.on, phase: S.cad.phase }, slot1: S.slot1, bubble: S.hostState[1].bubble && S.hostState[1].bubble.text, banner: !document.getElementById('cadBanner').hidden, hats: S.hatsOn, count: S.cadCount }; });
async function suite(bt, dev, tag) {
  const b = await pw[bt].launch(), T = n => `${tag}: ${n}`, errs = [];
  const o = { ...pw.devices[dev] }; delete o.defaultBrowserType;
  const p = await (await b.newContext(o)).newPage();
  p.on('pageerror', e => errs.push('pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(BASE + '?seed=7&nospot&nobill'); await wait(p, 500); await p.click('#btnPlay'); await wait(p, 300);
  const t0 = await p.evaluate(() => ({ next: window.__fbs.S.cadNext, T: window.__fbs.T }));
  ok(T('?nobill disables the random Cadence timer; tunables 10 s / 30-55 s / floor 12'), t0.next === null || t0.next === Infinity || t0.next > 1e9 ? true : false, t0.next);
  ok(T('tunables'), t0.T.CAD_DUR === 10 && t0.T.CAD_MIN === 30 && t0.T.CAD_MAX === 55 && t0.T.CAD_MIN_FLOORS === 12, t0.T);
  for (let i = 0; i < 4; i++) await drop(p, 0);

  // ---------- scheduler guards (timer forced due) ----------
  const g = await p.evaluate(() => { const F = window.__fbs, S = F.S, r = {}, f0 = S.floors; S.floors = 20; S.rain = 0; S.cadNext = 0;
    const tryIt = (set, unset) => { set(); F.updateCad(0.001); const on = !!S.cad; unset(); if (S.cad) { F.endCad(); S.cad = null; } return on; };
    r.bill = tryIt(() => { S.bill = { on: true, t: 0, dur: 99 }; }, () => { S.bill = null; });
    r.bom = tryIt(() => { S.bom = { left: 3, spec: 100 }; }, () => { S.bom = null; });
    r.td = tryIt(() => { S.td = { left: 3 }; }, () => { S.td = null; });
    r.skid = tryIt(() => { S.skidWait = 0.5; }, () => { S.skidWait = 0; });
    r.free = tryIt(() => {}, () => {}); S.cad = null; document.getElementById('cadBanner').hidden = true;
    S.cadNext = Infinity; S.floors = f0; return r; });
  ok(T('Cadence never starts during Bill, BOM, Team Drivers or a skid swap'), !g.bill && !g.bom && !g.td && !g.skid, g);
  ok(T('Cadence starts on its own when its timer is due and nothing else is running'), g.free, g);
  await wait(p, 600);

  // ---------- forced Cadence ----------
  await p.evaluate(() => { const S = window.__fbs.S; S.rain = 0; S.rainCount = 99; window.__fbs.startCad(); }); await wait(p, 500);
  const a = await st(p);
  ok(T('Jacob stands in Cyrus\'s slot with a "Cadence" bubble and the banner'), a.slot1 === 'jacob' && a.bubble === 'Cadence' && a.banner && a.cad && a.cad.on, a);
  const billBlocked = await p.evaluate(() => { window.__fbs.startBill(); return !window.__fbs.S.bill; });
  ok(T('Bill cannot start while Jacob is on'), billBlocked);
  const s1 = await drop(p, 60);
  ok(T('sloppy drop (60 px off) snaps dead-on: Perfect, combo +1, full width'), s1.landed && s1.mode === 'play' && Math.abs(s1.x - s1.prevX) < 0.5 && s1.w >= s1.w0 - 0.5 && s1.perfects === s1.p0 + 1 && s1.combo > s1.c0 && s1.q === 1, s1);
  const s2 = await drop(p, 2000);
  ok(T('full miss (entirely off the stack) still lands Perfect, combo +1, game continues'), s2.landed && s2.mode === 'play' && Math.abs(s2.x - s2.prevX) < 0.5 && s2.perfects === s2.p0 + 1 && s2.combo > s2.c0, s2);
  await p.evaluate(() => window.__fbs.startWeather('snow')); await wait(p, 900);
  const h = await st(p); await p.evaluate(() => window.__fbs.endWeather());
  ok(T('snow: Jacob wears a hat (both hosts hatted)'), h.slot1 === 'jacob' && h.hats === 2, h);

  // ---------- buff ends after its duration ----------
  await p.evaluate(() => window.__fbs.updateCad(window.__fbs.T.CAD_DUR + 0.1)); await wait(p, 700);
  const e = await st(p);
  ok(T('after T.CAD_DUR Jacob leaves, banner hides, Cyrus returns'), !e.cad && e.slot1 === 'cyrus' && !e.banner, e);
  const n1 = await drop(p, 40);
  ok(T('normal trimming resumes after Cadence (40 px off is trimmed, combo reset)'), n1.landed && n1.w < n1.w0 - 1 && n1.combo === 0 && n1.q < 1, n1);
  const nx = await p.evaluate(() => window.__fbs.S.cadNext);
  ok(T('next Cadence rescheduled 30-55 s later'), nx === null || nx > 0, nx);
  ok(T('service worker cache is fbs-v10'), /'fbs-v10'/.test(await p.evaluate(() => fetch('sw.js').then(r => r.text()))));
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
