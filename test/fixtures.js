// 시험용 가짜 경로(서울시청 부근 가상의 도로) — Valhalla·OSRM 응답 형식으로 만든다
const load = require('./load');
const G = load(['01-geo', '00-util']);

const P = {
  A: [126.97800, 37.56650], B: [126.97800, 37.57190], C: [126.98250, 37.57190],
  D: [126.98250, 37.57325], E: [126.98450, 37.57500], F: [126.99950, 37.57500], G: [126.99950, 37.57100],
};
// 구간: [시작, 끝, 도로명, 고속도로?]
const LEGS = [
  ['A', 'B', '세종대로', false],
  ['B', 'C', '종로', false],
  ['C', 'D', '삼일대로', false],
  ['D', 'E', '율곡로', false],
  ['E', 'F', '율곡로', false],
  ['F', 'G', '대학로', false],
];

function densify(a, b, step = 40) {
  const d = G.hav(a, b), n = Math.max(1, Math.round(d / step)), out = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  return out;
}

function build(legs = LEGS, pts = P, speedKmh = 40) {
  const coords = [], segStart = [];
  for (const [a, b] of legs) {
    const seg = densify(pts[a], pts[b]);
    segStart.push(coords.length ? coords.length - 1 : 0);
    if (coords.length) coords.push(...seg.slice(1)); else coords.push(...seg);
  }
  const cum = G.cumDist(coords);
  const v = speedKmh / 3.6;
  // 회전 지점: 구간 시작마다(도로명이 바뀌는 곳)
  const turns = [];
  legs.forEach(([a, b, name, hw], i) => {
    if (i > 0 && legs[i - 1][2] === name) { turns[turns.length - 1].endIdx = segStart[i + 1] != null ? segStart[i + 1] : coords.length - 1; return; }
    turns.push({ idx: segStart[i], name, hw, endIdx: segStart[i + 1] != null ? segStart[i + 1] : coords.length - 1, a, b });
  });
  return { coords, cum, turns, v };
}

function valhallaResponse(opt = {}) {
  const { coords, cum, turns, v } = build(opt.legs, opt.pts, opt.speed);
  const types = opt.vtypes || [1, 10, 15, 9, 10];
  const man = turns.map((t, i) => ({
    type: types[i] || 8, instruction: '', street_names: [t.name], begin_shape_index: t.idx, end_shape_index: t.endIdx,
    length: (cum[t.endIdx] - cum[t.idx]) / 1000, time: (cum[t.endIdx] - cum[t.idx]) / v, highway: !!t.hw, toll: false,
  }));
  man.push({ type: 5, instruction: '', begin_shape_index: coords.length - 1, end_shape_index: coords.length - 1, length: 0, time: 0 });
  const total = cum[cum.length - 1];
  const trip = { legs: [{ shape: G.encodePolyline(coords, 6), maneuvers: man, summary: {} }], summary: { length: total / 1000, time: total / v, has_toll: false, has_highway: false, has_ferry: false } };
  // 대안 경로: 같은 길이지만 조금 돌아가는 가짜(시험용)
  const alt = JSON.parse(JSON.stringify(trip));
  alt.summary.time *= 1.18; alt.summary.length *= 1.07;
  return { trip, alternates: opt.noAlt ? [] : [{ trip: alt }] };
}

function osrmResponse(opt = {}) {
  const { coords, cum, turns, v } = build(opt.legs, opt.pts, opt.speed);
  const mods = opt.omods || [null, 'right', 'left', 'slight right', 'right'];
  const steps = turns.map((t, i) => {
    const g = coords.slice(t.idx, t.endIdx + 1);
    const bb = i === 0 ? 0 : G.brg(coords[t.idx - 1], coords[t.idx]);
    const ba = G.brg(coords[t.idx], coords[t.idx + 1]);
    return {
      geometry: { type: 'LineString', coordinates: g }, name: t.name, mode: 'driving',
      maneuver: { type: i === 0 ? 'depart' : 'turn', modifier: mods[i] || undefined, location: coords[t.idx], bearing_before: bb, bearing_after: ba },
      distance: cum[t.endIdx] - cum[t.idx], duration: (cum[t.endIdx] - cum[t.idx]) / v,
      intersections: [{ classes: t.hw ? ['motorway'] : [] }],
    };
  });
  const last = coords[coords.length - 1];
  steps.push({ geometry: { type: 'LineString', coordinates: [last, last] }, name: '대학로', mode: 'driving', maneuver: { type: 'arrive', modifier: 'right', location: last, bearing_before: 180, bearing_after: 0 }, distance: 0, duration: 0, intersections: [] });
  const total = cum[cum.length - 1];
  return { code: 'Ok', routes: [{ distance: total, duration: total / v, legs: [{ steps, distance: total, duration: total / v }] }], waypoints: [] };
}

// '운전 쉬운 길' 요청에 돌려줄 가짜 경로: 세종대로로 더 올라가 율곡로 한 번 우회전, 대학로 우회전(회전 2번, 조금 느림)
function easyResponse() {
  const pts = { ...P, B2: [126.97800, 37.57450], F2: [126.99950, 37.57450] };
  const legs = [['A', 'B2', '세종대로', false], ['B2', 'F2', '율곡로', false], ['F2', 'G', '대학로', false]];
  return valhallaResponse({ legs, pts, vtypes: [1, 10, 10], noAlt: true, speed: 34 });
}

// 도보 경로: 같은 길에 율곡로 중간 계단(이름 없는 길) 하나, 시속 4.5km
function walkResponse() {
  const pts = { ...P, E2: [126.98550, 37.57500] };
  const legs = [['A', 'B', '세종대로', false], ['B', 'C', '종로', false], ['C', 'D', '삼일대로', false], ['D', 'E', '율곡로', false], ['E', 'E2', '', false], ['E2', 'F', '율곡로', false], ['F', 'G', '대학로', false]];
  return valhallaResponse({ legs, pts, vtypes: [1, 10, 15, 9, 40, 8, 10], noAlt: true, speed: 4.5 });
}

module.exports = { P, LEGS, build, valhallaResponse, osrmResponse, densify, easyResponse, walkResponse };
