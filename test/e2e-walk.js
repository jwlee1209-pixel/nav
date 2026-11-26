// 도보 안내 시험(가짜 네트워크): node test/e2e-walk.js
//  · 경로 화면에서 차량 ↔ 도보 바꾸기, 도보 요청(pedestrian), 걸음 수·계단 표시, 계단 피하기
//  · 모의 걷기: 도보 안내 문구, 속도계·단속 카메라 숨김, 끝내기
//  · 설정의 기본 이동 방법 = 도보
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const assert = require('assert');
const mock = require('./mocknet');
const F = require('./fixtures');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const WEB = path.join(__dirname, '..', 'dist', 'web', 'navi');
const BASE = 'https://jwlee1209-pixel.github.io/nav/';
const TYPES = { html: 'text/html; charset=utf-8', json: 'application/json', js: 'application/javascript', png: 'image/png' };
let fails = 0;
const t = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  FAIL', name, '-', e.message); } };

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block',
    geolocation: { latitude: F.P.A[1], longitude: F.P.A[0], accuracy: 8 }, permissions: ['geolocation'] });
  await context.route(/^https:\/\/jwlee1209-pixel\.github\.io\/nav\/.*/, r => {
    const f = new URL(r.request().url()).pathname.replace('/nav/', '') || 'index.html';
    const fp = path.join(WEB, f);
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: 'nf' });
    r.fulfill({ status: 200, headers: { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' }, body: fs.readFileSync(fp) });
  });
  const log = await mock.install(context, {});
  await context.addInitScript(() => {
    window.__said = [];
    if (window.speechSynthesis) { speechSynthesis.speak = u => window.__said.push(u.text); speechSynthesis.cancel = () => {}; }
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('gilnavi.v1', JSON.stringify({ settings: { theme: 'day' }, meta: { ko: 1 } }));
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => !document.getElementById('boot') && window.__navi.S.gps === 'ok', null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const sheet = () => page.evaluate(() => document.querySelector('#sheetBody').innerText.replace(/\n+/g, ' / '));
  const routesReady = () => page.waitForFunction(() => { const t = window.__navi.S.trip; return t && !t.loading && t.routes.length; }, null, { timeout: 15000 });

  // 1. 차량으로 경로를 연 뒤 도보로 바꾸기
  await page.click('#q'); await page.fill('#q', '대학로'); await page.press('#q', 'Enter');
  await page.waitForSelector('.list .item', { timeout: 8000 });
  await page.click('.list .item >> nth=0');
  await page.click('text=여기로 길 안내');
  await routesReady();
  const carCard = await sheet();
  t('차량: 유류비·회전 표시', () => assert(carCard.includes('유류비') && carCard.includes('회전'), carCard));
  const before = log.length;
  await page.click('#mode-walk');
  await page.waitForTimeout(200);
  await routesReady();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'walk-1-preview.png') });
  const walkCard = await sheet();
  const plan = await page.evaluate(() => document.querySelector('#plan').innerText.replace(/\n+/g, ' / '));
  console.log('  [도보 카드]', walkCard.slice(0, 160));
  const reqs = log.slice(before);
  t('도보 요청은 pedestrian(시속 4.5km), 쉬운 길 추가 요청 없음', () => {
    assert(reqs.some(x => x === 'valhalla-costing pedestrian'), reqs.join(' | '));
    assert(reqs.some(x => /"pedestrian":\{"walking_speed":4\.5\}/.test(x)), reqs.join(' | '));
    assert(!reqs.some(x => /maneuver_penalty/.test(x)), '쉬운 길 요청이 있음');
  });
  t('도보 카드: 걸음 수·계단, 유류비 없음', () => { assert(/약 [\d,]+걸음/.test(walkCard), walkCard); assert(walkCard.includes('계단 1곳'), walkCard); assert(!walkCard.includes('유류비'), walkCard); });
  t('도보 옵션(계단 피하기)과 모의 걷기 버튼', () => { assert(plan.includes('계단 피하기') && !plan.includes('무료도로'), plan); assert(walkCard.includes('모의 걷기'), walkCard); });
  t('걷는 시간 설명', () => assert(walkCard.includes('시속 4.5km'), walkCard));
  const b2 = log.length;
  await page.click('.prefs button:text-is("계단 피하기")');
  await routesReady();
  t('계단 피하기 = step_penalty 600', () => assert(log.slice(b2).some(x => /"step_penalty":600/.test(x)), log.slice(b2).join(' | ')));

  // 2. 모의 걷기
  await page.evaluate(() => { window.__simFactor = 8; });
  await page.click('text=모의 걷기');
  await page.waitForFunction(() => window.__navi.S.nav && window.__said.length >= 2, null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  const sim = await page.evaluate(() => [...document.querySelectorAll('#simbar button')].map(b => b.textContent + (b.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(' '));
  await page.evaluate(() => window.__navi.S.nav.simObj.setFactor(30));       // 시험이라 빨리 걷는다
  await page.waitForFunction(() => window.__said.some(s => /^100미터 앞/.test(s)), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'walk-2-guide.png') });
  const g = await page.evaluate(() => ({
    said: window.__said.slice(), mode: document.querySelector('#app').dataset.mode,
    speedShown: getComputedStyle(document.querySelector('#speed')).display !== 'none',
    navMode: window.__navi.S.nav && window.__navi.S.nav.mode, zoom: window.__navi.MV.map.getZoom(), pitch: window.__navi.MV.map.getPitch(),
  }));
  g.sim = sim;
  console.log('  [음성]', g.said.join(' / '));
  console.log('  [화면] mode=%s zoom=%s pitch=%s sim=%s', g.mode, g.zoom.toFixed(1), g.pitch.toFixed(0), g.sim);
  t('도보 안내 시작 문구', () => assert(g.said.some(s => /도보 안내를 시작합니다.*걸어서 약 \d+분/.test(s)), g.said.join(' / ')));
  t('100m 앞 안내', () => assert(g.said.some(s => /^100미터 앞/.test(s)), g.said.join(' / ')));
  t('속도계 숨김·도보 표시', () => { assert.strictEqual(g.mode, 'walk'); assert.strictEqual(g.speedShown, false); assert.strictEqual(g.navMode, 'walk'); });
  t('걷기 화면: 크게 보고 덜 기울임', () => { assert(g.zoom > 17.5, g.zoom); assert(g.pitch < 45, g.pitch); });
  t('모의 걷기 속도 ×1 ×4 ×8(×8 선택)', () => assert.strictEqual(g.sim.replace(/\s+/g, ' ').trim(), '×1 ×4 ×8*'.replace(/\s+/g, ' '), g.sim));
  await page.click('#gEnd');
  await page.click('.dialog .btn--danger');
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => ({ mode: document.querySelector('#app').dataset.mode || '', nav: !!window.__navi.S.nav, trips: window.__navi.store.trips.length }));
  t('안내 끝: 도보 표시 해제, 모의 걷기는 기록 안 함', () => { assert.strictEqual(after.mode, ''); assert.strictEqual(after.nav, false); assert.strictEqual(after.trips, 0); });

  // 3. 기본 이동 방법 = 도보
  await page.evaluate(() => window.__navi.openSettings());
  await page.click('.seg[aria-label="기본 이동 방법"] button:text-is("도보")');
  await page.click('#overlay [aria-label="닫기"]');
  const mode = await page.evaluate(() => window.__navi.store.settings.mode);
  t('설정: 기본 이동 방법 저장', () => assert.strictEqual(mode, 'walk'));
  const b3 = log.length;
  await page.evaluate(() => window.__navi.startTrip({ name: '대학로 테스트 목적지', lat: 37.571, lon: 126.9995 }));
  await routesReady();
  const pressed = await page.evaluate(() => document.querySelector('#mode-walk').getAttribute('aria-pressed'));
  t('목적지를 고르면 도보로 먼저 찾음', () => { assert.strictEqual(pressed, 'true'); assert(log.slice(b3).includes('valhalla-costing pedestrian'), log.slice(b3).join(' | ')); });

  t('페이지 오류 없음', () => assert.strictEqual(errors.length, 0, errors.join(' | ')));
  await browser.close();
  console.log(fails ? `\n${fails}개 실패` : '\n도보 시험 통과');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
