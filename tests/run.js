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
  await p.evaluate(() => window.__fbs.finishExtrusion()); 
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

  await p.goto(BASE + '?seed=7&nospot&nobill'); await p.waitForTimeout(600);
  const au0 = await p.evaluate(() => ({ unlocked: window.FBS_AUDIO.state.unlocked, hasCtx: !!window.FBS_AUDIO.state.ctx }));
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

  // --- duplicate audit (content) ---
  const STOP = new Set('a an the and or of for to in on with by is it its at as that this from per your you can be are into'.split(' '));
  const toks = s => s.toLowerCase().replace(/[®™“”"'’,.:;()–—-]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
  const grams = (s, n) => { const w = toks(s), g = new Set(); for (let i = 0; i + n <= w.length; i++) g.add(w.slice(i, i + n).join(' ')); return g; };
  const jac = (a, b) => { const A = new Set(toks(a)), B = new Set(toks(b)); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i || 1); };
  const allB = await p.evaluate(() => window.__fbs.products.map(x => ({ id: x.id, b: x.blurb }))), allF = await p.evaluate(() => window.__fbs.facts.map(f => f.text));
  const bbDup = []; for (let i = 0; i < allB.length; i++) for (let j = i + 1; j < allB.length; j++) { const gi = grams(allB[i].b, 3), gj = grams(allB[j].b, 3); const sh = [...gi].filter(x => gj.has(x)); if (sh.length || jac(allB[i].b, allB[j].b) > 0.3) bbDup.push([allB[i].id, allB[j].id, sh, jac(allB[i].b, allB[j].b).toFixed(2)]); }
  ok(T('no two product blurbs share near-identical wording'), bbDup.length === 0, bbDup);
  const bfDup = []; for (const x of allB) for (const f of allF) { const gi = grams(x.b, 2), gf = grams(f, 2); const sh = [...gi].filter(g => gf.has(g)); if (sh.length || jac(x.b, f) > 0.2) bfDup.push([x.id, f, sh]); }
  ok(T('company facts never restate a product blurb'), bfDup.length === 0, bfDup);
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
  ok(T('start: product trivia on top, company fact below'), await p.isVisible('#spotStart') && (await p.textContent('#spotStart')).includes('Product spotlight') && !(await p.getAttribute('#spotStart', 'data-fact')) && !!(await p.getAttribute('#factStart', 'data-fact')) && await p.evaluate(() => document.getElementById('spotStart').getBoundingClientRect().bottom < document.getElementById('btnPlay').getBoundingClientRect().top && document.getElementById('factStart').getBoundingClientRect().top > document.getElementById('btnPlay').getBoundingClientRect().bottom));
  const facts = await p.evaluate(() => window.__fbs.facts);
  ok(T(`company facts (${facts.length}) each have a gilmanbrothers.com source URL`), facts.length >= 12 && facts.every(f => /^https:\/\/gilmanbrothers\.com\//.test(f.source) && f.text.length > 20) && new Set(facts.map(f => f.id)).size === facts.length);
  const dur = await p.evaluate(() => window.__fbs.products.map(x => ({ id: x.id, d: window.__fbs.spot.durationFor(x), w: (x.name + ' ' + x.blurb).split(/\s+/).length })));
  ok(T('read time: >=7s and 250ms/word + 2s for every blurb'), dur.every(x => x.d >= 7000 && x.d === Math.max(7000, 2000 + 250 * x.w) && x.d <= 13000), dur);
  const cyc = await p.evaluate(() => { const sp = window.__fbs.spot, out = []; for (let k = 0; k < 64; k++) { sp.next(); out.push({ id: sp.id, fact: sp.fact, card: document.getElementById('spotStart').dataset.id, cardFact: document.getElementById('factStart').dataset.fact, overFact: document.getElementById('factOver').dataset.fact, ticker: document.getElementById('spotTicker').dataset.id, bar: document.getElementById('factBar').dataset.fact }); } return out; });
  const bagStart = await p.evaluate(() => window.__fbs.spot.bags().p.pos);
  const ids = cyc.map(c => c.id);
  // find cycle boundaries from the bag position: check every 16-window aligned to the bag covers all products
  const aligned = []; const off = (16 - ((bagStart + 1) % 16)) % 16; // index where a new bag starts
  for (let k = (64 - 1 - bagStart) % 16; k + 16 <= 64; k += 16) aligned.push(new Set(ids.slice(k, k + 16)).size);
  ok(T('shuffle-bag shows all 16 before any repeat'), aligned.length >= 3 && aligned.every(n => n === 16), { aligned, bagStart });
  ok(T('no product back-to-back (incl. across reshuffles)'), ids.every((id, k) => k === 0 || id !== ids[k - 1]));
  ok(T('order is randomized (not catalog order)'), ids.slice(0, 16).join() !== (await p.evaluate(() => window.__fbs.products.map(x => x.id).join())));
  ok(T('fact changes in sync with the blurb'), cyc.every((c, k) => c.card === c.id && c.ticker === c.id && c.cardFact === c.fact && c.overFact === c.fact && c.bar === c.fact && (k === 0 || c.fact !== cyc[k - 1].fact)));
  const fids = cyc.map(c => c.fact);
  ok(T('facts shuffle-bag covers every fact'), new Set(fids.slice(0, 2 * facts.length > 64 ? 64 : 2 * facts.length)).size === facts.length);
  const startFit = [];
  for (let k = 0; k < 16; k++) { await p.evaluate(() => window.__fbs.spot.next()); for (const sel of ['#spotStart', '#factStart']) { const f = await fitCheck(sel); if (!f.ok) startFit.push({ sel, ...f }); } }
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
  const au1 = await p.evaluate(async () => { const A = window.FBS_AUDIO; for (let i = 0; i < 20 && !A.running; i++) await new Promise(r => setTimeout(r, 50)); return { unlocked: A.state.unlocked, state: A.state.ctx && A.state.ctx.state, session: navigator.audioSession ? navigator.audioSession.type : 'unsupported', silentFallback: !navigator.audioSession }; });
  ok(T('audio: locked before the first tap, unlocked + running after it'), !au0.unlocked && !au0.hasCtx && au1.unlocked && au1.state === 'running', { au0, au1 });
  ok(T('audio: iOS audioSession set to "playback" where supported (silent <audio> fallback otherwise)'), au1.session === 'playback' || (au1.session === 'unsupported' && au1.silentFallback), au1);
  ok(T('HUD visible during play'), await p.isVisible('#hud') && await p.isVisible('#btnPause'));
  ok(T('gameplay ticker shows same spotlight position'), await p.isVisible('#spotTicker') && (await p.getAttribute('#spotTicker', 'data-id')) === spotBefore);
  const lay3 = await p.evaluate(() => { const S = window.__fbs.S, r = S.palletRect, hr = S.hostRects, tk = document.getElementById('spotTicker').getBoundingClientRect(), fb = document.getElementById('bottomBar').getBoundingClientRect(), hud = document.getElementById('hud').getBoundingClientRect();
    const palTop = r.y + window.__fbs.T.DEPTH_Y; return { palTop, mids: hr.map(h => h.y + h.h / 2), feet: hr.map(h => h.y + h.h), tickTop: tk.top, tickBottom: tk.bottom, scoreBottom: document.getElementById('best').getBoundingClientRect().bottom, barTop: fb.top, cam: S.cam }; });
  ok(T('opening view: pallet top deck within 3px of the hosts\' vertical midpoint'), lay3.cam === 0 && lay3.mids.every(m => Math.abs(m - lay3.palTop) <= 3), lay3);
  ok(T('gameplay: product trivia under the HUD at top, company fact in bottom bar below hosts\' feet'), lay3.tickTop >= lay3.scoreBottom && lay3.feet.every(f => f <= lay3.barTop) && lay3.tickBottom < lay3.palTop, lay3);
  const dup = await p.evaluate(() => {
    const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !el.closest('[hidden]'); };
    const sents = []; for (const el of document.querySelectorAll('#hud *, #bottomBar *, .screen:not([hidden]) *')) { if (el.children.length || !vis(el)) continue; for (const s of el.textContent.split(/[.–·]/).map(x => x.trim().toLowerCase()).filter(x => x.length > 18)) sents.push(s); }
    const seen = new Set(), d = []; for (const s of sents) { if (seen.has(s)) d.push(s); seen.add(s); } return d;
  });
  ok(T('gameplay: no product fact shown twice on screen'), dup.length === 0, dup);
  // gauge: rendered thickness / real gauge is one constant for every product and gauge
  const gz = await p.evaluate(() => { const f = window.__fbs, S = f.S, out = [];
    for (const pr of f.products) for (const g of pr.gauges) { f.setProduct(pr.id, g.label); out.push({ id: pr.id, g: g.label, inches: g.inches, t: S.moving.t, r: S.moving.t / g.inches, stencil: S.lineName }); }
    const landed = S.stack.filter(b => !b.base).map(b => b.t / b.gauge.inches); return { out, landed, ppi: S.ppi, hh: f.geo().hh }; });
  const r0 = gz.out[0].r, byIn = {}; for (const o of gz.out) (byIn[o.inches] = byIn[o.inches] || new Set()).add(o.t);
  const sortedIn = Object.keys(byIn).map(Number).sort((a, b) => a - b);
  ok(T(`gauge: thickness ÷ gauge constant for all ${gz.out.length} product/gauge pairs (${r0.toFixed(2)} px/in)`), gz.out.every(o => Math.abs(o.r - r0) < 1e-9) && gz.landed.every(x => Math.abs(x - r0) < 1e-9) && sortedIn.every((v, i) => i === 0 || [...byIn[v]][0] > [...byIn[sortedIn[i - 1]]][0]), { r0, bad: gz.out.filter(o => Math.abs(o.r - r0) > 1e-9) });
  ok(T('gauge: 3/16" ≈ 3–4px and 1" ≈ 16–20px (iPhone 15) and every board shows its gauge on the extruder'), (tag !== 'iphone15' || (Math.abs(r0 * 3 / 16 - 3.5) <= 0.5 && r0 >= 16 && r0 <= 20)) && gz.out.every(o => o.stencil.endsWith(' · ' + o.g)), { r0, at316: r0 * 3 / 16 });
  const camOk = await p.evaluate(() => { const S = window.__fbs.S, tp = S.stack[S.stack.length - 1], sum = S.stack.reduce((a, b) => a + b.t, 0); return Math.abs(tp.y + tp.t - sum) < 1e-6; });
  ok(T('stack height (camera input) is the sum of real board thicknesses'), camOk);
  // Perfect: Evan says "Excellent", Cyrus says "Good job", both at once, cheering, bubbles on screen and apart
  await p.evaluate(() => window.__fbs.finishExtrusion());
  await p.evaluate(() => { const f = window.__fbs, S = f.S; for (const h of S.hostState) h.bubble = null; S.bubbleRects = {}; f.freeze(); f.setMovingX(S.stack[S.stack.length - 1].x); f.drop(); });
  await p.waitForTimeout(120);
  const pb = await p.evaluate(() => { const S = window.__fbs.S, hs = S.hostState, r = S.bubbleRects || {}, tp = S.stack[S.stack.length - 1];
    return { hosts: window.FBS_CONFIG.HOSTS.map(h => h.short), t0: hs[0].bubble && hs[0].bubble.text, t1: hs[1].bubble && hs[1].bubble.text, a0: hs[0].anim, a1: hs[1].anim, L: r.left, R: r.right, W: innerWidth, H: innerHeight, stL: tp.x, stR: tp.x + tp.w + window.__fbs.T.DEPTH_X, stTop: S.stackTopY, perfect: S.perfects }; });
  const inScr = b => b && b.x >= 0 && b.y >= 0 && b.x + b.w <= pb.W && b.y + b.h <= pb.H;
  ok(T('Perfect: Evan says "Excellent" and Cyrus says "Good job" together, both cheering'), pb.perfect >= 1 && pb.hosts[0] === 'Evan' && pb.hosts[1] === 'Cyrus' && pb.t0 === 'Excellent' && pb.t1 === 'Good job' && pb.a0 === 'cheer' && pb.a1 === 'cheer' && pb.L && pb.L.text === 'Excellent' && pb.R && pb.R.text === 'Good job', pb);
  ok(T('Perfect bubbles on screen, not overlapping each other or the stack'), inScr(pb.L) && inScr(pb.R) && pb.L.x + pb.L.w <= pb.R.x && [pb.L, pb.R].every(b => !(b.x < pb.stR && b.x + b.w > pb.stL && b.y + b.h > pb.stTop)), pb);
  // ADHERE™: a fastener power-up, not a board
  const perfectDrop = () => p.evaluate(async () => { const f = window.__fbs; await f.finishExtrusion(); const S = f.S; f.freeze(); f.setMovingX(S.stack[S.stack.length - 1].x); f.drop(); });
  const ad0 = await p.evaluate(() => { const f = window.__fbs; return { all: f.products.length, boards: f.boards.length, inBoards: f.boards.some(b => b.id === 'adhere'), kind: f.products.find(x => x.id === 'adhere').kind, stackHas: f.S.stack.some(b => b.p && b.p.id === 'adhere') }; });
  ok(T('ADHERE™ is an accessory: 16 products, 15 boards, never in the board pool'), ad0.all === 16 && ad0.boards === 15 && !ad0.inBoards && ad0.kind === 'accessory' && !ad0.stackHas, ad0);
  await p.evaluate(() => { const S = window.__fbs.S; S.perfStreak = 0; S.adhere = 0; S.adhereArmed = false; S.rain = 0; S.heatNext = false; });
  for (let k = 0; k < 3; k++) await perfectDrop();
  const ad1 = await p.evaluate(() => { const S = window.__fbs.S, b = document.getElementById('btnAdhere'), r = b.getBoundingClientRect(); return { n: S.adhere, streak: S.perfStreak, coll: window.__fbs.collection().includes('adhere'), vis: !b.hidden && r.width >= 44 && r.height >= 44, cnt: document.getElementById('adhereCount').textContent, pop: document.getElementById('deckBlurb').textContent, rect: { x: r.x, y: r.y, w: r.width, h: r.height } }; });
  ok(T('ADHERE™ earned after 3 Perfects in a row; ≥44pt button with count; pop-up text'), ad1.n === 1 && ad1.coll && ad1.vis && ad1.cnt === '1' && ad1.pop.includes('ADHERE™ — holds up to ½ lb/sq in, removes damage-free'), ad1);
  const adBlock = await p.evaluate(() => { const r = document.getElementById('btnAdhere').getBoundingClientRect(), pr = window.__fbs.S.palletRect; return r.bottom < pr.y - 40; });
  ok(T('ADHERE™ button sits in the HUD, clear of the stack'), adBlock);
  const capN = await p.evaluate(() => { const f = window.__fbs; f.earnAdhere(); f.earnAdhere(); f.earnAdhere(); return f.S.adhere; });
  ok(T('ADHERE™ cap is 2'), capN === 2, capN);
  const ad2 = await p.evaluate(async () => { const f = window.__fbs; await f.finishExtrusion(); const S = f.S; S.rain = 0; S.combo = 3; f.toggleAdhere(); const armed = S.adhereArmed; f.freeze(); const tp = S.stack[S.stack.length - 1], off = Math.round(tp.w * 0.2); f.setMovingX(tp.x + off); const w0 = S.moving.w, x0 = S.moving.x, id = S.moving.p.id;
    f.drop(); const b = S.stack[S.stack.length - 1]; return { armed, w0, x0, w: b.w, x: b.x, adhered: !!b.adhered, n: S.adhere, combo: S.combo, armedAfter: S.adhereArmed, falling: S.falling.length, id }; });
  ok(T('armed ADHERE™ drop: overhang held (not trimmed), tabs drawn, combo kept, one used'), ad2.armed && ad2.w === ad2.w0 && ad2.x === ad2.x0 && ad2.adhered && ad2.n === 1 && ad2.combo >= 3 && !ad2.armedAfter, ad2);
  // WIDWAW: Bill VanHorn event
  await p.evaluate(() => window.__fbs.finishExtrusion());
  const trig = await p.evaluate(() => { const f = window.__fbs, S = f.S, r = {}; S.bill = null; S.billNext = 0;
    const fl = S.floors; S.floors = 5; S.rain = 0; f.updateBill(0); r.earlyFloors = !!S.bill;
    S.floors = Math.max(fl, 12); S.rain = 3; f.updateBill(0); r.rain = !!S.bill;
    S.rain = 0; S.billNext = S.playT + 100; f.updateBill(0); r.notYet = !!S.bill;
    r.window = [f.T.BILL_MIN, f.T.BILL_MAX, f.T.BILL_MIN_FLOORS, f.T.BILL_DUR]; return r; });
  ok(T('WIDWAW: never before floor 10, never in rain, only after its 25–45 s timer'), !trig.earlyFloors && !trig.rain && !trig.notYet && trig.window[0] === 25 && trig.window[1] === 45 && trig.window[2] === 10 && trig.window[3] >= 10 && trig.window[3] <= 12, trig);
  const v0 = await p.evaluate(() => { const f = window.__fbs, S = f.S; S.moving.speed = S.moving.speed || 100; return { eff: S.moving.speed * f.boost(), base: S.moving.speed, slot: S.slot1 }; });
  await p.evaluate(() => { const S = window.__fbs.S; S.billNext = S.playT; window.__fbs.updateBill(0); });
  await p.waitForTimeout(450);
  const bw = await p.evaluate(() => { const f = window.__fbs, S = f.S, bn = document.getElementById('billBanner'), bar = document.getElementById('billBar'); return { on: !!(S.bill && S.bill.on), slot: S.slot1, bubble: S.hostState[1].bubble && S.hostState[1].bubble.text, banner: !bn.hidden && bn.textContent, bar: parseFloat(bar.style.width), eff: S.moving.speed * f.boost(), boost: f.boost(), dur: S.bill && S.bill.dur }; });
  ok(T('WIDWAW: Bill takes Cyrus\'s spot and shouts "WIDWAW" with the banner'), v0.slot === 'cyrus' && bw.on && bw.slot === 'bill' && bw.bubble === 'WIDWAW' && bw.banner && bw.banner.includes('WIDWAW! Faster boards, bonus points!'), { v0, bw });
  ok(T('WIDWAW: boards ~40% faster (slide + extrusion)'), Math.abs(bw.boost - 1.4) < 1e-9 && Math.abs(bw.eff / v0.eff - 1.4) < 1e-9, { v0, bw });
  await p.waitForTimeout(500);
  const bar2 = await p.evaluate(() => parseFloat(document.getElementById('billBar').style.width));
  ok(T('WIDWAW: visible timer bar counts down'), bw.bar < 100 && bar2 < bw.bar && await p.isVisible('#billBar'), { first: bw.bar, later: bar2 });
  const pts = await p.evaluate(async () => { const f = window.__fbs, S = f.S; await f.finishExtrusion(); f.setProduct('insite-psa', '3/16"'); f.freeze(); S.rain = 0; S.moving.bonus = false; f.setMovingX(S.stack[S.stack.length - 1].x + 9); f.drop(); return S.lastPts; });
  ok(T('WIDWAW: each board scores 2×'), pts === 2, pts);
  const pb2 = await p.evaluate(async () => { const f = window.__fbs, S = f.S; await f.finishExtrusion(); for (const h of S.hostState) h.bubble = null; f.freeze(); f.setMovingX(S.stack[S.stack.length - 1].x); f.drop(); await new Promise(r => setTimeout(r, 60)); return { t0: S.hostState[0].bubble && S.hostState[0].bubble.text, t1: S.hostState[1].bubble && S.hostState[1].bubble.text, slot: S.slot1 }; });
  ok(T('WIDWAW: on a Perfect Evan says "Excellent" and Bill says "Good job"'), pb2.t0 === 'Excellent' && pb2.t1 === 'Good job' && pb2.slot === 'bill', pb2);
  await p.evaluate(() => { const S = window.__fbs.S; S.bill.t = S.bill.dur - 0.02; });
  await p.waitForTimeout(700);
  const billAfter = await p.evaluate(() => { const f = window.__fbs, S = f.S; return { bill: S.bill, slot: S.slot1, boost: f.boost(), banner: document.getElementById('billBanner').hidden, next: S.billNext - S.playT }; });
  ok(T('WIDWAW ends: Bill poofs out, Cyrus returns, speed restored exactly, next event 25–45 s away'), billAfter.bill === null && billAfter.slot === 'cyrus' && billAfter.boost === 1 && billAfter.banner && billAfter.next >= 24 && billAfter.next <= 45, billAfter);
  const pts1 = await p.evaluate(async () => { const f = window.__fbs, S = f.S; await f.finishExtrusion(); f.setProduct('insite-psa', '3/16"'); const sp = S.moving.speed; f.freeze(); S.moving.bonus = false; f.setMovingX(S.stack[S.stack.length - 1].x + 9); f.drop(); return { pts: S.lastPts, sp }; });
  ok(T('after WIDWAW: scoring back to 1×'), pts1.pts === 1, pts1);
  await p.evaluate(() => { window.__fbs.S.rain = 3; }); await p.waitForTimeout(120);
  const rOn = await p.evaluate(() => window.FBS_AUDIO.state.rain && window.FBS_AUDIO.state.log.includes('rainOn'));
  await p.evaluate(() => { window.__fbs.S.rain = 0; }); await p.waitForTimeout(120);
  ok(T('audio: rain loop starts in rain rounds and stops after'), rOn && await p.evaluate(() => !window.FBS_AUDIO.state.rain && window.FBS_AUDIO.state.log.includes('rainOff')));
  ok(T('fact bar shows same fact as start screen'), await p.isVisible('#factBar') && (await p.getAttribute('#factBar', 'data-fact')) === factBefore);
  // --- pallet + extrusion line ---
  const ex0 = await p.evaluate(() => { const S = window.__fbs.S, m = S.moving; return { extruding: !!m.extrude, name: S.lineName, pname: m.p.name, n: S.stack.length }; });
  ok(T('new board starts on the extrusion line, name stencilled on the extruder'), ex0.extruding && ex0.name.startsWith(ex0.pname + ' · ') && /"$/.test(ex0.name), ex0);
  await tapCanvas(p, touch);
  ok(T('board cannot be dropped while still on the extrusion line'), (await p.evaluate(() => window.__fbs.S.stack.length)) === ex0.n);
  await p.evaluate(() => window.__fbs.finishExtrusion());
  const ex1 = await p.evaluate(() => { const S = window.__fbs.S; return { log: S.extrudeLog, x: S.moving.x, die: window.__fbs.T.DIE_X, extr: S.moving.extruded, rotation: window.__fbs.spot.id }; });
  ok(T('extrusion (push + cut) takes ~0.7 s sim and completes within 0.9 s wall'), ex1.log.length >= 1 && ex1.log.every(e => e.sim >= 0.68 && e.sim <= 0.75 && e.ms <= 900) && ex1.extr, ex1.log);
  ok(T('extrusion does not interrupt the spotlight rotation'), ex1.rotation === spotBefore);
  const pal = await p.evaluate(() => { const S = window.__fbs.S, r = S.palletRect, c = document.getElementById('game'), x2 = c.getContext('2d'), dpr = c.width / innerWidth;
    const px = x2.getImageData(Math.round((r.x + r.w * 0.25) * dpr), Math.round((r.y + r.h - 3) * dpr), 1, 1).data; const bb = document.getElementById('bottomBar').getBoundingClientRect();
    return { r, px: [...px], barTop: bb.top, base: S.stack[0].base, firstOnPallet: S.stack[1] ? S.stack[1].y === S.stack[0].t : null }; });
  ok(T('wooden pallet renders (wood-coloured pixels) above the bottom bars'), pal.base && pal.px[0] > pal.px[1] && pal.px[1] > pal.px[2] && pal.px[0] > 120 && pal.r.y + pal.r.h <= pal.barTop, pal);
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
  ok(T('first board lands on the pallet'), await p.evaluate(() => { const S = window.__fbs.S; return S.stack[0].base && S.stack[1].y === S.stack[0].t; }));
  ok(T('trim in game: width reduced by offset, piece falls'), Math.abs(after.w - (after.pw - 30)) < 0.01 && Math.abs(after.x - (after.px + 30)) < 0.01 && after.falling === 1, after);
  await placeAndTap(p, touch, -2, 'insite-reveal');
  const perf = await p.evaluate(() => { const S = window.__fbs.S; const a = S.stack[S.stack.length - 2], b = S.stack[S.stack.length - 1]; return { combo: S.combo, x: b.x, px: a.x, w: b.w, pw: a.w, perfects: S.perfects, parts: S.parts.length }; });
  ok(T('perfect drop detected + snapped + particles'), perf.combo === 1 && perf.perfects >= 1 && perf.x === perf.px && perf.w === perf.pw && perf.parts > 0, perf);
  // trait checks in-game
  await placeAndTap(p, touch, 10, 'insite-psa');
  const st = await p.evaluate(() => { const S = window.__fbs.S; const a = S.stack[S.stack.length - 2], b = S.stack[S.stack.length - 1]; return { w: b.w, pw: a.w }; });
  ok(T('Self-Adhesive board sticks small overhang in game'), st.w === st.pw, st);
  const fl0 = await p.evaluate(() => window.__fbs.S.floors);
  await placeAndTap(p, touch, 0, 'ryno-board');
  ok(T('Ryno Board counts as 2 floors'), (await p.evaluate(() => window.__fbs.S.floors)) === fl0 + 2);
  await p.evaluate(() => window.__fbs.finishExtrusion()); await p.evaluate(() => { window.__fbs.S.moving.bonus = false; }); // isolate the trait from a milestone bonus board
  const s0 = await p.evaluate(() => window.__fbs.S.score);
  await placeAndTap(p, touch, 20, 'resilient-mount');
  const rm = await p.evaluate(() => { const S = window.__fbs.S, b = S.stack[S.stack.length - 1]; return { score: S.score, last: S.lastPts, id: b.p.id, trait: b.p.trait.id, bill: !!S.bill }; });
  ok(T('Resilient MOUNT +5 bonus'), rm.score === s0 + 6, { s0, ...rm });
  const coll = await p.evaluate(() => window.__fbs.collection());
  ok(T('stacked boards unlock in collection'), ['insite-reveal', 'insite-psa', 'ryno-board', 'resilient-mount'].every(id => coll.includes(id)), coll);
  // Gilco bounce back
  await p.evaluate(() => window.__fbs.finishExtrusion()); await p.evaluate(() => { const f = window.__fbs; f.setProduct('gilco-styrene'); f.freeze(); f.setMovingX(-500); });
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
    await p.evaluate(() => window.__fbs.finishExtrusion()); await p.evaluate(i => { const f = window.__fbs, S = f.S; const t = S.stack[S.stack.length - 1]; f.setMovingX(t.x + (i % 3 === 2 ? 9 : 1)); }, i);
    await tapCanvas(p, touch); await p.waitForTimeout(140);
  }
  await p.evaluate(() => window.__fbs.finishExtrusion()); await p.evaluate(() => { const f = window.__fbs, S = f.S; f.setMovingX(S.stack[S.stack.length - 1].x + 1); });
  await tapCanvas(p, touch); await p.waitForTimeout(160);
  const gs = await p.evaluate(() => ({ h: window.__fbs.S.height, score: window.__fbs.S.score, txt: document.getElementById('score').textContent }));
  ok(T('every landed board passed through the extrusion line'), await p.evaluate(() => window.__fbs.S.stack.slice(1).every(b => b.extruded === true) && window.__fbs.S.extrudeLog.every(e => e.sim <= 0.75 && e.ms <= 900)), await p.evaluate(() => window.__fbs.S.extrudeLog.map(e => Math.round(e.ms))));
  ok(T('score HUD updates'), gs.txt === String(gs.score) && gs.h >= 14, gs);
  ok(T('play: no overflow'), await noOverflow(p));
  const shotName = { iphone15: 'iphone15-gameplay', iphoneSE: 'iphonese-gameplay', chromium: 'chromium-gameplay', pixel7: 'v3-android-pixel7-gameplay', galaxyS8: 'v3-android-galaxys8-gameplay' }[tag];
  await p.screenshot({ path: `${SHOTS}/${shotName}.png` }); if (tag === 'iphone15') await p.screenshot({ path: `${SHOTS}/v3-iphone15-gameplay.png` });
  // game over
  const score = await p.evaluate(() => window.__fbs.S.score);
  await p.evaluate(() => window.__fbs.finishExtrusion()); await p.evaluate(() => { const f = window.__fbs; f.setProduct('infinity'); f.freeze(); f.setMovingX(-900); });
  await p.evaluate(() => { window.__fbs.S.adhere = Math.max(1, window.__fbs.S.adhere); window.__fbs.S.rescueUsed = false; });
  await tapCanvas(p, touch); await p.waitForTimeout(80);
  const rs = await p.evaluate(() => ({ vis: !document.getElementById('rescue').hidden, txt: document.getElementById('rescue').textContent, mode: window.__fbs.S.mode }));
  ok(T('complete miss with ADHERE™ in hand offers "Use ADHERE™ to save it?" once'), rs.vis && rs.txt.includes('Use ADHERE™ to save it?') && rs.mode === 'rescue', rs);
  await p.click('#btnRescueNo'); await p.waitForTimeout(1400);
  ok(T('game over triggers on complete miss'), await p.isVisible('#over') && (await p.evaluate(() => window.__fbs.S.mode)) === 'over');
  const slog = await p.evaluate(() => [...new Set(window.FBS_AUDIO.state.log)]);
  const needS = ['extrude', 'cut', 'drop', 'slice', 'fall', 'perfect', 'adhereEarn', 'adhereFasten', 'widwaw', 'billLeave', 'bonus', 'ui', 'rainOn', 'rainOff'];
  ok(T('audio: every game event triggered its sound'), needS.every(n => slog.includes(n)) && (slog.includes('over') || slog.includes('newBest')), { missing: needS.filter(n => !slog.includes(n)), slog });
  ok(T('audio: sound pack has every sound'), await p.evaluate(() => { const E = window.FBS_AUDIO.state.eng; return ['ui', 'extrude', 'cut', 'drop', 'slice', 'fall', 'perfect', 'cheer', 'grow', 'bonus', 'adhereEarn', 'adhereFasten', 'widwaw', 'billLeave', 'over', 'newBest'].every(n => E.sounds.includes(n)) && typeof E.bar === 'function'; }));
  ok(T('game over shows score + Great stack + hosts'), (await p.textContent('#finalScore')) === String(score) && (await p.textContent('#over h2')).includes('Great stack') && (await p.$$('#overHosts canvas')).length === 2);
  const overFit = [];
  for (let k = 0; k < 16; k++) { await p.evaluate(() => window.__fbs.spot.next()); for (const sel of ['#spotOver', '#factOver']) { const f = await fitCheck(sel); if (!f.ok) overFit.push({ sel, ...f }); } }
  ok(T('every blurb fits the game-over spotlight'), overFit.length === 0 && await p.isVisible('#spotOver'), overFit);
  ok(T('short legal line on game over'), await p.isVisible('#over .legal-short'));
  ok(T('over: tap targets'), (await smallTargets(p)).length === 0, await smallTargets(p));
  ok(T('over: no overflow / on screen'), await noOverflow(p) && (await offscreen(p)).length === 0, await offscreen(p));
  await p.screenshot({ path: `${SHOTS}/${{ iphone15: 'iphone15', iphoneSE: 'iphonese', chromium: 'chromium', pixel7: 'v2-android-pixel7', galaxyS8: 'v2-android-galaxys8' }[tag]}-gameover.png` });
  // collection
  await p.click('#btnCollOver'); await p.waitForTimeout(150);
  const cards = await p.$$eval('#cards .card', cs => cs.map(c => ({ id: c.dataset.id, locked: c.classList.contains('locked'), trait: c.querySelector('.trait').textContent })));
  ok(T('collection lists all products'), cards.length === CAT.products.length);
  const accCard = await p.evaluate(() => { const c = document.querySelector('#cards .card[data-id="adhere"]'), hs = [...document.querySelectorAll('#cards .coll-h')].map(h => h.textContent), all = [...document.querySelectorAll('#cards > *')];
    return c && { kind: c.dataset.kind, locked: c.classList.contains('locked'), txt: c.textContent, heads: hs, afterBoards: all.indexOf(c) > all.findIndex(e => e.textContent === 'Accessory') && all.filter(e => e.matches('.card[data-kind=board]')).every(e => all.indexOf(e) < all.indexOf(c)) }; });
  ok(T('ADHERE™ has its own unlocked Accessory card, separate from the 15 boards'), accCard && accCard.kind === 'accessory' && !accCard.locked && accCard.heads.length === 2 && accCard.heads[1] === 'Accessory' && accCard.afterBoards && accCard.txt.includes('½ lb') && accCard.txt.includes('Power-up'), accCard);
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
    ok(T('service worker registered with fbs-v5 cache'), sw.reg && sw.caches.includes('fbs-v5'), sw);
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
  // sound toggles persist
  await p.goto(BASE + '?nospot&nobill'); await p.waitForTimeout(400);
  await p.click('#btnMuteStart'); await p.click('#btnMusicStart'); await p.waitForTimeout(100);
  const tg1 = await p.evaluate(() => ({ mute: localStorage.getItem('fbs.mute'), music: localStorage.getItem('fbs.music') }));
  await p.reload(); await p.waitForTimeout(400);
  const tg2 = await p.evaluate(() => ({ muted: window.FBS_AUDIO.state.muted, music: window.FBS_AUDIO.state.music, icon: document.getElementById('btnMute').textContent, icon2: document.getElementById('btnMuteStart').textContent, musicOff: document.getElementById('btnMusic').classList.contains('off') }));
  ok(T('audio: mute persists across reload (🔇 shown)'), tg1.mute === 'true' && tg2.muted === true && tg2.icon === '🔇' && tg2.icon2 === '🔇', { tg1, tg2 });
  ok(T('audio: music toggle (default off) persists across reload'), tg1.music === 'true' && tg2.music === true && !tg2.musicOff, { tg1, tg2 });
  await p.click('#btnMuteStart'); await p.click('#btnMusicStart'); await p.waitForTimeout(100);
  ok(T('audio: toggles switch back (sound on, music off)'), await p.evaluate(() => localStorage.getItem('fbs.mute') === 'false' && localStorage.getItem('fbs.music') === 'false' && !window.FBS_AUDIO.state.muted && !window.FBS_AUDIO.state.music));
  const fresh = await (await p.context().browser().newContext()).newPage(); await fresh.goto(BASE + '?nospot'); await fresh.waitForTimeout(300);
  ok(T('audio: music is off by default'), await fresh.evaluate(() => window.FBS_AUDIO.state.music === false && document.getElementById('btnMusicStart').classList.contains('off'))); await fresh.close();
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
