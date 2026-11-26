// 웹(https://jwlee1209-pixel.github.io/nav/)에 올린 상황을 흉내 낸 시험
// 서버가 EUC-KR 이라고 알려 줘도 한글이 깨지지 않는지, 서비스 워커·홈 화면 정보·위치가 동작하는지 확인
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const mock = require('./mocknet');
const F = require('./fixtures');
const OUT = path.join(__dirname, 'out');
const WEB = path.join(__dirname, '..', 'dist', 'web', 'navi');
const BASE = 'https://jwlee1209-pixel.github.io/nav/';
const TYPES = { html: 'text/html; charset=euc-kr', json: 'application/json', js: 'application/javascript', png: 'image/png' };
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, geolocation: { latitude: F.P.A[1], longitude: F.P.A[0], accuracy: 8 }, permissions: ['geolocation'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const served = [];
  await context.route(/^https:\/\/jwlee1209-pixel\.github\.io\/nav\/.*/, r => {
    const u = new URL(r.request().url());
    let f = u.pathname.replace('/nav/', '') || 'index.html';
    const fp = path.join(WEB, f);
    served.push(f + ' (' + (r.request().headers()['referer'] ? 'ref' : '-') + ')');
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: 'nf' });
    r.fulfill({ status: 200, headers: { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' }, body: fs.readFileSync(fp) });
  });
  // 시험 경로 위에 가짜 단속 카메라(과속·신호·구간단속·어린이 보호구역)
  const P = F.P;
  const raw = [[37.5690, P.A[0] + 0.00009, 2, 50, 0, 0], [P.C[1] - 0.00004, P.C[0] + 0.00004, 1, 0, 0, 0], [P.E[1] - 0.00007, 126.9870, 5, 60, 0, 1000], [P.E[1] - 0.00007, 126.9980, 6, 60, 0, 1000], [37.5730, P.G[0] - 0.00008, 2, 30, 2, 0]].sort((a, b) => a[0] - b[0]);
  const flat = []; let pl = 0, po = 0;
  for (const [la, lo, ty, lim, z, sl] of raw) { const a = Math.round(la * 1e5), b = Math.round(lo * 1e5); flat.push(a - pl, b - po, ty, lim, z, sl); pl = a; po = b; }
  await context.route(/github\.io\/nav\/cameras\.json/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ v: 1, date: '시험', d: flat }) }));
  const log = await mock.install(context);
  await context.addInitScript(() => { window.__said = []; if (window.speechSynthesis) { speechSynthesis.speak = u => window.__said.push(u.text); speechSynthesis.cancel = () => {}; } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  await page.goto(BASE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  console.log('제목:', await page.title(), '| 문자셋:', await page.evaluate(() => document.characterSet));
  console.log('칩:', (await page.$$eval('.chip', a => a.map(x => x.textContent))).join(' | '), '| 검색창:', await page.getAttribute('#q', 'placeholder'));
  const sw = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(r => 'ready ' + r.scope), new Promise(r => setTimeout(() => r('no-sw'), 5000))]));
  console.log('서비스 워커:', sw);
  const man = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); const j = await r.json(); return j.name + ' / ' + j.display + ' / 아이콘 ' + j.icons.length; });
  console.log('홈 화면 정보:', man);
  console.log('위치 상태:', await page.evaluate(() => window.__navi.S.gps));
  await page.screenshot({ path: path.join(OUT, 'web-1-home.png') });
  await page.fill('#q', '대학로'); await page.press('#q', 'Enter');
  await page.waitForSelector('.list .item'); await page.click('.list .item');
  await page.click('text=여기로 길 안내');
  await page.waitForSelector('.rcard');
  console.log('카메라 자료:', await page.evaluate(() => { const s = window.__navi; return document.querySelector('.rcard__ease') ? document.querySelector('.rcard__ease').textContent : '-'; }));
  await page.screenshot({ path: path.join(OUT, 'web-2a-preview-cams.png') });
  await page.evaluate(() => { window.__simFactor = 4; });
  await page.click('text=모의 주행');
  await page.waitForSelector('#cambox:not([hidden])', { timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'web-2-guide.png') });
  await page.waitForFunction(() => /구간단속/.test(document.querySelector('#camTitle').textContent) && document.querySelector('#camTitle').textContent.includes('평균'), null, { timeout: 15000 }).catch(() => null);
  await page.screenshot({ path: path.join(OUT, 'web-2b-section.png') });
  await page.waitForTimeout(8000);
  console.log('카메라 음성:', (await page.evaluate(() => window.__said.filter(s => /카메라|구간단속|제한속도/.test(s)))).join(' / '));
  console.log('음성:', (await page.evaluate(() => window.__said.filter(s => s.trim()).slice(0, 3))).join(' / '));
  if (await page.isVisible('#gEnd')) { await page.click('#gEnd'); await page.click('.dialog .btn--danger'); }
  await page.click('#btnSettings'); await page.waitForTimeout(300);
  console.log('앱 정보:', (await page.textContent('.group:has-text("앱 정보")')).replace(/\s+/g, ' ').slice(0, 120));
  console.log('받은 요청:', served.slice(0, 8).join(', '));
  console.log('오류:', errors.length ? errors.join('\n') : '없음');
  await browser.close();

  // 내려받은 파일로 열었는데 위치를 막은 경우(휴대폰 상황 흉내)
  const b2 = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const c2 = await b2.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR' });
  await mock.install(c2);
  const p2 = await c2.newPage();
  await p2.addInitScript(() => { navigator.geolocation.watchPosition = (ok, err) => { setTimeout(() => err({ code: 1, message: 'denied' }), 300); return 1; }; });
  await p2.goto('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
  await p2.waitForTimeout(2500);
  console.log('\n[파일로 연 경우] 위치 상태:', await p2.evaluate(() => window.__navi.S.gps), '| 안내:', (await p2.textContent('.alert')).slice(0, 90));
  await p2.screenshot({ path: path.join(OUT, 'web-3-localfile.png') });
  await p2.evaluate(() => window.__navi.startTrip({ name: '대학로 테스트 목적지', lat: 37.571, lon: 126.9995 }));
  await p2.waitForTimeout(800);
  console.log('[파일로 연 경우] 경로 화면:', (await p2.textContent('#sheetBody')).slice(0, 110));
  await b2.close();
})().catch(e => { console.error(e); process.exit(1); });
