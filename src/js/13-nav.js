// ───────────────────────── 위치 · 길 안내 진행 · 설정 ─────────────────────────
const GPS = {
  id: null,
  start() {
    if (!('geolocation' in navigator)) { S.gps = 'off'; return; }
    if (window.isSecureContext === false) { S.gps = 'insecure'; return; }
    S.gps = 'wait';
    try {
      this.id = navigator.geolocation.watchPosition(onPos, onPosErr, { enableHighAccuracy: true, maximumAge: 1000, timeout: 25000 });
    } catch (e) { S.gps = 'off'; }
  },
};

function onPos(pos) {
  const c = pos.coords;
  const fix = { lon: c.longitude, lat: c.latitude, acc: c.accuracy || 30, speed: c.speed, heading: c.heading, t: Date.now() };
  const first = !S.me;
  S.me = fix;
  if (S.gps !== 'ok') { S.gps = 'ok'; if (S.screen === 'home') renderSheet(); }
  if (first) { applyTheme(); if (S.screen === 'home') renderChips(); }
  if (S.nav && !S.nav.sim) { navFix(fix); return; }
  if (S.nav) return;
  const moving = fix.speed > 1.5 && fix.heading != null && isFinite(fix.heading);
  MV.moveVeh([fix.lon, fix.lat], moving ? fix.heading : null, { dur: 900, arrow: moving });
  MV.setAccuracy(fix);
  if (first && S.screen === 'home') { S.followHome = true; MV.follow = true; MV.map.easeTo({ center: [fix.lon, fix.lat], zoom: Math.max(MV.map.getZoom(), 15), duration: 900 }); }
  $('#btnLocate').setAttribute('aria-pressed', MV.follow && !MV.guideCam ? 'true' : 'false');
  if (S.trip && !S.trip.origin && !S.trip.routes.length && !S.trip.loading && S.screen === 'preview') computeRoutes();
}
function onPosErr(err) {
  if (err.code === 1) S.gps = isLocalFile() ? 'localfile' : 'denied';
  else if (err.code === 2) S.gps = 'unavail';
  else return;  // 시간 초과: 계속 기다림
  if (S.screen === 'home') renderSheet();
  if (S.screen === 'preview' && S.trip && !S.trip.origin && !S.trip.routes.length) computeRoutes();
  if (S.nav && !S.nav.sim) banner(gpsMsg('short') || 'GPS 신호를 찾는 중…');
}

// ── 주간/야간 ──
function applyTheme() {
  const st = store.settings.theme;
  let mode = st;
  if (st === 'auto') {
    const at = S.me || (MV.map ? { lat: MV.map.getCenter().lat, lon: MV.map.getCenter().lng } : { lat: 37.57, lon: 126.98 });
    S.night = isNightAt(new Date(), at.lat, at.lon, S.night);
    mode = S.night ? 'night' : 'day';
  }
  document.documentElement.dataset.mode = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = mode === 'night' ? '#0F151C' : '#0B5CAD';
  if (MV.map) MV.setTheme(mode);
  return mode;
}

// ── 화면 꺼짐 방지 ──
const Wake = {
  lock: null,
  async on() {
    if (!store.settings.wakeLock || !('wakeLock' in navigator) || this.lock) return;
    try { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } catch (e) { /* 거부되면 무시 */ }
  },
  off() { try { if (this.lock) this.lock.release(); } catch (e) { /* 무시 */ } this.lock = null; },
};
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.nav) Wake.on(); });

