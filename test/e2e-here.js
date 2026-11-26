// 현재 위치 저장 · 이름·메모로 찾기 시험(가짜 네트워크): node test/e2e-here.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const assert = require('assert');
const mock = require('./mocknet');
const F = require('./fixtures');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
// 앱 주소(https)로 올린 것처럼 연다(file:// 은 다시 열 때 저장소가 가끔 비어 시험이 흔들림)
const WEB = path.join(__dirname, '..', 'dist', 'web', 'navi');
const BASE = 'https://jwlee1209-pixel.github.io/nav/';
const TYPES = { html: 'text/html; charset=utf-8', json: 'application/json', js: 'application/javascript', png: 'image/png' };
const HERE = { latitude: 37.57325, longitude: 126.98250 };   // 시험 지도 위 한 점(가상의 주차 위치)
let fails = 0;
const t = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  FAIL', name, '-', e.message); } };

async function newContext(browser, geo) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block',
    ...(geo ? { geolocation: { ...HERE, accuracy: 9 }, permissions: ['geolocation'] } : {}) });
  await context.route(/^https:\/\/jwlee1209-pixel\.github\.io\/nav\/.*/, r => {
    const f = new URL(r.request().url()).pathname.replace('/nav/', '') || 'index.html';
    const fp = path.join(WEB, f);
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: 'nf' });
    r.fulfill({ status: 200, headers: { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' }, body: fs.readFileSync(fp) });
  });
  await mock.install(context, {});
  await context.addInitScript(() => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('gilnavi.v1', JSON.stringify({ settings: { theme: 'day' }, meta: { ko: 1 } }));
  });
  return context;
}

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await newContext(browser, true);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(BASE);
  await page.waitForFunction(() => !document.getElementById('boot') && window.__navi.S.gps === 'ok', null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const store = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__navi.store)));
  const sheet = () => page.evaluate(() => document.querySelector('#sheetBody').innerText.replace(/\n+/g, ' / '));

  // 1. 현재 위치를 즐겨찾기로
  await page.click('#btnSaveHere');
  await page.waitForSelector('#pfName', { timeout: 5000 });
  await page.waitForFunction(() => /율곡로 57/.test(document.querySelector('#pfInfo').textContent), null, { timeout: 10000 });
  await page.screenshot({ path: path.join(OUT, 'here-1-dialog.png') });
  const info = await page.textContent('#pfInfo');
  const pre = await page.inputValue('#pfName');
  console.log('  [창]', info, '| 이름 칸:', pre);
  t('주소·정확도 표시, 이름 칸 미리 채움', () => { assert(info.includes('서울 종로구 율곡로 57') && info.includes('정확도 약 9m'), info); assert.strictEqual(pre, '율곡로 57'); });
  await page.fill('#pfName', '주차한 곳');
  await page.fill('#pfMemo', '지하 2층 B-37');
  await page.click('#pfSave');
  await page.waitForTimeout(400);
  let st = await store();
  const toastText = await page.textContent('#toast');
  console.log('  [알림]', toastText);
  t('즐겨찾기에 저장(이름·메모·좌표·주소)', () => {
    const f = st.favs[0];
    assert.strictEqual(f.name, '주차한 곳'); assert.strictEqual(f.memo, '지하 2층 B-37'); assert.strictEqual(f.addr, '서울 종로구 율곡로 57');
    assert(Math.abs(f.lat - HERE.latitude) < 1e-6 && Math.abs(f.lon - HERE.longitude) < 1e-6, f.lat + ',' + f.lon);
  });
  t('알림 문구', () => assert(toastText.includes('‘주차한 곳’을 저장했습니다'), toastText));
  const home = await sheet();
  t('첫 화면 즐겨찾기 목록에 메모와 함께', () => assert(home.includes('주차한 곳') && home.includes('지하 2층 B-37'), home));
  const chips = await page.$$eval('.chip', a => a.map(x => x.textContent));
  t('위쪽 즐겨찾기 칩', () => assert(chips.includes('주차한 곳'), chips.join('|')));

  // 2. 이름·메모로 찾기
  await page.click('#q'); await page.fill('#q', '주차');
  await page.waitForTimeout(300);
  let txt = await sheet();
  t('입력만 해도 내 장소에서 찾음', () => assert(/내 장소에서 찾음/.test(txt) && txt.includes('주차한 곳'), txt));
  await page.press('#q', 'Enter');
  await page.waitForFunction(() => !window.__navi.S.searching && window.__navi.S.results, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  txt = await sheet();
  await page.screenshot({ path: path.join(OUT, 'here-2-search.png') });
  console.log('  [검색]', txt.slice(0, 200));
  t('검색을 눌러도 내 장소가 맨 위, 그 아래 검색 결과', () => { const a = txt.indexOf('내 장소 1곳'), b = txt.indexOf('주차한 곳'), c = txt.indexOf('검색 결과'), d = txt.indexOf('대학로 주차장'); assert(a >= 0 && a < b && b < c && c < d, txt); });
  await page.fill('#q', 'b-37'); await page.press('#q', 'Enter');
  await page.waitForFunction(() => !window.__navi.S.searching && window.__navi.S.results && window.__navi.S.lastQuery === 'b-37', null, { timeout: 15000 });
  await page.waitForTimeout(200);
  txt = await sheet();
  t('메모로 찾기(B-37)', () => assert(txt.includes('내 장소 1곳') && txt.includes('주차한 곳'), txt));

  // 3. 장소 카드에서 메모 고치기
  await page.click('.list .item >> text=주차한 곳');
  await page.waitForSelector('#btnEditSaved', { timeout: 5000 });
  txt = await sheet();
  t('장소 카드에 메모', () => assert(txt.includes('지하 2층 B-37'), txt));
  await page.click('#btnEditSaved');
  await page.waitForSelector('#pfMemo');
  await page.fill('#pfMemo', '지하 3층 C-12');
  await page.press('#pfMemo', 'Enter');
  await page.waitForTimeout(400);
  st = await store();
  txt = await sheet();
  await page.screenshot({ path: path.join(OUT, 'here-3-place.png') });
  t('메모 고치기(Enter 로 저장)', () => { assert.strictEqual(st.favs[0].memo, '지하 3층 C-12'); assert(txt.includes('지하 3층 C-12'), txt); });

  // 4. 현재 위치를 집으로
  for (let i = 0; i < 5 && !(await page.$('#btnSaveHere')); i++) { await page.evaluate(() => history.back()); await page.waitForTimeout(400); }   // 첫 화면으로
  await page.waitForSelector('#btnSaveHere', { timeout: 5000 });
  await page.click('#btnSaveHere');
  await page.waitForFunction(() => /율곡로 57/.test((document.querySelector('#pfInfo') || {}).textContent || ''), null, { timeout: 10000 });
  await page.click('.pform .seg button:text-is("집")');
  await page.fill('#pfName', '우리 아파트');
  await page.click('#pfSave');
  await page.waitForTimeout(400);
  st = await store();
  t('집으로 저장', () => { assert.strictEqual(st.home && st.home.name, '우리 아파트'); assert.strictEqual(st.favs.length, 1); });
  await page.click('#q'); await page.fill('#q', '아파트');
  await page.waitForTimeout(300);
  txt = await sheet();
  t('‘아파트’로 집 찾기', () => assert(txt.includes('집') && txt.includes('우리 아파트'), txt));

  // 5. 다시 열어도 남아 있음
  await page.waitForTimeout(500);
  await page.goto(BASE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  st = await store();
  t('다시 열어도 저장돼 있음', () => { assert.strictEqual(st.favs[0].name, '주차한 곳'); assert.strictEqual(st.favs[0].memo, '지하 3층 C-12'); assert.strictEqual(st.home.name, '우리 아파트'); });
  t('페이지 오류 없음', () => assert.strictEqual(errors.length, 0, errors.join(' | ')));
  await context.close();

  // 6. 위치 권한이 없을 때
  const c2 = await newContext(browser, false);
  const p2 = await c2.newPage();
  await p2.goto(BASE);
  await p2.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await p2.waitForFunction(() => ['denied', 'unavail', 'off', 'insecure'].includes(window.__navi.S.gps), null, { timeout: 10000 }).catch(() => {});
  const gps = await p2.evaluate(() => window.__navi.S.gps);
  await p2.click('#btnSaveHere');
  await p2.waitForTimeout(500);
  const dlg = await p2.evaluate(() => document.querySelector('#dialog').innerText);
  console.log('  [권한 없음]', gps, '|', dlg.replace(/\n+/g, ' / '));
  t('위치를 못 쓰면 이유 안내', () => assert(/위치/.test(dlg) && !(dlg.includes('저장') && dlg.includes('이름')), dlg));
  await c2.close();

  await browser.close();
  console.log(fails ? `\n${fails}개 실패` : '\n현재 위치 저장 시험 통과');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
