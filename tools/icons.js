// 앱 아이콘 만들기: node tools/icons.js → src/web/icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, icon.svg
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'src', 'web');
fs.mkdirSync(OUT, { recursive: true });

const ORANGE = '#C43E1C';
// 주황 바탕 + 흰 슬라이드(제목 줄·글 줄·막대그래프) + 받침
const inner = `
  <rect x="96" y="118" width="320" height="226" rx="22" fill="#fff"/>
  <rect x="132" y="154" width="150" height="28" rx="14" fill="${ORANGE}"/>
  <rect x="132" y="206" width="112" height="16" rx="8" fill="#F2B8A5"/>
  <rect x="132" y="236" width="88" height="16" rx="8" fill="#F2B8A5"/>
  <rect x="132" y="266" width="100" height="16" rx="8" fill="#F2B8A5"/>
  <rect x="300" y="248" width="28" height="64" rx="5" fill="${ORANGE}"/>
  <rect x="340" y="206" width="28" height="106" rx="5" fill="#E2774F"/>
  <rect x="244" y="344" width="24" height="52" fill="#fff"/>
  <rect x="184" y="390" width="144" height="24" rx="12" fill="#fff"/>`;
const svgRound = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${ORANGE}"/>${inner}</svg>`;
// 마스크 아이콘: 바탕을 끝까지 채우고 그림은 가운데 80% 안에
const svgMask = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${ORANGE}"/><g transform="translate(51.2 51.2) scale(0.8)">${inner}</g></svg>`;
// 사과 기기용: 모서리는 기기가 둥글게 깎으므로 네모 바탕
const svgSquare = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="${ORANGE}"/><g transform="translate(25.6 25.6) scale(0.9)">${inner}</g></svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const shot = async (svg, size, file) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(OUT, file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  };
  await shot(svgRound, 192, 'icon-192.png');
  await shot(svgRound, 512, 'icon-512.png');
  await shot(svgMask, 512, 'icon-maskable-512.png');
  await shot(svgSquare, 180, 'apple-touch-icon.png');
  fs.writeFileSync(path.join(OUT, 'icon.svg'), svgRound);
  await browser.close();
  console.log('아이콘:', fs.readdirSync(OUT).join(', '));
})();
