/* v8 tests: ranks, weather, Evan's "New BOM ready" extruder tweak, COVID-era milestones (gilmanbrothers.com only),
   game-over fit, no console errors. Run: node tests/v8.js [iphone15|se|pixel7|galaxy]  (server on :8833) */
const pw = require('/workspace/tools/node_modules/playwright');
const BASE = process.env.BASE || 'http://localhost:8833/';
const results = []; let pass = 0, fail = 0;
const ok = (n, c, info) => { if (c) { pass++; results.push('PASS ' + n); } else { fail++; results.push('FAIL ' + n + (info !== undefined ? ' :: ' + JSON.stringify(info).slice(0, 700) : '')); } };
const wait = (p, ms) => p.waitForTimeout(ms);
// drop the moving board centred on the top one (+off px); optionally force a product first
const place = (p, off = 0, prod) => p.evaluate(async ([off, prod]) => { const F = window.__fbs; await F.finishExtrusion(); if (prod) F.setProduct(prod); F.freeze(); const S = F.S, tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2 + off); F.drop(); }, [off, prod || null]);
const toOver = p => p.evaluate(async () => { const F = window.__fbs; for (let i = 0; i < 6 && F.S.mode !== 'over'; i++) { if (F.S.mode === 'rescue') F.rescue(false); else if (F.S.mode === 'play') { F.S.adhere = 0; await F.finishExtrusion(); F.setMovingX(-3000); F.drop(); } await new Promise(r => setTimeout(r, 1200)); } return F.S.mode; });
const overFits = p => p.evaluate(() => { const o = document.getElementById('over'), els = [...document.querySelectorAll('#over button, #rankBox, #rankMeta, #over .legal-short, #finalScore, #spotOver, #factOver')];
  const clip = [...document.querySelectorAll('#spotOver, #factOver')].filter(e => e.scrollHeight > e.clientHeight + 1).map(e => e.id);
  const bad = els.filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); if (cs.display === 'none') return false; return r.top < -1 || r.bottom > innerHeight + 1 || r.left < -1 || r.right > innerWidth + 1; }).map(e => e.id || e.className);
  return { clip, vis: !o.hidden, scroll: o.scrollHeight - o.clientHeight, bad, hOver: document.documentElement.scrollWidth > innerWidth + 1, rank: document.getElementById('rankName').textContent }; });

