const assert = require('assert');
const load = require('./load');
const F = require('./fixtures');
const X = load(['00-util', '01-geo', '02-store', '03-sun', '04-search', '04b-vworld', '05-route', '06-phrase', '07-guide', '07b-cams', '09-sim']);

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
  const segs = [];
  const g = new X.Guide(route, { speak: (txt) => said.push(txt), event: (n, d) => { events.push(n); if (n === 'segment') segs.push(d); }, settings: () => ({ verbosity: 'normal' }), corr: 1, destName: '테스트 목적지' });
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
  return { said, events, st, segs };
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

// ── 운전하기 쉬운 길 추천 · 도로별 학습 ──
{
  console.log('운전 쉬운 길 · 도로별 학습');
  const ez = X.routeEase(rv);
  t('난이도: 회전 4번(좌회전 1), 작은 길 0%', () => { assert.strictEqual(ez.turns, 4); assert.strictEqual(ez.left, 1); assert.strictEqual(ez.smallShare, 0); assert(Math.abs(ez.score - 4.2) < 1e-9, ez.score); });
  const mk = (id, dur, turns, lefts, dist = 9000) => {
    const steps = [{ kind: 'depart', voice: false, dur: 0, len: 0, name: '출발로' }];
    for (let i = 0; i < turns; i++) steps.push({ kind: 'turn', mod: i < lefts ? 'left' : 'right', angle: i < lefts ? -90 : 90, voice: true, dur: dur / turns, len: dist / turns, name: '도로' + i });
    steps.push({ kind: 'arrive', voice: true, dur: 0, len: 0 });
    return { id, distance: dist + id.length * 300, duration: dur, stepDur: dur, steps };
  };
  X.store.roads = {}; X.store.trips = [];
  const ts = new Date('2026-11-24T14:00:00+09:00').getTime();
  let r = X.rankRoutes([mk('fast', 1200, 8, 3), mk('easy-route', 1500, 3, 0)], { ts });
  t('5분 늦지만 쉬운 길 → 쉬운 길 추천', () => { assert.strictEqual(r.routes[0].id, 'easy-route'); assert.strictEqual(r.info.why, 'easy'); assert.strictEqual(r.routes[0].tags.join(), 'rec,easy'); assert.strictEqual(r.routes[1].tags.join(), 'fast'); });
  r = X.rankRoutes([mk('fast', 1200, 8, 3), mk('easy-route', 2100, 3, 0)], { ts });
  t('15분 늦으면 빠른 길 추천', () => { assert.strictEqual(r.routes[0].id, 'fast'); assert.strictEqual(r.info.why, 'fast'); assert(r.info.slowerMin >= 10); });
  r = X.rankRoutes([mk('fast', 1200, 8, 3), mk('easy-route', 1500, 3, 0)], { ts, easyMin: 5 });
  t('기준 5분이면 빠른 길', () => assert.strictEqual(r.routes[0].id, 'fast'));
  r = X.rankRoutes([mk('fast', 1200, 8, 3), mk('easy-route', 1500, 3, 0)], { ts, easyPrefer: false });
  t('쉬운 길 우선을 끄면 빠른 길', () => assert.strictEqual(r.routes[0].id, 'fast'));
  r = X.rankRoutes([mk('fast', 1200, 4, 1), mk('easy-route', 1260, 4, 0)], { ts });
  t('차이가 작으면(좌회전 1번) 그대로 빠른 길', () => assert.strictEqual(r.routes[0].id, 'fast'));

  // v1.5 제보: 29분·11km(골목·회전 많음) 대신 33분·25km(유료·고속도로)를 '추천·운전 쉬움'으로 냈다
  const mkr = (id, dur, turns, lefts, dist, extra = {}) => Object.assign(mk(id, dur, turns, lefts, dist), { distance: dist }, extra);
  const city = () => mkr('city', 1740, 14, 6, 11000);
  const tollway = () => mkr('tollway', 1980, 4, 1, 25000, { hasToll: true, hasHwy: true });
  r = X.rankRoutes([city(), tollway()], { ts });
  const tw = r.routes.find(x => x.id === 'tollway');
  t('2배 넘게 먼 유료 길은 쉬운 길로 추천하지 않음', () => { assert.strictEqual(r.routes[0].id, 'city'); assert.strictEqual(r.info.why, 'fast'); assert.strictEqual(r.routes[0].tags.join(), 'rec,fast'); assert(tw && !tw.tags.includes('easy') && !tw.tags.includes('rec'), tw && tw.tags.join()); });
  t('뺀 이유: 거리·유료도로', () => { assert.strictEqual(r.info.reject.route.id, 'tollway'); assert.strictEqual(r.info.reject.reasons.join(), 'dist,toll'); assert.strictEqual(r.info.easiest, null); });
  t('이유 문구', () => assert.strictEqual(X.recLine(r.info), '회전이 적은 다른 길은 거리가 14km 더 멀고 유료도로를 지나 운전하기 쉬운 길로 추천하지 않습니다.'));
  r = X.rankRoutes([city(), tollway(), mkr('arterial', 1980, 5, 0, 12500)], { ts });
  t('조건에 맞는 12.5km 큰길은 쉬운 길로 추천', () => { assert.strictEqual(r.routes[0].id, 'arterial'); assert.strictEqual(r.info.why, 'easy'); assert.strictEqual(r.routes[0].tags.join(), 'rec,easy'); assert.strictEqual(r.routes.find(x => x.id === 'city').tags.join(), 'fast'); assert.strictEqual(r.routes.find(x => x.id === 'tollway').tags.join(), ''); });
  t('추천 문구(시간·거리 차이)', () => assert.strictEqual(X.recLine(r.info), '가장 빠른 길보다 약 4분 늦고 1.5km 더 멀지만 회전이 9번 적고 큰길 위주라 이 길을 추천합니다 (기준 10분).'));
  r = X.rankRoutes([city(), mkr('toll-short', 1900, 4, 0, 11800, { hasToll: true })], { ts });
  t('거리가 비슷해도 없던 통행료가 생기면 추천하지 않음', () => { assert.strictEqual(r.routes[0].id, 'city'); assert.strictEqual(r.info.reject.reasons.join(), 'toll'); });
  r = X.rankRoutes([Object.assign(city(), { hasToll: true }), mkr('toll-short', 1900, 4, 0, 11800, { hasToll: true })], { ts });
  t('빠른 길도 유료면 유료 쉬운 길도 괜찮음', () => assert.strictEqual(r.routes[0].id, 'toll-short'));
  t('거리 조건: 25% 또는 1.5km', () => {
    const f = { distance: 4000 };
    assert.strictEqual(X.easyFit({ distance: 5500 }, f).join(), '');
    assert.strictEqual(X.easyFit({ distance: 5600 }, f).join(), 'dist');
    assert.strictEqual(X.easyFit({ distance: 50000 }, { distance: 40000 }).join(), '');
    assert.strictEqual(X.easyFit({ distance: 50100 }, { distance: 40000 }).join(), 'dist');
  });
  // 짧은 길: 10분 길에 7분 더 걸리는 길은 기준(10분) 안이어도 추천하지 않음(빠른 길 시간의 40%, 최소 3분)
  r = X.rankRoutes([mkr('s-fast', 600, 10, 4, 4000), mkr('s-easy', 1020, 3, 0, 4500)], { ts });
  t('짧은 길에서 7분 늦는 쉬운 길은 추천 안 함', () => { assert.strictEqual(r.routes[0].id, 's-fast'); assert.strictEqual(r.info.limit, 4); assert.strictEqual(r.routes[1].tags.join(), 'easy'); assert.strictEqual(X.recLine(r.info), '운전하기 쉬운 길은 7분 더 걸려(짧은 길 기준 4분 이상) 빠른 길을 추천합니다.'); });
  r = X.rankRoutes([mkr('s-fast', 600, 10, 4, 4000), mkr('s-easy', 720, 3, 0, 4500)], { ts });
  t('짧은 길에서 2분 늦는 쉬운 길은 추천', () => assert.strictEqual(r.routes[0].id, 's-easy'));
  r = X.rankRoutes([city(), tollway()], { ts, easyPrefer: false });
  t('쉬운 길 우선을 끄면 이유 문구 없음', () => assert.strictEqual(X.recLine(r.info), ''));

  // 도로별 학습: '도로0'이 이 시간대에 늘 2배 걸린다고 배우면, 그 도로를 많이 쓰는 경로가 느려진다
  X.learnRoad('도로0', 'day', 3.0, ts); X.learnRoad('도로0', 'day', 3.0, ts);
  t('도로별 비율 학습(2회 이상부터 사용)', () => assert(Math.abs(X.roadFactor('도로0', 'day') - 3.0) < 1e-9));
  const a = mk('a', 1200, 2, 0), b = mk('bb', 1300, 2, 0);
  b.steps.forEach(s => { if (s.name === '도로0') s.name = '다른길'; });
  r = X.rankRoutes([a, b], { ts });
  t('막히는 도로를 피하는 경로가 더 빨라짐', () => { assert.strictEqual(r.info.fastest.id, 'bb'); assert(r.routes.find(x => x.id === 'a').p.learnedShare > 0.4); });
  X.store.roads = {};

  // 안내 중 구간 통과 기록(도로명·실제 시간·예상 시간)
  const seg = drive(rv).segs;
  t('구간 기록: 300m 이상 이름 있는 도로 4곳', () => assert.strictEqual(seg.map(x => x.name).join(), '세종대로,종로,율곡로,대학로'));
  t('구간 기록: 실제/예상 비율이 그럴듯함', () => seg.forEach(x => assert(x.act / x.pred > 0.5 && x.act / x.pred < 2, x.name + ' ' + (x.act / x.pred).toFixed(2))));
  console.log(fails ? `\n${fails}개 실패` : '\n쉬운 길·학습 통과');
  process.exitCode = fails ? 1 : 0;
}