// ── 길 안내 시작/진행/종료 ──
// 안내 중에는 전체 화면으로(브라우저 주소창·상태 표시줄을 숨겨 지도를 넓게)
function enterFull() {
  const el = document.documentElement;
  if (!store.settings.fullscreen || document.fullscreenElement || !el.requestFullscreen) return;
  try { el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (e) { /* 지원하지 않으면 그대로 */ }
}
function exitFull() {
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}
document.addEventListener('fullscreenchange', () => setTimeout(() => { measure(); if (S.nav) { MV.pad = guidePad(); MV.padDirty = true; } }, 250));

async function startNav(sim) {
  const t = S.trip;
  if (!t || !t.routes.length) return;
  Voice.unlock();   // 휴대폰은 누른 순간에 음성을 깨워 둬야 한다(아래 확인 창보다 먼저)
  enterFull();      // 전체 화면도 누른 순간에만 허용된다
  if (!sim && t.origin) {
    const ok = await ask('실제 안내는 현재 위치에서 출발합니다. 현재 위치 기준으로 경로를 다시 찾을까요?', { ok: '다시 찾기' });
    if (!ok) { exitFull(); return; }
    t.origin = null; renderPlan(); await computeRoutes();
    if (!t.routes.length) return;
  }
  if (!sim && !S.me) { exitFull(); toast(GPS_BAD.includes(S.gps) ? gpsMsg('long') + ' 모의 주행은 쓸 수 있습니다.' : '현재 위치를 찾는 중입니다. 잠시 뒤 다시 눌러 주세요.', 4500); return; }
  const route = t.routes[t.sel];
  const ef = etaFactor();
  const walk = t.mode === 'walk';
  S.nav = {
    sim, route, trip: t, dest: t.dest, stops: t.stops.slice(), visited: 0, mode: t.mode || 'car',
    startTs: Date.now(), pred: route.duration, dist0: route.distance, rr: 0, corr: walk ? 1 : ef.k,
    lastFixT: 0, lastSt: null, simObj: null, rerouteCtl: null, ended: false,
    // 주행 기록: 지나간 길(경로에 맞춘 점)·지난 도로 이름·출발지(실제 안내만)
    rec: sim ? null : { pts: [], roads: [], from: originOf(S.me || t.origin) },
    // 기록한 길을 따라가는 안내면 그 길(이탈하면 그 길로 되돌아가게 다시 찾는다)
    follow: route.follow && t.follow ? { track: t.follow.track, idx: 0, name: t.follow.name, n: 0 } : null,
  };
  if (S.nav.follow && t.follow.favId) { const fr = store.froutes.find(x => x.id === t.follow.favId); if (fr) { fr.n = (fr.n || 0) + 1; saveStore(); } }
  if (S.nav.rec && !S.nav.rec.from.name) nameOrigin(S.nav.rec.from);
  S.nav.guide = makeGuide(route, false);
  setNavCams(route);
  if (!sim) addRecent(t.dest);
  MV.clearRoutes();
  MV.setTripMarks(null, t.stops, t.dest);
  MV.setAccuracy(null);
  go('guide');
  setSimBar();
  measure();
  MV.headingUp = store.settings.headingUp; MV.tilt = store.settings.tilt;
  MV.pitch3d = walk ? 35 : 52;                    // 걸을 때는 덜 기울여 주변을 넓게
  $('#app').dataset.mode = walk ? 'walk' : 'car'; // 도보: 속도·단속 카메라 표시 숨김
  MV.startGuideCam(guidePad());
  $('#gVoice').setAttribute('aria-pressed', store.settings.voice ? 'true' : 'false');
  $('#gVoice').innerHTML = ic(store.settings.voice ? 'vol' : 'mute', 24);
  Wake.on();
  S.nav.guide.intro();
  if (!sim) {
    S.nav.watch = setInterval(() => {
      const n = S.nav;
      if (!n || n.ended || n.sim) return;
      if (Date.now() - (n.lastFixT || n.startTs) > 8000) { banner('GPS 신호를 기다리는 중…'); if (MV.vehEl) MV.vehEl.classList.add('veh--stale'); }
    }, 2000);
  }
  if (sim) {
    const f = window.__simFactor || (walk ? 4 : 1);      // 걷기 모의 주행은 ×4 로 시작
    S.nav.simObj = new Sim(route, { factor: f, onFix: fx => navFix(fx) });
    S.nav.simObj.start();
  } else if (S.me) navFix({ ...S.me, t: Date.now() });
}

function setNavCams(route) {
  const n = S.nav;
  if (!n) return;
  if (n.mode === 'walk') { n.cams = []; n.camGuide = null; MV.setCams([]); return; }   // 단속 카메라는 차량만
  n.cams = route.cams || (CamDB.ready ? camsForRoute(route, { signal: store.settings.camSignal }) : []);
  n.camGuide = new CamGuide(n.cams, { speak: (txt, o) => Voice.say(txt, o), settings: () => store.settings });
  n.camK = -1;
  MV.setCams(n.cams);
}

function renderCam(cs) {
  const box = $('#cambox'), spd = $('#speed');
  spd.classList.toggle('over', !!cs.over);
  const show = cs.sec || (cs.ahead && cs.ahead.dist < 600);
  if (!show) { box.hidden = true; return; }
  const c = cs.ahead && cs.ahead.cam;
  const lim = cs.sec ? cs.sec.lim : (c && c.lim) || 0;
  box.classList.toggle('sec', !!cs.sec);
  $('.limsign', box).classList.toggle('sig', !lim);
  $('#limNum').textContent = lim ? String(lim) : '신호';
  if (cs.sec) {
    $('#camTitle').textContent = '구간단속' + (cs.sec.avg ? ` · 평균 ${Math.round(cs.sec.avg)}km/h` : '');
    $('#camDist').textContent = `남은 구간 ${fmtDistStr(cs.sec.left)}`;
  } else {
    $('#camTitle').textContent = (c.zone === 2 ? '어린이 보호구역 · ' : c.zone === 1 ? '노인 보호구역 · ' : '') + (CAM_KO[c.t] || '단속 카메라').replace(' 카메라', '');
    $('#camDist').textContent = fmtDistStr(Math.max(0, cs.ahead.dist)) + ' 앞';
  }
  box.hidden = false;
}

function makeGuide(route, rerouted) {
  const p = route.p || (route.p = personalize(route));
  return new Guide(route, {
    speak: (txt, o) => Voice.say(txt, o),
    event: (n, d) => navEvent(n, d),
    settings: () => store.settings,
    corr: S.nav ? S.nav.corr : 1,
    factors: p.factors,
    totalDur: p.dur,
    lastReroute: rerouted ? Date.now() : 0,
    destName: S.nav && S.nav.dest ? (S.nav.dest.label || S.nav.dest.name) : '',
    rerouted,
    mode: route.mode || (S.nav && S.nav.mode) || 'car',
  });
}

const LANDSCAPE = '(orientation: landscape) and (max-height: 560px)';
function guidePad() {
  const H = innerHeight, W = innerWidth;
  if (matchMedia(LANDSCAPE).matches) {
    const r = $('#mpanel').getBoundingClientRect();
    return { top: Math.round(H * 0.36), bottom: 12, left: Math.round((r.right || 300) + 12), right: 12 };
  }
  if (W >= 760) return { top: Math.round(H * 0.42), bottom: 40, left: 420 + 16, right: 20 };
  const gb = $('#gbar').offsetHeight || 90;
  return { top: Math.round(H * 0.42), bottom: gb + 10, left: 0, right: 0 };
}

function navFix(fix) {
  const n = S.nav;
  if (!n || n.ended) return;
  const st = n.guide.update(fix);
  recordFix(n, st, fix);
  const dt = n.lastFixT ? clamp(Date.now() - n.lastFixT, 200, 1500) : 0;
  n.lastFixT = Date.now();
  n.lastSt = st;
  MV.moveVeh(st.p, st.heading, { dur: dt * 1.05, arrow: true, stale: !st.on && !st.rerouting });
  // 지나온 길은 지우고 남은 길만
  if (st.on || !n.remDrawn) {
    MV.setRemaining(sliceLine(n.route.coords, n.route.cum, st.d, n.route.cum[n.route.cum.length - 1]));
    n.remDrawn = true;
  }
  MV.setTurn(n.route, st.nextDist < 700 ? st.next : null);
  if (n.camGuide) {
    const cs = n.camGuide.update(st.d, st.speed, fix.t || Date.now());
    renderCam(cs);
    if (n.camGuide.k !== n.camK) { n.camK = n.camGuide.k; MV.setCams(n.cams.slice(n.camGuide.k)); }
  }
  const kmh = st.speed * 3.6;
  let z = kmh < 20 ? 17.3 : kmh < 50 ? 17.3 - (kmh - 20) / 30 * 0.7 : kmh < 90 ? 16.6 - (kmh - 50) / 40 * 0.9 : 15.5;
  if (st.nextDist < 250 && st.next.kind !== 'arrive') z = Math.max(z, 17.2);
  if (n.mode === 'walk') z = st.nextDist < 60 ? 18.4 : 18;   // 걸을 때는 골목까지 크게
  MV.zoomTarget = z;
  renderGuide(st);
}

function renderGuide(st) {
  const n = S.nav;
  const s = st.next;
  const show = showStep(s);
  const d = fmtDist(st.nextDist);
  $('#mpanel').dataset.hw = st.hw ? '1' : '0';
  const key = s.kind + s.at + (s.exit || '');
  if ($('#mpIcon').dataset.k !== key) { $('#mpIcon').innerHTML = iconFor(s, 64); $('#mpIcon').dataset.k = key; }
  $('#mpDist').textContent = d.n; $('#mpUnit').textContent = d.u;
  $('#mpTitle').textContent = s.kind === 'arrive' ? (n.dest.label || n.dest.name) : show.title;
  $('#mpSub').textContent = s.kind === 'arrive' ? (show.sub || n.dest.addr || '') : (show.sub || (st.cur && st.cur.name ? st.cur.name + ' 따라' : ''));
  // 그 다음 안내
  const nh = $('#nexthint');
  if (st.after && st.afterGap != null && st.afterGap < 600 && s.kind !== 'arrive') {
    const t2 = showStep(st.after);
    nh.replaceChildren(h('span', { text: '그 다음' }), h('span', { svg: iconFor(st.after, 24) }), h('span', { text: st.after.kind === 'arrive' ? '목적지' : t2.title }), h('span', { class: 'num', style: 'opacity:.75;font-weight:600', text: fmtDistStr(st.afterGap) }));
    nh.hidden = false;
  } else nh.hidden = true;
  $('#gTime').textContent = fmtDur(st.remDur);
  $('#gEta').textContent = fmtClock(st.eta);
  $('#gDist').textContent = fmtDistStr(st.rem);
  $('#spd').textContent = String(Math.round(st.speed * 3.6));
  if (st.rerouting) banner('경로를 다시 찾는 중…');
  else if (!n.sim && st.gpsWeak) banner('GPS 신호가 약합니다');
  else banner(null);
  $('#btnRecenter').hidden = MV.follow;
  if ($('#mpanel').offsetHeight + 'px' !== $('#app').style.getPropertyValue('--mp-h')) measure();
}

function navEvent(name, data) {
  const n = S.nav;
  if (!n) return;
  if (name === 'offroute') reroute(data);
  else if (name === 'backon') { if (n.rerouteCtl) n.rerouteCtl.abort(); banner(null); }
  else if (name === 'waypoint') { n.visited = Math.min(n.stops.length, n.visited + 1); MV.setTripMarks(null, n.stops.slice(n.visited), n.dest); }
  else if (name === 'arrive') setTimeout(() => finishNav(true), 3500);
  else if (name === 'segment' && !n.sim) {
    if (n.rec && data.name && n.rec.roads[n.rec.roads.length - 1] !== data.name) n.rec.roads.push(data.name);
    if (n.mode !== 'walk') learnRoad(data.name, timeBand(data.t), data.act / data.pred, data.t);
  }
}

async function reroute(at) {
  const n = S.nav;
  if (!n || n.sim) { if (n) n.guide.rerouteFailed(); return; }
  if (n.rerouteCtl) n.rerouteCtl.abort();
  const ctl = n.rerouteCtl = new AbortController();
  const pts = [{ lat: at.lat, lon: at.lon }, ...n.stops.slice(n.visited), n.dest];
  const heading = at.speed > 2 ? at.heading : null;
  try {
    let r = null;
    if (n.follow) {
      // 기록한 길에서 2.5 km 안이면 그 길로 되돌아가게(지나온 곳 뒤쪽은 보지 않는다)
      const fl = n.follow, near = nearestOnLine(fl.track, [at.lon, at.lat], fl.idx);
      if (near.d < 2500) {
        try { r = await findRoutesAlong(fl.track.slice(near.i), { start: at, dest: n.dest, mode: n.mode, heading, signal: ctl.signal }); }
        catch (e) { if (ctl.signal.aborted) throw e; r = null; }
      }
      if (!r && !fl.left) { fl.left = true; toast('기록한 길에서 많이 벗어나 보통 길로 안내합니다', 3500); }
      if (!r) n.follow = null;
    }
    if (!r) r = await findRoutes(pts, { pref: n.trip.pref, mode: n.mode, heading, engine: store.settings.engine, signal: ctl.signal });
    if (ctl.signal.aborted || S.nav !== n || n.ended) return;
    n.route = r.routes[0];
    n.route.p = personalize(n.route);
    n.rr++;
    setNavCams(n.route);
    n.remDrawn = false;
    n.guide = makeGuide(n.route, true);
    n.guide.intro();
    banner(null);
    if (S.me) navFix({ ...S.me, t: Date.now() });
  } catch (e) {
    if (ctl.signal.aborted || S.nav !== n) return;
    n.guide.rerouteFailed();
    banner('경로를 다시 찾지 못했습니다. 잠시 뒤 다시 시도합니다');
  }
}

function finishNav(arrived) {
  const n = S.nav;
  if (!n || n.ended) return;
  n.ended = true;
  if (n.simObj) n.simObj.stop();
  if (n.rerouteCtl) n.rerouteCtl.abort();
  clearInterval(n.watch);
  Wake.off();
  if (!arrived) Voice.stop();
  const act = (Date.now() - n.startTs) / 1000;
  if (!n.sim) {
    const rec = n.rec || { pts: [], roads: [], from: null };
    const len = Math.round(lineLen(rec.pts));
    const id = uid();
    const roads = [...new Set(rec.roads)].slice(0, 8);
    store.trips.push({ id, ts: n.startTs, end: Date.now(), pred: n.pred, act, dist: n.dist0, rr: n.rr, arrived: !!arrived, mode: n.mode,
      dest: { name: n.dest.label || n.dest.name, lat: n.dest.lat, lon: n.dest.lon }, ...(rec.from ? { from: rec.from } : {}), ...(roads.length ? { roads } : {}), len });
    store.trips = store.trips.slice(-300);
    saveStore(true);
    if (rec.pts.length >= 2 && len >= 200) keepTrack(id, simplifyLine(rec.pts, 4));
    else pruneTracks();
  }
  S.nav = null; S.trip = null;
  $('#cambox').hidden = true; $('#speed').classList.remove('over');
  delete $('#app').dataset.mode; MV.pitch3d = 52;
  exitFull();
  MV.stopGuideCam();
  MV.clearRoutes();
  MV.setTripMarks(null, [], null);
  banner(null);
  $('#nexthint').hidden = true;
  go('home');
  if (S.me) { MV.moveVeh([S.me.lon, S.me.lat], null, { arrow: false }); MV.follow = true; MV.map.easeTo({ center: [S.me.lon, S.me.lat], zoom: 16, duration: 700 }); }
  if (arrived) toast(`도착했습니다 · ${fmtDur(act)} 걸렸습니다`, 4000);
}

function setSimBar() {
  const box = $('#simbar');
  const n = S.nav;
  if (!n || !n.sim) { box.hidden = true; box.replaceChildren(); return; }
  box.hidden = false;
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': '모의 주행 속도' },
    ...(n.mode === 'walk' ? [1, 4, 8] : [1, 2, 4]).map(f => h('button', { type: 'button', 'aria-pressed': (n.simObj ? n.simObj.factor : (window.__simFactor || 1)) === f ? 'true' : 'false', text: '×' + f,
      onclick: e => { n.simObj && n.simObj.setFactor(f); $$('button', seg).forEach(b => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); } })));
  const pause = h('button', { class: 'gbtn', type: 'button', 'aria-label': '일시 정지', svg: ic('pause', 22),
    onclick: e => { const p = n.simObj && n.simObj.togglePause(); e.currentTarget.innerHTML = ic(p ? 'play' : 'pause', 22, p); } });
  box.replaceChildren(h('span', { class: 'tag', text: n.mode === 'walk' ? '모의 걷기' : '모의 주행' }), seg, pause);
}

