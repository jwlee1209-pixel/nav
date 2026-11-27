// ───────────────────────── 앱 상태·실행 취소·화면 갱신 ─────────────────────────
const S = {
  deck: null, cur: 0, sel: [], zoom: 1, fit: true,
  editing: null,        // 글자 편집 중: {inner, node, owner, part}
  file: null,           // {name, handle}
  dirty: false, clip: null,
};

// ── 실행 취소: 바뀌는 XML 부분의 앞·뒤 글을 묶음으로 기억 ──
const H = { undo: [], redo: [], cur: null };
function touch(part) {
  const t = H.cur;
  if (!t || t.before.has(part)) return;
  const d = S.deck.pkg.doc(part);
  t.before.set(part, d ? xmlString(d) : null);
}
function act(label, fn, opt = {}) {
  if (H.cur) { fn(); return; }                     // 이미 묶음 안
  H.cur = { label, before: new Map(), cur: S.cur, selIds: selIds() };
  let res;
  try { res = fn(); }
  catch (e) { console.error(e); rollback(H.cur); H.cur = null; toast('작업을 끝내지 못했습니다: ' + e.message, 4000); return; }
  const t = H.cur; H.cur = null;
  if (!t.before.size) return res;
  t.after = new Map([...t.before.keys()].map(p => { const d = S.deck.pkg.doc(p); return [p, d ? xmlString(d) : null]; }));
  t.curAfter = S.cur;
  H.undo.push(t); if (H.undo.length > 150) H.undo.shift();
  H.redo = [];
  setDirty(true);
  refresh(opt.all ? 'all' : 'cur');
  return res;
}
function rollback(t) { applyParts(t.before); }
function applyParts(map) {
  const pkg = S.deck.pkg;
  for (const [p, s] of map) { if (s == null) pkg.remove(p); else pkg.setDoc(p, parseXML(s)); }
}
function undo() {
  if (S.editing) return;
  const t = H.undo.pop(); if (!t) return;
  applyParts(t.before); H.redo.push(t);
  const cur = Math.min(t.cur, S.deck.slides.length - 1);
  if (cur !== S.cur) S.sel = [];   // 같은 슬라이드면 선택을 id 로 다시 잇는다(renderCurrent)
  S.cur = cur;
  setDirty(true); refresh('all');
  toast('실행 취소: ' + t.label, 1400);
}
function redo() {
  if (S.editing) return;
  const t = H.redo.pop(); if (!t) return;
  applyParts(t.after); H.undo.push(t);
  const cur = Math.min(t.curAfter, S.deck.slides.length - 1);
  if (cur !== S.cur) S.sel = [];
  S.cur = cur;
  setDirty(true); refresh('all');
  toast('다시 실행: ' + t.label, 1400);
}
// 선택을 다시 그린 뒤에도 찾을 수 있게 cNvPr id 로 기억
function selIds() { return S.sel.map(x => idOf(x)).filter(Boolean); }
const nvOf = e => kids(e).find(k => /^nv/.test(ln(k)));
const idOf = e => { const nv = nvOf(e); const c = nv && kid(nv, 'cNvPr'); return c ? c.getAttribute('id') : null; };

function setDirty(v) { S.dirty = v; updateStatus(); }

// ── 열기 ──
async function openBuffer(buf, name, handle = null) {
  const bytes = new Uint8Array(buf);
  let deck;
  try {
    if (bytes[0] === 0xD0 && bytes[1] === 0xCF) {
      toast('옛 PowerPoint(.ppt) 파일을 읽는 중…', 8000);
      deck = await importPpt(buf, name);
      name = name.replace(/\.(ppt|pps|pot)$/i, '') + '.pptx';
      handle = null;
      toast('옛 .ppt 파일을 읽었습니다. 저장은 .pptx 로 합니다(글자·그림·도형 위주로 옮김).', 6000);
    } else if (bytes[0] === 0x50 && bytes[1] === 0x4B) {
      deck = await Deck.open(buf, name);
    } else throw new Error('PowerPoint 파일이 아닙니다(.pptx 또는 .ppt).');
  } catch (e) {
    console.error(e);
    dialog('파일을 열 수 없습니다', h('p', { text: e.message || String(e) }), [['확인', null, true]]);
    return false;
  }
  useDeck(deck, name, handle);
  return true;
}
function useDeck(deck, name, handle = null) {
  if (S.editing) endTextEdit(false);
  // 서식 파일(.potx)·쇼 파일(.ppsx)은 보통 발표 자료(.pptx)로 저장한다
  const ext = extOf(name);
  const ct = kids(deck.pkg.types.documentElement, 'Override').find(e => e.getAttribute('PartName') === '/' + deck.presPath);
  if (/^(potx|ppsx|potm|ppsm)$/.test(ext) || (ct && /(template|slideshow)/.test(ct.getAttribute('ContentType')))) {
    const macro = /m$/.test(ext) || (ct && /macroEnabled/.test(ct.getAttribute('ContentType')));
    deck.pkg.setOverride(deck.presPath, macro ? 'application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml');
    name = name.replace(/\.[a-z0-9]+$/i, '') + (macro ? '.pptm' : '.pptx');
    handle = null;
  }
  S.deck = deck; S.cur = 0; S.sel = []; S.file = { name, handle, confirmed: false };
  H.undo = []; H.redo = [];
  S.dirty = false; S.fit = true;
  $('#app').dataset.state = 'open';
  document.title = name + ' — PPT 편집기';
  $('#notesText').value = '';
  refresh('all');
  fitZoom();
}

