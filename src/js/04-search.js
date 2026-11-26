// ───────────────────────── 장소 검색(무료 OSM 지오코더) ─────────────────────────
// · Photon(komoot) : 위치 가중 검색, 1차
// · Nominatim(OSMF): 주소형 검색 보완. 이용 정책상 자동완성 금지·초당 1회 이하·결과 캐시 필수
//   https://operations.osmfoundation.org/policies/nominatim/
const PHOTON = 'https://photon.komoot.io';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const KR_BBOX = [124.4, 32.9, 132.1, 38.9];
const photonPace = pacer(700);
const nominatimPace = pacer(1100);

const CAT_KO = {
  restaurant: '음식점', fast_food: '패스트푸드', food_court: '푸드코트', cafe: '카페', bar: '술집', pub: '술집', bakery: '빵집',
  fuel: '주유소', charging_station: '전기차 충전소', parking: '주차장', car_wash: '세차장', car_repair: '정비소', car: '자동차 판매',
  hospital: '병원', clinic: '의원', doctors: '의원', dentist: '치과', pharmacy: '약국', veterinary: '동물병원',
  school: '학교', kindergarten: '유치원', university: '대학교', college: '대학', library: '도서관',
  bank: '은행', atm: 'ATM', post_office: '우체국', police: '경찰서', fire_station: '소방서', townhall: '관공서', courthouse: '법원',
  cinema: '영화관', theatre: '공연장', arts_centre: '문화시설', place_of_worship: '종교시설', community_centre: '주민센터',
  convenience: '편의점', supermarket: '마트', mall: '쇼핑몰', department_store: '백화점', marketplace: '시장',
  hotel: '호텔', motel: '모텔', guest_house: '숙소', hostel: '숙소', camp_site: '캠핑장',
  attraction: '관광지', museum: '박물관', viewpoint: '전망대', zoo: '동물원', theme_park: '테마파크', park: '공원',
  station: '역', halt: '역', bus_station: '버스터미널', bus_stop: '버스정류장', subway_entrance: '지하철 출입구',
  aerodrome: '공항', terminal: '터미널', ferry_terminal: '여객터미널', toilets: '화장실',
  motorway_junction: 'IC·JC', services: '휴게소', rest_area: '쉼터', stadium: '경기장', sports_centre: '체육시설',
  golf_course: '골프장', city: '시', town: '시·군', village: '마을', hamlet: '마을', suburb: '동', quarter: '동',
  neighbourhood: '동네', house: '주소', building: '건물', apartments: '아파트', residential: '주거지역',
  peak: '산', island: '섬', water: '물가', river: '하천', beach: '해변',
};
function catLabel(...keys) {
  for (const k of keys) if (k && CAT_KO[k]) return CAT_KO[k];
  return '';
}

const uniqJoin = (arr, sep = ' ') => {
  const out = [];
  for (const s of arr) { const t = s && String(s).trim(); if (t && !out.includes(t)) out.push(t); }
  return out.join(sep);
};

function photonToPlace(f) {
  const p = f.properties || {}, c = f.geometry && f.geometry.coordinates;
  if (!c) return null;
  const road = p.street ? p.street + (p.housenumber ? ' ' + p.housenumber : '') : '';
  const name = p.name || road || p.district || p.city || '이름 없는 장소';
  const addr = uniqJoin([p.state, p.county, p.city, p.district, p.locality, road].filter(x => x !== name));
  return { name, addr, lat: c[1], lon: c[0], cat: catLabel(p.osm_value, p.type), src: 'photon' };
}

function nominatimAddr(a) {
  if (!a) return '';
  const road = a.road ? a.road + (a.house_number ? ' ' + a.house_number : '') : '';
  return uniqJoin([a.province || a.state, a.city, a.county, a.borough || a.city_district || a.district,
    a.town, road || a.suburb || a.quarter || a.village || a.hamlet || a.neighbourhood]);
}

function nominatimToPlace(r) {
  const lat = +r.lat, lon = +r.lon;
  if (!isFinite(lat) || !isFinite(lon)) return null;
  const first = String(r.display_name || '').split(',')[0].trim();
  const a = r.address || {};
  const roadAddr = a.road ? a.road + (a.house_number ? ' ' + a.house_number : '') : '';
  const name = r.name || roadAddr || first || '이름 없는 장소';
  let addr = nominatimAddr(r.address);
  if (!addr) addr = String(r.display_name || '').split(',').slice(1).map(s => s.trim())
    .filter(s => s && s !== '대한민국' && !/^\d{5}$/.test(s)).reverse().join(' ');
  return { name, addr, lat, lon, cat: catLabel(r.type, r.category, r.addresstype), src: 'nominatim', poi: !!r.name };
}

