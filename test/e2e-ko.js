// 영문 이름·주소 시험(가짜 네트워크): node test/e2e-ko.js
//  · 검색이 한국어(현지) 이름으로 나오는지(Photon lang=default)
//  · 예전 버전이 영문으로 저장한 최근 목적지·주행 기록을 한 번만 한글로 고치는지
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const assert = require('assert');
const mock = require('./mocknet');
const F = require('./fixtures');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
// 파일(file://)로 열면 크로미엄이 다시 열 때 가끔 빈 저장소를 주므로, 앱 주소(https)로 올린 것처럼 연다
const WEB = path.join(__dirname, '..', 'dist', 'web', 'navi');
const FILE = 'https://jwlee1209-pixel.github.io/nav/';
const TYPES = { html: 'text/html; charset=utf-8', json: 'application/json', js: 'application/javascript', png: 'image/png' };
let fails = 0;
const t = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  FAIL', name, '-', e.message); } };

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, geolocation: { latitude: F.P.A[1], longitude: F.P.A[0], accuracy: 8 }, permissions: ['geolocation'], locale: 'ko-KR', timezoneId: 'Asia/Seoul', serviceWorkers: 'block' });
  await context.route(/^https:\/\/jwlee1209-pixel\.github\.io\/nav\/.*/, r => {
    const f = new URL(r.request().url()).pathname.replace('/nav/', '') || 'index.html';
    const fp = path.join(WEB, f);
    if (!fs.existsSync(fp)) return r.fulfill({ status: 404, body: 'nf' });
    r.fulfill({ status: 200, headers: { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' }, body: fs.readFileSync(fp) });
  });
  const log = await mock.install(context, {});
  const now = Date.now();
  await context.addInitScript(seed => {
    if (localStorage.getItem('__seeded')) return;      // 다시 불러올 때는 고친 상태를 그대로 둔다
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('gilnavi.v1', JSON.stringify(seed));
  }, {
    settings: { theme: 'night' },
    home: { name: '우리집', addr: '서울 종로구 율곡로 10', lat: 37.5758, lon: 126.9850 },
    recents: [
      { name: 'Lets Run Park: Yeongcheon', addr: 'North Gyeongsang Yeongcheon Cheongtong-myeon', lat: 35.9879, lon: 128.8905, n: 2, ts: now - 5000 },
      { name: '대학로 주차장', addr: 'Seoul Jongno-gu Daehak-ro', lat: 37.5690, lon: 126.9990, n: 1, ts: now - 6000 },
      { name: 'Ipjang Elementary School', addr: 'South Chungcheong Cheonan Ipjang-myeon', lat: 36.9104, lon: 127.2302, n: 1, ts: now - 7000 },
    ],
    trips: [{ ts: now - 86400000, end: now - 86400000 + 9000000, pred: 9000, act: 9300, dist: 240000, rr: 0, arrived: true, dest: { name: 'Lets Run Park: Yeongcheon', lat: 35.9879, lon: 128.8905 } }],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await page.waitForFunction(() => window.__navi && window.__navi.store.meta.ko === 1, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, 'ko-1-home.png') });
  const st = await page.evaluate(() => JSON.parse(JSON.stringify(window.__navi.store)));
  const list = await page.$$eval('.list .item', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('[최근 목적지]\n  ' + list.join('\n  '));
  console.log('[알림]', await page.textContent('#toast').catch(() => ''));

  t('정리 완료 표시', () => assert.strictEqual(st.meta.ko, 1));
  t('영문 이름 → 같은 장소의 한국어 이름', () => { assert.strictEqual(st.recents[0].name, '렛츠런파크 영천'); assert.strictEqual(st.recents[0].addr, '경상북도 영천시 청통면'); });
  t('한글 이름은 그대로, 영문 주소만 한국어로', () => { assert.strictEqual(st.recents[1].name, '대학로 주차장'); assert.strictEqual(st.recents[1].addr, '서울 종로구 대학로'); });
  t('같은 장소를 못 찾으면 이름은 두고 주소만 좌표로 다시(한국어)', () => { assert.strictEqual(st.recents[2].name, 'Ipjang Elementary School'); assert(/[가-힣]/.test(st.recents[2].addr), st.recents[2].addr); });
  t('주행 기록의 목적지 이름도', () => assert.strictEqual(st.trips[0].dest.name, '렛츠런파크 영천'));
  t('한글 장소(집)는 건드리지 않음', () => assert.strictEqual(st.home.addr, '서울 종로구 율곡로 10'));
  t('화면 목록에 한글로 표시', () => assert(list[0].includes('렛츠런파크 영천') && list[0].includes('경상북도'), list[0]));
  const ph = log.filter(x => x.startsWith('photon '));
  t('Photon 요청은 모두 lang=default', () => { assert(ph.length >= 3, ph.length); ph.forEach(x => assert(/[?&]lang=default(&|$)/.test(x), x)); });

  // 검색 결과도 한국어
  await page.click('#q'); await page.fill('#q', '대학로'); await page.press('#q', 'Enter');
  await page.waitForSelector('.list .item', { timeout: 8000 });
  await page.waitForTimeout(500);
  const res = await page.$$eval('.list .item', a => a.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log('[검색 결과]\n  ' + res.join('\n  '));
  await page.screenshot({ path: path.join(OUT, 'ko-2-search.png') });
  t('검색 결과 이름·주소가 한국어', () => { assert(res.length >= 3); res.forEach(x => assert(!/Daehak|Jongno|Seoul/.test(x), x)); assert(res.some(x => x.includes('서울 종로구 대학로 101')), res.join(' / ')); });

  // 다시 열어도 정리는 한 번만
  await page.waitForTimeout(800);
  const before = log.length;
  await page.goto(FILE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await page.waitForTimeout(5500);
  const again = log.slice(before).filter(x => x.startsWith('photon ') || x.startsWith('nominatim '));
  t('다시 열면 정리 요청 없음', () => assert.strictEqual(again.length, 0, again.join(' | ')));

  t('페이지 오류 없음', () => assert.strictEqual(errors.length, 0, errors.join(' | ')));
  await browser.close();
  console.log(fails ? `\n${fails}개 실패` : '\n한글 이름 시험 통과');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
