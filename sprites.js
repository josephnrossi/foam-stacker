/* Hand-authored 32x48 pixel hosts, drawn from the Gilman family photo on gilmanbrothers.com/our-history/ (rect pixel art, no image assets).
   Evan: short silver hair, fair/ruddy, light-blue short-sleeve polo, brown belt, dark jeans, brown shoes, sturdy build.
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
  const DEF = { evan: [evanParts, evanDetail], cyrus: [cyrusParts, cyrusDetail] };
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
  window.FBS_SPRITES = { frameCanvas, W, H, FRAMES: { idle: [0, 1], cheer: [2, 3] } };
})();
