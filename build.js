// 빌드: src → dist/PPT편집기_v버전.html (HTML 파일 하나, 인터넷 없이 동작)
// node build.js [버전]
const fs = require('fs'), path = require('path');
const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const ver = process.argv[2] || pkg.appVersion;
const src = p => fs.readFileSync(path.join(root, 'src', p), 'utf8');
const jsDir = path.join(root, 'src', 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
const app = `(function(){'use strict';\nconst APP_VERSION=${JSON.stringify(ver)};\n` + files.map(f => `// ── ${f} ──\n` + fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n') + '\n})();';
// 빈 서식·메모 마스터를 넣는다(tools/make_template.py 로 만든 것)
const tplDir = path.join(root, 'src', 'template');
const blank = fs.readFileSync(path.join(tplDir, 'blank.pptx')).toString('base64');
const notesMaster = fs.readFileSync(path.join(tplDir, 'notesMaster.xml'), 'utf8').replace(/^<\?xml[^>]*\?>/, '');
const putTok = (src, tok, val) => { if (!src.includes(tok)) throw new Error('자리 없음 ' + tok); return src.split(tok).join(val); };
let appCode = putTok(app, "'@@BLANK_PPTX@@'", JSON.stringify(blank));
appCode = putTok(appCode, "'@@NOTES_MASTER@@'", JSON.stringify(notesMaster));
// 문법 검사
try { new Function(appCode); } catch (e) { console.error('문법 오류:', e.message); process.exit(1); }
let html = src('index.html');
const put = (mark, text) => { const i = html.indexOf(mark); if (i < 0) throw new Error('자리 없음 ' + mark); html = html.slice(0, i) + text.replace(/<\/script/gi, '<\\/script') + html.slice(i + mark.length); };
put('/*@CSS@*/', src('app.css'));
put('/*@JSZIP@*/', src('vendor/jszip.min.js'));
put('/*@APP@*/', appCode);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const name = `PPT편집기_v${ver}.html`;
fs.writeFileSync(path.join(root, 'dist', name), html);
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
console.log(`빌드: ${name} ${(Buffer.byteLength(html) / 1024).toFixed(0)}KB, 모듈 ${files.length}개`);
