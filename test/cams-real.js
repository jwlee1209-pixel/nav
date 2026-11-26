// 실제 카메라 자료 점검: 복원 좌표가 원자료와 같은지, 실제 구간단속 쌍이 직선 경로에서 짝지어지는지
const fs = require('fs'), path = require('path');
const load = require('./load');
const X = load(['00-util', '01-geo', '02-store', '05-route', '06-phrase', '07b-cams']);
const d = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/web/cameras.json'), 'utf8'));
X.CamDB.decode(d);
console.log('대수', X.CamDB.n, '기준일', X.CamDB.date, '격자 칸', X.CamDB.grid.size);
// 원자료 첫 카메라(춘천 순환대로 37.8298581,127.7423881 과속 80)를 찾아보기
let best = -1, bd = 1e9;
for (let i = 0; i < X.CamDB.n; i++) { const dd = X.hav([X.CamDB.lon[i], X.CamDB.lat[i]], [127.7423881, 37.8298581]); if (dd < bd) { bd = dd; best = i; } }
console.log('춘천 순환대로 카메라 복원 오차 m', bd.toFixed(2), '종류', X.CamDB.type[best], '제한', X.CamDB.lim[best]);
// 구간단속 시작점 하나와 가장 가까운 끝점으로 직선 경로를 만들어 짝짓기 확인
const starts = [], ends = [];
for (let i = 0; i < X.CamDB.n; i++) { if (X.CamDB.type[i] === 5) starts.push(i); if (X.CamDB.type[i] === 6) ends.push(i); }
let ok = 0, tried = 0;
for (const s of starts.slice(0, 200)) {
  const L = X.CamDB.slen[s]; if (!L) continue;
  let e = -1, err = 1e9;
  for (const j of ends) { const dd = X.hav([X.CamDB.lon[s], X.CamDB.lat[s]], [X.CamDB.lon[j], X.CamDB.lat[j]]); if (Math.abs(dd - L) < err && X.CamDB.slen[j] === L) { err = Math.abs(dd - L); e = j; } }
  if (e < 0 || err > L * 0.5) continue;
  tried++;
  const coords = [[X.CamDB.lon[s], X.CamDB.lat[s]], [X.CamDB.lon[e], X.CamDB.lat[e]]];
  const ext = X.offsetPt(coords[1], X.brg(coords[0], coords[1]), 300), pre = X.offsetPt(coords[0], X.brg(coords[1], coords[0]), 300);
  const cc = [pre, coords[0], coords[1], ext];
  const route = { coords: cc, cum: X.cumDist(cc) };
  const cams = X.camsForRoute(route);
  const st = cams.find(c => c.i === s);
  if (st && st.endD && Math.abs(st.endD - st.d - X.hav(coords[0], coords[1])) < 60) ok++;
}
console.log('실제 구간단속 쌍', tried, '개 중 직선 경로에서 시작·끝이 맞게 짝지어진 것', ok);
