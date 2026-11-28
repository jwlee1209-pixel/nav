// ───────────────────────── 화면: 공통 · 홈 · 검색 · 장소 · 경로 미리보기 ─────────────────────────
const IC = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
  locate: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  north: '<path d="M12 3.5l5.5 16-5.5-3.4-5.5 3.4z"/>',
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  work: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8.5 7.5V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5v2M3 13h18"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  swap: '<path d="M8 4v15M4.5 7.5 8 4l3.5 3.5M16 20V5M12.5 16.5 16 20l3.5-3.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  vol: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  overview: '<path d="M5 19c3-1 3-6 7-7s4-6 7-7"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/>',
  play: '<path d="M7 5v14l12-7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  trash: '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  down: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 16V5M7 9.5l5-5 5 5M5 20h14"/>',
  spark: '<path d="M12 3.5 13.8 10.2 20.5 12 13.8 13.8 12 20.5 10.2 13.8 3.5 12 10.2 10.2z"/>',
  car: '<path d="M5 16.5V12l2-5h10l2 5v4.5"/><path d="M3.5 16.5h17M6.5 19.5v-3M17.5 19.5v-3"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
  nav: '<path d="M12 3 19 20l-7-4-7 4z"/>',
  walk: '<circle cx="13.5" cy="4.5" r="2"/><path d="M12.6 8.6 10.4 14l3.1 2.6-1 4.4M10.4 14 8 20.6M12 9.6l-3.2 3M12.6 8.6l2.6 3 3 .9"/>',
  share: '<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.8 6.6-4M8.7 13.2l6.6 4"/>',
  addhome: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M12 8.5v6M9 11.5h6"/>',
  route: '<circle cx="6" cy="18.5" r="2.2"/><circle cx="18" cy="5.5" r="2.2"/><path d="M8.3 18.5H15a3.2 3.2 0 0 0 0-6.4H9a3.2 3.2 0 0 1 0-6.4h6.7"/>',
};
const ic = (n, size = 22, fill = false) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;

const S = {
  screen: 'home', me: null, gps: 'idle', night: false,
  place: null, pick: null, results: null, searching: false, lastQuery: '',
  homeTab: 'recent', trip: null, nav: null, tripView: null,
  searchCtl: null, routeCtl: null, followHome: false,
};

// ── 알림·확인 창 ──
let _toastT = 0;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastT);
  _toastT = setTimeout(() => t.classList.remove('show'), ms);
}
function ask(msg, { ok = '확인', cancel = '취소', danger = false } = {}) {
  return new Promise(res => {
    const box = $('#dialog');
    const done = v => { box.hidden = true; box.replaceChildren(); res(v); };
    box.replaceChildren(h('div', { class: 'dialog__box', role: 'dialog', 'aria-modal': 'true' },
      h('p', { text: msg }),
      h('div', { class: 'dialog__btns' },
        h('button', { class: 'btn', type: 'button', text: cancel, onclick: () => done(false) }),
        h('button', { class: 'btn ' + (danger ? 'btn--danger' : 'btn--primary'), type: 'button', text: ok, onclick: () => done(true) }))));
    box.hidden = false;
    box.onclick = e => { if (e.target === box) done(false); };
    box.querySelector('.btn--primary, .btn--danger').focus();
  });
}
function banner(text) {
  const b = $('#banner');
  if (!text) { b.hidden = true; return; }
  b.textContent = text; b.hidden = false;
}

// ── 화면 전환 ──
function go(screen) {
  const prev = S.screen;
  S.screen = screen;
  S.sheetScr = null;          // 화면을 옮기면(같은 화면을 다시 열어도) 목록은 기본 크기로
  $('#app').dataset.screen = screen;
  if (screen !== 'place' && screen !== 'search') { MV.setPlaceMark(null); MV.setHits(null); }
  if (prev === 'trip' && screen !== 'trip') { S.tripView = null; if (screen !== 'preview') { MV.clearRoutes(); MV.setTripMarks(null, [], null); } }
  if (screen === 'home') { S.pick = null; $('#q').value = ''; $('#q').placeholder = '어디로 갈까요?'; $('#q').blur(); }
  $('#qClear').hidden = !(screen === 'search' || screen === 'place');
  renderSheet();
  if (screen === 'home') renderChips();
  if (screen === 'preview') renderPlan();
  if (prev === 'home' && screen !== 'home' && !S.pushed) { try { history.pushState({ nv: 1 }, ''); S.pushed = true; } catch (e) { /* 무시 */ } }
  requestAnimationFrame(measure);
}
function back() {
  if (!$('#overlay').hidden) { closeOverlay(); return; }
  if (S.screen === 'guide') { $('#gEnd').click(); return; }
  if (S.screen === 'place') { if (S.results) go('search'); else if (S.pick && S.trip) go('preview'); else go('home'); return; }
  if (S.screen === 'search') { if (S.pick && S.trip && S.pick !== 'home' && S.pick !== 'work') { S.pick = null; go('preview'); } else go('home'); return; }
  if (S.screen === 'preview') { cancelTrip(); return; }
  if (S.screen === 'trip') { S.homeTab = 'trips'; go('home'); return; }
}
window.addEventListener('popstate', () => {
  S.pushed = false;
  back();
  if (S.screen !== 'home') { try { history.pushState({ nv: 1 }, ''); S.pushed = true; } catch (e) { /* 무시 */ } }
});

