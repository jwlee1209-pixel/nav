// ───────────────────────── 저장소(이 기기 브라우저) ─────────────────────────
const STORE_KEY = 'gilnavi.v1';

const DEFAULT_SETTINGS = {
  pref: 'fast',          // fast 추천 · short 최단거리 · free 무료도로 · nohwy 고속도로 회피
  engine: 'auto',        // auto · valhalla · osrm
  voice: true,
  voiceName: '',
  voiceRate: 1.05,
  verbosity: 'normal',   // brief 간단 · normal 보통 · detail 자세히
  theme: 'auto',         // auto 일출·일몰 · day · night
  headingUp: true,
  tilt: true,
  wakeLock: true,
  fuelEff: 12,           // km/L
  fuelPrice: 1650,       // 원/L
  showFuel: true,
  etaLearn: true,
  suggest: true,
};

const store = {
  settings: { ...DEFAULT_SETTINGS },
  home: null,            // {name, addr, lat, lon}
  work: null,
  favs: [],              // [{id, name, addr, lat, lon, ts}]
  recents: [],           // [{name, addr, lat, lon, ts, n}]
  trips: [],             // 실제 주행 기록(모의 주행 제외)
  view: null,            // 마지막 지도 위치 {c:[lon,lat], z}
  scache: [],            // 검색 결과 캐시 [[key, ts, results]]
};

function placeKey(p) { return p ? `${(+p.lat).toFixed(4)},${(+p.lon).toFixed(4)}` : ''; }

function cleanPlace(p) {
  if (!p || !isFinite(+p.lat) || !isFinite(+p.lon)) return null;
  return { id: p.id || uid(), name: String(p.name || '').slice(0, 80) || '이름 없는 장소', addr: String(p.addr || '').slice(0, 160), lat: +p.lat, lon: +p.lon, ts: +p.ts || Date.now(), ...(p.n ? { n: +p.n } : {}) };
}

function applyData(d) {
  if (!d || typeof d !== 'object') return false;
  if (d.settings && typeof d.settings === 'object') {
    for (const k in DEFAULT_SETTINGS) if (k in d.settings && typeof d.settings[k] === typeof DEFAULT_SETTINGS[k]) store.settings[k] = d.settings[k];
  }
  store.home = cleanPlace(d.home);
  store.work = cleanPlace(d.work);
  store.favs = (Array.isArray(d.favs) ? d.favs : []).map(cleanPlace).filter(Boolean).slice(0, 100);
  store.recents = (Array.isArray(d.recents) ? d.recents : []).map(cleanPlace).filter(Boolean).slice(0, 30);
  store.trips = (Array.isArray(d.trips) ? d.trips : []).filter(t => t && isFinite(t.ts) && isFinite(t.pred) && isFinite(t.act)).slice(-300);
  if (d.view && Array.isArray(d.view.c) && isFinite(d.view.z)) store.view = d.view;
  if (Array.isArray(d.scache)) store.scache = d.scache.slice(-40);
  return true;
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) applyData(JSON.parse(raw));
  } catch (e) { /* 저장소를 쓸 수 없는 환경: 기본값으로 동작 */ }
}

let _saveT = 0;
function saveStore(now) {
  clearTimeout(_saveT);
  const run = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 무시 */ } };
  if (now) run(); else _saveT = setTimeout(run, 250);
}

function exportData() {
  const { scache, ...rest } = store;
  return JSON.stringify({ app: 'gilnavi', ver: 1, at: new Date().toISOString(), ...rest }, null, 1);
}

function addRecent(p) {
  const c = cleanPlace(p);
  if (!c) return;
  const k = placeKey(c);
  const old = store.recents.find(r => placeKey(r) === k);
  store.recents = store.recents.filter(r => placeKey(r) !== k);
  c.n = (old && old.n || 0) + 1;
  store.recents.unshift(c);
  store.recents = store.recents.slice(0, 30);
  saveStore();
}

