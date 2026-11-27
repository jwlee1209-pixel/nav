// ───────────────────────── 차트(저장된 값으로 간단히 그리기 — 편집은 PowerPoint 에서) ─────────────────────────
function chartData(doc) {
  const plot = desc(doc.documentElement, 'plotArea');
  const types = ['barChart', 'bar3DChart', 'lineChart', 'line3DChart', 'pieChart', 'pie3DChart', 'doughnutChart', 'areaChart', 'area3DChart', 'scatterChart', 'radarChart'];
  const ch = kids(plot).find(k => types.includes(ln(k)));
  if (!ch) return null;
  const cache = e => {
    const c = e && (desc(e, 'strCache') || desc(e, 'numCache'));
    const out = [];
    if (c) for (const pt of kids(c, 'pt')) out[num(pt, 'idx', 0)] = (kid(pt, 'v') || {}).textContent;
    return out;
  };
  const series = kids(ch, 'ser').map((s, i) => ({
    name: cache(kid(s, 'tx'))[0] || `계열 ${i + 1}`,
    cats: cache(kid(s, 'cat') || kid(s, 'xVal')),
    vals: cache(kid(s, 'val') || kid(s, 'yVal')).map(v => +v || 0),
    spPr: kid(s, 'spPr'), dPts: kids(s, 'dPt'),
  }));
  const titleEl = desc(doc.documentElement, 'title');
  const title = titleEl ? [...titleEl.getElementsByTagName('*')].filter(e => ln(e) === 't').map(e => e.textContent).join('') : '';
  const auto = desc(doc.documentElement, 'autoTitleDeleted');
  return {
    kind: ln(ch).replace(/3D/, '').replace(/Chart$/, ''), dir: attr(kid(ch, 'barDir'), 'val', 'col'), grouping: attr(kid(ch, 'grouping'), 'val', 'clustered'),
    series, title: title || (series.length === 1 && !(auto && bool(auto, 'val', true)) ? series[0].name : ''), legend: !!desc(doc.documentElement, 'legend'),
    hole: num(kid(ch, 'holeSize'), 'val', 50),
  };
}

