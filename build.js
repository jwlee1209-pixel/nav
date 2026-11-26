// 묶기: node build.js [버전]
//  · dist/길잡이내비_v버전.html      : 파일 하나로 여는 판
//  · dist/web/navi/                   : 웹사이트에 올리는 폴더(index.html·manifest.json·sw.js·아이콘)
//  · dist/길잡이내비_v버전_웹용.zip  : 위 폴더를 압축한 것
// 서버가 문자 인코딩을 EUC-KR 로 알려 줘도 깨지지 않도록 HTML 은 영문(ASCII) 문자만 쓰게 바꾼다.
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const VER = process.argv[2] || require('./package.json').appVersion || '1.0';
const rd = p => fs.readFileSync(path.join(__dirname, p), 'utf8');

const jsDir = path.join(__dirname, 'src/js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
const app = `(function () {\n'use strict';\nconst APP_VERSION = '${VER}';\n` +
  files.map(f => `// ===== ${f} =====\n` + fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n') + '\n})();';

const guard = s => s.replace(/<\/(script)/gi, '<\\/$1');
let html = rd('src/index.html');
const put = (key, val) => { const i = html.indexOf(key); if (i < 0) throw new Error('자리표시 없음: ' + key); html = html.slice(0, i) + val + html.slice(i + key.length); };
put('/*@MAPLIBRE_CSS@*/', rd('node_modules/maplibre-gl/dist/maplibre-gl.css'));
put('/*@CSS@*/', rd('src/app.css'));
put('/*@MAPLIBRE_JS@*/', guard(rd('node_modules/maplibre-gl/dist/maplibre-gl.js')));
put('/*@APP@*/', guard(app));
html = html.replace('<title>길잡이 내비</title>', `<title>길잡이 내비</title>\n<meta name="generator" content="길잡이 내비 v${VER}">`);

// ASCII 로 바꾸기: 스크립트 안은 \uXXXX, 스타일 안은 \XXXX, 나머지 HTML 은 &#x...;
function asciiHtml(src) {
  const hex4 = c => c.charCodeAt(0).toString(16).padStart(4, '0');
  return src.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)|(<style\b[^>]*>)([\s\S]*?)(<\/style>)|[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\x00-\x7f]/g,
    (m, so, sb, sc, to, tb, tc) => {
      if (so) return so + sb.replace(/[^\x00-\x7f]/g, c => '\\u' + hex4(c)) + sc;
      if (to) return to + tb.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\x00-\x7f]/g, c => '\\' + c.codePointAt(0).toString(16) + ' ') + tc;
      return '&#x' + m.codePointAt(0).toString(16) + ';';
    });
}
html = asciiHtml(html);
if (/[^\x00-\x7f]/.test(html)) throw new Error('ASCII 변환 실패');

const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });
const single = path.join(dist, `길잡이내비_v${VER}.html`);
fs.writeFileSync(single, html);

// 웹사이트용 폴더
const web = path.join(dist, 'web', 'navi');
fs.rmSync(path.join(dist, 'web'), { recursive: true, force: true });
fs.mkdirSync(web, { recursive: true });
fs.writeFileSync(path.join(web, 'index.html'), html);
fs.writeFileSync(path.join(web, 'sw.js'), rd('src/web/sw.js.tpl').replace('__VER__', VER));
const manifest = {
  name: '길잡이 내비', short_name: '길잡이 내비', description: '무료 지도로 길을 찾고 한국어 음성으로 안내하는 개인용 차량 내비게이션',
  lang: 'ko', start_url: './', scope: './', display: 'standalone', orientation: 'any',
  background_color: '#0F151C', theme_color: '#0B5CAD',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};
fs.writeFileSync(path.join(web, 'manifest.json'), JSON.stringify(manifest, null, 2).replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'cameras.json']) fs.copyFileSync(path.join(__dirname, 'src/web', f), path.join(web, f));
fs.writeFileSync(path.join(dist, 'index.html'), html);   // 예전 위치 호환

// GitHub Pages 로 내보낼 폴더(docs/): https://jwlee1209-pixel.github.io/nav/
const docs = path.join(__dirname, 'docs');
fs.rmSync(docs, { recursive: true, force: true });
fs.mkdirSync(docs, { recursive: true });
for (const f of fs.readdirSync(web)) fs.copyFileSync(path.join(web, f), path.join(docs, f));
fs.writeFileSync(path.join(docs, '.nojekyll'), '');

const zip = path.join(dist, `길잡이내비_v${VER}_웹용.zip`);
fs.rmSync(zip, { force: true });
execSync(`cd "${path.join(dist, 'web')}" && zip -q -r -X "${zip}" navi`);
console.log('빌드:', path.basename(single), (html.length / 1024).toFixed(0) + 'KB /', path.basename(zip), (fs.statSync(zip).size / 1024).toFixed(0) + 'KB');
