// 아파트·주소 검색 시험(가짜 네트워크): node test/e2e-search.js
//  · 인증키 없이: 붙여 쓴 아파트 이름·번지 주소를 줄여서 다시 찾기(OpenStreetMap)
//  · 브이월드 인증키: 설정에서 넣고 '시험', 장소·도로명 주소 검색, 좌표 → 주소, 틀린 키 안내
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const assert = require('assert');
const mock = require('./mocknet');
const F = require('./fixtures');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
let fails = 0;
const t = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  FAIL', name, '-', e.message); } };

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, geolocation: { latitude: F.P.A[1], longitude: F.P.A[0], accuracy: 8 }, permissions: ['geolocation'], locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  const log = await mock.install(context, {});
  await context.addInitScript(() => {
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    localStorage.setItem('gilnavi.v1', JSON.stringify({ settings: { theme: 'day' }, meta: { ko: 1 } }));
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.goto(FILE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);

  const search = async (q, shot) => {
    await page.click('#q'); await page.fill('#q', q); await page.press('#q', 'Enter');
    await page.waitForFunction(() => !window.__navi.S.searching && window.__navi.S.results, null, { timeout: 20000 });
    await page.waitForTimeout(300);
    if (shot) await page.screenshot({ path: path.join(OUT, shot) });
    const out = await page.evaluate(() => ({
      items: [...document.querySelectorAll('.list .item')].map(x => x.textContent.replace(/\s+/g, ' ').trim()),
      note: (document.querySelector('#sheetBody .recline') || {}).textContent || '',
      warn: (document.querySelector('#sheetBody .warnline') || {}).textContent || '',
      foot: [...document.querySelectorAll('#sheetBody .note')].map(x => x.textContent).join(' '),
    }));
    console.log(`[${q}]`, out.note || '', out.warn || '', '\n   ' + out.items.join('\n   '));
    await page.evaluate(() => { window.__navi.S.results = null; });
    return out;
  };

  // ── 1. 인증키 없이(OpenStreetMap) ──
  let r = await search('가온누리타운2차아파트', 's-1-osm-name.png');
  t('붙여 쓴 이름을 줄여 OSM 의 ‘누리타운’을 찾음', () => { assert(r.items[0] && r.items[0].startsWith('누리타운'), r.items[0]); assert(r.note.includes('‘누리타운’으로 찾은 결과입니다(근처만)'), r.note); });
  t('인증키 안내 문구(검색 아래 출처에 브이월드 없음)', () => assert(!r.foot.includes('브이월드'), r.foot));
  r = await search('서울 가상구 가온로3가길 7');
  t('번지가 없으면 길 위치로', () => { assert(r.items[0] && r.items[0].startsWith('가온로3가길'), r.items[0]); assert(r.note.includes('건물 번호가 지도 자료(OpenStreetMap)에 없어'), r.note); });
  r = await search('없는장소이름');
  t('못 찾으면 브이월드 인증키 안내', () => { assert.strictEqual(r.items.length, 0); });

  // ── 2. 설정에서 인증키 넣고 시험 ──
  await page.evaluate(() => window.__navi.openSettings());
  await page.waitForSelector('#vworldKey', { timeout: 5000 });
  await page.fill('#vworldKey', '  TESTKEY ');
  await page.press('#vworldKey', 'Tab');
  await page.click('#vworldKey >> xpath=following-sibling::button');
  await page.waitForFunction(() => /정상입니다|응답|연결/.test(document.querySelector('#vworldKey').closest('.row').textContent), null, { timeout: 8000 });
  const testMsg = await page.evaluate(() => document.querySelector('#vworldKey').closest('.row').textContent);
  await page.locator('#vworldKey').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, 's-2-settings.png') });
  const savedKey = await page.evaluate(() => window.__navi.store.settings.vworldKey);
  t('설정: 인증키 저장(앞뒤 공백 제거)', () => assert.strictEqual(savedKey, 'TESTKEY'));
  t('설정: 시험 결과', () => assert(testMsg.includes('정상입니다 — ‘세종대로 110’ → 서울특별시청'), testMsg));
  await page.keyboard.press('Escape');
  await page.evaluate(() => { const b = document.querySelector('#overlay [aria-label="닫기"], #overlay .ov__close'); if (b) b.click(); });
  await page.waitForTimeout(400);

  // ── 3. 브이월드로 찾기 ──
  const before = log.length;
  r = await search('가온누리타운2차아파트', 's-3-vworld-name.png');
  t('브이월드: 아파트 공식 이름으로 찾음', () => { assert(r.items[0] && r.items[0].startsWith('가온2차누리타운'), r.items[0]); assert(r.items[0].includes('가온로3가길 7'), r.items[0]); });
  t('브이월드와 같은 건물인 OSM 결과는 하나로', () => assert(!r.items.slice(1).some(x => x.startsWith('누리타운')), r.items.join(' / ')));
  t('검색 출처에 브이월드', () => assert(r.foot.includes('브이월드(국토교통부)'), r.foot));
  r = await search('서울 가상구 가온로3가길 7', 's-4-vworld-addr.png');
  t('브이월드: 도로명 주소 → 건물', () => { assert(r.items[0] && r.items[0].startsWith('가온2차누리타운'), r.items[0]); assert(!r.note, r.note); });
  const vw = log.slice(before).filter(x => x.startsWith('vworld '));
  t('브이월드 요청 형식', () => {
    assert(vw.length >= 2, vw.length);
    for (const x of vw) {
      const u = new URL(x.slice(7));
      assert.strictEqual(u.searchParams.get('key'), 'TESTKEY');
      assert.strictEqual(u.searchParams.get('crs'), 'EPSG:4326');
      assert.strictEqual(u.searchParams.get('format'), 'json');
      assert.strictEqual(u.searchParams.get('domain'), 'https://jwlee1209-pixel.github.io');
      assert(/^__gilnaviVw\d+/.test(u.searchParams.get('callback')), u.searchParams.get('callback'));
    }
    assert(vw.some(x => /type=address/.test(x) && /category=road/.test(x)), '도로명 주소 요청 없음');
  });
  const rev = await page.evaluate(() => window.__navi.reversePlace(126.99, 37.575));
  t('브이월드: 좌표 → 도로명 주소', () => { assert.strictEqual(rev.name, '율곡로 57'); assert.strictEqual(rev.addr, '서울특별시 종로구 율곡로 57'); });
  const jsonpLeft = await page.evaluate(() => document.querySelectorAll('script[src*="vworld"]').length);
  t('JSONP 스크립트 정리', () => assert.strictEqual(jsonpLeft, 0));

  // ── 4. 틀린 인증키 ──
  await page.evaluate(() => { window.__navi.store.settings.vworldKey = 'WRONG'; window.__navi.store.scache = []; });
  r = await search('가온누리타운2차아파트', 's-5-badkey.png');
  t('틀린 키: 이유를 보여 주고 OSM 결과로', () => { assert(r.warn.includes('등록되지 않은 인증키입니다'), r.warn); assert(r.items[0] && r.items[0].startsWith('누리타운'), r.items[0]); });

  t('페이지 오류 없음', () => assert.strictEqual(errors.length, 0, errors.join(' | ')));
  await browser.close();
  console.log(fails ? `\n${fails}개 실패` : '\n검색 시험 통과');
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