// 떠 있는 요소 높이를 CSS 변수로(버튼·지도 여백 계산용)
function measure() {
  const app = $('#app'), sheet = $('#sheet');
  const sh = getComputedStyle(sheet).display === 'none' || innerWidth >= 760 ? 0 : sheet.offsetHeight;
  app.style.setProperty('--sheet-h', sh + 'px');
  app.style.setProperty('--mp-h', ($('#mpanel').offsetHeight || 0) + 'px');
  app.style.setProperty('--gbar-h', ($('#gbar').offsetHeight || 0) + 'px');
  app.style.setProperty('--plan-h', ($('#plan').offsetHeight || 0) + 'px');
}
// 손으로 끌어 목록 크기 바꾸기: 손잡이는 어디서나, 목록 안에서는 맨 위에서 아래로 끌 때(또는 크게가 아닐 때 위로)
// 놓으면 가까운 크기(접기·보통·크게)로 붙고, 빠르게 튕기면 그 방향으로 한 단계
function sheetSnapHeights() {
  const sheet = $('#sheet'), cur = sheet.dataset.size, mh = sheet.style.maxHeight;
  sheet.style.transition = 'none';
  const hs = {};
  for (const k of SHEET_SIZES) { sheet.style.maxHeight = ''; sheet.dataset.size = k; hs[k] = sheet.getBoundingClientRect().height; }
  sheet.dataset.size = cur; sheet.style.maxHeight = mh;
  return hs;
}
function initSheetDrag() {
  const sheet = $('#sheet'), body = $('#sheetBody'), grip = $('#grip');
  let st = null, justDragged = 0;
  const begin = (x, y, fromBody) => { st = { x0: x, y0: y, h0: sheet.getBoundingClientRect().height, active: false, fromBody, pts: [{ y, t: performance.now() }] }; };
  const move = (x, y) => {
    if (!st) return false;
    const dy = y - st.y0, dx = x - st.x0;
    if (!st.active) {
      if (Math.abs(dy) < 8 || Math.abs(dx) > Math.abs(dy)) { if (Math.abs(dx) > 12) st = null; return false; }
      if (st.fromBody && ((dy > 0 && body.scrollTop > 2) || (dy < 0 && sheet.dataset.size === 'full'))) { st = null; return false; }   // 목록 스크롤
      st.active = true; st.hs = sheetSnapHeights();
      sheet.style.transition = 'none';
      $('#app').classList.add('sheet-drag');
    }
    const lo = Math.min(st.hs.min, st.hs.peek, st.hs.full), hi = Math.max(st.hs.min, st.hs.peek, st.hs.full);
    sheet.style.maxHeight = clamp(st.h0 - dy, lo - 12, hi + 12) + 'px';
    st.pts.push({ y, t: performance.now() }); if (st.pts.length > 8) st.pts.shift();
    measure();
    return true;
  };
  const end = () => {
    const was = st; st = null;
    if (!was || !was.active) return;
    justDragged = Date.now();
    const h = sheet.getBoundingClientRect().height;
    const b = was.pts[was.pts.length - 1];
    const a = was.pts.find(p => b.t - p.t <= 150) || was.pts[0];   // 손을 떼기 직전 0.15초의 빠르기
    const v = (b.y - a.y) / Math.max(16, b.t - a.t);              // px/ms, + 아래로
    const order = SHEET_SIZES.map(k => [k, was.hs[k]]).sort((p, q) => p[1] - q[1]);
    let target;
    if (v > 0.35) target = [...order].reverse().find(([, hh]) => hh < h - 4) || order[0];
    else if (v < -0.35) target = order.find(([, hh]) => hh > h + 4) || order[order.length - 1];
    else target = order.reduce((p, q) => (Math.abs(q[1] - h) < Math.abs(p[1] - h) ? q : p));
    sheet.getBoundingClientRect();
    sheet.style.transition = '';
    setSheetSize(target[0]);
    $('#app').classList.remove('sheet-drag');
  };
  const t0 = e => e.touches[0];
  grip.addEventListener('touchstart', e => { if (e.touches.length === 1) begin(t0(e).clientX, t0(e).clientY, false); }, { passive: true });
  body.addEventListener('touchstart', e => { if (e.touches.length === 1) begin(t0(e).clientX, t0(e).clientY, true); }, { passive: true });
  sheet.addEventListener('touchmove', e => { if (st && e.touches.length === 1 && move(t0(e).clientX, t0(e).clientY) && e.cancelable) e.preventDefault(); }, { passive: false });
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);
  // PC(마우스): 손잡이를 끌어서
  grip.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; begin(e.clientX, e.clientY, false); try { grip.setPointerCapture(e.pointerId); } catch (er) { /* 무시 */ } });
  grip.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && st) move(e.clientX, e.clientY); });
  grip.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') end(); });
  grip.addEventListener('pointercancel', end);
  // 끈 직후의 클릭은 버리고, 접힌 상태에서 목록을 누르면 펼친다
  sheet.addEventListener('click', e => {
    if (Date.now() - justDragged < 350) { e.stopPropagation(); e.preventDefault(); return; }
    if (sheet.dataset.size === 'min' && !grip.contains(e.target)) { e.stopPropagation(); e.preventDefault(); setSheetSize('peek'); }
  }, true);
}

const _ro = new ResizeObserver(() => measure());
_ro.observe(document.body);
['#sheet', '#mpanel', '#gbar', '#plan'].forEach(sel => { const el = document.querySelector(sel); if (el) _ro.observe(el); });

// ── 아래 목록(시트) 크기: min 접기(손잡이와 한 줄) · peek 보통 · full 크게 ──
const SHEET_SIZES = ['min', 'peek', 'full'];
function setSheetSize(size) {
  const sh = $('#sheet');
  sh.style.maxHeight = '';
  sh.dataset.size = size;
  $('#grip').setAttribute('aria-expanded', size === 'min' ? 'false' : 'true');
  if (size === 'min') $('#sheetBody').scrollTop = 0;
  requestAnimationFrame(measure); setTimeout(measure, 300);
}
const SHEET_DEFAULT = { home: 'peek', search: 'full', place: 'peek', preview: 'peek', trip: 'peek' };

