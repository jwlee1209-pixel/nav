// ───────────────────────── 도형 모양(프리셋·자유형) → SVG 경로 ─────────────────────────
const f2 = v => (Math.round(v * 100) / 100).toString();
const poly = pts => 'M' + pts.map(p => f2(p[0]) + ',' + f2(p[1])).join(' L') + ' Z';
const ell = (cx, cy, rx, ry) => `M${f2(cx - rx)},${f2(cy)} A${f2(rx)},${f2(ry)} 0 1 0 ${f2(cx + rx)},${f2(cy)} A${f2(rx)},${f2(ry)} 0 1 0 ${f2(cx - rx)},${f2(cy)} Z`;
const rrect = (x, y, w, hh, r) => { r = Math.min(r, w / 2, hh / 2); return r <= 0 ? poly([[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]]) : `M${f2(x + r)},${f2(y)} H${f2(x + w - r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(x + w)},${f2(y + r)} V${f2(y + hh - r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(x + w - r)},${f2(y + hh)} H${f2(x + r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(x)},${f2(y + hh - r)} V${f2(y + r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(x + r)},${f2(y)} Z`; };
const rad = a => a * Math.PI / 180;

// 별: n 꼭짓점, 안쪽 반지름 비율 k
function starPts(n, w, hh, k, rot = -90) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rad(rot + i * 180 / n), r = i % 2 ? k : 1;
    pts.push([w / 2 + Math.cos(a) * w / 2 * r, hh / 2 + Math.sin(a) * hh / 2 * r]);
  }
  return pts;
}
function regPoly(n, w, hh, rot = -90) { const pts = []; for (let i = 0; i < n; i++) { const a = rad(rot + i * 360 / n); pts.push([w / 2 + Math.cos(a) * w / 2, hh / 2 + Math.sin(a) * hh / 2]); } return pts; }
function avOf(avLst) {
  const out = {};
  for (const g of kids(avLst, 'gd')) { const m = /val\s+(-?[\d.]+)/.exec(attr(g, 'fmla', '')); if (m) out[attr(g, 'name')] = +m[1]; }
  return out;
}

// 화살표 공통: 몸통 두께 a1(높이 비율), 머리 길이 a2(짧은 변 비율)
function arrowR(w, hh, a1, a2) {
  const th = hh * a1 / 100000, hl = Math.min(w, Math.min(w, hh) * a2 / 100000);
  const y1 = hh / 2 - th / 2, y2 = hh / 2 + th / 2, x1 = w - hl;
  return poly([[0, y1], [x1, y1], [x1, 0], [w, hh / 2], [x1, hh], [x1, y2], [0, y2]]);
}
const flipPts = (pts, w, hh, fx, fy) => pts.map(([x, y]) => [fx ? w - x : x, fy ? hh - y : y]);
const rotPts = (pts, w, hh) => pts.map(([x, y]) => [x / hh * w, y / w * hh]);   // 가로 화살표를 세로로(축 바꿈)