function looksLikeAddress(q) {
  return /\d/.test(q) && /(로|길|동|리|가|번지|읍|면)\s*\d|\d+\s*(번길|번지|호)|^\d{5}$/.test(q);
}

// 캐시(이용 정책: 결과를 보관해 같은 요청을 반복하지 않는다)
function cacheGet(key) {
  const hit = store.scache.find(x => x[0] === key);
  return hit && Date.now() - hit[1] < 7 * 86400000 ? hit[2] : null;
}
function cachePut(key, val) {
  store.scache = store.scache.filter(x => x[0] !== key);
  store.scache.push([key, Date.now(), val]);
  if (store.scache.length > 40) store.scache.shift();
  saveStore();
}

async function photonSearch(q, near, signal) {
  const u = new URL(PHOTON + '/api/');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '12');
  u.searchParams.set('bbox', KR_BBOX.join(','));
  // lang 을 비우면 Photon 은 브라우저 언어 목록(ko-KR, ko, en-US, en …)에서 자기가 아는 첫 언어(영어)를 골라
  // 'Lets Run Park: Yeongcheon' 처럼 영문 이름·주소를 돌려준다. default = 현지(한국어) 이름
  u.searchParams.set('lang', 'default');
  if (near) { u.searchParams.set('lat', (+near.lat).toFixed(4)); u.searchParams.set('lon', (+near.lon).toFixed(4)); }
  const data = await photonPace(() => fetchJSON(u.toString(), { timeout: 10000, signal }));
  return (data.features || []).map(photonToPlace).filter(Boolean);
}

async function nominatimSearch(q, near, signal) {
  const u = new URL(NOMINATIM + '/search');
  u.searchParams.set('q', q);
  u.searchParams.set('format', 'jsonv2');
  u.searchParams.set('addressdetails', '1');
  u.searchParams.set('limit', '10');
  u.searchParams.set('accept-language', 'ko');
  u.searchParams.set('countrycodes', 'kr');
  if (near) u.searchParams.set('viewbox', [near.lon - 0.5, near.lat + 0.4, near.lon + 0.5, near.lat - 0.4].map(v => v.toFixed(3)).join(','));
  const data = await nominatimPace(() => fetchJSON(u.toString(), { timeout: 10000, signal }));
  return (Array.isArray(data) ? data : []).map(nominatimToPlace).filter(Boolean);
}

// 붙여 쓴 아파트·건물 이름이나 번지까지 쓴 주소가 지도 자료(OSM)에 그대로 없을 때 차례로 줄여 다시 찾는다
//  '가온누리타운2차아파트' → '가온누리타운2차' → '가온누리타운 2차' → '누리타운 2차' → '누리타운'(근처에서만)
//  '서울 가상구 가온로3가길 7' → '서울 가상구 가온로3가길'(건물 번호 없이 길 위치)
function queryVariants(q) {
  const out = [];
  const add = (s, kind) => { s = String(s).replace(/\s+/g, ' ').trim(); if (s.length >= 2 && !out.some(o => o.q === s)) out.push({ q: s, kind }); };
  add(q, 'same');
  if (looksLikeAddress(q)) {
    const street = q.replace(/\s*(?:산\s*)?\d+(?:-\d+)?(?:\s*번지)?\s*$/, '');
    if (street !== q && /[가-힣]/.test(street)) add(street, 'street');
    return out;
  }
  const noApt = q.replace(/\s*(아파트|APT)$/i, '');
  add(noApt, 'name');
  const spaced = noApt.replace(/([가-힣])(\d)/g, '$1 $2');
  add(spaced, 'name');
  const words = spaced.split(' ');
  if (/^[가-힣]{5,}$/.test(words[0])) {                  // 앞의 동네 이름(두 글자)을 뗀다: 가온누리타운 → 누리타운(근처에서만)
    const rest = [words[0].slice(2), ...words.slice(1)];
    add(rest.join(' '), 'short');
    if (rest.length > 1) add(rest[0], 'core');
  }
  return out;
}
const LOCAL_KINDS = new Set(['short', 'core']);   // 이름을 줄여 흔해진 검색어: 근처 결과만 쓴다

