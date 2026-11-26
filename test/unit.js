const assert = require('assert');
const load = require('./load');
const F = require('./fixtures');
const X = load(['00-util', '01-geo', '02-store', '03-sun', '04-search', '05-route', '06-phrase', '07-guide', '09-sim']);

let fails = 0;
const t = (name, fn) => { try { fn(); console.log('  ok  ', name); } catch (e) { fails++; console.log('  FAIL', name, '\n       ', e.message); } };

console.log('지리 계산');
t('hav 1도 위도 ≈ 111km', () => assert(Math.abs(X.hav([127, 37], [127, 38]) - 111195) < 200));
t('brg 동쪽 90°', () => assert(Math.abs(X.brg([127, 37], [127.01, 37]) - 90) < 0.5));
t('polyline6 왕복', () => {
  const c = [[126.97812, 37.566512], [126.99, 37.57], [127.0001, 37.5]];
  const d = X.decodePolyline(X.encodePolyline(c, 6), 6);
  c.forEach((p, i) => assert(Math.abs(p[0] - d[i][0]) < 1e-6 && Math.abs(p[1] - d[i][1]) < 1e-6));
});
t('angDiff 부호', () => { assert.strictEqual(X.angDiff(350, 10), 20); assert.strictEqual(X.angDiff(10, 350), -20); });

console.log('경로 정규화');
const rv = X.normValhalla(F.valhallaResponse().trip, 0);
const ro = X.normOsrm(F.osrmResponse().routes[0], 0);
for (const [nm, r] of [['Valhalla', rv], ['OSRM', ro]]) {
  t(nm + ' 단계 종류', () => assert.strictEqual(r.steps.map(s => s.kind).join(), 'depart,turn,turn,turn,turn,arrive'));
  t(nm + ' 거리 단조 증가', () => r.steps.reduce((a, s) => { assert(s.at >= a); return s.at; }, 0));
  t(nm + ' 회전 각도', () => {
    const a = r.steps.map(s => s.angle == null ? null : Math.round(s.angle));
    assert(a[1] > 80 && a[1] < 100, 'B ' + a[1]); assert(a[2] < -80 && a[2] > -100, 'C ' + a[2]);
    assert(a[3] > 20 && a[3] < 60, 'D ' + a[3]); assert(a[4] > 80 && a[4] < 100, 'F ' + a[4]);
  });
  t(nm + ' 도착 방향 오른쪽', () => assert.strictEqual(r.steps[r.steps.length - 1].side, 'right'));
  t(nm + ' 총거리 ≈ 기하 길이', () => assert(Math.abs(r.distance - r.cum[r.cum.length - 1]) < 5));
}

