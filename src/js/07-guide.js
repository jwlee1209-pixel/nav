// ───────────────────────── 길 안내 엔진 ─────────────────────────
// 위치(GPS 또는 모의 주행)를 받아 경로 위 진행 위치를 찾고, 다음 회전·음성 안내·이탈·도착을 판단한다.
class Guide {
  constructor(route, o) {
    this.r = route;
    this.o = o;                       // {speak(text,{urgent}), event(name,data), settings(), corr, destName, rerouted, mode}
    this.W = o.mode === 'walk' || route.mode === 'walk';   // 도보: 느린 속도에 맞춘 거리·판정
    this.total = route.cum[route.cum.length - 1];
    this.d = 0;
    this.matched = false;
    this.ptr = 0;
    this.done = new Map();
    this.offN = 0; this.offT = 0; this.rerouting = false; this.lastReroute = o.lastReroute || 0;
    this.arrived = false;
    this.lastFix = null; this.heading = null; this.speed = 0;
    this.visited = new Set();
    this.traveled = 0;
    this.started = false;
  }

  say(text, opt = {}) { this.o.speak && this.o.speak(text, opt); }
  ev(name, data) { this.o.event && this.o.event(name, data); }

  intro() {
    if (this.started) return;
    this.started = true;
    if (this.o.rerouted) { this.say('새 경로로 안내합니다'); return; }
    const corr = this.o.corr || 1;
    const dn = this.o.destName ? `${this.o.destName}까지 ` : '';
    const dur = fmtDur(this.o.totalDur || this.r.duration * corr);
    if (this.W) this.say(`${dn}도보 안내를 시작합니다. ${distWords(this.total)}, 걸어서 약 ${dur} 걸립니다`);
    else this.say(`${dn}경로 안내를 시작합니다. ${distWords(this.total)}, 약 ${dur} 걸립니다`);
  }

  match(p, hd, v) {
    const { coords, cum } = this.r, n = coords.length;
    let i0 = 0, i1 = n - 2;
    if (this.matched && this.offN === 0) {
      i0 = Math.max(0, locate(cum, this.d - 60));
      i1 = Math.min(n - 2, locate(cum, this.d + 300 + v * 15) + 1);
    }
    let best = null;
    for (let i = i0; i <= i1; i++) {
      const L = cum[i + 1] - cum[i];
      if (L <= 0) continue;
      const pr = projSeg(p, coords[i], coords[i + 1]);
      let cost = pr.d;
      if (hd != null && v > 3) {
        const dh = Math.abs(angDiff(brg(coords[i], coords[i + 1]), hd));
        if (dh > 110) cost += 50; else if (dh > 60) cost += 15;
      }
      if (this.matched) {
        const along = cum[i] + pr.t * L;
        if (along < this.d - 40) cost += 30;              // 뒤로 크게 튀는 매칭 억제
      }
      if (!best || cost < best.cost) best = { i, along: cum[i] + pr.t * L, dist: pr.d, cost };
    }
    return best;
  }

