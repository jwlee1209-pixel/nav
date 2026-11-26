// ───────────────────────── 지도 화면 ─────────────────────────
const MV = {
  map: null, theme: 'day', loaded: false,
  marks: { dest: null, origin: null, stops: [], place: null },
  veh: null, vehEl: null, vehPos: null, vehHdg: 0,
  follow: false, guideCam: false, headingUp: true, tilt: true,
  anim: null, zoomNow: 16.5, pad: { top: 0, bottom: 0, left: 0, right: 0 },
  onLongPress: null, onUserMove: null, onRouteClick: null, onPtClick: null,

  init(el, theme, view) {
    this.theme = theme;
    const map = this.map = new maplibregl.Map({
      container: el,
      style: buildStyle(theme),
      center: view ? view.c : [126.9780, 37.5665],
      zoom: view ? view.z : 12,
      attributionControl: false,
      maxPitch: 65,
      localIdeographFontFamily: "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Noto Sans KR', 'Noto Sans CJK KR', sans-serif",
      fadeDuration: 120,
      dragRotate: true,
      touchPitch: true,
    });
    map.addControl(new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap 기여자</a>',
    }), 'bottom-left');
    map.on('styleimagemissing', e => { if (e.id === 'nv-head') this.addHead(); });
    map.on('load', () => { this.loaded = true; this.addHead(); this.foldAttrib(); });
    map.on('resize', () => this.foldAttrib());
    map.on('error', e => { if (this.onError) this.onError(e); });
    const moved = e => { if (e.originalEvent && this.onUserMove) this.onUserMove(e.type); };
    ['dragstart', 'rotatestart', 'pitchstart', 'zoomstart'].forEach(t => map.on(t, moved));
    map.on('moveend', () => { const c = map.getCenter(); store.view = { c: [+c.lng.toFixed(5), +c.lat.toFixed(5)], z: +map.getZoom().toFixed(2) }; saveStore(); });
    map.on('click', e => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['hits-dot', 'alt', 'alt-case', 'pts-dot', 'pts-label'].filter(l => map.getLayer(l)) });
      if (!f.length) return;
      const top = f[0];
      if (top.layer.id === 'hits-dot' && this.onHitClick) this.onHitClick(+top.properties.i);
      else if ((top.layer.id === 'alt' || top.layer.id === 'alt-case') && this.onRouteClick) this.onRouteClick(top.properties.idx);
      else if (top.layer.id.startsWith('pts') && this.onPtClick) this.onPtClick(top.properties);
    });
    map.on('contextmenu', e => { e.preventDefault && e.preventDefault(); this.onLongPress && this.onLongPress(e.lngLat); });
    // 휴대폰: 길게 누르기
    let lp = null;
    const can = map.getCanvasContainer();
    can.addEventListener('touchstart', ev => {
      if (ev.touches.length !== 1) { clearTimeout(lp && lp.t); lp = null; return; }
      const t0 = ev.touches[0], r = can.getBoundingClientRect();
      const pt = [t0.clientX - r.left, t0.clientY - r.top];
      lp = { x: t0.clientX, y: t0.clientY, t: setTimeout(() => { if (lp && this.onLongPress) this.onLongPress(map.unproject(pt)); lp = null; }, 600) };
    }, { passive: true });
    can.addEventListener('touchmove', ev => { if (lp && Math.hypot(ev.touches[0].clientX - lp.x, ev.touches[0].clientY - lp.y) > 10) { clearTimeout(lp.t); lp = null; } }, { passive: true });
    can.addEventListener('touchend', () => { if (lp) { clearTimeout(lp.t); lp = null; } }, { passive: true });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  },

  // 출처 표시는 (i) 단추로 접어 둔다(누르면 펼쳐짐)
  foldAttrib() {
    const el = this.map && this.map.getContainer().querySelector('.maplibregl-ctrl-attrib');
    if (el) { el.classList.remove('maplibregl-compact-show'); el.removeAttribute('open'); }
  },

  whenLoaded(fn) { if (this.loaded) fn(); else this.map.once('load', fn); },

  addHead() {
    const map = this.map, P = PAL[this.theme];
    const S = 96, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    g.beginPath(); g.moveTo(S / 2, 8); g.lineTo(S - 12, S - 18); g.lineTo(12, S - 18); g.closePath();
    g.lineJoin = 'round'; g.lineWidth = 10; g.strokeStyle = P.routeCase; g.stroke();
    g.fillStyle = P.arrow; g.fill();
    const img = g.getImageData(0, 0, S, S);
    try {
      if (map.hasImage('nv-head')) map.updateImage('nv-head', img);
      else map.addImage('nv-head', img, { pixelRatio: 2 });
    } catch (e) { /* 스타일 교체 중 */ }
  },

  setTheme(theme) {
    if (theme === this.theme) return;
    this.theme = theme;
    const map = this.map;
    const apply = () => {
      for (const L of mapLayers(PAL[theme])) {
        if (!map.getLayer(L.id)) continue;
        for (const k in (L.paint || {})) { try { map.setPaintProperty(L.id, k, L.paint[k]); } catch (e) { /* 무시 */ } }
      }
      this.addHead();
    };
    if (map.isStyleLoaded()) apply(); else this.whenLoaded(apply);
  },

  src(id) { return this.map && this.map.getSource(id); },
  setData(id, data) { const s = this.src(id); if (s) s.setData(data); else this.whenLoaded(() => { const s2 = this.src(id); if (s2) s2.setData(data); }); },

  // 미리보기: 모든 후보 경로(선택 경로를 맨 위에)
  setRoutes(routes, sel) {
    const feats = routes.map((r, i) => ({ type: 'Feature', properties: { idx: i, sel: i === sel }, geometry: { type: 'LineString', coordinates: r.coords } }));
    feats.sort((a, b) => (a.properties.sel ? 1 : 0) - (b.properties.sel ? 1 : 0));
    this.setData('routes', { type: 'FeatureCollection', features: feats });
  },
  setRemaining(coords) {
    this.setData('routes', { type: 'FeatureCollection', features: coords && coords.length > 1 ? [{ type: 'Feature', properties: { idx: 0, sel: true }, geometry: { type: 'LineString', coordinates: coords } }] : [] });
  },
  clearRoutes() { this.setData('routes', { type: 'FeatureCollection', features: [] }); this.setTurn(null); this.setCams(null); },

  // 다음 회전 지점의 흰 화살표
  setTurn(route, step) {
    if (!route || !step || !step.voice || step.kind === 'arrive' || step.kind === 'waypoint') { this.setData('turn', { type: 'FeatureCollection', features: [] }); this._turnKey = ''; return; }
    const key = route.id + ':' + step.at;
    if (key === this._turnKey) return;
    this._turnKey = key;
    const line = sliceLine(route.coords, route.cum, step.at - 30, step.at + 22);
    if (line.length < 2) return;
    const end = line[line.length - 1], prev = line[line.length - 2];
    const b = brg(prev, end);
    const tip = offsetPt(end, b, 2);
    this.setData('turn', { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } },
      { type: 'Feature', properties: { b }, geometry: { type: 'Point', coordinates: tip } },
    ] });
  },

  setPts(list) {
    this.setData('pts', { type: 'FeatureCollection', features: list.map(p => ({ type: 'Feature', properties: { kind: p.kind, name: p.label || p.name, id: p.id || '', lat: p.lat, lon: p.lon, pname: p.name, addr: p.addr || '' }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) });
  },
  setCams(list) {
    this.setData('cams', { type: 'FeatureCollection', features: (list || []).filter(c => c.t !== 6).map(c => ({ type: 'Feature', properties: { t: c.t, lim: c.lim }, geometry: { type: 'Point', coordinates: [c.lon, c.lat] } })) });
  },
  setHits(list) {
    this.setData('hits', { type: 'FeatureCollection', features: (list || []).map((p, i) => ({ type: 'Feature', properties: { n: String(i + 1), i }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })) });
  },
  setAccuracy(fix) {
    this.setData('acc', fix && fix.acc > 15 && fix.acc < 2000 ? { type: 'Feature', properties: {}, geometry: circlePoly([fix.lon, fix.lat], fix.acc) } : { type: 'FeatureCollection', features: [] });
  },

  pin(kind, lonlat, label) {
    const el = h('div', { class: 'pin pin--' + kind, 'aria-hidden': 'true' }, label ? h('span', { text: label }) : null);
    return new maplibregl.Marker({ element: el, anchor: kind === 'origin' || kind === 'stop' ? 'center' : 'bottom' }).setLngLat(lonlat).addTo(this.map);
  },
  setTripMarks(origin, stops, dest) {
    const m = this.marks;
    if (m.origin) m.origin.remove(); if (m.dest) m.dest.remove(); m.stops.forEach(x => x.remove());
    m.origin = origin ? this.pin('origin', [origin.lon, origin.lat]) : null;
    m.stops = (stops || []).map((s, i) => this.pin('stop', [s.lon, s.lat], String(i + 1)));
    m.dest = dest ? this.pin('dest', [dest.lon, dest.lat]) : null;
  },
  setPlaceMark(p) {
    if (this.marks.place) { this.marks.place.remove(); this.marks.place = null; }
    if (p) this.marks.place = this.pin('place', [p.lon, p.lat]);
  },

  fit(coords, opt = {}) {
    if (!coords || !coords.length) return;
    const b = bboxOf(coords);
    const pad = opt.padding || this.overviewPad();
    const cur = this.map.getPadding();
    if (cur.top || cur.bottom || cur.left || cur.right) this.map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
    if (b[2] - b[0] < 1e-5 && b[3] - b[1] < 1e-5) { this.map.easeTo({ center: [b[0], b[1]], zoom: 16, bearing: 0, pitch: 0, padding: pad, duration: 600 }); return; }
    this.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad, bearing: 0, pitch: 0, duration: opt.duration == null ? 700 : opt.duration, maxZoom: 17 });
  },
  overviewPad() {
    const W = innerWidth, H = innerHeight;
    if (W >= 760) return { top: 60, bottom: 60, left: 440, right: 60 };
    const plan = document.getElementById('plan'), sheet = document.getElementById('sheet');
    const topEl = plan && plan.offsetParent ? plan.getBoundingClientRect().bottom : 70;
    const sh = sheet && sheet.offsetParent ? sheet.offsetHeight : H * 0.4;
    let top = topEl + 24, bottom = sh + 24;
    if (top + bottom > H - 120) { const k = (H - 120) / (top + bottom); top *= k; bottom *= k; }
    return { top, bottom, left: 36, right: 36 };
  },

  // 차량(내 위치) 표시
  ensureVeh() {
    if (this.veh) return;
    this.vehEl = h('div', { class: 'veh veh--dot', 'aria-label': '내 위치' }, h('div', { class: 'veh__body', svg: '<svg viewBox="0 0 48 48" width="50" height="50"><path d="M24 3 42 43 24 34 6 43Z" fill="currentColor" stroke="#fff" stroke-width="3.6" stroke-linejoin="round"/></svg>' }));
    this.veh = new maplibregl.Marker({ element: this.vehEl, rotationAlignment: 'map', pitchAlignment: 'viewport' }).setLngLat([0, 0]).addTo(this.map);
  },
  // 새 위치로 부드럽게 이동(애니메이션 프레임에서 보간)
  moveVeh(lonlat, heading, { dur = 900, arrow = false, stale = false } = {}) {
    this.ensureVeh();
    this.vehEl.classList.toggle('veh--dot', !arrow);
    this.vehEl.classList.toggle('veh--stale', !!stale);
    const from = this.vehPos || lonlat;
    const jump = !this.vehPos || hav(from, lonlat) > 400;
    this.anim = { from: jump ? lonlat : from.slice(), to: lonlat, h0: this.vehHdg, h1: heading == null ? this.vehHdg : heading, t0: performance.now(), dur: jump ? 0 : clamp(dur, 150, 1600) };
  },
  hideVeh() { if (this.veh) { this.veh.remove(); this.veh = null; this.vehPos = null; } },

  loop(t) {
    requestAnimationFrame(this.loop);
    const a = this.anim;
    if (!a || !this.veh) return;
    if (!a.done) {
      const k = a.dur ? clamp((t - a.t0) / a.dur, 0, 1) : 1;
      this.vehPos = [a.from[0] + (a.to[0] - a.from[0]) * k, a.from[1] + (a.to[1] - a.from[1]) * k];
      this.vehHdg = lerpAng(a.h0, a.h1, k);
      this.veh.setLngLat(this.vehPos);
      this.veh.setRotation(this.vehHdg);
      if (k >= 1) a.done = true;
    }
    if (!this.follow) return;
    const map = this.map;
    if (this.guideCam) {
      // 바뀐 것이 있을 때만 카메라를 움직인다(가만히 있을 때 화면을 다시 그리지 않아 배터리 절약)
      const zt = this.zoomTarget || 16.5;
      const z = Math.abs(zt - this.zoomNow) < 0.004 ? zt : this.zoomNow + (zt - this.zoomNow) * 0.05;
      const curB = map.getBearing();
      const dB = angDiff(curB, this.headingUp ? this.vehHdg : 0);
      const bearing = Math.abs(dB) < 0.05 ? curB + dB : curB + dB * 0.18;
      const pitch = this.tilt ? 52 : 0;
      const c = map.getCenter();
      const moved = Math.abs(c.lng - this.vehPos[0]) > 2e-7 || Math.abs(c.lat - this.vehPos[1]) > 2e-7;
      if (moved || Math.abs(dB) >= 0.05 || z !== this.zoomNow || Math.abs(map.getPitch() - pitch) > 0.1 || this.padDirty) {
        this.zoomNow = z; this.padDirty = false;
        map.jumpTo({ center: this.vehPos, bearing, pitch, zoom: z, padding: this.pad });
      }
    } else if (!a.homeDone) {
      map.jumpTo({ center: this.vehPos });
      if (a.done) a.homeDone = true;
    }
  },

  // 안내 카메라: 차량을 화면 아래쪽에 두고 진행 방향을 위로
  startGuideCam(pad) {
    this.guideCam = true; this.follow = true; this.pad = pad; this.padDirty = true;
    this.zoomNow = this.map.getZoom();
  },
  stopGuideCam() {
    this.guideCam = false; this.follow = false;
    this.map.easeTo({ pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 500 });
  },
};
