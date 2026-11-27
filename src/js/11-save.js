// ───────────────────────── 저장·새 발표 자료 ─────────────────────────
const BLANK_PPTX_B64 = '@@BLANK_PPTX@@';       // 빌드할 때 src/template/blank.pptx 가 들어간다
const NOTES_MASTER_XML = '@@NOTES_MASTER@@';   // src/template/notesMaster.xml

function b64bytes(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }

async function newDeck() {
  if (!(await confirmDiscard())) return;
  const deck = await Deck.open(b64bytes(BLANK_PPTX_B64).buffer, '새 프레젠테이션.pptx');
  S.deck = deck;
  // 제목 슬라이드 하나로 시작(실행 취소 기록에 넣지 않는다)
  const m = allMasters()[0];
  const lays = layoutsOf(m);
  const title = lays.find(p => attr(deck.pkg.doc(p).documentElement, 'type') === 'title') || lays[0];
  newSlide(title, 0);
  useDeck(deck, '새 프레젠테이션.pptx', null);
}

// 저장 안 한 변경이 있으면 묻기 → true 면 계속
async function confirmDiscard() {
  if (!S.deck || !S.dirty) return true;
  const r = await dialog('저장하지 않은 변경 내용', h('p', { text: `‘${S.file.name}’의 변경 내용을 저장할까요?` }), [['취소', null], ['저장 안 함', 'no'], ['저장', 'save', true]]);
  if (r == null) return false;
  if (r === 'save') return await save(false);
  return true;
}

// ── 쓰이는 부분만 모으기(관계로 닿는 부분) ──
function reachableParts(pkg) {
  const seen = new Set();
  const stack = [];
  const root = pkg.doc('_rels/.rels');
  for (const e of kids(root && root.documentElement, 'Relationship')) if (e.getAttribute('TargetMode') !== 'External') stack.push(resolvePath('', e.getAttribute('Target')));
  while (stack.length) {
    const p = stack.pop();
    if (seen.has(p) || !pkg.has(p)) continue;
    seen.add(p);
    for (const r of pkg.rels(p)) if (r.mode !== 'External') stack.push(r.target);
  }
  return seen;
}

