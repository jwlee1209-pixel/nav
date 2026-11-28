// ───────────────────────── 지리 계산 ─────────────────────────
// 좌표는 모두 [경도, 위도] 순서(GeoJSON 과 같음)
const EARTH_R = 6371008.8;
const RAD = Math.PI / 180;

function hav(a, b) {
  const dLat = (b[1] - a[1]) * RAD, dLon = (b[0] - a[0]) * RAD;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function brg(a, b) {
  const p1 = a[1] * RAD, p2 = b[1] * RAD, dl = (b[0] - a[0]) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return (Math.atan2(y, x) / RAD + 360) % 360;
}

// from → to 로 돌 때의 부호 있는 각(오른쪽 +, 왼쪽 −), (-180, 180]
function angDiff(from, to) {
  let d = (to - from) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}
function lerpAng(a, b, t) { return (a + angDiff(a, b) * t + 360) % 360; }

function offsetPt(p, bearingDeg, dist) {
  const d = dist / EARTH_R, th = bearingDeg * RAD;
  const p1 = p[1] * RAD, l1 = p[0] * RAD;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(th));
  const l2 = l1 + Math.atan2(Math.sin(th) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [((l2 / RAD + 540) % 360) - 180, p2 / RAD];
}

function decodePolyline(str, precision = 5) {
  const out = [], f = Math.pow(10, precision);
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    let b, shift = 0, res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (res & 1) ? ~(res >> 1) : (res >> 1);
    shift = 0; res = 0;
    do { b = str.charCodeAt(i++) - 63; res |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lon += (res & 1) ? ~(res >> 1) : (res >> 1);
    out.push([lon / f, lat / f]);
  }
  return out;
}

function encodePolyline(coords, precision = 5) {
  const f = Math.pow(10, precision);
  let out = '', pLat = 0, pLon = 0;
  const enc = v => {
    v = v < 0 ? ~(v << 1) : (v << 1);
    let s = '';
    while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    return s + String.fromCharCode(v + 63);
  };
  for (const [lon, lat] of coords) {
    const a = Math.round(lat * f), b = Math.round(lon * f);
    out += enc(a - pLat) + enc(b - pLon);
    pLat = a; pLon = b;
  }
  return out;
}

function cumDist(coords) {
  const c = new Float64Array(coords.length);
  for (let i = 1; i < coords.length; i++) c[i] = c[i - 1] + hav(coords[i - 1], coords[i]);
  return c;
}

// cum[i] <= d < cum[i+1] 인 구간 i
function locate(cum, d) {
  const last = cum.length - 1;
  if (last < 1 || d <= 0) return 0;
  if (d >= cum[last]) return last - 1;
  let lo = 0, hi = last;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
  return lo;
}

function pointAt(coords, cum, d) {
  const n = coords.length;
  if (n === 1) return { p: coords[0].slice(), i: 0, brg: 0 };
  const i = locate(cum, d);
  const a = coords[i], b = coords[i + 1];
  const L = cum[i + 1] - cum[i];
  const t = L > 0 ? clamp((d - cum[i]) / L, 0, 1) : 0;
  let bb;
  if (L > 0.5) bb = brg(a, b);
  else { // 길이가 0인 구간이면 앞뒤에서 방향을 찾는다
    let j = i + 1;
    while (j < n - 1 && hav(a, coords[j]) < 0.5) j++;
    if (hav(a, coords[j]) >= 0.5) bb = brg(a, coords[j]);
    else {
      let k = i;
      while (k > 0 && hav(coords[k], a) < 0.5) k--;
      bb = hav(coords[k], a) >= 0.5 ? brg(coords[k], a) : 0;
    }
  }
  return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], i, brg: bb };
}

function sliceLine(coords, cum, d0, d1) {
  const tot = cum[cum.length - 1];
  d0 = clamp(d0, 0, tot); d1 = clamp(d1, d0, tot);
  const s = pointAt(coords, cum, d0), e = pointAt(coords, cum, d1);
  const out = [s.p];
  for (let i = s.i + 1; i <= e.i; i++) out.push(coords[i]);
  out.push(e.p);
  return out;
}

// 점 p 를 선분 a-b 에 투영(국지 평면 근사, 미터)
function projSeg(p, a, b) {
  const kx = Math.cos(p[1] * RAD) * EARTH_R * RAD, ky = EARTH_R * RAD;
  const ax = (a[0] - p[0]) * kx, ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx, by = (b[1] - p[1]) * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? -(ax * dx + ay * dy) / L2 : 0;
  t = clamp(t, 0, 1);
  return { t, d: Math.hypot(ax + dx * t, ay + dy * t) };
}

