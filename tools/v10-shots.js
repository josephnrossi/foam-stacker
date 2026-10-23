/* v10 mockup screenshots: Jacob Churchill "Cadence" event. node tools/v10-shots.js (server on :8833) */
const pw = require('/workspace/tools/node_modules/playwright'), fs = require('fs');
const BASE = 'http://localhost:8833/', OUT = __dirname + '/../shots/', errs = [], info = {};
async function page(b, dev, land) {
  const o = { ...pw.devices[dev] }; delete o.defaultBrowserType; if (land) o.viewport = { width: o.viewport.height, height: o.viewport.width };
  const p = await (await b.newContext(o)).newPage(); const tag = dev + (land ? ' land' : '');
  p.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' console: ' + m.text()); });
  return p;
}
const W = ms => new Promise(r => setTimeout(r, ms));
const ready = (p, off = 0) => p.evaluate(async off => { const F = window.__fbs; await new Promise(r => { let k = 0; const c = () => (F.S.moving || ++k > 400 ? r() : requestAnimationFrame(c)); c(); });
  await F.finishExtrusion(); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2 + off); }, off);
const place = async (p, off = 0) => { await ready(p, off); await p.evaluate(() => window.__fbs.drop()); };
async function stack(p, n) { const o = [0, 2, -2, 0, 3, -1]; for (let i = 0; i < n; i++) { await place(p, o[i % o.length]); await W(40); } }
const snap = p => p.evaluate(() => { const S = window.__fbs.S, tp = S.stack[S.stack.length - 1], pv = S.stack[S.stack.length - 2];
  return { score: S.score, combo: S.combo, perfects: S.perfects, cadSnaps: S.cadSnaps, slot1: S.slot1, topX: Math.round(tp.x), prevX: Math.round(pv.x), topW: Math.round(tp.w), prevW: Math.round(pv.w), q: tp.q, banner: !document.getElementById('cadBanner').hidden, bubble: S.hostState[1].bubble && S.hostState[1].bubble.text, hats: S.hatsOn }; });

async function sprites(b) {
  const p = await page(b, 'iPhone 15'); await p.goto(BASE + '?nobill'); await W(500);
  const d = await p.evaluate(() => { const S = window.FBS_SPRITES, o = {};
    for (const id of ['evan', 'jacob', 'cyrus', 'bill']) for (const f of [0, 2]) {
      const c = S.frameCanvas({ id }, f), h = S.hatCanvas({ id }, f), big = document.createElement('canvas'); big.width = 32 * 10; big.height = 54 * 10; const x = big.getContext('2d'); x.imageSmoothingEnabled = false;
      x.drawImage(c, 0, 60, 320, 480); o[id + f] = big.toDataURL();
      const x2 = big.getContext('2d'); x2.clearRect(0, 0, 320, 540); x2.drawImage(c, 0, 60, 320, 480); x2.drawImage(h, 0, 0, 320, 160); o[id + f + 'hat'] = big.toDataURL(); }
    return o; });
  for (const [k, v] of Object.entries(d)) fs.writeFileSync('/tmp/v10/' + k + '.png', Buffer.from(v.split(',')[1], 'base64'));
  await p.close();
}
async function portrait(b) {
  const p = await page(b, 'iPhone 15'), k = info.portrait = {};
  await p.goto(BASE + '?seed=7&nospot&nobill'); await W(600); await p.click('#btnPlay'); await W(300);
  await stack(p, 13); await W(400);
  // scheduler guards (forced clock): no Cadence while Bill is on, while BOM is on, or right before a skid swap
  k.guards = await p.evaluate(() => { const F = window.__fbs, S = F.S, r = {};
    S.cadNext = 0; S.bill = { on: true, t: 0, dur: 1 }; F.updateCad(0.01); r.withBill = !!S.cad; S.bill = null;
    S.bom = { left: 3, spec: 100 }; F.updateCad(0.01); r.withBom = !!S.cad; S.bom = null;
    S.td = { left: 3 }; F.updateCad(0.01); r.withTD = !!S.cad; S.td = null;
    S.skidWait = 0.5; F.updateCad(0.01); r.duringSkidSwap = !!S.cad; S.skidWait = 0;
    S.guestCool = S.playT + 5; F.updateCad(0.01); r.inGuestGap = !!S.cad; S.guestCool = 0;
    S.cadNext = Infinity; return r; });
  await p.evaluate(() => { const S = window.__fbs.S; S.rain = 0; S.rainDrops = []; S.rainCount = 99; window.__fbs.startCad(); }); await W(500); await ready(p, 0); await W(250);
  k.billBlockedDuringCad = await p.evaluate(() => { const F = window.__fbs; F.startBill(); return !!F.S.bill; });
  await p.screenshot({ path: OUT + 'v10-cadence-arrive.png' }); k.arrive = await snap(p);
  // sloppy drop: 45 px off to the right
  const s0 = await snap(p); await ready(p, 95); await p.evaluate(() => window.__fbs.drop()); await W(70);
  await p.screenshot({ path: OUT + 'v10-cadence-snap.png' }); k.sloppy = { before: s0, after: await snap(p) };
  // a clean miss (entirely past the stack) still lands Perfect
  await W(300); await place(p, 400); await W(200); k.fullMiss = { ...(await snap(p)), mode: await p.evaluate(() => window.__fbs.S.mode) };
  await W(300); await ready(p, -30); await W(100);
  await p.evaluate(() => window.__fbs.endCad()); await W(160);
  await p.screenshot({ path: OUT + 'v10-cadence-exit.png' }); k.exit = await snap(p);
  await W(600); k.after = await snap(p);
  // back to normal: a sloppy drop now gets trimmed
  await p.evaluate(() => window.__fbs.drop()); await W(100); k.normalSloppy = await snap(p);
  await p.close();
}
async function landscape(b, dev, tag) {
  const p = await page(b, dev, true), k = info[tag] = {};
  await p.goto(BASE + '?seed=7&nospot&nobill'); await W(600); await p.click('#btnPlay'); await W(300);
  await stack(p, 9); await p.evaluate(() => window.__fbs.startWeather('snow')); await W(900);
  await p.evaluate(() => window.__fbs.startCad()); await W(500); await ready(p, -38); await p.evaluate(() => window.__fbs.drop()); await W(110);
  await p.screenshot({ path: OUT + `v10-${tag}.png` }); k.snap = await snap(p);
  await p.close();
}
(async () => {
  const wk = await pw.webkit.launch();
  await sprites(wk); await portrait(wk); await landscape(wk, 'iPhone 15', 'landscape');
  await wk.close(); const cr = await pw.chromium.launch(); await landscape(cr, 'Pixel 7', 'pixel7-landscape');
  { const p = await page(cr, 'Pixel 7'); await p.goto(BASE + '?seed=3&nospot&nobill'); await W(500); await p.click('#btnPlay'); await W(300); await stack(p, 4); await p.evaluate(() => window.__fbs.startCad()); await W(400); await place(p, 60); await W(300); await p.evaluate(() => window.__fbs.endCad()); await W(500); info.pixel7 = await snap(p); await p.close(); }
  await cr.close();
  console.log(JSON.stringify({ info, errs }, null, 1));
})();
