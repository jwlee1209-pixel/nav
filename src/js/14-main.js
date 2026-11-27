// ───────────────────────── 화면 연결·단축키·시작 ─────────────────────────
const FONTS = ['맑은 고딕', '나눔고딕', '나눔명조', '나눔바른고딕', '굴림', '돋움', '바탕', '궁서', 'Arial', 'Calibri', 'Calibri Light', 'Cambria', 'Segoe UI', 'Tahoma', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Consolas'];

function setIcons() {
  const set = (id, ic, label) => { const e = $('#' + id); if (e) e.innerHTML = icon(ic, label); };
  set('bOpen', 'open', '열기'); set('bSave', 'save', '저장'); set('bSaveAs', 'saveas', '다른 이름으로');
  set('bUndo', 'undo'); set('bRedo', 'redo');
  set('bText', 'text', '텍스트'); set('bImage', 'image', '그림'); set('bShape', 'shape', '도형'); set('bTable', 'table', '표');
  set('bPdf', 'pdf', 'PDF'); set('bShow', 'play', '슬라이드 쇼');
  set('fGrow', 'grow'); set('fShrink', 'shrink');
  set('aL', 'alignL'); set('aC', 'alignC'); set('aR', 'alignR'); set('aJ', 'alignJ'); set('fBul', 'bullet'); set('fNum', 'number');
  set('zFront', 'front'); set('zBack', 'back'); set('bDup', 'dup'); set('bDel', 'del');
  set('zOut', 'zout'); set('zIn', 'zin');
  set('sAdd', 'plus', '새 슬라이드'); set('sDup', 'dup'); set('sDel', 'del');
  $('#ver').textContent = 'v' + APP_VERSION;
  const sel = $('#fFont');
  sel.replaceChildren(h('option', { value: '', text: '글꼴' }), ...FONTS.map(f => h('option', { value: f, text: f, style: `font-family:'${f}'` })));
  const menu = $('#shapeMenu');
  menu.replaceChildren(...INSERT_SHAPES.map(([p, label]) => h('button', { type: 'button', title: label, html: shapeIcon(p), onclick: () => { menu.hidden = true; insertShape(p); } })));
}

// ── 도구 막대 상태 ──
function caretState() {
  const ed = S.editing;
  const sel = getSelection();
  let n = sel && sel.anchorNode;
  if (!n || !ed.inner.contains(n)) n = ed.inner.querySelector('.r') || ed.inner.querySelector('.p') || ed.inner;
  const e = n.nodeType === 1 ? n : n.parentElement;
  const cs = getComputedStyle(e);
  const dec = decoOf(e, ed.inner);
  const blk = e.closest('.p') || e;
  return { ff: firstFamily(cs.fontFamily), sz: parseFloat(cs.fontSize) * 72 / 96 / (ed.inner._scale || 1), b: (+cs.fontWeight || 400) >= 600, i: cs.fontStyle === 'italic', u: dec.u, s: dec.s, c: rgbHex(cs.color), algn: CSS_ALGN[getComputedStyle(blk).textAlign] || 'l' };
}
function selState() {
  const n = nodeOf(S.sel[0]);
  if (!n) return null;
  const r = n.querySelector('.r') || n.querySelector('.txi .p');
  const st = { fill: null, line: null };
  const g = n.querySelector(':scope > .geo path');
  if (g) { const f = g.getAttribute('fill'), s = g.getAttribute('stroke'); if (/^#[0-9a-f]{6}$/i.test(f || '')) st.fill = f.slice(1); if (/^#[0-9a-f]{6}$/i.test(s || '')) st.line = s.slice(1); }
  if (!r) return st;
  const d = r.dataset;
  const p = n.querySelector('.txi .p');
  return { ...st, ff: firstFamily(d.ff), sz: d.sz ? +d.sz / 100 / 1 : null, b: allOn('b'), i: allOn('i'), u: allOn('u'), s: allOn('s'), c: d.c || null, algn: p ? p.dataset.algn : null };
}
function updateToolbar() {
  if (!S.deck) return;
  const ed = S.editing, has = S.sel.length > 0;
  const textual = !!ed || S.sel.some(x => textHostsOf(x).length > 0);
  for (const id of ['fFont', 'fSize', 'fGrow', 'fShrink', 'fB', 'fI', 'fU', 'fS', 'fColor', 'aL', 'aC', 'aR', 'aJ', 'fBul', 'fNum']) $('#' + id).disabled = !textual;
  const shapey = has && !ed && S.sel.some(x => ['sp', 'cxnSp', 'pic'].includes(ln(x)));
  for (const id of ['sFill', 'sNoFill']) $('#' + id).disabled = !shapey || S.sel.every(x => ln(x) !== 'sp');
  for (const id of ['sLine', 'sLineW']) $('#' + id).disabled = !shapey;
  for (const id of ['zFront', 'zBack', 'bDup', 'bDel']) $('#' + id).disabled = !has || !!ed;
  $('#sDel').disabled = !S.deck.slides.length; $('#sDup').disabled = !S.deck.slides.length;
  const st = ed ? caretState() : has ? selState() : null;
  const press = (id, v) => $('#' + id).setAttribute('aria-pressed', v ? 'true' : 'false');
  if (st && st.ff !== undefined) {
    const f = $('#fFont');
    if (st.ff && ![...f.options].some(o => o.value === st.ff)) f.append(h('option', { value: st.ff, text: st.ff }));
    f.value = st.ff || '';
    $('#fSize').value = st.sz ? Math.round(st.sz * 10) / 10 : '';
    press('fB', st.b); press('fI', st.i); press('fU', st.u); press('fS', st.s);
    for (const [id, a] of [['aL', 'l'], ['aC', 'ctr'], ['aR', 'r'], ['aJ', 'just']]) press(id, st.algn === a);
    if (st.c) $('#fColorSw').style.background = '#' + st.c;
  } else {
    $('#fFont').value = ''; $('#fSize').value = '';
    for (const id of ['fB', 'fI', 'fU', 'fS', 'aL', 'aC', 'aR', 'aJ']) press(id, false);
  }
  if (st && st.fill) $('#sFillSw').style.background = '#' + st.fill;
  if (st && st.line) $('#sLineSw').style.borderColor = '#' + st.line;
}

// ── 열기 ──
const PPT_TYPES = [{ description: 'PowerPoint 프레젠테이션', accept: { 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx', '.ppsx', '.potx', '.pptm'], 'application/vnd.ms-powerpoint': ['.ppt', '.pps', '.pot'] } }];
async function openFile() {
  if (!(await confirmDiscard())) return;
  if (window.showOpenFilePicker) {
    let hd;
    try { [hd] = await window.showOpenFilePicker({ types: PPT_TYPES, excludeAcceptAllOption: false, multiple: false }); }
    catch (e) { if (e && e.name === 'AbortError') return; hd = null; }
    if (hd) { const f = await hd.getFile(); await openFileObj(f, hd); return; }
  }
  $('#fileIn').value = '';
  $('#fileIn').click();
}
async function openFileObj(f, handle = null) {
  toast(`‘${f.name}’ 여는 중…`, 20000);
  const ok = await openBuffer(await f.arrayBuffer(), f.name, handle);
  if (ok) toast(`‘${S.file.name}’ — 슬라이드 ${S.deck.slides.length}장`, 2200);
  else $('#toast').hidden = true;
}

async function askTable() {
  const r = h('input', { type: 'number', min: 1, max: 30, value: 3 }), c = h('input', { type: 'number', min: 1, max: 20, value: 3 });
  const body = h('div', {}, h('div', { class: 'row' }, h('label', { text: '행(가로줄)' }), r, h('label', { text: '열(세로줄)' }), c));
  const v = await dialog('표 넣기', body, [['취소', null], ['넣기', () => [clamp(+r.value || 3, 1, 30), clamp(+c.value || 3, 1, 20)], true]]);
  if (v) insertTable(v[0], v[1]);
}

// ── 연결 ──
function wire() {
  const on = (id, ev, fn) => $('#' + id).addEventListener(ev, fn);
  // 글자 편집 중에도 고른 부분이 풀리지 않게: 단추는 누를 때 초점을 가져가지 않는다
  for (const b of $$('#bar1 button, #bar2 button, #side button')) b.addEventListener('mousedown', e => e.preventDefault());
  on('bOpen', 'click', openFile); on('wOpen', 'click', openFile); on('wNew', 'click', newDeck);
  on('fileIn', 'change', e => { const f = e.target.files[0]; if (f) openFileObj(f, null); });
  on('bSave', 'click', () => save(false)); on('bSaveAs', 'click', () => save(true));
  on('bUndo', 'click', undo); on('bRedo', 'click', redo);
  on('bText', 'click', insertTextBox);
  on('bImage', 'click', () => { $('#imgIn').value = ''; $('#imgIn').click(); });
  on('imgIn', 'change', e => { const f = e.target.files[0]; if (f) insertImageFile(f); });
  on('bShape', 'click', e => { e.stopPropagation(); $('#shapeMenu').hidden = !$('#shapeMenu').hidden; });
  document.addEventListener('click', e => { if (!e.target.closest('.dd')) $('#shapeMenu').hidden = true; });
  on('bTable', 'click', askTable);
  on('bPdf', 'click', printPdf);
  on('bShow', 'click', e => startShow(e.shiftKey));
  on('fFont', 'change', e => { if (e.target.value) format('font', e.target.value); });
  on('fSize', 'change', e => { const v = +e.target.value; if (v > 0) format('size', clamp(v, 1, 400)); });
  on('fSize', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  on('fGrow', 'click', () => format('grow')); on('fShrink', 'click', () => format('shrink'));
  on('fB', 'click', () => format('bold')); on('fI', 'click', () => format('italic')); on('fU', 'click', () => format('underline')); on('fS', 'click', () => format('strike'));
  on('fColor', 'change', e => { $('#fColorSw').style.background = e.target.value; format('color', e.target.value.slice(1).toUpperCase()); });
  on('aL', 'click', () => format('align', 'l')); on('aC', 'click', () => format('align', 'ctr')); on('aR', 'click', () => format('align', 'r')); on('aJ', 'click', () => format('align', 'just'));
  on('fBul', 'click', () => (S.editing ? bulletsInEdit('bullet') : format('bullet')));
  on('fNum', 'click', () => (S.editing ? bulletsInEdit('number') : format('number')));
  on('sFill', 'change', e => { $('#sFillSw').style.background = e.target.value; setShapeFill(e.target.value.slice(1).toUpperCase()); });
  on('sNoFill', 'click', () => setShapeFill(null));
  on('sLine', 'change', e => { $('#sLineSw').style.borderColor = e.target.value; setShapeLine(e.target.value.slice(1).toUpperCase(), null); });
  on('sLineW', 'change', e => { const v = e.target.value; e.target.value = ''; if (v !== '') setShapeLine(null, +v); });
  on('zFront', 'click', () => zOrder(true)); on('zBack', 'click', () => zOrder(false));
  on('bDup', 'click', duplicateSel); on('bDel', 'click', deleteSel);
  on('zOut', 'click', () => setZoom(S.zoom / 1.2)); on('zIn', 'click', () => setZoom(S.zoom * 1.2)); on('zFit', 'click', fitZoom);
  on('sAdd', 'click', addSlideDialog); on('sDup', 'click', duplicateSlide); on('sDel', 'click', deleteSlide);
  on('notesText', 'input', onNotesInput);
  on('notesText', 'change', flushNotes);
  on('notesText', 'focus', () => { if (S.editing) endTextEdit(true); });
  // 슬라이드 편집 영역
  const wrap = $('#stageWrap');
  wrap.addEventListener('pointerdown', onPointerDown);
  addEventListener('pointermove', onPointerMove);
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', () => { drag = null; drawSel(); });
  wrap.addEventListener('dblclick', onDblClick);
  wrap.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
  addEventListener('resize', () => { if (S.deck && S.fit) fitZoom(); });
  document.addEventListener('selectionchange', () => {
    const ed = S.editing; if (!ed) return;
    const s = getSelection();
    if (s.rangeCount && ed.inner.contains(s.anchorNode)) { ed.range = s.getRangeAt(0).cloneRange(); clearTimeout(updateToolbar._t); updateToolbar._t = setTimeout(updateToolbar, 60); }
  });
  initThumbs();
  initShow();
  initDrop();
  initMenu();
  on('bHelp', 'click', showHelp);
  document.addEventListener('keydown', onKey);
  document.addEventListener('copy', onCopy);
  document.addEventListener('cut', onCut);
  document.addEventListener('paste', onPaste);
  addEventListener('beforeunload', e => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
}
const inField = t => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.isContentEditable && !(S.editing && S.editing.inner.contains(t))));

function onKey(e) {
  const mod = e.ctrlKey || e.metaKey, k = e.key;
  if (SHOW.on) { if (showKey(e)) e.preventDefault(); return; }
  if (!$('#dialog').hidden) return;
  if (mod && (k === 's' || k === 'S')) { e.preventDefault(); if (S.deck) save(e.shiftKey); return; }
  if (mod && (k === 'o' || k === 'O')) { e.preventDefault(); openFile(); return; }
  if (k === 'F5') { e.preventDefault(); if (S.deck) startShow(e.shiftKey); return; }
  if (!S.deck) return;
  if (S.editing) {
    if (e.isComposing || e.keyCode === 229) return;   // 한글 조합 중에는 건드리지 않는다
    if (k === 'Escape') { e.preventDefault(); const x = S.editing.node._x; endTextEdit(true); select(S.sel.length ? S.sel : [x].filter(nodeOf)); return; }
    if (k === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '\t'); return; }
    return;
  }
  if (inField(e.target)) return;
  if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
  if (mod && (k === 'd' || k === 'D')) { e.preventDefault(); duplicateSel(); return; }
  if (mod && (k === 'a' || k === 'A')) { e.preventDefault(); select([...$$('#slideHost .slide > .obj')].map(n => n._x)); return; }
  if (mod && (k === 'm' || k === 'M')) { e.preventDefault(); const info = S.deck.slides[S.cur] ? S.deck.info(S.deck.slides[S.cur]) : null; const m = info ? info.masterPath : allMasters()[0]; const l = m && defaultLayout(m, info && info.layoutPath); if (l) addSlideWith(l); return; }
  if (mod && (k === 'b' || k === 'B')) { e.preventDefault(); format('bold'); return; }
  if (mod && (k === 'i' || k === 'I')) { e.preventDefault(); format('italic'); return; }
  if (mod && (k === 'u' || k === 'U')) { e.preventDefault(); format('underline'); return; }
  if (mod && (k === ']' || k === '>')) { e.preventDefault(); format('grow'); return; }
  if (mod && (k === '[' || k === '<')) { e.preventDefault(); format('shrink'); return; }
  if (k === 'Delete' || k === 'Backspace') { if (S.sel.length) { e.preventDefault(); deleteSel(); } return; }
  if (k === 'Escape') { if (S.sel.length) select([]); return; }
  if ((k === 'Enter' || k === 'F2') && S.sel.length === 1) {
    const n = nodeOf(S.sel[0]);
    if (n && n._tx) { e.preventDefault(); startTextEdit(n._tx, n, S.sel[0], null, { selectAll: k === 'Enter' }); }
    return;
  }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[k] && S.sel.length) { e.preventDefault(); const st = e.shiftKey ? 10 : mod ? 0.25 : 1; nudge(arrows[k][0] * st, arrows[k][1] * st); return; }
  if ((arrows[k] && !S.sel.length && e.target.closest && !e.target.closest('#notes')) || k === 'PageUp' || k === 'PageDown') {
    e.preventDefault();
    goSlide(S.cur + (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(k) ? -1 : 1));
    return;
  }
  if (k === 'Home' && !S.sel.length) { e.preventDefault(); goSlide(0); return; }
  if (k === 'End' && !S.sel.length) { e.preventDefault(); goSlide(S.deck.slides.length - 1); return; }
}
// 복사·잘라내기·붙여넣기: 도형은 편집기 안 보관함, 그림·글은 시스템 클립보드에서
function onCopy(e) {
  if (!S.deck || S.editing || inField(e.target) || !S.sel.length) return;
  if (!copySel()) return;
  e.preventDefault();
  const text = S.sel.map(x => { const n = nodeOf(x); return n ? n.innerText.trim() : ''; }).filter(Boolean).join('\n');
  e.clipboardData.setData('text/plain', text || ' ');
  e.clipboardData.setData('application/x-pptedit', String(S.clip.stamp = Date.now()));
}
function onCut(e) { if (!S.deck || S.editing || inField(e.target) || !S.sel.length) return; onCopy(e); deleteSel(); }
function onPaste(e) {
  // 글자 편집 중: 서식 없는 글만 붙인다(다른 프로그램의 글꼴·색이 섞이지 않게)
  if (S.editing && e.clipboardData) {
    e.preventDefault();
    const t = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    if (t) document.execCommand('insertText', false, t);
    return;
  }
  if (!S.deck || S.editing || inField(e.target)) return;
  const dt = e.clipboardData;
  if (!dt) return;
  const mine = dt.getData('application/x-pptedit');
  if (mine && S.clip) { e.preventDefault(); pasteClip(); return; }
  const img = [...dt.files].find(f => /^image\//.test(f.type));
  if (img) { e.preventDefault(); insertImageFile(img); return; }
  const text = dt.getData('text/plain');
  if (text && text.trim()) { e.preventDefault(); pasteText(text); return; }
  if (S.clip) { e.preventDefault(); pasteClip(); }
}
function pasteText(text) {
  act('글 붙여넣기', () => {
    touch(curPart());
    const doc = curDoc(), tree = curTree(), id = nextId(tree);
    const W = toEmu(S.deck.W), Hh = toEmu(S.deck.H);
    const sp = el(doc, 'p:sp');
    sp.append(nvSp(doc, id, `TextBox ${id - 1}`, { txBox: true }));
    const pr = el(doc, 'p:spPr');
    pr.append(xfrmEl2(doc, { x: W * 0.2, y: Hh * 0.35, w: W * 0.6, h: 457200 }));
    const g = el(doc, 'a:prstGeom', { prst: 'rect' }); g.append(el(doc, 'a:avLst')); pr.append(g, el(doc, 'a:noFill'));
    sp.append(pr);
    const tb = newTxBody(doc, { sz: 1800 });
    const p0 = kid(tb, 'p'); p0.remove();
    for (const line of text.replace(/\r\n?/g, '\n').split('\n').slice(0, 200)) {
      const p = el(doc, 'a:p');
      if (line) { const r = el(doc, 'a:r'); r.append(el(doc, 'a:rPr', { lang: 'ko-KR', altLang: 'en-US', sz: '1800', dirty: '0' })); const t = el(doc, 'a:t'); t.textContent = line; r.append(t); p.append(r); }
      else p.append(el(doc, 'a:endParaRPr', { lang: 'ko-KR', altLang: 'en-US', sz: '1800' }));
      tb.append(p);
    }
    sp.append(tb);
    tree.append(sp);
    S.sel = [sp];
  });
}
// 끌어다 놓기: 발표 자료는 열고, 그림은 슬라이드에 넣는다
function initDrop() {
  const z = $('#dropZone');
  let n = 0;
  addEventListener('dragenter', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) { n++; z.hidden = false; e.preventDefault(); } });
  addEventListener('dragleave', () => { n = Math.max(0, n - 1); if (!n) z.hidden = true; });
  addEventListener('dragover', e => { if ([...(e.dataTransfer.types || [])].includes('Files')) e.preventDefault(); });
  addEventListener('drop', async e => {
    n = 0; z.hidden = true;
    const dt = e.dataTransfer;
    if (!dt || !dt.files.length) return;
    e.preventDefault();
    const f = dt.files[0];
    if (/\.(pptx|ppt|pps|ppsx|pot|potx|pptm)$/i.test(f.name)) {
      let handle = null;
      try { const it = dt.items && dt.items[0]; if (it && it.getAsFileSystemHandle) { handle = await it.getAsFileSystemHandle(); if (handle && handle.kind !== 'file') handle = null; } } catch (er) { handle = null; }
      if (!(await confirmDiscard())) return;
      openFileObj(f, handle);
    } else if (/^image\//.test(f.type) && S.deck) insertImageFile(f);
    else toast('PowerPoint 파일(.pptx, .ppt)이나 그림을 놓아 주세요.');
  });
}

// ── 오른쪽 단추 메뉴 ──
function initMenu() {
  const m = $('#ctxMenu');
  const close = () => { m.hidden = true; };
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#ctxMenu')) close(); });
  addEventListener('blur', close);
  addEventListener('resize', close);
  const show = (e, items) => {
    e.preventDefault();
    m.replaceChildren(...items.map(it => it === '-' ? h('div', { class: 'sep' }) : h('button', { type: 'button', disabled: it[2] === false ? true : null, onclick: () => { close(); it[1](); } }, h('span', { text: it[0] }), it[3] ? h('kbd', { text: it[3] }) : null)));
    m.hidden = false;
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(e.clientX, innerWidth - r.width - 4) + 'px';
    m.style.top = Math.min(e.clientY, innerHeight - r.height - 4) + 'px';
  };
  $('#thumbs').addEventListener('contextmenu', e => {
    const t = e.target.closest('.thumb');
    if (t) goSlide(+t.dataset.i);
    const hidden = S.deck && S.deck.slides[S.cur] && attr(S.deck.pkg.doc(S.deck.slides[S.cur]).documentElement, 'show') === '0';
    show(e, [['새 슬라이드', addSlideDialog, true, 'Ctrl+M'], ['슬라이드 복제', duplicateSlide, !!t], ['슬라이드 삭제', deleteSlide, !!t], '-', [hidden ? '숨기기 취소' : '슬라이드 숨기기', toggleHidden, !!t], '-', ['여기부터 슬라이드 쇼', () => startShow(true), !!t, 'Shift+F5']]);
  });
  $('#stageWrap').addEventListener('contextmenu', e => {
    if (!S.deck || S.editing) return;
    const n = e.target.closest('.slide.edit .obj');
    if (n && !S.sel.includes(n._x)) select([n._x]);
    if (!n && S.sel.length) select([]);
    const has = S.sel.length > 0;
    show(e, [['잘라내기', () => { copySel(); deleteSel(); }, has, 'Ctrl+X'], ['복사', () => copySel(), has, 'Ctrl+C'], ['붙여넣기', pasteClip, !!S.clip, 'Ctrl+V'], ['복제', duplicateSel, has, 'Ctrl+D'], ['삭제', deleteSel, has, 'Delete'], '-',
      ['맨 앞으로 가져오기', () => zOrder(true), has], ['맨 뒤로 보내기', () => zOrder(false), has], '-',
      ['글자 고치기', () => { const x = S.sel[0], nd = nodeOf(x); if (nd && nd._tx) startTextEdit(nd._tx, nd, x, null, { selectAll: true }); }, S.sel.length === 1 && !!(nodeOf(S.sel[0]) || {})._tx, 'Enter']]);
  });
}
function showHelp() {
  const rows = [['열기 · 저장 · 다른 이름', 'Ctrl+O · Ctrl+S · Ctrl+Shift+S'], ['실행 취소 · 다시 실행', 'Ctrl+Z · Ctrl+Y'], ['글자 고치기 시작 · 마치기', '두 번 누르기(또는 Enter) · Esc'],
    ['굵게 · 기울임 · 밑줄', 'Ctrl+B · Ctrl+I · Ctrl+U'], ['글자 크게 · 작게', 'Ctrl+] · Ctrl+['], ['복사 · 잘라내기 · 붙여넣기 · 복제', 'Ctrl+C · Ctrl+X · Ctrl+V · Ctrl+D'],
    ['조금씩 옮기기(10배 · 세밀)', '화살표 (Shift · Ctrl)'], ['맞춤선 없이 끌기', 'Alt 누른 채 끌기'], ['비율 유지 크기 · 15° 회전', 'Shift 누른 채 끌기'], ['모두 선택 · 지우기', 'Ctrl+A · Delete'],
    ['새 슬라이드', 'Ctrl+M'], ['이전 · 다음 슬라이드', 'PageUp · PageDown'], ['슬라이드 쇼(처음 · 지금부터)', 'F5 · Shift+F5'], ['쇼: 넘기기 · 끝내기 · 번호로 가기', '→ 또는 누르기 · Esc · 숫자+Enter'], ['확대 · 축소', 'Ctrl+마우스 휠']];
  const tbl = h('table', { class: 'keys' }, rows.map(([a, b]) => h('tr', {}, h('td', { text: a }), h('td', {}, h('kbd', { text: b })))));
  const note = h('p', { class: 'small', text: '파일은 이 컴퓨터 안에서만 처리됩니다. 차트·SmartArt 는 보기와 위치·크기 바꾸기만 됩니다. 옛 .ppt 는 .pptx 로 바꿔 저장합니다. PDF 는 인쇄 창에서 ‘PDF로 저장’을 고르면 됩니다.' });
  dialog('PPT 편집기 v' + APP_VERSION + ' — 단축키', h('div', {}, tbl, note), [['닫기', null, true]]);
}

// 시험용 손잡이
window.__ppt = { S, H, openBuffer, buildPptx, save, newDeck, goSlide, select, act, format, formatSelection, insertShape, insertTable, insertTextBox, insertImageFile, deleteSlide, duplicateSlide, addSlideWith, layoutsOf, allMasters, defaultLayout, startTextEdit, endTextEdit, renderNotes, flushNotes, writeNotes, notesText, undo, redo, nodeOf, startShow, endShow, printPdf, preparePrint, moveSlide, zOrder, setShapeFill, setShapeLine, copySel, pasteClip, duplicateSel, deleteSel, nudge, pasteText, importPpt, reachableParts, toggleHidden, getBox, renderSlide };

setIcons();
wire();