const normName = s => String(s || '').replace(/\s+|아파트|APT/gi, '');

// 한 가지 검색어로: 브이월드(인증키가 있으면) → Photon → (주소이거나 결과가 적으면) Nominatim
async function searchOnce(v, near, signal, errs) {
  const addressy = looksLikeAddress(v.q);
  let vw = [], osm = [];
  if (vwKey()) {
    try { vw = await vworldSearch(v.q, near, signal, { local: LOCAL_KINDS.has(v.kind) }); }
    catch (e) { if (signal && signal.aborted) throw e; errs.vw = errs.vw || vwErrText(e); }
  }
  try { osm = await photonSearch(v.q, near, signal); } catch (e) { if (signal && signal.aborted) throw e; errs.list.add('Photon'); }
  if (addressy || (v.kind === 'same' && vw.length + osm.length < 3)) {
    try {
      const more = await nominatimSearch(v.q, near, signal);
      osm = addressy ? [...more, ...osm] : [...osm, ...more];
    } catch (e) { if (signal && signal.aborted) throw e; errs.list.add('Nominatim'); }
  }
  if (LOCAL_KINDS.has(v.kind) && near) {
    const close = it => hav([near.lon, near.lat], [it.lon, it.lat]) < 50000;
    vw = vw.filter(close); osm = osm.filter(close);
  }
  // 중복 제거: 50m 안의 같은 이름, 또는 브이월드 결과와 40m 안에서 이름이 겹치는 OSM 결과
  const out = [];
  for (const it of [...vw, ...osm]) {
    const dup = out.some(o => {
      const d = hav([o.lon, o.lat], [it.lon, it.lat]);
      if (o.name === it.name && d < 50) return true;
      const a = normName(o.name), b = normName(it.name);
      return o.src === 'vworld' && d < 40 && a && b && (a.includes(b) || b.includes(a));
    });
    if (!dup) out.push(it);
  }
  return out;
}

// 검색: 엔터/검색 버튼을 눌렀을 때만 호출(입력 중 자동 호출 없음)
async function searchPlaces(q, near, signal) {
  q = q.trim().replace(/\s+/g, ' ');
  if (!q) return { items: [], errors: [] };
  // 'ko|': v1.7 이전(영문 섞인) 캐시는 쓰지 않음, 'v|': 브이월드를 쓴 결과
  const key = 'ko|' + (vwKey() ? 'v|' : '') + q + '|' + (near ? near.lat.toFixed(1) + ',' + near.lon.toFixed(1) : '');
  const hit = cacheGet(key);
  if (hit) { const c = Array.isArray(hit) ? { items: hit } : hit; return { ...c, items: withDistance(c.items, near), errors: [], cached: true }; }

  const errs = { list: new Set(), vw: '' };
  let items = [], used = null;
  for (const v of queryVariants(q)) {
    items = await searchOnce(v, near, signal, errs);
    if (items.length) { if (v.kind !== 'same') used = v; break; }
    if (v.kind === 'same' && errs.list.size >= 2 && !vwKey()) break;   // 검색 서버에 닿지 않으면 줄여 봐야 소용없다
  }
  const note = !used ? '' : used.kind === 'street'
    ? `‘${q}’의 건물 번호가 지도 자료(OpenStreetMap)에 없어 ‘${used.q}’ 길 위치를 보여 줍니다.`
    : `‘${q}’ 그대로는 찾지 못해 ‘${used.q}’${josa(used.q, '으로/로').slice(used.q.length)} 찾은 결과입니다${LOCAL_KINDS.has(used.kind) ? '(근처만)' : ''}.`;
  const res = { items, note, used: used && used.q };
  if (items.length) cachePut(key, res);
  return { ...res, items: withDistance(items, near), errors: [...errs.list], vwErr: errs.vw };
}

function withDistance(items, near) {
  return items.map(it => ({ ...it, dist: near ? hav([near.lon, near.lat], [it.lon, it.lat]) : null }));
}

