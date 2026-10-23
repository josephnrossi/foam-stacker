/* v9 mockup screenshots: skids, truckload HUD, Team Drivers, compact rank-up. node tools/v9-shots.js (server on :8833) */
const pw = require('/workspace/tools/node_modules/playwright');
const BASE = 'http://localhost:8833/', OUT = __dirname + '/../shots/', errs = [], info = {};
async function page(b, dev, land) {
  const o = { ...pw.devices[dev] }; delete o.defaultBrowserType; if (land) o.viewport = { width: o.viewport.height, height: o.viewport.width };
  const p = await (await b.newContext(o)).newPage(); const tag = dev + (land ? ' land' : '');
  p.on('pageerror', e => errs.push(tag + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(tag + ' console: ' + m.text()); });
  return p;
}
const W = ms => new Promise(r => setTimeout(r, ms));
const place = (p, off = 0) => p.evaluate(async off => { const F = window.__fbs; await new Promise(r => { let k = 0; const c = () => (F.S.moving || ++k > 400 ? r() : requestAnimationFrame(c)); c(); });
  await F.finishExtrusion(); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2 + off); F.drop(); }, off);
const ready = (p, off = 24) => p.evaluate(async off => { const F = window.__fbs; await new Promise(r => { let k = 0; const c = () => (F.S.moving || ++k > 400 ? r() : requestAnimationFrame(c)); c(); });
  await F.finishExtrusion(); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2 + off); }, off);
async function stack(p, n) { const o = [0, 2, -2, 0, 3, -1]; for (let i = 0; i < n; i++) { await place(p, o[i % o.length]); await W(40); } }
const hudCheck = p => p.evaluate(() => { const R = e => e && !e.hidden && e.getBoundingClientRect(), t = R(document.getElementById('truckHud'));
  const hit = [...document.querySelectorAll('#hud button, #score, #best, #nowBoard, #billBanner, #tdBanner')].filter(e => !e.hidden && e.getBoundingClientRect().width).map(e => [e.id, e.getBoundingClientRect()])
    .filter(([, r]) => !(r.right <= t.left || r.left >= t.right || r.bottom <= t.top || r.top >= t.bottom)).map(([id]) => id);
  const S = window.__fbs.S, a = window.__fbs.align(), pr = S.promoRect;
  return { truckHud: [t.left, t.top, t.width, t.height].map(Math.round), overlaps: hit, truckRow: document.getElementById('truckRow').textContent, skidRow: document.getElementById('skidRow').textContent,
    mult: window.__fbs.bonusMult(), score: S.score, promo: S.promo && pr ? { bottom: Math.round(pr.y + pr.h), stackTop: Math.round(a.topY), movingTop: S.moving ? Math.round(a.topY - S.moving.t - 30) : null, h: pr.h, w: Math.round(pr.w) } : null }; });

async function run(b, dev, land, pre) {
  const p = await page(b, dev, land), k = pre; info[k] = {};
  await p.goto(BASE + '?seed=7&nospot&nobill&skidmax=15'); await W(600); await p.click('#btnPlay'); await W(300);
  await stack(p, 14); await W(500);
  const s0 = await p.evaluate(() => window.__fbs.S.score); await place(p, 0); await W(450);
  await p.screenshot({ path: OUT + `v9-${k}-skid-complete.png` }); info[k].skid = { scoreGain: (await p.evaluate(() => window.__fbs.S.score)) - s0, ...(await hudCheck(p)) };
  await W(1300); await stack(p, 2); await ready(p); await W(500);
  await p.screenshot({ path: OUT + `v9-${k}-new-skid.png` }); info[k].newSkid = await hudCheck(p);
  // jump to skid 12 of the first truck
  await p.evaluate(() => { const F = window.__fbs; F.S.skids = 11; F.updateTruckHud(); }); await stack(p, 12); await W(500);
  const s1 = await p.evaluate(() => window.__fbs.S.score); await place(p, 0); await W(650);
  await p.screenshot({ path: OUT + `v9-${k}-truckload.png` }); info[k].truckload = { scoreGain: (await p.evaluate(() => window.__fbs.S.score)) - s1, ...(await hudCheck(p)) };
  await W(2200); await stack(p, 3); await ready(p); await W(600);
  await p.screenshot({ path: OUT + `v9-${k}-truck-hud.png` }); info[k].truckHud = await hudCheck(p);
  await p.evaluate(() => window.__fbs.startTD()); await W(200); await place(p, 0); await ready(p); await W(700);
  await p.screenshot({ path: OUT + `v9-${k}-team-drivers.png` }); info[k].td = { ...(await hudCheck(p)), banner: await p.evaluate(() => { const e = document.getElementById('tdBanner'), r = e.getBoundingClientRect(); return { text: e.textContent.trim(), rect: [r.left, r.top, r.width, r.height].map(Math.round) }; }) };
  await p.evaluate(() => window.__fbs.endTD()); await W(300);
  await p.evaluate(() => { const S = window.__fbs.S; S.popups = []; S.hostState.forEach(h => h.bubble = null); window.__fbs.promote(4); }); await W(260);
  await p.screenshot({ path: OUT + `v9-${k}-rankup.png` }); info[k].rankup = await hudCheck(p);
  await p.close();
}
(async () => {
  const wk = await pw.webkit.launch();
  await run(wk, 'iPhone 15', false, 'portrait'); await run(wk, 'iPhone 15', true, 'landscape'); await run(wk, 'iPhone SE', true, 'se-landscape');
  await wk.close(); const cr = await pw.chromium.launch(); await run(cr, 'Pixel 7', false, 'pixel7'); await cr.close();
  console.log(JSON.stringify({ info, errs }, null, 1));
})();
