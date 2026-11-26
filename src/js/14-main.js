// ───────────────────────── 시작 ─────────────────────────
function bindUI() {
  $('#qGo').innerHTML = ic('search', 22);
  $('#qClear').innerHTML = ic('close', 22);
  $('#btnSettings').innerHTML = ic('gear', 24);
  $('#btnLocate').innerHTML = ic('locate', 24);
  $('#btnNorth').innerHTML = ic('north', 22, true);
  $('#btnRecenter').replaceChildren(h('span', { svg: ic('nav', 20, true) }), '현위치로');
  $('#gOverview').innerHTML = ic('overview', 24);
  $('#grip').onclick = () => setSheetSize($('#sheet').dataset.size === 'full' ? 'peek' : 'full');

  const q = $('#q');
  q.addEventListener('focus', () => { if (S.screen === 'home' || S.screen === 'place') { S.results = null; go('search'); } });
  q.addEventListener('input', () => { if (S.screen !== 'search') go('search'); else if (!S.searching) { if (S.results && q.value.trim() !== S.lastQuery) S.results = null; renderSheet(); } });
  q.addEventListener('keydown', e => { if (e.key === 'Escape') back(); });
  $('#searchForm').addEventListener('submit', e => { e.preventDefault(); setTimeout(doSearch, 0); });
  $('#qClear').onclick = () => { S.results = null; back(); };
  $('#btnSettings').onclick = openSettings;

  $('#btnLocate').onclick = () => {
    if (!S.me) { toast(gpsMsg('long') || '현재 위치를 찾는 중입니다…', 4500); if (S.gps === 'idle') GPS.start(); return; }
    S.followHome = true; MV.follow = true;
    MV.map.easeTo({ center: [S.me.lon, S.me.lat], zoom: Math.max(MV.map.getZoom(), 16), bearing: 0, pitch: 0, duration: 600 });
    $('#btnLocate').setAttribute('aria-pressed', 'true');
  };
  $('#btnNorth').onclick = () => MV.map.easeTo({ bearing: 0, pitch: 0, duration: 400 });
  MV.map.on('rotate', () => { $('#btnNorth').hidden = S.screen === 'guide' || Math.abs(MV.map.getBearing()) < 1; });

  // 안내 중 조작
  let recenterT = 0;
  MV.onUserMove = () => {
    if (S.screen === 'guide') {
      MV.follow = false; $('#btnRecenter').hidden = false;
      clearTimeout(recenterT);
      recenterT = setTimeout(() => { if (S.nav) { MV.follow = true; MV.padDirty = true; $('#btnRecenter').hidden = true; } }, 12000);
    } else { MV.follow = false; S.followHome = false; $('#btnLocate').setAttribute('aria-pressed', 'false'); }
  };
  $('#btnRecenter').onclick = () => { MV.follow = true; MV.padDirty = true; $('#btnRecenter').hidden = true; };
  $('#gOverview').onclick = () => {
    const n = S.nav; if (!n) return;
    MV.follow = false; $('#btnRecenter').hidden = false;
    const st = n.lastSt;
    const rest = st ? sliceLine(n.route.coords, n.route.cum, st.d, n.route.cum[n.route.cum.length - 1]) : n.route.coords;
    MV.fit(rest.filter((_, i) => i % 5 === 0).concat([rest[rest.length - 1]]), { padding: innerWidth >= 760 ? { top: 60, bottom: 60, left: 450, right: 60 } : { top: ($('#mpanel').offsetHeight || 120) + 30, bottom: ($('#gbar').offsetHeight || 90) + 30, left: 40, right: 40 } });
    clearTimeout(recenterT);
    recenterT = setTimeout(() => { if (S.nav) { MV.follow = true; MV.padDirty = true; $('#btnRecenter').hidden = true; } }, 12000);
  };
  $('#gVoice').onclick = () => {
    const v = !store.settings.voice; setS('voice', v);
    if (!v) Voice.stop(); else Voice.unlock();
    $('#gVoice').setAttribute('aria-pressed', v ? 'true' : 'false');
    $('#gVoice').innerHTML = ic(v ? 'vol' : 'mute', 24);
    toast(v ? '음성 안내를 켰습니다' : '음성 안내를 껐습니다');
  };
  $('#gEnd').onclick = async () => { if (await ask('길 안내를 끝낼까요?', { ok: '안내 종료', danger: true })) finishNav(false); };

  // 지도 길게 누르기 / 오른쪽 클릭 → 그 위치 장소 카드
  MV.onLongPress = async ll => {
    if (S.screen === 'guide') return;
    const p0 = { name: '선택한 위치', addr: '주소를 찾는 중…', lat: ll.lat, lon: ll.lng, cat: '' };
    openPlace(p0);
    try {
      const p = await reversePlace(ll.lng, ll.lat);
      if (S.place === p0) { S.place = { ...p, name: p.name || '선택한 위치' }; renderSheet(); }
    } catch (e) { /* 이름 없이 둔다 */ }
  };
  MV.onRouteClick = idx => { if (S.screen === 'preview' && S.trip) selectRoute(+idx); };
  MV.onHitClick = i => { if (S.results && S.results.items[i]) openPlace(S.results.items[i]); };
  MV.onPtClick = pr => { if (S.screen === 'guide') return; openPlace({ name: pr.pname, label: pr.kind === 'home' ? '집' : pr.kind === 'work' ? '회사' : '', addr: pr.addr, lat: +pr.lat, lon: +pr.lon }); };
  let mapErrShown = false;
  MV.onError = e => {
    const msg = String((e && e.error && (e.error.message || e.error.status)) || '');
    if (!mapErrShown && (e.sourceId === 'omt' || /openfreemap|Failed to fetch|NetworkError/i.test(msg))) { mapErrShown = true; toast('지도 타일을 불러오지 못했습니다. 인터넷 연결을 확인하세요.', 4000); }
  };

  // 캡션: 방금 나온 안내 문장(소리를 끈 상태에서도 볼 수 있게)
  let capT = 0;
  Voice.on((k, text) => {
    if (k !== 'say' || S.screen !== 'guide') return;
    const c = $('#caption'); c.textContent = text; c.hidden = false;
    clearTimeout(capT); capT = setTimeout(() => { c.hidden = true; }, 5000);
  });
  addEventListener('resize', () => { measure(); if (S.nav) { MV.pad = guidePad(); MV.padDirty = true; } });
}

