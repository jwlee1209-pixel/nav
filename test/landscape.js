// 휴대폰 가로 화면 안내 화면 점검: node test/landscape.js [폭] [높이]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const mock = require('./mocknet');
const F = require('./fixtures');
const W = +(process.argv[2] || 780), H = +(process.argv[3] || 340);
const WEB = path.join(__dirname, '..', 'dist', 'web', 'navi');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const c = await b.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, geolocation: { latitude: F.P.A[1], longitude: F.P.A[0], accuracy: 8 }, permissions: ['geolocation'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await c.route(/^https:\/\/jwlee1209-pixel\.github\.io\/nav\/.*/, r => {
    const f = new URL(r.request().url()).pathname.replace('/nav/', '') || 'index.html';
    const fp = path.join(WEB, f);
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, headers: { 'content-type': f.endsWith('.html') ? 'text/html' : f.endsWith('.js') ? 'application/javascript' : f.endsWith('.json') ? 'application/json' : 'image/png' }, body: fs.readFileSync(fp) });
  });
  const P = F.P;
  const raw = [[37.5690, P.A[0] + 0.00009, 2, 50, 0, 0], [37.5730, P.G[0] - 0.00008, 2, 30, 2, 0]].sort((a, b) => a[0] - b[0]);
  const flat = []; let pl = 0, po = 0;
  for (const [la, lo, ty, lim, z, sl] of raw) { const a = Math.round(la * 1e5), bb = Math.round(lo * 1e5); flat.push(a - pl, bb - po, ty, lim, z, sl); pl = a; po = bb; }
  await c.route(/github\.io\/nav\/cameras\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: 1, date: 't', d: flat }) }));
  await mock.install(c);
  await c.addInitScript(() => { window.__said = []; if (window.speechSynthesis) { speechSynthesis.speak = u => window.__said.push(u.text); speechSynthesis.cancel = () => {}; } try { localStorage.setItem('gilnavi.v1', JSON.stringify({ settings: { theme: 'night' } })); } catch (e) {} });
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('https://jwlee1209-pixel.github.io/nav/');
  await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await p.waitForTimeout(1200);
  await p.evaluate(() => window.__navi.startTrip({ name: '대학로 테스트 목적지', lat: 37.571, lon: 126.9995 }));
  await p.waitForSelector('.rcard');
  await p.waitForTimeout(800);
  await p.screenshot({ path: path.join(__dirname, 'out', `land-${W}x${H}-preview.png`) });
  await p.evaluate(() => { window.__simFactor = 3; });
  await p.click('text=모의 주행');
  await p.waitForSelector('#cambox:not([hidden])', { timeout: 60000 }).catch(() => null);
  await p.waitForTimeout(700);
  await p.screenshot({ path: path.join(__dirname, 'out', `land-${W}x${H}-guide.png`) });
  const boxes = await p.evaluate(() => ['#mpanel', '#nexthint', '#cambox', '#speed', '#gbar', '#caption'].map(s => { const e = document.querySelector(s); if (!e || e.hidden || getComputedStyle(e).display === 'none') return s + ' 숨김'; const r = e.getBoundingClientRect(); return `${s} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; }));
  console.log(boxes.join('\n'));
  console.log('지도 여백:', JSON.stringify(await p.evaluate(() => window.__navi.MV.pad)), '| 오류:', errs.length ? errs : '없음');
  await b.close();
})();
