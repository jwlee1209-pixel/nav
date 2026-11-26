// 앱 아이콘(PNG) 만들기: node tools/icons.js
const { chromium } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, '..', 'src', 'web');
const arrow = '<path d="M11 25V15.5a3.5 3.5 0 0 1 3.5-3.5H20" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M19 7.2 25.5 12 19 16.8z" fill="#fff"/>';
const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0B5CAD"/>${arrow}</svg>`;
// 마스커블: 가장자리까지 채우고 화살표는 가운데 안전 영역(80%) 안에
const full = scale => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#0B5CAD"/><g transform="translate(16 16) scale(${scale}) translate(-17.5 -16)">${arrow}</g></svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const jobs = [['icon-192.png', 192, rounded, true], ['icon-512.png', 512, rounded, true], ['icon-maskable-512.png', 512, full(0.78), false], ['apple-touch-icon.png', 180, full(0.9), false]];
  for (const [name, size, svg, transparent] of jobs) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await p.screenshot({ path: path.join(OUT, name), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('아이콘', name, size);
  }
  await b.close();
})();
