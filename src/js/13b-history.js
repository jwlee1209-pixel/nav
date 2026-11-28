// ───────────────────────── 주행 기록 · 즐겨찾는 경로 ─────────────────────────
// 실제 안내를 받은 주행마다 지나간 길을 남긴다(경로에 맞춘 점, 10 m 마다 → 끝날 때 4 m 허용으로 줄임).
// 기록을 누르면 지도에 그 길을 보여 주고, ‘이 경로로 안내’는 그 길을 따라가는 경로(findRoutesAlong)로 안내한다.
// 마음에 드는 길은 ‘즐겨찾는 경로’로 이름을 붙여 두고 첫 화면에서 바로 고른다.

// 출발지 이름: 저장한 곳(집·회사·즐겨찾기 250 m, 최근 목적지 150 m 안)이면 그 이름, 아니면 나중에 주소로
function originOf(p) {
  if (!p || !isFinite(+p.lat)) return { name: '', lat: 0, lon: 0 };
  const at = [+p.lon, +p.lat];
  const near = (q, r) => q && hav(at, [q.lon, q.lat]) <= r;
  let name = '';
  if (near(store.home, 250)) name = '집';
  else if (near(store.work, 250)) name = '회사';
  else {
    const f = store.favs.find(x => near(x, 250)) || store.recents.find(x => near(x, 150));
    if (f) name = f.name;
  }
  return { name, lat: +(+p.lat).toFixed(6), lon: +(+p.lon).toFixed(6) };
}
async function nameOrigin(from) {
  try {
    const r = await reversePlace(from.lon, from.lat);
    if (r && r.name && r.name !== '선택한 위치' && !from.name) from.name = r.name;
  } catch (e) { /* 이름 없이(‘출발지’) */ }
}

// 안내 중 위치마다: 지나간 길(경로 위면 경로에 맞춘 점, 벗어났으면 정확한 GPS 점만)과 기록한 길의 진행 위치
function recordFix(n, st, fix) {
  const rec = n.rec;
  if (rec && (st.on || (fix.acc || 99) <= 40)) {
    const p = st.on ? st.p : [fix.lon, fix.lat];
    const last = rec.pts[rec.pts.length - 1];
    if (!last || hav(last, p) >= 10) {
      rec.pts.push([+p[0].toFixed(6), +p[1].toFixed(6)]);
      if (rec.pts.length > 6000) rec.pts = simplifyLine(rec.pts, 4);   // 아주 긴 주행: 중간에 한 번 줄인다
    }
  }
  const fl = n.follow;
  if (fl && ++fl.n % 5 === 0) {
    const r = nearestOnLine(fl.track, [fix.lon, fix.lat], fl.idx, Math.min(fl.track.length - 1, fl.idx + 200));
    if (r.d < 60) fl.idx = r.i;
  }
}

