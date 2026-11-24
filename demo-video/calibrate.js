async (page) => {
  const browser = page.context().browser();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  await p.goto('http://localhost:3100/');
  await p.waitForSelector('[data-testid=legend]', { timeout: 45000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.snack button')?.click());
  await p.selectOption('.tg-menu select >> nth=0', { label: '4. Sea level anomaly' });
  await p.waitForTimeout(1500);
  await p.click('.tg-seg button:has-text("Yearly")');
  await p.click('.tg-menu-head');
  await p.waitForTimeout(1500);

  let mx = 640, my = 360;
  const glide = async (x, y, ms = 550) => {
    const n = Math.max(8, Math.round(ms / 16)), x0 = mx, y0 = my;
    for (let i = 1; i <= n; i++) {
      const t = i / n, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      await p.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
      await p.waitForTimeout(16);
    }
    mx = x; my = y;
  };
  const drag = async (x1, y1, x2, y2, ms = 800) => { await glide(x1, y1, 400); await p.mouse.down(); await glide(x2, y2, ms); await p.mouse.up(); };
  const zoomIn = async (n) => { for (let i = 0; i < n; i++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(130); } };

  await drag(651, 226, 640, 355);
  await p.waitForTimeout(600);
  await glide(640, 355, 300);
  await zoomIn(10);
  await p.waitForTimeout(1200);
  await drag(640, 300, 632, 425, 700);
  await p.waitForTimeout(500);
  await drag(640, 300, 640, 395, 600);
  await p.waitForTimeout(2800);

  // where on screen is a given latitude/longitude? read the hover tooltip and walk towards it
  const at = async (x, y) => {
    await p.mouse.move(x, y); await p.waitForTimeout(160);
    const t = await p.locator('.tg-tip').innerText().catch(() => null);
    const m = t && t.match(/(-?[\d.]+)°, (-?[\d.]+)°/);
    return m ? [parseFloat(m[1]), parseFloat(m[2])] : null;
  };
  const find = async (lat, lon) => {
    let x = 640, y = 360;
    for (let k = 0; k < 6; k++) {
      const a = await at(x, y), b = await at(x + 40, y), c = await at(x, y + 40);
      if (!a || !b || !c) return { x, y, note: 'lost' };
      const dLatX = (b[0] - a[0]) / 40, dLonX = (b[1] - a[1]) / 40, dLatY = (c[0] - a[0]) / 40, dLonY = (c[1] - a[1]) / 40;
      const det = dLatX * dLonY - dLatY * dLonX;
      const eLat = lat - a[0], eLon = lon - a[1];
      const dx = (eLat * dLonY - dLatY * eLon) / det, dy = (dLatX * eLon - eLat * dLonX) / det;
      x += dx; y += dy;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) break;
    }
    return { x: Math.round(x), y: Math.round(y), check: await at(x, y) };
  };
  const nl = await find(52.2, 5.3);
  const flag = await find(54.38, 3.13);
  await ctx.close();
  return { nl, flag };
}