// ── 화면 갱신 ──
function refresh(what = 'cur') {
  if (!S.deck) return;
  const n = S.deck.slides.length;
  if (S.cur >= n) S.cur = Math.max(0, n - 1);
  if (what === 'all') renderThumbs();
  else updateThumb(S.cur);
  renderCurrent();
  renderNotes();
  updateToolbar();
  updateStatus();
}
let _nodeOf = new Map();
function renderCurrent() {
  const host = $('#slideHost');
  const path = S.deck.slides[S.cur];
  if (!path) { host.replaceChildren(h('div', { class: 'slide', style: `width:${S.deck.W}px;height:${S.deck.H}px;display:grid;place-items:center;color:#999`, text: '슬라이드가 없습니다. 왼쪽 아래 ‘새 슬라이드’를 누르세요.' })); $('#overlay').replaceChildren(); return; }
  const sl = renderSlide(S.deck, path, { editable: true, slideNo: S.cur + 1 });
  sl.classList.add('edit');
  host.replaceChildren(sl);
  _nodeOf = new Map();
  for (const n of sl.querySelectorAll('.obj')) _nodeOf.set(n._x, n);
  // 선택 다시 잇기(같은 XML 요소 또는 같은 id)
  const ids = new Set(selIds());
  const tree = spTreeOf(S.deck.pkg.doc(path));
  S.sel = kids(tree).map(altPick).filter(e => e && _nodeOf.has(e) && (S.sel.includes(e) || ids.has(idOf(e))));
  sizeStage();
  drawSel();
}
const nodeOf = x => _nodeOf.get(x) || null;

function sizeStage() {
  const d = S.deck, z = S.zoom;
  const st = $('#stage');
  st.style.width = d.W * z + 'px'; st.style.height = d.H * z + 'px';
  for (const e of [$('#slideHost'), $('#overlay')]) { e.style.width = d.W + 'px'; e.style.height = d.H + 'px'; e.style.transform = `scale(${z})`; e.style.transformOrigin = '0 0'; }
  $('#zLabel').textContent = Math.round(z * 100) + '%';
}
function fitZoom() {
  if (!S.deck) return;
  const wrap = $('#stageWrap');
  const m = innerWidth <= 760 ? 12 : 48;
  const z = Math.min((wrap.clientWidth - m) / S.deck.W, (wrap.clientHeight - m * 0.8) / S.deck.H);
  S.zoom = clamp(z, 0.1, 4); S.fit = true;
  sizeStage(); drawSel();
}
function setZoom(z) { S.zoom = clamp(z, 0.1, 4); S.fit = false; sizeStage(); drawSel(); }

function updateStatus() {
  if (!S.deck) return;
  $('#stFile').textContent = (S.dirty ? '● ' : '') + S.file.name;
  document.title = (S.dirty ? '● ' : '') + S.file.name + ' — PPT 편집기';
  $('#stSlide').textContent = `슬라이드 ${S.cur + 1} / ${S.deck.slides.length}`;
  $('#stSel').textContent = S.editing ? '글자 편집 중 — 바깥을 누르거나 Esc 로 마침' : S.sel.length ? `${S.sel.length}개 선택` : '';
  $('#bUndo').disabled = !H.undo.length; $('#bRedo').disabled = !H.redo.length;
}

// ── 대화상자 ──
function dialog(title, body, buttons) {
  return new Promise(res => {
    const box = $('#dialog');
    const close = v => { box.hidden = true; box.replaceChildren(); res(v); };
    const btns = buttons.map(([label, val, primary]) => h('button', { class: 'btn' + (primary ? ' primary' : ''), onclick: () => close(typeof val === 'function' ? val() : val) }, label));
    box.replaceChildren(h('div', { class: 'dlg', role: 'dialog', 'aria-modal': 'true' }, h('h2', { text: title }), body, h('div', { class: 'btns' }, btns)));
    box.hidden = false;
    box.onkeydown = e => { if (e.key === 'Escape') close(null); };
    box.onclick = e => { if (e.target === box) close(null); };
    const first = box.querySelector('input, select, .btn.primary');
    if (first) first.focus();
  });
}