// ── 전체 화면 패널 ──
function openOverlay(title, content) {
  const ov = $('#overlay');
  ov.replaceChildren(
    h('div', { class: 'ov__head' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': '닫기', svg: ic('back', 24), onclick: closeOverlay }),
      h('h1', { text: title })),
    h('div', { class: 'ov__body' }, h('div', { class: 'ov__inner' }, ...content)));
  ov.hidden = false;
}
function closeOverlay() {
  $('#overlay').hidden = true;
  $('#overlay').replaceChildren();
  if (S.screen === 'home') { renderChips(); renderSheet(); }
  if (S.screen === 'preview') renderSheet();
}

const seg = (opts, val, onPick, label) => {
  const box = h('div', { class: 'seg', role: 'group', 'aria-label': label || '' });
  opts.forEach(([k, text]) => box.append(h('button', { type: 'button', 'aria-pressed': val === k ? 'true' : 'false', text,
    onclick: e => { $$('button', box).forEach(b => b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false')); onPick(k); } })));
  return box;
};
const sw = (val, onChange, label) => h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': val ? 'true' : 'false', 'aria-label': label,
  onclick: e => { const v = e.currentTarget.getAttribute('aria-checked') !== 'true'; e.currentTarget.setAttribute('aria-checked', v ? 'true' : 'false'); onChange(v); } });
const row = (title, desc, ctrl) => h('div', { class: 'row' }, h('div', { class: 'row__label' }, h('b', { text: title }), desc ? h('span', { text: desc }) : null), ctrl);
const setS = (k, v) => { store.settings[k] = v; saveStore(); };

function openSettings() {
  const st = store.settings;
  const voiceSel = h('select', { class: 'field', id: 'voiceSel', 'aria-label': '목소리', onchange: e => setS('voiceName', e.target.value) });
  const fillVoices = () => {
    voiceSel.replaceChildren(h('option', { value: '', text: '자동 선택' }), ...Voice.voices.map(v => h('option', { value: v.name, text: v.name, selected: v.name === st.voiceName })));
  };
  fillVoices(); Voice.on(k => { if (k === 'voices') fillVoices(); });
  const rate = h('input', { type: 'range', min: '0.8', max: '1.4', step: '0.05', value: String(st.voiceRate), id: 'voiceRate', 'aria-label': '말하기 속도', oninput: e => setS('voiceRate', +e.target.value) });
  const ef = etaFactor();
  const realTrips = store.trips.filter(t => !t.sim);
  const num = (k, min, max, step, id) => h('input', { class: 'field num', type: 'number', inputmode: 'decimal', id, min: String(min), max: String(max), step: String(step), value: String(st[k]),
    onchange: e => { const v = clamp(+e.target.value || st[k], min, max); e.target.value = String(v); setS(k, v); } });
  openOverlay('설정', [
    h('section', { class: 'group' }, h('h2', { text: '경로' }),
      row('기본 이동 방법', '목적지를 고르면 이 방법으로 먼저 찾습니다. 경로 화면에서 바로 바꿀 수 있습니다', seg([['car', '차량'], ['walk', '도보']], st.mode, k => setS('mode', k), '기본 이동 방법')),
      row('기본 경로 옵션(차량)', '목적지를 고르면 이 옵션으로 먼저 찾습니다', seg(Object.entries(PREF_KO), st.pref, k => setS('pref', k), '기본 경로 옵션')),
      row('운전하기 쉬운 길 우선', '‘추천’에서 빠른 길이 기준 시간 이상 빠르지 않으면 회전이 적고 큰길 위주인 길을 추천합니다. 빠른 길보다 25%(짧은 길은 1.5km) 넘게 멀거나 없던 유료도로·페리가 생기는 길은 추천하지 않습니다', sw(st.easyPrefer, v => setS('easyPrefer', v), '운전하기 쉬운 길 우선')),
      row('기준 시간', '빠른 길이 이만큼 이상 빨라야 빠른 길을 추천합니다. 짧은 길(25분 미만)에서는 빠른 길 소요 시간의 40%(최소 3분)까지만 늦어도 됩니다', seg([[5, '5분'], [10, '10분'], [15, '15분'], [20, '20분']], st.easyMin, k => setS('easyMin', k), '기준 시간')),
      row('경로 엔진', '자동: Valhalla로 찾고 응답이 없으면 OSRM', seg([['auto', '자동'], ['valhalla', 'Valhalla'], ['osrm', 'OSRM']], st.engine, k => setS('engine', k), '경로 엔진'))),
    vworldGroup(st),
    h('section', { class: 'group' }, h('h2', { text: '음성 안내' }),
      row('음성 안내', null, sw(st.voice, v => setS('voice', v), '음성 안내')),
      row('목소리', Voice.ok ? (Voice.voices.length ? '이 기기에 있는 한국어 음성' : '한국어 음성을 찾는 중이거나 없습니다') : '이 브라우저는 음성 합성을 지원하지 않습니다', voiceSel),
      row('말하기 속도', null, rate),
      row('안내 빈도', '간단: 회전 직전 위주 · 자세히: 1km·500m·300m 모두', seg([['brief', '간단'], ['normal', '보통'], ['detail', '자세히']], st.verbosity, k => setS('verbosity', k), '안내 빈도')),
      row('들어 보기', null, h('button', { class: 'btn btn--sm', type: 'button', text: '300미터 앞 우회전', onclick: () => { Voice.unlock(); Voice.say('300미터 앞에서 우회전입니다', { force: true, urgent: true }); } }))),
    h('section', { class: 'group' }, h('h2', { text: '단속 카메라' }),
      row('카메라 음성 안내', '고속도로 600m·일반도로 300m 앞에서 알려 줍니다', sw(st.camVoice, v => setS('camVoice', v), '카메라 음성 안내')),
      row('신호 단속 카메라도 안내', '끄면 과속·구간단속 카메라만 안내합니다(다음 경로부터)', sw(st.camSignal, v => setS('camSignal', v), '신호 단속 카메라 안내')),
      row('제한속도 초과 경고', '카메라 앞·구간단속 중 제한속도를 넘으면 속도 표시가 빨개지고 음성으로 알립니다', sw(st.overWarn, v => setS('overWarn', v), '제한속도 초과 경고')),
      row('카메라 자료', CamDB.ready ? `${CamDB.n.toLocaleString('ko-KR')}대 · ${CamDB.date || ''} 기준 · 반년마다 갱신되는 공공 자료라 새로 생긴 카메라와 이동식 단속은 빠질 수 있습니다` : CamDB.err ? (isLocalFile() ? '파일로 열면 카메라 자료를 쓸 수 없습니다. 앱 주소로 여세요.' : '카메라 자료를 불러오지 못했습니다. 인터넷 연결을 확인하세요.') : '불러오는 중…', h('span'))),
    h('section', { class: 'group' }, h('h2', { text: '화면' }),
      row('지도 밝기', '자동: 해가 지면 야간 지도로 바꿉니다', seg([['auto', '자동'], ['day', '주간'], ['night', '야간']], st.theme, k => { setS('theme', k); applyTheme(); }, '지도 밝기')),
      row('안내 중 지도 방향', null, seg([['1', '진행 방향 위'], ['0', '북쪽 위']], st.headingUp ? '1' : '0', k => { setS('headingUp', k === '1'); MV.headingUp = k === '1'; }, '지도 방향')),
      row('안내 중 3D 시점', '지도를 기울여 앞쪽 길을 멀리 보여 줍니다', sw(st.tilt, v => { setS('tilt', v); MV.tilt = v; }, '3D 시점')),
      row('화면 꺼짐 방지', '안내 중에는 화면이 꺼지지 않게 합니다', sw(st.wakeLock, v => setS('wakeLock', v), '화면 꺼짐 방지')),
      row('안내 중 전체 화면', '안내를 시작하면 주소창과 상태 표시줄을 숨겨 지도를 넓게 봅니다', sw(st.fullscreen, v => setS('fullscreen', v), '안내 중 전체 화면'))),
    h('section', { class: 'group' }, h('h2', { text: '내 차' }),
      row('연비', 'km/L — 경로마다 유류비를 계산합니다', num('fuelEff', 3, 40, 0.5, 'fuelEff')),
      row('휘발유·경유 가격', '원/L', num('fuelPrice', 800, 3500, 10, 'fuelPrice')),
      row('유류비 표시', null, sw(st.showFuel, v => setS('showFuel', v), '유류비 표시'))),
    h('section', { class: 'group' }, h('h2', { text: '나에게 맞추기' }),
      row('도착 시간 보정', ef.n ? `내 주행 기록으로 보정 중: ×${ef.k.toFixed(2)} (${ef.n}회, ${ef.band ? BAND_KO[ef.band] : '전체'})` : `실제 안내를 끝까지 3번 이상 받으면 시작합니다 (지금 ${realTrips.filter(t => t.arrived).length}회)`, sw(st.etaLearn, v => setS('etaLearn', v), '도착 시간 보정')),
      row('시간대별 목적지 추천', '요일·시간대가 비슷할 때 자주 간 곳을 첫 화면에 띄웁니다', sw(st.suggest, v => setS('suggest', v), '시간대별 추천')),
      row('도로별 교통 학습', Object.keys(store.roads).length ? `안내 중 달린 도로의 시간대별 실제 속도 ${Object.keys(store.roads).length}건 — 최근 기록일수록 크게 반영해 경로 선택과 도착 시간에 씁니다` : '안내를 받으며 달리면 도로별·시간대별 실제 속도를 배워 다음 경로 선택에 씁니다', h('span')),
      row('주행 기록 지우기', `주행 ${realTrips.length}건 · 도로 학습 ${Object.keys(store.roads).length}건`, h('button', { class: 'btn btn--sm btn--ghost', type: 'button', text: '지우기', onclick: async () => { if (await ask('주행 기록과 도로별 학습을 모두 지울까요? 도착 시간 보정과 추천이 처음부터 다시 시작됩니다.', { ok: '지우기', danger: true })) { store.trips = []; store.roads = {}; saveStore(true); setTracks({}); toast('주행 기록을 지웠습니다'); openSettings(); } } }))),
    h('section', { class: 'group' }, h('h2', { text: '데이터' }),
      row('백업 파일로 저장', '집·회사·즐겨찾기·즐겨찾는 경로·설정·주행 기록(지나간 길 포함)을 이 기기에서 다른 기기로 옮길 때', h('button', { class: 'btn btn--sm', type: 'button', onclick: exportFile }, h('span', { svg: ic('down', 16) }), '저장')),
      row('백업 파일 불러오기', '지금 데이터는 백업 내용으로 바뀝니다', h('button', { class: 'btn btn--sm', type: 'button', onclick: importFile }, h('span', { svg: ic('up', 16) }), '불러오기')),
      row('모두 초기화', null, h('button', { class: 'btn btn--sm btn--ghost', type: 'button', text: '초기화', onclick: async () => { if (await ask('집·회사·즐겨찾기·즐겨찾는 경로·기록·설정을 모두 지울까요?', { ok: '모두 지우기', danger: true })) { applyData({}); store.settings = { ...DEFAULT_SETTINGS }; saveStore(true); setTracks({}); refreshPts(); applyTheme(); toast('초기화했습니다'); openSettings(); } } }))),
    h('section', { class: 'group' }, h('h2', { text: '앱 정보' }),
      row('버전', null, h('span', { class: 'num', style: 'font-weight:700', text: 'v' + APP_VERSION })),
      row('앱 주소', '휴대폰에서는 이 주소로 열어야 위치(GPS)를 쓸 수 있습니다. 메뉴의 ‘홈 화면에 추가’를 하면 앱처럼 열립니다.', h('span', { class: 'num', style: 'font-weight:700;user-select:all;word-break:break-all', text: APP_URL }))),
    h('section', { class: 'group credits' }, h('h2', { text: '데이터 출처와 이용 정책' }),
      h('p', null, '지도: ', h('a', { href: 'https://openfreemap.org', target: '_blank', rel: 'noopener', text: 'OpenFreeMap' }), ' · ', h('a', { href: 'https://www.openmaptiles.org/', target: '_blank', rel: 'noopener', text: 'OpenMapTiles' }), ' · 지도 데이터 ', h('a', { href: 'https://www.openstreetmap.org/copyright', target: '_blank', rel: 'noopener', text: '© OpenStreetMap 기여자' })),
      h('p', null, '경로: ', h('a', { href: 'https://valhalla.github.io/valhalla/', target: '_blank', rel: 'noopener', text: 'Valhalla' }), ' · ', h('a', { href: 'https://routing.openstreetmap.de/about.html', target: '_blank', rel: 'noopener', text: 'OSRM' }), ' (FOSSGIS 공개 서버, 초당 1회 이하·가벼운 개인 사용)'),
      h('p', null, '검색: ', h('a', { href: 'https://photon.komoot.io', target: '_blank', rel: 'noopener', text: 'Photon(komoot)' }), ' · Nominatim — ', h('a', { href: 'https://operations.osmfoundation.org/policies/nominatim/', target: '_blank', rel: 'noopener', text: 'Nominatim 이용 정책' }), '(자동완성 금지, 초당 1회 이하, 결과 저장 후 재사용)을 지키도록 검색 버튼을 눌렀을 때만 요청하고 결과를 이 기기에 7일간 보관합니다.'),
      h('p', null, '주소·건물 검색(인증키를 넣은 경우): ', h('a', { href: 'https://www.vworld.kr', target: '_blank', rel: 'noopener', text: '브이월드(국토교통부 공간정보 오픈플랫폼)' }), ' 검색·지오코더 API'),
      h('p', null, '단속 카메라: 경찰청·지방자치단체 「전국무인교통단속카메라표준데이터」(', h('a', { href: 'https://www.data.go.kr/data/15028200/standard.do', target: '_blank', rel: 'noopener', text: '공공데이터포털' }), ')'),
      h('p', null, '실시간 교통 정보와 이동식 단속 정보는 없습니다. 안내는 참고용이며 실제 도로 표지와 교통 법규를 따르세요. 운전 중에는 화면을 조작하지 마세요.')),
  ]);
}

// 주소·건물 검색: 브이월드 인증키(무료). 없으면 OpenStreetMap 검색만 쓴다
function vworldGroup(st) {
  const msg = h('span', { class: 'muted', style: 'font-size:12.5px;display:block', 'aria-live': 'polite', text: st.vworldKey ? '인증키가 저장되어 있습니다.' : '' });
  const inp = h('input', { class: 'field', type: 'text', id: 'vworldKey', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: '인증키 붙여넣기', value: st.vworldKey, 'aria-label': '브이월드 인증키',
    onchange: e => { setS('vworldKey', e.target.value.trim()); e.target.value = store.settings.vworldKey; store.scache = []; revCache.clear(); msg.textContent = store.settings.vworldKey ? '저장했습니다. ‘시험’으로 확인해 보세요.' : '인증키를 지웠습니다. OpenStreetMap 검색만 씁니다.'; } });
  const test = h('button', { class: 'btn btn--sm', type: 'button', text: '시험', onclick: async () => {
    if (inp.value.trim() !== store.settings.vworldKey) { setS('vworldKey', inp.value.trim()); store.scache = []; revCache.clear(); }
    if (!vwKey()) { msg.textContent = '먼저 인증키를 넣으세요.'; return; }
    msg.textContent = '확인하는 중…';
    const r = await vworldTest();
    msg.textContent = r.msg;
  } });
  inp.classList.add('field--wide');
  return h('section', { class: 'group' }, h('h2', { text: '주소·건물 검색' }),
    h('div', { class: 'row' },
      h('div', { class: 'row__label' }, h('b', { text: '브이월드 인증키' }),
        h('span', null, '지도 자료(OpenStreetMap)에 없는 아파트·건물 이름과 도로명 주소를 국토교통부 자료로 찾습니다. ',
          h('a', { href: 'https://www.vworld.kr', target: '_blank', rel: 'noopener', text: '브이월드' }),
          `에서 무료로 발급받고, 서비스 URL 에 ${vwDomain()} 를 적으세요. 인증키는 이 기기에만 저장됩니다.`)),
      h('div', { style: 'flex:1 1 100%;display:flex;gap:8px;align-items:center' }, inp, test),
      h('div', { style: 'flex:1 1 100%;margin-top:-6px' }, msg)));
}

function exportFile() {
  try {
    const blob = new Blob([exportData()], { type: 'application/json' });
    const d = new Date();
    const name = `gilnavi_backup_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 4000);
    toast('백업 파일을 저장했습니다');
  } catch (e) { toast('이 환경에서는 파일로 저장할 수 없습니다'); }
}
function importFile() {
  const inp = h('input', { type: 'file', accept: '.json,application/json' });
  inp.onchange = () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (d.app !== 'gilnavi') throw new Error('not ours');
        applyData(d); saveStore(true); setTracks(d.tracks); refreshPts(); applyTheme();
        toast('백업을 불러왔습니다'); openSettings();
      } catch (e) { toast('길잡이 내비 백업 파일이 아닙니다'); }
    };
    rd.readAsText(f);
  };
  inp.click();
}

// 내 장소 관리
// ── 현재 위치 저장 · 내 장소 이름과 메모 ──
// 이름·메모 입력 창(현재 위치 저장과 고치기에 같이 쓴다). 열린 동안 info()·setName()·enable() 로 내용을 바꾼다
function placeForm({ title, name = '', memo = '', kinds = null, okText = '저장', onSave, onDelete = null, namePh = '이름(예: 주차한 곳, 우리 아파트)', memoPh = '메모(선택) — 예: 지하 2층 B-37' }) {
  const box = $('#dialog');
  let typed = false, kind = kinds ? kinds[0][0] : null, closed = false;
  const close = () => { closed = true; box.hidden = true; box.replaceChildren(); };
  const nameIn = h('input', { class: 'field field--wide', id: 'pfName', maxlength: '40', value: name, placeholder: namePh, 'aria-label': '이름', enterkeyhint: 'done',
    oninput: () => { typed = true; }, onkeydown: e => { if (e.key === 'Enter') save(); } });
  const memoIn = h('input', { class: 'field field--wide', id: 'pfMemo', maxlength: '120', value: memo, placeholder: memoPh, 'aria-label': '메모', enterkeyhint: 'done',
    onkeydown: e => { if (e.key === 'Enter') save(); } });
  const infoEl = h('div', { class: 'pform__info', id: 'pfInfo', 'aria-live': 'polite' });
  const ok = h('button', { class: 'btn btn--primary', type: 'button', id: 'pfSave', text: okText, onclick: () => save() });
  const save = () => { if (ok.disabled) return; const r = onSave({ name: nameIn.value.trim(), memo: memoIn.value.trim(), kind }); if (r !== false) close(); };
  box.replaceChildren(h('div', { class: 'dialog__box pform', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', { text: title }), infoEl,
    kinds ? seg(kinds, kind, k => { kind = k; }, '저장할 곳') : null,
    nameIn, memoIn,
    h('div', { class: 'dialog__btns' },
      onDelete ? h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', id: 'pfDel', text: '지우기', style: 'margin-right:auto', onclick: () => { close(); onDelete(); } }) : null,
      h('button', { class: 'btn', type: 'button', text: '취소', onclick: close }), ok)));
  box.hidden = false;
  box.onclick = e => { if (e.target === box) close(); };
  box.onkeydown = e => { if (e.key === 'Escape') close(); };
  nameIn.focus();
  return {
    get closed() { return closed; },
    info(text, warn = false) { infoEl.textContent = text; infoEl.classList.toggle('pform__info--warn', warn); },
    setName(v) { if (!typed && !nameIn.value.trim()) nameIn.value = v; },   // 사용자가 쓰기 전에만 채운다
    enable(v) { ok.disabled = !v; },
    close,
  };
}

const hm = ts => { const d = new Date(ts); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

// 새 GPS 위치를 잠시 기다린다(15초 안의 위치면 바로)
function freshFix(maxWait = 10000) {
  return new Promise(res => {
    const t0 = Date.now();
    const tick = () => {
      if (S.me && Date.now() - S.me.t < 15000) return res(S.me);
      if (GPS_BAD.includes(S.gps) || Date.now() - t0 > maxWait) return res(null);
      setTimeout(tick, 300);
    };
    tick();
  });
}

async function saveHere() {
  if (!S.me && GPS_BAD.includes(S.gps)) { await ask(gpsMsg('long'), { ok: '확인', cancel: '닫기' }); return; }
  let fix = null, addr = '', defName = '';
  const form = placeForm({
    title: '현재 위치 저장',
    kinds: [['fav', '즐겨찾기'], ['home', '집'], ['work', '회사']],
    onSave: ({ name, memo, kind }) => {
      if (!fix) return false;
      const p = cleanPlace({ name: name || defName || `내 위치 ${hm(fix.t)}`, addr: addr || `${fix.lat.toFixed(5)}, ${fix.lon.toFixed(5)}`, lat: fix.lat, lon: fix.lon, memo });
      if (kind === 'fav') { const k = placeKey(p); store.favs = [p, ...store.favs.filter(f => placeKey(f) !== k)].slice(0, 100); }
      else store[kind] = p;
      saveStore(true);
      refreshPts();
      const obj = `‘${p.name}’${josa(p.name, '을/를').slice(p.name.length)}`;
      toast(kind === 'fav' ? `${obj} 저장했습니다. 검색창에 이름이나 메모로 찾을 수 있습니다` : `${obj} ${kind === 'home' ? '집' : '회사'}으로 등록했습니다`, 3600);
      if (S.screen === 'home') { if (kind === 'fav') S.homeTab = 'fav'; renderSheet(); }
    },
  });
  form.enable(false);
  form.info('현재 위치를 찾는 중…');
  fix = await freshFix();
  if (form.closed) return;
  let old = '';
  if (!fix && S.me) { fix = S.me; old = ` · ${Math.max(1, Math.round((Date.now() - S.me.t) / 60000))}분 전에 잡힌 위치`; }
  if (!fix) { form.info(gpsMsg('short') || '현재 위치를 찾지 못했습니다. 잠시 뒤 다시 시도하세요.', true); return; }
  fix = { ...fix };
  const acc = Math.round(fix.acc || 0);
  const accText = acc ? `정확도 약 ${acc}m` : '';
  const weak = acc > 50 || !!old;
  form.enable(true);
  form.info([accText, '주소 찾는 중…'].filter(Boolean).join(' · ') + old, weak);
  defName = `내 위치 ${hm(fix.t)}`;
  try {
    const r = await reversePlace(fix.lon, fix.lat);
    if (form.closed) return;
    if (r && r.name && r.name !== '선택한 위치') { defName = r.name; addr = r.addr || ''; }
  } catch (e) { /* 주소 없이 저장 */ }
  if (form.closed) return;
  form.setName(defName);
  form.info([addr || '주소를 찾지 못했습니다', accText].filter(Boolean).join(' · ') + old + (acc > 50 ? ' — 밖으로 나가거나 잠시 기다리면 더 정확해집니다' : ''), weak);
}

// 저장된 장소(집·회사·즐겨찾기)의 이름과 메모 고치기
function editSaved(p) {
  const sv = savedAt(p);
  if (!sv) return;
  placeForm({
    title: '이름·메모 고치기', name: sv.place.name, memo: sv.place.memo || '',
    onSave: ({ name, memo }) => {
      sv.place.name = name || sv.place.name;
      if (memo) sv.place.memo = memo.slice(0, 120); else delete sv.place.memo;
      saveStore(true);
      refreshPts();
      if (S.place && placeKey(S.place) === placeKey(sv.place)) { S.place = { ...S.place, name: sv.place.name, memo: sv.place.memo }; if (S.screen === 'place') renderSheet(); }
      toast('고쳤습니다');
    },
  }).info(sv.kind === 'home' ? '집' : sv.kind === 'work' ? '회사' : '즐겨찾기');
}

function openPlaces() {
  const sec = (title, kids) => h('section', { class: 'group' }, h('h2', { text: title }), ...kids);
  const myRow = (kind, label) => {
    const p = store[kind];
    return row(label, p ? `${p.name}${p.addr ? ' · ' + p.addr : ''}` : '아직 등록하지 않았습니다',
      h('div', { style: 'display:flex;gap:6px' },
        h('button', { class: 'btn btn--sm', type: 'button', text: p ? '변경' : '등록', onclick: () => { closeOverlay(); beginPick(kind); } }),
        p ? h('button', { class: 'btn btn--sm btn--ghost', type: 'button', text: '삭제', onclick: () => { store[kind] = null; saveStore(); refreshPts(); openPlaces(); } }) : null));
  };
  const favRows = store.favs.length ? store.favs.map((f, i) => {
    const name = h('input', { class: 'field field--wide', value: f.name, maxlength: '40', 'aria-label': '이름', id: 'fav-' + f.id,
      onchange: e => { f.name = e.target.value.trim() || f.name; saveStore(); refreshPts(); } });
    const memo = h('input', { class: 'field field--wide field--memo', value: f.memo || '', maxlength: '120', placeholder: '메모', 'aria-label': '메모', id: 'favm-' + f.id,
      onchange: e => { const v = e.target.value.trim(); if (v) f.memo = v; else delete f.memo; saveStore(); } });
    return h('div', { class: 'row' }, h('div', { class: 'row__label' }, name, memo, h('span', { text: f.addr || '' })),
      h('button', { class: 'btn btn--sm btn--ghost', type: 'button', 'aria-label': '삭제', svg: ic('trash', 18), onclick: () => { store.favs.splice(i, 1); saveStore(); refreshPts(); openPlaces(); } }));
  }) : [h('p', { class: 'empty', text: '장소 카드에서 ‘저장’을 누르거나 ‘현재 위치 저장’을 하면 여기에 모입니다. 이름과 메모는 바로 고칠 수 있습니다.' })];
  const here = row('현재 위치 저장', '지금 있는 곳을 이름·메모와 함께 저장합니다. 검색창에 이름이나 메모를 쓰면 찾아 줍니다.',
    h('button', { class: 'btn btn--sm', type: 'button', onclick: () => { closeOverlay(); saveHere(); } }, h('span', { svg: ic('pin', 16) }), '저장'));
  openOverlay('내 장소', [
    sec('집 · 회사', [myRow('home', '집'), myRow('work', '회사')]),
    sec(`즐겨찾기 ${store.favs.length}곳`, [here, ...favRows]),
    sec('최근 목적지', [row(`${store.recents.length}곳 저장됨`, null, h('button', { class: 'btn btn--sm btn--ghost', type: 'button', text: '모두 지우기', onclick: () => { store.recents = []; saveStore(); openPlaces(); } }))]),
  ]);
}