function boot() {
  loadStore();
  Voice.init();
  const mode = applyTheme();
  try {
    MV.init($('#map'), mode, store.view);
  } catch (e) {
    $('#boot').textContent = '지도를 표시할 수 없습니다. 이 브라우저에서 WebGL(그래픽 가속)이 꺼져 있는지 확인하세요.';
    return;
  }
  bindUI();
  MV.whenLoaded(refreshPts);
  go('home');
  GPS.start();
  setInterval(() => { if (store.settings.theme === 'auto') applyTheme(); if (S.screen === 'home') renderChips(); }, 60000);
  const bootEl = $('#boot');
  const hide = () => { bootEl.style.opacity = '0'; setTimeout(() => bootEl.remove(), 300); };
  MV.whenLoaded(hide);
  setTimeout(() => { if (document.body.contains(bootEl)) hide(); }, 6000);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { /* 없어도 동작 */ });
  CamDB.load().then(() => {
    if (!CamDB.ready) return;
    if (S.trip && S.trip.routes.length) { attachCams(S.trip.routes); MV.setCams(S.trip.routes[S.trip.sel].cams); if (S.screen === 'preview') renderSheet(); }
    if (S.nav && !S.nav.cams.length) setNavCams(S.nav.route);
  });
  // 예전 버전이 영문으로 저장한 장소 이름·주소를 한글로(한 번만, 지도를 띄운 뒤 천천히)
  setTimeout(() => {
    if (navigator.onLine === false) return;
    fixSavedNames().then(n => {
      if (!n) return;
      refreshPts();
      if (S.screen === 'home') { renderSheet(); renderChips(); }
      toast('저장된 장소 이름·주소를 한글로 바꿨습니다');
    }).catch(() => { /* 다음에 다시 */ });
  }, 4000);
  window.__navi = { S, store, MV, Voice, navFix, startTrip, finishNav, applyTheme, openSettings, openPlaces, onPos, reversePlace, searchPlaces };
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
