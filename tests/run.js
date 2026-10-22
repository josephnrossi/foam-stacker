/* Foam Board Stacker tests – Playwright WebKit (iPhone 15, iPhone SE) + Chromium. Run: node tests/run.js */
const pw = require('/workspace/tools/node_modules/playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8833/';
const SHOTS = process.env.SHOTS || __dirname + '/../shots';
const CAT = JSON.parse(fs.readFileSync(__dirname + '/../tools/catalog-source.json', 'utf8'));
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const results = []; const perfLog = [];
function ok(name, cond, extra) { if (cond) { pass++; results.push('PASS ' + name); } else { fail++; results.push('FAIL ' + name + (extra ? ' :: ' + JSON.stringify(extra) : '')); } }

const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1);
const smallTargets = p => p.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('button')) {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (!r.width || !r.height || s.visibility === 'hidden' || el.closest('[hidden]')) continue;
    if (r.width < 43.5 || r.height < 43.5) bad.push(`${el.id} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  return bad;
});
const offscreen = p => p.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('.screen:not([hidden]) button, #hud:not([hidden]) button')) {
    const r = el.getBoundingClientRect(); if (r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) bad.push(el.id);
  }
  return bad;
});

async function tapCanvas(p, touch) {
  const vp = p.viewportSize(); const x = vp.width / 2, y = vp.height * 0.6;
  if (touch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y);
}
async function placeAndTap(p, touch, off, product) {
  await p.evaluate(([off, product]) => { const f = window.__fbs; if (product) f.setProduct(product); f.freeze(); const S = f.S; f.setMovingX(S.stack[S.stack.length - 1].x + off); }, [off, product || null]);
  await tapCanvas(p, touch);
  await p.waitForTimeout(30);
}

async function suite(browserType, deviceName, tag) {
  const b = await pw[browserType].launch();
  const opts = deviceName ? { ...pw.devices[deviceName] } : { viewport: { width: 1280, height: 900 } };
  delete opts.defaultBrowserType;
  const ctx = await b.newContext(opts); const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  const touch = !!opts.hasTouch;
  const T = n => `${tag}: ${n}`;

  await p.goto(BASE + '?seed=7&nospot'); await p.waitForTimeout(600);
  ok(T('start screen visible'), await p.isVisible('#start'));
  ok(T('noindex meta'), (await p.getAttribute('meta[name=robots]', 'content') || '').includes('noindex'));
  ok(T('Demo label shown'), await p.isVisible('#start .demo'));
  const brand = await p.evaluate(() => ({ name: FBS_CONFIG.BRAND_NAME, logoW: document.getElementById('startLogo').naturalWidth, alt: document.getElementById('startLogo').alt, foot: document.getElementById('footBrand').textContent }));
  ok(T('brand constant = Gilman Brothers and used'), brand.name === 'Gilman Brothers' && brand.alt.includes('Gilman Brothers') && brand.foot.includes('Gilman Brothers'), brand);
  ok(T('official logo loaded'), brand.logoW > 500, brand);
  ok(T('hosts on start screen'), (await p.$$eval('#startHosts figure', fs => fs.map(f => f.textContent))).join('|') === 'Evan Gilman|Cyrus Gilman');
  ok(T('start: tap targets >= 44'), (await smallTargets(p)).length === 0, await smallTargets(p));
  ok(T('start: no overflow'), await noOverflow(p));
  ok(T('start: buttons on screen'), (await offscreen(p)).length === 0, await offscreen(p));

  // --- legal ---
  const SHORT = 'Demo for entertainment purposes only. Gilman Brothers and product names are trademarks of The Gilman Brothers Company.';
  ok(T('short legal line on start screen'), (await p.textContent('#start .legal-short')).trim() === SHORT && await p.isVisible('#start .legal-short'));
  await p.click('#btnLegalStart'); await p.waitForTimeout(150);
  const lg = await p.evaluate(() => { const el = document.getElementById('legal'); const t = el.textContent; const r = document.getElementById('btnLegalClose').getBoundingClientRect(); return { vis: !el.hidden, t, hOver: el.scrollWidth > el.clientWidth + 1 || document.documentElement.scrollWidth > innerWidth + 1, closeOn: r.top >= 0 && r.right <= innerWidth + 1, fs: parseFloat(getComputedStyle(document.querySelector('.legal-body')).fontSize) }; });
  ok(T('Legal screen opens with entertainment + warranty wording'), lg.vis && lg.t.includes('entertainment purposes only') && lg.t.includes('makes no offer, warranty, or representation') && lg.t.includes('registered trademarks or trademarks of The Gilman Brothers Company') && lg.t.includes('not quotes') && lg.t.includes('© 2026. All rights reserved.'));
  const missingTm = CAT.products.filter(x => !lg.t.includes(x.name)).map(x => x.name);
  ok(T('Legal screen lists every product name with its exact mark'), missingTm.length === 0, missingTm);
  ok(T('Legal screen fits (no horizontal overflow, close reachable, readable)'), !lg.hOver && lg.closeOn && lg.fs >= 13 && (await smallTargets(p)).length === 0, lg.hOver);
  if (tag === 'iphoneSE' || tag === 'galaxyS8') await p.screenshot({ path: `${SHOTS}/${tag === 'iphoneSE' ? 'iphonese' : 'v2-android-galaxys8'}-legal.png` });
  await p.click('#btnLegalClose'); await p.waitForTimeout(100);
  ok(T('Legal closes back to start'), await p.isVisible('#start'));

  // --- product spotlight ---
  const fitCheck = (sel) => p.evaluate(sel => { const el = document.querySelector(sel); const r = el.getBoundingClientRect(); return { ok: el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1 && r.left >= -1 && r.right <= innerWidth + 1 && r.top >= -1 && r.bottom <= innerHeight + 1, sh: el.scrollHeight, ch: el.clientHeight, id: el.dataset.id }; }, sel);
  const blurbs = await p.evaluate(() => window.__fbs.products.map(x => x.blurb));
  ok(T('all 16 products have a unique 1–2 line blurb'), blurbs.length === CAT.products.length && blurbs.every(b => b && b.length >= 40 && b.length <= 130) && new Set(blurbs).size === blurbs.length);
  ok(T('start spotlight visible with blurb + fact'), await p.isVisible('#spotStart') && (await p.textContent('#spotStart')).includes('Product spotlight') && !!(await p.getAttribute('#spotStart', 'data-fact')));
  const facts = await p.evaluate(() => window.__fbs.facts);
  ok(T(`company facts (${facts.length}) each have a gilmanbrothers.com source URL`), facts.length >= 12 && facts.every(f => /^https:\/\/gilmanbrothers\.com\//.test(f.source) && f.text.length > 20) && new Set(facts.map(f => f.id)).size === facts.length);
  const dur = await p.evaluate(() => window.__fbs.products.map(x => ({ id: x.id, d: window.__fbs.spot.durationFor(x), w: (x.name + ' ' + x.blurb).split(/\s+/).length })));
  ok(T('read time: >=7s and 250ms/word + 2s for every blurb'), dur.every(x => x.d >= 7000 && x.d === Math.max(7000, 2000 + 250 * x.w) && x.d <= 13000), dur);
  const cyc = await p.evaluate(() => { const sp = window.__fbs.spot, out = []; for (let k = 0; k < 64; k++) { sp.next(); out.push({ id: sp.id, fact: sp.fact, card: document.getElementById('spotStart').dataset.id, cardFact: document.getElementById('spotStart').dataset.fact, bar: document.getElementById('factBar').dataset.fact }); } return out; });
  const bagStart = await p.evaluate(() => window.__fbs.spot.bags().p.pos);
  const ids = cyc.map(c => c.id);
  // find cycle boundaries from the bag position: check every 16-window aligned to the bag covers all products
  const aligned = []; const off = (16 - ((bagStart + 1) % 16)) % 16; // index where a new bag starts
  for (let k = (64 - 1 - bagStart) % 16; k + 16 <= 64; k += 16) aligned.push(new Set(ids.slice(k, k + 16)).size);
  ok(T('shuffle-bag shows all 16 before any repeat'), aligned.length >= 3 && aligned.every(n => n === 16), { aligned, bagStart });
  ok(T('no product back-to-back (incl. across reshuffles)'), ids.every((id, k) => k === 0 || id !== ids[k - 1]));
  ok(T('order is randomized (not catalog order)'), ids.slice(0, 16).join() !== (await p.evaluate(() => window.__fbs.products.map(x => x.id).join())));
  ok(T('fact changes in sync with the blurb'), cyc.every((c, k) => c.card === c.id && c.cardFact === c.fact && c.bar === c.fact && (k === 0 || c.fact !== cyc[k - 1].fact)));
  const fids = cyc.map(c => c.fact);
  ok(T('facts shuffle-bag covers every fact'), new Set(fids.slice(0, 2 * facts.length > 64 ? 64 : 2 * facts.length)).size === facts.length);
  const startFit = [];
  for (let k = 0; k < 16; k++) { await p.evaluate(() => window.__fbs.spot.next()); const f = await fitCheck('#spotStart'); if (!f.ok) startFit.push(f); }
  ok(T('every blurb + fact fits the start spotlight'), startFit.length === 0, startFit);
  ok(T('start (with spotlight) buttons on screen'), (await offscreen(p)).length === 0 && await noOverflow(p), await offscreen(p));
  if (tag === 'iphone15' || tag === 'iphoneSE') { await p.screenshot({ path: `${SHOTS}/${tag === 'iphone15' ? 'iphone15' : 'iphonese'}-start.png` }); await p.locator('#spotStart').screenshot({ path: `${SHOTS}/${tag === 'iphone15' ? 'iphone15' : 'iphonese'}-start-spotlight.png` }); }
  const spotBefore = await p.evaluate(() => window.__fbs.spot.id), factBefore = await p.evaluate(() => window.__fbs.spot.fact);

  // --- pure math ---
  const m = await p.evaluate(() => {
    const c = window.__fbs.computeDrop;
    return {
      right: c({ x: 100, w: 200 }, { x: 130, w: 200 }),
      left: c({ x: 100, w: 200 }, { x: 60, w: 200 }),
      perfect: c({ x: 100, w: 200 }, { x: 103, w: 200 }),
      notPerfect: c({ x: 100, w: 200 }, { x: 105, w: 200 }),
      miss: c({ x: 100, w: 200 }, { x: 301, w: 200 }),
      edge: c({ x: 100, w: 200 }, { x: 299, w: 200 }),
      stick: c({ x: 100, w: 200 }, { x: 112, w: 200 }, { stickPx: 14 }),
      noStick: c({ x: 100, w: 200 }, { x: 120, w: 200 }, { stickPx: 14 }),
      spring: c({ x: 100, w: 200 }, { x: 140, w: 200 }, { springBack: 0.25 }),
      align: c({ x: 100, w: 200 }, { x: 115, w: 200 }, { perfectPx: 16 }),
    };
  });
  ok(T('trim right: x/w/cut'), m.right.x === 130 && m.right.w === 170 && m.right.cut.x === 300 && m.right.cut.w === 30, m.right);
  ok(T('trim left: x/w/cut'), m.left.x === 100 && m.left.w === 160 && m.left.cut.x === 60 && m.left.cut.w === 40, m.left);
  ok(T('trim conserves width'), m.right.w + m.right.cut.w === 200 && m.left.w + m.left.cut.w === 200);
  ok(T('perfect within 4px snaps'), m.perfect.perfect && m.perfect.x === 100 && m.perfect.w === 200);
  ok(T('5px off is not perfect'), !m.notPerfect.perfect && m.notPerfect.w === 195);
  ok(T('complete miss detected'), m.miss.miss === true && m.edge.hit && m.edge.w === 1);
  ok(T('self-adhesive sticks <=14px'), m.stick.stuck && m.stick.w === 200 && !m.noStick.stuck && m.noStick.w === 180);
  ok(T('spring-back keeps 25%'), m.spring.w === 170 && m.spring.cut.w === 30 && m.spring.x === 140, m.spring);
  ok(T('slide-align window 16px'), m.align.perfect && m.align.x === 100);

  // --- products ---
  const prod = await p.evaluate(() => window.__fbs.products.map(p => ({ id: p.id, name: p.name, description: p.description, tagline: p.tagline, trait: p.trait })));
  const catIds = CAT.products.map(x => x.id);
  const missing = CAT.products.filter(c => !prod.find(g => g.id === c.id && g.name === c.name && g.description === c.description && g.tagline === c.tagline));
  ok(T(`every catalog product (${catIds.length}) in game with real name/description`), missing.length === 0 && prod.length === catIds.length, missing.map(x => x.id));
  const traitIds = prod.map(x => x.trait.id), traitNames = prod.map(x => x.trait.name);
  ok(T('each product has a unique trait'), new Set(traitIds).size === prod.length && new Set(traitNames).size === prod.length && prod.every(x => x.trait.text && x.trait.basis));
  ok(T('each trait is based on stated catalog text'), prod.every(x => { const c = CAT.products.find(y => y.id === x.id); return [c.description, ...c.benefits].join(' ').includes(x.trait.basis); }));

  // --- gameplay ---
  await p.click('#btnPlay'); await p.waitForTimeout(200);
  ok(T('HUD visible during play'), await p.isVisible('#hud') && await p.isVisible('#btnPause'));
  ok(T('gameplay ticker shows same spotlight position'), await p.isVisible('#spotTicker') && (await p.getAttribute('#spotTicker', 'data-id')) === spotBefore);
  ok(T('fact bar shows same fact as start screen'), await p.isVisible('#factBar') && (await p.getAttribute('#factBar', 'data-fact')) === factBefore);
  ok(T('extrusion pop-up shows the name only and does not advance rotation'), await p.isVisible('#deckBlurb') && (await p.textContent('#deckBlurb')).startsWith('Off the line') && (await p.evaluate(() => window.__fbs.spot.id)) === spotBefore);
  const tickFont = await p.evaluate(() => parseFloat(getComputedStyle(document.getElementById('spotTicker')).fontSize));
  ok(T('gameplay ticker font >= 15'), tickFont >= 15, tickFont);
  const tickFit = [];
  for (let k = 0; k < 16; k++) { await p.evaluate(() => window.__fbs.spot.next()); for (const sel of ['#spotTicker', '#factBar']) { const f = await fitCheck(sel); if (!f.ok) tickFit.push({ sel, ...f }); } }
  for (let k = 0; k < facts.length; k++) { await p.evaluate(() => window.__fbs.spot.next()); const f = await fitCheck('#factBar'); if (!f.ok) tickFit.push({ sel: 'fact', ...f }); }
  ok(T('every blurb and fact fits the gameplay bars'), tickFit.length === 0, tickFit);
  const tickTop = await p.evaluate(() => document.getElementById('spotTicker').getBoundingClientRect().top);
  const lay = await p.evaluate(() => { const bb = document.getElementById('bottomBar').getBoundingClientRect(); const S = window.__fbs.S; return { barTop: bb.top, H: innerHeight }; });
  ok(T('bottom bars sit low (stack top stays clear)'), lay.barTop > lay.H * 0.68, lay);
  ok(T('play: tap targets >= 44'), (await smallTargets(p)).length === 0, await smallTargets(p));
  const before = await p.evaluate(() => window.__fbs.S.stack.length);
  await placeAndTap(p, touch, 30, 'insite-reveal');
  const after = await p.evaluate(() => { const S = window.__fbs.S; const a = S.stack[S.stack.length - 2], b = S.stack[S.stack.length - 1]; return { n: S.stack.length, w: b.w, pw: a.w, x: b.x, px: a.x, falling: S.falling.length, combo: S.combo }; });
  ok(T('a tap drops a board'), after.n === before + 1, after);
  ok(T('trim in game: width reduced by offset, piece falls'), Math.abs(after.w - (after.pw - 30)) < 0.01 && Math.abs(after.x - (after.px + 30)) < 0.01 && after.falling === 1, after);
  await placeAndTap(p, touch, -2, 'insite-reveal');
  const perf = await p.evaluate(() => { const S = window.__fbs.S; const a = S.stack[S.stack.length - 2], b = S.stack[S.stack.length - 1]; return { combo: S.combo, x: b.x, px: a.x, w: b.w, pw: a.w, perfects: S.perfects, parts: S.parts.length }; });
  ok(T('perfect drop detected + snapped + particles'), perf.combo === 1 && perf.perfects === 1 && perf.x === perf.px && perf.w === perf.pw && perf.parts > 0, perf);
  // trait checks in-game
  await placeAndTap(p, touch, 10, 'insite-psa');
  const st = await p.evaluate(() => { const S = window.__fbs.S; const a = S.stack[S.stack.length - 2], b = S.stack[S.stack.length - 1]; return { w: b.w, pw: a.w }; });
  ok(T('Self-Adhesive board sticks small overhang in game'), st.w === st.pw, st);
  const fl0 = await p.evaluate(() => window.__fbs.S.floors);
  await placeAndTap(p, touch, 0, 'ryno-board');
  ok(T('Ryno Board counts as 2 floors'), (await p.evaluate(() => window.__fbs.S.floors)) === fl0 + 2);
  const s0 = await p.evaluate(() => window.__fbs.S.score);
  await placeAndTap(p, touch, 20, 'resilient-mount');
  ok(T('Resilient MOUNT +5 bonus'), (await p.evaluate(() => window.__fbs.S.score)) === s0 + 6);
  const coll = await p.evaluate(() => window.__fbs.collection());
  ok(T('stacked boards unlock in collection'), ['insite-reveal', 'insite-psa', 'ryno-board', 'resilient-mount'].every(id => coll.includes(id)), coll);
  // Gilco bounce back
  await p.evaluate(() => { const f = window.__fbs; f.setProduct('gilco-styrene'); f.freeze(); f.setMovingX(-500); });
  await tapCanvas(p, touch); await p.waitForTimeout(30);
  ok(T('Gilco Styrene bounces back once on a miss'), await p.evaluate(() => window.__fbs.S.mode === 'play' && window.__fbs.S.moving.retry === true));
  // pause / resume
  await p.click('#btnPause'); await p.waitForTimeout(100);
  ok(T('pause shows overlay'), await p.isVisible('#pause') && (await p.evaluate(() => window.__fbs.S.mode)) === 'pause');
  ok(T('pause: tap targets'), (await smallTargets(p)).length === 0, await smallTargets(p));
  await p.click('#btnLegalPause'); await p.waitForTimeout(100);
  ok(T('Legal opens from pause'), await p.isVisible('#legal'));
  await p.click('#btnLegalClose'); await p.waitForTimeout(100);
  ok(T('Legal closes back to pause'), await p.isVisible('#pause'));
  await p.click('#btnResume'); await p.waitForTimeout(100);
  ok(T('resume'), (await p.evaluate(() => window.__fbs.S.mode)) === 'play');
  // natural play for a gameplay screenshot: near-perfect drops with moving board in motion
  for (let i = 0; i < 9; i++) {
    await p.evaluate(i => { const f = window.__fbs, S = f.S; const t = S.stack[S.stack.length - 1]; f.setMovingX(t.x + (i % 3 === 2 ? 9 : 1)); }, i);
    await tapCanvas(p, touch); await p.waitForTimeout(140);
  }
  await p.evaluate(() => { const f = window.__fbs, S = f.S; f.setMovingX(S.stack[S.stack.length - 1].x + 1); });
  await tapCanvas(p, touch); await p.waitForTimeout(160);
  const gs = await p.evaluate(() => ({ h: window.__fbs.S.height, score: window.__fbs.S.score, txt: document.getElementById('score').textContent }));
  ok(T('score HUD updates'), gs.txt === String(gs.score) && gs.h >= 14, gs);
  ok(T('play: no overflow'), await noOverflow(p));
  const shotName = { iphone15: 'iphone15-gameplay', iphoneSE: 'iphonese-gameplay', chromium: 'chromium-gameplay', pixel7: 'v2-android-pixel7-gameplay', galaxyS8: 'v2-android-galaxys8-gameplay' }[tag];
  await p.screenshot({ path: `${SHOTS}/${shotName}.png` });
  // game over
  const score = await p.evaluate(() => window.__fbs.S.score);
  await p.evaluate(() => { const f = window.__fbs; f.setProduct('infinity'); f.freeze(); f.setMovingX(-900); });
  await tapCanvas(p, touch); await p.waitForTimeout(1400);
  ok(T('game over triggers on complete miss'), await p.isVisible('#over') && (await p.evaluate(() => window.__fbs.S.mode)) === 'over');
  ok(T('game over shows score + Great stack + hosts'), (await p.textContent('#finalScore')) === String(score) && (await p.textContent('#over h2')).includes('Great stack') && (await p.$$('#overHosts canvas')).length === 2);
  const overFit = [];
  for (let k = 0; k < 16; k++) { await p.evaluate(() => window.__fbs.spot.next()); const f = await fitCheck('#spotOver'); if (!f.ok) overFit.push(f); }
  ok(T('every blurb fits the game-over spotlight'), overFit.length === 0 && await p.isVisible('#spotOver'), overFit);
  ok(T('short legal line on game over'), await p.isVisible('#over .legal-short'));
  ok(T('over: tap targets'), (await smallTargets(p)).length === 0, await smallTargets(p));
  ok(T('over: no overflow / on screen'), await noOverflow(p) && (await offscreen(p)).length === 0, await offscreen(p));
  await p.screenshot({ path: `${SHOTS}/${{ iphone15: 'iphone15', iphoneSE: 'iphonese', chromium: 'chromium', pixel7: 'v2-android-pixel7', galaxyS8: 'v2-android-galaxys8' }[tag]}-gameover.png` });
  // collection
  await p.click('#btnCollOver'); await p.waitForTimeout(150);
  const cards = await p.$$eval('#cards .card', cs => cs.map(c => ({ id: c.dataset.id, locked: c.classList.contains('locked'), trait: c.querySelector('.trait').textContent })));
  ok(T('collection lists all products'), cards.length === CAT.products.length);
  ok(T('unlocked cards show trait, locked hidden'), cards.filter(c => !c.locked).every(c => !c.trait.includes('🔒')) && cards.filter(c => c.locked).every(c => c.trait.includes('🔒')) && cards.some(c => !c.locked));
  ok(T('collection: no horizontal overflow'), await p.evaluate(() => { const c = document.getElementById('coll'); return c.scrollWidth <= c.clientWidth + 1; }) && await noOverflow(p));
  ok(T('collection: tap targets'), (await smallTargets(p)).length === 0, await smallTargets(p));
  if (tag === 'iphone15' || tag === 'iphoneSE') await p.screenshot({ path: `${SHOTS}/${tag === 'iphone15' ? 'iphone15' : 'iphonese'}-collection.png` });
  await p.click('#btnCollClose'); await p.waitForTimeout(100);
  ok(T('collection closes back to game over'), await p.isVisible('#over'));
  // best persists
  const lastSpot = await p.evaluate(() => ({ id: window.__fbs.spot.id, fact: window.__fbs.spot.fact }));
  await p.reload(); await p.waitForTimeout(500);
  const bestLS = await p.evaluate(() => JSON.parse(localStorage.getItem('fbs.best')));
  ok(T('best score persists across reload'), bestLS === score, { bestLS, score });
  await p.click('#btnPlay'); await p.waitForTimeout(100);
  ok(T('best shown in HUD after reload'), (await p.textContent('#best')) === 'Best ' + score);
  ok(T('spotlight position persists across reload'), (await p.evaluate(() => window.__fbs.spot.id)) === lastSpot.id && (await p.evaluate(() => window.__fbs.spot.fact)) === lastSpot.fact, lastSpot);
  ok(T('collection persists across reload'), (await p.evaluate(() => window.__fbs.collection().length)) >= 4);
  // full unlocked collection screenshot
  if (tag === 'iphone15') {
    await p.goto(BASE + '?unlockall&nospot'); await p.waitForTimeout(400); await p.click('#btnCollStart'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${SHOTS}/iphone15-collection-all.png` });
  }
  if (tag === 'iphone15') {
    await p.goto(BASE); await p.waitForTimeout(300);
    const t0 = await p.evaluate(() => ({ id: window.__fbs.spot.id, at: window.__fbs.spot.shownAt, d: window.__fbs.spot.durationFor(window.__fbs.products.find(x => x.id === window.__fbs.spot.id)) }));
    await p.waitForFunction(id => window.__fbs.spot.id !== id, t0.id, { timeout: 16000 });
    const t1 = await p.evaluate(() => window.__fbs.spot.shownAt);
    ok(T('live rotation waits the full read time before changing'), t1 - t0.at >= t0.d && t1 - t0.at < t0.d + 1500, { el: t1 - t0.at, d: t0.d });
  }
  // sprites
  await p.goto(BASE + '?sprites&nospot'); await p.waitForTimeout(400);
  const spr = await p.evaluate(() => {
    const out = [];
    for (const h of FBS_CONFIG.HOSTS) for (let f = 0; f < 4; f++) { const c = FBS_SPRITES.frameCanvas(h, f); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; out.push({ h: h.id, f, n, sig: c.toDataURL().length + ':' + n }); }
    return out;
  });
  ok(T('sprites: 2 hosts × 4 frames drawn'), spr.length === 8 && spr.every(s => s.n > 200), spr);
  ok(T('sprites: frames differ (idle/cheer animate)'), new Set(spr.filter(s => s.h === 'evan').map(s => s.sig)).size >= 3);
  if (tag === 'iphone15') await p.locator('#spriteSheet').screenshot({ path: `${SHOTS}/owners-sprites.png` });
  // SW
  if (browserType === 'chromium') {
    await p.goto(BASE); await p.waitForTimeout(1500);
    const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { reg: !!r, caches: await caches.keys() }; });
    ok(T('service worker registered with fbs-v2 cache'), sw.reg && sw.caches.includes('fbs-v2'), sw);
  }
  if (tag === 'pixel7' || tag === 'galaxyS8') {
    await p.goto(BASE + '?nospot'); await p.waitForTimeout(400);
    const a = await p.evaluate(async () => {
      const cv = document.getElementById('game'), cs = getComputedStyle(cv), bs = getComputedStyle(document.body);
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.getElementById('btnPlay').dispatchEvent(ev);
      const man = await (await fetch('manifest.json')).json();
      return { touch: cs.touchAction, over: bs.overscrollBehaviorY || bs.overscrollBehavior, ctxBlocked: ev.defaultPrevented, dpr: cv.width / innerWidth, devDpr: devicePixelRatio,
        theme: document.querySelector('meta[name=theme-color]').content, display: man.display, theme2: man.theme_color,
        mask: man.icons.filter(i => i.purpose === 'maskable').map(i => i.sizes).sort().join(','), og: !!document.querySelector('meta[property="og:image"]') && !!document.querySelector('meta[name="twitter:card"]'), noindex: document.querySelector('meta[name=robots]').content };
    });
    ok(T('Android: canvas touch-action none, no overscroll/pull-to-refresh'), a.touch === 'none' && a.over === 'none', a);
    ok(T('Android: long-press menu blocked on controls'), a.ctxBlocked, a);
    ok(T('Android: devicePixelRatio capped at 2'), a.dpr <= 2.01 && (a.devDpr <= 2 || Math.abs(a.dpr - 2) < 0.01), a);
    ok(T('Android: manifest standalone + theme + maskable 192/512'), a.display === 'standalone' && a.theme2 && a.theme && a.mask === '192x192,512x512', a);
    ok(T('Android: OG/Twitter preview meta present, noindex kept'), a.og && a.noindex.includes('noindex'), a);
    const vib = await p.evaluate(() => typeof navigator.vibrate === 'function');
    ok(T('Android: navigator.vibrate available for haptics'), vib);
    if (tag === 'pixel7') {
      const cdp = await ctx.newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await p.click('#btnPlay'); await p.waitForTimeout(300);
      const fps = await p.evaluate(() => new Promise(res => { let n = 0, worst = 0, last = performance.now(); const t0 = last; function f(t) { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(f); else res({ fps: n / ((t - t0) / 1000), worst }); } requestAnimationFrame(f); }));
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      perfLog.push(fps);
      ok(T('Android: ~60fps with 4x CPU throttle'), fps.fps >= 55, fps);
    }
  }
  ok(T('no console/page errors'), errs.length === 0, errs);
  await b.close();
}

(async () => {
  const which = process.argv[2];
  if (!which || which === 'iphone15') await suite('webkit', 'iPhone 15', 'iphone15');
  if (!which || which === 'se') await suite('webkit', 'iPhone SE', 'iphoneSE');
  if (!which || which === 'chromium') await suite('chromium', null, 'chromium');
  if (!which || which === 'android' || which === 'pixel7') await suite('chromium', 'Pixel 7', 'pixel7');
  if (!which || which === 'android' || which === 'galaxy') await suite('chromium', 'Galaxy S8', 'galaxyS8');
  if (perfLog.length) console.log('perf', JSON.stringify(perfLog));
  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