const revCache = new Map();
async function reversePlace(lon, lat, signal) {
  const key = (vwKey() ? 'v' : '') + lat.toFixed(4) + ',' + lon.toFixed(4);
  if (revCache.has(key)) return revCache.get(key);
  let place = null, vw = null;
  if (vwKey()) {   // 국가 주소(도로명)를 먼저: OSM 에 건물 번호가 없는 곳이 많다
    try { vw = await vworldReverse(lon, lat, signal); } catch (e) { if (signal && signal.aborted) throw e; }
  }
  try {
    const u = new URL(NOMINATIM + '/reverse');
    u.searchParams.set('lat', lat.toFixed(6)); u.searchParams.set('lon', lon.toFixed(6));
    u.searchParams.set('format', 'jsonv2'); u.searchParams.set('zoom', '18');
    u.searchParams.set('addressdetails', '1'); u.searchParams.set('accept-language', 'ko');
    const r = await nominatimPace(() => fetchJSON(u.toString(), { timeout: 8000, signal }));
    if (r && !r.error) place = nominatimToPlace(r);
  } catch (e) { if (signal && signal.aborted) throw e; }
  if (!place) {
    try {
      const u = new URL(PHOTON + '/reverse');
      u.searchParams.set('lat', lat.toFixed(6)); u.searchParams.set('lon', lon.toFixed(6));
      u.searchParams.set('lang', 'default');
      const d = await photonPace(() => fetchJSON(u.toString(), { timeout: 8000, signal }));
      if (d.features && d.features[0]) place = photonToPlace(d.features[0]);
    } catch (e) { if (signal && signal.aborted) throw e; }
  }
  if (vw) place = place && place.poi ? { ...place, addr: vw.addr } : { ...vw, cat: place ? place.cat : '' };
  const res = place ? { ...place, lat, lon } : { name: '선택한 위치', addr: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon, cat: '' };
  revCache.set(key, res);
  return res;
}

// ── 저장된 장소의 영문 이름·주소를 한글로 고치기(v1.6 까지 Photon 이 영어로 돌려준 것) ──
const hasHangul = s => /[가-힣]/.test(s || '');
const latinOnly = s => /[A-Za-z]/.test(s || '') && !hasHangul(s);
const needsKo = p => !!p && (latinOnly(p.name) || latinOnly(p.addr));

// 같은 장소를 한국어로 다시 찾는다: 이름으로 Photon 검색(영문 이름도 찾아짐) → 300m 안의 가장 가까운 결과.
// 이름은 같은 장소를 찾았을 때만 바꾸고, 주소는 못 찾으면 그 좌표의 주소(Nominatim 한국어)로 바꾼다.
async function koreanize(p) {
  const out = { name: null, addr: null, err: false };
  const near = { lat: +p.lat, lon: +p.lon }, d = r => hav([r.lon, r.lat], [near.lon, near.lat]);
  let errs = 0;
  try {
    const hit = (await photonSearch(p.name, near)).filter(r => d(r) < 300).sort((a, b) => d(a) - d(b))[0];
    if (hit) {
      if (latinOnly(p.name) && hasHangul(hit.name)) out.name = hit.name;
      if (hasHangul(hit.addr)) out.addr = hit.addr;
    }
  } catch (e) { errs++; }
  if (!out.addr && latinOnly(p.addr)) {
    const r = await reversePlace(near.lon, near.lat);
    if (hasHangul(r.addr)) out.addr = r.addr; else errs++;
  }
  out.err = errs > 0 && !out.name && !out.addr;
  return out;
}

async function fixSavedNames() {
  if (store.meta.ko) return 0;
  store.scache = store.scache.filter(x => String(x[0]).startsWith('ko|'));
  const places = () => [store.home, store.work, ...store.favs, ...store.recents].filter(Boolean);
  const dests = () => store.trips.map(t => t.dest).filter(Boolean);
  const todo = new Map();
  for (const p of [...places(), ...dests()]) if (needsKo(p) && !todo.has(placeKey(p))) todo.set(placeKey(p), p);
  let changed = 0, failed = 0;
  for (const [k, p] of [...todo].slice(0, 40)) {
    const fix = await koreanize(p);
    if (fix.err) { failed++; continue; }
    for (const o of places()) if (placeKey(o) === k) {
      if (fix.name && latinOnly(o.name)) { o.name = fix.name; changed++; }
      if (fix.addr && latinOnly(o.addr)) { o.addr = fix.addr; changed++; }
    }
    for (const o of dests()) if (placeKey(o) === k && fix.name && latinOnly(o.name)) o.name = fix.name;
  }
  if (!failed) store.meta.ko = 1;     // 네트워크 오류로 못 고친 것이 있으면 다음에 다시
  saveStore(true);
  return changed;
}
