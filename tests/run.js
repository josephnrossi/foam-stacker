/* Foam Board Stacker tests – Playwright WebKit (iPhone 15, iPhone SE) + Chromium. Run: node tests/run.js */
const pw = require('/workspace/tools/node_modules/playwright');
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:8833/';
const SHOTS = process.env.SHOTS || __dirname + '/../shots';
const CAT = JSON.parse(fs.readFileSync(__dirname + '/../tools/catalog-source.json', 'utf8'));
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0; const results = [];
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

  await p.goto(BASE + '?seed=7'); await p.waitForTimeout(600);
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
  if (tag === 'iphone15' || tag === 'iphoneSE') await p.screenshot({ path: `${SHOTS}/${tag === 'iphone15' ? 'iphone15' : 'iphonese'}-start.png` });

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
  const shotName = { iphone15: 'iphone15-gameplay', iphoneSE: 'iphonese-gameplay', chromium: 'chromium-gameplay' }[tag];
  await p.screenshot({ path: `${SHOTS}/${shotName}.png` });
  // game over
  const score = await p.evaluate(() => window.__fbs.S.score);
  await p.evaluate(() => { const f = window.__fbs; f.setProduct('infinity'); f.freeze(); f.setMovingX(-900); });
  await tapCanvas(p, touch); await p.waitForTimeout(1400);
  ok(T('game over triggers on complete miss'), await p.isVisible('#over') && (await p.evaluate(() => window.__fbs.S.mode)) === 'over');
  ok(T('game over shows score + Great stack + hosts'), (await p.textContent('#finalScore')) === String(score) && (await p.textContent('#over h2')).includes('Great stack') && (await p.$$('#overHosts canvas')).length === 2);
  ok(T('over: tap targets'), (await smallTargets(p)).length === 0, await smallTargets(p));
  ok(T('over: no overflow / on screen'), await noOverflow(p) && (await offscreen(p)).length === 0, await offscreen(p));
  await p.screenshot({ path: `${SHOTS}/${tag === 'iphone15' ? 'iphone15' : tag === 'iphoneSE' ? 'iphonese' : 'chromium'}-gameover.png` });
  // collection
  await p.click('#btnCollOver'); await p.waitForTimeout(150);
  const cards = await p.$$eval('#cards .card', cs => cs.map(c => ({ id: c.dataset.id, locked: c.classList.contains('locked'), trait: c.querySelector('.trait').textContent })));
  ok(T('collection lists all products'), cards.length === CAT.products.length);
  ok(T('unlocked cards show trait, locked hidden'), cards.filter(c => !c.locked).every(c => !c.trait.includes('🔒')) && cards.filter(c => c.locked).every(c => c.trait.includes('🔒')) && cards.some(c => !c.locked));
  ok(T('collection: no horizontal overflow'), await p.evaluate(() => { const c = document.getElementById('coll'); return c.scrollWidth <= c.clientWidth + 1; }) && await noOverflow(p));
  ok(T('collection: tap targets'), (await smallTargets(p)).length === 0, await smallTargets(p));
  if (tag !== 'chromium') await p.screenshot({ path: `${SHOTS}/${tag === 'iphone15' ? 'iphone15' : 'iphonese'}-collection.png` });
  await p.click('#btnCollClose'); await p.waitForTimeout(100);
  ok(T('collection closes back to game over'), await p.isVisible('#over'));
  // best persists
  await p.reload(); await p.waitForTimeout(500);
  const bestLS = await p.evaluate(() => JSON.parse(localStorage.getItem('fbs.best')));
  ok(T('best score persists across reload'), bestLS === score, { bestLS, score });
  await p.click('#btnPlay'); await p.waitForTimeout(100);
  ok(T('best shown in HUD after reload'), (await p.textContent('#best')) === 'Best ' + score);
  ok(T('collection persists across reload'), (await p.evaluate(() => window.__fbs.collection().length)) >= 4);
  // full unlocked collection screenshot
  if (tag === 'iphone15') {
    await p.goto(BASE + '?unlockall'); await p.waitForTimeout(400); await p.click('#btnCollStart'); await p.waitForTimeout(200);
    await p.screenshot({ path: `${SHOTS}/iphone15-collection-all.png` });
  }
  // sprites
  await p.goto(BASE + '?sprites'); await p.waitForTimeout(400);
  const spr = await p.evaluate(() => {
    const out = [];
    for (const h of FBS_CONFIG.HOSTS) for (let f = 0; f < 4; f++) { const c = FBS_SPRITES.frameCanvas(h, f); const d = c.getContext('2d').getImageData(0, 0, 24, 32).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++; out.push({ h: h.id, f, n, sig: c.toDataURL().length + ':' + n }); }
    return out;
  });
  ok(T('sprites: 2 hosts × 4 frames drawn'), spr.length === 8 && spr.every(s => s.n > 200), spr);
  ok(T('sprites: frames differ (idle/cheer animate)'), new Set(spr.filter(s => s.h === 'evan').map(s => s.sig)).size >= 3);
  if (tag === 'iphone15') await p.locator('#spriteSheet').screenshot({ path: `${SHOTS}/owners-sprites.png` });
  // SW
  if (browserType === 'chromium') {
    await p.goto(BASE); await p.waitForTimeout(1500);
    const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { reg: !!r, caches: await caches.keys() }; });
    ok(T('service worker registered with fbs-v1 cache'), sw.reg && sw.caches.includes('fbs-v1'), sw);
  }
  ok(T('no console/page errors'), errs.length === 0, errs);
  await b.close();
}

(async () => {
  const which = process.argv[2];
  if (!which || which === 'iphone15') await suite('webkit', 'iPhone 15', 'iphone15');
  if (!which || which === 'se') await suite('webkit', 'iPhone SE', 'iphoneSE');
  if (!which || which === 'chromium') await suite('chromium', null, 'chromium');
  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