console.log('안내 문구');
const S = rv.steps;
t('우회전 300m', () => assert.strictEqual(X.sayStep(S[1], 300), '300미터 앞에서 종로로 우회전입니다'));
t('좌회전 잠시 후', () => assert.strictEqual(X.sayStep(S[2], 80, { soon: true, target: false }), '잠시 후 좌회전입니다'));
t('완만한 우회전 = 1·2시 방향', () => assert.match(X.sayStep(S[3], 500), /^500미터 앞에서 [12]시 방향, 율곡로입니다$/));
t('도착', () => assert.strictEqual(X.sayStep(S[5], 60, { soon: true }), '잠시 후 목적지입니다. 목적지는 오른쪽에 있습니다'));
t('킬로미터 읽기', () => { assert.strictEqual(X.distWords(1000), '1킬로미터'); assert.strictEqual(X.distWords(1490), '1.5킬로미터'); assert.strictEqual(X.distWords(2010), '2킬로미터'); });
t('진입로/출구/갈림길', () => {
  assert.strictEqual(X.sayStep({ kind: 'ramp', mod: 'right', name: '경부고속도로', toward: '서울' }, 1000), '1킬로미터 앞에서 오른쪽 방향, 경부고속도로 서울 방면 진입로입니다');
  assert.strictEqual(X.sayStep({ kind: 'exit', mod: 'right', toward: '판교' }, 2000), '2킬로미터 앞에서 오른쪽 방향, 판교 방면 출구입니다');
  assert.strictEqual(X.sayStep({ kind: 'fork', mod: 'left', toward: '대전' }, 500), '500미터 앞 갈림길에서 대전 방면, 왼쪽 방향입니다');
  assert.strictEqual(X.sayStep({ kind: 'roundabout', exit: 2 }, 0, { soon: true }), '잠시 후 회전교차로에서 2번째 출구입니다');
  assert.strictEqual(X.sayStep({ kind: 'uturn', mod: 'uturn' }, 300), '300미터 앞에서 유턴입니다');
  assert.strictEqual(X.sayStep({ kind: 'turn', mod: 'sharp left', angle: -140 }, 300), '300미터 앞에서 7시 방향 급좌회전입니다');
});
t('조사', () => { assert.strictEqual(X.josa('종로', '으로/로'), '종로로'); assert.strictEqual(X.josa('강남대로', '을/를'), '강남대로를'); assert.strictEqual(X.josa('삼일대로', '으로/로'), '삼일대로로'); assert.strictEqual(X.josa('올림픽길', '으로/로'), '올림픽길로'); assert.strictEqual(X.josa('테헤란로 152', '으로/로'), '테헤란로 152로'); assert.strictEqual(X.josa('남산1호터널', '을/를'), '남산1호터널을'); });
t('아이콘 SVG', () => S.forEach(s => assert(/^<svg/.test(X.iconFor(s)))));

console.log('안내 엔진(가상 주행)');
function drive(route, { factor = 1, offAt = null, every = 1 } = {}) {
  const said = [], events = [];
  const g = new X.Guide(route, { speak: (txt) => said.push(txt), event: (n) => events.push(n), settings: () => ({ verbosity: 'normal' }), corr: 1, destName: '테스트 목적지' });
  g.intro();
  const sim = new X.Sim(route, { onFix: () => {} });
  let tm = 0, st;
  for (let k = 0; k < 5000 && !sim.ended; k++) {
    const dt = every;
    const vt = sim.targetSpeed();
    sim.v = vt > sim.v ? Math.min(vt, sim.v + 2.2 * dt) : Math.max(vt, sim.v - 3.2 * dt);
    sim.v = Math.max(sim.v, 1.2);
    sim.d = Math.min(sim.total, sim.d + sim.v * dt);
    tm += dt * 1000;
    const pa = X.pointAt(route.coords, route.cum, sim.d);
    let p = pa.p;
    if (offAt != null && sim.d > offAt) { p = X.offsetPt(p, pa.brg + 90, 120); }
    st = g.update({ lon: p[0], lat: p[1], acc: 6, speed: sim.v, heading: pa.brg, t: 1e12 + tm });
    if (sim.d >= sim.total) sim.ended = true;
    if (events.includes('offroute')) break;
  }
  return { said, events, st };
}
const run = drive(rv);
console.log('    음성:', run.said.join(' / '));
t('시작 안내', () => assert.match(run.said[0], /^테스트 목적지까지 경로 안내를 시작합니다/));
t('우회전 사전 안내(300m 부근)', () => assert(run.said.some(s => /^(2|3)\d0미터 앞에서 종로로 우회전입니다$/.test(s))));
t('같은 문장 연속 반복 없음', () => run.said.forEach((s, i) => assert(i === 0 || s !== run.said[i - 1], s)));
t('잠시 후 안내 5회(회전 4 + 목적지) + 도착', () => {
  assert.strictEqual(run.said.filter(s => s.startsWith('잠시 후')).length, 5);
  assert(run.said[run.said.length - 1].startsWith('목적지에 도착했습니다'));
});
t('도착 이벤트, 이탈 없음', () => { assert(run.events.includes('arrive')); assert(!run.events.includes('offroute')); });

