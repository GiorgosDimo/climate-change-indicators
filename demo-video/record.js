async (page) => {
  const OUT = 'D:/Thesis-project/gee-globe/demo-video';
  const URL = 'http://localhost:3100/';          // local production build of the current code
  const browser = page.context().browser();

  // NASA GIBS images are not cacheable (no-store), so a cold run stalls whenever a frame arrives late.
  // Pass 1 (not recorded) fetches every frame the demo needs; pass 2 (recorded) gets them instantly from memory.
  const cache = new Map();
  const serve = (c) => c.route(/gibs\.earthdata\.nasa\.gov\/wms\//, async (route) => {
    const u = route.request().url();
    let hit = cache.get(u);
    if (!hit) { const r = await route.fetch(); hit = { status: r.status(), headers: r.headers(), body: await r.body() }; cache.set(u, hit); }
    await route.fulfill({ status: hit.status, headers: { ...hit.headers, 'cache-control': 'max-age=60' }, body: hit.body });
  });

  const scenes = async (p, fast) => {
    const wait = ms => p.waitForTimeout(fast ? Math.round(ms * 0.35) : ms);
    const cap = (t, s) => p.evaluate(([t, s]) => window.__cap(t, s), [t, s]);
    const setRange = (sel, v) => p.$eval(sel, (el, v) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, String(v));
    // Real-time cursor movement (a burst of mouse events would make the dot teleport and the globe jump)
    let mx = 640, my = 360;
    const glide = async (x, y, ms = 420) => {
      const n = fast ? 4 : Math.max(8, Math.round(ms / 16));
      const x0 = mx, y0 = my;
      for (let i = 1; i <= n; i++) {
        const t = i / n, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;   // ease in-out
        await p.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e);
        if (!fast) await p.waitForTimeout(16);
      }
      mx = x; my = y;
    };
    const centre = async (sel) => { const b = await p.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const park = () => glide(1244, 645, 300);   // between the zoom buttons: not over the globe, so no stray tooltip
    const ui = async (sel) => { const [x, y] = await centre(sel); await glide(x, y); await wait(150); await p.mouse.click(x, y); await park(); };
    const menu = () => ui('.tg-menu-head');
    const drag = async (x1, y1, x2, y2, ms = 800) => {
      await glide(x1, y1, 400); await p.mouse.down();
      await glide(x2, y2, ms); await p.mouse.up();
    };
    const zoomIn = async (notches) => { for (let i = 0; i < notches; i++) { await p.mouse.wheel(0, -300); await p.waitForTimeout(fast ? 60 : 130); } };

    // ---- title card while the app loads
    await p.goto(URL);
    await p.waitForSelector('[data-testid=legend]', { timeout: 45000 });
    await wait(3500);
    await p.evaluate(() => window.__cover(null));
    await p.evaluate(() => document.querySelector('.snack button')?.click());   // DOM click: a real click outside the menu would collapse it
    await wait(900);

    // ---- 1. pick a dataset
    await cap('Pick a dataset', 'each one explains what it shows and how to read it');
    await wait(2400);
    await glide(200, 130);
    await p.selectOption('.tg-menu select >> nth=0', { label: '2. Sea surface temperature' });
    await wait(1900);
    await menu();
    await wait(800);

    // ---- 2. play through time
    await cap('Play 20+ years of satellite data');
    await setRange('input[aria-label="Speed"]', fast ? 10 : 5);
    await ui('.tg-btn');
    await wait(6000);
    await ui('.tg-btn');                                 // pause

    // ---- 3. another dataset, weekly / monthly / yearly
    await cap('Ten datasets, from sea level to methane');
    await menu(); await wait(500);
    await p.selectOption('.tg-menu select >> nth=0', { label: '4. Sea level anomaly' });
    await wait(2200);
    await cap('Weekly, monthly or yearly');
    await ui('.tg-seg button:has-text("Yearly")');
    await wait(1300);
    await cap('Choose your own colours');
    await p.selectOption('.tg-menu select >> nth=1', { label: 'Viridis' });
    await wait(1600);
    await menu();
    await wait(500);

    // ---- 4. zoom in on the Netherlands
    await cap('Zoom in on the Netherlands');
    await drag(651, 226, 640, 355);
    await wait(600);
    await glide(640, 355, 300);
    await zoomIn(10);
    await wait(1200);
    await drag(640, 300, 632, 425, 700);
    await wait(500);
    await drag(640, 300, 640, 395, 600);
    await park();
    await wait(2400);                                    // the sharper image fades in
    await p.evaluate(() => window.__nl(663, 388));       // where the Netherlands is (measured with calibrate.js)

    // ---- 5. flag a spot, watch the yearly trend
    await cap('Click to flag a spot', 'its value now, and how it changes over time');
    await glide(610, 300, 700);
    await wait(200);
    await p.mouse.click(610, 300);
    await park();
    await wait(1300);
    await p.$eval('input[aria-label="Frame"]', el => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, '0'); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await setRange('input[aria-label="Speed"]', fast ? 10 : 4);
    await ui('.tg-btn');
    await wait(7500);                                    // 27 yearly frames, 1992 to 2018
    await cap('The trend line points up', 'sea level anomaly in the North Sea, 1992 to 2018');
    await wait(3500);
    await ui('.tg-btn');

    // ---- end card
    await p.evaluate(() => window.__nl(null));
    await cap('');
    await p.evaluate(() => window.__cover('Open source<small>NASA GIBS · CesiumJS · Next.js · React<br><br><b style="color:#fff">climate-change-indicators.vercel.app</b></small>'));
    await wait(4000);
  };

  const overlays = () => {
    const init = () => {
      const css = document.createElement('style');
      css.textContent = `
        #cover{position:fixed;inset:0;z-index:2147483646;background:#0b0f19;color:#fff;display:flex;flex-direction:column;
          align-items:center;justify-content:center;gap:18px;font:600 54px/1.15 Roboto,system-ui,sans-serif;text-align:center;transition:opacity .6s}
        #cover small{font:400 26px/1.5 Roboto,system-ui,sans-serif;color:#9fb4d4;max-width:900px}
        #cap{position:fixed;z-index:2147483645;top:24px;left:420px;right:24px;text-align:center;pointer-events:none;
          font:600 30px/1.25 Roboto,system-ui,sans-serif;color:#fff;transition:opacity .4s;opacity:0}
        #cap span{display:inline-block;background:rgba(11,15,25,.82);padding:10px 20px;border-radius:12px}
        #cap small{display:block;margin-top:6px;font:400 20px/1.3 Roboto,system-ui,sans-serif;color:#cfe0ff}
        #dot{position:fixed;z-index:2147483647;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
          background:rgba(255,214,10,.9);border:2px solid #fff;pointer-events:none;transition:scale .15s}
        #dot.down{scale:.6}
        #nl{position:fixed;z-index:2147483644;width:64px;height:64px;margin:-32px 0 0 -32px;border:3px solid #fff;border-radius:50%;
          box-shadow:0 0 0 3px rgba(0,0,0,.35);pointer-events:none;opacity:0;transition:opacity .5s}
        #nl b{position:absolute;top:70px;left:50%;transform:translateX(-50%);white-space:nowrap;font:600 22px/1 Roboto,system-ui,sans-serif;
          color:#fff;background:rgba(11,15,25,.85);padding:6px 12px;border-radius:8px}`;
      const html = document.documentElement;
      html.append(css);
      const cover = document.createElement('div'); cover.id = 'cover';
      cover.innerHTML = 'Climate Change Indicators<small>Ten NASA satellite datasets on one interactive globe</small>';
      const cap = document.createElement('div'); cap.id = 'cap';
      const dot = document.createElement('div'); dot.id = 'dot'; dot.style.transform = 'translate(-100px,-100px)';
      const nl = document.createElement('div'); nl.id = 'nl'; nl.innerHTML = '<b>The Netherlands</b>';
      html.append(cover, cap, dot, nl);
      window.__steps = []; let last = '';
      setInterval(() => { const el = document.querySelector('[data-testid=frame-date]'); const t = el && el.textContent; if (t && t !== last) { last = t; window.__steps.push(Math.round(performance.now())); } }, 25);
      window.__nl = (x, y) => { if (x === null) { nl.style.opacity = 0; return; } nl.style.left = x + 'px'; nl.style.top = y + 'px'; nl.style.opacity = 1; };
      addEventListener('mousemove', e => { dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; }, true);
      addEventListener('mousedown', () => dot.classList.add('down'), true);
      addEventListener('mouseup', () => dot.classList.remove('down'), true);
      window.__cap = (t, s) => { cap.style.opacity = t ? 1 : 0; if (t) cap.innerHTML = `<span>${t}${s ? `<small>${s}</small>` : ''}</span>`; };
      window.__cover = (h) => {
        if (h === null) { cover.style.opacity = 0; setTimeout(() => { cover.style.display = 'none'; }, 700); }
        else { dot.style.display = 'none'; cover.innerHTML = h; cover.style.display = 'flex'; requestAnimationFrame(() => { cover.style.opacity = 1; }); }
      };
    };
    if (document.documentElement) init(); else document.addEventListener('DOMContentLoaded', init);
  };

  // ---- pass 1: warm up (no recording)
  const c1 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await serve(c1);
  const p1 = await c1.newPage();
  await p1.addInitScript(overlays);
  await scenes(p1, true);
  await c1.close();

  // ---- pass 2: the recording
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT + '/raw', size: { width: 1280, height: 720 } },
  });
  await serve(ctx);
  const p = await ctx.newPage();
  await p.addInitScript(overlays);
  await scenes(p, false);
  const flag = await p.locator('.tg-flagtip').innerText().catch(() => null);
  const st = await p.evaluate(() => window.__steps);
  const gaps = st.slice(1).map((t, i) => t - st[i]).filter(g => g < 1500);
  const smooth = { steps: gaps.length, medianMs: gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)], over1_5x: gaps.filter(g => g > 1.5 * gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length / 2)]).length, worstMs: Math.max(...gaps) };
  const video = p.video();
  await ctx.close();
  await video.saveAs(OUT + '/climate-change-indicators-demo.webm');
  return { saved: OUT + '/climate-change-indicators-demo.webm', flag, cached: cache.size, smooth };
}
