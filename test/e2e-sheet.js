// 아래 목록(시트)을 손가락으로 끌어 접기·펼치기 시험(실제 터치 입력, CDP): node test/e2e-sheet.js
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block',
    geolocation: { latitude: F.P.A[1], longitude: F.P.A[0], accuracy: 8 }, permissions: ['geolocation'] });
  await context.route(/^https:\/\/jwlee1209-pixel\.github\.io\/nav\/.*/, r => {
    const f = new URL(r.request().url()).pathname.replace('/nav/', '') || 'index.html';
    const fp = path.join(WEB, f);
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: 'nf' });
    r.fulfill({ status: 200, headers: { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' }, body: fs.readFileSync(fp) });
  });
  await mock.install(context, {});
  const now = Date.now();
  await context.addInitScript(seed => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('gilnavi.v1', JSON.stringify(seed));
  }, {
    settings: { theme: 'day' }, meta: { ko: 1 },
    recents: ['대학로 테스트 목적지', '서울시청', '종로 은행', '명동', '대학로 공원', '대학로 주차장', '창경궁', '종로4가'].map((name, i) => ({ name, addr: '서울 종로구 시험로 ' + (i + 1), lat: 37.566 + i * 0.002, lon: 126.978 + i * 0.002, ts: now - i * 1000 })),
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const cdp = await context.newCDPSession(page);
  // 손가락 끌기: (x, y0) → (x, y1)을 ms 동안 n 번에 나눠
  const drag = async (x, y0, y1, ms = 400, n = 12) => {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= n; i++) { await sleep(ms / n); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / n }] }); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(450);
  };
  const tap = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(450); };
  const state = () => page.evaluate(() => {
    const sh = document.querySelector('#sheet').getBoundingClientRect(), g = document.querySelector('#grip').getBoundingClientRect(), fab = document.querySelector('#btnLocate').getBoundingClientRect();
    return { size: document.querySelector('#sheet').dataset.size, top: Math.round(sh.top), h: Math.round(sh.height), gripY: Math.round(g.top + g.height / 2), fabBottom: Math.round(fab.bottom), screen: window.__navi.S.screen, inline: document.querySelector('#sheet').style.maxHeight };
  });

  let s0 = await state();
  console.log('  [처음]', JSON.stringify(s0));
  t('처음은 보통 크기', () => assert.strictEqual(s0.size, 'peek'));

  // 1. 손잡이를 아래로 천천히 → 접기
  await drag(195, s0.gripY, s0.gripY + 260);
  let s1 = await state();
  await page.screenshot({ path: path.join(OUT, 'sheet-1-min.png') });
  console.log('  [접기]', JSON.stringify(s1));
  t('손잡이를 끌어 내리면 접힘', () => { assert.strictEqual(s1.size, 'min'); assert(s1.h <= 90, s1.h); assert.strictEqual(s1.inline, ''); });
  t('지도 버튼도 따라 내려감', () => assert(s1.fabBottom > s0.fabBottom + 150, `${s0.fabBottom} → ${s1.fabBottom}`));

  // 2. 다시 그려도 접힌 채로
  await page.evaluate(() => window.__navi.renderSheet());
  const s2 = await state();
  t('다시 그려도 접힌 크기 유지', () => assert.strictEqual(s2.size, 'min'));

  // 3. 접힌 목록을 누르면 펼침(목록 항목은 열리지 않음)
  await tap(195, s2.top + 50);
  const s3 = await state();
  t('접힌 목록을 누르면 보통 크기로', () => { assert.strictEqual(s3.size, 'peek'); assert.strictEqual(s3.screen, 'home'); });

  // 4. 손잡이를 위로 → 크게
  await drag(195, s3.gripY, s3.gripY - 330);
  const s4 = await state();
  await page.screenshot({ path: path.join(OUT, 'sheet-2-full.png') });
  t('손잡이를 끌어 올리면 크게', () => assert.strictEqual(s4.size, 'full'));

  // 5. 목록(맨 위)을 아래로 끌기 → 줄어듦, 끌기 뒤에는 항목이 열리지 않음
  await drag(195, s4.top + 140, s4.top + 140 + 260);
  const s5 = await state();
  t('목록 맨 위에서 아래로 끌면 줄어듦', () => assert(s5.size === 'peek' || s5.size === 'min', s5.size));
  t('끈 뒤 항목이 열리지 않음', () => assert.strictEqual(s5.screen, 'home'));

  // 6. 빠르게 튕기기(짧게) → 한 단계
  await page.evaluate(() => window.__navi.setSheetSize('peek'));
  await sleep(400);
  const s6a = await state();
  await drag(195, s6a.gripY, s6a.gripY + 90, 20, 2);     // 90px 를 두 번에(약 0.1초) — 가까운 크기는 '보통'이지만 튕겨서 '접기'
  const s6 = await state();
  t('짧게 빠르게 아래로 튕기면 접힘', () => assert.strictEqual(s6.size, 'min', JSON.stringify(s6)));

  // 7. 옆으로 밀기는 무시
  await page.evaluate(() => window.__navi.setSheetSize('peek'));
  await sleep(400);
  const s7a = await state();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: s7a.top + 120 }] });
  for (let i = 1; i <= 8; i++) { await sleep(30); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 100 + i * 20, y: s7a.top + 120 + i * 2 }] }); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  const s7 = await state();
  t('옆으로 밀면 크기 그대로', () => assert.strictEqual(s7.size, 'peek'));

  // 8. 다른 화면으로 갔다 오면 기본 크기
  await page.evaluate(() => window.__navi.setSheetSize('min'));
  await page.click('#q'); await page.waitForTimeout(300);
  const s8 = await state();
  t('검색 화면은 크게', () => { assert.strictEqual(s8.screen, 'search'); assert.strictEqual(s8.size, 'full'); });

  // 9. 그냥 누르기(끌지 않음)는 항목 열기 그대로
  await page.evaluate(() => history.back()); await page.waitForTimeout(500);
  const s9a = await state();
  const item = await page.$('#sheetBody .list .item');
  const box = await item.boundingBox();
  await tap(box.x + 60, box.y + box.height / 2);
  const s9 = await state();
  t('짧게 누르면 항목이 열림', () => { assert.strictEqual(s9a.size, 'peek'); assert.strictEqual(s9.screen, 'place'); });

  t('페이지 오류 없음', () => assert.strictEqual(errors.length, 0, errors.join(' | ')));
  await browser.close();
  console.log(fails ? `\n${fails}개 실패` : '\n목록 끌기 시험 통과');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
