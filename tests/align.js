/* v6/v9 alignment tests (v9: in landscape the hosts hold the constant working level): hosts' waists sit on the pallet's top deck at every height, in portrait and landscape,
   after a mid-game rotation and during the WIDWAW (Bill) swap. Run: node tests/align.js [tag] */
const pw = require('/workspace/tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8833/';
const results = []; let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; results.push('PASS ' + n); } else { fail++; results.push('FAIL ' + n + (info !== undefined ? ' :: ' + JSON.stringify(info).slice(0, 600) : '')); } };
const TOL = 2;
async function playTo(p, N) {
  await p.evaluate(async N => { const F = window.__fbs; for (let g = 0; g < 90 && F.S.stack.length - 1 < N; g++) { await F.finishExtrusion(); const S = F.S, t = S.stack[S.stack.length - 1]; F.setMovingX(t.x); F.drop(); await new Promise(r => setTimeout(r, 40)); } await F.finishExtrusion(); F.freeze(); }, N);
  await settle(p);
}
async function settle(p) { // wait until the camera has caught up with its target
  await p.evaluate(() => new Promise(r => { let n = 0; const c = () => { const S = window.__fbs.S; if ((S && Math.abs(S.cam - S.camT) < 0.5) || ++n > 300) r(); else requestAnimationFrame(c); }; requestAnimationFrame(c); }));
  await p.waitForTimeout(80);
}
const A = p => p.evaluate(() => window.__fbs.align());
function check(T, a, what) {
  // portrait: waists ride the pallet top; v9 landscape: waists stay at the constant working level (= the opening pallet top)
  const ref = a.land ? a.workLevel : a.palletTop, d = a.hosts.map(h => Math.abs(h.mid - ref));
  ok(T(`${what}: both waists on the ${a.land ? 'working level' : 'pallet top'} (±${TOL}px)`), d.every(x => x <= TOL), { land: a.land, ref, palletTop: a.palletTop, mids: a.hosts.map(h => h.mid), cam: a.cam });
  if (a.land) ok(T(`${what}: landscape top board sits on the working level (±${TOL}px)`), a.cam === 0 || Math.abs(a.topY - a.workLevel) <= TOL + 1, { topY: a.topY, wl: a.workLevel });
  ok(T(`${what}: hosts flank the pallet`), a.hosts[0].x < a.palletL && a.hosts[1].x + a.hosts[1].w > a.palletR, { L: a.palletL, R: a.palletR, hosts: a.hosts.map(h => [h.x, h.w]) });
}
async function suite(bt, dev, tag, rotate) {
  const b = await pw[bt].launch(); const o = { ...pw.devices[dev] }; delete o.defaultBrowserType;
  const ctx = await b.newContext(o); const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const T = n => `${tag}: ${n}`;
  await p.goto(BASE + '?seed=3&nospot&nobill'); await p.waitForTimeout(500);
  await p.evaluate(() => window.__fbs.start()); await p.waitForTimeout(200);
  await p.evaluate(() => window.__fbs.finishExtrusion()); await settle(p);
  const a0 = await A(p);
  ok(T('opening view: camera unscrolled, pallet on screen above the bottom bars'), a0.cam < 1 && a0.palletTop > 0 && a0.floorY <= a0.H - a0.bottomUI, a0);
  check(T, a0, 'floor 0');
  for (const N of [1, 8, 15, 25]) { await playTo(p, N); check(T, await A(p), `floor ${N}`); }
  const hi = await A(p);
  ok(T('pallet and hosts scroll by the same camera offset'), hi.cam === 0 || Math.abs((hi.palletTop - a0.palletTop) - (hi.cam - a0.cam)) <= TOL, { cam: hi.cam, d: hi.palletTop - a0.palletTop });
  if (rotate) {
    const vp = p.viewportSize(); const before = await A(p);
    await p.setViewportSize({ width: vp.height, height: vp.width }); await p.waitForTimeout(400); await settle(p);
    const r = await A(p); check(T, r, `after rotating ${vp.width}x${vp.height} -> ${vp.height}x${vp.width}`);
    ok(T('rotation re-centres the scene (stack centred between the hosts)'), Math.abs(((r.hosts[0].x + r.hosts[1].x + r.hosts[1].w) / 2) - r.W / 2) <= 2, r);
    ok(T('rotation keeps stack geometry (same board width)'), Math.abs((r.palletR - r.palletL) - (before.palletR - before.palletL)) < 0.5);
    await playTo(p, 28); check(T, await A(p), 'rotated, floor 28');
    await p.setViewportSize(vp); await p.waitForTimeout(400); await settle(p); check(T, await A(p), 'rotated back');
  }
  // Bill swap: same anchor as Cyrus
  await p.evaluate(() => window.__fbs.startBill()); await p.waitForTimeout(700); await settle(p);
  const bl = await A(p); ok(T('Bill is in slot 1'), bl.slot1 === 'bill', bl.slot1); check(T, bl, 'during Bill swap');
  await p.evaluate(() => window.__fbs.endBill()); await p.waitForTimeout(700);
  const cy = await A(p); ok(T('Cyrus back in slot 1'), cy.slot1 !== 'bill', cy.slot1); check(T, cy, 'after Bill leaves');
  ok(T('no console/page errors'), errs.length === 0, errs);
  await b.close();
}
(async () => {
  const which = process.argv[2];
  const S = [['webkit', 'iPhone 15', 'iphone15-portrait', true], ['webkit', 'iPhone 15 landscape', 'iphone15-landscape', true], ['webkit', 'iPhone SE', 'iphoneSE-portrait', true], ['webkit', 'iPhone SE landscape', 'iphoneSE-landscape', false],
    ['chromium', 'Pixel 7', 'pixel7-portrait', true], ['chromium', 'Pixel 7 landscape', 'pixel7-landscape', true], ['chromium', 'Galaxy S8', 'galaxyS8-portrait', true], ['chromium', 'Galaxy S8 landscape', 'galaxyS8-landscape', false]];
  for (const s of S) if (!which || s[2].startsWith(which)) await suite(...s);
  console.log(results.join('\n')); console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
