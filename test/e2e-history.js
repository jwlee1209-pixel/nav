// 주행 기록·즐겨찾는 경로 시험(가짜 네트워크): node test/e2e-history.js
//  ① 실제 안내(GPS 점을 경로를 따라 넣음)로 집 → 회사 주행 → 기록에 지나간 길·출발지·지난 도로
//  ② 첫 화면 ‘주행 기록’ 탭 → 기록 보기(지도에 길) → 즐겨찾는 경로로 등록 → 칩·즐겨찾기 탭
//  ③ 즐겨찾는 경로로 안내: Valhalla 요청에 지나는 점(through·진행 방향), ‘기록한 길’ 카드, 모의 주행
//  ④ 기록한 길로 안내 중 이탈 → 기록한 길로 다시 찾기, 아주 멀리 벗어나면 보통 길
//  ⑤ 이름·메모 고치기·지우기, 지나간 길 없는 예전 기록, 기록 지우기, 백업·불러오기
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), assert = require('assert');
const mock = require('./mocknet');
const F = require('./fixtures');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'index.html');
let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log('  ✓', m); };
const P = F.P;

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], env: { ...process.env, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, geolocation: { latitude: P.A[1], longitude: P.A[0], accuracy: 8 }, permissions: ['geolocation'], locale: 'ko-KR', timezoneId: 'Asia/Seoul', acceptDownloads: true });
  const log = await mock.install(context);
  // 경로 요청을 엿본다(그다음 가짜 서버로 넘김)
  const vreq = [];
  await context.route(/valhalla1\.openstreetmap\.de\/route/, r => { vreq.push(JSON.parse(new URL(r.request().url()).searchParams.get('json'))); r.fallback(); });
  await context.addInitScript(([A, G]) => {
    window.__said = [];
    if (window.speechSynthesis) { speechSynthesis.speak = u => window.__said.push(u.text); speechSynthesis.cancel = () => {}; }
    try {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.removeItem('gilnavi.tracks.v1');
        localStorage.setItem('gilnavi.v1', JSON.stringify({
          settings: { theme: 'day', fullscreen: false },
          home: { name: '우리집', addr: '서울 중구 세종대로', lat: A[1], lon: A[0] },
          work: { name: '대학로 사무실', addr: '서울 종로구 대학로 101', lat: G[1], lon: G[0] },
          trips: [],
        }));
      }
    } catch (e) { /* 무시 */ }
  }, [P.A, P.G]);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  const shot = async name => { await page.waitForTimeout(450); await page.screenshot({ path: path.join(OUT, `hist-${name}.png`) }); };
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const fix = (lon, lat, extra = {}) => ev(([lon, lat, extra]) => window.__navi.onPos({ coords: { longitude: lon, latitude: lat, accuracy: 6, speed: 14, heading: null, ...extra } }), [lon, lat, extra]);
  const dismiss = async (yes = true) => { await page.waitForSelector('#dialog:not([hidden]) .dialog__btns'); await page.click(yes ? '#dialog .btn--primary, #dialog .btn--danger' : '#dialog .dialog__btns .btn:not(.btn--primary):not(.btn--danger)'); };

  await page.goto(FILE);
  await page.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 15000 });
  await fix(P.A[0], P.A[1]);
  await page.waitForTimeout(800);
  // 지도에 그린 경로 선 수를 엿본다
  await ev(() => { const MV = window.__navi.MV, f = MV.setRoutes; MV.setRoutes = function (r, sel) { window.__lastRoutes = r.map(x => x.coords.length); return f.call(this, r, sel); }; });

  console.log('① 실제 안내로 주행 → 기록');
  await page.click('.chip--work');
  await page.waitForSelector('.rcard');
  await page.click('#btnStart');
  await page.waitForFunction(() => window.__navi.S.nav && !window.__navi.S.nav.sim);
  const coords = await ev(() => window.__navi.S.nav.route.coords);
  const cum = [0];
  const hv = (a, b) => { const R = 6371008.8, r = Math.PI / 180, dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r; const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); };
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hv(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];
  const at = d => { let i = 0; while (i < cum.length - 2 && cum[i + 1] < d) i++; const f = Math.min(1, Math.max(0, (d - cum[i]) / ((cum[i + 1] - cum[i]) || 1))); return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f]; };
  for (let d = 0; d <= total; d += 25) { const p = at(d); await fix(p[0], p[1]); await page.waitForTimeout(25); }
  await fix(P.G[0], P.G[1], { speed: 0 });
  await page.waitForFunction(() => !window.__navi.S.nav, null, { timeout: 15000 });
  const trip = await ev(() => window.__navi.store.trips[window.__navi.store.trips.length - 1]);
  ok(trip && trip.id && trip.arrived, '주행 기록이 남음(도착)');
  ok(trip.from && trip.from.name === '집' && trip.dest.name === '회사', `출발·도착 이름: ${trip.from.name} → ${trip.dest.name}`);
  ok(Math.abs(trip.len - total) / total < 0.05, `지나간 거리 ${trip.len} m ≈ 경로 ${Math.round(total)} m`);
  ok(Array.isArray(trip.roads) && trip.roads.includes('세종대로') && trip.roads.includes('율곡로'), '지난 도로: ' + (trip.roads || []).join(' → '));
  const tr = await ev(id => { const s = JSON.parse(localStorage.getItem('gilnavi.tracks.v1') || '{}')[id]; return s ? { len: s.length } : null; }, trip.id);
  ok(tr && tr.len > 20, `지나간 길은 따로 저장(polyline ${tr && tr.len}자)`);
  ok(!(await ev(() => localStorage.getItem('gilnavi.v1'))).includes('"pts"'), '기본 저장 자료에는 점 목록이 없음(가볍게)');

  console.log('② 주행 기록 탭 → 기록 보기 → 즐겨찾는 경로로 등록');
  await page.click('#tab-trips');
  await page.waitForSelector('#tripList .item--trip');
  ok(/오늘/.test(await page.textContent('#tripList .dayhead')), '날짜 머리: 오늘');
  ok(/집 → 회사/.test(await page.textContent('#tripList .item--trip .item__name')), '기록 줄: 집 → 회사');
  ok(/\d\d:\d\d · [\d.]+k?m · /.test(await page.textContent('#tripList .item--trip .item__addr')), '기록 줄: 시각·거리·걸린 시간 ' + (await page.textContent('#tripList .item--trip .item__addr')));
  await shot('1-trips-tab');
  await page.click('#tripList .item--trip');
  await page.waitForSelector('#btnFollowTrip');
  ok(/세종대로 → /.test(await page.textContent('.trip__roads')), '기록 보기: 지난 도로');
  ok(await ev(() => window.__lastRoutes && window.__lastRoutes.length === 1 && window.__lastRoutes[0] >= 2), '지도에 지나간 길');
  await shot('2-trip-view');
  await page.click('#btnFavTrip');
  await page.waitForSelector('#pfName');
  ok((await page.inputValue('#pfName')).startsWith('회사'), '이름 미리 채움: ' + await page.inputValue('#pfName'));
  await page.fill('#pfName', '출근길');
  await page.fill('#pfMemo', '8시 전에');
  await page.click('#pfSave');
  await page.waitForFunction(() => window.__navi.store.froutes.length === 1);
  const fr = await ev(() => window.__navi.store.froutes[0]);
  ok(fr.name === '출근길' && fr.memo === '8시 전에' && fr.tripId === trip.id && fr.track.length > 20, '즐겨찾는 경로 저장(자기 길 포함)');
  ok((await page.getAttribute('#btnFavTrip', 'aria-pressed')) === 'true' && /즐겨찾는 경로/.test(await page.textContent('#btnFavTrip')), '기록 보기 단추가 ‘즐겨찾는 경로’로');
  await page.goBack();
  await page.waitForFunction(() => window.__navi.S.screen === 'home');
  ok(await page.isVisible('#tripList .item__star'), '주행 기록 줄에 별');
  ok(/출근길/.test(await page.textContent('.chip--route')), '첫 화면 칩: 출근길');
  await page.click('#tab-fav');
  ok(/출근길/.test(await page.textContent('.list--froutes .item__name')) && /8시 전에/.test(await page.textContent('.list--froutes .item__addr')), '즐겨찾기 탭 맨 위에 즐겨찾는 경로');
  await shot('3-fav-tab');

  console.log('③ 즐겨찾는 경로로 안내');
  await fix(P.A[0], P.A[1]);          // 다시 집에서 출발
  const before = vreq.length;
  await page.click('.chip--route');
  await page.waitForSelector('.rcard .tag--follow');
  const q = vreq.slice(before).find(x => x.locations.some(l => l.type === 'through'));
  ok(q, 'Valhalla 요청에 지나는 점(through)');
  const th = q.locations.slice(1, -1);
  ok(q.locations[0].type === 'break' && q.locations[q.locations.length - 1].type === 'break' && th.every(l => l.type === 'through'), '출발·도착은 break, 사이는 through');
  ok(th.length >= 2 && q.locations.length <= 17, `지나는 점 ${th.length}곳(지점 ${q.locations.length}개, 공개 서버 한도 안)`);
  // 기록한 길(북쪽 → 동쪽 → 남쪽, 회전 두 번): 첫 회전 뒤는 동쪽, 둘째 회전 뒤는 남쪽으로 지나게
  ok(Math.abs(th[0].heading - 90) <= 5 && Math.abs(th[th.length - 1].heading - 180) <= 5, '회전 뒤 나가는 길의 진행 방향: ' + th.map(l => l.heading).join(', '));
  ok(th.every(l => Number.isInteger(l.heading) && l.heading_tolerance === 60), '지나는 점마다 진행 방향');
  ok(encodeURIComponent(JSON.stringify(q)).length < 6000, '요청 주소 길이 ' + encodeURIComponent(JSON.stringify(q)).length + '자');
  ok(/기록한 길로 안내/.test(await page.textContent('#plan')) && /출근길/.test(await page.textContent('.followbar')), '경로 설정: 기록한 길로 안내 · 출근길');
  ok(/기록한 길 그대로/.test(await page.textContent('.rcard')), '카드: 기록한 길 그대로');
  await page.waitForTimeout(1500);   // 비교용 보통 길 요청
  ok((await page.$$('.rcard')).length === 1, '보통 길이 더 빠르지 않으면 카드 하나');
  await shot('4-follow-preview');
  await page.click('.go .btn:not(.btn--primary)');   // 모의 주행
  await page.waitForFunction(() => window.__navi.S.nav && window.__navi.S.nav.sim);
  ok(await ev(() => !!window.__navi.S.nav.follow), '모의 주행도 기록한 길 따라가기');
  await page.waitForTimeout(1500);
  await shot('5-follow-guide');
  await ev(() => window.__navi.finishNav(false));
  await page.waitForFunction(() => window.__navi.S.screen === 'home');
  ok((await ev(() => window.__navi.store.trips.length)) === 1, '모의 주행은 기록하지 않음');
  ok((await ev(() => window.__navi.store.froutes[0].n)) === 1, '즐겨찾는 경로 쓴 횟수');

  console.log('④ 안내 중 이탈 → 기록한 길로 다시 찾기 / 아주 멀면 보통 길');
  await fix(P.A[0], P.A[1]);
  await page.click('.chip--route');
  await page.waitForSelector('.rcard .tag--follow');
  await page.click('#btnStart');
  await page.waitForFunction(() => window.__navi.S.nav && !window.__navi.S.nav.sim && window.__navi.S.nav.follow);
  for (let d = 0; d <= 500; d += 25) { const p = at(d); await fix(p[0], p[1]); await page.waitForTimeout(25); }
  const b2 = vreq.length;
  // 경로에서 동쪽으로 250 m 벗어남(기록한 길에서 2.5 km 안)
  for (let k = 0; k < 8; k++) { const p = at(500 + k * 20); await fix(p[0] + 0.0028, p[1], { heading: 0 }); await page.waitForTimeout(450); }
  await page.waitForFunction(b => window.__navi.S.nav && window.__navi.S.nav.rr >= 1, b2, { timeout: 15000 });
  const rq = vreq.slice(b2);
  ok(rq.length && rq.every(x => x.locations.length >= 3 ? x.locations.slice(1, -1).every(l => l.type === 'through') : true) && rq.some(x => x.locations.some(l => l.type === 'through')), '이탈하면 기록한 길로 되돌아가게 다시 찾음');
  ok(await ev(() => !!window.__navi.S.nav.follow), '여전히 기록한 길 따라가기');
  // 5 km 넘게 벗어남 → 보통 길
  const b3 = vreq.length;
  // (다시 찾은 뒤 8초 동안은 또 찾지 않으므로 그동안 위치를 계속 넣는다)
  for (let k = 0; k < 40 && !(await ev(() => window.__navi.S.nav && window.__navi.S.nav.rr >= 2)); k++) { await fix(P.A[0] + 0.07, P.A[1] - 0.03 - k * 0.0002, { heading: 180 }); await page.waitForTimeout(450); }
  await page.waitForFunction(() => window.__navi.S.nav && window.__navi.S.nav.rr >= 2, null, { timeout: 15000 });
  ok(await ev(() => !window.__navi.S.nav.follow), '아주 멀리 벗어나면 보통 길로');
  ok(/보통 길로 안내합니다/.test(await page.textContent('#toast')), '알림: 보통 길로 안내합니다');
  ok(vreq.slice(b3).every(x => !x.locations.some(l => l.type === 'through')), '보통 길 요청에는 지나는 점 없음');
  await ev(() => window.__navi.finishNav(false));
  await page.waitForFunction(() => window.__navi.S.screen === 'home');
  const t2 = await ev(() => window.__navi.store.trips[window.__navi.store.trips.length - 1]);
  ok((await ev(() => window.__navi.store.trips.length)) === 2 && !t2.arrived && t2.rr === 2, '중간에 끝낸 실제 안내도 기록(다시 찾음 2번)');

  console.log('⑤ 고치기·지우기·예전 기록·백업');
  await page.click('#tab-fav');
  await page.click('.list--froutes .icon-btn');
  await page.waitForSelector('#pfName');
  await page.fill('#pfName', '출근길(세종대로)');
  await page.click('#pfSave');
  await page.waitForTimeout(300);
  ok(/출근길\(세종대로\)/.test(await page.textContent('.chip--route')), '이름 고치기 → 칩도 바뀜');
  // 칩은 많이 쓴 경로부터(나중에 등록해 목록 앞에 있는 것보다 먼저)
  await ev(() => { const st = window.__navi.store; st.froutes.unshift({ ...st.froutes[0], id: 'tmp', name: '새 경로', n: 0 }); window.__navi.renderChips(); });
  const chips = await page.$$eval('.chip--route', b => b.map(x => x.textContent.trim()));
  ok(chips.join('|') === '출근길(세종대로)|새 경로', '칩: 많이 쓴 경로 먼저 — ' + chips.join(', '));
  await ev(() => { const st = window.__navi.store; st.froutes = st.froutes.filter(r => r.id !== 'tmp'); window.__navi.renderChips(); });
  // 지나간 길 없는 예전 기록
  await ev(() => { const st = window.__navi.store; st.trips.unshift({ ts: Date.now() - 3 * 86400000, end: Date.now() - 3 * 86400000 + 900000, pred: 800, act: 900, dist: 5200, rr: 0, arrived: true, mode: 'car', dest: { name: '서울시청', lat: 37.5663, lon: 126.9779 } }); window.__navi.renderSheet(); });
  await page.click('#tab-trips');
  await page.click('#tripList .item--trip >> nth=-1');
  await page.waitForSelector('.warnline');
  ok(/지나간 길이 없습니다/.test(await page.textContent('.warnline')) && /도착지로 길 찾기/.test(await page.textContent('.place__acts')), '예전 기록: 도착지로 길 찾기만');
  ok(/출발지 → 서울시청/.test(await page.textContent('.place__name')), '예전 기록 제목: 출발지 → 서울시청');
  await page.goBack();
  // 백업 저장 → 지우고 → 불러오기
  await page.click('#btnSettings');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.row:has-text("백업 파일로 저장") button')]);
  const bp = path.join(OUT, 'hist-backup.json');
  await dl.saveAs(bp);
  const bk = JSON.parse(fs.readFileSync(bp, 'utf8'));
  ok(bk.froutes.length === 1 && bk.tracks && Object.keys(bk.tracks).length === 2 && bk.trips.length === 3, `백업: 즐겨찾는 경로 ${bk.froutes.length}, 지나간 길 ${Object.keys(bk.tracks || {}).length}, 기록 ${bk.trips.length}`);
  await page.click('.row:has-text("주행 기록 지우기") button');
  await dismiss(true);
  await page.waitForTimeout(300);
  ok((await ev(() => window.__navi.store.trips.length)) === 0 && (await ev(() => localStorage.getItem('gilnavi.tracks.v1'))) === '{}', '주행 기록 지우기: 지나간 길도');
  ok((await ev(() => window.__navi.store.froutes.length)) === 1, '즐겨찾는 경로는 남음');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('.row:has-text("백업 파일 불러오기") button')]);
  await fc.setFiles(bp);
  await page.waitForFunction(() => window.__navi.store.trips.length === 3);
  ok((await ev(() => Object.keys(JSON.parse(localStorage.getItem('gilnavi.tracks.v1'))).length)) === 2, '불러오기: 지나간 길도 되살림');
  await page.click('.ov__head .icon-btn');
  // 기록 지우기(한 건)
  await page.click('#tab-trips');
  await page.click('#tripList .item--trip >> nth=0');
  await page.waitForSelector('#btnDelTrip');
  const delId = await ev(() => window.__navi.S.tripView.id);
  await page.click('#btnDelTrip');
  await dismiss(true);
  await page.waitForFunction(() => window.__navi.S.screen === 'home');
  ok((await ev(() => window.__navi.store.trips.length)) === 2 && !(await ev(id => id in JSON.parse(localStorage.getItem('gilnavi.tracks.v1')), delId)), '기록 한 건 지우기: 그 길도 지움');
  // 즐겨찾는 경로 지우기
  await page.click('#tab-fav');
  await page.click('.list--froutes .icon-btn');
  await page.click('#pfDel');
  await dismiss(true);
  await page.waitForFunction(() => window.__navi.store.froutes.length === 0);
  ok(!(await page.$('.chip--route')), '즐겨찾는 경로 지우기 → 칩도 없어짐');

  ok(errors.length === 0, '오류 없음' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(`e2e-history: ${n}개 확인 통과`);
})().catch(e => { console.error(e); process.exit(1); });