function renderSheet() {
  const body = $('#sheetBody');
  const scr = S.screen;
  const put = kids => body.replaceChildren(...kids.filter(Boolean));
  // 화면이 바뀔 때만 기본 크기로. 같은 화면을 다시 그릴 때는 손으로 맞춘 크기를 그대로 둔다
  if (SHEET_DEFAULT[scr] && S.sheetScr !== scr) { S.sheetScr = scr; setSheetSize(SHEET_DEFAULT[scr]); }
  if (scr === 'home') put(homeSheet());
  else if (scr === 'search') put(searchSheet());
  else if (scr === 'place') put(placeSheet());
  else if (scr === 'preview') put(previewSheet());
  else if (scr === 'trip') put(tripSheet());
  body.scrollTop = 0;
}

// ── 공통 목록 항목 ──
function placeItem(p, { kind = 'pin', onClick, right } = {}) {
  const icName = { home: 'home', work: 'work', fav: 'star', recent: 'clock', pin: 'pin', suggest: 'spark' }[kind] || 'pin';
  const d = S.me ? hav([S.me.lon, S.me.lat], [p.lon, p.lat]) : p.dist;
  return h('li', { class: 'item', tabindex: '0', role: 'button', onclick: onClick, onkeydown: e => { if (e.key === 'Enter') onClick(e); } },
    h('span', { class: 'item__ic item__ic--' + kind, svg: ic(icName, 20, kind === 'fav') }),
    h('span', { class: 'item__txt' },
      h('div', { class: 'item__name', text: p.label || p.name }),
      h('div', { class: 'item__addr', text: [p.cat, p.label ? p.name : '', p.memo, p.addr].filter(Boolean).join(' · ') || ' ' })),
    right || (d != null ? h('span', { class: 'item__dist num', text: fmtDistStr(d) }) : null));
}

// ── 홈 ──
function renderChips() {
  const box = $('#chips');
  const here = S.me;
  const kids = [];
  for (const sg of suggestions(here)) {
    kids.push(h('button', { class: 'chip chip--suggest', type: 'button', title: sg.why, onclick: () => startTrip(sg) }, h('span', { svg: ic('spark', 16, true) }), sg.name));
  }
  const fixed = [['home', '집', store.home], ['work', '회사', store.work]];
  for (const [k, label, p] of fixed) {
    kids.push(h('button', { class: 'chip chip--' + k, type: 'button', onclick: () => p ? startTrip({ ...p, label }) : beginPick(k) },
      h('span', { svg: ic(k, 17) }), p ? label : label + ' 등록'));
  }
  // 즐겨찾는 경로: 많이 쓴 것 4개(같으면 나중에 등록한 것 먼저)
  for (const r of [...store.froutes].sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 4)) kids.push(h('button', { class: 'chip chip--route', type: 'button', title: `즐겨찾는 경로: ${r.from.name || '출발지'} → ${r.dest.name || '도착지'}`, onclick: () => followFav(r) }, h('span', { svg: ic('route', 16) }), r.name));
  for (const f of store.favs.slice(0, 8)) kids.push(h('button', { class: 'chip chip--fav', type: 'button', onclick: () => startTrip(f) }, h('span', { svg: ic('star', 16, true) }), f.name));
  box.replaceChildren(...kids);
}

function homeSheet() {
  const tabs = h('div', { class: 'seg', role: 'tablist' },
    ...[['recent', '최근 목적지'], ['fav', '즐겨찾기'], ['trips', '주행 기록']].map(([k, label]) => h('button', { type: 'button', role: 'tab', id: 'tab-' + k, 'aria-pressed': S.homeTab === k ? 'true' : 'false', text: label, onclick: () => { S.homeTab = k; renderSheet(); } })));
  if (S.homeTab === 'trips') return [gpsAlert(), installCard(), h('div', { class: 'sec-head' }, tabs), ...tripsTab()];
  const list = h('ul', { class: 'list' });
  const items = S.homeTab === 'recent' ? store.recents : store.favs;
  if (!items.length) {
    list.append(h('li', { class: 'empty', text: S.homeTab === 'recent' ? '아직 다녀온 곳이 없습니다. 위에서 목적지를 검색해 보세요.' : '자주 가는 곳을 즐겨찾기에 넣으면 여기와 지도 위에 표시됩니다. 자주 다니는 길은 ‘주행 기록’에서 즐겨찾는 경로로 등록하세요.' }));
  } else {
    for (const p of items.slice(0, 20)) list.append(placeItem(p, { kind: S.homeTab === 'recent' ? 'recent' : 'fav', onClick: () => openPlace(p) }));
  }
  const manage = h('div', { class: 'sec-head', style: 'margin-top:8px;flex-wrap:wrap' },
    h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      h('button', { class: 'btn btn--sm', type: 'button', id: 'btnSaveHere', onclick: () => saveHere() }, h('span', { svg: ic('pin', 16) }), '현재 위치 저장'),
      h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: openPlaces }, h('span', { svg: ic('star', 16) }), '내 장소 관리')),
    gpsNote());
  return [gpsAlert(), installCard(), h('div', { class: 'sec-head' }, tabs), ...(S.homeTab === 'fav' ? froutesSection() : []), list, manage];
}

