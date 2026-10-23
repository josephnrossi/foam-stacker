/* Hand-authored 32x48 pixel hosts, drawn from the Gilman family photo on gilmanbrothers.com/our-history/ (rect pixel art, no image assets).
   Evan: short silver hair, fair/ruddy, light-blue short-sleeve polo, brown belt, dark jeans, brown shoes, sturdy build.
   Bill VanHorn (guest, from his labelled headshot on gilmanbrothers.com/contact-us/): short spiky dark-brown hair with a high hairline,
   broad round face, dark rectangular glasses, big toothy smile, light stubble, white polo with a tan button. Trousers/shoes not in the photo (neutral).
   Cyrus: bald, fair, periwinkle long-sleeve button-up over a dark tee, black belt, charcoal trousers, black shoes, slim build. */
(function () {
  const OUT = '#1a1c26';
  const W = 32, H = 48;
  const EVAN = {
    skin: '#efb79c', skin2: '#d79a80', cheek: '#e58f7c', hair: '#e9e7e3', hair2: '#bdbab5', brow: '#cfccc6', eye: '#2b2a33', mouth: '#9b4a42',
    top: '#9cbbe8', top2: '#7a9bd0', collar: '#b4cdf0', belt: '#8a4f2a', buckle: '#c9a35a', leg: '#1f2a45', leg2: '#17203a', shoe: '#6b4024', shoe2: '#8a5634',
  };
  const CYRUS = {
    skin: '#eebea4', skin2: '#d39d84', cheek: '#e5a08c', dome: '#f7d3bf', temple: '#cfa892', brow: '#b8957f', eye: '#2b2a33', mouth: '#9b4a42',
    top: '#7393e6', top2: '#5574cc', collar: '#8eaaf0', tee: '#1b1b20', belt: '#1d1d22', buckle: '#c5c9d1', leg: '#4a4749', leg2: '#3a3739', shoe: '#121216', shoe2: '#3a3a44',
  };
  const BILL = {
    skin: '#f0b49a', skin2: '#d8967c', cheek: '#ea9a86', hair: '#3a2b22', hair2: '#5a4334', brow: '#3a2b22', eye: '#2b2a33', mouth: '#8f3f39',
    glass: '#2a1716', lens: '#f4c7b3', stub: '#c99b87',
    top: '#f4f5f7', top2: '#d4d8e0', collar: '#ffffff', btn: '#8a6a3a', belt: '#24242a', buckle: '#c5c9d1', leg: '#3a3f4f', leg2: '#2c3040', shoe: '#17171c', shoe2: '#3a3a44',
  };
  function billParts(f) {
    const c = BILL, cheer = f >= 2, up = f === 1 ? 1 : 0, j = f === 3 ? -2 : f === 2 ? -1 : 0, b = up + j, L = [];
    const P = (x, y, w, h, col) => L.push([x, y, w, h, col]);
    P(8, 34 + j, 7, 10, c.leg); P(17, 34 + j, 7, 10, c.leg); P(14, 34 + j, 4, 3, c.leg);   // slacks
    P(7, 44 + j, 8, 3, c.shoe); P(17, 44 + j, 8, 3, c.shoe);
    P(6, 19 + b, 20, 14, c.top);                                                            // white polo (solid build)
    if (!cheer) { P(3, 20 + b, 4, 5, c.top); P(25, 20 + b, 4, 5, c.top); P(3, 25 + b, 3, 7, c.skin); P(26, 25 + b, 3, 7, c.skin); }
    else { const s = f === 3 ? 1 : 0; P(3, 17 + b, 4, 5, c.top); P(25, 17 + b, 4, 5, c.top); P(3 - s, 9 + b, 3, 8, c.skin); P(26 + s, 9 + b, 3, 8, c.skin); P(2 - s, 6 + b, 4, 3, c.skin); P(26 + s, 6 + b, 4, 3, c.skin); }
    P(12, 17 + b, 8, 3, c.skin);                                                            // neck
    P(9, 4 + b, 14, 14, c.skin); P(10, 18 + b, 12, 1, c.skin); P(8, 10 + b, 1, 4, c.skin); P(23, 10 + b, 1, 4, c.skin); // broad round face + ears
    P(10, 1 + b, 12, 3, c.hair); P(9, 3 + b, 2, 5, c.hair); P(21, 3 + b, 2, 5, c.hair);   // short spiky dark hair
    return L;
  }
  function billDetail(x, f) {
    const c = BILL, cheer = f >= 2, up = f === 1 ? 1 : 0, j = f === 3 ? -2 : f === 2 ? -1 : 0, b = up + j;
    const p = (X, Y, w = 1, h = 1, col) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
    p(10, 0 + b, 1, 1, c.hair); p(13, 0 + b, 1, 1, c.hair); p(16, 0 + b, 1, 1, c.hair); p(19, 0 + b, 1, 1, c.hair); // spikes
    p(12, 1 + b, 1, 1, c.hair2); p(15, 1 + b, 1, 1, c.hair2); p(18, 2 + b, 1, 1, c.hair2);
    p(13, 3 + b, 6, 1, c.skin); p(14, 2 + b, 4, 1, '#c99a86');                             // high hairline / thinning on top
    p(14, 4 + b, 3, 1, '#fbd9c8');                                                          // forehead shine
    p(11, 8 + b, 4, 1, c.brow); p(17, 8 + b, 4, 1, c.brow);                                 // dark brows
    // dark rectangular glasses
    p(10, 9 + b, 6, 1, c.glass); p(16, 9 + b, 6, 1, c.glass); p(10, 12 + b, 6, 1, c.glass); p(16, 12 + b, 6, 1, c.glass);
    p(10, 10 + b, 1, 2, c.glass); p(15, 10 + b, 2, 2, c.glass); p(21, 10 + b, 1, 2, c.glass); p(8, 10 + b, 2, 1, c.glass); p(22, 10 + b, 1, 1, c.glass);
    p(11, 10 + b, 4, 2, c.lens); p(17, 10 + b, 4, 2, c.lens);
    p(12, 10 + b, 2, 1, '#e9b7a2'); p(18, 10 + b, 2, 1, '#e9b7a2');                     // lids
    if (f === 1) { p(12, 11 + b, 2, 1, c.skin2); p(18, 11 + b, 2, 1, c.skin2); } else { p(12, 11 + b, 2, 1, c.eye); p(18, 11 + b, 2, 1, c.eye); } // smiling eyes behind the lenses
    p(15, 13 + b, 2, 2, c.skin2);                                                           // nose
    p(10, 13 + b, 2, 2, c.cheek); p(20, 13 + b, 2, 2, c.cheek);
    p(10, 15 + b, 2, 3, c.stub); p(20, 15 + b, 2, 3, c.stub); p(11, 18 + b, 10, 1, c.stub); p(13, 17 + b, 6, 1, c.stub); // stubble
    if (cheer) { p(12, 15 + b, 8, 2, c.mouth); p(12, 15 + b, 8, 1, '#ffffff'); p(14, 16 + b, 4, 1, '#c45a52'); }
    else { p(12, 15 + b, 8, 1, c.mouth); p(13, 15 + b, 6, 1, '#fbfbf7'); p(12, 14 + b, 1, 1, c.mouth); p(19, 14 + b, 1, 1, c.mouth); p(13, 16 + b, 6, 1, c.mouth); } // big toothy smile
    p(10, 19 + b, 5, 2, c.collar); p(17, 19 + b, 5, 2, c.collar); p(10, 21 + b, 5, 1, c.top2); p(17, 21 + b, 5, 1, c.top2); // white collar
    p(15, 19 + b, 2, 5, c.top2); p(15, 22 + b, 1, 1, c.btn);                               // placket + tan button
    p(23, 20 + b, 3, 12, c.top2); p(6, 31 + b, 20, 1, c.top2);                              // shading
    if (!cheer) { p(3, 24 + b, 4, 1, c.top2); p(25, 24 + b, 4, 1, c.top2); }
    p(6, 32 + j, 20, 2, c.belt); p(15, 32 + j, 2, 2, c.buckle);
    p(9, 35 + j, 1, 8, c.leg2); p(22, 35 + j, 1, 8, c.leg2);
    p(8, 44 + j, 3, 1, c.shoe2); p(18, 44 + j, 3, 1, c.shoe2);
  }
  function evanParts(f) {
    const c = EVAN, cheer = f >= 2, up = f === 1 ? 1 : 0, j = f === 3 ? -2 : f === 2 ? -1 : 0, b = up + j, L = [];
    const P = (x, y, w, h, col) => L.push([x, y, w, h, col]);
    P(8, 34 + j, 7, 10, c.leg); P(17, 34 + j, 7, 10, c.leg); P(14, 34 + j, 4, 3, c.leg);   // jeans
    P(7, 44 + j, 8, 3, c.shoe); P(17, 44 + j, 8, 3, c.shoe);                                // shoes
    P(7, 19 + b, 18, 14, c.top);                                                            // polo body (sturdy)
    if (!cheer) { P(4, 20 + b, 4, 5, c.top); P(24, 20 + b, 4, 5, c.top); P(4, 25 + b, 3, 7, c.skin); P(25, 25 + b, 3, 7, c.skin); }
    else { const s = f === 3 ? 1 : 0; P(4, 17 + b, 4, 5, c.top); P(24, 17 + b, 4, 5, c.top); P(4 - s, 9 + b, 3, 8, c.skin); P(25 + s, 9 + b, 3, 8, c.skin); P(3 - s, 6 + b, 4, 3, c.skin); P(25 + s, 6 + b, 4, 3, c.skin); }
    P(13, 17 + b, 6, 3, c.skin);                                                            // neck
    P(10, 5 + b, 12, 13, c.skin); P(11, 18 + b, 10, 0, c.skin); P(9, 10 + b, 1, 4, c.skin); P(22, 10 + b, 1, 4, c.skin); // face + ears
    P(11, 1 + b, 10, 1, c.hair); P(10, 2 + b, 12, 4, c.hair); P(9, 3 + b, 2, 6, c.hair); P(21, 3 + b, 2, 6, c.hair);   // short silver hair
    return L;
  }
  function evanDetail(x, f) {
    const c = EVAN, cheer = f >= 2, up = f === 1 ? 1 : 0, j = f === 3 ? -2 : f === 2 ? -1 : 0, b = up + j;
    const p = (X, Y, w = 1, h = 1, col) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
    p(12, 2 + b, 7, 1, '#f8f7f4'); p(17, 4 + b, 4, 1, c.hair2); p(10, 5 + b, 1, 1, c.hair2); // swept top
    p(10, 6 + b, 1, 2, c.hair); p(21, 6 + b, 1, 2, c.hair);                                 // sideburns
    p(12, 9 + b, 3, 1, c.brow); p(17, 9 + b, 3, 1, c.brow);                                 // silver brows
    if (f === 1) { p(12, 11 + b, 3, 1, c.eye); p(17, 11 + b, 3, 1, c.eye); }
    else { p(12, 11 + b, 3, 1, c.eye); p(17, 11 + b, 3, 1, c.eye); p(12, 12 + b, 1, 1, c.skin2); p(19, 12 + b, 1, 1, c.skin2); } // smiling eyes
    p(15, 12 + b, 2, 2, c.skin2); p(15, 14 + b, 2, 1, '#e6a891');                          // nose
    p(11, 13 + b, 2, 2, c.cheek); p(19, 13 + b, 2, 2, c.cheek);                             // ruddy cheeks
    if (cheer) { p(13, 15 + b, 6, 2, c.mouth); p(13, 15 + b, 6, 1, '#ffffff'); }
    else { p(12, 15 + b, 1, 1, c.mouth); p(19, 15 + b, 1, 1, c.mouth); p(13, 16 + b, 6, 1, c.mouth); p(14, 16 + b, 4, 1, '#f3e6e0'); } // broad smile
    p(11, 17 + b, 10, 1, c.skin2);                                                          // jaw shadow
    p(10, 19 + b, 5, 2, c.collar); p(17, 19 + b, 5, 2, c.collar); p(15, 19 + b, 2, 5, c.top2); p(15, 21 + b, 1, 1, '#e8eef8'); // collar + placket
    p(18, 22 + b, 1, 1, '#f4c430'); p(19, 22 + b, 1, 1, '#e0453a'); p(20, 22 + b, 1, 1, '#2f6fd6'); p(19, 23 + b, 2, 1, '#e8a33a'); // small colourful logo (his left chest)
    p(23, 20 + b, 2, 12, c.top2); p(7, 31 + b, 18, 1, c.top2);                             // shading
    if (!cheer) { p(4, 24 + b, 4, 1, c.top2); p(24, 24 + b, 4, 1, c.top2); p(25, 27 + b, 3, 1, '#2b2a33'); } // sleeve hems, watch
    p(7, 32 + j, 18, 2, c.belt); p(15, 32 + j, 2, 2, c.buckle);                            // brown belt
    p(9, 35 + j, 1, 8, c.leg2); p(22, 35 + j, 1, 8, c.leg2); p(15, 35 + j, 2, 1, c.leg2);
    p(8, 44 + j, 3, 1, c.shoe2); p(18, 44 + j, 3, 1, c.shoe2);
  }
  function cyrusParts(f) {
    const c = CYRUS, cheer = f >= 2, up = f === 1 ? 1 : 0, j = f === 3 ? -2 : f === 2 ? -1 : 0, b = up + j, L = [];
    const P = (x, y, w, h, col) => L.push([x, y, w, h, col]);
    P(10, 34 + j, 5, 10, c.leg); P(17, 34 + j, 5, 10, c.leg); P(14, 34 + j, 4, 3, c.leg);   // trousers
    P(9, 44 + j, 7, 3, c.shoe); P(16, 44 + j, 7, 3, c.shoe);
    P(9, 19 + b, 14, 14, c.top);                                                            // shirt (slim)
    if (!cheer) { P(6, 20 + b, 3, 11, c.top); P(23, 20 + b, 3, 11, c.top); P(6, 31 + b, 3, 2, c.skin); P(23, 31 + b, 3, 2, c.skin); }
    else { const s = f === 3 ? 1 : 0; P(6 - s, 9 + b, 3, 11, c.top); P(23 + s, 9 + b, 3, 11, c.top); P(6 - s, 6 + b, 3, 3, c.skin); P(23 + s, 6 + b, 3, 3, c.skin); }
    P(13, 16 + b, 6, 3, c.skin);                                                            // neck
    P(11, 5 + b, 10, 13, c.skin); P(12, 3 + b, 8, 2, c.skin); P(13, 2 + b, 6, 1, c.skin); P(10, 10 + b, 1, 4, c.skin); P(21, 10 + b, 1, 4, c.skin); // longer face, bald dome, ears
    return L;
  }
  function cyrusDetail(x, f) {
    const c = CYRUS, cheer = f >= 2, up = f === 1 ? 1 : 0, j = f === 3 ? -2 : f === 2 ? -1 : 0, b = up + j;
    const p = (X, Y, w = 1, h = 1, col) => { x.fillStyle = col; x.fillRect(X, Y, w, h); };
    p(14, 3 + b, 3, 2, c.dome); p(13, 4 + b, 1, 1, c.dome);                                 // shine on bald head
    p(11, 8 + b, 1, 4, c.temple); p(20, 8 + b, 1, 4, c.temple);                             // close-cropped temples
    p(13, 9 + b, 2, 1, c.brow); p(17, 9 + b, 2, 1, c.brow);
    if (f === 1) { p(13, 11 + b, 2, 1, c.eye); p(17, 11 + b, 2, 1, c.eye); }
    else { p(13, 11 + b, 2, 1, c.eye); p(17, 11 + b, 2, 1, c.eye); p(13, 12 + b, 2, 1, c.skin2); p(17, 12 + b, 2, 1, c.skin2); } // calm eyes
    p(15, 11 + b, 2, 3, c.skin2); p(15, 14 + b, 2, 1, '#e3ad94');                          // longer nose
    p(12, 13 + b, 1, 1, c.cheek); p(19, 13 + b, 1, 1, c.cheek);
    if (cheer) { p(14, 15 + b, 4, 2, c.mouth); p(14, 15 + b, 4, 1, '#ffffff'); }
    else { p(13, 15 + b, 1, 1, c.mouth); p(14, 16 + b, 4, 1, c.mouth); p(18, 15 + b, 1, 1, c.mouth); } // gentle smile
    p(12, 17 + b, 8, 1, c.skin2);
    p(11, 18 + b, 4, 2, c.collar); p(17, 18 + b, 4, 2, c.collar); p(15, 19 + b, 2, 2, c.tee);   // collar + dark tee
    p(15, 21 + b, 2, 11, c.top2); p(16, 23 + b, 1, 1, '#e8eef8'); p(16, 27 + b, 1, 1, '#e8eef8'); // placket + buttons
    p(11, 22 + b, 3, 1, '#f2f4f8'); p(12, 23 + b, 1, 1, '#f2f4f8');                        // small white logo (his right chest)
    p(21, 20 + b, 2, 12, c.top2); p(9, 31 + b, 14, 1, c.top2);
    if (!cheer) { p(6, 30 + b, 3, 1, c.collar); p(23, 30 + b, 3, 1, c.collar); }           // cuffs
    p(9, 32 + j, 14, 2, c.belt); p(15, 32 + j, 2, 2, c.buckle);                             // black belt, silver buckle
    p(12, 35 + j, 1, 9, c.leg2); p(19, 35 + j, 1, 9, c.leg2);                               // trouser creases
    p(10, 44 + j, 3, 1, c.shoe2); p(17, 44 + j, 3, 1, c.shoe2);                             // polished shine
  }
  const DEF = { evan: [evanParts, evanDetail], cyrus: [cyrusParts, cyrusDetail], bill: [billParts, billDetail] };
  const cache = {};
  function frameCanvas(host, frame) {
    const key = host.id + frame; if (cache[key]) return cache[key];
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const x = cv.getContext('2d');
    const [parts, detail] = DEF[host.id] || DEF.evan; const L = parts(frame).filter(r => r[2] > 0 && r[3] > 0);
    x.fillStyle = OUT; for (const [a, b2, w, h] of L) x.fillRect(a - 1, b2 - 1, w + 2, h + 2);
    for (const [a, b2, w, h, col] of L) { x.fillStyle = col; x.fillRect(a, b2, w, h); }
    detail(x, frame);
    return (cache[key] = cv);
  }

  // v8: winter knit hats, worn while it snows. Pixel rows are in sprite space (y can go above the head, so the canvas
  // covers sprite rows -6..9; draw it at sprite y = HAT_OY). Bobs with the same frame offset as the head.
  const HAT_OY = -6;
  const HATS = {
    evan: { knit: '#d23a3a', knit2: '#a82a2a', cuff: '#f2f2f2', cuff2: '#c9ccd3', pom: '#ffffff', x0: 9, x1: 23 },   // red beanie, white cuff
    cyrus: { knit: '#2f8f6a', knit2: '#226b50', cuff: '#f5c542', cuff2: '#c9a13a', pom: '#f5c542', x0: 10, x1: 22 }, // green beanie, gold cuff
    bill: { knit: '#2f6fd6', knit2: '#2353a3', cuff: '#f2f2f2', cuff2: '#c9ccd3', pom: '#ffffff', x0: 9, x1: 23 },
  };
  const hatCache = {};
  function hatCanvas(host, frame) {
    const key = host.id + frame; if (hatCache[key]) return hatCache[key];
    const c = HATS[host.id] || HATS.evan, up = frame === 1 ? 1 : 0, j = frame === 3 ? -2 : frame === 2 ? -1 : 0, b = up + j - HAT_OY;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = 16; const x = cv.getContext('2d');
    const L = [[15, -5 + b, 3, 3, c.pom], [12, -3 + b, c.x1 - c.x0 - 5, 1, c.knit], [c.x0 + 1, -2 + b, c.x1 - c.x0 - 1, 1, c.knit], [c.x0, -1 + b, c.x1 - c.x0 + 1, 5, c.knit], [c.x0 - 1, 4 + b, c.x1 - c.x0 + 3, 3, c.cuff]];
    x.fillStyle = OUT; for (const [a, y, w, h] of L) x.fillRect(a - 1, y - 1, w + 2, h + 2);
    for (const [a, y, w, h, col] of L) { x.fillStyle = col; x.fillRect(a, y, w, h); }
    x.fillStyle = c.knit2; for (let i = c.x0 + 1; i < c.x1; i += 2) x.fillRect(i, b, 1, 4);          // knit ribs
    x.fillStyle = c.cuff2; for (let i = c.x0; i <= c.x1 + 1; i += 2) x.fillRect(i, 5 + b, 1, 2);     // cuff ribs
    x.fillStyle = '#ffffff55'; x.fillRect(15, -5 + b, 1, 1); x.fillRect(c.x0 + 2, b, 2, 1);           // highlights
    return (hatCache[key] = cv);
  }
  window.FBS_SPRITES = { frameCanvas, hatCanvas, HAT_OY, W, H, FRAMES: { idle: [0, 1], cheer: [2, 3] } };
})();