// 프리셋 → [{d, fill, stroke}], 글자 영역 비율 tr = [l, t, r, b]
function presetPaths(name, w, hh, av) {
  const ss = Math.min(w, hh);
  const A = (k, d) => (av[k] != null ? av[k] : d);
  const one = (d, opt) => ({ paths: [{ d, fill: true, stroke: true }], ...opt });
  const line = d => ({ paths: [{ d, fill: false, stroke: true }], line: true });
  switch (name) {
    case 'rect': case 'flowChartProcess': case 'actionButtonBlank': case 'textBox': return one(poly([[0, 0], [w, 0], [w, hh], [0, hh]]));
    case 'roundRect': return one(rrect(0, 0, w, hh, ss * A('adj', 16667) / 100000));
    case 'flowChartAlternateProcess': return one(rrect(0, 0, w, hh, ss * 0.1667));
    case 'flowChartTerminator': return one(rrect(0, 0, w, hh, Math.min(w, hh) / 2));
    case 'snip1Rect': { const d = ss * A('adj', 16667) / 100000; return one(poly([[0, 0], [w - d, 0], [w, d], [w, hh], [0, hh]])); }
    case 'snip2SameRect': { const d = ss * A('adj1', 16667) / 100000, d2 = ss * A('adj2', 0) / 100000; return one(poly([[d, 0], [w - d, 0], [w, d], [w, hh - d2], [w - d2, hh], [d2, hh], [0, hh - d2], [0, d]])); }
    case 'snipRoundRect': { const r = ss * A('adj1', 16667) / 100000, d = ss * A('adj2', 16667) / 100000; return one(`M${f2(r)},0 H${f2(w - d)} L${f2(w)},${f2(d)} V${f2(hh)} H0 V${f2(r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(r)},0 Z`); }
    case 'round1Rect': { const r = ss * A('adj', 16667) / 100000; return one(`M0,0 H${f2(w - r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(w)},${f2(r)} V${f2(hh)} H0 Z`); }
    case 'round2SameRect': { const r = ss * A('adj1', 16667) / 100000, r2 = ss * A('adj2', 0) / 100000; return one(`M${f2(r)},0 H${f2(w - r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(w)},${f2(r)} V${f2(hh - r2)} A${f2(r2)},${f2(r2)} 0 0 1 ${f2(w - r2)},${f2(hh)} H${f2(r2)} A${f2(r2)},${f2(r2)} 0 0 1 0,${f2(hh - r2)} V${f2(r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(r)},0 Z`); }
    case 'round2DiagRect': { const r = ss * A('adj1', 16667) / 100000; return one(`M${f2(r)},0 H${f2(w)} V${f2(hh - r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(w - r)},${f2(hh)} H0 V${f2(r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(r)},0 Z`); }
    case 'ellipse': case 'flowChartConnector': return one(ell(w / 2, hh / 2, w / 2, hh / 2), { tr: [0.146, 0.146, 0.146, 0.146] });
    case 'triangle': case 'flowChartExtract': { const x = w * A('adj', 50000) / 100000; return one(poly([[x, 0], [w, hh], [0, hh]]), { tr: [0.25, 0.5, 0.25, 0] }); }
    case 'flowChartMerge': return one(poly([[0, 0], [w, 0], [w / 2, hh]]), { tr: [0.25, 0, 0.25, 0.5] });
    case 'rtTriangle': return one(poly([[0, 0], [w, hh], [0, hh]]), { tr: [0.08, 0.5, 0.5, 0.08] });
    case 'diamond': case 'flowChartDecision': return one(poly([[w / 2, 0], [w, hh / 2], [w / 2, hh], [0, hh / 2]]), { tr: [0.25, 0.25, 0.25, 0.25] });
    case 'parallelogram': case 'flowChartInputOutput': { const x = Math.min(w, ss * A('adj', name === 'parallelogram' ? 25000 : 20000) / 100000); return one(poly([[x, 0], [w, 0], [w - x, hh], [0, hh]]), { tr: [x / w / 2 + 0.05, 0.05, x / w / 2 + 0.05, 0.05] }); }
    case 'trapezoid': { const x = Math.min(w / 2, ss * A('adj', 25000) / 100000); return one(poly([[0, hh], [x, 0], [w - x, 0], [w, hh]])); }
    case 'flowChartManualOperation': return one(poly([[0, 0], [w, 0], [w * 0.8, hh], [w * 0.2, hh]]));
    case 'flowChartManualInput': return one(poly([[0, hh * 0.2], [w, 0], [w, hh], [0, hh]]));
    case 'pentagon': return one(poly(regPoly(5, w, hh)));
    case 'hexagon': { const x = Math.min(w / 2, ss * A('adj', 25000) / 100000); return one(poly([[0, hh / 2], [x, 0], [w - x, 0], [w, hh / 2], [w - x, hh], [x, hh]])); }
    case 'flowChartPreparation': return one(poly([[0, hh / 2], [w * 0.2, 0], [w * 0.8, 0], [w, hh / 2], [w * 0.8, hh], [w * 0.2, hh]]));
    case 'heptagon': return one(poly(regPoly(7, w, hh)));
    case 'octagon': { const x = ss * A('adj', 29289) / 100000; return one(poly([[x, 0], [w - x, 0], [w, x], [w, hh - x], [w - x, hh], [x, hh], [0, hh - x], [0, x]])); }
    case 'decagon': return one(poly(regPoly(10, w, hh, -90 + 18)));
    case 'dodecagon': return one(poly(regPoly(12, w, hh, -90 + 15)));
    case 'star4': return one(poly(starPts(4, w, hh, A('adj', 12500) / 50000)));
    case 'star5': return one(poly(starPts(5, w, hh, A('adj', 19098) / 50000 * 1.0)), { tr: [0.3, 0.35, 0.3, 0.25] });
    case 'star6': return one(poly(starPts(6, w, hh, A('adj', 28868) / 50000)));
    case 'star7': return one(poly(starPts(7, w, hh, A('adj', 34601) / 50000)));
    case 'star8': return one(poly(starPts(8, w, hh, A('adj', 38250) / 50000)));
    case 'star10': return one(poly(starPts(10, w, hh, A('adj', 42533) / 50000)));
    case 'star12': return one(poly(starPts(12, w, hh, A('adj', 37500) / 50000)));
    case 'star16': return one(poly(starPts(16, w, hh, A('adj', 37500) / 50000)));
    case 'star24': return one(poly(starPts(24, w, hh, A('adj', 37500) / 50000)));
    case 'star32': return one(poly(starPts(32, w, hh, A('adj', 37500) / 50000)));
    case 'irregularSeal1': case 'irregularSeal2': return one(poly(starPts(12, w, hh, 0.62).map(([x, y], i) => [x + (i % 3 - 1) * w * 0.02, y + (i % 4 - 1.5) * hh * 0.02])));
    case 'flowChartOr': return { paths: [{ d: ell(w / 2, hh / 2, w / 2, hh / 2), fill: true, stroke: true }, { d: `M${f2(w / 2)},0 V${f2(hh)} M0,${f2(hh / 2)} H${f2(w)}`, fill: false, stroke: true }] };
    case 'plus': { const x = ss * A('adj', 25000) / 100000; return one(poly([[x, 0], [w - x, 0], [w - x, x], [w, x], [w, hh - x], [w - x, hh - x], [w - x, hh], [x, hh], [x, hh - x], [0, hh - x], [0, x], [x, x]])); }
    case 'chevron': { const x = Math.min(w, ss * A('adj', 50000) / 100000); return one(poly([[0, 0], [w - x, 0], [w, hh / 2], [w - x, hh], [0, hh], [x, hh / 2]]), { tr: [x / w, 0, x / w, 0] }); }
    case 'homePlate': { const x = Math.min(w, ss * A('adj', 50000) / 100000); return one(poly([[0, 0], [w - x, 0], [w, hh / 2], [w - x, hh], [0, hh]]), { tr: [0, 0, x / w / 2, 0] }); }
    case 'rightArrow': return one(arrowR(w, hh, A('adj1', 50000), A('adj2', 50000)));
    case 'leftArrow': { const th = hh * A('adj1', 50000) / 100000, hl = Math.min(w, ss * A('adj2', 50000) / 100000); return one(poly(flipPts([[0, hh / 2 - th / 2], [w - hl, hh / 2 - th / 2], [w - hl, 0], [w, hh / 2], [w - hl, hh], [w - hl, hh / 2 + th / 2], [0, hh / 2 + th / 2]], w, hh, true, false))); }
    case 'upArrow': case 'downArrow': {
      const th = w * A('adj1', 50000) / 100000, hl = Math.min(hh, ss * A('adj2', 50000) / 100000);
      let pts = [[w / 2 - th / 2, hh], [w / 2 - th / 2, hl], [0, hl], [w / 2, 0], [w, hl], [w / 2 + th / 2, hl], [w / 2 + th / 2, hh]];
      if (name === 'downArrow') pts = flipPts(pts, w, hh, false, true);
      return one(poly(pts));
    }
    case 'leftRightArrow': { const th = hh * A('adj1', 50000) / 100000, hl = Math.min(w / 2, ss * A('adj2', 50000) / 100000); const y1 = hh / 2 - th / 2, y2 = hh / 2 + th / 2; return one(poly([[0, hh / 2], [hl, 0], [hl, y1], [w - hl, y1], [w - hl, 0], [w, hh / 2], [w - hl, hh], [w - hl, y2], [hl, y2], [hl, hh]])); }
    case 'upDownArrow': { const th = w * A('adj1', 50000) / 100000, hl = Math.min(hh / 2, ss * A('adj2', 50000) / 100000); const x1 = w / 2 - th / 2, x2 = w / 2 + th / 2; return one(poly([[w / 2, 0], [w, hl], [x2, hl], [x2, hh - hl], [w, hh - hl], [w / 2, hh], [0, hh - hl], [x1, hh - hl], [x1, hl], [0, hl]])); }
    case 'notchedRightArrow': { const th = hh * A('adj1', 50000) / 100000, hl = Math.min(w, ss * A('adj2', 50000) / 100000); const y1 = hh / 2 - th / 2, y2 = hh / 2 + th / 2, x1 = w - hl, n = th / 2 * hl / (hh / 2); return one(poly([[0, y1], [x1, y1], [x1, 0], [w, hh / 2], [x1, hh], [x1, y2], [0, y2], [n, hh / 2]])); }
    case 'stripedRightArrow': return one(arrowR(w, hh, A('adj1', 50000), A('adj2', 50000)));
    case 'curvedRightArrow': case 'curvedLeftArrow': case 'curvedUpArrow': case 'curvedDownArrow': case 'uturnArrow': case 'circularArrow': case 'bentArrow': case 'bentUpArrow':
      return one(arrowR(w, hh, 50000, 50000));
    case 'line': case 'straightConnector1': return line(`M0,0 L${f2(w)},${f2(hh)}`);
    case 'bentConnector2': return line(`M0,0 L${f2(w)},0 L${f2(w)},${f2(hh)}`);
    case 'bentConnector3': case 'bentConnector4': case 'bentConnector5': { const x = w * A('adj1', 50000) / 100000; return line(`M0,0 L${f2(x)},0 L${f2(x)},${f2(hh)} L${f2(w)},${f2(hh)}`); }
    case 'curvedConnector2': return line(`M0,0 Q${f2(w)},0 ${f2(w)},${f2(hh)}`);
    case 'curvedConnector3': case 'curvedConnector4': case 'curvedConnector5': { const x = w * A('adj1', 50000) / 100000; return line(`M0,0 C${f2(x)},0 ${f2(x)},${f2(hh)} ${f2(w)},${f2(hh)}`); }
    case 'donut': case 'noSmoking': { const t = ss * A('adj', 25000) / 100000; return { paths: [{ d: ell(w / 2, hh / 2, w / 2, hh / 2) + ' ' + ell(w / 2, hh / 2, Math.max(0, w / 2 - t), Math.max(0, hh / 2 - t)), fill: true, stroke: true, evenodd: true }] }; }
    case 'frame': { const t = ss * A('adj1', 12500) / 100000; return { paths: [{ d: poly([[0, 0], [w, 0], [w, hh], [0, hh]]) + ' ' + poly([[t, t], [t, hh - t], [w - t, hh - t], [w - t, t]]), fill: true, stroke: true, evenodd: true }] }; }
    case 'bevel': { const t = ss * A('adj', 12500) / 100000; return { paths: [{ d: poly([[0, 0], [w, 0], [w, hh], [0, hh]]), fill: true, stroke: true }, { d: `M${f2(t)},${f2(t)} H${f2(w - t)} V${f2(hh - t)} H${f2(t)} Z M0,0 L${f2(t)},${f2(t)} M${f2(w)},0 L${f2(w - t)},${f2(t)} M${f2(w)},${f2(hh)} L${f2(w - t)},${f2(hh - t)} M0,${f2(hh)} L${f2(t)},${f2(hh - t)}`, fill: false, stroke: true }] }; }
    case 'foldedCorner': { const t = ss * A('adj', 16667) / 100000; return { paths: [{ d: poly([[0, 0], [w, 0], [w, hh - t], [w - t, hh], [0, hh]]), fill: true, stroke: true }, { d: `M${f2(w - t)},${f2(hh)} L${f2(w - t * 0.8)},${f2(hh - t * 0.8)} L${f2(w)},${f2(hh - t)}`, fill: false, stroke: true }] }; }
    case 'plaque': { const r = ss * A('adj', 16667) / 100000; return one(`M${f2(r)},0 H${f2(w - r)} A${f2(r)},${f2(r)} 0 0 0 ${f2(w)},${f2(r)} V${f2(hh - r)} A${f2(r)},${f2(r)} 0 0 0 ${f2(w - r)},${f2(hh)} H${f2(r)} A${f2(r)},${f2(r)} 0 0 0 0,${f2(hh - r)} V${f2(r)} A${f2(r)},${f2(r)} 0 0 0 ${f2(r)},0 Z`); }
    case 'can': case 'flowChartMagneticDisk': { const e = Math.min(hh / 2, ss * A('adj', 25000) / 100000 / 2); return { paths: [{ d: `M0,${f2(e)} A${f2(w / 2)},${f2(e)} 0 0 1 ${f2(w)},${f2(e)} V${f2(hh - e)} A${f2(w / 2)},${f2(e)} 0 0 1 0,${f2(hh - e)} Z`, fill: true, stroke: true }, { d: `M0,${f2(e)} A${f2(w / 2)},${f2(e)} 0 0 0 ${f2(w)},${f2(e)}`, fill: false, stroke: true }], tr: [0, 2 * e / hh, 0, 0] }; }
    case 'cube': { const d = ss * A('adj', 25000) / 100000; return { paths: [{ d: poly([[0, d], [w - d, d], [w - d, hh], [0, hh]]), fill: true, stroke: true }, { d: poly([[0, d], [d, 0], [w, 0], [w - d, d]]), fill: true, stroke: true, shade: 1.2 }, { d: poly([[w - d, d], [w, 0], [w, hh - d], [w - d, hh]]), fill: true, stroke: true, shade: 0.8 }], tr: [0, d / hh, d / w, 0] }; }
    case 'flowChartDocument': return one(`M0,0 H${f2(w)} V${f2(hh * 0.83)} C${f2(w * 0.75)},${f2(hh * 0.66)} ${f2(w * 0.5)},${f2(hh * 1.08)} ${f2(w * 0.25)},${f2(hh * 0.96)} C${f2(w * 0.12)},${f2(hh * 0.9)} ${f2(w * 0.05)},${f2(hh * 0.86)} 0,${f2(hh * 0.83)} Z`);
    case 'flowChartMultidocument': return one(`M0,${f2(hh * 0.12)} H${f2(w * 0.88)} V${f2(hh * 0.85)} C${f2(w * 0.66)},${f2(hh * 0.72)} ${f2(w * 0.44)},${f2(hh * 1.06)} ${f2(w * 0.22)},${f2(hh * 0.96)} C${f2(w * 0.1)},${f2(hh * 0.92)} ${f2(w * 0.04)},${f2(hh * 0.88)} 0,${f2(hh * 0.85)} Z M${f2(w * 0.06)},${f2(hh * 0.12)} V${f2(hh * 0.06)} H${f2(w * 0.94)} V${f2(hh * 0.78)} M${f2(w * 0.12)},${f2(hh * 0.06)} V0 H${f2(w)} V${f2(hh * 0.72)}`);
    case 'flowChartPredefinedProcess': return { paths: [{ d: poly([[0, 0], [w, 0], [w, hh], [0, hh]]), fill: true, stroke: true }, { d: `M${f2(w / 8)},0 V${f2(hh)} M${f2(w * 7 / 8)},0 V${f2(hh)}`, fill: false, stroke: true }] };
    case 'flowChartInternalStorage': return { paths: [{ d: poly([[0, 0], [w, 0], [w, hh], [0, hh]]), fill: true, stroke: true }, { d: `M${f2(w / 8)},0 V${f2(hh)} M0,${f2(hh / 8)} H${f2(w)}`, fill: false, stroke: true }] };
    case 'flowChartPunchedCard': return one(poly([[w * 0.2, 0], [w, 0], [w, hh], [0, hh], [0, hh * 0.2]]));
    case 'flowChartOffpageConnector': return one(poly([[0, 0], [w, 0], [w, hh * 0.8], [w / 2, hh], [0, hh * 0.8]]));
    case 'flowChartDelay': return one(`M0,0 H${f2(w / 2)} A${f2(w / 2)},${f2(hh / 2)} 0 0 1 ${f2(w / 2)},${f2(hh)} H0 Z`);
    case 'flowChartDisplay': return one(`M0,${f2(hh / 2)} L${f2(w / 6)},0 H${f2(w * 5 / 6)} A${f2(w / 6)},${f2(hh / 2)} 0 0 1 ${f2(w * 5 / 6)},${f2(hh)} H${f2(w / 6)} Z`);
    case 'flowChartSummingJunction': { const k = 0.3536; return { paths: [{ d: ell(w / 2, hh / 2, w / 2, hh / 2), fill: true, stroke: true }, { d: `M${f2(w * (0.5 - k))},${f2(hh * (0.5 - k))} L${f2(w * (0.5 + k))},${f2(hh * (0.5 + k))} M${f2(w * (0.5 + k))},${f2(hh * (0.5 - k))} L${f2(w * (0.5 - k))},${f2(hh * (0.5 + k))}`, fill: false, stroke: true }] }; }
    case 'flowChartCollate': return one(`M0,0 H${f2(w)} L0,${f2(hh)} H${f2(w)} Z`);
    case 'flowChartSort': return { paths: [{ d: poly([[w / 2, 0], [w, hh / 2], [w / 2, hh], [0, hh / 2]]), fill: true, stroke: true }, { d: `M0,${f2(hh / 2)} H${f2(w)}`, fill: false, stroke: true }] };
    case 'flowChartOnlineStorage': return one(`M${f2(w / 6)},0 H${f2(w)} A${f2(w / 6)},${f2(hh / 2)} 0 0 0 ${f2(w)},${f2(hh)} H${f2(w / 6)} A${f2(w / 6)},${f2(hh / 2)} 0 0 1 ${f2(w / 6)},0 Z`);
    case 'flowChartPunchedTape': case 'wave': case 'doubleWave': { const a = hh * (name === 'flowChartPunchedTape' ? 0.1 : A('adj1', 12500) / 100000); return one(`M0,${f2(a)} C${f2(w / 4)},${f2(-a)} ${f2(w / 4)},${f2(3 * a)} ${f2(w / 2)},${f2(a)} C${f2(w * 3 / 4)},${f2(-a)} ${f2(w * 3 / 4)},${f2(3 * a)} ${f2(w)},${f2(a)} V${f2(hh - a)} C${f2(w * 3 / 4)},${f2(hh + a)} ${f2(w * 3 / 4)},${f2(hh - 3 * a)} ${f2(w / 2)},${f2(hh - a)} C${f2(w / 4)},${f2(hh + a)} ${f2(w / 4)},${f2(hh - 3 * a)} 0,${f2(hh - a)} Z`); }
    case 'heart': return one(`M${f2(w / 2)},${f2(hh * 0.25)} C${f2(w / 2)},${f2(-hh * 0.08)} ${f2(-w * 0.02)},${f2(hh * 0.02)} ${f2(w * 0.02)},${f2(hh * 0.35)} C${f2(w * 0.06)},${f2(hh * 0.62)} ${f2(w * 0.4)},${f2(hh * 0.8)} ${f2(w / 2)},${f2(hh)} C${f2(w * 0.6)},${f2(hh * 0.8)} ${f2(w * 0.94)},${f2(hh * 0.62)} ${f2(w * 0.98)},${f2(hh * 0.35)} C${f2(w * 1.02)},${f2(hh * 0.02)} ${f2(w / 2)},${f2(-hh * 0.08)} ${f2(w / 2)},${f2(hh * 0.25)} Z`);
    case 'lightningBolt': return one(poly([[0.39, 0], [0.62, 0.32], [0.53, 0.35], [0.82, 0.62], [0.73, 0.65], [1, 1], [0.48, 0.7], [0.58, 0.67], [0.26, 0.45], [0.36, 0.41], [0, 0.18]].map(([x, y]) => [x * w, y * hh])));
    case 'moon': { const a = w * A('adj', 50000) / 100000; return one(`M${f2(w)},0 A${f2(w)},${f2(hh / 2)} 0 0 0 ${f2(w)},${f2(hh)} A${f2(w - a)},${f2(hh / 2)} 0 0 1 ${f2(w)},0 Z`); }
    case 'sun': { const rays = []; for (let i = 0; i < 8; i++) { const a = rad(i * 45), a1 = rad(i * 45 - 8), a2 = rad(i * 45 + 8); rays.push(poly([[w / 2 + Math.cos(a) * w / 2, hh / 2 + Math.sin(a) * hh / 2], [w / 2 + Math.cos(a1) * w * 0.34, hh / 2 + Math.sin(a1) * hh * 0.34], [w / 2 + Math.cos(a2) * w * 0.34, hh / 2 + Math.sin(a2) * hh * 0.34]])); } return one(ell(w / 2, hh / 2, w * 0.25, hh * 0.25) + ' ' + rays.join(' ')); }
    case 'smileyFace': return { paths: [{ d: ell(w / 2, hh / 2, w / 2, hh / 2), fill: true, stroke: true }, { d: ell(w * 0.35, hh * 0.38, w * 0.05, hh * 0.05) + ' ' + ell(w * 0.65, hh * 0.38, w * 0.05, hh * 0.05), fill: true, stroke: true, shade: 0.8 }, { d: `M${f2(w * 0.28)},${f2(hh * 0.66)} Q${f2(w / 2)},${f2(hh * 0.82)} ${f2(w * 0.72)},${f2(hh * 0.66)}`, fill: false, stroke: true }] };
    case 'teardrop': return one(`M${f2(w / 2)},0 H${f2(w)} V${f2(hh / 2)} A${f2(w / 2)},${f2(hh / 2)} 0 1 1 ${f2(w / 2)},0 Z`);
    case 'pie': case 'pieWedge': case 'chord': case 'arc': case 'blockArc': {
      const a1 = A('adj1', name === 'pie' ? 0 : 16200000) / 60000, a2 = A('adj2', name === 'pie' ? 16200000 : 0) / 60000;
      const p1 = [w / 2 + Math.cos(rad(a1)) * w / 2, hh / 2 + Math.sin(rad(a1)) * hh / 2], p2 = [w / 2 + Math.cos(rad(a2)) * w / 2, hh / 2 + Math.sin(rad(a2)) * hh / 2];
      let sw = a2 - a1; if (sw <= 0) sw += 360;
      const arc = `M${f2(p1[0])},${f2(p1[1])} A${f2(w / 2)},${f2(hh / 2)} 0 ${sw > 180 ? 1 : 0} 1 ${f2(p2[0])},${f2(p2[1])}`;
      if (name === 'arc') return line(arc);
      if (name === 'chord') return one(arc + ' Z');
      return one(arc + ` L${f2(w / 2)},${f2(hh / 2)} Z`);
    }
    case 'wedgeRectCallout': case 'wedgeRoundRectCallout': case 'wedgeEllipseCallout': case 'cloudCallout': case 'borderCallout1': case 'callout1': {
      const tx = w / 2 + w * A('adj1', -20833) / 100000, ty = hh / 2 + hh * A('adj2', 62500) / 100000;
      const body = name === 'wedgeEllipseCallout' || name === 'cloudCallout' ? ell(w / 2, hh / 2, w / 2, hh / 2) : name === 'wedgeRoundRectCallout' ? rrect(0, 0, w, hh, ss * A('adj3', 16667) / 100000) : poly([[0, 0], [w, 0], [w, hh], [0, hh]]);
      const bx = clamp(tx, w * 0.2, w * 0.8), by = clamp(ty, hh * 0.2, hh * 0.8);
      const k = Math.min(w, hh) * 0.12;
      const ptr = Math.abs(ty - hh / 2) / hh > Math.abs(tx - w / 2) / w ? poly([[bx - k, by], [bx + k, by], [tx, ty]]) : poly([[bx, by - k], [bx, by + k], [tx, ty]]);
      return { paths: [{ d: body + ' ' + ptr, fill: true, stroke: true, nonzero: true }] };
    }
    case 'cloud': return one(`M${f2(w * 0.1)},${f2(hh * 0.6)} C${f2(-w * 0.05)},${f2(hh * 0.45)} ${f2(w * 0.05)},${f2(hh * 0.2)} ${f2(w * 0.22)},${f2(hh * 0.25)} C${f2(w * 0.25)},${f2(hh * 0.02)} ${f2(w * 0.5)},${f2(-hh * 0.02)} ${f2(w * 0.55)},${f2(hh * 0.15)} C${f2(w * 0.65)},${f2(-hh * 0.02)} ${f2(w * 0.9)},${f2(hh * 0.05)} ${f2(w * 0.86)},${f2(hh * 0.3)} C${f2(w * 1.05)},${f2(hh * 0.38)} ${f2(w * 1.02)},${f2(hh * 0.7)} ${f2(w * 0.85)},${f2(hh * 0.75)} C${f2(w * 0.85)},${f2(hh * 0.98)} ${f2(w * 0.6)},${f2(hh * 1.02)} ${f2(w * 0.5)},${f2(hh * 0.85)} C${f2(w * 0.38)},${f2(hh * 1.02)} ${f2(w * 0.12)},${f2(hh * 0.95)} ${f2(w * 0.1)},${f2(hh * 0.6)} Z`, { tr: [0.15, 0.2, 0.15, 0.2] });
    case 'leftBracket': case 'rightBracket': { const r = Math.min(hh / 2, ss * A('adj', 8333) / 100000); const d = `M${f2(w)},0 A${f2(w)},${f2(r)} 0 0 0 0,${f2(r)} V${f2(hh - r)} A${f2(w)},${f2(r)} 0 0 0 ${f2(w)},${f2(hh)}`; return { paths: [{ d, fill: false, stroke: true }], flipX: name === 'rightBracket' }; }
    case 'leftBrace': case 'rightBrace': { const r = Math.min(hh / 4, ss * A('adj1', 8333) / 100000), m = hh * A('adj2', 50000) / 100000; const d = `M${f2(w)},0 A${f2(w / 2)},${f2(r)} 0 0 0 ${f2(w / 2)},${f2(r)} V${f2(m - r)} A${f2(w / 2)},${f2(r)} 0 0 1 0,${f2(m)} A${f2(w / 2)},${f2(r)} 0 0 1 ${f2(w / 2)},${f2(m + r)} V${f2(hh - r)} A${f2(w / 2)},${f2(r)} 0 0 0 ${f2(w)},${f2(hh)}`; return { paths: [{ d, fill: false, stroke: true }], flipX: name === 'rightBrace' }; }
    case 'bracketPair': { const r = ss * A('adj', 16667) / 100000; return { paths: [{ d: `M${f2(r)},${f2(hh)} A${f2(r)},${f2(r)} 0 0 1 0,${f2(hh - r)} V${f2(r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(r)},0 M${f2(w - r)},0 A${f2(r)},${f2(r)} 0 0 1 ${f2(w)},${f2(r)} V${f2(hh - r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(w - r)},${f2(hh)}`, fill: false, stroke: true }] }; }
    case 'bracePair': { const r = ss * A('adj', 8333) / 100000; return { paths: [{ d: `M${f2(2 * r)},${f2(hh)} A${f2(r)},${f2(r)} 0 0 1 ${f2(r)},${f2(hh - r)} V${f2(hh / 2 + r)} A${f2(r)},${f2(r)} 0 0 0 0,${f2(hh / 2)} A${f2(r)},${f2(r)} 0 0 0 ${f2(r)},${f2(hh / 2 - r)} V${f2(r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(2 * r)},0 M${f2(w - 2 * r)},0 A${f2(r)},${f2(r)} 0 0 1 ${f2(w - r)},${f2(r)} V${f2(hh / 2 - r)} A${f2(r)},${f2(r)} 0 0 0 ${f2(w)},${f2(hh / 2)} A${f2(r)},${f2(r)} 0 0 0 ${f2(w - r)},${f2(hh / 2 + r)} V${f2(hh - r)} A${f2(r)},${f2(r)} 0 0 1 ${f2(w - 2 * r)},${f2(hh)}`, fill: false, stroke: true }] }; }
    case 'mathPlus': { const t = hh * A('adj1', 23520) / 100000; return one(poly([[w / 2 - t / 2, hh * 0.12], [w / 2 + t / 2, hh * 0.12], [w / 2 + t / 2, hh / 2 - t / 2], [w * 0.88, hh / 2 - t / 2], [w * 0.88, hh / 2 + t / 2], [w / 2 + t / 2, hh / 2 + t / 2], [w / 2 + t / 2, hh * 0.88], [w / 2 - t / 2, hh * 0.88], [w / 2 - t / 2, hh / 2 + t / 2], [w * 0.12, hh / 2 + t / 2], [w * 0.12, hh / 2 - t / 2], [w / 2 - t / 2, hh / 2 - t / 2]])); }
    case 'mathMinus': { const t = hh * A('adj1', 23520) / 100000; return one(poly([[w * 0.12, hh / 2 - t / 2], [w * 0.88, hh / 2 - t / 2], [w * 0.88, hh / 2 + t / 2], [w * 0.12, hh / 2 + t / 2]])); }
    case 'mathEqual': { const t = hh * A('adj1', 23520) / 100000, g = hh * A('adj2', 11760) / 100000; return one(poly([[w * 0.12, hh / 2 - g / 2 - t], [w * 0.88, hh / 2 - g / 2 - t], [w * 0.88, hh / 2 - g / 2], [w * 0.12, hh / 2 - g / 2]]) + ' ' + poly([[w * 0.12, hh / 2 + g / 2], [w * 0.88, hh / 2 + g / 2], [w * 0.88, hh / 2 + g / 2 + t], [w * 0.12, hh / 2 + g / 2 + t]])); }
    case 'mathMultiply': { const t = ss * A('adj1', 23520) / 100000 / 2; const c = [w / 2, hh / 2], L = Math.min(w, hh) * 0.36; const arm = a => { const dx = Math.cos(rad(a)), dy = Math.sin(rad(a)); return [[c[0] + dx * L - dy * t, c[1] + dy * L + dx * t], [c[0] + dx * L + dy * t, c[1] + dy * L - dx * t]]; }; const p = [...arm(-45), ...arm(45), ...arm(135), ...arm(225)]; return one(poly([p[0], p[1], [c[0] + t * 1.4, c[1]], p[2], p[3], [c[0], c[1] + t * 1.4], p[4], p[5], [c[0] - t * 1.4, c[1]], p[6], p[7], [c[0], c[1] - t * 1.4]])); }
    case 'mathDivide': { const t = hh * 0.12; return one(poly([[w * 0.12, hh / 2 - t / 2], [w * 0.88, hh / 2 - t / 2], [w * 0.88, hh / 2 + t / 2], [w * 0.12, hh / 2 + t / 2]]) + ' ' + ell(w / 2, hh * 0.25, t * 0.8, t * 0.8) + ' ' + ell(w / 2, hh * 0.75, t * 0.8, t * 0.8)); }
    case 'ribbon': case 'ribbon2': case 'ellipseRibbon': case 'ellipseRibbon2': return one(poly([[0, hh * 0.25], [w * 0.15, hh * 0.25], [w * 0.15, 0], [w * 0.85, 0], [w * 0.85, hh * 0.25], [w, hh * 0.25], [w * 0.9, hh * 0.55], [w, hh * 0.85], [w * 0.85, hh * 0.85], [w * 0.85, hh], [w * 0.15, hh], [w * 0.15, hh * 0.85], [0, hh * 0.85], [w * 0.1, hh * 0.55]]));
    case 'verticalScroll': case 'horizontalScroll': return one(rrect(0, 0, w, hh, ss * 0.08));
    case 'halfFrame': { const t = ss * 0.333 * A('adj1', 33333) / 33333; return one(poly([[0, 0], [w, 0], [w - t * w / hh, t], [t, t], [t, hh - t * hh / w], [0, hh]])); }
    case 'corner': { const t = ss * A('adj1', 50000) / 100000; return one(poly([[0, 0], [t, 0], [t, hh - t], [w, hh - t], [w, hh], [0, hh]])); }
    case 'diagStripe': { const t = A('adj', 50000) / 100000; return one(poly([[0, hh * t], [w * t, 0], [w, 0], [0, hh]])); }
    case 'flowChartMagneticTape': return one(ell(w / 2, hh / 2, w / 2, hh / 2));
    default: return null;
  }
}

