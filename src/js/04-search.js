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
  return { name, addr, lat, lon, cat: catLabel(r.type, r.category, r.addresstype), src: 'nominatim' };
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
  if (near) { u.searchParams.set('lat', near.lat.toFixed(4)); u.searchParams.set('lon', near.lon.toFixed(4)); }
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

// 검색: 엔터/검색 버튼을 눌렀을 때만 호출(입력 중 자동 호출 없음)
async function searchPlaces(q, near, signal) {
  q = q.trim().replace(/\s+/g, ' ');
  if (!q) return { items: [], errors: [] };
  const key = q + '|' + (near ? near.lat.toFixed(1) + ',' + near.lon.toFixed(1) : '');
  const cached = cacheGet(key);
  if (cached) return { items: withDistance(cached, near), errors: [], cached: true };

  const errors = [];
  let items = [];
  const addressy = looksLikeAddress(q);
  try { items = await photonSearch(q, near, signal); } catch (e) { if (signal && signal.aborted) throw e; errors.push('Photon'); }
  if (addressy || items.length < 3) {
    try {
      const more = await nominatimSearch(q, near, signal);
      items = addressy ? [...more, ...items] : [...items, ...more];
    } catch (e) { if (signal && signal.aborted) throw e; errors.push('Nominatim'); }
  }
  // 같은 장소 중복 제거(50m 이내 같은 이름)
  const out = [];
  for (const it of items) {
    if (out.some(o => o.name === it.name && hav([o.lon, o.lat], [it.lon, it.lat]) < 50)) continue;
    out.push(it);
  }
  if (out.length) cachePut(key, out);
  return { items: withDistance(out, near), errors };
}

function withDistance(items, near) {
  return items.map(it => ({ ...it, dist: near ? hav([near.lon, near.lat], [it.lon, it.lat]) : null }));
}

const revCache = new Map();
async function reversePlace(lon, lat, signal) {
  const key = lat.toFixed(4) + ',' + lon.toFixed(4);
  if (revCache.has(key)) return revCache.get(key);
  let place = null;
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
      const d = await photonPace(() => fetchJSON(u.toString(), { timeout: 8000, signal }));
      if (d.features && d.features[0]) place = photonToPlace(d.features[0]);
    } catch (e) { if (signal && signal.aborted) throw e; }
  }
  const res = place ? { ...place, lat, lon } : { name: '선택한 위치', addr: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, lat, lon, cat: '' };
  revCache.set(key, res);
  return res;
}