async function suite(bt, dev, tag) {
  const b = await pw[bt].launch(); const T = n => `${tag}: ${n}`;
  const mk = async land => { const o = { ...pw.devices[dev] }; delete o.defaultBrowserType; if (land) o.viewport = { width: o.viewport.height, height: o.viewport.width }; const ctx = await b.newContext(o); const p = await ctx.newPage(); return p; };
  const errs = []; const watch = (p, l) => { p.on('pageerror', e => errs.push(l + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(l + ' console: ' + m.text()); }); };
  const p = await mk(false); watch(p, 'portrait');

  // ---------- ranks: pure gating ----------
  await p.goto(BASE + '?seed=7&nospot&noevents'); await wait(p, 500);
  const rk = await p.evaluate(() => { const F = window.__fbs, R = F.rankFor; return {
    names: F.RANKS.map(r => r.name), th: F.RANKS.map(r => [r.score, r.trim]),
    a: R(0, 0), b: R(25, 54), c: R(25, 55), d: R(24, 100), e: R(1200, 91), f: R(1199, 100), g: R(1200, 92), h: R(5000, 64), i: R(175, 72), j: R(349, 79) }; });
  ok(T('ranks: Temp → Board Member in order'), rk.names.join('|') === 'Temp|Material Handler|Lead|Shift Supervisor|Manager|Engineer|Board Member', rk.names);
  ok(T('ranks: thresholds rise in both score and trim'), rk.th.every((t, i) => !i || (t[0] > rk.th[i - 1][0] && t[1] > rk.th[i - 1][1])), rk.th);
  ok(T('ranks: trim gates promotion (25 pts @54% = Temp, @55% = Material Handler; 5000 pts @64% = Material Handler)'), rk.a === 0 && rk.b === 0 && rk.c === 1 && rk.h === 1, rk);
  ok(T('ranks: score gates promotion (24 pts @100% = Temp; 1199 pts @100% = Engineer)'), rk.d === 0 && rk.f === 5, rk);
  ok(T('ranks: Board Member needs 1200 pts AND 92% trim (v9 thresholds); exact thresholds inclusive'), rk.e === 5 && rk.g === 6 && rk.i === 3 && rk.j === 3, rk);

  // ---------- ranks in play: promotion moment, trim gating, best rank persisted ----------
  await p.evaluate(() => localStorage.removeItem('fbs.bestRank'));
  await p.click('#btnPlay'); await wait(p, 300);
  for (let i = 0; i < 6; i++) await place(p, 0);
  await p.evaluate(() => { const S = window.__fbs.S; S.score = Math.max(S.score, 24); }); await place(p, 0); // v9 thresholds: Material Handler at 25
  const pr = await p.evaluate(() => { const S = window.__fbs.S; return { rank: S.rank, promo: S.promo && S.promo.text, score: S.score, trim: window.__fbs.trimPct() }; });
  ok(T('in play: perfect drops reach Material Handler with a "Promoted" banner'), pr.rank >= 1 && /Promoted: /.test(pr.promo || '') && pr.trim === 100, pr);
  // poor trim blocks promotion even with a big score
  const tg = await p.evaluate(async () => { const F = window.__fbs, S = F.S; S.trimSum = S.trimN * 0.3; S.score = 500; const r0 = S.rank; await F.finishExtrusion(); F.freeze(); const tp = S.stack[S.stack.length - 1]; F.setMovingX(tp.x + 2); F.drop(); return { r0, r1: S.rank, trim: F.trimPct() }; });
  ok(T('in play: 500 pts at ~50% trim does not promote'), tg.r1 === tg.r0 && tg.trim < 55, tg);
  const tg2 = await p.evaluate(async () => { const F = window.__fbs, S = F.S; S.trimSum = S.trimN * 0.95; S.score = 1200; await F.finishExtrusion(); F.freeze(); const tp = S.stack[S.stack.length - 1], m = S.moving; F.setMovingX(tp.x + (tp.w - m.w) / 2); F.drop(); return { r: S.rank, trim: F.trimPct() }; });
  ok(T('in play: 1200+ pts at 92%+ trim promotes to Board Member'), tg2.r === 6, tg2);
  ok(T('game over reached'), (await toOver(p)) === 'over');
  const go = await p.evaluate(() => ({ name: document.getElementById('rankName').textContent, meta: document.getElementById('rankMeta').textContent, icon: document.getElementById('rankIcon').textContent, lbl: document.getElementById('rankLbl').textContent, best: localStorage.getItem('fbs.bestRank') }));
  ok(T('game over shows rank, trim quality and best rank stored'), go.name === 'Board Member' && /Trim quality \d+%/.test(go.meta) && /Top rank!/.test(go.meta) && /new best/.test(go.lbl) && go.icon && go.best === '6', go);
  const fit1 = await overFits(p);
  ok(T('portrait game over fits one screen (no scroll), rank + buttons + legal on screen'), fit1.vis && fit1.scroll <= 1 && !fit1.bad.length && !fit1.clip.length && !fit1.hOver, fit1);
  // a worse run keeps the best rank
  await p.reload(); await wait(p, 400); await p.click('#btnPlay'); await wait(p, 300); await place(p, 0);
  await toOver(p);
  const go2 = await p.evaluate(() => ({ name: document.getElementById('rankName').textContent, lbl: document.getElementById('rankLbl').textContent, best: localStorage.getItem('fbs.bestRank') }));
  ok(T('best rank persists across reload and a lower-rank run'), go2.name === 'Temp' && go2.best === '6' && /best: Board Member/.test(go2.lbl), go2);

  // ---------- weather ----------
  await p.goto(BASE + '?seed=7&nospot&noevents'); await wait(p, 400); await p.click('#btnPlay'); await wait(p, 300);
  for (let i = 0; i < 5; i++) await place(p, 0);
  // heat
  const heatSay = await p.evaluate(() => { window.__fbs.startWeather('heat'); const b = window.__fbs.S.hostState[1].bubble; return b && b.text; }); await wait(p, 900);
  const heat = await p.evaluate(async () => { const F = window.__fbs, v = []; for (let i = 0; i < 12; i++) { v.push(F.wxSpeed()); await new Promise(r => setTimeout(r, 70)); } return { v, chip: !!document.querySelector('#nowBoard .wxchip.heat'), txt: document.querySelector('#nowBoard').textContent, bubble: F.S.hostState[1].bubble && F.S.hostState[1].bubble.text, hats: F.S.hatsOn }; });
  ok(T('heat: uneven drift (slide speed varies around 1x), indicator + Cyrus bubble, no hats'), Math.max(...heat.v) > 1.05 && Math.min(...heat.v) < 0.95 && heat.chip && /Heat 7/.test(heat.txt) && /Heat wave/.test(heatSay || '') && !heat.hats, { heat, heatSay });
  for (let i = 0; i < 7; i++) await place(p, 0);
  const hEnd = await p.evaluate(() => ({ wx: window.__fbs.S.wx, chip: !!document.querySelector('#nowBoard .wxchip') }));
  ok(T('weather ends after 7 boards (indicator cleared)'), hEnd.wx === null && !hEnd.chip, hEnd);
  // cold: faster + chip on a sloppy trim (not on a good one)
  await wait(p, 600); await p.evaluate(() => window.__fbs.startWeather('cold'));
  const c0 = await p.evaluate(() => ({ s: window.__fbs.wxSpeed(), chips: window.__fbs.S.chips }));
  await place(p, 2, 'ryno-board'); // tidy trim: no chip
  const c1 = await p.evaluate(() => window.__fbs.S.chips);
  const sl = await p.evaluate(async () => { const F = window.__fbs, S = F.S; await F.finishExtrusion(); F.setProduct('ryno-board'); F.freeze(); const tp = S.stack[S.stack.length - 1], m = S.moving, off = Math.round(tp.w * 0.2); F.setMovingX(tp.x + off); const ov = Math.min(tp.x + tp.w, tp.x + off + m.w) - (tp.x + off); F.drop(); const b = S.stack[S.stack.length - 1]; return { ov, w: b.w, chips: S.chips, pop: S.popups.some(u => /Chipped/.test(u.text)) }; });
  ok(T('cold: boards slide 12% faster'), Math.abs(c0.s - 1.12) < 1e-9, c0);
  ok(T('cold: a tidy trim does not chip; a sloppy trim (<88% kept) chips extra off the cut edge'), c1 === c0.chips && sl.chips === c0.chips + 1 && sl.w < sl.ov - 0.5 && sl.pop, { c0, c1, sl });
  await p.evaluate(() => window.__fbs.endWeather());
  // snow: hats on Evan + Cyrus, flakes, slick
  await p.evaluate(() => window.__fbs.startWeather('snow')); await wait(p, 1500);
  const sn = await p.evaluate(() => { const F = window.__fbs, S = F.S; return { hats: S.hatsOn, flakes: S.flakes.length, s: F.wxSpeed(), chip: !!document.querySelector('#nowBoard .wxchip.snow'), bubble: S.hostState[0].bubble && S.hostState[0].bubble.text, hatCv: !!(window.FBS_SPRITES.hatCanvas({ id: 'evan' }, 0).width) }; });
  ok(T('snow: Evan and Cyrus wear hats, snowflakes fall, boards a bit slick, indicator shown'), sn.hats === 2 && sn.flakes > 5 && Math.abs(sn.s - 1.06) < 1e-9 && sn.chip && sn.hatCv, sn);
  await p.evaluate(() => window.__fbs.endWeather()); await wait(p, 2200);
  ok(T('snow over: hats come off'), (await p.evaluate(() => window.__fbs.S.hatsOn)) === 0);
  // natural trigger (?events): weather starts on its own from floor 5, never during rain
  const p2 = await mk(false); watch(p2, 'events');
  await p2.goto(BASE + '?seed=9&nospot&events'); await wait(p2, 400); await p2.click('#btnPlay'); await wait(p2, 300);
  await p2.evaluate(() => { const S = window.__fbs.S; S.wxNext = 0; S.bomNext = 1e9; S.billNext = 1e9; });
  for (let i = 0; i < 6; i++) { await place(p2, 0); await wait(p2, 60); }
  const nat = await p2.evaluate(() => ({ wx: window.__fbs.S.wxCount, type: window.__fbs.S.wx && window.__fbs.S.wx.type }));
  ok(T('weather triggers on its own (heat/cold/snow) once floor 5 is reached'), nat.wx === 1 && ['heat', 'cold', 'snow'].includes(nat.type), nat);

  // ---------- "New BOM ready" ----------
  await p2.evaluate(() => { const S = window.__fbs.S; window.__fbs.endWeather(); S.wxNext = 1e9; S.bomNext = 0; });
  await place(p2, 0); // next spawn is the first BOM board
  const bom = await p2.evaluate(() => { const S = window.__fbs.S; return { on: !!S.bom, spec: S.bom && S.bom.spec, bubble: S.hostState[0].bubble && S.hostState[0].bubble.text, f: S.moving.bom, w: S.moving.w, line: S.lineName, pill: document.querySelector('#nowBoard .wxchip.bom') && document.querySelector('#nowBoard .wxchip.bom').textContent }; });
  ok(T('BOM: Evan says "New BOM ready"; the board comes out resized; shown on the pill and extruder plate'), bom.on && bom.bubble === 'New BOM ready' && bom.f > 0 && Math.abs(bom.f - 1) > 0.1 && /W \d+%/.test(bom.line) && /📋 \d+%/.test(bom.pill || ''), bom);
  const ws = [bom.w];
  // drop the BOM boards sloppily / narrow ones dead-centre: the stack can shrink, but sizes stay relative to the spec width (no compounding)
  for (let i = 0; i < 4; i++) { await place(p2, i % 2 ? 0 : 6); ws.push(await p2.evaluate(() => window.__fbs.S.moving.w)); }
  const spec = bom.spec, rel = ws.map(w => w / spec);
  ok(T('BOM: 5 boards, each within 50-150% of the spec width (no compounding), never ~100%'), rel.length === 5 && rel.every(r => r >= 0.5 - 1e-6 && r <= 1.5 + 1e-6 && Math.abs(r - 1) > 0.1), { spec, ws, rel });
  await place(p2, 0);
  const back = await p2.evaluate(() => { const S = window.__fbs.S; return { on: !!S.bom, bubble: S.hostState[0].bubble && S.hostState[0].bubble.text, w: S.moving.w, maxW: S.maxW }; });
  ok(T('BOM: ends after 5 boards; Evan says "Back to spec" and the next board is the spec width'), !back.on && back.bubble === 'Back to spec' && Math.abs(back.w - Math.min(back.maxW, Math.round(spec))) <= 1, { back, spec });
  // drop math for resized boards
  const dm = await p2.evaluate(() => { const D = window.__fbs.computeDropBom, o = { perfectPx: 4, maxW: 200 };
    return { narrow: D({ x: 100, w: 100 }, { x: 125, w: 50 }, o), wide: D({ x: 100, w: 100 }, { x: 75, w: 150 }, o), wideCap: D({ x: 100, w: 100 }, { x: 0, w: 300 }, o), off: D({ x: 100, w: 100 }, { x: 60, w: 150 }, o), miss: D({ x: 100, w: 100 }, { x: 260, w: 50 }, o) }; });
  ok(T('BOM drop: a narrow board dead-centre lands whole (Perfect, no cut)'), dm.narrow.perfect && dm.narrow.w === 50 && dm.narrow.x === 125 && !dm.narrow.cuts.length, dm.narrow);
  ok(T('BOM drop: a wide board dead-centre keeps its width (capped at maxW, excess trimmed evenly)'), dm.wide.perfect && dm.wide.w === 150 && dm.wide.x === 75 && dm.wideCap.w === 200 && dm.wideCap.cuts.length === 2 && dm.wideCap.cuts[0].w === 50, { w: dm.wide, c: dm.wideCap });
  ok(T('BOM drop: off-centre wide board is trimmed on both sides to the board below; full miss = miss'), !dm.off.perfect && dm.off.w === 100 && dm.off.x === 100 && dm.off.cuts.length === 2 && dm.miss.miss, dm.off);
  // natural (random) BOM fires on its own
  const p3 = await mk(false); watch(p3, 'events2');
  await p3.goto(BASE + '?seed=4&nospot&events'); await wait(p3, 400); await p3.click('#btnPlay'); await wait(p3, 300);
  await p3.evaluate(() => { const S = window.__fbs.S; S.bomNext = 0; S.wxNext = 1e9; S.billNext = 1e9; });
  for (let i = 0; i < 7; i++) await place(p3, 0);
  ok(T('BOM triggers on its own from floor 6'), (await p3.evaluate(() => window.__fbs.S.bomCount)) === 1);
  await p2.close(); await p3.close();

  // ---------- milestones: gilmanbrothers.com only ----------
  const ms = await p.evaluate(async () => { const F = window.__fbs.facts; const n = await fetch('notes/milestones-v8.md').then(r => r.ok ? r.text() : ''); return { all: F.map(f => [f.id, f.source]), notes: n }; });
  const NEW = ['f1963', 'f1970s', 'f1994', 'f1995', 'fcovidbeds', 'fcovidschool', 'f2020video', 'f2020vcec', 'f2020vts', 'f2021vax', 'f2021tour'];
  const ids = ms.all.map(x => x[0]);
  ok(T('milestones: 11 v8 facts present incl. COVID-19 era (2020-2021)'), NEW.every(id => ids.includes(id)) && ids.length === 30, ids);
  ok(T('milestones: every fact cites a gilmanbrothers.com page'), ms.all.every(([, s]) => /^https:\/\/gilmanbrothers\.com\//.test(s)), ms.all.filter(([, s]) => !/^https:\/\/gilmanbrothers\.com\//.test(s)));
  ok(T('milestones: notes file lists each v8 fact with a gilmanbrothers.com source, no outside sources cited'), NEW.every(id => ms.notes.includes('| ' + id + ' |')) && !/\| https?:\/\/(?!gilmanbrothers\.com)/.test(ms.notes), ms.notes.slice(0, 200));
  const fb = await p.evaluate(() => { const F = window.__fbs; for (let i = 0; i < 80 && F.spot.fact !== 'f2020vts'; i++) F.spot.next(); return { id: F.spot.fact, txt: document.getElementById('factStart').textContent }; });
  ok(T('milestones: a COVID-era fact rotates into the Our History card'), fb.id === 'f2020vts' && /vaccine/.test(fb.txt), fb);

  // ---------- landscape game over fits ----------
  const pl = await mk(true); watch(pl, 'landscape');
  await pl.goto(BASE + '?seed=7&nospot&noevents'); await wait(pl, 500); await pl.click('#btnPlay'); await wait(pl, 300);
  for (let i = 0; i < 4; i++) await place(pl, 0);
  await pl.evaluate(() => { const S = window.__fbs.S; S.score = 80; S.rank = 4; });
  await toOver(pl); await wait(pl, 200);
  const fit2 = await overFits(pl);
  ok(T('landscape game over fits one screen (no scroll), rank + buttons + legal on screen'), fit2.vis && fit2.scroll <= 1 && !fit2.bad.length && !fit2.clip.length && !fit2.hOver && fit2.rank === 'Manager', fit2);

  // ---------- service worker + errors ----------
  ok(T('service worker cache is fbs-v9'), /'fbs-v9'/.test(await p.evaluate(() => fetch('sw.js').then(r => r.text()))));
  ok(T('no console/page errors (portrait, events, landscape)'), errs.length === 0, errs);
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
