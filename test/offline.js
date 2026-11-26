const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 } });
  await c.route(/^https?:/, r => r.abort('internetdisconnected'));
  const p = await c.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.join(__dirname, '..', 'dist', 'index.html'));
  await p.waitForTimeout(7500);
  console.log('boot 남음:', await p.$('#boot') ? '예' : '아니오', '| 알림:', await p.textContent('#toast'), '| 위치상태:', await p.evaluate(() => window.__navi && window.__navi.S.gps));
  await p.fill('#q', '서울역'); await p.press('#q', 'Enter'); await p.waitForTimeout(3000);
  console.log('검색 화면:', (await p.textContent('#sheetBody')).slice(0, 80));
  console.log('페이지 오류:', errs.length ? errs : '없음');
  await p.screenshot({ path: path.join(__dirname, 'out', 'offline.png') });
  await b.close();
})();
