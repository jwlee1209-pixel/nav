// Playwright 용 가짜 네트워크: 벡터 타일·글꼴·검색·경로 응답을 만들어 돌려준다(실제 서버에 접속하지 않음)
const geojsonvt = require('geojson-vt');
const vtpbf = require('vt-pbf');
const F = require('./fixtures');

const P = F.P;
const line = (coords, props) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } });
const poly = (ring, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } });
const pt = (c, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: c } });
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];

function buildLayers() {
  const T = [], TN = [];
  const road = (coords, cls, name, extra = {}) => { T.push(line(coords, { class: cls, ...extra })); if (name) TN.push(line(coords, { class: cls, name, 'name:ko': name })); };
  road([P.A, P.B], 'primary', '세종대로');
  road([P.B, P.C], 'primary', '종로');
  road([[P.B[0] - 0.012, P.B[1]], P.B], 'primary', '새문안로');
  road([P.C, P.D, [P.D[0], P.D[1] + 0.006]], 'secondary', '삼일대로');
  road([P.D, P.E, P.F, [P.F[0] + 0.01, P.F[1]]], 'secondary', '율곡로');
  road([[P.F[0], P.F[1] + 0.004], P.F, P.G, [P.G[0], P.G[1] - 0.006]], 'tertiary', '대학로');
  road([[126.955, 37.5605], [127.03, 37.5605]], 'motorway', '도시고속화도로', { oneway: 1 });
  road([[126.955, 37.5598], [127.03, 37.5598]], 'motorway', '도시고속화도로', { oneway: 1 });
  road([[126.982, 37.5605], [126.9862, 37.5652], [126.9862, 37.5719]], 'motorway', '', { ramp: 1 });
  road([P.A, [P.A[0], P.A[1] - 0.004]], 'trunk', '한강대로');
  for (let i = 0; i < 14; i++) {      // 골목길 격자
    const x = 126.970 + i * 0.0025;
    road([[x, 37.5625], [x, 37.5780]], 'minor', i % 3 === 0 ? `${i + 1}번길` : '');
    const y = 37.5625 + i * 0.0012;
    road([[126.968, y], [127.004, y]], i % 4 === 0 ? 'tertiary' : 'minor', i % 4 === 0 ? `${['청계', '을지', '퇴계', '돈화문'][i / 4 | 0] || '동'}로` : '');
  }
  road([[126.9905, 37.5675], [126.9935, 37.5675]], 'secondary', '', { brunnel: 'bridge' });
  road([[126.975, 37.5745], [126.981, 37.5745]], 'primary', '사직터널', { brunnel: 'tunnel' });
  const water = [poly(rect(126.955, 37.5560, 127.03, 37.5585), { class: 'river' })];
  const park = [poly(rect(126.9915, 37.5760, 126.9980, 37.5800), { class: 'park', name: '창경궁' })];
  const landcover = [poly(rect(126.972, 37.5755, 126.978, 37.5790), { class: 'wood' })];
  const building = [];
  for (let i = 0; i < 40; i++) {
    const x = 126.9705 + (i % 10) * 0.0029, y = 37.5630 + Math.floor(i / 10) * 0.0029;
    building.push(poly(rect(x, y, x + 0.0011, y + 0.0007), { render_height: 20 }));
  }
  const place = [
    pt([126.9790, 37.5700], { class: 'suburb', name: '종로1가', 'name:ko': '종로1가' }),
    pt([126.9925, 37.5705], { class: 'suburb', name: '종로4가', 'name:ko': '종로4가' }),
    pt([126.9850, 37.5640], { class: 'quarter', name: '명동', 'name:ko': '명동' }),
    pt([126.9780, 37.5600], { class: 'city', name: '서울', 'name:ko': '서울', rank: 1 }),
  ];
  const poi = [
    pt([126.9774, 37.5663], { class: 'town_hall', name: '서울시청', rank: 3 }),
    pt([127.0003, 37.5711], { class: 'cafe', name: '대학로 카페', rank: 10 }),
    pt([126.9830, 37.5712], { class: 'bank', name: '종로 은행', rank: 12 }),
  ];
  const water_name = [pt([126.99, 37.5572], { class: 'river', name: '가상강', 'name:ko': '가상강' })];
  const L = { transportation: T, transportation_name: TN, water, park, landcover, building, place, poi, water_name };
  const idx = {};
  for (const k in L) idx[k] = geojsonvt({ type: 'FeatureCollection', features: L[k] }, { maxZoom: 14, indexMaxZoom: 4, tolerance: 2, extent: 4096, buffer: 64 });
  return idx;
}

