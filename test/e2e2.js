// 내 장소 등록 · 지도 길게 누르기 · 경유지 · 백업 저장 흐름
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const mock = require('./mocknet');
const F = require('./fixtures');
const OUT = path.join(__dirname, 'out');
const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, geolocation: { latitude: F.P.A[1], longitude: F.P.A[0], accuracy: 8 }, permissions: ['geolocation'], locale: 'ko-KR', timezoneId: 'Asia/Seoul', acceptDownloads: true });
  const log = await mock.install(context);
  await context.addInitScript(() => { window.__said = []; if (window.speechSynthesis) { speechSynthesis.speak = u => window.__said.push(u.text); speechSynthesis.cancel = () => {}; } try { localStorage.setItem('gilnavi.v1', JSON.stringify({ settings: { theme: 'day' } })); } catch (e) {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, `flow-${n}.png`) }); };
  await page.goto(FILE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot('1-empty-home');
  // 회사 등록
  await page.click('.chip--work');
  await page.fill('#q', '대학로');
  await page.press('#q', 'Enter');
  await page.waitForSelector('.list .item');
  await page.click('.list .item:has-text("주차장")');
  await page.waitForTimeout(500);
  await shot('2-register-work');
  await page.click('text=회사로 등록');
  await page.waitForTimeout(800);
  const chips = await page.$$eval('.chip', a => a.map(x => x.textContent));
  console.log('칩:', chips.join(' | '));
  // 지도 오른쪽 클릭 → 장소 카드(주소 찾기)
  const box = await page.$eval('#map', e => { const r = e.getBoundingClientRect(); return { x: r.width / 2, y: r.height / 3 }; });
  await page.mouse.click(box.x, box.y, { button: 'right' });
  await page.waitForTimeout(1500);
  await shot('3-longpress');
  const placeName = await page.textContent('.place__name');
  console.log('길게 누른 곳:', placeName, '/', await page.textContent('.place__meta'));
  await page.click('text=여기로 길 안내');
  await page.waitForSelector('.rcard');
  // 경유지 추가
  await page.click('text=경유지 추가');
  await page.fill('#q', '대학로 공원');
  await page.press('#q', 'Enter');
  await page.waitForSelector('.list .item');
  await page.click('.list .item:has-text("공원")');
  await page.waitForTimeout(400);
  await page.click('.place__acts >> text=경유지로 추가');
  await page.waitForSelector('.rcard');
  await page.waitForTimeout(900);
  await shot('4-with-stop');
  console.log('경로 설정 줄:', (await page.$$eval('.plan__field', a => a.map(x => x.textContent))).join(' → '));
  // 모의 주행으로 경유지 통과(가짜 경로라 경유지 단계가 없어 안내 문장만 확인)
  await page.click('.plan .icon-btn[aria-label="뒤로"]');
  await page.waitForTimeout(400);
  // 내 장소 관리
  await page.click('text=내 장소 관리');
  await page.waitForTimeout(400);
  await shot('5-places');
  await page.click('.ov__head .icon-btn');
  // 백업 저장
  await page.click('#btnSettings');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('.row:has-text("백업 파일로 저장") button')]);
  console.log('백업 파일:', dl ? dl.suggestedFilename() : '(내려받기 없음)');
  if (dl) { const p = path.join(OUT, 'backup.json'); await dl.saveAs(p); const d = JSON.parse(fs.readFileSync(p, 'utf8')); console.log('백업 내용: app=', d.app, 'work=', d.work && d.work.name, 'recents=', d.recents.length); }
  console.log('\n요청:'); log.forEach(l => console.log('  ' + l.slice(0, 160)));
  console.log('\n오류:', errors.length ? errors.join('\n') : '없음');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