// ── 글자 ──
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function dayLabel(ts) {
  const d = new Date(ts), t = new Date();
  const k = x => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (k(d) === k(t)) return '오늘';
  if (k(d) === k(y)) return '어제';
  return `${d.getFullYear() !== t.getFullYear() ? d.getFullYear() + '년 ' : ''}${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}
const clock = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const fromName = t => (t.from && t.from.name) || '출발지';
const tripTitle = t => `${fromName(t)} → ${(t.dest && t.dest.name) || '도착지'}`;
const tripLen = t => t.len || t.dist || 0;
function tripLine(t, withTime = true) {
  return [withTime ? clock(t.ts) : '', fmtDistStr(tripLen(t)), fmtDur(t.act), (t.roads || []).slice(0, 2).join('·'), t.arrived ? '' : '중간에 끝냄'].filter(Boolean).join(' · ');
}
const favOfTrip = t => store.froutes.find(r => r.tripId && r.tripId === t.id);

// ── 첫 화면 ‘주행 기록’ 탭 ──
function tripsTab() {
  const list = h('ul', { class: 'list', id: 'tripList' });
  const trips = store.trips.filter(t => !t.sim).slice(-120).reverse();
  if (!trips.length) {
    list.append(h('li', { class: 'empty', text: '실제 길 안내를 받으면 주행 기록이 여기에 쌓입니다. 기록을 누르면 그 길로 다시 안내받거나 즐겨찾는 경로로 저장할 수 있습니다.' }));
    return [list];
  }
  let day = '';
  for (const t of trips) {
    const dl = dayLabel(t.ts);
    if (dl !== day) { day = dl; list.append(h('li', { class: 'dayhead', role: 'presentation', text: dl })); }
    const fav = favOfTrip(t);
    list.append(h('li', { class: 'item item--trip', tabindex: '0', role: 'button', dataset: { id: t.id || '' }, onclick: () => openTripView(t), onkeydown: e => { if (e.key === 'Enter') openTripView(t); } },
      h('span', { class: 'item__ic item__ic--trip', svg: ic(t.mode === 'walk' ? 'walk' : 'route', 20) }),
      h('span', { class: 'item__txt' },
        h('div', { class: 'item__name', text: tripTitle(t) }),
        h('div', { class: 'item__addr num', text: tripLine(t) })),
      fav ? h('span', { class: 'item__star', title: '즐겨찾는 경로', svg: ic('star', 17, true) }) : null));
  }
  return [list, h('p', { class: 'note', text: `실제 안내만 남습니다(모의 주행 제외). 지나간 길은 최근 ${TRACK_MAX}번까지 저장합니다.` })];
}

// ── 즐겨찾기 탭 맨 위 ‘즐겨찾는 경로’ ──
function froutesSection() {
  if (!store.froutes.length) return [];
  const list = h('ul', { class: 'list list--froutes' });
  for (const r of store.froutes) {
    list.append(h('li', { class: 'item item--froute', tabindex: '0', role: 'button', onclick: () => followFav(r), onkeydown: e => { if (e.key === 'Enter') followFav(r); } },
      h('span', { class: 'item__ic item__ic--froute', svg: ic('route', 20) }),
      h('span', { class: 'item__txt' },
        h('div', { class: 'item__name', text: r.name }),
        h('div', { class: 'item__addr num', text: [`${r.from.name || '출발지'} → ${r.dest.name || '도착지'}`, fmtDistStr(r.len), r.roads.slice(0, 2).join('·'), r.memo].filter(Boolean).join(' · ') })),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': `${r.name} 이름·메모 고치기`, svg: ic('edit', 18), onclick: e => { e.stopPropagation(); editFav(r); } })));
  }
  return [h('div', { class: 'sec-sub', text: '즐겨찾는 경로' }), list, h('div', { class: 'sec-sub', text: '즐겨찾는 장소' })];
}

// ── 기록 한 건 보기(지도에 지나간 길) ──
function openTripView(t) {
  S.tripView = t;
  go('trip');
  drawTripView();
}
function drawTripView() {
  const t = S.tripView;
  if (!t) return;
  const trk = tripTrack(t);
  MV.setPlaceMark(null);
  MV.follow = false;
  if (trk) {
    MV.setRoutes([{ coords: trk }], 0);
    MV.setTripMarks(t.from && t.from.lat ? t.from : { lat: trk[0][1], lon: trk[0][0], name: fromName(t) }, [], t.dest);
    MV.fit(trk.filter((_, i) => i % 4 === 0).concat([trk[trk.length - 1]]));
  } else {
    MV.clearRoutes();
    MV.setTripMarks(t.from && t.from.lat ? t.from : null, [], t.dest);
    MV.fit([t.from && t.from.lat ? [t.from.lon, t.from.lat] : null, [t.dest.lon, t.dest.lat]].filter(Boolean));
  }
}
function tripSheet() {
  const t = S.tripView;
  if (!t) return [];
  const trk = hasTrack(t);
  const fav = favOfTrip(t);
  const d = new Date(t.ts);
  const out = [
    h('div', { class: 'trip__when num', text: `${dayLabel(t.ts)}${dayLabel(t.ts).includes('월') ? '' : ` ${d.getMonth() + 1}월 ${d.getDate()}일`} ${clock(t.ts)} 출발 · ${clock(t.end || t.ts + t.act * 1000)} ${t.arrived ? '도착' : '끝냄'}` }),
    h('div', { class: 'place__name', text: tripTitle(t) }),
    h('div', { class: 'place__meta num', text: [fmtDistStr(tripLen(t)), `${fmtDur(t.act)} 걸림`, t.mode === 'walk' ? '도보' : '', t.rr ? `경로 다시 찾음 ${t.rr}번` : ''].filter(Boolean).join(' · ') }),
    t.roads && t.roads.length ? h('div', { class: 'trip__roads', text: t.roads.join(' → ') + ' 지남' }) : null,
  ];
  const acts = h('div', { class: 'place__acts' });
  if (trk) {
    acts.append(h('button', { class: 'btn btn--primary', type: 'button', id: 'btnFollowTrip', onclick: () => followTrip(t) }, h('span', { svg: ic('nav', 20, true) }), '이 경로로 안내'));
    acts.append(h('button', { class: 'btn', type: 'button', id: 'btnFavTrip', 'aria-pressed': fav ? 'true' : 'false', onclick: () => (fav ? editFav(fav) : saveFavRoute(t)) },
      h('span', { svg: ic('star', 20, !!fav) }), fav ? '즐겨찾는 경로' : '즐겨찾는 경로로 등록'));
  } else {
    out.push(h('p', { class: 'warnline', text: '이 기록에는 지나간 길이 없습니다(이전 판에서 기록했거나 아주 짧은 주행). 도착지까지 보통 길로 찾을 수 있습니다.' }));
    acts.append(h('button', { class: 'btn btn--primary', type: 'button', onclick: () => startTrip({ ...t.dest }) }, h('span', { svg: ic('nav', 20, true) }), '도착지로 길 찾기'));
  }
  out.push(acts);
  out.push(h('div', { class: 'place__more' },
    h('button', { class: 'btn btn--sm btn--ghost', type: 'button', id: 'btnDelTrip', onclick: () => deleteTrip(t) }, h('span', { svg: ic('trash', 16) }), '이 기록 지우기')));
  return out.filter(Boolean);
}
async function deleteTrip(t) {
  if (!await ask(`${dayLabel(t.ts)} ${clock(t.ts)} ${tripTitle(t)} 기록을 지울까요? 즐겨찾는 경로로 저장한 것은 남습니다.`, { ok: '지우기', danger: true })) return;
  store.trips = store.trips.filter(x => x !== t);
  if (t.id) dropTrack(t.id);
  saveStore(true);
  S.tripView = null;
  S.homeTab = 'trips';
  MV.clearRoutes(); MV.setTripMarks(null, [], null);
  go('home');
  toast('주행 기록을 지웠습니다');
}

// ── 즐겨찾는 경로 ──
function saveFavRoute(t) {
  const trk = tripTrack(t);
  if (!trk) return;
  const def = t.roads && t.roads.length ? `${t.dest.name} (${t.roads[0]})` : `${fromName(t)} → ${t.dest.name}`;
  placeForm({
    title: '즐겨찾는 경로로 등록', name: def.slice(0, 40), okText: '등록', namePh: '이름(예: 출근길, 올림픽대로로 집)', memoPh: '메모(선택) — 예: 아침 8시 전에',
    onSave: ({ name, memo }) => {
      const r = cleanRoute({ name: name || def, memo, from: t.from, dest: t.dest, track: encodePolyline(trk, 5), len: tripLen(t), roads: t.roads || [], mode: t.mode, tripId: t.id });
      if (!r) return false;
      store.froutes = [r, ...store.froutes].slice(0, 30);
      saveStore(true);
      toast(`‘${r.name}’${josa(r.name, '을/를').slice(r.name.length)} 즐겨찾는 경로로 등록했습니다`, 3200);
      if (S.screen === 'trip') renderSheet();
      if (S.screen === 'home') { renderChips(); renderSheet(); }
    },
  }).info(`${tripTitle(t)} · ${fmtDistStr(tripLen(t))}${t.roads && t.roads.length ? ' · ' + t.roads.slice(0, 3).join('·') : ''}`);
}
function editFav(r) {
  placeForm({
    title: '즐겨찾는 경로', name: r.name, memo: r.memo || '', namePh: '이름(예: 출근길)', memoPh: '메모(선택)',
    onSave: ({ name, memo }) => {
      r.name = name || r.name;
      if (memo) r.memo = memo.slice(0, 120); else delete r.memo;
      saveStore(true);
      toast('고쳤습니다');
      if (S.screen === 'home') { renderChips(); renderSheet(); }
      if (S.screen === 'trip') renderSheet();
    },
    onDelete: async () => {
      if (!await ask(`즐겨찾는 경로 ‘${r.name}’${josa(r.name, '을/를').slice(r.name.length)} 지울까요?`, { ok: '지우기', danger: true })) return;
      store.froutes = store.froutes.filter(x => x !== r);
      saveStore(true);
      toast('즐겨찾는 경로를 지웠습니다');
      if (S.screen === 'home') { renderChips(); renderSheet(); }
      if (S.screen === 'trip') renderSheet();
    },
  }).info(`${r.from.name || '출발지'} → ${r.dest.name || '도착지'} · ${fmtDistStr(r.len)}`);
}

// ── 기록한 길로 안내(경로 미리보기 → 안내 시작) ──
function startFollow({ track, dest, name, mode = 'car', favId = null, tripId = null, from = null }) {
  if (S.nav) return;
  const d = cleanPlace({ name: dest.name || '도착지', addr: dest.addr || '', lat: dest.lat, lon: dest.lon });
  if (!d || !track || track.length < 2) return;
  S.tripView = null;
  S.trip = { origin: null, stops: [], dest: d, mode, pref: 'fast', routes: [], sel: 0, loading: false, err: '', warn: '',
    follow: { track, name, favId, tripId, from } };
  S.pick = null; S.results = null;
  go('preview');
  computeRoutes();
}
function followTrip(t) {
  const trk = tripTrack(t);
  if (!trk) return;
  startFollow({ track: trk, dest: t.dest, name: tripTitle(t), mode: t.mode === 'walk' ? 'walk' : 'car', tripId: t.id, from: t.from });
}
function followFav(r) {
  startFollow({ track: routeTrack(r), dest: r.dest, name: r.name, mode: r.mode, favId: r.id, from: r.from });
}

// 경로 미리보기: 기록한 길을 따라가는 경로를 찾고, 비교용으로 보통 길(가장 빠른 길)도 하나
async function computeFollow(t, pts, heading, ctl) {
  const walk = t.mode === 'walk';
  try {
    const r = await findRoutesAlong(t.follow.track, { start: pts[0], dest: t.dest, mode: t.mode, heading, signal: ctl.signal });
    if (ctl.signal.aborted || S.trip !== t) return true;
    const fr = r.routes[0];
    fr.tags = ['follow'];
    fr.p = personalize(fr);
    t.routes = [fr]; t.info = null; t.sel = 0; t.engine = 'valhalla'; t.warn = '';
    if (!walk) attachCams(t.routes);
  } catch (e) {
    if (ctl.signal.aborted || S.trip !== t) return true;
    if (e.message === 'track-done') { t.follow = null; t.warn = '기록한 길의 끝에 와 있어 보통 길로 찾았습니다.'; return false; }
    t.follow.failed = true;
    t.warn = e.noPath || e.status === 400 ? '기록한 길을 따라가는 경로를 찾지 못해 보통 길을 보여 줍니다.' : '경로 서버가 응답하지 않아 기록한 길 대신 보통 길을 보여 줍니다.';
    if (S.screen === 'preview') renderPlan();
    return false;     // 보통 경로 찾기로 넘어간다
  }
  t.loading = false;
  if (S.screen === 'preview') { renderSheet(); renderPlan(); }
  drawFollow(t);
  // 보통 길: 기록한 길보다 3분 넘게 빠르거나 1 km 넘게 짧으면 함께 보여 준다
  try {
    const n = await findRoutes(pts, { pref: 'fast', mode: t.mode, heading, engine: store.settings.engine, signal: ctl.signal });
    if (ctl.signal.aborted || S.trip !== t || !t.routes.length) return true;
    const f = t.routes[0], best = n.routes.reduce((a, b) => (personalize(b).dur < personalize(a).dur ? b : a));
    best.p = personalize(best);
    if (best.p.dur < f.p.dur - 180 || best.distance < f.distance - 1000) {
      best.tags = ['fast'];
      if (!walk) attachCams([best]);
      t.routes = [f, best];
      if (S.screen === 'preview') renderSheet();
      drawFollow(t);
    }
  } catch (e) { /* 비교 경로 없이 */ }
  return true;
}
// 지도: 고른 경로 + 기록한 길(얇게, 비교용)
function drawFollow(t) {
  if (!t.routes.length) return;
  MV.setRoutes(t.routes.concat(t.follow ? [{ coords: t.follow.track, ghost: true }] : []), t.sel);
  MV.setCams(t.mode === 'walk' ? [] : t.routes[t.sel].cams);
  const r = t.routes[t.sel];
  MV.fit([r.coords[0], ...r.coords.filter((_, i) => i % 20 === 0), r.coords[r.coords.length - 1]]);
}