function renderChart(doc, ctx, w, hh) {
  const d = chartData(doc);
  const box = h('div', { class: 'chartbox' });
  if (!d || !d.series.length) { box.append(h('div', { class: 'ph-note', text: '차트' })); return box; }
  const NSV = 'http://www.w3.org/2000/svg';
  const S = (tag, a) => { const e = document.createElementNS(NSV, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  const svg = S('svg', { width: w, height: hh, viewBox: `0 0 ${w} ${hh}` });
  const accents = ['accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6'].map(k => '#' + (ctx.theme.colors[k] || '4472C4'));
  const serColor = (s, i) => { const f = s.spPr && findFill(s.spPr); const fi = f && fillOf(f, ctx); return fi && fi.type === 'solid' ? '#' + toHex(fi.color) : accents[i % 6]; };
  const fs = Math.max(9, Math.min(14, hh / 22));
  let top = 6;
  if (d.title) { svg.append(Object.assign(S('text', { x: w / 2, y: top + fs * 1.3, 'text-anchor': 'middle', 'font-size': fs * 1.3, fill: '#404040' }), { textContent: d.title })); top += fs * 2; }
  const legendH = d.legend ? fs * 2 : 0;
  const cats = d.series[0].cats.length ? d.series[0].cats : d.series[0].vals.map((_, i) => String(i + 1));
  if (d.kind === 'pie' || d.kind === 'doughnut') {
    const s = d.series[0], tot = s.vals.reduce((a, b) => a + Math.max(0, b), 0) || 1;
    const cx = w / 2, cy = top + (hh - top - legendH) / 2, r = Math.max(4, Math.min(w, hh - top - legendH) / 2 - 8);
    let a0 = -Math.PI / 2;
    s.vals.forEach((v, i) => {
      const a1 = a0 + Math.max(0, v) / tot * Math.PI * 2;
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const dP = s.dPts.find(p => num(kid(p, 'idx'), 'val', -1) === i);
      const fi = dP && kid(dP, 'spPr') && fillOf(findFill(kid(dP, 'spPr')), ctx);
      const col = fi && fi.type === 'solid' ? '#' + toHex(fi.color) : accents[i % 6];
      svg.append(S('path', { d: `M${cx},${cy} L${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 ${large} 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)} Z`, fill: col, stroke: '#fff', 'stroke-width': 1 }));
      a0 = a1;
    });
    if (d.kind === 'doughnut') svg.append(S('circle', { cx, cy, r: r * d.hole / 100, fill: '#fff' }));
    if (d.legend) legend(cats.map((c, i) => [c, accents[i % 6]]));
    box.append(svg); return box;
  }
  const L = 34, R = 10, B = fs * 2 + 4 + legendH, T = top + 6;
  const pw = Math.max(10, w - L - R), ph = Math.max(10, hh - T - B);
  const stacked = /stacked/i.test(d.grouping);
  const n = Math.max(...d.series.map(s => s.vals.length), 1);
  let max = 0, min = 0;
  for (let i = 0; i < n; i++) {
    if (stacked) { const sum = d.series.reduce((a, s) => a + (s.vals[i] || 0), 0); max = Math.max(max, sum); }
    else for (const s of d.series) { max = Math.max(max, s.vals[i] || 0); min = Math.min(min, s.vals[i] || 0); }
  }
  const step = niceStep((max - min) / 5 || 1);
  max = Math.ceil(max / step) * step || step; min = Math.floor(min / step) * step;
  const horiz = d.kind === 'bar' && d.dir === 'bar';
  const V = v => (horiz ? L + (v - min) / (max - min) * pw : T + ph - (v - min) / (max - min) * ph);
  for (let v = min; v <= max + 1e-9; v += step) {
    const p = V(v);
    svg.append(horiz ? S('line', { x1: p, x2: p, y1: T, y2: T + ph, stroke: '#d9d9d9' }) : S('line', { x1: L, x2: L + pw, y1: p, y2: p, stroke: '#d9d9d9' }));
    svg.append(Object.assign(S('text', horiz ? { x: p, y: T + ph + fs, 'text-anchor': 'middle', 'font-size': fs, fill: '#595959' } : { x: L - 4, y: p + fs / 3, 'text-anchor': 'end', 'font-size': fs, fill: '#595959' }), { textContent: fmtNum(v) }));
  }
  const band = (horiz ? ph : pw) / n;
  cats.forEach((c, i) => {
    const mid = (horiz ? T : L) + band * (i + 0.5);
    svg.append(Object.assign(S('text', horiz ? { x: L - 4, y: mid + fs / 3, 'text-anchor': 'end', 'font-size': fs, fill: '#595959' } : { x: mid, y: T + ph + fs * 1.2, 'text-anchor': 'middle', 'font-size': fs, fill: '#595959' }), { textContent: c == null ? '' : String(c) }));
  });
  if (d.kind === 'bar') {
    const ns = stacked ? 1 : d.series.length, gw = band * 0.7, bw = gw / ns;
    const acc = new Array(n).fill(0);
    d.series.forEach((s, si) => s.vals.forEach((v, i) => {
      const base = stacked ? acc[i] : 0, top_ = base + v; if (stacked) acc[i] = top_;
      const o = (horiz ? T : L) + band * i + (band - gw) / 2 + (stacked ? 0 : bw * si);
      const a = V(Math.min(base, top_) < min ? min : Math.min(base, top_)), b = V(Math.max(base, top_));
      svg.append(horiz ? S('rect', { x: Math.min(a, b), y: o, width: Math.abs(b - a), height: bw * 0.95, fill: serColor(s, si) }) : S('rect', { x: o, y: Math.min(a, b), width: bw * 0.95, height: Math.abs(b - a), fill: serColor(s, si) }));
    }));
  } else {
    d.series.forEach((s, si) => {
      const pts = s.vals.map((v, i) => [L + band * (i + 0.5), V(v)]);
      if (d.kind === 'area') svg.append(S('path', { d: `M${pts[0][0]},${V(0)} ` + pts.map(p => `L${p[0]},${p[1]}`).join(' ') + ` L${pts[pts.length - 1][0]},${V(0)} Z`, fill: serColor(s, si), 'fill-opacity': 0.7 }));
      else { svg.append(S('polyline', { points: pts.map(p => p.join(',')).join(' '), fill: 'none', stroke: serColor(s, si), 'stroke-width': 2.25 })); pts.forEach(p => svg.append(S('circle', { cx: p[0], cy: p[1], r: 3, fill: serColor(s, si) }))); }
    });
  }
  svg.append(S('line', horiz ? { x1: L, x2: L, y1: T, y2: T + ph, stroke: '#bfbfbf' } : { x1: L, x2: L + pw, y1: V(Math.max(0, min)), y2: V(Math.max(0, min)), stroke: '#bfbfbf' }));
  if (d.legend) legend(d.series.map((s, i) => [s.name, serColor(s, i)]));
  box.append(svg);
  return box;
  function legend(items) {
    const y = hh - fs * 0.8;
    let x = w / 2 - items.reduce((a, [t]) => a + fs * 1.6 + String(t).length * fs * 0.62, 0) / 2;
    for (const [t, c] of items) {
      svg.append(S('rect', { x, y: y - fs * 0.75, width: fs * 0.8, height: fs * 0.8, fill: c }));
      svg.append(Object.assign(S('text', { x: x + fs, y, 'font-size': fs, fill: '#595959' }), { textContent: String(t) }));
      x += fs * 1.6 + String(t).length * fs * 0.62;
    }
  }
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
const fmtNum = v => (Math.abs(v) >= 1000 ? v.toLocaleString('ko-KR') : String(+v.toFixed(2)));