function isFav(p) { const k = placeKey(p); return store.favs.some(f => placeKey(f) === k); }
function toggleFav(p) {
  const k = placeKey(p);
  if (isFav(p)) store.favs = store.favs.filter(f => placeKey(f) !== k);
  else { const c = cleanPlace(p); if (c) store.favs.unshift(c); }
  saveStore();
  return isFav(p);
}

// ── 개인화 1: 내 주행 기록으로 도착 시간 보정 ──
// 시간대: 평일 출근(7–10시) · 평일 퇴근(17–20시) · 평일 기타 · 주말
function timeBand(ts) {
  const d = new Date(ts), dow = d.getDay(), hr = d.getHours() + d.getMinutes() / 60;
  if (dow === 0 || dow === 6) return 'weekend';
  if (hr >= 7 && hr < 10) return 'am';
  if (hr >= 17 && hr < 20) return 'pm';
  return 'day';
}
const BAND_KO = { am: '평일 출근 시간', pm: '평일 퇴근 시간', day: '평일 낮·밤', weekend: '주말' };

function median(a) {
  const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function etaFactor(ts = Date.now()) {
  if (!store.settings.etaLearn) return { k: 1, n: 0, band: null };
  const good = store.trips.filter(t => !t.sim && t.arrived && t.dist >= 2000 && t.pred > 120 && (t.rr || 0) <= 1)
    .map(t => ({ r: t.act / t.pred, band: timeBand(t.ts) }))
    .filter(t => t.r > 0.6 && t.r < 3);
  const band = timeBand(ts);
  const inBand = good.filter(t => t.band === band).slice(-20);
  if (inBand.length >= 3) return { k: clamp(median(inBand.map(t => t.r)), 0.8, 2.5), n: inBand.length, band };
  const all = good.slice(-20);
  if (all.length >= 3) return { k: clamp(median(all.map(t => t.r)), 0.8, 2.5), n: all.length, band: null };
  return { k: 1, n: 0, band: null };
}

// ── 개인화 2: 요일·시간대가 비슷한 때 자주 간 곳 추천 ──
function suggestions(here, ts = Date.now()) {
  if (!store.settings.suggest) return [];
  const now = new Date(ts), hr = now.getHours() + now.getMinutes() / 60, wk = now.getDay() % 6 !== 0;
  const score = new Map();
  for (const t of store.trips) {
    if (!t.dest || !t.arrived) continue;
    const d = new Date(t.ts), th = d.getHours() + d.getMinutes() / 60, twk = d.getDay() % 6 !== 0;
    let dh = Math.abs(th - hr); dh = Math.min(dh, 24 - dh);
    const w = Math.exp(-(dh * dh) / (2 * 1.5 * 1.5)) * (twk === wk ? 1 : 0.3) * Math.exp(-(ts - t.ts) / (86400000 * 60));
    const k = placeKey(t.dest);
    const s = score.get(k) || { p: t.dest, s: 0, n: 0 };
    s.s += w; s.n++;
    score.set(k, s);
  }
  let list = [...score.values()].filter(x => x.s >= 1.2);
  if (here) list = list.filter(x => hav([here.lon, here.lat], [x.p.lon, x.p.lat]) > 500);
  list.sort((a, b) => b.s - a.s);
  const out = list.slice(0, 2).map(x => ({ ...x.p, why: '이 시간대에 자주 가는 곳' }));
  // 기록이 없을 때: 평일 아침엔 회사, 저녁엔 집
  if (!out.length && wk) {
    const far = p => p && (!here || hav([here.lon, here.lat], [p.lon, p.lat]) > 500);
    if (hr >= 6 && hr < 10 && far(store.work)) out.push({ ...store.work, why: '평일 아침' });
    if (hr >= 16 && hr < 22 && far(store.home)) out.push({ ...store.home, why: '평일 저녁' });
  }
  return out;
}
