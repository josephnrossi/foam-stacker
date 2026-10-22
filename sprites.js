/* Hand-authored 24x32 pixel hosts. Friendly placeholder characters (hard hat + company-blue polo), drawn with rects, no image assets. */
(function () {
  const OUT = '#1b1e2b', SKIN = '#e2ae86', SKIN2 = '#c68e68', MOUTH = '#8e3f36', COLLAR = '#eef2f8', SHOE = '#22252f', BELT = '#2a2a30', GOLD = '#d7bd78', CHEEK = '#eb9b8a';
  function parts(h, frame) {
    const cheer = frame >= 2, up = frame === 1 ? 1 : 0, jump = frame === 3 ? -2 : (frame === 2 ? -1 : 0);
    const b = up + jump; // upper-body offset
    const L = []; const P = (x, y, w, hh, c, o = true) => L.push([x, y, w, hh, c, o]);
    // legs + shoes (legs don't bob when idle)
    P(9, 23 + jump, 3, 6, h.pants); P(13, 23 + jump, 3, 6, h.pants);
    P(8, 29 + jump, 4, 2, SHOE); P(13, 29 + jump, 4, 2, SHOE);
    // torso
    P(7, 15 + b, 11, 9, h.shirt);
    // arms
    if (!cheer) { P(5, 16 + b, 2, 4, h.shirt); P(5, 20 + b, 2, 3, SKIN); P(18, 16 + b, 2, 4, h.shirt); P(18, 20 + b, 2, 3, SKIN); }
    else {
      const s = frame === 3 ? 1 : 0;
      P(5 - s, 13 + b, 2, 3, h.shirt); P(5 - s, 9 + b, 2, 4, SKIN); P(4 - s, 7 + b, 3, 2, SKIN);
      P(18 + s, 13 + b, 2, 3, h.shirt); P(18 + s, 9 + b, 2, 4, SKIN); P(18 + s, 7 + b, 3, 2, SKIN);
    }
    // neck + head + ears
    P(10, 14 + b, 5, 1, SKIN); P(8, 7 + b, 9, 8, SKIN); P(7, 10 + b, 1, 2, SKIN); P(17, 10 + b, 1, 2, SKIN);
    // hard hat: dome + brim
    P(9, 2 + b, 7, 1, h.hat); P(8, 3 + b, 9, 4, h.hat); P(6, 6 + b, 13, 1, h.hatShade);
    return L;
  }
  function details(ctx, h, frame) {
    const cheer = frame >= 2, up = frame === 1 ? 1 : 0, jump = frame === 3 ? -2 : (frame === 2 ? -1 : 0), b = up + jump;
    const px = (x, y, c, w = 1, hh = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, hh); };
    px(12, 3 + b, h.hatShade, 1, 3); px(10, 3 + b, '#ffffff55', 1, 1);              // hat ridge + shine
    px(8, 7 + b, SKIN2, 9, 1);                                                       // hat shadow on brow
    if (frame === 1) { px(10, 10 + b, OUT, 2, 1); px(14, 10 + b, OUT, 2, 1); }       // blink
    else { px(10, 9 + b, OUT, 1, 2); px(14, 9 + b, OUT, 1, 2); px(10, 9 + b, '#ffffff', 1, 1); px(14, 9 + b, '#ffffff', 1, 1); px(10, 10 + b, OUT); px(14, 10 + b, OUT); }
    px(9, 11 + b, CHEEK); px(16, 11 + b, CHEEK);
    if (cheer) { px(11, 12 + b, MOUTH, 3, 2); px(11, 12 + b, '#ffffff', 3, 1); }   // open smile
    else { px(10, 12 + b, MOUTH); px(14, 12 + b, MOUTH); px(11, 13 + b, MOUTH, 3, 1); }
    px(10, 15 + b, COLLAR, 2, 1); px(13, 15 + b, COLLAR, 2, 1); px(12, 15 + b, SKIN, 1, 2); // collar + placket
    px(15, 17 + b, GOLD, 1, 1);                                                      // shirt logo dot
    px(7, 22 + b, h.shirtShade, 11, 1); px(17, 15 + b, h.shirtShade, 1, 7);         // shading
    px(8, 23 + jump, BELT, 9, 1);                                                    // belt
  }
  const cache = {};
  function frameCanvas(host, frame) {
    const key = host.id + frame; if (cache[key]) return cache[key];
    const c = document.createElement('canvas'); c.width = 24; c.height = 32; const ctx = c.getContext('2d');
    const L = parts(host, frame);
    ctx.fillStyle = OUT; for (const [x, y, w, hh, , o] of L) if (o) ctx.fillRect(x - 1, y - 1, w + 2, hh + 2);
    for (const [x, y, w, hh, col] of L) { ctx.fillStyle = col; ctx.fillRect(x, y, w, hh); }
    details(ctx, host, frame);
    return (cache[key] = c);
  }
  // frames: 0,1 idle (breathe/blink), 2,3 cheer
  window.FBS_SPRITES = { frameCanvas, W: 24, H: 32, FRAMES: { idle: [0, 1], cheer: [2, 3] } };
})();
