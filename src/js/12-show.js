// ───────────────────────── 슬라이드 쇼·PDF(인쇄) ─────────────────────────
const SHOW = { on: false, list: [], i: 0, typed: '', t: 0, end: false };

function startShow(fromCurrent) {
  if (!S.deck || !S.deck.slides.length) return;
  if (S.editing) endTextEdit(true);
  flushNotes();
  const d = S.deck;
  SHOW.list = d.slides.map((p, i) => ({ p, i })).filter(x => attr(d.pkg.doc(x.p).documentElement, 'show') !== '0');
  if (!SHOW.list.length) SHOW.list = d.slides.map((p, i) => ({ p, i }));
  SHOW.i = fromCurrent ? Math.max(0, SHOW.list.findIndex(x => x.i >= S.cur)) : 0;
  SHOW.on = true; SHOW.end = false; SHOW.typed = '';
  const el = $('#show');
  el.hidden = false;
  if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  showDraw();
}
function showDraw() {
  const box = $('#showSlide'), d = S.deck;
  const W = innerWidth, Hh = innerHeight;
  if (SHOW.end) {
    box.replaceChildren(h('div', { class: 'showend', text: '슬라이드 쇼가 끝났습니다. 끝내려면 누르세요.' }));
    box.style.width = W + 'px'; box.style.height = Hh + 'px';
    $('#showInfo').textContent = '';
    return;
  }
  const it = SHOW.list[SHOW.i];
  const z = Math.min(W / d.W, Hh / d.H);
  const sl = renderSlide(d, it.p, { slideNo: it.i + 1 });
  sl.style.transform = `scale(${z})`;
  box.style.width = d.W * z + 'px'; box.style.height = d.H * z + 'px';
  box.replaceChildren(sl);
  $('#showInfo').textContent = `${SHOW.i + 1} / ${SHOW.list.length}`;
}
function showGo(k) {
  if (!SHOW.on) return;
  if (SHOW.end) { if (k < 0) { SHOW.end = false; SHOW.i = SHOW.list.length - 1; showDraw(); } else endShow(); return; }
  const n = SHOW.i + k;
  if (n >= SHOW.list.length) { SHOW.end = true; showDraw(); return; }
  SHOW.i = clamp(n, 0, SHOW.list.length - 1);
  showDraw();
}
function endShow() {
  if (!SHOW.on) return;
  SHOW.on = false;
  const it = SHOW.list[Math.min(SHOW.i, SHOW.list.length - 1)];
  $('#show').hidden = true;
  $('#showSlide').replaceChildren();
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (it) goSlide(it.i);
}
function showKey(e) {
  const k = e.key;
  if (/^[0-9]$/.test(k)) { SHOW.typed += k; return true; }
  if (k === 'Enter' && SHOW.typed) { const n = +SHOW.typed - 1; SHOW.typed = ''; if (n >= 0 && n < SHOW.list.length) { SHOW.end = false; SHOW.i = n; showDraw(); } return true; }
  SHOW.typed = '';
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(k)) showGo(1);
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(k)) showGo(-1);
  else if (k === 'Home') { SHOW.end = false; SHOW.i = 0; showDraw(); }
  else if (k === 'End') { SHOW.end = false; SHOW.i = SHOW.list.length - 1; showDraw(); }
  else if (k === 'Escape' || k === '-') endShow();
  else if (k === 'b' || k === 'B' || k === '.') $('#show').classList.toggle('black');
  else if (k === 'w' || k === 'W' || k === ',') $('#show').classList.toggle('white');
  else return false;
  return true;
}
function initShow() {
  const el = $('#show');
  el.addEventListener('click', e => { if (e.button === 0) showGo(1); });
  el.addEventListener('contextmenu', e => { e.preventDefault(); showGo(-1); });
  el.addEventListener('wheel', e => { e.preventDefault(); showGo(e.deltaY > 0 ? 1 : -1); }, { passive: false });
  el.addEventListener('mousemove', () => { el.classList.add('cursor'); clearTimeout(SHOW.t); SHOW.t = setTimeout(() => el.classList.remove('cursor'), 1800); });
  // 손가락으로 넘기기
  let tx = null;
  el.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', e => { if (tx == null) return; const dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 40) { showGo(dx < 0 ? 1 : -1); e.preventDefault(); } }, { passive: false });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && SHOW.on) endShow(); });
  addEventListener('resize', () => { if (SHOW.on) showDraw(); });
}

// ── PDF: 인쇄 대화상자에서 ‘PDF로 저장’ ──
async function printPdf() {
  if (!S.deck || !S.deck.slides.length) return;
  if (S.editing) endTextEdit(true);
  flushNotes();
  const area = await preparePrint();
  toast('인쇄 창에서 ‘대상: PDF로 저장’을 고르세요.', 5000);
  const done = () => { area.replaceChildren(); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}
async function preparePrint() {
  const d = S.deck, area = $('#printArea');
  area.replaceChildren();
  // 쪽 크기 = 슬라이드 크기(인치)
  const win = d.W / 96, hin = d.H / 96;
  let st = $('#pageStyle');
  if (!st) { st = h('style', { id: 'pageStyle' }); document.head.append(st); }
  st.textContent = `@page { size: ${win.toFixed(3)}in ${hin.toFixed(3)}in; margin: 0; }`;
  d.slides.forEach((p, i) => {
    if (attr(d.pkg.doc(p).documentElement, 'show') === '0') return;
    const page = h('div', { class: 'page', style: `width:${win}in;height:${hin}in` });
    page.append(renderSlide(d, p, { slideNo: i + 1 }));
    area.append(page);
  });
  await Promise.all([...area.querySelectorAll('img')].map(im => im.decode ? im.decode().catch(() => {}) : null));
  if (document.fonts && document.fonts.ready) await document.fonts.ready;
  return area;
}
