// 같은 사이트 안의 다른 앱(docs/ppt/ = PPT 편집기)과 서비스 워커가 서로 건드리지 않는지 시험
//  1) 예전(v2.1) 서비스 워커가 깔린 휴대폰에서 /nav/ppt/ 를 처음 열 때: 예전 것은 캐시를 더럽히지만(문제 재현)
//     그 순간 브라우저가 새 서비스 워커(v2.2)를 받아 깔면서 캐시가 바로 깨끗해지는지
//  2) 새 서비스 워커: /nav/ppt/ 를 열어도 내비 캐시(첫 화면)가 그대로이고, 인터넷이 끊겨도 내비가 열리는지
// 서비스 워커 새 판 확인 요청은 Playwright 가 가로채지 못하므로, 이 컴퓨터에 https 서버를 띄우고
// jwlee1209-pixel.github.io 를 그 서버로 돌린다(인증서 경고는 시험에서만 무시).
// node test/e2e-sw.js   (먼저 node build.js 로 docs/ 를 만든다)
const { chromium } = require('playwright');
const https = require('https');
const path = require('path'), fs = require('fs');
const { execFileSync } = require('child_process');
const mock = require('./mocknet');
const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const OUT = path.join(__dirname, 'out');
const BASE = 'https://jwlee1209-pixel.github.io/nav/';
const TYPES = { html: 'text/html; charset=utf-8', json: 'application/json', js: 'application/javascript', png: 'image/png' };
const PPTX = '/home/claude/pptedit/test/fixtures/basic.pptx';
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const key = path.join(OUT, 'sw-test.key'), crt = path.join(OUT, 'sw-test.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=jwlee1209-pixel.github.io'], { stdio: 'ignore' });
  const oldSw = execFileSync('git', ['show', '07af503:docs/sw.js'], { cwd: ROOT }).toString();   // v2.1
  let useOld = true, offline = false;
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
    const u = new URL(req.url, 'https://x');
    if (offline) { req.socket.destroy(); return; }
    if (!u.pathname.startsWith('/nav/')) { res.writeHead(404); return res.end('nf'); }
    let f = u.pathname.slice(5);
    if (!f || f.endsWith('/')) f += 'index.html';
    if (f === 'sw.js' && useOld) { res.writeHead(200, { 'content-type': TYPES.js, 'cache-control': 'no-cache' }); return res.end(oldSw); }
    const fp = path.join(DOCS, f);
    if (!fs.existsSync(fp)) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': TYPES[f.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(fs.readFileSync(fp));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  // 이 시험의 브라우저는 바깥 프록시를 쓰지 않고 위 서버로 바로 간다
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const browser = await chromium.launch({ env, args: ['--enable-unsafe-swiftshader', `--host-resolver-rules=MAP jwlee1209-pixel.github.io:443 127.0.0.1:${port}`, '--ignore-certificate-errors', '--no-proxy-server', '--proxy-bypass-list=*'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'ko-KR', ignoreHTTPSErrors: true });
  await mock.install(context);
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  const cacheState = () => page.evaluate(async () => {
    const out = {};
    for (const k of (await caches.keys()).filter(k => k.startsWith('gilnavi-'))) {   // 내비 캐시만(편집기는 자기 캐시 pptedit-* 를 따로 씀)
      const r = await (await caches.open(k)).match('https://jwlee1209-pixel.github.io/nav/');
      const t = r ? await r.text() : '';
      out[k] = t.includes('__ppt') ? 'PPT편집기' : t.includes('generator') ? '내비' : t ? '기타' : '없음';
    }
    return out;
  });
  const waitCache = async want => { for (let i = 0; i < 60; i++) { const s = await cacheState(); if (JSON.stringify(s) === JSON.stringify(want)) return s; await page.waitForTimeout(250); } return cacheState(); };

  console.log('1. 예전 서비스 워커(v2.1)가 깔린 휴대폰에서 PPT 편집기를 처음 열 때');
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), '내비가 예전 서비스 워커 아래에서 열림');
  useOld = false;   // 이제 사이트에는 새 서비스 워커(v2.2)와 PPT 편집기가 올라가 있다
  await page.goto(BASE + 'ppt/');
  ok(/PPT 편집기/.test(await page.title()), `PPT 편집기 열림: ${await page.title()}`);
  const st = await waitCache({ 'gilnavi-v2.2': '내비' });
  console.log('    캐시:', JSON.stringify(st));
  ok(JSON.stringify(st) === JSON.stringify({ 'gilnavi-v2.2': '내비' }), '브라우저가 새 서비스 워커로 바꾸며 캐시가 깨끗해짐(내비 첫 화면만)');

  console.log('2. 새 서비스 워커에서 PPT 편집기 쓰기');
  await page.goto(BASE + 'ppt/');
  const b64 = fs.readFileSync(PPTX).toString('base64');
  const n = await page.evaluate(async b64 => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await window.__ppt.openBuffer(u.buffer, 'b.pptx'); return window.__ppt.S.deck.slides.length; }, b64);
  ok(n === 6, `PPT 편집기에서 파일 열기(슬라이드 ${n}장)`);
  ok(await page.evaluate(() => window.isSecureContext && 'showSaveFilePicker' in window), 'https 주소라 원본에 바로 저장(File System Access) 가능');
  await page.waitForTimeout(500);
  ok(JSON.stringify(await cacheState()) === JSON.stringify({ 'gilnavi-v2.2': '내비' }), 'PPT 편집기를 열어도 내비 캐시 그대로');

  console.log('3. 인터넷이 끊긴 상태');
  offline = true;
  await page.goto(BASE).catch(() => null);
  ok(/길잡이 내비/.test(await page.title().catch(() => '')), '내비는 캐시로 열림');
  const pp = await page.goto(BASE + 'ppt/').then(() => 'loaded').catch(() => 'error');
  ok(pp === 'error' || !/길잡이 내비/.test(await page.title().catch(() => '')), `PPT 주소에 내비 화면이 대신 나오지 않음(${pp === 'error' ? '연결 오류로 표시' : '다른 화면'})`);
  offline = false;

  console.log(errs.length ? '오류: ' + errs.join('\n') : '페이지 오류 없음');
  console.log(fails ? `실패 ${fails}개` : '모두 통과');
  await browser.close();
  server.close();
  process.exit(fails ? 1 : 0);
})();