// 위치를 못 쓰는 이유와 해결 방법(한곳에서 관리)
const APP_URL = 'https://jwlee1209-pixel.github.io/nav/';
const isLocalFile = () => /^(file|content):$/.test(location.protocol);
const GPS_BAD = ['localfile', 'insecure', 'denied', 'off', 'unavail'];
function gpsMsg(kind = 'long') {
  const short = kind === 'short';
  switch (S.gps) {
    case 'localfile': return short ? '파일로 열어 위치를 쓸 수 없습니다' : `내려받은 파일로 연 화면에서는 휴대폰이 위치(GPS)를 막습니다. ${APP_URL} 주소로 여세요.`;
    case 'insecure': return short ? '위치는 https 주소에서만 쓸 수 있습니다' : `위치는 https 주소에서만 쓸 수 있습니다. ${APP_URL} 주소로 여세요.`;
    case 'denied': return short ? '위치 권한이 꺼져 있습니다' : '위치 권한이 꺼져 있습니다. 주소창 왼쪽 아이콘(사이트 정보)에서 위치를 허용하고, 휴대폰 설정 → 애플리케이션 → 사용하는 브라우저 → 권한 → 위치도 허용해 주세요.';
    case 'off': return '이 브라우저는 위치를 지원하지 않습니다';
    case 'unavail': return short ? '위치를 찾을 수 없습니다' : '위치를 찾을 수 없습니다. 휴대폰의 위치(GPS)가 켜져 있는지 확인하세요.';
    case 'wait': return short ? '위치 찾는 중…' : '현재 위치를 찾는 중입니다…';
    default: return '';
  }
}
function gpsNote() {
  const msg = S.gps === 'wait' ? gpsMsg('short') : '';
  return msg ? h('span', { class: 'muted', style: 'font-size:12.5px', text: msg }) : h('span');
}
function gpsAlert() {
  if (!GPS_BAD.includes(S.gps)) return null;
  const openUrl = (S.gps === 'localfile' || S.gps === 'insecure') && location.href.indexOf(APP_URL) !== 0;
  return h('div', { class: 'alert', role: 'note' },
    h('span', { svg: ic('locate', 20) }),
    h('div', null, h('b', { text: gpsMsg('short') }), h('p', { text: gpsMsg('long') }),
      openUrl ? h('a', { class: 'btn btn--sm btn--primary', href: APP_URL, text: '주소로 열기' }) : null));
}

// ── 검색 ──
function beginPick(kind) {
  S.pick = kind;
  const ph = { home: '집 주소나 장소를 검색하세요', work: '회사 주소나 장소를 검색하세요', origin: '출발지를 검색하세요', stop: '경유지를 검색하세요', dest: '도착지를 검색하세요' }[kind] || '어디로 갈까요?';
  S.results = null;
  go('search');
  const q = $('#q');
  q.value = ''; q.placeholder = ph;
  setTimeout(() => q.focus(), 50);
}

function localMatches(q) {
  q = q.trim();
  const all = [];
  if (store.home) all.push({ ...store.home, label: '집', _k: 'home' });
  if (store.work) all.push({ ...store.work, label: '회사', _k: 'work' });
  store.favs.forEach(f => all.push({ ...f, _k: 'fav' }));
  store.recents.forEach(r => all.push({ ...r, _k: 'recent' }));
  const seen = new Set(), out = [];
  for (const p of all) {
    const k = placeKey(p);
    if (seen.has(k)) continue;
    if (q && !matchPlace(p, q)) continue;
    seen.add(k); out.push(p);
  }
  // 이름이나 집·회사가 맞는 곳을 먼저(메모·주소로만 맞은 곳은 뒤로)
  if (q) out.sort((a, b) => (matchPlace({ label: a.label, name: a.name }, q) ? 0 : 1) - (matchPlace({ label: b.label, name: b.name }, q) ? 0 : 1));
  return out.slice(0, q ? 8 : 12);
}

function searchSheet() {
  const q = $('#q').value;
  const out = [];
  if (S.searching) out.push(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), '검색하는 중…'));
  const loc = localMatches(q);
  const done = S.results && !S.searching && q.trim() === S.lastQuery;
  if (done && q.trim() && loc.length) {     // 검색을 눌러도 내 장소(이름·메모)가 맞으면 맨 위에
    out.push(h('div', { class: 'sec-head' }, h('h2', { text: `내 장소 ${loc.length}곳` })));
    const list = h('ul', { class: 'list' });
    loc.forEach(p => list.append(placeItem(p, { kind: p._k, onClick: () => openPlace(p) })));
    out.push(list);
  }
  if (S.results && !S.searching) {
    const r = S.results;
    out.push(h('div', { class: 'sec-head' }, h('h2', { text: r.items.length ? `‘${S.lastQuery}’ 검색 결과 ${r.items.length}곳` : `‘${S.lastQuery}’ 검색 결과가 없습니다` })));
    if (r.vwErr) out.push(h('p', { class: 'warnline', text: r.vwErr + ' (설정 → 주소·건물 검색)' }));
    if (r.note) out.push(h('p', { class: 'recline', text: r.note }));
    if (!r.items.length) out.push(h('p', { class: 'empty', text: r.errors.length ? '검색 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.' : `지도 자료(OpenStreetMap)에 없는 곳일 수 있습니다. 지도를 길게 누르면 그 위치를 바로 고를 수 있습니다.${vwKey() ? '' : ' 아파트·건물 이름과 도로명 주소까지 찾으려면 설정 → 주소·건물 검색에서 브이월드 인증키를 넣으세요.'}` }));
    const list = h('ul', { class: 'list' });
    r.items.forEach(p => list.append(placeItem(p, { onClick: () => openPlace(p) })));
    out.push(list);
    if (r.items.length && r.errors.length) out.push(h('p', { class: 'note', text: `${r.errors.join('·')} 검색 서버가 응답하지 않아 일부 결과만 보여 줍니다.` }));
  }
  if (loc.length && !done) {
    out.push(h('div', { class: 'sec-head' }, h('h2', { text: q.trim() ? '내 장소에서 찾음' : '내 장소 · 최근' })));
    const list = h('ul', { class: 'list' });
    loc.forEach(p => list.append(placeItem(p, { kind: p._k, onClick: () => openPlace(p) })));
    out.push(list);
  }
  if (!out.length) out.push(h('p', { class: 'empty', text: '장소 이름이나 주소를 입력하고 검색을 누르세요.' }));
  out.push(h('p', { class: 'note' }, `검색: ${vwKey() ? '브이월드(국토교통부) · ' : ''}Photon(komoot) · Nominatim(OpenStreetMap). 무료 서버라 입력할 때마다가 아니라 검색을 누를 때만 찾습니다.`));
  return out;
}

