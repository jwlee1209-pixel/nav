// 단일 HTML 파일로 묶기: node build.js [버전]
const fs = require('fs'), path = require('path');
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

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
const out = path.join(__dirname, 'dist', `길잡이내비_v${VER}.html`);
fs.writeFileSync(out, html);
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);   // 웹에 올릴 때 쓰는 이름
console.log('빌드:', out, (html.length / 1024).toFixed(0) + 'KB');
