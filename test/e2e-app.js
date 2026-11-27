// 설치형 앱(웹 판) 시험: 설치 가능 여부(manifest·아이콘·서비스 워커), 파일 연결(launchQueue)로 받은 파일 열기와
// 원본에 바로 저장, 같은 사이트의 길잡이 내비 서비스 워커와 함께 쓰기, 인터넷이 끊겼을 때.
// 웹 주소(https://jwlee1209-pixel.github.io/nav/...)를 이 컴퓨터의 https 서버로 돌려 실제 서비스 워커로 시험한다.
// node test/e2e-app.js   (먼저 node build.js)
const { chromium } = require('playwright');
const https = require('https');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
const WEB = path.join(ROOT, 'dist', 'web', 'ppt');
const NAV = '/home/claude/nav/docs';     // 같은 사이트의 내비(있으면 함께 시험)
const BASE = 'https://jwlee1209-pixel.github.io/nav/';
const TYPES = { html: 'text/html; charset=utf-8', json: 'application/json', js: 'application/javascript', png: 'image/png' };
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const key = path.join(OUT, 'app-test.key'), crt = path.join(OUT, 'app-test.crt');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', crt, '-days', '1', '-subj', '/CN=jwlee1209-pixel.github.io'], { stdio: 'ignore' });
  let offline = false;
  const hits = [];
  const server = https.createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(crt) }, (req, res) => {
    if (offline) { req.socket.destroy(); return; }
    const u = new URL(req.url, 'https://x');
    hits.push(u.pathname);
    let fp = null;
    if (u.pathname.startsWith('/nav/ppt/')) { let f = u.pathname.slice(9) || 'index.html'; fp = path.join(WEB, f); }
    else if (u.pathname.startsWith('/nav/') && fs.existsSync(NAV)) { let f = u.pathname.slice(5) || 'index.html'; fp = path.join(NAV, f); }
    if (!fp || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': TYPES[fp.split('.').pop()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(fs.readFileSync(fp));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
  const browser = await chromium.launch({ env, args: [`--host-resolver-rules=MAP jwlee1209-pixel.github.io:443 127.0.0.1:${server.address().port}`, '--ignore-certificate-errors', '--no-proxy-server', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'ko-KR', ignoreHTTPSErrors: true });
  // 운영체제가 앱에 파일을 넘겨주는 것(launchQueue)을 흉내: 받는 함수를 잡아 두고 가짜 파일 손잡이를 넘긴다
  await context.addInitScript(() => {
    Object.defineProperty(window, 'launchQueue', { configurable: true, value: { setConsumer(fn) { window.__consumer = fn; } } });
  });
  const page = await context.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('requestfailed', r => { if (!/openfreemap|photon|nominatim|valhalla|routing.openstreetmap|jsdelivr/.test(r.url())) errs.push('요청 실패: ' + r.url()); });

  console.log('1. 웹 판 열기·설치 가능 여부');
  await page.goto(BASE + 'ppt/');
  ok(/PPT 편집기/.test(await page.title()), '제목: ' + await page.title());
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const ctl = await page.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL);
  ok(ctl === BASE + 'ppt/sw.js', '서비스 워커(편집기 것)가 이 화면을 맡음: ' + ctl);
  const cdp = await context.newCDPSession(page);
  const man = await cdp.send('Page.getAppManifest');
  ok(man.errors.length === 0, 'manifest 오류 없음' + (man.errors.length ? ': ' + JSON.stringify(man.errors) : ''));
  const parsed = JSON.parse(man.data);
  const fh = parsed.file_handlers && parsed.file_handlers[0];
  ok(fh && fh.accept['application/vnd.openxmlformats-officedocument.presentationml.presentation'][0] === '.pptx' && fh.accept['application/vnd.ms-powerpoint'].includes('.ppt'), '파일 연결 형식: .pptx·.ppt 등');
  const inst = await cdp.send('Page.getInstallabilityErrors').catch(e => ({ installabilityErrors: [{ errorId: 'cdp:' + e.message }] }));
  ok(inst.installabilityErrors.length === 0, '설치 가능(크롬 판정)' + (inst.installabilityErrors.length ? ': ' + inst.installabilityErrors.map(e => e.errorId).join(', ') : ''));
  for (const ic of parsed.icons) {
    const sz = await page.evaluate(async src => { const im = new Image(); im.src = src; await im.decode(); return im.naturalWidth + 'x' + im.naturalHeight; }, ic.src);
    ok(sz === ic.sizes, `아이콘 ${ic.src} ${sz}`);
  }

  console.log('2. 파일 탐색기에서 두 번 누른 파일 받기(launchQueue) → 고치기 → 원본에 저장');
  const b64 = fs.readFileSync(path.join(__dirname, 'fixtures', 'basic.pptx')).toString('base64');
  await page.waitForFunction(() => typeof window.__consumer === 'function');
  await page.evaluate(async b64 => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    window.__perm = []; window.__written = null;
    const handle = {
      kind: 'file', name: '발표 자료.pptx',
      getFile: async () => new File([u], '발표 자료.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
      queryPermission: async () => 'prompt',
      requestPermission: async o => { window.__perm.push(o && o.mode); return 'granted'; },
      createWritable: async () => ({ async write(b) { window.__written = b; }, async close() { window.__closed = true; } }),
    };
    await window.__consumer({ files: [handle] });
  }, b64);
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({ name: window.__ppt.S.file && window.__ppt.S.file.name, n: window.__ppt.S.deck && window.__ppt.S.deck.slides.length, h: !!(window.__ppt.S.file && window.__ppt.S.file.handle) }));
  ok(st.name === '발표 자료.pptx' && st.n === 6 && st.h, `받은 파일 열림(${st.name}, ${st.n}장, 원본 손잡이 ${st.h ? '있음' : '없음'})`);
  // 제목 고치기
  const t = await page.evaluate(() => { const r = document.querySelector('#slideHost .slide > .obj').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.dblclick(t.x, t.y);
  await page.keyboard.press('End');
  await page.keyboard.type(' (고침)');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+s');
  await page.waitForSelector('#dialog:not([hidden])');
  const dlg = await page.textContent('#dialog');
  ok(/원본 파일에 저장/.test(dlg), '처음 저장할 때 덮어쓰기 확인');
  await page.click('#dialog .btn.primary');
  await page.waitForFunction(() => window.__closed === true, null, { timeout: 10000 }).catch(() => null);
  const w = await page.evaluate(async () => { const b = window.__written; if (!b) return null; const u = new Uint8Array(await b.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return { b64: btoa(s), perm: window.__perm, dirty: window.__ppt.S.dirty }; });
  ok(w && w.perm.includes('readwrite'), '쓰기 권한 요청(브라우저가 사용자에게 묻는 단계)');
  ok(w && !w.dirty, '저장 후 바뀜 표시 지움');
  if (w) {
    const p = path.join(OUT, 'launched-saved.pptx');
    fs.writeFileSync(p, Buffer.from(w.b64, 'base64'));
    const title = execFileSync('python3', ['-c', 'import sys\nfrom pptx import Presentation\np=Presentation(sys.argv[1])\nprint(p.slides[0].shapes.title.text)', p]).toString().trim();
    ok(/\(고침\)$/.test(title), '원본 자리에 쓴 파일(python-pptx): ' + title);
  }
  // 두 번째 저장은 묻지 않고 바로
  await page.evaluate(() => { window.__closed = false; window.__ppt.S.dirty = true; });
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => window.__closed === true, null, { timeout: 10000 }).catch(() => null);
  ok(await page.evaluate(() => window.__closed === true && document.querySelector('#dialog').hidden), '다음 저장(Ctrl+S)은 바로 덮어씀');
  // 옛 .ppt 를 받으면: .pptx 로 바꿔 열고 저장은 새 이름으로(원본 .ppt 는 그대로)
  const b64p = fs.readFileSync(path.join(__dirname, 'fixtures', 'basic.ppt')).toString('base64');
  await page.evaluate(() => { window.__ppt.S.dirty = false; });
  await page.evaluate(async b64 => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    await window.__consumer({ files: [{ kind: 'file', name: '옛 자료.ppt', getFile: async () => new File([u], '옛 자료.ppt'), createWritable: async () => { window.__pptOverwritten = true; return { async write() {}, async close() {} }; } }] });
  }, b64p);
  await page.waitForTimeout(300);
  const sp = await page.evaluate(() => ({ name: window.__ppt.S.file.name, h: !!window.__ppt.S.file.handle, n: window.__ppt.S.deck.slides.length }));
  ok(sp.name === '옛 자료.pptx' && !sp.h && sp.n === 6, `.ppt 받으면 .pptx 로 열기(원본 손잡이 버림): ${sp.name}`);

  console.log('3. 같은 사이트의 길잡이 내비와 함께 쓰기');
  if (fs.existsSync(NAV)) {
    await page.goto(BASE);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const navCtl = await page.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL);
    ok(navCtl === BASE + 'sw.js', '내비 화면은 내비 서비스 워커: ' + navCtl);
    await page.goto(BASE + 'ppt/');
    const ctl2 = await page.evaluate(() => navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL);
    ok(ctl2 === BASE + 'ppt/sw.js', '편집기 화면은 편집기 서비스 워커: ' + ctl2);
    const caches = await page.evaluate(async () => { const out = {}; for (const k of await caches.keys()) { const r = await (await caches.open(k)).match(k.startsWith('gilnavi') ? 'https://jwlee1209-pixel.github.io/nav/' : 'https://jwlee1209-pixel.github.io/nav/ppt/'); const t = r ? await r.text() : ''; out[k] = t.includes('__ppt') ? 'PPT편집기' : t.includes('generator') ? '내비' : '없음'; } return out; });
    console.log('    캐시:', JSON.stringify(caches));
    ok(Object.entries(caches).every(([k, v]) => (k.startsWith('gilnavi') ? v === '내비' : v === 'PPT편집기')), '각자 자기 화면만 저장');
  } else console.log('  (내비 docs 없음 — 건너뜀)');

  console.log('4. 인터넷이 끊긴 상태(설치한 앱을 오프라인에서 열기)');
  offline = true;
  await page.goto(BASE + 'ppt/').catch(() => null);
  ok(/PPT 편집기/.test(await page.title().catch(() => '')) && await page.evaluate(() => !!window.__ppt), '편집기가 저장해 둔 화면으로 열림');
  if (fs.existsSync(NAV)) { await page.goto(BASE).catch(() => null); ok(/길잡이 내비/.test(await page.title().catch(() => '')), '내비도 그대로 열림'); }
  offline = false;

  console.log('5. 휴대폰 ‘공유 → PPT 편집기’(Web Share Target)');
  ok(parsed.share_target && parsed.share_target.method === 'POST' && parsed.share_target.params.files[0].accept.includes('.pptx'), 'manifest 에 공유 받기(share_target) 있음');
  await page.goto(BASE + 'ppt/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // 안드로이드가 하는 것처럼 파일을 multipart POST 로 보낸다(화면 이동 요청)
  await page.evaluate(() => { const f = document.createElement('form'); f.id = '__sf'; f.method = 'POST'; f.action = 'share'; f.enctype = 'multipart/form-data'; const i = document.createElement('input'); i.type = 'file'; i.name = 'file'; i.id = '__sfi'; f.append(i); document.body.append(f); });
  await page.setInputFiles('#__sfi', path.join(__dirname, 'fixtures', 'wide.pptx'));
  await Promise.all([page.waitForURL(u => /\/nav\/ppt\/(\?share=1)?$/.test(String(u))), page.evaluate(() => document.getElementById('__sf').submit())]);
  await page.waitForFunction(() => window.__ppt && window.__ppt.S.deck && window.__ppt.S.file.name === 'wide.pptx', null, { timeout: 10000 }).catch(() => null);
  const sh = await page.evaluate(async () => ({ name: window.__ppt.S.file && window.__ppt.S.file.name, n: window.__ppt.S.deck && window.__ppt.S.deck.slides.length, url: location.href, left: (await (await caches.open('pptshare')).keys()).length }));
  ok(sh.name === 'wide.pptx' && sh.n === 1, `공유받은 파일 열림(${sh.name}, ${sh.n}장)`);
  ok(!/share/.test(sh.url), '주소에서 공유 표시를 지움(새로 고침해도 다시 열지 않음)');
  ok(sh.left === 0, '받아 둔 파일은 열고 나서 지움');

  console.log('6. 휴대폰 화면(좁은 화면) 배치');
  const mctx = await browser.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, locale: 'ko-KR', ignoreHTTPSErrors: true });
  const mp = await mctx.newPage();
  mp.on('pageerror', e => errs.push('mobile: ' + e.message));
  await mp.goto(BASE + 'ppt/');
  const b64m = fs.readFileSync(path.join(__dirname, 'fixtures', 'basic.pptx')).toString('base64');
  await mp.evaluate(async b64 => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await window.__ppt.openBuffer(u.buffer, '발표.pptx'); }, b64m);
  await mp.waitForTimeout(300);
  const lay = await mp.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); const st = r('stage'), sd = r('side'), b1 = r('bar1'); return { stageW: st.width, sideTop: sd.top, stageBottom: st.bottom, sideH: sd.height, bar1H: b1.height, zoom: window.__ppt.S.zoom, horiz: getComputedStyle(document.getElementById('thumbs')).flexDirection }; });
  console.log('    ', JSON.stringify(lay));
  ok(lay.stageW > 360 && lay.sideTop > lay.stageBottom && lay.horiz === 'row' && lay.bar1H < 60, '슬라이드는 화면 너비 가득, 목록은 아래 가로 띠, 도구 막대 한 줄');
  await mp.screenshot({ path: path.join(OUT, 'app-mobile.png') });
  // 손가락으로 셋째 슬라이드 누르기
  const t3 = await mp.evaluate(() => { const r = document.querySelector('#thumbs .thumb[data-i="2"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await mp.touchscreen.tap(t3.x, t3.y);
  await mp.waitForTimeout(200);
  ok(await mp.evaluate(() => window.__ppt.S.cur) === 2, '손가락으로 슬라이드 고르기');
  // 손가락으로 도형 고르기 → 손잡이 크게
  const rp = await mp.evaluate(() => { const n = [...document.querySelectorAll('#slideHost .slide > .obj')].find(n => n.textContent.trim() === '사각형'); const r = n.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await mp.touchscreen.tap(rp.x, rp.y);
  await mp.waitForTimeout(150);
  const hd = await mp.evaluate(() => { const h = document.querySelector('#overlay .hd'); return h ? h.getBoundingClientRect().width : 0; });
  ok(hd >= 16, `도형 선택 손잡이 크기 ${hd.toFixed(1)}px(손가락용)`);
  await mp.screenshot({ path: path.join(OUT, 'app-mobile-select.png') });
  await mctx.close();

  console.log(errs.length ? '오류:\n' + [...new Set(errs)].join('\n') : '페이지 오류 없음');
  console.log(fails ? `실패 ${fails}개` : '모두 통과');
  await browser.close();
  server.close();
  process.exit(fails ? 1 : 0);
})();