  update(fix) {
    const p = [fix.lon, fix.lat];
    const now = fix.t || Date.now();
    let v = fix.speed;
    if ((v == null || !isFinite(v)) && this.lastFix) {
      const dt = (now - this.lastFix.t) / 1000;
      if (dt > 0.2) v = hav([this.lastFix.lon, this.lastFix.lat], p) / dt;
    }
    v = isFinite(v) && v >= 0 ? v : 0;
    this.speed = this.lastFix ? this.speed * 0.35 + v * 0.65 : v;
    const W = this.W;
    let hd = (fix.heading != null && isFinite(fix.heading) && v > (W ? 0.6 : 1.5)) ? fix.heading : null;
    if (this.lastFix) {
      const moved = hav([this.lastFix.lon, this.lastFix.lat], p);
      this.traveled += Math.min(moved, 500);
      if (hd == null && moved > (W ? 3 : 4)) hd = brg([this.lastFix.lon, this.lastFix.lat], p);
    }
    this.lastFix = { ...fix, t: now };

    const acc = fix.acc || 10;
    const m = this.match(p, hd, v);
    const thr = W ? clamp(acc + 15, 25, 50) : clamp(acc + 20, 30, 70);
    const on = !!m && m.dist <= thr;
    let shown = p, routeBrg = null;
    if (on) {
      if (this.rerouting && this.matched) { this.rerouting = false; this.ev('backon'); }
      this.d = m.along;
      this.matched = true;
      this.offN = 0; this.offT = 0;
      const sp = pointAt(this.r.coords, this.r.cum, this.d);
      shown = sp.p; routeBrg = sp.brg;
    } else if (acc <= (W ? 40 : 60) && !this.arrived) {
      this.offN++;
      if (!this.offT) this.offT = now;
      // 걸을 때는 GPS 가 조금만 흔들려도 길을 벗어난 것처럼 보이므로 더 오래 지켜본다
      if (!this.rerouting && this.offN >= (W ? 4 : 3) && now - this.offT >= (W ? 6000 : 2500) && now - this.lastReroute > (W ? 12000 : 8000)) {
        this.rerouting = true; this.lastReroute = now;
        this.say('경로를 벗어나 다시 탐색합니다', { urgent: true });
        this.ev('offroute', { lon: fix.lon, lat: fix.lat, heading: hd, speed: v });
      }
    }
    if (hd != null) this.heading = hd;
    else if (routeBrg != null && this.heading == null) this.heading = routeBrg;
    const dispHeading = on && routeBrg != null ? routeBrg : this.heading;

    const steps = this.r.steps;
    while (this.ptr < steps.length - 1 && this.d > steps[this.ptr].at + 8) this.ptr++;
    let nv = this.ptr;
    while (nv < steps.length - 1 && !steps[nv].voice) nv++;
    const next = steps[nv];
    const nextDist = Math.max(0, next.at - this.d);
    let ai = -1;
    for (let j = nv + 1; j < steps.length; j++) if (steps[j].voice) { ai = j; break; }
    const after = ai >= 0 ? steps[ai] : null;
    const afterGap = after ? after.at - next.at : null;
    let ci = Math.max(0, this.ptr - 1);
    while (ci + 1 < steps.length && steps[ci + 1].at <= this.d) ci++;
    const cur = steps[ci];
    const hw = !W && (!!(cur && cur.hw) || this.speed * 3.6 >= 75);

    const rem = Math.max(0, this.total - this.d);
    const frac = cur && cur.span > 0 ? clamp((this.d - cur.at) / cur.span, 0, 1) : 1;
    const durScale = this.r.stepDur > 0 ? this.r.duration / this.r.stepDur : 1;
    let remDur;
    const fac = this.o.factors;
    if (fac) {     // 도로별로 배운 비율을 남은 구간마다 적용
      let sum = cur ? (1 - frac) * (cur.dur || 0) * (fac[ci] || 1) : 0;
      for (let j = ci + 1; j < steps.length; j++) sum += (steps[j].dur || 0) * (fac[j] || 1);
      remDur = sum * durScale;
    } else remDur = Math.max(0, (this.r.stepDur - ((cur ? cur.tAt : 0) + frac * (cur ? cur.dur || 0 : 0))) * durScale) * (this.o.corr || 1);

    // 구간(회전과 회전 사이) 통과 시간 기록 → 도로별 실제 속도 학습에 쓰임
    if (this.segIdx !== ci) {
      if (this.segIdx != null && ci === this.segIdx + 1 && this.segOk) {
        const s = steps[this.segIdx];
        const act = (now - this.segT0) / 1000, pred = (s.dur || 0) * durScale;
        if (s.name && (s.span || 0) >= 300 && pred >= 20 && act > 0) this.ev('segment', { name: s.name, act, pred, t: this.segT0 });
      }
      this.segOk = on && (this.segIdx != null || this.d - (cur ? cur.at : 0) < 40);
      this.segIdx = ci; this.segT0 = now;
    }
    if (!on || this.rerouting) this.segOk = false;

    // 경유지 통과
    for (let j = Math.max(0, this.ptr - 1); j < steps.length; j++) {
      const s = steps[j];
      if (s.kind !== 'waypoint' || this.visited.has(j)) continue;
      const wr = W ? 15 : 30;
      if (s.at - this.d > wr) break;
      if (Math.abs(s.at - this.d) <= wr || this.d > s.at) {
        this.visited.add(j);
        this.done.set(j, new Set(['soon', 2000, 1000, 500, 300]));
        this.say('경유지에 도착했습니다. 다음 목적지로 안내합니다', { urgent: true });
        this.ev('waypoint', { leg: s.leg });
      }
    }

    // 도착
    const endD = on ? hav(p, this.r.coords[this.r.coords.length - 1]) : Infinity;
    const reached = W ? (rem < 12 || endD < 15) : (rem < 25 || (rem < 60 && this.speed < 1.5) || endD < 25);
    if (!this.arrived && this.matched && reached) {
      this.arrived = true;
      const last = steps[steps.length - 1];
      this.say(`목적지에 도착했습니다.${last && last.side ? ' 목적지는 ' + SIDE_KO[last.side] + '에 있습니다.' : ''} 안내를 종료합니다`, { urgent: true });
      this.ev('arrive');
    }

    if (on && !this.arrived && !this.rerouting) this.announce(nv, next, nextDist, ai, after, afterGap, hw, cur);

    return {
      on, p: shown, raw: p, heading: dispHeading, speed: this.speed, acc,
      d: this.d, rem, remDur, eta: Date.now() + remDur * 1000,
      next, nextIdx: nv, nextDist, after, afterGap, cur, hw,
      rerouting: this.rerouting, arrived: this.arrived, gpsWeak: acc > 60,
    };
  }