async function doSearch() {
  const q = $('#q').value.trim();
  if (!q) return;
  if (S.searchCtl) S.searchCtl.abort();
  const ctl = S.searchCtl = new AbortController();
  S.searching = true; S.lastQuery = q;
  if (S.screen !== 'search') go('search'); else { if ($('#sheet').dataset.size === 'min') setSheetSize('full'); renderSheet(); }
  const near = S.me || (MV.map ? { lat: MV.map.getCenter().lat, lon: MV.map.getCenter().lng } : null);
  try {
    S.results = await searchPlaces(q, near, ctl.signal);
  } catch (e) {
    if (ctl.signal.aborted) return;
    S.results = { items: [], errors: ['검색'] };
  }
  S.searching = false;
  $('#q').blur();
  if (S.screen === 'search') renderSheet();
  MV.setHits(S.results.items);
  if (S.results.items.length) {
    MV.fit(S.results.items.slice(0, 8).map(p => [p.lon, p.lat]), { padding: { top: 120, bottom: innerWidth >= 760 ? 60 : Math.min(innerHeight * 0.55, innerHeight - 260), left: innerWidth >= 760 ? 440 : 40, right: 40 } });
  }
}

// ── 장소 카드 ──
function openPlace(p) {
  S.place = p;
  go('place');
  MV.setPlaceMark(p);
  // 카드에 가리지 않도록 화면 중심을 살짝 옮긴다(지도 여백 설정은 남기지 않음)
  const offset = innerWidth >= 760 ? [210, 0] : [0, -Math.round((Math.min(innerHeight * 0.45, 360) - 90) / 2)];
  MV.follow = false;
  MV.map.easeTo({ center: [p.lon, p.lat], zoom: Math.max(MV.map.getZoom(), 15), offset, duration: 600 });
}

function placeSheet() {
  const p = S.place;
  if (!p) return [];
  const d = S.me ? hav([S.me.lon, S.me.lat], [p.lon, p.lat]) : null;
  const meta = [p.cat, p.addr].filter(Boolean).join(' · ');
  const saved = savedAt(p);
  const memo = p.memo || (saved && saved.place.memo) || '';
  const out = [
    h('div', { class: 'place__name', text: p.label ? `${p.label} · ${p.name}` : p.name }),
    h('div', { class: 'place__meta' }, meta || '주소 정보 없음', d != null ? h('span', { class: 'num', text: ` · 여기서 ${fmtDistStr(d)}` }) : null),
    memo ? h('div', { class: 'place__memo', text: memo }) : null,
  ];
  const acts = h('div', { class: 'place__acts' });
  const pk = S.pick;
  if (pk === 'home' || pk === 'work') {
    acts.append(h('button', { class: 'btn btn--primary', type: 'button', onclick: () => setMyPlace(pk, p) }, h('span', { svg: ic(pk, 20) }), pk === 'home' ? '집으로 등록' : '회사로 등록'));
  } else if (pk === 'origin' && S.trip) {
    acts.append(h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { S.trip.origin = p; S.pick = null; S.results = null; go('preview'); computeRoutes(); } }, '출발지로 설정'));
  } else if (pk === 'stop' && S.trip) {
    acts.append(h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { S.trip.stops.push(p); S.trip.follow = null; S.pick = null; S.results = null; go('preview'); computeRoutes(); } }, h('span', { svg: ic('plus', 20) }), '경유지로 추가'));
  } else {
    acts.append(h('button', { class: 'btn btn--primary', type: 'button', onclick: () => { if (S.trip && pk === 'dest') { S.trip.dest = p; S.trip.follow = null; S.pick = null; S.results = null; go('preview'); computeRoutes(); } else startTrip(p); } }, h('span', { svg: ic('nav', 20, true) }), '여기로 길 안내'));
    if (S.trip && S.trip.stops.length < 3 && pk !== 'dest') acts.append(h('button', { class: 'btn', type: 'button', onclick: () => { S.trip.stops.push(p); S.trip.follow = null; S.results = null; go('preview'); computeRoutes(); } }, '경유지로'));
  }
  const fav = isFav(p);
  acts.append(h('button', { class: 'btn', type: 'button', 'aria-pressed': fav ? 'true' : 'false', 'aria-label': fav ? '즐겨찾기에서 빼기' : '즐겨찾기에 넣기',
    onclick: e => { const on = toggleFav(p); e.currentTarget.replaceChildren(h('span', { svg: ic('star', 20, on) }), on ? '저장됨' : '저장'); toast(on ? '즐겨찾기에 넣었습니다' : '즐겨찾기에서 뺐습니다'); refreshPts(); } },
    h('span', { svg: ic('star', 20, fav) }), fav ? '저장됨' : '저장'));
  out.push(acts);
  if (!pk) {
    out.push(h('div', { class: 'place__more' },
      saved ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', id: 'btnEditSaved', onclick: () => editSaved(p) }, h('span', { svg: ic('edit', 16) }), '이름·메모') : null,
      h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => setMyPlace('home', p) }, h('span', { svg: ic('home', 16) }), '집으로 등록'),
      h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => setMyPlace('work', p) }, h('span', { svg: ic('work', 16) }), '회사로 등록')));
  }
  return out.filter(Boolean);
}

function setMyPlace(kind, p) {
  const c = cleanPlace(p);
  store[kind] = c;
  saveStore();
  refreshPts();
  toast(`${c.name}을(를) ${kind === 'home' ? '집' : '회사'}으로 등록했습니다`);
  S.results = null;
  go('home');
}

function refreshPts() {
  const pts = [];
  if (store.home) pts.push({ ...store.home, kind: 'home', label: '집' });
  if (store.work) pts.push({ ...store.work, kind: 'work', label: '회사' });
  store.favs.forEach(f => pts.push({ ...f, kind: 'fav' }));
  MV.setPts(pts);
  if (S.screen === 'home') renderChips();
}