async function buildPptx() {
  const pkg = S.deck.pkg;
  touchDocProps();
  const keep = reachableParts(pkg);
  const out = new JSZip();
  const names = new Set(['[Content_Types].xml', '_rels/.rels']);
  for (const p of keep) { names.add(p); const rp = pkg.relsPath(p); if (pkg.has(rp)) names.add(rp); }
  // 부분 목록에서 빠진 부분의 Override 지우기(복사본에서)
  const types = parseXML(xmlString(pkg.types));
  for (const o of kids(types.documentElement, 'Override')) { const pn = o.getAttribute('PartName').replace(/^\//, ''); if (!names.has(pn)) o.remove(); }
  // 확장자 기본 형식이 없는 그림 등
  const defs = new Set(kids(types.documentElement, 'Default').map(e => (e.getAttribute('Extension') || '').toLowerCase()));
  const ovr = new Set(kids(types.documentElement, 'Override').map(e => e.getAttribute('PartName').replace(/^\//, '')));
  for (const n of names) {
    const ext = extOf(n);
    if (!ovr.has(n) && ext && !defs.has(ext)) {
      const e = types.createElementNS(NS.ct, 'Default'); e.setAttribute('Extension', ext); e.setAttribute('ContentType', MIME[ext] || 'application/octet-stream');
      types.documentElement.insertBefore(e, types.documentElement.firstChild); defs.add(ext);
    }
  }
  out.file('[Content_Types].xml', xmlString(types));
  for (const n of [...names].sort()) {
    if (n === '[Content_Types].xml') continue;
    if (pkg.xml.has(n) && !pkg.removed.has(n)) out.file(n, xmlString(pkg.xml.get(n)));
    else { const b = await pkg.bytes(n); if (b) out.file(n, b); }
  }
  return out.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
}
// 문서 정보: 슬라이드 수·고친 시각
function touchDocProps() {
  const pkg = S.deck.pkg;
  const app = pkg.doc('docProps/app.xml');
  if (app) {
    const n = S.deck.slides.length;
    const set = (name, v) => { const e = kid(app.documentElement, name); if (e) e.textContent = String(v); };
    set('Slides', n);
    set('Notes', S.deck.slides.filter(p => notesPathOf(p)).length);
    set('HiddenSlides', S.deck.slides.filter(p => attr(pkg.doc(p).documentElement, 'show') === '0').length);
  }
  const core = pkg.doc('docProps/core.xml');
  if (core) { const m = kids(core.documentElement).find(e => ln(e) === 'modified'); if (m) m.textContent = new Date().toISOString().replace(/\.\d+Z$/, 'Z'); }
}

// ── 저장: 원본 덮어쓰기(가능할 때) → 다른 이름 → 내려받기 ──
let saving = false;
async function save(as = false) {
  if (!S.deck || saving) return false;
  if (S.editing) endTextEdit(true);
  flushNotes();
  saving = true;
  try {
    let blob;
    try { blob = await buildPptx(); }
    catch (e) { console.error(e); await dialog('저장하지 못했습니다', h('p', { text: e.message || String(e) }), [['확인', null, true]]); return false; }
    const name = S.file.name;
    const fh = S.file.handle;
    if (!as && fh && fh.createWritable) {
      if (!S.file.confirmed) {
        const r = await dialog('원본 파일에 저장', h('p', { text: `‘${name}’ 파일을 고친 내용으로 바꿉니다. 원본을 그대로 두려면 ‘다른 이름으로 저장’을 누르세요.` }), [['취소', null], ['다른 이름으로 저장', 'as'], ['덮어쓰기', 'ok', true]]);
        if (r == null) return false;
        if (r === 'as') { saving = false; return await save(true); }
        S.file.confirmed = true;
      }
      try {
        if (fh.queryPermission && (await fh.queryPermission({ mode: 'readwrite' })) !== 'granted' && (await fh.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('쓰기 권한이 없습니다');
        const w = await fh.createWritable(); await w.write(blob); await w.close();
        return saved(name, false);
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
        console.warn(e); toast('원본 파일에 쓸 수 없어 새 파일로 저장합니다.', 3500);
      }
    }
    const ext = extOf(name) === 'pptm' ? 'pptm' : 'pptx';
    if (window.showSaveFilePicker) {
      try {
        const hd = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: 'PowerPoint 프레젠테이션', accept: { [ext === 'pptm' ? 'application/vnd.ms-powerpoint.presentation.macroEnabled.12' : 'application/vnd.openxmlformats-officedocument.presentationml.presentation']: ['.' + ext] } }] });
        const w = await hd.createWritable(); await w.write(blob); await w.close();
        S.file = { name: hd.name, handle: hd, confirmed: true };
        return saved(hd.name, false);
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
        console.warn(e);
      }
    }
    let dl = name;
    if (as) {
      const v = await askText('다른 이름으로 저장', '파일 이름', name);
      if (v == null) return false;
      dl = v.replace(/[\\/:*?"<>|]+/g, '_').trim() || name;
      if (!/\.(pptx|pptm)$/i.test(dl)) dl += '.' + ext;
      S.file.name = dl;
    }
    download(blob, dl);
    return saved(dl, true);
  } finally { saving = false; }
}
function saved(name, dl) {
  setDirty(false);
  toast(dl ? `‘${name}’ 파일을 내려받았습니다(다운로드 폴더).` : `저장했습니다: ${name}`, 3000);
  return true;
}
function askText(title, label, value) {
  const inp = h('input', { type: 'text', value, style: 'flex:1;height:32px;border:1px solid #d9dde3;border-radius:6px;padding:0 8px' });
  const body = h('div', { class: 'row' }, h('label', { text: label }), inp);
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') $('#dialog .btn.primary').click(); });
  return dialog(title, body, [['취소', null], ['확인', () => inp.value, true]]);
}