  announce(i, s, dist, ai, after, gap, hw, cur) {
    const set = this.done.get(i) || new Set();
    this.done.set(i, set);
    const W = this.W;
    const v = Math.max(this.speed, W ? 1.2 : 3);
    const kmh = v * 3.6;
    const verb = (this.o.settings && this.o.settings().verbosity) || 'normal';
    const soonD = W ? 22 : clamp(v * 7, 45, 180);

    // 잠시 후
    if (dist <= soonD + v) {
      if (set.has('soon')) return;
      ['soon', 2000, 1000, 500, 300].forEach(k => set.add(k));
      let text = sayStep(s, dist, { soon: true, target: false });
      if (after && gap != null && gap < (W ? 30 : Math.max(100, v * 9)) && s.kind !== 'arrive') {
        const t = after.kind === 'turn' || after.kind === 'uturn' ? turnCore(after).core : showStep(after).title;
        text += `. 이어서 ${t}입니다`;
        const aset = this.done.get(ai) || new Set();
        [2000, 1000, 500, 300].forEach(k => aset.add(k));
        if (gap < (W ? 30 : 60)) aset.add('soon');
        this.done.set(ai, aset);
      }
      this.say(text, { urgent: true });
      return;
    }

    let stages = hw ? [2000, 1000, 500] : (kmh >= 45 ? [1000, 300] : [300]);
    if (verb === 'brief') stages = hw ? [1000] : [300];
    if (verb === 'detail') stages = hw ? [2000, 1000, 500] : [1000, 500, 300];
    if (W) stages = verb === 'brief' ? [] : verb === 'detail' ? [200, 100, 50] : [100];   // 도보: 100m 앞 + 잠시 후
    const lead = v * 1.5;
    const due = stages.filter(st => dist <= st + lead && !set.has(st));
    if (due.length && dist > soonD + (W ? 10 : 25)) {
      const lo = Math.min(...due);
      stages.forEach(st => { if (st >= lo) set.add(st); });
      // 곧 더 가까운 단계 안내가 나올 거리면 이번 안내는 건너뛴다(같은 말 반복 방지)
      const lower = stages.filter(st => st < lo).sort((a, b) => b - a)[0];
      if (lower && dist < lower + Math.max(W ? 30 : 220, lower * 0.8)) return;
      const text = sayStep(s, dist, { target: true });
      if (set.lastText === text) return;
      set.lastText = text;
      this.say(text);
      return;
    }

    // 긴 직진 구간 안내(회전 직후 한 번)
    const sinceTurn = this.d - (cur ? cur.at : 0);
    if (verb !== 'brief' && !set.has('straight') && cur && sinceTurn > (W ? 10 : 30) && sinceTurn < (W ? 80 : 400)) {
      const far = W ? 400 : hw ? 5000 : 2500;
      if (dist > far) {
        set.add('straight');
        const road = cur.name || '';
        this.say(`${road ? josa(road, '을/를') + ' 따라 ' : ''}${distWords(dist)} 직진입니다`);
      }
    }
  }

  rerouteFailed() { this.rerouting = false; this.offN = 0; this.offT = 0; }
}