// ── 경로 미리보기 ──
function startTrip(dest) {
  if (S.nav) return;
  const mode = store.settings.mode === 'walk' ? 'walk' : 'car';
  S.trip = { origin: null, stops: [], dest: cleanPlace(dest) && { ...cleanPlace(dest), label: dest.label }, mode, pref: mode === 'walk' ? 'fast' : store.settings.pref, routes: [], sel: 0, loading: false, err: '', warn: '' };
  S.pick = null; S.results = null;
  go('preview');
  computeRoutes();
}
function cancelTrip() {
  if (S.routeCtl) S.routeCtl.abort();
  S.trip = null;
  MV.clearRoutes();
  MV.setTripMarks(null, [], null);
  go('home');
}

function tripPoints() {
  const t = S.trip;
  const o = t.origin || (S.me ? { lat: S.me.lat, lon: S.me.lon, name: '현재 위치' } : null);
  if (!o) return null;
  return [o, ...t.stops, t.dest];
}

function renderPlan() {
  const t = S.trip;
  if (!t) return;
  const box = $('#plan');
  const row = (cls, dot, label, value, onClick, extra) => h('div', { class: 'plan__row' },
    h('span', { class: 'plan__dot ' + cls }, dot),
    h('button', { class: 'plan__field', type: 'button', onclick: onClick }, h('small', { text: label }), value),
    extra || null);
  // 이동 방법(차량·도보)은 제목 줄에 작게 — 화면을 한 줄 더 차지하지 않도록
  const modes = h('div', { class: 'modes', role: 'group', 'aria-label': '이동 방법' },
    ...[['car', 'car', '차량'], ['walk', 'walk', '도보']].map(([k, icon, label]) => h('button', { type: 'button', id: 'mode-' + k, 'aria-pressed': (t.mode || 'car') === k ? 'true' : 'false',
      onclick: () => { if ((t.mode || 'car') === k) return; t.mode = k; t.pref = k === 'walk' ? 'fast' : store.settings.pref; renderPlan(); computeRoutes(); } }, h('span', { svg: ic(icon, 16) }), label)));
  const rows = [
    h('div', { class: 'plan__row' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '뒤로', svg: ic('back', 22), onclick: cancelTrip }),
      h('div', { style: 'flex:1;min-width:0;font-weight:800;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', text: '경로 설정' }),
      modes,
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '출발지와 도착지 바꾸기', svg: ic('swap', 22), onclick: swapTrip })),
    row('', h('i'), '출발', t.origin ? t.origin.name : '현재 위치', () => beginPick('origin'),
      t.origin ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': '출발지를 현재 위치로', svg: ic('locate', 20), onclick: () => { t.origin = null; renderPlan(); computeRoutes(); } }) : null),
    ...t.stops.map((s, i) => row('', h('b', { text: String(i + 1) }), '경유', s.name, () => openPlace(s),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '경유지 빼기', svg: ic('close', 20), onclick: () => { t.stops.splice(i, 1); renderPlan(); computeRoutes(); } }))),
    row('plan__dot--dest', h('i'), '도착', t.dest.label || t.dest.name, () => beginPick('dest')),
  ];
  if (t.follow) {
    // 기록한 길로: 이동 방법·경유지·경로 옵션 대신 ‘기록한 길’ 줄과 보통 길로 바꾸는 단추
    rows[0].replaceChildren(rows[0].firstChild,
      h('div', { style: 'flex:1;min-width:0;font-weight:800;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', text: '기록한 길로 안내' }));
    const bar = h('div', { class: 'followbar' },
      h('span', { svg: ic('route', 18) }),
      h('span', { class: 'followbar__txt', text: t.follow.failed ? '기록한 길을 찾지 못했습니다' : (t.follow.name || '기록한 길') }),
      t.follow.failed ? h('button', { class: 'btn btn--sm', type: 'button', id: 'btnFollowRetry', onclick: () => { t.follow.failed = false; renderPlan(); computeRoutes(); } }, '다시 시도') : null,
      h('button', { class: 'btn btn--sm btn--ghost', type: 'button', id: 'btnFollowOff', onclick: () => { t.follow = null; t.pref = t.mode === 'walk' ? 'fast' : store.settings.pref; renderPlan(); computeRoutes(); } }, '보통 길로 찾기'));
    box.replaceChildren(...rows, bar);
    requestAnimationFrame(measure);
    return;
  }
  const tools = h('div', { class: 'plan__tools' },
    t.stops.length < 3 ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', onclick: () => beginPick('stop') }, h('span', { svg: ic('plus', 16) }), '경유지 추가') : null);
  const prefs = h('div', { class: 'prefs', role: 'group', 'aria-label': '경로 옵션' },
    ...Object.entries(prefsOf(t.mode)).map(([k, label]) => h('button', { type: 'button', 'aria-pressed': t.pref === k ? 'true' : 'false', text: label, onclick: () => { t.pref = k; renderPlan(); computeRoutes(); } })));
  box.replaceChildren(...rows, tools, prefs);
  requestAnimationFrame(measure);
}

function swapTrip() {
  const t = S.trip;
  const curOrigin = t.origin || (S.me ? { name: '현재 위치', lat: S.me.lat, lon: S.me.lon } : null);
  if (!curOrigin) { toast('현재 위치를 아직 찾지 못해 바꿀 수 없습니다'); return; }
  const newOrigin = t.dest;
  t.dest = curOrigin;
  t.origin = newOrigin;
  t.stops.reverse();
  renderPlan();
  computeRoutes();
}

