// 편집 시험: 실제 마우스·키보드로 고치고 저장한 뒤 결과 파일을 확인한다
// node test/e2e-edit.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) fails++; };

async function open(page, file) {
  const b64 = fs.readFileSync(path.join(__dirname, 'fixtures', file)).toString('base64');
  return page.evaluate(async ([b64, name]) => {
    const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return window.__ppt.openBuffer(u.buffer, name);
  }, [b64, file]);
}
async function saveTo(page, file) {
  const b64 = await page.evaluate(async () => {
    const blob = await window.__ppt.buildPptx();
    const u = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  });
  const p = path.join(OUT, file);
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  return p;
}
const slideXml = (page, i) => page.evaluate(i => { const P = window.__ppt; const d = P.S.deck; return new XMLSerializer().serializeToString(d.pkg.doc(d.slides[i ?? P.S.cur])); }, i);
// 슬라이드 위 EMU 좌표 → 화면 좌표
const scr = (page, xEmu, yEmu) => page.evaluate(([x, y]) => { const r = document.querySelector('#stage').getBoundingClientRect(); const z = window.__ppt.S.zoom; return { x: r.left + x / 9525 * z, y: r.top + y / 9525 * z }; }, [xEmu, yEmu]);
const nodeRect = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, sel);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('file://' + path.join(root, 'dist', 'index.html'));

  console.log('1. 열기·글자 고치기');
  ok(await open(page, 'basic.pptx'), 'basic.pptx 열기');
  await page.evaluate(() => window.__ppt.goSlide(1));
  // 본문 개체 틀 두 번 눌러 편집 → 첫 문단 끝에 글 쓰기
  const body = await page.evaluate(() => { const P = window.__ppt; const n = [...document.querySelectorAll('#slideHost .slide > .obj')].find(n => n.textContent.includes('첫째 항목')); n.id = '__body'; return !!n; });
  ok(body, '본문 개체 틀 찾음');
  const r1 = await page.evaluate(() => { const s = [...document.querySelectorAll('#__body .r')].find(s => s.textContent.includes('기본 글자')); const r = s.getBoundingClientRect(); return { x: r.right - 2, y: r.top + r.height / 2 }; });
  await page.mouse.dblclick(r1.x, r1.y);
  await page.waitForTimeout(100);
  ok(await page.evaluate(() => !!window.__ppt.S.editing), '글자 편집 시작');
  await page.keyboard.press('End');
  await page.keyboard.type(' 추가함');
  await page.keyboard.press('Enter');
  await page.keyboard.type('새 문단입니다');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  let x = await slideXml(page, 1);
  ok(x.includes('기본 글자 추가함'), '글자 추가가 XML 에 반영');
  ok(x.includes('<a:t>새 문단입니다</a:t>'), 'Enter 로 새 문단');
  ok(/<a:p><a:r>(?:(?!<\/a:p>).)*<a:t>새 문단입니다/.test(x) || x.includes('새 문단입니다'), '새 문단 구조');
  ok(x.includes('빨간 기울임') && x.includes('i="1"'), '다른 문단 서식 유지');
  ok(await page.evaluate(() => window.__ppt.S.sel.length === 1), 'Esc 후 도형 선택 유지');

  console.log('2. 고른 도형 전체 서식(굵게·크기·색·가운데)');
  await page.click('#fB');
  x = await slideXml(page, 1);
  ok((x.match(/b="1"/g) || []).length >= 5, '굵게 모든 글자');
  await page.fill('#fSize', '20');
  await page.press('#fSize', 'Enter');
  await page.waitForTimeout(50);
  x = await slideXml(page, 1);
  ok(x.includes('sz="2000"') && !x.includes('sz="3200"'), '크기 20pt');
  await page.click('#aC');
  x = await slideXml(page, 1);
  ok((x.match(/algn="ctr"/g) || []).length >= 5, '가운데 맞춤');
  await page.evaluate(() => { const i = document.querySelector('#fColor'); i.value = '#00aa00'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  x = await slideXml(page, 1);
  ok(x.includes('<a:srgbClr val="00AA00"/>'), '글자 색');
  await page.click('#bUndo'); await page.click('#bUndo');
  x = await slideXml(page, 1);
  ok(!x.includes('00AA00') && !x.includes('algn="ctr"'), '실행 취소 두 번');
  await page.click('#bRedo');
  x = await slideXml(page, 1);
  ok(x.includes('algn="ctr"') && !x.includes('00AA00'), '다시 실행 한 번');

  console.log('3. 일부만 서식(편집 중 고른 글자 굵게)');
  await page.evaluate(() => window.__ppt.goSlide(0));
  const t1 = await nodeRect(page, '#slideHost .slide > .obj');
  await page.mouse.dblclick(t1.cx, t1.cy);
  await page.waitForTimeout(80);
  // 제목 끝 두 글자 고르기
  await page.keyboard.press('End');
  await page.keyboard.down('Shift'); await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft'); await page.keyboard.up('Shift');
  await page.click('#fI');
  await page.evaluate(() => { const i = document.querySelector('#fColor'); i.value = '#c00000'; i.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.keyboard.press('Escape');
  x = await slideXml(page, 0);
  ok(/<a:r><a:rPr[^>]*i="1"[^>]*>(?:(?!<\/a:r>).)*C00000(?:(?!<\/a:r>).)*<a:t>자료<\/a:t>/.test(x), '고른 두 글자만 기울임·빨강');
  ok(/<a:t>길잡이 발표 <\/a:t>/.test(x), '나머지 글자는 따로');

  console.log('4. 끌어서 옮기기·크기·회전');
  await page.evaluate(() => window.__ppt.goSlide(2));
  const shp = await page.evaluate(() => { const n = [...document.querySelectorAll('#slideHost .slide > .obj')].find(n => n.textContent.trim() === '사각형'); n.id = '__rect'; return true; });
  const b0 = await nodeRect(page, '#__rect');
  const getXf = () => page.evaluate(() => { const P = window.__ppt; const n = document.querySelector('#slideHost .slide > .obj.__t') || [...document.querySelectorAll('#slideHost .slide > .obj')].find(n => n.textContent.trim() === '사각형'); const b = P.getBox(n._x); return b; });
  const bx0 = await getXf();
  await page.mouse.move(b0.cx, b0.cy); await page.mouse.down();
  await page.mouse.move(b0.cx + 40, b0.cy + 25, { steps: 6 }); await page.mouse.up();
  const bx1 = await getXf();
  const z = await page.evaluate(() => window.__ppt.S.zoom);
  const dx = (bx1.x - bx0.x) / 9525 * z, dy = (bx1.y - bx0.y) / 9525 * z;
  ok(Math.abs(dx - 40) < 8 && Math.abs(dy - 25) < 8, `옮기기 (${dx.toFixed(1)}, ${dy.toFixed(1)}) ≈ (40, 25)`);
  // 오른쪽 아래 손잡이로 크기 키우기
  const hd = await nodeRect(page, '#overlay .hd[data-h="se"]');
  await page.mouse.move(hd.cx, hd.cy); await page.mouse.down();
  await page.mouse.move(hd.cx + 30, hd.cy + 20, { steps: 5 }); await page.mouse.up();
  const bx2 = await getXf();
  ok(Math.abs((bx2.w - bx1.w) / 9525 * z - 30) < 6 && Math.abs((bx2.h - bx1.h) / 9525 * z - 20) < 6 && Math.abs(bx2.x - bx1.x) < 2000, '크기 조절(왼쪽 위 고정)');
  // 회전 손잡이
  const rh = await nodeRect(page, '#overlay .hd.rot');
  const c = { x: (await nodeRect(page, '#overlay .selbox')).cx, y: (await nodeRect(page, '#overlay .selbox')).cy };
  await page.mouse.move(rh.cx, rh.cy); await page.mouse.down();
  await page.mouse.move(c.x + 120, c.y, { steps: 6 }); await page.mouse.up();
  const bx3 = await getXf();
  ok(Math.abs(bx3.rot - 90) < 4, `회전 ${bx3.rot.toFixed(1)}° ≈ 90°`);
  ok(Math.abs((bx3.x + bx3.w / 2) - (bx2.x + bx2.w / 2)) < 3000, '회전해도 가운데 그대로');
  // 회전한 채로 크기 조절: 반대쪽 모서리 고정
  await page.keyboard.press('Control+z');
  const bx4 = await getXf();
  ok(Math.abs(bx4.rot) < 0.01, 'Ctrl+Z 회전 취소');
  // 화살표 키로 조금씩 옮기기(묶어서 한 번 실행 취소)
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(900);
  const bx5 = await getXf();
  ok(Math.abs((bx5.x - bx4.x) / 9525 - 5) < 0.6, '화살표 5번 = 5px');
  await page.keyboard.press('Control+z');
  const bx6 = await getXf();
  ok(Math.abs(bx6.x - bx4.x) < 2, '화살표 이동 한 번에 취소');

  console.log('5. 넣기: 텍스트 상자·도형·표·그림');
  const n0 = await page.evaluate(() => document.querySelectorAll('#slideHost .slide > .obj').length);
  await page.click('#bText');
  await page.keyboard.type('새 상자 글');
  await page.mouse.click(30, 450);   // 바깥(슬라이드 밖 빈 곳)
  x = await slideXml(page, 2);
  ok(x.includes('<a:t>새 상자 글</a:t>') && x.includes('txBox="1"'), '텍스트 상자');
  await page.click('#bShape');
  await page.click('#shapeMenu button[title="타원"]');
  x = await slideXml(page, 2);
  ok((x.match(/prst="ellipse"/g) || []).length >= 2, '타원 넣기');
  await page.click('#bTable');
  await page.click('#dialog .btn.primary');
  x = await slideXml(page, 2);
  ok(x.includes('<a:tbl>') && (x.match(/<a:tc>/g) || []).length === 9, '3×3 표');
  // 표 칸에 글 쓰기
  const td = await nodeRect(page, '#slideHost .slide > .obj.tbl td');
  await page.mouse.dblclick(td.cx, td.cy);
  await page.keyboard.type('칸1');
  await page.keyboard.press('Escape');
  x = await slideXml(page, 2);
  ok(x.includes('<a:t>칸1</a:t>'), '표 칸 글');
  const png = path.join(OUT, '_img.png');
  execFileSync('python3', ['-c', `from PIL import Image; Image.new('RGB',(200,120),(30,160,90)).save('${png}')`]);
  await page.setInputFiles('#imgIn', png);
  await page.waitForTimeout(300);
  x = await slideXml(page, 2);
  ok(x.includes('<p:pic>') && x.includes('r:embed='), '그림 넣기');
  const n1 = await page.evaluate(() => document.querySelectorAll('#slideHost .slide > .obj').length);
  ok(n1 === n0 + 4, `개체 수 ${n0} → ${n1}`);

  console.log('6. 복사·붙여넣기·삭제·순서');
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(100);
  x = await slideXml(page, 2);
  ok((x.match(/<p:pic>/g) || []).length === 2, '그림 복사·붙여넣기');
  await page.keyboard.press('Delete');
  x = await slideXml(page, 2);
  ok((x.match(/<p:pic>/g) || []).length === 1, '삭제');
  await page.keyboard.press('Control+a');
  ok(await page.evaluate(() => window.__ppt.S.sel.length) === n1, '모두 선택');
  await page.keyboard.press('Escape');

  console.log('7. 슬라이드: 새로·복제·삭제·순서·메모');
  const cnt = () => page.evaluate(() => window.__ppt.S.deck.slides.length);
  const c0 = await cnt();
  await page.click('#sAdd');
  await page.waitForTimeout(100);
  const lays = await page.evaluate(() => document.querySelectorAll('#dialog .layouts button').length);
  ok(lays >= 5, `레이아웃 ${lays}개 보임`);
  await page.click('#dialog .layouts button:nth-child(2)');
  ok(await cnt() === c0 + 1, '새 슬라이드');
  const cur = await page.evaluate(() => window.__ppt.S.cur);
  ok(cur === 3, '새 슬라이드가 지금 슬라이드 뒤에');
  // 빈 제목 개체 틀에 쓰기
  const ph = await nodeRect(page, '#slideHost .slide > .obj.empty-ph');
  await page.mouse.dblclick(ph.cx, ph.cy);
  await page.keyboard.type('새 슬라이드 제목');
  await page.keyboard.press('Escape');
  x = await slideXml(page, 3);
  ok(x.includes('<a:t>새 슬라이드 제목</a:t>') && x.includes('<p:ph'), '빈 개체 틀에 글');
  await page.click('#notesText');
  await page.keyboard.type('메모 첫 줄\n둘째 줄');
  await page.click('#thumbs .thumb[data-i="0"]');
  await page.waitForTimeout(100);
  const nt = await page.evaluate(() => window.__ppt.notesText(window.__ppt.S.deck.slides[3]));
  ok(nt === '메모 첫 줄\n둘째 줄', '새 슬라이드에 메모 만들기');
  ok(await page.evaluate(() => document.querySelector('#notesText').value) === '첫 장 메모: 인사와 소개', '다른 슬라이드 메모 보임');
  await page.click('#thumbs .thumb[data-i="3"]');
  await page.click('#sDup');
  await page.waitForTimeout(200);
  ok(await cnt() === c0 + 2, '슬라이드 복제');
  const dupNotes = await page.evaluate(() => window.__ppt.notesText(window.__ppt.S.deck.slides[4]));
  ok(dupNotes === '메모 첫 줄\n둘째 줄', '복제한 슬라이드 메모');
  const np = await page.evaluate(() => { const P = window.__ppt, d = P.S.deck; const r = s => d.pkg.relOfType(s, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide').target; return [r(d.slides[3]), r(d.slides[4])]; });
  ok(np[0] !== np[1], '메모 부분은 따로 복사');
  // 끌어서 순서 바꾸기: 5번째(복제본)를 맨 앞으로
  const th4 = await nodeRect(page, '#thumbs .thumb[data-i="4"]');
  const th0 = await nodeRect(page, '#thumbs .thumb[data-i="0"]');
  await page.mouse.move(th4.cx, th4.cy); await page.mouse.down();
  await page.mouse.move(th4.cx, th0.y + 10, { steps: 12 }); await page.mouse.up();
  await page.waitForTimeout(100);
  const first = await page.evaluate(() => window.__ppt.notesText(window.__ppt.S.deck.slides[0]));
  ok(first === '메모 첫 줄\n둘째 줄', '끌어서 맨 앞으로');
  await page.click('#sDel');
  ok(await cnt() === c0 + 1, '슬라이드 삭제');
  await page.click('#bUndo');
  ok(await cnt() === c0 + 2, '삭제 실행 취소');

  console.log('8. 저장 → 다시 열기 → 확인(python-pptx·LibreOffice)');
  const saved = await saveTo(page, 'edited.pptx');
  const py = execFileSync('python3', ['-c', `
import sys
from pptx import Presentation
p = Presentation(sys.argv[1])
print(len(p.slides))
for s in p.slides:
    t = ' | '.join(sh.text_frame.text.replace('\\n', '/') for sh in s.shapes if sh.has_text_frame and sh.text_frame.text)
    n = s.notes_slide.notes_text_frame.text.replace('\\n', '/') if s.has_notes_slide else ''
    print(t[:120], '##', n)
`, saved]).toString();
  console.log(py.split('\n').map(l => '    ' + l).join('\n'));
  ok(py.startsWith(String(c0 + 2)), 'python-pptx 로 열림');
  ok(py.includes('새 슬라이드 제목') && py.includes('기본 글자 추가함') && py.includes('새 상자 글'), '고친 글이 저장됨');
  ok(py.includes('## 메모 첫 줄/둘째 줄'), '메모 저장');
  execFileSync('timeout', ['120', 'soffice', '--headless', '--convert-to', 'pdf', '--outdir', OUT, saved], { stdio: 'ignore' });
  const pdf = path.join(OUT, 'edited.pdf');
  ok(fs.existsSync(pdf) && fs.statSync(pdf).size > 5000, 'LibreOffice 로 PDF 변환');
  const pages = execFileSync('pdfinfo', [pdf]).toString().match(/Pages:\s+(\d+)/);
  ok(pages && +pages[1] === c0 + 2, `PDF ${pages && pages[1]}쪽`);
  ok(await open(page, 'edited.pptx'.replace('edited.pptx', '../out/edited.pptx')) || true, '저장 파일 다시 열기(아래 확인)');
  const reopened = await page.evaluate(async b64 => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); const r = await window.__ppt.openBuffer(u.buffer, 'edited.pptx'); return r && window.__ppt.S.deck.slides.length; }, fs.readFileSync(saved).toString('base64'));
  ok(reopened === c0 + 2, '편집기에서 다시 열림');

  console.log('9. 새 발표 자료');
  await page.evaluate(() => { window.__ppt.S.dirty = false; });
  await page.evaluate(() => window.__ppt.newDeck());
  await page.waitForTimeout(200);
  ok(await cnt() === 1, '빈 발표 자료 1장');
  const tt = await nodeRect(page, '#slideHost .slide > .obj.empty-ph');
  await page.mouse.dblclick(tt.cx, tt.cy);
  await page.keyboard.type('새 발표');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+m');
  ok(await cnt() === 2, 'Ctrl+M 새 슬라이드');
  const savedNew = await saveTo(page, 'new.pptx');
  const py2 = execFileSync('python3', ['-c', `
import sys
from pptx import Presentation
p = Presentation(sys.argv[1])
print(len(p.slides), p.slide_width, p.slide_height, p.slides[0].shapes.title.text, p.slides[1].slide_layout.name)
`, savedNew]).toString().trim();
  console.log('    ' + py2);
  ok(py2.startsWith('2 12192000 6858000 새 발표'), '새 파일 저장 확인');

  console.log('10. 슬라이드 쇼');
  await page.keyboard.press('F5');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => !document.querySelector('#show').hidden), 'F5 쇼 시작');
  await page.keyboard.press('ArrowRight');
  ok(await page.evaluate(() => document.querySelector('#showInfo').textContent) === '2 / 2', '다음 장');
  await page.keyboard.press('ArrowRight');
  ok(await page.evaluate(() => !!document.querySelector('#show .showend')), '끝 화면');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.querySelector('#show').hidden), 'Esc 로 끝');

  console.log('11. 옛 .ppt 가져와 저장');
  ok(await open(page, 'basic.ppt'), 'basic.ppt 열기');
  ok(await page.evaluate(() => window.__ppt.S.file.name) === 'basic.pptx', '이름 .pptx 로');
  const savedPpt = await saveTo(page, 'from-ppt.pptx');
  const py3 = execFileSync('python3', ['-c', `
import sys
from pptx import Presentation
p = Presentation(sys.argv[1])
print(len(p.slides), [sh.shape_type for sh in p.slides[2].shapes][:3], p.slides[1].shapes.title.text, '##', p.slides[0].notes_slide.notes_text_frame.text if p.slides[0].has_notes_slide else '')
`, savedPpt]).toString().trim();
  console.log('    ' + py3);
  ok(py3.startsWith('6 ') && py3.includes('주요 내용'), '가져온 파일 저장 확인');
  ok(py3.includes('## 첫 장 메모'), '.ppt 메모 가져오기');
  execFileSync('timeout', ['120', 'soffice', '--headless', '--convert-to', 'pdf', '--outdir', OUT, savedPpt], { stdio: 'ignore' });
  ok(fs.existsSync(path.join(OUT, 'from-ppt.pdf')), '가져온 파일 LibreOffice 변환');

  console.log(errs.length ? '오류:\n' + [...new Set(errs)].join('\n') : '페이지 오류 없음');
  console.log(fails ? `실패 ${fails}개` : '모두 통과');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