// ── 단속 카메라 ──
{
  console.log('단속 카메라');
  const P = F.P;
  const raw = [ // [위도, 경도, 종류, 제한속도, 보호구역, 구간길이m]
    [37.5690, P.A[0] + 0.00009, 2, 50, 0, 0],        // 세종대로 북쪽 방향 오른쪽 8m → 포함
    [37.5700, P.A[0] - 0.00023, 2, 50, 0, 0],        // 왼쪽 20m(반대 차로) → 제외
    [P.C[1] - 0.00004, P.C[0] + 0.00004, 1, 0, 0, 0], // 종로·삼일대로 교차로 신호 카메라 → 포함
    [P.E[1] - 0.00007, 126.9870, 5, 60, 0, 1000],     // 율곡로 동쪽 방향 오른쪽(남쪽) 구간 시작
    [P.E[1] - 0.00007, 126.9980, 6, 60, 0, 1000],     // 구간 끝
    [37.5730, P.G[0] - 0.00008, 2, 30, 2, 0],         // 대학로 남쪽 방향 오른쪽(서쪽) 어린이 보호구역
  ].sort((a, b) => a[0] - b[0]);
  const flat = []; let pl = 0, po = 0;
  for (const [la, lo, ty, lim, z, sl] of raw) { const a = Math.round(la * 1e5), b = Math.round(lo * 1e5); flat.push(a - pl, b - po, ty, lim, z, sl); pl = a; po = b; }
  X.CamDB.decode({ date: 'test', d: flat });
  const cams = X.camsForRoute(rv);
  t('오른쪽 카메라만 경로에 붙음(반대 차로 제외)', () => assert.strictEqual(cams.map(c => c.t).join(), '2,1,5,6,2'));
  t('구간단속 시작·끝 짝짓기', () => { const s = cams.find(c => c.t === 5); assert(s.endD - s.d > 900 && s.endD - s.d < 1100, s.endD - s.d); });
  t('신호 카메라 끄기', () => assert.strictEqual(X.camsForRoute(rv, { signal: false }).map(c => c.t).join(), '2,5,6,2'));
  t('문구', () => {
    assert.strictEqual(X.camPhrase({ t: 2, lim: 60, zone: 0 }, 300), '300미터 앞 과속 단속 카메라입니다. 제한속도 60킬로미터입니다');
    assert.strictEqual(X.camPhrase({ t: 2, lim: 30, zone: 2 }, 300), '어린이 보호구역, 300미터 앞 과속 단속 카메라입니다. 제한속도 30킬로미터입니다');
    assert.strictEqual(X.camPhrase({ t: 1, lim: 0, zone: 0 }, 300), '300미터 앞 신호 단속 카메라입니다');
  });
  // 가상 주행: 안내 엔진 + 카메라 안내
  const said = [];
  const g = new X.Guide(rv, { speak: () => {}, event: () => {}, settings: () => ({ verbosity: 'normal' }) });
  const cg = new X.CamGuide(cams, { speak: txt => said.push(txt), settings: () => ({ camVoice: true, overWarn: true }) });
  const sim = new X.Sim(rv, { onFix: () => {} });
  let tm = 1e12, overSeen = false, secSeen = null;
  while (!sim.ended) {
    const vt = sim.targetSpeed(); sim.v = vt > sim.v ? Math.min(vt, sim.v + 2.2) : Math.max(vt, sim.v - 3.2); sim.v = Math.max(sim.v, 1.2);
    sim.d = Math.min(sim.total, sim.d + sim.v); tm += 1000;
    const pa = X.pointAt(rv.coords, rv.cum, sim.d);
    const st = g.update({ lon: pa.p[0], lat: pa.p[1], acc: 6, speed: sim.v, heading: pa.brg, t: tm });
    const cs = cg.update(st.d, sim.v, tm);
    if (cs.over) overSeen = true;
    if (cs.sec && cs.sec.avg) secSeen = cs.sec;
    if (sim.d >= sim.total) sim.ended = true;
  }
  console.log('    음성:', said.join(' / '));
  t('과속 카메라 사전 안내', () => assert(said.includes('300미터 앞 과속 단속 카메라입니다. 제한속도 50킬로미터입니다') || said.some(s => /^\d+미터 앞 과속 단속 카메라입니다\. 제한속도 50킬로미터입니다$/.test(s))));
  t('구간단속 시작·끝 안내', () => { assert(said.some(s => s.includes('구간단속 시작입니다. 제한속도 60킬로미터, 구간 길이'))); assert(said.some(s => s.startsWith('구간단속이 끝났습니다'))); });
  t('구간 평균 속도 계산', () => assert(secSeen && secSeen.avg > 10 && secSeen.avg < 80, JSON.stringify(secSeen)));
  t('어린이 보호구역 안내', () => assert(said.some(s => s.startsWith('어린이 보호구역, '))));
  t('제한속도 초과 경고(54km/h로 50 구간 통과)', () => { assert(overSeen); assert(said.includes('제한속도를 넘었습니다. 속도를 줄이세요')); });
  console.log(fails ? `\n${fails}개 실패` : '\n카메라 통과');
  process.exitCode = fails ? 1 : 0;
}