async function computeRoutes() {
  const t = S.trip;
  if (!t) return;
  if (S.routeCtl) S.routeCtl.abort();
  const pts = tripPoints();
  MV.setTripMarks(t.origin, t.stops, t.dest);
  if (!pts) {
    t.loading = false; t.routes = [];
    t.err = GPS_BAD.includes(S.gps) ? gpsMsg('long') + ' 지금은 ‘출발’을 눌러 출발지를 직접 고르면 경로를 볼 수 있습니다.' : '현재 위치를 찾는 중입니다. 잠시 뒤 다시 시도하거나 ‘출발’을 눌러 출발지를 직접 고르세요.';
    MV.clearRoutes();
    renderSheet();
    MV.fit([[t.dest.lon, t.dest.lat]]);
    return;
  }
  if (hav([pts[0].lon, pts[0].lat], [t.dest.lon, t.dest.lat]) < 30 && !t.stops.length) {
    t.loading = false; t.routes = []; t.err = '출발지와 도착지가 너무 가깝습니다.';
    renderSheet(); return;
  }
  const ctl = S.routeCtl = new AbortController();
  t.loading = true; t.err = ''; t.warn = ''; t.routes = [];
  MV.clearRoutes();
  renderSheet();
  MV.fit(pts.map(p => [p.lon, p.lat]));
  const walk = t.mode === 'walk';
  const heading = !walk && !t.origin && S.me && Date.now() - S.me.t < 10000 && S.me.speed > 2 && S.me.heading != null ? S.me.heading : null;
  if (t.follow && !t.follow.failed && await computeFollow(t, pts, heading, ctl)) return;
  if (ctl.signal.aborted || S.trip !== t) return;
  const followWarn = t.warn;
  try {
    const r = await findRoutes(pts, { pref: t.pref, mode: t.mode || 'car', heading, engine: store.settings.engine, signal: ctl.signal });
    if (ctl.signal.aborted || S.trip !== t) return;
    let all = r.routes;
    // '추천'일 때는 운전하기 쉬운 길도 따로 찾아 함께 비교(차량, Valhalla 만)
    if (!walk && t.pref === 'fast' && store.settings.easyPrefer && r.engine === 'valhalla') {
      // 빠른 길에 유료도로·페리가 없으면 쉬운 길도 그것 없이 찾는다(통행료 내며 돌아가는 길이 '쉬운 길'로 나오지 않게)
      const f0 = all.reduce((a, b) => (personalize(b).dur < personalize(a).dur ? b : a));
      const costing = {};
      if (!f0.hasToll) costing.use_tolls = 0;
      if (!f0.hasFerry) costing.use_ferry = 0;
      try {
        const e = await findRoutes(pts, { pref: 'easy', heading, engine: 'valhalla', noFallback: true, signal: ctl.signal, costing });
        e.routes.forEach(x => { x.easyReq = true; });
        all = all.concat(e.routes);
      } catch (err) { if (ctl.signal.aborted) return; }
      if (S.trip !== t) return;
    }
    const ranked = rankRoutes(all, { pref: t.pref, easyPrefer: !walk && store.settings.easyPrefer, easyMin: store.settings.easyMin });
    t.routes = ranked.routes; t.info = ranked.info; t.sel = 0; t.warn = [followWarn, r.warn].filter(Boolean).join(' '); t.engine = r.engine;
    if (walk) t.routes.forEach(x => { x.tags = (x.tags || []).filter(k => k !== 'easy'); });
    else attachCams(t.routes);
  } catch (e) {
    if (ctl.signal.aborted || S.trip !== t) return;
    t.err = e.noPath ? `이 조건으로 ${walk ? '걸어서 ' : ''}갈 수 있는 길을 찾지 못했습니다. 경로 옵션을 바꾸거나 출발·도착 위치를 ${walk ? '길' : '도로'} 가까이로 옮겨 보세요.` : '경로 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도하세요.';
  }
  t.loading = false;
  if (S.screen === 'preview') renderSheet();
  if (t.routes.length) {
    MV.setRoutes(t.routes, t.sel);
    MV.setCams(walk ? [] : t.routes[t.sel].cams);
    MV.fit(t.routes.flatMap(r => [r.coords[0], ...r.coords.filter((_, i) => i % 20 === 0), r.coords[r.coords.length - 1]]));
  }
}

function fuelCost(m) { return m / 1000 / Math.max(1, store.settings.fuelEff) * store.settings.fuelPrice; }

// 도보 경로 카드 한 줄: 회전 수와 계단·엘리베이터
function walkLine(r) {
  const n = k => r.steps.filter(s => s.kind === k).length;
  const turns = r.steps.filter(s => ['turn', 'uturn', 'roundabout', 'fork'].includes(s.kind)).length;
  return [`회전 ${turns}번`, n('steps') ? `계단 ${n('steps')}곳` : '', n('elevator') ? `엘리베이터 ${n('elevator')}곳` : '', n('escalator') ? `에스컬레이터 ${n('escalator')}곳` : ''].filter(Boolean).join(' · ');
}

