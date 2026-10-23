/* v9 regression: in landscape the working level (where boards land + the hosts) stays at a constant screen height
   while the stack grows; the camera scrolls the stack down underneath. Portrait keeps its v6 behaviour.
   Also checks that a completed skid resets the stack to a fresh pallet at the same level. Run: node tests/level.js [tag] */
const pw = require('/workspace/tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8833/';
const results = []; let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; results.push('PASS ' + n); } else { fail++; results.push('FAIL ' + n + (info !== undefined ? ' :: ' + JSON.stringify(info).slice(0, 600) : '')); } };
const TOL = 3, N = 40;
const landBoard = p => p.evaluate(async () => {
  const F = window.__fbs, ready = () => new Promise(r => { let k = 0; const c = () => (F.S.moving || ++k > 400 ? r() : requestAnimationFrame(c)); c(); });
  await ready(); await F.finishExtrusion(); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2); F.drop();
  await ready(); await F.finishExtrusion(); F.freeze();
  await new Promise(r => { let k = 0; const c = () => (Math.abs(F.S.cam - F.S.camT) < 0.3 || ++k > 300 ? r() : requestAnimationFrame(c)); c(); });
  const a = F.align(); return { n: F.S.boardsTotal, floors: a.floors, topY: a.topY, wl: a.workLevel, land: a.land, mids: a.hosts.map(h => h.mid), palletTop: a.palletTop, cam: a.cam, lineBottom: F.S.lineRect && F.S.lineRect.bottom, hudB: a.hudB, H: a.H, bottomUI: a.bottomUI, skids: F.S.skids };
});
async function suite(bt, dev, tag, land) {
  const b = await pw[bt].launch(); const o = { ...pw.devices[dev] }; delete o.defaultBrowserType;
  if (land) o.viewport = { width: o.viewport.height, height: o.viewport.width };
  const p = await (await b.newContext(o)).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const T = n => `${tag}: ${n}`;
  await p.goto(BASE + '?seed=7&nospot&nobill'); await p.waitForTimeout(500); await p.click('#btnPlay'); await p.waitForTimeout(300);
  const a0 = await p.evaluate(() => window.__fbs.align());
  ok(T('opening: hosts\' waists at the pallet top (v6 rule)'), a0.hosts.every(h => Math.abs(h.mid - a0.palletTop) <= 2), a0);
  const rows = []; for (let i = 0; i < N; i++) rows.push(await landBoard(p));
  const ys = rows.map(r => r.topY), spread = Math.max(...ys) - Math.min(...ys);
  if (land) {
    ok(T(`landscape: top board y constant across ${N} boards (spread ${spread.toFixed(1)}px ≤ ${TOL})`), spread <= TOL, ys.map(Math.round));
    ok(T('landscape: top board lands on the opening pallet-top level'), ys.every(y => Math.abs(y - a0.palletTop) <= TOL), { lvl: a0.palletTop, ys: ys.map(Math.round) });
    ok(T('landscape: hosts stay at the working level every board'), rows.every(r => r.mids.every(m => Math.abs(m - r.wl) <= 2)), rows.map(r => r.mids.map(Math.round)));
    ok(T('landscape: camera scrolls the stack down (cam grows, pallet moves below)'), rows[N - 1].cam > rows[4].cam + 50 && rows[N - 1].palletTop > a0.palletTop + 50, { c5: rows[4].cam, c40: rows[N - 1].cam });
  } else {
    ok(T('portrait: top board stays on screen above the bottom bars and below the HUD'), rows.every(r => r.topY > 60 && r.topY < r.H - r.bottomUI), ys.map(Math.round));
    ok(T('portrait: hosts\' waists ride the pallet top (unchanged)'), rows.every(r => r.mids.every(m => Math.abs(m - r.palletTop) <= 2)));
  }
  ok(T('the extruder line stays above the landing board'), rows.every(r => r.lineBottom == null || r.lineBottom <= r.topY + 16), rows.map(r => [Math.round(r.lineBottom), Math.round(r.topY)]));
  // skid reset at the same level
  await p.goto(BASE + '?seed=7&nospot&nobill&skidmax=15'); await p.waitForTimeout(500); await p.click('#btnPlay'); await p.waitForTimeout(300);
  const sk = []; for (let i = 0; i < 17; i++) sk.push(await landBoard(p));
  ok(T('skid: after 15 boards the skid completes and a fresh pallet starts'), sk[14].skids === 1 && sk[16].floors === 2, sk.map(r => [r.n, r.floors, r.skids]));
  if (land) ok(T('skid: the new skid works at the same level'), sk.every(r => Math.abs(r.topY - a0.palletTop) <= TOL), sk.map(r => Math.round(r.topY)));
  ok(T('no page errors'), errs.length === 0, errs);
  await b.close();
}
(async () => {
  const which = process.argv[2];
  const S = [['webkit', 'iPhone 15', 'iphone15-landscape', 1], ['webkit', 'iPhone SE', 'iphoneSE-landscape', 1], ['chromium', 'Pixel 7', 'pixel7-landscape', 1], ['chromium', 'Galaxy S8', 'galaxyS8-landscape', 1],
    ['webkit', 'iPhone 15', 'iphone15-portrait', 0], ['chromium', 'Pixel 7', 'pixel7-portrait', 0]];
  for (const s of S) if (!which || s[2].startsWith(which)) await suite(...s);
  console.log(results.join('\n')); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
