// 홈 화면에 추가(v2.4): node test/e2e-install.js
// 카카오톡(안드로이드·아이폰)·라인·네이버 앱 안 화면, 크롬(설치 창 있음/없음), 아이폰 Safari, 삼성 인터넷,
// 이미 설치한 앱, 카드 닫기, 앱 주소 보내기, 링크 미리보기 태그를 웹 주소(https)로 연 상황에서 확인한다.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const mock = require('./mocknet');
const F = require('./fixtures');
const OUT = path.join(__dirname, 'out');
const WEB = path.join(__dirname, '..', 'dist', 'web', 'navi');
const DOCS = path.join(__dirname, '..', 'docs');
const BASE = 'https://jwlee1209-pixel.github.io/nav/';
const TYPES = { html: 'text/html; charset=utf-8', json: 'application/json', js: 'application/javascript', png: 'image/png' };
const UA = {
  kakao: 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Mobile Safari/537.36;KAKAOTALK 2511250',
  kakaoIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 25.11.0',
  line: 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Mobile Safari/537.36 Line/14.19.1',
  naver: 'Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.6723.107 Whale/1.0.0.0 Crosswalk/28.130.0.21 Mobile Safari/537.36 NAVER(inapp; search; 2000; 12.10.3)',
  chrome: 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
};
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) fails++; console.log(c ? '  ok  ' : '  FAIL', m); };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const errors = [];
  async function open(ua, { url = BASE, init = null, dark = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: ua,
      geolocation: { latitude: F.P.A[1], longitude: F.P.A[0], accuracy: 8 }, permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
      locale: 'ko-KR', timezoneId: 'Asia/Seoul', colorScheme: dark ? 'dark' : 'light' });
    await context.route(/^https:\/\/jwlee1209-pixel\.github\.io\/nav\/.*/, r => {
      const u = new URL(r.request().url());
      const f = u.pathname.replace('/nav/', '') || 'index.html';
      const fp = path.join(WEB, f);
      if (f === 'cameras.json' || !fs.existsSync(fp)) return r.fulfill({ status: 404, body: 'nf' });
      r.fulfill({ status: 200, headers: { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' }, body: fs.readFileSync(fp) });
    });
    await mock.install(context);
    await context.addInitScript(() => { if (window.speechSynthesis) { speechSynthesis.speak = () => {}; speechSynthesis.cancel = () => {}; } });
    if (init) await context.addInitScript(init);
    const page = await context.newPage();
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/kakaotalk:|scheme|cameras\.json|404/i.test(m.text())) errors.push(m.text().slice(0, 200)); });
    await page.goto(url);
    await page.waitForFunction(() => !document.getElementById('boot') && window.__navi, null, { timeout: 15000 });
    await page.waitForTimeout(500);
    return { context, page };
  }
  const text = (page, sel) => page.$eval(sel, e => e.textContent).catch(() => null);
  const toastText = page => page.$eval('#toast', e => e.textContent);
  const fakePrompt = (page, outcome) => page.evaluate(o => {
    window.__prompted = 0;
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__prompted++; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: o, platform: 'web' });
    window.dispatchEvent(e);
  }, outcome);

  console.log('① 카카오톡(안드로이드) 안 화면');
  {
    const { context, page } = await open(UA.kakao);
    ok(await page.isVisible('#a2hsCard'), '첫 화면 맨 위에 ‘홈 화면에 추가’ 카드');
    ok(/카카오톡에서는 휴대폰 브라우저로/.test(await text(page, '#a2hsCard')), '카드: 카카오톡에서는 브라우저로 옮겨서 추가한다고 알림');
    await page.screenshot({ path: path.join(OUT, 'inst-1-kakao-card.png') });
    await page.click('#btnA2hs');
    const ext = await page.evaluate(() => window.__lastExternal);
    ok(/^kakaotalk:\/\/web\/openExternal\?url=/.test(ext || ''), '누르면 카카오톡의 ‘다른 브라우저로 열기’ 주소로 보냄');
    ok(decodeURIComponent((ext || '').split('url=')[1] || '') === BASE + '?add=home', '옮겨 갈 주소: 앱 주소 + ?add=home');
    // 이 시험 브라우저는 카카오톡이 아니라 넘어가지 못한다 → 2초 뒤 메뉴로 여는 방법
    await page.waitForSelector('.a2g[data-kind="inapp"]', { timeout: 4000 });
    const g = await text(page, '.a2g');
    ok(/다른 브라우저로 열기/.test(g) && /⋮/.test(g), '못 넘어가면: ⋮ → 다른 브라우저로 열기 안내');
    ok(/jwlee1209-pixel\.github\.io\/nav\//.test(g), '안내에 앱 주소도 보임');
    await page.screenshot({ path: path.join(OUT, 'inst-2-kakao-guide.png') });
    ok(!(await page.$('.a2g__note')), '저장한 것이 없으면 옮겨지지 않는다는 말은 생략');
    await page.click('#a2gCopy');
    await page.waitForTimeout(300);
    ok((await page.evaluate(() => navigator.clipboard.readText())) === BASE, '주소 복사');
    ok(/주소를 복사했습니다/.test(await toastText(page)), '복사 알림');
    await page.click('#a2gClose');
    ok(await page.isHidden('#dialog'), '닫기');
    await page.evaluate(() => window.__navi.openSettings());
    ok(/앱 안 화면에서는 휴대폰 브라우저로/.test(await page.textContent('#overlay')) && await page.isVisible('#setA2hs'), '설정 → 앱 정보에도 ‘홈 화면에 추가’');
    await context.close();
  }

  console.log('② 카카오톡(아이폰) 안 화면');
  {
    const { context, page } = await open(UA.kakaoIos);
    await page.evaluate(() => { window.__navi.store.home = { name: '우리집', lat: 37.5, lon: 127 }; });
    await page.click('#btnA2hs');
    ok(/^kakaotalk:\/\/web\/openExternal\?url=/.test(await page.evaluate(() => window.__lastExternal) || ''), '아이폰도 같은 방법으로 Safari 로');
    await page.waitForSelector('.a2g[data-kind="inapp"]', { timeout: 4000 });
    ok(/Safari/.test(await text(page, '.a2g')) && !/⋮/.test(await text(page, '.a2g')), '못 넘어가면: 공유 → Safari 안내(아이폰 메뉴)');
    ok(/카카오톡 안 화면에 저장한 집·회사·기록은 브라우저로 옮겨지지 않습니다/.test(await text(page, '.a2g__note') || ''), '집을 저장해 두었으면: 브라우저로 옮겨지지 않는다고 알림');
    ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('a2g')), '창이 열리면 포커스는 창 안으로');
    await context.close();
  }

  console.log('③ 라인·네이버 앱 안 화면');
  {
    const { context, page } = await open(UA.line);
    const navs = [];
    page.on('request', r => { if (r.isNavigationRequest()) navs.push(r.url()); });
    const nav = page.waitForNavigation({ timeout: 8000 });
    await page.click('#btnA2hs');
    await nav;
    await page.waitForFunction(() => window.__navi, null, { timeout: 15000 });
    ok(navs.includes(BASE + '?add=home&openExternalBrowser=1'), '라인: openExternalBrowser=1 을 붙여 바깥 브라우저로 열기 요청 — ' + navs.join(', '));
    await page.waitForTimeout(800);
    ok(page.url() === BASE, '다시 열린 주소에서 ?add=home·openExternalBrowser 지움: ' + page.url());
    ok(await page.isHidden('#dialog'), '라인 안에서 다시 열려도 안내 창을 억지로 띄우지 않음');
    await context.close();
    const nv = await open(UA.naver);
    await nv.page.click('#btnA2hs');
    ok(await nv.page.isVisible('.a2g[data-kind="inapp"]'), '네이버 앱: 바로 메뉴 안내');
    ok(/Chrome으로 열기/.test(await text(nv.page, '.a2g')), '네이버 앱 안내: 다른 브라우저로 열기(또는 Chrome으로 열기)');
    ok(!(await nv.page.evaluate(() => window.__lastExternal)), '모르는 앱에서는 주소를 바꾸지 않음(화면을 잃지 않게)');
    await nv.context.close();
  }

  console.log('④ 카카오톡에서 옮겨 온 크롬(?add=home)');
  {
    const { context, page } = await open(UA.chrome, { url: BASE + '?add=home' });
    await page.waitForSelector('.a2g', { timeout: 4000 });
    ok(page.url() === BASE, '주소에서 ?add=home 지움');
    ok(await page.getAttribute('.a2g', 'data-kind') === 'android', '열자마자 안내: 크롬 메뉴');
    const g = await text(page, '.a2g');
    ok(/⋮/.test(g) && /홈 화면에 추가/.test(g) && /앱 설치/.test(g), '설치 창을 아직 못 받았으면: ⋮ → 홈 화면에 추가(또는 앱 설치)');
    await page.screenshot({ path: path.join(OUT, 'inst-3-chrome-arrive.png') });
    await fakePrompt(page, 'accepted');
    await page.waitForSelector('#a2gInstall', { timeout: 3000 });
    ok(!(await page.$('.a2g__steps')), '크롬이 설치 창을 주면 단계 대신 단추 하나');
    await page.screenshot({ path: path.join(OUT, 'inst-4-chrome-quick.png') });
    await page.click('#a2gInstall');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__prompted) === 1, '단추 → 크롬 설치 창');
    ok(await page.isHidden('#dialog') && !(await page.$('#a2hsCard')), '설치하면 안내·카드 사라짐');
    ok(/홈 화면에 추가하는 중/.test(await toastText(page)), '알림: 추가하는 중');
    await context.close();
  }

  console.log('⑤ 크롬: 카드에서 바로 설치 창, 거절, 설치 완료 신호');
  {
    const { context, page } = await open(UA.chrome);
    ok(/아이콘을 누르면 앱처럼/.test(await text(page, '#a2hsCard')), '카드 설명: 앱처럼 바로 열림');
    await fakePrompt(page, 'dismissed');
    await page.click('#btnA2hs');
    await page.waitForTimeout(300);
    ok(await page.evaluate(() => window.__prompted) === 1 && await page.isHidden('#dialog'), '설치 창을 받아 두었으면 카드 단추가 바로 띄움');
    ok(await page.isVisible('#a2hsCard'), '거절하면 카드는 그대로');
    await page.click('#btnA2hs');
    ok(await page.isVisible('.a2g[data-kind="android"]'), '설치 창을 다 썼으면 메뉴 안내로');
    await page.click('#a2gClose');
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await page.waitForTimeout(200);
    ok(!(await page.$('#a2hsCard')), '설치 완료 신호(appinstalled) → 카드 사라짐');
    ok(/홈 화면에 추가했습니다/.test(await toastText(page)), '알림: 추가했습니다');
    await context.close();
  }

  console.log('⑥ 아이폰 Safari · 삼성 인터넷');
  {
    const { context, page } = await open(UA.safari);
    await page.click('#btnA2hs');
    const g = await text(page, '.a2g[data-kind="ios"]');
    ok(/공유/.test(g) && /⋯/.test(g) && /홈 화면에 추가/.test(g) && /추가/.test(g), '아이폰: 공유(또는 ⋯ → 공유) → 홈 화면에 추가 → 추가');
    await page.screenshot({ path: path.join(OUT, 'inst-5-ios-guide.png') });
    await context.close();
    const sm = await open(UA.samsung, { dark: true });
    await sm.page.evaluate(() => { window.__navi.store.settings.theme = 'night'; window.__navi.applyTheme(); });
    await sm.page.click('#btnA2hs');
    const sg = await text(sm.page, '.a2g[data-kind="samsung"]');
    ok(/≡/.test(sg) && /현재 페이지 추가/.test(sg) && /홈 화면/.test(sg) && /도구/.test(sg), '삼성 인터넷: ≡ → 현재 페이지 추가 → 홈 화면(없으면 도구 안)');
    await sm.page.screenshot({ path: path.join(OUT, 'inst-6-samsung-night.png') });
    await sm.context.close();
  }

  console.log('⑦ 카드 닫기·이미 설치한 앱·앱 주소 보내기');
  {
    const { context, page } = await open(UA.chrome);
    await page.click('#btnA2hsX');
    ok(!(await page.$('#a2hsCard')), '× → 카드 숨김');
    ok(/설정 → 앱 정보/.test(await toastText(page)), '숨길 때 다시 찾는 곳 알림');
    await page.reload();
    await page.waitForFunction(() => window.__navi, null, { timeout: 15000 });
    await page.waitForTimeout(400);
    ok(!(await page.$('#a2hsCard')), '다시 열어도 숨김(60일)');
    await page.evaluate(() => window.__navi.openSettings());
    ok(await page.isVisible('#setA2hs'), '설정에는 계속 있음');
    await page.click('#setA2hs');
    ok(await page.isHidden('#overlay') && await page.isVisible('.a2g[data-kind="android"]'), '설정에서 누르면 설정을 닫고 안내');
    await context.close();

    const app = await open(UA.chrome, { init: () => {
      Object.defineProperty(navigator, 'standalone', { get: () => true });
      navigator.share = d => { window.__shared = d; return Promise.resolve(); };
    } });
    ok(!(await app.page.$('#a2hsCard')), '홈 화면 앱으로 열면 카드 없음');
    await app.page.evaluate(() => window.__navi.openSettings());
    ok(!(await app.page.$('#setA2hs')), '설정에도 ‘홈 화면에 추가’ 없음');
    await app.page.click('#setShare');
    await app.page.waitForTimeout(200);
    const sh = await app.page.evaluate(() => window.__shared);
    ok(sh && sh.url === BASE && sh.title === '길잡이 내비', '앱 주소 보내기 → 휴대폰 공유 창(카카오톡 등): ' + JSON.stringify(sh));
    await app.context.close();

    const noShare = await open(UA.chrome, { init: () => { delete Navigator.prototype.share; } });
    await noShare.page.evaluate(() => window.__navi.openSettings());
    await noShare.page.click('#setShare');
    await noShare.page.waitForTimeout(300);
    ok((await noShare.page.evaluate(() => navigator.clipboard.readText())) === BASE && /카카오톡 대화창에 붙여/.test(await toastText(noShare.page)), '공유 창이 없으면 주소 복사');
    await noShare.context.close();
  }

  console.log('⑧ 컴퓨터·내려받은 파일');
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await mock.install(ctx);
    await ctx.route(/^https:\/\/jwlee1209-pixel\.github\.io\/nav\/.*/, r => {
      const f = new URL(r.request().url()).pathname.replace('/nav/', '') || 'index.html';
      const fp = path.join(WEB, f);
      if (f === 'cameras.json' || !fs.existsSync(fp)) return r.fulfill({ status: 404, body: 'nf' });
      r.fulfill({ status: 200, headers: { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream' }, body: fs.readFileSync(fp) });
    });
    const p = await ctx.newPage();
    await p.goto(BASE);
    await p.waitForFunction(() => window.__navi, null, { timeout: 15000 });
    await p.waitForTimeout(400);
    ok(!(await p.$('#a2hsCard')), '컴퓨터 브라우저: 카드 없음');
    await ctx.close();
    const f = await open(UA.chrome, { url: 'file://' + path.join(__dirname, '..', 'dist', 'index.html') });
    ok(!(await f.page.$('#a2hsCard')), '내려받은 파일로 열면 카드 없음(홈 화면 앱이 될 수 없음)');
    await f.context.close();
  }

  console.log('⑨ 링크 미리보기(카카오톡)');
  {
    const html = fs.readFileSync(path.join(DOCS, 'index.html'), 'utf8');
    const meta = k => { const m = html.match(new RegExp(`<meta property="${k}" content="([^"]*)"`)); return m ? m[1].replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCodePoint(parseInt(x, 16))) : null; };
    ok(meta('og:title') === '길잡이 내비', 'og:title');
    ok(/홈 화면에 추가/.test(meta('og:description') || ''), 'og:description: 홈 화면에 추가하라는 안내 — ' + meta('og:description'));
    ok(meta('og:image') === BASE + 'og-image.png', 'og:image 는 절대 주소');
    const png = fs.readFileSync(path.join(DOCS, 'og-image.png'));
    ok(png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, `그림 크기 ${png.readUInt32BE(16)}×${png.readUInt32BE(20)}, ${(png.length / 1024).toFixed(0)}KB`);
    ok(png.length < 300 * 1024, '그림 300KB 미만');
  }

  ok(!errors.length, '페이지 오류 없음' + (errors.length ? ': ' + errors.slice(0, 4).join(' / ') : ''));
  await browser.close();
  console.log(fails ? `\n${fails}개 실패 (${n}개 중)` : `\ne2e-install: ${n}개 통과`);
  process.exitCode = fails ? 1 : 0;
})().catch(e => { console.error(e); process.exit(1); });
