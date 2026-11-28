// 카카오톡·문자로 링크를 보낼 때 뜨는 미리보기 그림(1200×630): node tools/og.js
// 길 안내 표지판처럼: 도로 표지 파란 바탕, 안쪽 흰 테두리, 앱 아이콘과 같은 회전 화살표
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'src', 'web', 'og-image.png');
const W = 1200, H = 630;
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html, body { margin: 0; }
  body { width: ${W}px; height: ${H}px; background: #0B5CAD; font-family: 'Noto Sans CJK KR', sans-serif; color: #fff; position: relative; overflow: hidden; }
  .frame { position: absolute; inset: 30px; border: 8px solid #fff; border-radius: 30px; }
  .sign { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 64px; padding: 0 40px 6px; }
  .arrow { width: 230px; height: 280px; flex: none; }
  .t { font-weight: 900; font-size: 136px; line-height: 1; letter-spacing: -2px; }
  .s { margin-top: 30px; font-weight: 700; font-size: 46px; line-height: 1.2; opacity: .92; letter-spacing: -.5px; }
</style></head><body>
  <div class="frame"></div>
  <div class="sign">
    <svg class="arrow" viewBox="9 5 18 22"><path d="M11 25V15.5a3.5 3.5 0 0 1 3.5-3.5H20" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M19 7.2 25.5 12 19 16.8z" fill="#fff"/></svg>
    <div><div class="t">길잡이 내비</div><div class="s">무료 지도와 한국어 음성 안내</div></div>
  </div>
</body></html>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.setContent(html);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } });
  await b.close();
  console.log('미리보기 그림', OUT);
})();
