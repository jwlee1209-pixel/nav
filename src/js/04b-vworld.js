// ───────────────────────── 한국 주소·건물 검색(국토교통부 브이월드, 무료 인증키) ─────────────────────────
// OpenStreetMap 에 없는 아파트·건물 이름과 도로명 주소를 국가 자료로 찾는다. 인증키가 있을 때만 쓴다.
// 인증키: 브이월드(vworld.kr)에서 무료 발급 — 서비스 URL 에 이 앱의 주소(https://jwlee1209-pixel.github.io)를 등록.
//  · 검색 API 2.0  https://api.vworld.kr/req/search  (type=place 장소·건물 이름, type=address 도로명·지번 주소)
//  · 지오코더 2.0  https://api.vworld.kr/req/address (request=getAddress 좌표 → 주소)
// 브라우저에서 바로 부를 수 있도록 JSONP(callback)로 요청한다.
const VWORLD = 'https://api.vworld.kr/req/';
const vworldPace = pacer(250);
const vwKey = () => String((store.settings && store.settings.vworldKey) || '').trim();
// 인증키를 받을 때 등록한 서비스 주소. 앱 주소(https)로 열면 그 주소, 파일로 열면 기본 앱 주소
const vwDomain = () => (typeof location !== 'undefined' && location.protocol === 'https:' ? location.origin : 'https://jwlee1209-pixel.github.io');

let _jsonpN = 0;
function jsonp(url, { timeout = 10000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const cb = '__gilnaviVw' + (++_jsonpN) + Date.now().toString(36);
    const s = document.createElement('script');
    let done = false, timer = 0;
    const fail = kind => { const e = new Error(kind); e.kind = kind; return e; };
    const finish = (err, data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      window[cb] = () => {};                          // 늦게 도착한 응답은 버린다
      setTimeout(() => { try { delete window[cb]; } catch (e) { window[cb] = undefined; } }, 60000);
      s.remove();
      if (err) reject(err); else resolve(data);
    };
    const onAbort = () => finish(fail('aborted'));
    if (signal) { if (signal.aborted) { onAbort(); return; } signal.addEventListener('abort', onAbort); }
    timer = setTimeout(() => finish(fail('timeout')), timeout);
    window[cb] = data => finish(null, data);
    s.async = true;
    s.onerror = () => finish(fail('network'));
    s.onload = () => setTimeout(() => finish(fail('bad')), 0);   // 스크립트는 왔는데 callback 을 안 불렀다(키 오류 응답 등)
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb;
    document.head.appendChild(s);
  });
}

function vwURL(path, params) {
  const u = new URL(VWORLD + path);
  for (const k in params) if (params[k] != null && params[k] !== '') u.searchParams.set(k, params[k]);
  u.searchParams.set('format', 'json');
  u.searchParams.set('errorformat', 'json');
  u.searchParams.set('key', vwKey());
  u.searchParams.set('domain', vwDomain());
  return u.toString();
}

// 응답: {response: {status: OK | NOT_FOUND | ERROR, result: …, error: {code, text}}}
async function vwCall(path, params, signal) {
  const data = await vworldPace(() => jsonp(vwURL(path, params), { timeout: 10000, signal }));
  const r = data && data.response;
  if (!r) { const e = new Error('응답 형식이 다릅니다'); e.kind = 'vworld'; throw e; }
  if (r.status === 'NOT_FOUND') return null;
  if (r.status !== 'OK') {
    const e = new Error(String((r.error && (r.error.text || r.error.code)) || r.status || '오류'));
    e.kind = 'vworld'; e.code = r.error && r.error.code;
    throw e;
  }
  return r.result || null;
}

// '서울특별시 가상구 가온로3가길 7' → '가온로3가길 7', '서울특별시 가상구 가온동 170' → '가온동 170'
function tailAddr(s) {
  s = String(s || '').trim();
  const m = s.match(/(\S+(?:로|길|동|리|가)\s*(?:산\s*)?\d+(?:-\d+)?)$/);
  return m ? m[1] : s.split(' ').slice(-2).join(' ');
}
const vwCat = c => String(c || '').split('>').map(x => x.trim()).filter(Boolean).pop() || '';

// 검색 결과 한 건 → 앱의 장소 형식
function vwItem(it, kind) {
  const pt = it && it.point;
  const lon = pt ? +pt.x : NaN, lat = pt ? +pt.y : NaN;
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) < 1) return null;
  const a = it.address || {};
  const road = String(a.road || '').trim(), parcel = String(a.parcel || '').trim();
  if (kind === 'place') {
    const name = String(it.title || '').trim() || tailAddr(road || parcel);
    return { name, addr: road || parcel, lat, lon, cat: vwCat(it.category), src: 'vworld' };
  }
  const main = kind === 'road' ? (road || parcel) : (parcel || road);
  const bld = String(a.bldnm || '').trim();
  return { name: bld || tailAddr(main), addr: main, lat, lon, cat: bld ? '건물' : '주소', src: 'vworld' };
}

// 검색: 주소처럼 보이면 도로명 → 지번 주소, 아니면(또는 주소로 못 찾으면) 장소 이름
async function vworldSearch(q, near, signal, { local = false } = {}) {
  const base = { service: 'search', request: 'search', version: '2.0', crs: 'EPSG:4326', size: 15, page: 1, query: q };
  if (local && near) base.bbox = [near.lon - 0.25, near.lat - 0.2, near.lon + 0.25, near.lat + 0.2].map(v => (+v).toFixed(4)).join(',');
  const out = [];
  const add = (res, kind) => { for (const it of (res && res.items) || []) { const p = vwItem(it, kind); if (p) out.push(p); } };
  if (looksLikeAddress(q)) {
    add(await vwCall('search', { ...base, type: 'address', category: 'road' }, signal), 'road');
    if (!out.length) add(await vwCall('search', { ...base, type: 'address', category: 'parcel' }, signal), 'parcel');
  }
  if (!out.length) add(await vwCall('search', { ...base, type: 'place' }, signal), 'place');
  return out;
}

// 좌표 → 도로명 주소(없으면 지번)
async function vworldReverse(lon, lat, signal) {
  const res = await vwCall('address', { service: 'address', request: 'getAddress', version: '2.0', crs: 'EPSG:4326', point: `${(+lon).toFixed(6)},${(+lat).toFixed(6)}`, type: 'both' }, signal);
  const list = Array.isArray(res) ? res : res ? [res] : [];
  const pick = list.find(x => x && x.type === 'road' && x.text) || list.find(x => x && x.text);
  return pick ? { name: tailAddr(pick.text), addr: String(pick.text).trim(), cat: '', src: 'vworld' } : null;
}

// 설정 화면의 '시험': 인증키·서비스 주소가 맞는지 실제로 한 번 찾아 본다
async function vworldTest() {
  try {
    const r = await vworldSearch('세종대로 110', null);
    return r.length ? { ok: true, msg: `정상입니다 — ‘세종대로 110’ → ${r[0].name}` } : { ok: true, msg: '연결은 되지만 결과가 없습니다' };
  } catch (e) {
    return { ok: false, msg: vwErrText(e) };
  }
}
function vwErrText(e) {
  if (e.kind === 'vworld') return `브이월드 응답: ${e.message}`;
  if (e.kind === 'bad') return '브이월드가 알 수 없는 응답을 보냈습니다. 인증키와 등록한 서비스 주소를 확인하세요';
  return '브이월드 서버에 연결하지 못했습니다. 인증키·서비스 주소·인터넷 연결을 확인하세요';
}