const off = drive(rv, { offAt: 700 });
t('경로 이탈 감지', () => { assert(off.events.includes('offroute')); assert(off.said.includes('경로를 벗어나 다시 탐색합니다')); });

const runO = drive(ro);
t('OSRM 경로도 같은 안내', () => assert.strictEqual(runO.said.filter(s => s.startsWith('잠시 후')).length, 5));

console.log('개인화');
t('도착 시간 보정(기록 없음 = 1)', () => assert.strictEqual(X.etaFactor().k, 1));
t('도착 시간 보정(같은 시간대 3회)', () => {
  const ts = new Date('2026-11-24T08:10:00+09:00').getTime();
  X.store.trips = [1.3, 1.4, 1.2].map((r, i) => ({ ts: ts - (i + 1) * 86400000 * 7, pred: 1000, act: 1000 * r, dist: 9000, arrived: true }));
  const f = X.etaFactor(ts);
  assert(Math.abs(f.k - 1.3) < 1e-9 && f.n === 3 && f.band === 'am', JSON.stringify(f));
});
t('시간대 추천', () => {
  const ts = new Date('2026-11-24T08:10:00+09:00').getTime();
  X.store.trips.forEach(tr => { tr.dest = { name: '회사', lat: 37.4, lon: 127.0 }; });
  const s = X.suggestions({ lat: 37.56, lon: 126.97 }, ts);
  assert(s.length === 1 && s[0].name === '회사', JSON.stringify(s));
});
t('해 고도(서울 정오 > 20°, 자정 < 0)', () => {
  assert(X.sunAltitude(new Date('2026-11-26T12:30:00+09:00'), 37.57, 126.98) > 20);
  assert(X.sunAltitude(new Date('2026-11-26T00:30:00+09:00'), 37.57, 126.98) < 0);
});
t('주소형 검색어 판별', () => { assert(X.looksLikeAddress('테헤란로 152')); assert(!X.looksLikeAddress('서울역')); });

console.log(fails ? `\n${fails}개 실패` : '\n모두 통과');
process.exitCode = fails ? 1 : 0;

// ── 고속도로 시나리오(진입로 → 8km 직진 → 출구 → 우회전 → 도착) ──
{
  const pts = { A0: [127.000, 37.400], R: [127.000, 37.4045], M: [127.003, 37.4065], X: [127.093, 37.4065], Y: [127.0965, 37.4035], Z: [127.0965, 37.398] };
  const legs = [['A0', 'R', '국도1호선', false], ['R', 'M', '경부고속도로', true], ['M', 'X', '경부고속도로', true], ['X', 'Y', '판교IC', false], ['Y', 'Z', '판교역로', false]];
  const vr = F.valhallaResponse({ legs, pts, vtypes: [1, 18, 20, 10], noAlt: true, speed: 60 });
  vr.trip.legs[0].maneuvers[2].sign = { exit_toward_elements: [{ text: '판교' }], exit_name_elements: [{ text: '판교IC' }] };
  const hr = X.normValhalla(vr.trip, 0);
  t('고속도로 경로 단계', () => assert.strictEqual(hr.steps.map(s => s.kind).join(), 'depart,ramp,exit,turn,arrive'));
  const g = drive(hr);
  console.log('    음성:', g.said.join(' / '));
  t('진입로 안내', () => assert(g.said.some(s => /오른쪽 방향, 경부고속도로 진입로입니다$/.test(s))));
  t('긴 직진 안내', () => assert(g.said.some(s => /^경부고속도로를 따라 \d+(\.\d)?킬로미터 직진입니다$/.test(s))));
  t('출구 2km·1km·500m 단계', () => ['2킬로미터', '1킬로미터', '500미터'].forEach(k => assert(g.said.some(s => s.startsWith(k + ' 앞에서 오른쪽 방향, 판교IC 판교 방면 출구')), k)));
  t('도착', () => assert(g.events.includes('arrive')));
  console.log(fails ? `\n${fails}개 실패` : '\n고속도로 시나리오 통과');
  process.exitCode = fails ? 1 : 0;
}