// ── 검색어 줄이기 · 브이월드 응답 읽기 ──
{
  console.log('검색어 줄이기 · 브이월드');
  const qs = q => X.queryVariants(q).map(v => v.q + (v.kind === 'same' ? '' : ':' + v.kind)).join(' | ');
  t('붙여 쓴 아파트 이름', () => assert.strictEqual(qs('가온누리타운2차아파트'), '가온누리타운2차아파트 | 가온누리타운2차:name | 가온누리타운 2차:name | 누리타운 2차:short | 누리타운:core'));
  t('번지까지 쓴 주소 → 길 이름', () => assert.strictEqual(qs('서울 가상구 가온로3가길 7'), '서울 가상구 가온로3가길 7 | 서울 가상구 가온로3가길:street'));
  t('지번 주소 → 동', () => assert.strictEqual(qs('가온동 170'), '가온동 170 | 가온동:street'));
  t('짧은 이름은 그대로', () => { assert.strictEqual(qs('서울역'), '서울역'); assert.strictEqual(qs('래미안 1단지'), '래미안 1단지'); assert.strictEqual(qs('가상구청'), '가상구청'); });
  t('주소 끝 줄이기', () => { assert.strictEqual(X.tailAddr('서울특별시 가상구 가온로3가길 7'), '가온로3가길 7'); assert.strictEqual(X.tailAddr('서울특별시 가상구 가온동 170'), '가온동 170'); assert.strictEqual(X.tailAddr('경기도 과천시 경마공원대로 107'), '경마공원대로 107'); assert.strictEqual(X.tailAddr('서울특별시 중구 세종대로 110-1'), '세종대로 110-1'); });
  const place = X.vwItem({ title: '가온2차누리타운', category: '주거시설 > 아파트', address: { road: '서울특별시 가상구 가온로3가길 7', parcel: '서울특별시 가상구 가온동 170' }, point: { x: '126.9901', y: '37.5601' } }, 'place');
  t('장소 결과', () => { assert.strictEqual(place.name, '가온2차누리타운'); assert.strictEqual(place.addr, '서울특별시 가상구 가온로3가길 7'); assert.strictEqual(place.cat, '아파트'); assert(Math.abs(place.lat - 37.5601) < 1e-9 && Math.abs(place.lon - 126.9901) < 1e-9); });
  const road = X.vwItem({ address: { road: '서울특별시 가상구 가온로3가길 7', parcel: '서울특별시 가상구 가온동 170', bldnm: '' }, point: { x: 126.9901, y: 37.5601 } }, 'road');
  t('주소 결과(건물 이름 없음)', () => { assert.strictEqual(road.name, '가온로3가길 7'); assert.strictEqual(road.cat, '주소'); });
  t('좌표 없는 결과는 버림', () => { assert.strictEqual(X.vwItem({ title: 'x', point: { x: '', y: '' } }, 'place'), null); assert.strictEqual(X.vwItem({ title: 'x' }, 'place'), null); });
  t('이름 비교용 정리', () => assert.strictEqual(X.normName('가온 누리타운 아파트'), '가온누리타운'));
  console.log(fails ? `\n${fails}개 실패` : '\n검색어·브이월드 통과');
  process.exitCode = fails ? 1 : 0;
}

