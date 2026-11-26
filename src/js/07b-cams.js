// ───────────────────────── 단속 카메라 ─────────────────────────
// 자료: 경찰청·지방자치단체 「전국무인교통단속카메라표준데이터」(공공데이터포털) → tools/cameras.py 로 만든 cameras.json
// 종류: 1 신호, 2 과속, 3 신호·과속, 5 구간단속 시작, 6 구간단속 끝, 9 기타(제한속도 있음)
const CAM_KO = { 1: '신호 단속 카메라', 2: '과속 단속 카메라', 3: '신호·과속 단속 카메라', 5: '구간단속 시작', 6: '구간단속 끝', 9: '단속 카메라' };
const CAM_CELL = 0.01;
const camCell = (lat, lon) => Math.floor(lat / CAM_CELL) * 100000 + Math.floor(lon / CAM_CELL);

const CamDB = {
  ready: false, n: 0, date: '', src: '', err: '', grid: new Map(),
  load() {
    if (this.loading) return this.loading;
    // 파일로 연 화면은 옆 파일을 읽을 수 없다(브라우저 보안) → 카메라 기능 끔
    if (typeof location !== 'undefined' && /^(file|content):$/.test(location.protocol)) { this.err = 'localfile'; return (this.loading = Promise.resolve()); }
    this.loading = fetchJSON('cameras.json', { timeout: 25000 }).then(d => this.decode(d)).catch(e => { this.err = e.message || 'load'; });
    return this.loading;
  },
  decode(d) {
    const a = d.d || [], n = Math.floor(a.length / 6);
    this.lat = new Float64Array(n); this.lon = new Float64Array(n);
    this.type = new Uint8Array(n); this.lim = new Uint8Array(n); this.zone = new Uint8Array(n); this.slen = new Uint32Array(n);
    this.grid = new Map();
    let la = 0, lo = 0;
    for (let i = 0; i < n; i++) {
      la += a[i * 6]; lo += a[i * 6 + 1];
      this.lat[i] = la / 1e5; this.lon[i] = lo / 1e5;
      this.type[i] = a[i * 6 + 2]; this.lim[i] = a[i * 6 + 3]; this.zone[i] = a[i * 6 + 4]; this.slen[i] = a[i * 6 + 5];
      const k = camCell(this.lat[i], this.lon[i]);
      let arr = this.grid.get(k); if (!arr) this.grid.set(k, arr = []); arr.push(i);
    }
    this.n = n; this.date = d.date || ''; this.src = d.src || ''; this.ready = true;
  },
};

// 경로 위 카메라 찾기: 경로선에서 오른쪽 30m·왼쪽 9m 안(반대 차로 카메라는 대개 왼쪽 멀리 있음)
function camsForRoute(route, { signal = true } = {}) {
  if (!CamDB.ready || !route) return [];
  const { coords, cum } = route;
  const best = new Map();
  const M = 0.0004;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i], b = coords[i + 1], L = cum[i + 1] - cum[i];
    if (L <= 0) continue;
    const la0 = Math.min(a[1], b[1]) - M, la1 = Math.max(a[1], b[1]) + M, lo0 = Math.min(a[0], b[0]) - M, lo1 = Math.max(a[0], b[0]) + M;
    for (let cy = Math.floor(la0 / CAM_CELL); cy <= Math.floor(la1 / CAM_CELL); cy++) {
      for (let cx = Math.floor(lo0 / CAM_CELL); cx <= Math.floor(lo1 / CAM_CELL); cx++) {
        const arr = CamDB.grid.get(cy * 100000 + cx);
        if (!arr) continue;
        for (const j of arr) {
          const p = [CamDB.lon[j], CamDB.lat[j]];
          if (p[1] < la0 || p[1] > la1 || p[0] < lo0 || p[0] > lo1) continue;
          const pr = projSeg(p, a, b);
          if (pr.d > 32) continue;
          const cur = best.get(j);
          if (!cur || pr.d < cur.dist) best.set(j, { d: cum[i] + pr.t * L, dist: pr.d, off: pr.d * sideOfLine(p, a, b) });
        }
      }
    }
  }
  const list = [];
  for (const [j, v] of best) {
    if (v.off < -9 || v.off > 30) continue;
    const t = CamDB.type[j];
    if (t === 1 && !signal) continue;
    list.push({ i: j, d: v.d, off: v.off, t, lim: CamDB.lim[j], zone: CamDB.zone[j], slen: CamDB.slen[j], lon: CamDB.lon[j], lat: CamDB.lat[j] });
  }
  list.sort((x, y) => x.d - y.d);
  const out = [];
  for (const c of list) { const p = out[out.length - 1]; if (p && p.t === c.t && c.d - p.d < 60) continue; out.push(c); }
  // 구간단속: 시작점과 경로 위의 끝점을 짝짓기(없으면 자료의 구간 길이로)
  for (let k = 0; k < out.length; k++) {
    const c = out[k];
    if (c.t !== 5) continue;
    const want = c.slen || 0;
    for (let m = k + 1; m < out.length; m++) {
      const e = out[m], gap = e.d - c.d;
      if (want && gap > want * 1.4 + 800) break;
      if (e.t === 6 && gap > 200) { c.endD = e.d; e.paired = true; break; }
    }
    if (c.endD == null && want) c.endD = c.d + want;
  }
  return out.filter(c => c.t !== 6 || c.paired);
}

