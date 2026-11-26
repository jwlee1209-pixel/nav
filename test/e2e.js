// 전체 흐름 시험(가짜 네트워크): node test/e2e.js [phone|desktop]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const mock = require('./mocknet');
const F = require('./fixtures');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
const mode = process.argv[2] || 'phone';

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const vp = mode === 'phone' ? { width: 390, height: 844 } : { width: 1280, height: 800 };
  const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: mode === 'phone', geolocation: { latitude: F.P.A[1], longitude: F.P.A[0], accuracy: 8 }, permissions: ['geolocation'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const log = await mock.install(context, { valhallaDown: process.env.VDOWN === '1' });
  await context.addInitScript(() => {
    window.__said = [];
    const ss = window.speechSynthesis;
    if (ss) { ss.speak = u => window.__said.push(u.text); ss.cancel = () => {}; }
    try {
      localStorage.setItem('gilnavi.v1', JSON.stringify({
        settings: { theme: 'day' },
        home: { name: '우리집', addr: '서울 종로구 율곡로 10', lat: 37.5758, lon: 126.9850 },
        favs: [{ id: 'f1', name: '단골 주유소', addr: '서울 중구 퇴계로 100', lat: 37.5628, lon: 126.9860 }],
        recents: [{ name: '서울시청', addr: '서울 중구 세종대로 110', lat: 37.5663, lon: 126.9779, n: 2 }],
        trips: [],
      }));
    } catch (e) { /* 무시 */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text().slice(0, 200)); });
  const shot = async name => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `${mode}-${name}.png`) }); };

  await page.goto(FILE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await page.waitForTimeout(1800);
  await shot('1-home');

  // 검색
  await page.click('#q');
  await page.fill('#q', '대학로');
  await page.press('#q', 'Enter');
  await page.waitForSelector('.item', { timeout: 8000 });
  await page.waitForTimeout(900);
  await shot('2-search');

  await page.click('.list .item');
  await page.waitForTimeout(900);
  await shot('3-place');

  await page.click('text=여기로 길 안내');
  await page.waitForSelector('.rcard', { timeout: 8000 });
  await page.waitForTimeout(1300);
  await shot('4-preview');
  console.log('[추천 줄]', await page.textContent('.recline').catch(() => '(없음)'));
  console.log('[경로 카드]', (await page.$$eval('.rcard', a => a.map(x => x.textContent.replace(/\s+/g, ' ')))).join('\n            '));

  // 경로 옵션 바꾸기(무료도로)
  await page.click('.prefs >> text=무료도로');
  await page.waitForSelector('.rcard', { timeout: 8000 });
  await page.waitForTimeout(500);

  // 모의 주행(빠르게)
  await page.evaluate(() => { window.__simFactor = 6; });
  await page.click('text=모의 주행');
  await page.waitForTimeout(5200);
  await shot('5-guide');
  // 두 번째 회전 부근
  await page.waitForFunction(() => window.__said.some(s => s.includes('좌회전')), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await shot('6-guide-turn');
  await page.waitForFunction(() => window.__said.some(s => s.startsWith('목적지에 도착')), null, { timeout: 120000 });
  await page.waitForTimeout(4500);
  await shot('7-arrived');
  const said1 = await page.evaluate(() => window.__said.slice());

  // 실제 GPS 흐름(가짜 위치 주입) + 경로 이탈 → 재탐색
  await page.evaluate(() => { window.__said.length = 0; });
  await page.evaluate(() => window.__navi.startTrip({ name: '대학로 테스트 목적지', lat: 37.57100, lon: 126.99950 }));
  await page.waitForSelector('#btnStart', { timeout: 8000 });
  await page.click('#btnStart');
  await page.waitForTimeout(500);
  const feed = async (lon, lat, speed, heading) => page.evaluate(([lon, lat, speed, heading]) => window.__navi.onPos({ coords: { longitude: lon, latitude: lat, accuracy: 6, speed, heading }, timestamp: Date.now() }), [lon, lat, speed, heading]);
  const A = F.P.A, B = F.P.B;
  for (let i = 0; i <= 10; i++) { await feed(A[0], A[1] + (B[1] - A[1]) * i / 10 * 0.7, 12, 0); await page.waitForTimeout(250); }
  await shot('8-gps-guide');
  for (let i = 1; i <= 6; i++) { await feed(A[0] - 0.0012 * i, A[1] + (B[1] - A[1]) * 0.7, 10, 270); await page.waitForTimeout(700); }
  await page.waitForTimeout(1500);
  const said2 = await page.evaluate(() => window.__said.slice());
  await shot('9-reroute');
  await page.evaluate(() => window.__navi.finishNav(false));
  await page.waitForTimeout(600);

  // 설정·야간
  await page.click('#btnSettings');
  await page.waitForTimeout(500);
  await shot('10-settings');
  await page.click('.group button:text-is("야간")');
  await page.waitForTimeout(300);
  await page.click('.ov__head .icon-btn');
  await page.waitForTimeout(1500);
  await shot('11-night-home');
  // 야간 안내 화면
  await page.evaluate(() => window.__navi.startTrip({ name: '대학로 테스트 목적지', lat: 37.57100, lon: 126.99950 }));
  await page.waitForSelector('.rcard', { timeout: 8000 });
  await page.waitForTimeout(800);
  await shot('12-night-preview');
  await page.evaluate(() => { window.__simFactor = 3; });
  await page.click('text=모의 주행');
  await page.waitForTimeout(4000);
  await shot('13-night-guide');

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('gilnavi.v1')));
  console.log('\n[네트워크 요청]'); log.forEach(l => console.log('  ' + l.slice(0, 220)));
  console.log('\n[모의 주행 음성]'); said1.forEach(s => console.log('  · ' + s));
  console.log('\n[GPS·재탐색 음성]'); said2.forEach(s => console.log('  · ' + s));
  console.log('\n[저장] 기록', stored.trips.length, '건, 최근', stored.recents.map(r => r.name).join(', '));
  console.log('\n[오류/경고]', errors.length ? '\n  ' + [...new Set(errors)].slice(0, 30).join('\n  ') : '없음');
  await browser.close();
})().catch(e => { console.error('E2E 실패:', e); process.exit(1); });
