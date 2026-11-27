// 빌드: node build.js [버전] [--pages 폴더]
//  · dist/PPT편집기_v버전.html : 파일 하나로 여는 판(인터넷 없이 동작)
//  · dist/web/ppt/             : 웹 주소에 올리는 판(설치형 앱: manifest·서비스 워커·아이콘, 파일 연결)
//  · --pages 폴더              : dist/web/ppt/ 를 그 폴더로 복사(GitHub Pages: nav 저장소 docs/ppt)
const fs = require('fs'), path = require('path');
const root = __dirname;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const pi = args.indexOf('--pages');
const pagesDir = pi >= 0 ? path.resolve(args[pi + 1]) : null;
const ver = args.find((a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1)) || pkg.appVersion;
const src = p => fs.readFileSync(path.join(root, 'src', p), 'utf8');
const jsDir = path.join(root, 'src', 'js');
const files = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
const app = `(function(){'use strict';\nconst APP_VERSION=${JSON.stringify(ver)};\n` + files.map(f => `// ── ${f} ──\n` + fs.readFileSync(path.join(jsDir, f), 'utf8')).join('\n') + '\n})();';
// 빈 서식·메모 마스터를 넣는다(tools/make_template.py 로 만든 것)
const tplDir = path.join(root, 'src', 'template');
const blank = fs.readFileSync(path.join(tplDir, 'blank.pptx')).toString('base64');
const notesMaster = fs.readFileSync(path.join(tplDir, 'notesMaster.xml'), 'utf8').replace(/^<\?xml[^>]*\?>/, '');
const putTok = (s, tok, val) => { if (!s.includes(tok)) throw new Error('자리 없음 ' + tok); return s.split(tok).join(val); };
let appCode = putTok(app, "'@@BLANK_PPTX@@'", JSON.stringify(blank));
appCode = putTok(appCode, "'@@NOTES_MASTER@@'", JSON.stringify(notesMaster));
// 문법 검사
try { new Function(appCode); } catch (e) { console.error('문법 오류:', e.message); process.exit(1); }
let html = src('index.html');
const put = (mark, text) => { const i = html.indexOf(mark); if (i < 0) throw new Error('자리 없음 ' + mark); html = html.slice(0, i) + text.replace(/<\/script/gi, '<\\/script') + html.slice(i + mark.length); };
put('/*@FAVICON@*/', 'data:image/svg+xml,' + encodeURIComponent(fs.readFileSync(path.join(root, 'src', 'web', 'icon.svg'), 'utf8')));
put('/*@CSS@*/', src('app.css'));
put('/*@JSZIP@*/', src('vendor/jszip.min.js'));
put('/*@APP@*/', appCode);
const WEBHEAD = '<!--@WEBHEAD@-->';
if (!html.includes(WEBHEAD)) throw new Error('자리 없음 ' + WEBHEAD);
// 파일 하나 판: 웹 전용 머리 없음
const single = html.replace(WEBHEAD, '');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const name = `PPT편집기_v${ver}.html`;
fs.writeFileSync(path.join(root, 'dist', name), single);
fs.writeFileSync(path.join(root, 'dist', 'index.html'), single);

// 웹 판: 설치형 앱(PWA) — 파일 탐색기에서 .pptx·.ppt 를 두 번 눌러 열 수 있게(File Handling API)
const web = path.join(root, 'dist', 'web', 'ppt');
fs.rmSync(path.join(root, 'dist', 'web'), { recursive: true, force: true });
fs.mkdirSync(web, { recursive: true });
fs.writeFileSync(path.join(web, 'index.html'), html.replace(WEBHEAD, '<link rel="manifest" href="manifest.json">\n<meta name="theme-color" content="#ffffff">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">'));
const icon = (s, sz, purpose) => ({ src: s, sizes: `${sz}x${sz}`, type: 'image/png', purpose });
const manifest = {
  id: '/nav/ppt/',
  name: 'PPT 편집기', short_name: 'PPT 편집기',
  description: 'PowerPoint 파일(.pptx, .ppt)을 열어 고치고 저장·슬라이드 쇼·PDF',
  lang: 'ko', dir: 'ltr', start_url: './', scope: './', display: 'standalone',
  background_color: '#F3F4F6', theme_color: '#FFFFFF',
  icons: [icon('icon-192.png', 192, 'any'), icon('icon-512.png', 512, 'any'), icon('icon-maskable-512.png', 512, 'maskable')],
  file_handlers: [{
    action: './',
    accept: {
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.ms-powerpoint': ['.ppt', '.pps', '.pot'],
      'application/vnd.openxmlformats-officedocument.presentationml.slideshow': ['.ppsx'],
      'application/vnd.openxmlformats-officedocument.presentationml.template': ['.potx'],
      'application/vnd.ms-powerpoint.presentation.macroEnabled.12': ['.pptm'],
    },
    icons: [icon('icon-192.png', 192, 'any')],
    launch_type: 'multiple-clients',
  }],
};
fs.writeFileSync(path.join(web, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(web, 'sw.js'), src('web/sw.js.tpl').replace('__VER__', ver));
for (const f of ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png']) fs.copyFileSync(path.join(root, 'src', 'web', f), path.join(web, f));
console.log(`빌드: ${name} ${(Buffer.byteLength(single) / 1024).toFixed(0)}KB, 웹 판 dist/web/ppt (${fs.readdirSync(web).length}개 파일), 모듈 ${files.length}개`);

if (pagesDir) {
  fs.rmSync(pagesDir, { recursive: true, force: true });
  fs.mkdirSync(pagesDir, { recursive: true });
  for (const f of fs.readdirSync(web)) fs.copyFileSync(path.join(web, f), path.join(pagesDir, f));
  console.log('Pages 폴더로 복사:', pagesDir);
}