function camPhrase(c, dist) {
  const dw = distWords(dist);
  if (c.t === 5) return `${dw} 앞 구간단속 시작입니다. 제한속도 ${c.lim}킬로미터${c.endD ? ', 구간 길이 ' + distWords(c.endD - c.d) : ''}입니다`;
  if (c.t === 6) return `${dw} 앞 구간단속 종료 지점입니다`;
  const zone = c.zone === 2 ? '어린이 보호구역, ' : c.zone === 1 ? '노인 보호구역, ' : '';
  return `${zone}${dw} 앞 ${CAM_KO[c.t] || '단속 카메라'}입니다${c.lim ? '. 제한속도 ' + c.lim + '킬로미터입니다' : ''}`;
}

// 안내 중 카메라 알림·구간단속 평균 속도·제한속도 초과 경고
class CamGuide {
  constructor(cams, o) { this.c = cams; this.o = o; this.k = 0; this.said = new Set(); this.warned = new Set(); this.sec = null; }
  say(t, opt) { if (this.o.speak) this.o.speak(t, opt); }
  update(d, v, now) {
    const set = this.o.settings ? this.o.settings() : {};
    const kmh = v * 3.6;
    while (this.k < this.c.length && this.c[this.k].d < d - 15) {
      const c = this.c[this.k++];
      if (c.t === 5 && c.endD && !this.sec) this.sec = { id: c.i, lim: c.lim, end: c.endD, d0: c.d, t0: now };
    }
    let sec = null;
    if (this.sec) {
      const s = this.sec;
      const avg = (d - s.d0) / Math.max(1, (now - s.t0) / 1000) * 3.6;
      if (d >= s.end) {
        if (set.camVoice !== false) this.say(`구간단속이 끝났습니다${avg > 5 && d - s.d0 > 500 ? '. 평균 속도는 ' + Math.round(avg) + '킬로미터였습니다' : ''}`);
        this.sec = null;
      } else {
        sec = { lim: s.lim, avg: d - s.d0 > 300 ? avg : null, left: s.end - d };
        if (sec.avg && sec.avg > s.lim + 1 && !s.warnAvg && set.overWarn !== false) { s.warnAvg = true; this.say('구간 평균 속도가 제한속도를 넘었습니다. 속도를 줄이세요', { urgent: true }); }
      }
    }
    const c = this.c[this.k];
    const ahead = c ? { cam: c, dist: c.d - d } : null;
    if (ahead && set.camVoice !== false && !this.said.has(c.i)) {
      const stage = (c.lim >= 80 || kmh >= 70) ? 600 : 300;
      if (ahead.dist <= stage + v * 2 && ahead.dist > 40) { this.said.add(c.i); this.say(camPhrase(c, ahead.dist)); }
    }
    const limNow = sec ? sec.lim : (ahead && ahead.dist < 600 && ahead.cam.lim) || 0;
    const over = limNow > 0 && kmh > limNow + 3;
    if (over && set.overWarn !== false) {
      const key = sec ? 's' + this.sec.id : 'c' + c.i;
      if (!this.warned.has(key)) { this.warned.add(key); this.say('제한속도를 넘었습니다. 속도를 줄이세요', { urgent: true }); }
    }
    return { ahead: ahead && ahead.dist < 1000 ? ahead : null, limNow, over, sec };
  }
}
