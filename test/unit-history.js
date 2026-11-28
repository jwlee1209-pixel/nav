// 주행 기록·기록한 길 따라가기 계산 시험: node test/unit-history.js
const assert = require('assert');
const load = require('./load');
const F = require('./fixtures');
const X = load(['00-util', '01-geo', '02-store', '05-route']);
let fails = 0, n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('  ok  ', name); } catch (e) { fails++; console.log('  FAIL', name, '\n       ', e.message); } };

console.log('선 줄이기·가까운 곳·겹침');
const L = [[127.000, 37.500], [127.010, 37.500], [127.010, 37.510]];   // ㄱ 자(동쪽 880 m → 북쪽 1.1 km)
const dense = [];
for (let i = 0; i < L.length - 1; i++) for (let k = 0; k < 50; k++) {
  const a = L[i], b = L[i + 1], f = k / 50;
  dense.push([a[0] + (b[0] - a[0]) * f + (k % 2 ? 0.000015 : -0.000015), a[1] + (b[1] - a[1]) * f]);   // ±1.3 m 흔들림
}
dense.push(L[2]);
t('Douglas–Peucker: 꺾인 곳만 남김', () => {
  const s = X.simplifyLine(dense, 5);
  assert.strictEqual(s.length, 3, s.length);
  assert(X.hav(s[1], L[1]) < 30, X.hav(s[1], L[1]));
});
t('줄여도 길이는 거의 같음', () => assert(Math.abs(X.lineLen(X.simplifyLine(dense, 5)) - X.lineLen(L)) < 5));
t('선 위 가장 가까운 곳', () => {
  const r = X.nearestOnLine(L, [127.005, 37.5003]);
  assert(Math.abs(r.d - 33) < 2, r.d);
  assert(Math.abs(r.along - X.hav(L[0], [127.005, 37.5])) < 2, r.along);
  assert.strictEqual(r.i, 0);
});
t('겹침: 같은 길 100%, 벗어난 구간 위치', () => {
  const same = X.coverage(L, X.simplifyLine(dense, 1));
  assert(same.share > 0.99 && same.gaps.length === 0, JSON.stringify(same));
  // 꺾기 전 300 m 를 북쪽으로 200 m 돌아가는 길
  const det = [[127.000, 37.500], [127.004, 37.500], [127.004, 37.502], [127.0075, 37.502], [127.0075, 37.500], [127.010, 37.500], [127.010, 37.510]];
  const c = X.coverage(L, det);
  assert(c.share < 0.9 && c.share > 0.7, c.share);
  assert.strictEqual(c.gaps.length, 1);
  const [a, b] = c.gaps[0];
  assert(a > 330 && a <= 400 && b >= 620 && b < 700, JSON.stringify(c.gaps));
});

console.log('지나는 점(through)');
const route = X.normValhalla(F.valhallaResponse().trip, 0);
const trk = route.coords;
const vias = X.throughPoints(trk);
const cum = X.lineLen(trk);
t('지나는 점 개수는 한도 안', () => assert(vias.length >= 3 && vias.length <= X.FOLLOW_MAX, vias.length));
t('모두 기록한 길 위(1 m 안)', () => vias.forEach(v => assert(X.nearestOnLine(trk, [v.lon, v.lat]).d < 1)));
t('출발·도착 150 m 안에는 없음', () => vias.forEach(v => assert(v.d > 150 && v.d < cum - 150, v.d)));
t('회전한 곳마다 그 뒤 나가는 길 위(8~70 m), 진행 방향', () => {
  const P = F.P;
  for (const [k, next] of [['B', 'C'], ['C', 'D'], ['D', 'E'], ['F', 'G']]) {
    const at = X.nearestOnLine(trk, P[k]).along;
    const v = vias.find(x => x.d - at >= 8 && x.d - at <= 70.5);
    assert(v, `${k} 뒤 지나는 점 없음`);
    const want = X.brg(P[k], P[next]);
    assert(Math.abs(X.angDiff(v.h, want)) < 8, `${k}: ${v.h} vs ${want}`);
  }
});
t('긴 직선(30 km)은 고르게 채움', () => {
  const line = [[127.0, 37.0], [127.0, 37.27]];
  const v = X.throughPoints(line);
  assert(v.length >= 8 && v.length <= X.FOLLOW_MAX, v.length);
  for (let i = 1; i < v.length; i++) assert(v[i].d - v[i - 1].d >= 1500, v[i].d - v[i - 1].d);
  v.forEach(x => assert(Math.abs(X.angDiff(x.h, 0)) < 1, x.h));
});
t('회전이 아주 많아도(지그재그 60번) 한도 안', () => {
  const z = [];
  for (let i = 0; i <= 60; i++) z.push([127 + (i % 2) * 0.004, 37 + i * 0.003]);
  const v = X.throughPoints(z);
  assert(v.length <= X.FOLLOW_MAX && v.length >= 10, v.length);
  for (let i = 1; i < v.length; i++) assert(v[i].d > v[i - 1].d);
});
t('짧은 길(400 m 미만)은 점 없음', () => assert.strictEqual(X.throughPoints([[127, 37], [127.002, 37]]).length, 0));

console.log('즐겨찾는 경로 정리');
t('길이 없거나 깨진 것은 버림', () => {
  assert.strictEqual(X.cleanRoute({ name: 'x' }), null);
  assert.strictEqual(X.cleanRoute({ name: 'x', track: '??' }), null);
});
t('기본값 채우기', () => {
  const r = X.cleanRoute({ name: '  출근길 ', track: X.encodePolyline(L, 5), dest: { name: '회사', lat: 37.51, lon: 127.01 }, roads: ['올림픽대로', 3] });
  assert.strictEqual(r.name, '출근길');
  assert.strictEqual(r.dest.name, '회사');
  assert.strictEqual(r.from.lat, 37.5);
  assert(Math.abs(r.len - X.lineLen(L)) < 3, r.len);
  assert.deepStrictEqual(r.roads, ['올림픽대로', '3']);
  assert.strictEqual(r.mode, 'car');
});
console.log(fails ? `\n${fails}개 실패` : `\nunit-history: ${n}개 통과`);
process.exitCode = fails ? 1 : 0;
