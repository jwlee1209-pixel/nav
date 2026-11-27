// 기본 시험: 시험 파일을 열어 슬라이드마다 그림으로 남기고 오류를 모은다
// node test/smoke.js [파일 이름 일부]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + path.join(root, 'dist', 'index.html'));
  const files = fs.readdirSync(path.join(__dirname, 'fixtures')).filter(f => /\.(pptx|ppt)$/.test(f) && (!only || f.includes(only)));
  for (const f of files) {
    const b64 = fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
    const t0 = Date.now();
    const ok = await page.evaluate(async ([b64, name]) => {
      const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return window.__ppt.openBuffer(u.buffer, name);
    }, [b64, f]);
    const n = await page.evaluate(() => window.__ppt.S.deck ? window.__ppt.S.deck.slides.length : 0);
    console.log(`${f}: 열기 ${ok ? '성공' : '실패'} ${Date.now() - t0}ms, 슬라이드 ${n}장`);
    if (!ok) { const d = await page.evaluate(() => document.querySelector('#dialog').innerText); console.log('  대화상자:', d); await page.evaluate(() => { const b = document.querySelector('#dialog .btn'); if (b) b.click(); }); continue; }
    for (let i = 0; i < n; i++) {
      await page.evaluate(i => { window.__ppt.goSlide(i); window.__ppt.select([]); }, i);
      // 1배 크기로 따로 그려 찍는다(편집 화면과 같은 그리기 함수)
      await page.evaluate(i => {
        let box = document.getElementById('__shot');
        if (!box) { box = document.createElement('div'); box.id = '__shot'; box.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;background:#fff'; document.body.append(box); }
        const P = window.__ppt, d = P.S.deck;
        box.replaceChildren(P.renderSlide(d, d.slides[i], { slideNo: i + 1 }));
      }, i);
      await page.waitForTimeout(60);
      const el = await page.$('#__shot .slide');
      await el.screenshot({ path: path.join(OUT, `${f.replace(/\.\w+$/, '')}-${f.endsWith('.ppt') ? 'ppt-' : ''}${i + 1}.png`) });
      await page.evaluate(() => document.getElementById('__shot').remove());
    }
    await page.screenshot({ path: path.join(OUT, `${f.replace(/\.\w+$/, '')}-${f.endsWith('.ppt') ? 'ppt-' : ''}app.png`) });
  }
  console.log(errs.length ? '오류·경고:\n' + [...new Set(errs)].slice(0, 40).join('\n') : '오류 없음');
  await browser.close();
})();
