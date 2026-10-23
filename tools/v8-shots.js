/* v8 mockup screenshots + smoke check. node tools/v8-shots.js (server on :8833) */
const pw = require('/workspace/tools/node_modules/playwright');
const BASE = 'http://localhost:8833/', OUT = __dirname + '/../shots/';
const errs = [];
async function page(b, dev, land) {
  const o = { ...pw.devices[dev] }; delete o.defaultBrowserType;
  if (land) o.viewport = { width: o.viewport.height, height: o.viewport.width };
  const ctx = await b.newContext(o); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(dev + (land ? ' land' : '') + ' pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(dev + ' console: ' + m.text()); });
  return p;
}
const place = (p, off) => p.evaluate(async off => { const F = window.__fbs; await F.finishExtrusion(); const S = F.S; F.freeze(); const tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2 + off); F.drop(); }, off);
const settle = (p, ms) => p.waitForTimeout(ms);
const ready = p => p.evaluate(async () => { const F = window.__fbs; await F.finishExtrusion(); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2 + 26); });
async function stack(p, n, offs) { for (let i = 0; i < n; i++) { await place(p, offs ? offs[i % offs.length] : 0); await settle(p, 40); } }
async function setFact(p, id) { await p.evaluate(id => { const F = window.__fbs; for (let i = 0; i < 80 && F.spot.fact !== id; i++) F.spot.next(); }, id); }

(async () => {
  const b = await pw.webkit.launch();
  // ---------- portrait iPhone 15 ----------
  let p = await page(b, 'iPhone 15');
  await p.goto(BASE + '?seed=7&nospot&nobill'); await settle(p, 700);
  await setFact(p, 'fcovidbeds'); await settle(p, 100);
  await p.screenshot({ path: OUT + 'v8-milestone-start.png' });
  await p.click('#btnPlay'); await settle(p, 300);
  await stack(p, 9, [0, 3, -2, 0, 5]);
  await p.evaluate(() => window.__fbs.startWeather('heat')); await settle(p, 200); await ready(p); await settle(p, 1400);
  await p.screenshot({ path: OUT + 'v8-heat.png' });
  await p.evaluate(() => window.__fbs.endWeather()); await place(p, 0); await settle(p, 900);
  await p.evaluate(() => window.__fbs.startWeather('cold')); await settle(p, 1200);
  await p.evaluate(async () => { const F = window.__fbs; await F.finishExtrusion(); F.setProduct('ryno-board'); }); await place(p, 34); await settle(p, 160); await ready(p); await settle(p, 120);
  await p.screenshot({ path: OUT + 'v8-cold-chip.png' });
  await p.evaluate(() => window.__fbs.endWeather()); await place(p, 0); await settle(p, 900);
  await p.evaluate(() => { const S = window.__fbs.S; S.rain = 0; S.rainDrops = []; S.rainCount = 9; window.__fbs.startWeather('snow'); }); await settle(p, 2600); await ready(p); await settle(p, 600);
  await p.screenshot({ path: OUT + 'v8-snow-hats.png' });
  // BOM: the next spawn after this drop is resized and Evan announces it
  await p.evaluate(() => { const S = window.__fbs.S; S.bomNext = 0; S.promo = null; }); await place(p, 9); await settle(p, 30);
  await p.evaluate(async () => { const F = window.__fbs; await F.finishExtrusion(); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2 + 30); });
  await settle(p, 120);
  const bomInfo = await p.evaluate(() => { const S = window.__fbs.S; return { bom: S.moving.bom, w: S.moving.w, below: S.stack[S.stack.length - 1].w, bubble: S.hostState[0].bubble && S.hostState[0].bubble.text }; });
  await p.screenshot({ path: OUT + 'v8-bom.png' });
  // rank-up moment
  await p.evaluate(() => window.__fbs.endWeather());
  await stack(p, 6, [0, 2, -3, 0, 6, 0]);
  await p.evaluate(() => { const F = window.__fbs; F.S.score = Math.max(F.S.score, 44); }); await place(p, 0); await settle(p, 420);
  const rk = await p.evaluate(() => { const F = window.__fbs; return { rank: F.RANKS[F.S.rank].name, trim: F.trimPct(), score: F.S.score }; });
  await p.screenshot({ path: OUT + 'v8-rankup.png' });
  // game over with rank
  await stack(p, 4, [0, 4, -5, 0]);
  await p.evaluate(async () => { const F = window.__fbs; F.S.adhere = 0; await F.finishExtrusion(); F.setMovingX(-2000); F.drop(); }); await settle(p, 1500);
  await setFact(p, 'f2020vts'); await settle(p, 100);
  const over = await p.evaluate(() => ({ rank: document.getElementById('rankName').textContent, meta: document.getElementById('rankMeta').textContent, fits: document.getElementById('over').scrollHeight <= innerHeight + 1 }));
  await p.screenshot({ path: OUT + 'v8-gameover-rank.png' });
  // ---------- landscape iPhone 15 ----------
  const pl = await page(b, 'iPhone 15', true);
  await pl.goto(BASE + '?seed=11&nospot&nobill'); await settle(pl, 700); await pl.click('#btnPlay'); await settle(pl, 300);
  await stack(pl, 8, [0, 2, -3]);
  await pl.evaluate(() => window.__fbs.startWeather('snow')); await settle(pl, 300);
  await pl.evaluate(() => { window.__fbs.S.bomNext = 0; }); await place(pl, 0); await settle(pl, 30); await ready(pl); await settle(pl, 1500);
  await pl.screenshot({ path: OUT + 'v8-landscape-snow-bom.png' });
  await pl.evaluate(async () => { const F = window.__fbs; F.S.adhere = 0; F.S.score = 72; F.S.rank = 4; await F.finishExtrusion(); F.setMovingX(-2000); F.drop(); }); await settle(pl, 1500);
  await setFact(pl, 'f2021vax');
  const overL = await pl.evaluate(() => { const r = [...document.querySelectorAll('#over button, #rankBox, #rankMeta, #over .legal-short')].map(e => e.getBoundingClientRect()); return { fits: r.every(x => x.bottom <= innerHeight + 1 && x.top >= -1), rank: document.getElementById('rankName').textContent }; });
  await pl.screenshot({ path: OUT + 'v8-landscape-gameover.png' });
  // ---------- smoke: events ON (random weather + BOM), autoplay ~50 s of game time ----------
  if (!process.env.SMOKE) { console.log(JSON.stringify({ bomInfo, rk, over, overL, errs }, null, 1)); await b.close(); return; }
  const ps = await page(b, 'iPhone 15');
  await ps.goto(BASE + '?seed=5'); await settle(ps, 600); await ps.click('#btnPlay');
  const t0 = Date.now(); let sm = {};
  while (Date.now() - t0 < 45000) { const r = await ps.evaluate(async () => { const F = window.__fbs; await F.finishExtrusion(); const S = F.S; if (!S || S.mode !== 'play') return { over: true }; const tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2 + (Math.random() - 0.5) * 8); F.drop(); return { wx: S.wxCount, bom: S.bomCount, fl: S.floors, rank: F.RANKS[S.rank].name, trim: F.trimPct(), parts: S.parts.length }; }); sm = r; if (r.over) break; await settle(ps, 350); }
  console.log(JSON.stringify({ bomInfo, rk, over, overL, smoke: sm, errs }, null, 1));
  await b.close();
})();