let IDX = null;
function tile(z, x, y) {
  IDX = IDX || buildLayers();
  const layers = {};
  for (const k in IDX) { const t = IDX[k].getTile(z, x, y); if (t && t.features.length) layers[k] = t; }
  if (!Object.keys(layers).length) return Buffer.alloc(0);
  return Buffer.from(vtpbf.fromGeojsonVt(layers, { version: 2 }));
}

const PLACES = [
  { name: '대학로 테스트 목적지', lon: P.G[0], lat: P.G[1], street: '대학로', housenumber: '101', district: '종로구', city: '서울', osm_value: 'theatre' },
  { name: '대학로 공원', lon: 127.0010, lat: 37.5780, street: '대학로', district: '종로구', city: '서울', osm_value: 'park' },
  { name: '대학로 주차장', lon: 126.9990, lat: 37.5690, street: '대학로', district: '종로구', city: '서울', osm_value: 'parking' },
];

async function install(context, opt = {}) {
  const log = opt.log || [];
  await context.route(/tiles\.openfreemap\.org\/planet(\?|$)/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ tilejson: '3.0.0', tiles: ['https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 14, attribution: '' }) }));
  await context.route(/tiles\.openfreemap\.org\/planet\/test\/(\d+)\/(\d+)\/(\d+)\.pbf/, r => {
    const m = r.request().url().match(/(\d+)\/(\d+)\/(\d+)\.pbf/);
    const buf = tile(+m[1], +m[2], +m[3]);
    if (!buf.length) return r.fulfill({ status: 204, body: '' });
    return r.fulfill({ contentType: 'application/x-protobuf', body: buf });
  });
  await context.route(/tiles\.openfreemap\.org\/fonts\//, r => r.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) }));
  await context.route(/cdn\.jsdelivr\.net/, r => r.fulfill({ contentType: 'text/css', body: '' }));
  await context.route(/photon\.komoot\.io\/api/, r => {
    log.push('photon ' + decodeURIComponent(r.request().url()));
    const q = new URL(r.request().url()).searchParams.get('q');
    const hits = PLACES.filter(p => p.name.includes(q) || q.includes('대학로'));
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: hits.map(p => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lon, p.lat] }, properties: { ...p, osm_key: 'amenity' } })) }) });
  });
  await context.route(/photon\.komoot\.io\/reverse/, r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ type: 'FeatureCollection', features: [] }) }));
  await context.route(/nominatim\.openstreetmap\.org\/search/, r => { log.push('nominatim ' + decodeURIComponent(r.request().url())); r.fulfill({ contentType: 'application/json', body: '[]' }); });
  await context.route(/nominatim\.openstreetmap\.org\/reverse/, r => {
    const u = new URL(r.request().url());
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ lat: u.searchParams.get('lat'), lon: u.searchParams.get('lon'), name: '', display_name: '57, 율곡로, 종로구, 서울, 03142, 대한민국', type: 'house', address: { house_number: '57', road: '율곡로', borough: '종로구', city: '서울', postcode: '03142', country: '대한민국' } }) });
  });
  await context.route(/valhalla1\.openstreetmap\.de\/route/, r => {
    const req = JSON.parse(new URL(r.request().url()).searchParams.get('json'));
    log.push('valhalla ' + JSON.stringify(req.costing_options) + ' locs=' + req.locations.length + (req.locations[0].heading != null ? ' heading=' + req.locations[0].heading : ''));
    if (opt.valhallaDown) return r.fulfill({ status: 503, body: 'down' });
    const easy = req.costing_options && req.costing_options.auto && req.costing_options.auto.maneuver_penalty;
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(easy ? F.easyResponse() : F.valhallaResponse()) });
  });
  await context.route(/routing\.openstreetmap\.de\/routed-car/, r => {
    log.push('osrm ' + r.request().url().split('?')[1]);
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(F.osrmResponse()) });
  });
  return log;
}

module.exports = { install, tile, PLACES };