function previewSheet() {
  const t = S.trip;
  if (!t) return [];
  const out = [];
  const walk = t.mode === 'walk';
  if (t.loading) out.push(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), walk ? `도보 ${t.pref === 'fast' ? '' : prefLabel('walk', t.pref) + ' '}경로를 찾는 중…` : `${prefLabel('car', t.pref)} 경로를 찾는 중…`));
  if (t.err) out.push(h('p', { class: 'empty', text: t.err }), h('button', { class: 'btn', type: 'button', onclick: computeRoutes, text: '다시 찾기' }));
  if (t.routes.length) {
    const ef = etaFactor();
    const info = t.info;
    // 추천 이유 한 줄
    const line = recLine(info);
    if (line) out.push(h('p', { class: 'recline', text: line }));
    const list = h('div', { class: 'routes', role: 'radiogroup', 'aria-label': '경로 후보' });
    t.routes.forEach((r, i) => {
      const dur = r.p ? r.p.dur : r.duration * (walk ? 1 : ef.k);
      const tags = [];
      const TAG = { rec: ['tag--rec', '추천'], fast: ['tag--fast', '가장 빠름'], easy: ['tag--easy', '운전 쉬움'], follow: ['tag--follow', '기록한 길'] };
      (r.tags || []).forEach(k => tags.push(h('span', { class: 'tag ' + TAG[k][0], text: TAG[k][1] })));
      if (r.p && r.p.learnedShare >= 0.2) tags.push(h('span', { class: 'tag tag--me', text: '내 기록 반영' }));
      if (r.hasToll) tags.push(h('span', { class: 'tag tag--toll', text: '유료도로' }));
      if (r.hasHwy) tags.push(h('span', { class: 'tag tag--hwy', text: '고속도로' }));
      if (r.hasFerry) tags.push(h('span', { class: 'tag', text: '페리' }));
      list.append(h('button', { class: 'rcard', type: 'button', role: 'radio', 'aria-pressed': i === t.sel ? 'true' : 'false', 'aria-checked': i === t.sel ? 'true' : 'false',
        onclick: () => selectRoute(i) },
        h('span', { class: 'rcard__radio' }),
        h('span', { class: 'rcard__time num', text: fmtDur(dur) }),
        h('span', { class: 'rcard__eta num', text: fmtClock(Date.now() + dur * 1000) + ' 도착' }),
        h('span', { class: 'rcard__info num' }, fmtDistStr(r.distance),
          walk ? h('span', { text: `· 약 ${Math.round(r.distance / 0.7).toLocaleString('ko-KR')}걸음` })
            : store.settings.showFuel ? h('span', { text: '· 유류비 약 ' + fmtWon(fuelCost(r.distance)) }) : null),
        walk ? h('span', { class: 'rcard__ease num', text: walkLine(r) })
          : r.ease ? h('span', { class: 'rcard__ease num', text: `회전 ${r.ease.turns}번${r.ease.left + r.ease.uturn ? ` (좌회전·유턴 ${r.ease.left + r.ease.uturn})` : ''} · 큰길 ${Math.round((1 - r.ease.smallShare) * 100)}%${r.cams ? ` · 단속 카메라 ${camCount(r.cams)}곳` : ''}` }) : null,
        tags.length ? h('span', { class: 'rcard__tags' }, ...tags) : null,
        r.roads.length ? h('span', { class: 'rcard__via', text: r.roads.join(' · ') + ' 경유' }) : null,
        r.follow ? h('span', { class: 'rcard__follow num', text: r.follow.share >= 0.97 ? '기록한 길 그대로' : `기록한 길의 ${Math.round(r.follow.share * 100)}%를 그대로 지남` }) : null));
    });
    out.push(list);
    const notes = [];
    const nRoads = Object.keys(store.roads).length;
    const fr = t.routes.find(x => x.follow);
    if (fr) notes.push(`기록한 길 위 ${fr.follow.vias}곳을 지나도록 찾았습니다${fr.follow.join > 300 ? `(지금 위치에서 기록한 길까지 ${fmtDistStr(fr.follow.join)})` : ''}. 공사·통제로 길이 바뀐 곳은 다르게 나올 수 있고, 안내 중 벗어나면 기록한 길로 되돌아가게 다시 찾습니다.`);
    if (fr && fr.follow.share < 0.8) out.push(h('p', { class: 'warnline', text: '기록한 길과 다른 곳이 있습니다. 지도에 회색으로 보이는 것이 기록한 길입니다.' }));
    if (walk) notes.push(`걷는 시간은 시속 ${WALK_KMH}km로 계산했습니다. 보도·횡단보도 자료가 없는 곳은 차도 옆으로 안내할 수 있으니 실제 길을 보며 걸으세요.`);
    else if (ef.n || nRoads) notes.push(`도착 시간은 내 주행 기록으로 보정했습니다${ef.n ? `(전체 ×${ef.k.toFixed(2)}, ${ef.n}회${ef.band ? ', ' + BAND_KO[ef.band] : ''})` : ''}${nRoads ? ` · 도로별 학습 ${nRoads}건` : ''}.`);
    else notes.push('실시간 교통 정보가 없는 무료 지도라, 막히는 시간에는 실제보다 짧게 나올 수 있습니다. 안내를 받으며 달린 도로는 시간대별 실제 속도를 배워 다음부터 경로 선택과 도착 시간에 반영합니다.');
    if (t.warn) out.push(h('p', { class: 'warnline', text: t.warn }));
    out.push(h('div', { class: 'go' },
      h('button', { class: 'btn', type: 'button', onclick: () => startNav(true) }, h('span', { svg: ic('play', 18, true) }), walk ? '모의 걷기' : '모의 주행'),
      h('button', { class: 'btn btn--primary', type: 'button', id: 'btnStart', onclick: () => startNav(false) }, h('span', { svg: ic('nav', 20, true) }), '안내 시작')));
    out.push(h('p', { class: 'note', text: notes.join(' ') + ` 경로: ${ROUTE_ENGINES[t.engine] ? ROUTE_ENGINES[t.engine].label : ''}(FOSSGIS) · OpenStreetMap` }));
  }
  return out;
}

// 경로마다 그 위에 있는 단속 카메라를 붙여 둔다(카메라 자료를 아직 못 받았으면 건너뜀)
function attachCams(routes) {
  if (!CamDB.ready) return;
  for (const r of routes) r.cams = camsForRoute(r, { signal: store.settings.camSignal });
}
const camCount = cams => cams.filter(c => c.t !== 6).length;

function selectRoute(i) {
  const t = S.trip;
  if (!t || !t.routes[i]) return;
  t.sel = i;
  if (t.follow) MV.setRoutes(t.routes.concat([{ coords: t.follow.track }]), i);
  else MV.setRoutes(t.routes, i);
  MV.setCams(t.routes[i].cams);
  $$('.rcard').forEach((b, k) => { b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); b.setAttribute('aria-checked', k === i ? 'true' : 'false'); });
}