// ── 내 장소 이름·메모로 찾기 ──
{
  console.log('내 장소 찾기');
  const p = X.cleanPlace({ name: '주차한 곳', addr: '서울 종로구 율곡로 57', lat: 37.575, lon: 126.99, memo: '  지하 2층 B-37  ' });
  t('메모 저장(앞뒤 공백 제거)', () => assert.strictEqual(p.memo, '지하 2층 B-37'));
  t('메모 없으면 필드 없음', () => assert(!('memo' in X.cleanPlace({ name: 'a', lat: 1, lon: 2, memo: '   ' }))));
  t('이름 일부', () => assert(X.matchPlace(p, '주차')));
  t('띄어쓰기 무시', () => { assert(X.matchPlace(p, '주차한곳')); assert(X.matchPlace({ name: '우리아파트' }, '우리 아파트')); });
  t('메모로', () => { assert(X.matchPlace(p, 'b-37')); assert(X.matchPlace(p, '지하 2층')); });
  t('낱말 순서 무관', () => assert(X.matchPlace(p, '곳 주차한')));
  t('주소로', () => assert(X.matchPlace(p, '율곡로')));
  t('집·회사 이름표로', () => assert(X.matchPlace({ label: '집', name: '우리 아파트' }, '집')));
  t('안 맞는 말', () => assert(!X.matchPlace(p, '회사')));
  X.store.home = X.cleanPlace({ name: '우리 아파트', lat: 37.47, lon: 126.93 });
  X.store.favs = [p];
  t('같은 자리의 저장된 장소 찾기', () => { assert.strictEqual(X.savedAt({ lat: 37.575, lon: 126.99 }).kind, 'fav'); assert.strictEqual(X.savedAt({ lat: 37.47, lon: 126.93 }).kind, 'home'); assert.strictEqual(X.savedAt({ lat: 1, lon: 1 }), null); });
  X.store.home = null; X.store.favs = [];
  console.log(fails ? `\n${fails}개 실패` : '\n내 장소 찾기 통과');
  process.exitCode = fails ? 1 : 0;
}
