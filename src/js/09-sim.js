// ───────────────────────── 모의 주행 ─────────────────────────
// 실제 GPS 대신 경로를 따라 움직이는 가상 위치를 만든다(PC에서 안내·음성 미리 듣기용).
class Sim {
  constructor(route, { factor = 1, onFix, interval = 500 } = {}) {
    this.r = route; this.onFix = onFix; this.factor = factor; this.interval = interval;
    this.d = 0; this.v = 0; this.timer = 0; this.paused = false; this.ended = false;
    this.total = route.cum[route.cum.length - 1];
  }
  start() {
    this.last = performance.now();
    this.emit();
    this.timer = setInterval(() => this.tick(), this.interval);
  }
  stop() { clearInterval(this.timer); this.timer = 0; }
  setFactor(f) { this.factor = f; }
  togglePause() { this.paused = !this.paused; this.last = performance.now(); return this.paused; }

  targetSpeed() {
    const steps = this.r.steps;
    let ci = 0;
    while (ci + 1 < steps.length && steps[ci + 1].at <= this.d) ci++;
    const cur = steps[ci];
    let base = cur && cur.hw ? 27 : 15;                          // 고속도로 약 97km/h, 일반 약 54km/h
    for (let j = ci + 1; j < steps.length; j++) {
      const s = steps[j];
      if (!s.voice) continue;
      const dn = s.at - this.d;
      if (dn > 250) break;
      const slow = s.kind === 'arrive' || s.kind === 'waypoint' ? 2 : (s.kind === 'turn' || s.kind === 'uturn' || s.kind === 'roundabout') ? 6.5 : 12;
      base = Math.min(base, slow + Math.max(0, dn - 15) * 0.09);
      break;
    }
    return base;
  }

  tick() {
    if (this.ended) return;
    const t = performance.now();
    const dt = Math.min(2, (t - this.last) / 1000) * this.factor;
    this.last = t;
    if (this.paused) return;
    const vt = this.targetSpeed();
    const a = vt > this.v ? 2.2 : -3.2;
    this.v = a > 0 ? Math.min(vt, this.v + a * dt) : Math.max(vt, this.v + a * dt);
    this.v = Math.max(this.v, 1.2);
    this.d = Math.min(this.total, this.d + this.v * dt);
    this.emit();
    if (this.d >= this.total) { this.ended = true; this.v = 0; this.emit(); this.stop(); }
  }

  emit() {
    const pa = pointAt(this.r.coords, this.r.cum, this.d);
    this.onFix && this.onFix({ lon: pa.p[0], lat: pa.p[1], acc: 5, speed: this.v, heading: pa.brg, t: Date.now(), sim: true });
  }
}
