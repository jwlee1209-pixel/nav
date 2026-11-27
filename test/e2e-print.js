// PDF(인쇄) 시험: 인쇄용 화면을 만들어 Chromium 의 PDF 로 찍고 쪽 수·크기를 본다
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const OUT = path.join(__dirname, 'out');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
  let fails = 0;
  for (const f of ['basic.pptx', 'wide.pptx']) {
    const b64 = fs.readFileSync(path.join(__dirname, 'fixtures', f)).toString('base64');
    await page.evaluate(async ([b64, n]) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); await window.__ppt.openBuffer(u.buffer, n); }, [b64, f]);
    await page.evaluate(() => window.__ppt.preparePrint());
    const pdf = path.join(OUT, 'print-' + f.replace('.pptx', '.pdf'));
    await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
    const info = execFileSync('pdfinfo', [pdf]).toString();
    const pages = +info.match(/Pages:\s+(\d+)/)[1];
    const size = info.match(/Page size:\s+([\d.]+) x ([\d.]+)/);
    const n = await page.evaluate(() => window.__ppt.S.deck.slides.length);
    const W = await page.evaluate(() => window.__ppt.S.deck.W), H = await page.evaluate(() => window.__ppt.S.deck.H);
    const okP = pages === n, okS = Math.abs(+size[1] - W * 0.75) < 2 && Math.abs(+size[2] - H * 0.75) < 2;
    console.log(`${f}: ${pages}/${n}쪽 ${okP ? '✓' : '✗'}, 쪽 크기 ${size[1]}×${size[2]}pt (슬라이드 ${W * 0.75}×${H * 0.75}) ${okS ? '✓' : '✗'}`);
    if (!okP || !okS) fails++;
    execFileSync('pdftoppm', ['-r', '24', '-png', pdf, pdf.replace('.pdf', '')]);
  }
  console.log(errs.length ? '오류: ' + errs.join('\n') : '페이지 오류 없음');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