// ── 자유형(custGeom): 수식(gdLst)과 경로(pathLst) ──
function evalGuides(list, w, hh, base = {}) {
  const v = { w, h: hh, l: 0, t: 0, r: w, b: hh, hc: w / 2, vc: hh / 2, ss: Math.min(w, hh), ls: Math.max(w, hh), cd2: 10800000, cd4: 5400000, cd8: 2700000, '3cd4': 16200000, '3cd8': 8100000, '5cd8': 13500000, '7cd8': 18900000 };
  for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 16, 24, 32]) { v['wd' + n] = w / n; v['hd' + n] = hh / n; v['ssd' + n] = v.ss / n; }
  Object.assign(v, base);
  const val = x => (x in v ? v[x] : +x || 0);
  for (const g of list) {
    const [op, ...ar] = attr(g, 'fmla', 'val 0').trim().split(/\s+/);
    const [x, y, z] = ar.map(val);
    const ang = a => a / 60000 * Math.PI / 180;
    let r = 0;
    switch (op) {
      case '*/': r = z ? x * y / z : 0; break;
      case '+-': r = x + y - z; break;
      case '+/': r = z ? (x + y) / z : 0; break;
      case '?:': r = x > 0 ? y : z; break;
      case 'abs': r = Math.abs(x); break;
      case 'at2': r = Math.atan2(y, x) * 180 / Math.PI * 60000; break;
      case 'cat2': r = x * Math.cos(Math.atan2(z, y)); break;
      case 'cos': r = x * Math.cos(ang(y)); break;
      case 'max': r = Math.max(x, y); break;
      case 'min': r = Math.min(x, y); break;
      case 'mod': r = Math.sqrt(x * x + y * y + z * z); break;
      case 'pin': r = y < x ? x : y > z ? z : y; break;
      case 'sat2': r = x * Math.sin(Math.atan2(z, y)); break;
      case 'sin': r = x * Math.sin(ang(y)); break;
      case 'sqrt': r = Math.sqrt(Math.max(0, x)); break;
      case 'tan': r = x * Math.tan(ang(y)); break;
      case 'val': r = x; break;
    }
    v[attr(g, 'name')] = r;
  }
  return v;
}
function custPaths(cust, wPx, hPx) {
  const paths = [];
  const av = {};
  for (const g of kids(kid(cust, 'avLst'), 'gd')) { const m = /val\s+(-?[\d.]+)/.exec(attr(g, 'fmla', '')); if (m) av[attr(g, 'name')] = +m[1]; }
  for (const p of kids(kid(cust, 'pathLst'), 'path')) {
    const pw = num(p, 'w', 0) || toEmu(wPx), ph = num(p, 'h', 0) || toEmu(hPx);
    const v = evalGuides(kids(kid(cust, 'gdLst'), 'gd'), pw, ph, av);
    const val = x => (x in v ? v[x] : +x || 0);
    const sx = pw ? wPx / pw : 0, sy = ph ? hPx / ph : 0;
    let d = '', cx = 0, cy = 0;
    const pt = e => [val(attr(e, 'x')) * sx, val(attr(e, 'y')) * sy];
    for (const c of kids(p)) {
      const n = ln(c);
      if (n === 'moveTo') { [cx, cy] = pt(kid(c, 'pt')); d += `M${f2(cx)},${f2(cy)} `; }
      else if (n === 'lnTo') { [cx, cy] = pt(kid(c, 'pt')); d += `L${f2(cx)},${f2(cy)} `; }
      else if (n === 'cubicBezTo') { const ps = kids(c, 'pt').map(pt); if (ps.length === 3) { d += `C${ps.map(q => f2(q[0]) + ',' + f2(q[1])).join(' ')} `; [cx, cy] = ps[2]; } }
      else if (n === 'quadBezTo') { const ps = kids(c, 'pt').map(pt); if (ps.length === 2) { d += `Q${ps.map(q => f2(q[0]) + ',' + f2(q[1])).join(' ')} `; [cx, cy] = ps[1]; } }
      else if (n === 'arcTo') {
        const wr = val(attr(c, 'wR')) * sx, hr = val(attr(c, 'hR')) * sy;
        const st = val(attr(c, 'stAng')) / 60000, sw = val(attr(c, 'swAng')) / 60000;
        if (!wr || !hr) continue;
        // 보이는 각도 → 타원 매개변수 각도
        const pa = a => Math.atan2(wr * Math.sin(rad(a)), hr * Math.cos(rad(a)));
        const t1 = pa(st), t2 = pa(st + sw);
        const ox = cx - wr * Math.cos(t1), oy = cy - hr * Math.sin(t1);
        const seg = (ta, tb, large) => { const ex = ox + wr * Math.cos(tb), ey = oy + hr * Math.sin(tb); d += `A${f2(wr)},${f2(hr)} 0 ${large ? 1 : 0} ${sw > 0 ? 1 : 0} ${f2(ex)},${f2(ey)} `; cx = ex; cy = ey; };
        if (Math.abs(sw) >= 359.9) { const mid = pa(st + sw / 2); seg(t1, mid, 0); seg(mid, t2, 0); }
        else seg(t1, t2, Math.abs(sw) > 180);
      } else if (n === 'close') d += 'Z ';
    }
    paths.push({ d: d.trim(), fill: attr(p, 'fill', 'norm') !== 'none', stroke: bool(p, 'stroke', true), shade: { lighten: 1.2, lightenLess: 1.1, darken: 0.8, darkenLess: 0.9 }[attr(p, 'fill')] || null });
  }
  return { paths };
}

// spPr → 모양
function shapeGeom(spPr, wPx, hPx) {
  const cust = kid(spPr, 'custGeom');
  if (cust) return custPaths(cust, wPx, hPx);
  const prst = kid(spPr, 'prstGeom');
  const name = prst ? attr(prst, 'prst', 'rect') : 'rect';
  return presetPaths(name, wPx, hPx, avOf(kid(prst, 'avLst'))) || presetPaths('rect', wPx, hPx, {});
}