// 점 p 가 a→b 진행 방향의 오른쪽이면 +1, 왼쪽이면 -1
function sideOfLine(p, a, b) {
  const kx = Math.cos(p[1] * RAD);
  const vx = (b[0] - a[0]) * kx, vy = b[1] - a[1], wx = (p[0] - a[0]) * kx, wy = p[1] - a[1];
  return vx * wy - vy * wx < 0 ? 1 : -1;
}

function bboxOf(coords) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of coords) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}

// 미터 단위 원(정확도 표시용) 다각형
function circlePoly(center, radius, steps = 40) {
  const ring = [];
  for (let i = 0; i <= steps; i++) ring.push(offsetPt(center, (i / steps) * 360, radius));
  return { type: 'Polygon', coordinates: [ring] };
}

// ── 주행 기록(지나간 길)용 ──
// 선 줄이기(Douglas–Peucker): 남길 점의 번호. tol 은 미터(국지 평면 근사)
function simplifyIdx(coords, tol = 5) {
  const n = coords.length;
  if (n <= 2) return coords.map((_, i) => i);
  const kx = Math.cos(coords[0][1] * RAD) * EARTH_R * RAD, ky = EARTH_R * RAD;
  const X = new Float64Array(n), Y = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = coords[i][0] * kx; Y[i] = coords[i][1] * ky; }
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack = [0, n - 1];
  while (stack.length) {
    const b = stack.pop(), a = stack.pop();
    const dx = X[b] - X[a], dy = Y[b] - Y[a], L2 = dx * dx + dy * dy;
    let md = 0, mi = -1;
    for (let i = a + 1; i < b; i++) {
      let t = L2 > 0 ? ((X[i] - X[a]) * dx + (Y[i] - Y[a]) * dy) / L2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(X[i] - (X[a] + dx * t), Y[i] - (Y[a] + dy * t));
      if (d > md) { md = d; mi = i; }
    }
    if (mi > 0 && md > tol) { keep[mi] = 1; stack.push(a, mi, mi, b); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
const simplifyLine = (coords, tol = 5) => simplifyIdx(coords, tol).map(i => coords[i]);
function lineLen(coords) { let s = 0; for (let i = 1; i < coords.length; i++) s += hav(coords[i - 1], coords[i]); return s; }

// 선 위에서 점 p 와 가장 가까운 곳: i(선분 시작 번호)·t(선분 안 비율)·d(거리 m)·along(처음부터 m). from~to 번째 점 사이만 본다
function nearestOnLine(coords, p, from = 0, to = coords.length - 1, cum = null) {
  const n = coords.length;
  if (n < 2) return { i: 0, t: 0, d: n ? hav(p, coords[0]) : Infinity, along: 0 };
  from = clamp(from, 0, n - 2); to = clamp(to, from + 1, n - 1);
  let best = { i: from, t: 0, d: Infinity };
  for (let i = from; i < to; i++) {
    const r = projSeg(p, coords[i], coords[i + 1]);
    if (r.d < best.d) best = { i, t: r.t, d: r.d };
  }
  const c = cum || cumDist(coords);
  best.along = c[best.i] + (c[best.i + 1] - c[best.i]) * best.t;
  return best;
}

// 기록한 길 a 를 선 b 가 얼마나 지나는지: a 를 step 미터마다 보아 b 에서 tol 미터 안인 비율과, 벗어난 구간 [시작, 끝](a 위 거리)
// 두 선 모두 앞에서 뒤로 가므로 b 쪽은 앞으로만 움직이는 창에서 찾는다(못 찾으면 전체에서)
function coverage(a, b, tol = 30, step = 20) {
  const ca = cumDist(a), total = ca[ca.length - 1];
  if (total <= 0 || b.length < 2) return { share: 0, gaps: total > 0 ? [[0, total]] : [] };
  let k = 0, inside = 0, n = 0, gapStart = -1;
  const gaps = [];
  for (let d = 0; d <= total + 1e-6; d += step) {
    const p = pointAt(a, ca, Math.min(d, total)).p;
    let r = nearestOnLine(b, p, Math.max(0, k - 30), Math.min(b.length - 1, k + 400));
    if (r.d > tol) { const r2 = nearestOnLine(b, p); if (r2.d < r.d) r = r2; }
    n++;
    if (r.d <= tol) {
      inside++;
      k = Math.max(k, r.i);
      if (gapStart >= 0) { gaps.push([gapStart, d]); gapStart = -1; }
    } else if (gapStart < 0) gapStart = d;
  }
  if (gapStart >= 0) gaps.push([gapStart, total]);
  return { share: n ? inside / n : 0, gaps };
}
