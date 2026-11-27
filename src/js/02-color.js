// ───────────────────────── 테마·색·채우기·선 ─────────────────────────
class Theme {
  constructor(doc) {
    this.colors = { dk1: '000000', lt1: 'FFFFFF', dk2: '44546A', lt2: 'E7E6E6', accent1: '4472C4', accent2: 'ED7D31', accent3: 'A5A5A5', accent4: 'FFC000', accent5: '5B9BD5', accent6: '70AD47', hlink: '0563C1', folHlink: '954F72' };
    this.fonts = { majorLatin: 'Calibri Light', minorLatin: 'Calibri', majorEa: '', minorEa: '' };
    this.fill = []; this.line = []; this.bgFill = []; this.effect = [];
    if (!doc) return;
    const te = desc(doc.documentElement, 'themeElements');
    const cs = kid(te, 'clrScheme');
    for (const c of kids(cs)) {
      const v = kid(c, 'srgbClr') ? attr(kid(c, 'srgbClr'), 'val') : kid(c, 'sysClr') ? attr(kid(c, 'sysClr'), 'lastClr', attr(kid(c, 'sysClr'), 'val') === 'window' ? 'FFFFFF' : '000000') : null;
      if (v) this.colors[ln(c)] = v.toUpperCase();
    }
    const fs = kid(te, 'fontScheme');
    const font = (which) => {
      const f = kid(fs, which);
      const hang = kids(f, 'font').find(x => attr(x, 'script') === 'Hang');
      return { latin: attr(kid(f, 'latin'), 'typeface', ''), ea: attr(kid(f, 'ea'), 'typeface', '') || (hang ? attr(hang, 'typeface') : '') };
    };
    if (fs) {
      const mj = font('majorFont'), mn = font('minorFont');
      this.fonts = { majorLatin: mj.latin, minorLatin: mn.latin, majorEa: mj.ea, minorEa: mn.ea };
    }
    const fm = kid(te, 'fmtScheme');
    this.fill = kids(kid(fm, 'fillStyleLst'));
    this.line = kids(kid(fm, 'lnStyleLst'));
    this.bgFill = kids(kid(fm, 'bgFillStyleLst'));
    this.effect = kids(kid(fm, 'effectStyleLst'));
  }
  // '+mn-lt' 같은 테마 글꼴 이름 풀기
  face(name) {
    if (!name) return '';
    const m = { '+mj-lt': this.fonts.majorLatin, '+mn-lt': this.fonts.minorLatin, '+mj-ea': this.fonts.majorEa, '+mn-ea': this.fonts.minorEa, '+mj-cs': '', '+mn-cs': '' };
    return name in m ? m[name] : name;
  }
}

const PRST_CLR = { black: '000000', white: 'FFFFFF', red: 'FF0000', green: '008000', blue: '0000FF', yellow: 'FFFF00', gray: '808080', grey: '808080', darkGray: 'A9A9A9', lightGray: 'D3D3D3', orange: 'FFA500', purple: '800080', navy: '000080', teal: '008080', silver: 'C0C0C0', maroon: '800000', lime: '00FF00', aqua: '00FFFF', cyan: '00FFFF', magenta: 'FF00FF', fuchsia: 'FF00FF', olive: '808000', brown: 'A52A2A', pink: 'FFC0CB', gold: 'FFD700', darkBlue: '00008B', darkRed: '8B0000', darkGreen: '006400', ltGray: 'D3D3D3', dkGray: 'A9A9A9' };
const COLOR_TAGS = new Set(['srgbClr', 'schemeClr', 'sysClr', 'prstClr', 'scrgbClr', 'hslClr']);

function hexRgb(hex) { const n = parseInt(hex, 16); return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }; }
function rgbHsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  let hh = 0, s = 0;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    hh = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hh /= 6;
  }
  return { h: hh, s, l };
}
function hslRgb({ h: hh, s, l }) {
  if (s === 0) { const v = Math.round(l * 255); return { r: v, g: v, b: v }; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = t => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return { r: Math.round(f(hh + 1 / 3) * 255), g: Math.round(f(hh) * 255), b: Math.round(f(hh - 1 / 3) * 255) };
}
const toHex = c => [c.r, c.g, c.b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('').toUpperCase();
const css = c => (!c ? 'transparent' : c.a < 1 ? `rgba(${c.r},${c.g},${c.b},${+c.a.toFixed(3)})` : '#' + toHex(c));

// 색 요소 하나 → {r,g,b,a}. ctx = {theme, clrMap, phClr}
function colorOf(e, ctx) {
  if (!e) return null;
  if (!COLOR_TAGS.has(ln(e))) e = kids(e).find(k => COLOR_TAGS.has(ln(k)));
  if (!e) return null;
  let c;
  const t = ln(e);
  if (t === 'srgbClr') c = hexRgb(attr(e, 'val', '000000'));
  else if (t === 'schemeClr') {
    let v = attr(e, 'val');
    if (v === 'phClr') c = ctx.phClr ? { ...ctx.phClr } : hexRgb('000000');
    else {
      const map = ctx.clrMap || {};
      if (map[v]) v = map[v];
      else if (v === 'bg1') v = 'lt1'; else if (v === 'tx1') v = 'dk1'; else if (v === 'bg2') v = 'lt2'; else if (v === 'tx2') v = 'dk2';
      c = hexRgb((ctx.theme && ctx.theme.colors[v]) || '000000');
    }
  } else if (t === 'sysClr') c = hexRgb(attr(e, 'lastClr', attr(e, 'val') === 'window' ? 'FFFFFF' : '000000'));
  else if (t === 'prstClr') c = hexRgb(PRST_CLR[attr(e, 'val')] || '000000');
  else if (t === 'scrgbClr') { const g = v => Math.round(255 * Math.pow(clamp(num(e, v, 0) / 100000, 0, 1), 1 / 2.2)); c = { r: g('r'), g: g('g'), b: g('b'), a: 1 }; }
  else if (t === 'hslClr') { const rgb = hslRgb({ h: num(e, 'hue', 0) / 21600000, s: num(e, 'sat', 0) / 100000, l: num(e, 'lum', 0) / 100000 }); c = { ...rgb, a: 1 }; }
  if (!c) return null;
  // 변형(밝기·투명도 등)
  for (const m of kids(e)) {
    const v = num(m, 'val', 0) / 100000;
    const name = ln(m);
    if (name === 'alpha') c.a = v;
    else if (name === 'alphaMod') c.a *= v;
    else if (name === 'alphaOff') c.a = clamp(c.a + v, 0, 1);
    else if (['lumMod', 'lumOff', 'satMod', 'satOff', 'hueMod', 'hueOff', 'tint', 'shade'].includes(name)) {
      const hsl = rgbHsl(c);
      if (name === 'lumMod') hsl.l *= v;
      else if (name === 'lumOff') hsl.l += v;
      else if (name === 'satMod') hsl.s *= v;
      else if (name === 'satOff') hsl.s += v;
      else if (name === 'hueMod') hsl.h = (hsl.h * v) % 1;
      else if (name === 'hueOff') hsl.h = (hsl.h + num(m, 'val', 0) / 21600000) % 1;
      else if (name === 'tint') hsl.l = hsl.l * v + (1 - v);
      else if (name === 'shade') hsl.l *= v;
      hsl.l = clamp(hsl.l, 0, 1); hsl.s = clamp(hsl.s, 0, 1);
      Object.assign(c, hslRgb(hsl));
    } else if (name === 'gray') { const gy = Math.round(c.r * 0.3 + c.g * 0.59 + c.b * 0.11); c.r = c.g = c.b = gy; }
    else if (name === 'inv') { c.r = 255 - c.r; c.g = 255 - c.g; c.b = 255 - c.b; }
    else if (name === 'comp') { const hsl = rgbHsl(c); hsl.h = (hsl.h + 0.5) % 1; Object.assign(c, hslRgb(hsl)); }
  }
  return c;
}

// 채우기 요소(solidFill/gradFill/blipFill/noFill/pattFill) → 그리기용 설명
function fillOf(e, ctx) {
  if (!e) return null;
  const t = ln(e);
  if (t === 'noFill') return { type: 'none' };
  if (t === 'solidFill') return { type: 'solid', color: colorOf(e, ctx) || hexRgb('000000') };
  if (t === 'gradFill') {
    const stops = kids(kid(e, 'gsLst'), 'gs').map(g => ({ pos: num(g, 'pos', 0) / 1000, color: colorOf(g, ctx) || hexRgb('000000') })).sort((a, b) => a.pos - b.pos);
    const lin = kid(e, 'lin'), pth = kid(e, 'path');
    return { type: 'grad', stops, angle: lin ? num(lin, 'ang', 0) / 60000 : 90, radial: !!pth, path: pth ? attr(pth, 'path', 'circle') : null };
  }
  if (t === 'blipFill') {
    const blip = kid(e, 'blip');
    return { type: 'blip', rid: rAttr(blip, 'embed'), part: ctx.part, tile: !!kid(e, 'tile'), src: kid(e, 'srcRect') };
  }
  if (t === 'pattFill') {
    const fg = colorOf(kid(e, 'fgClr'), ctx) || hexRgb('000000'), bg = colorOf(kid(e, 'bgClr'), ctx) || hexRgb('FFFFFF');
    return { type: 'patt', fg, bg, prst: attr(e, 'prst', 'pct50') };
  }
  if (t === 'grpFill') return ctx.grpFill || { type: 'none' };
  return null;
}
const findFill = parent => (parent ? kids(parent).find(k => FILL_NAMES.includes(ln(k))) : null);

// 테마 서식 참조(p:style fillRef/lnRef) → 요소
function styleFill(ref, ctx) {
  if (!ref) return null;
  const idx = num(ref, 'idx', 0);
  if (!idx || !ctx.theme) return null;
  const list = idx >= 1001 ? ctx.theme.bgFill : ctx.theme.fill;
  const f = list[(idx >= 1001 ? idx - 1001 : idx - 1)];
  if (!f) return null;
  return fillOf(f, { ...ctx, phClr: colorOf(ref, ctx) });
}

// 선(a:ln) → {width px, color, dash, head, tail}; styleLn = p:style lnRef
function lineOf(lnEl, ctx, styleRef) {
  let base = null;
  if (styleRef && ctx.theme) {
    const idx = num(styleRef, 'idx', 0);
    const s = idx ? ctx.theme.line[idx - 1] : null;
    if (s) base = lineOf(s, { ...ctx, phClr: colorOf(styleRef, ctx) }, null);
  }
  if (!lnEl) return base;
  const out = base ? { ...base } : { width: 0.75, color: null, dash: null, none: true };
  if (lnEl.hasAttribute('w')) out.width = Math.max(0.5, px(num(lnEl, 'w', 9525)));
  const f = findFill(lnEl);
  if (f) {
    const fill = fillOf(f, ctx);
    if (fill.type === 'none') out.none = true;
    else { out.none = false; out.color = fill.type === 'solid' ? fill.color : fill.type === 'grad' ? fill.stops[0].color : hexRgb('000000'); }
  } else if (!base) out.none = true;
  const pd = kid(lnEl, 'prstDash');
  if (pd) out.dash = attr(pd, 'val', 'solid');
  const he = kid(lnEl, 'headEnd'), te = kid(lnEl, 'tailEnd');
  if (he && attr(he, 'type', 'none') !== 'none') out.head = attr(he, 'type');
  if (te && attr(te, 'type', 'none') !== 'none') out.tail = attr(te, 'type');
  if (lnEl.hasAttribute('cap')) out.cap = attr(lnEl, 'cap');
  if (kid(lnEl, 'round')) out.join = 'round'; else if (kid(lnEl, 'bevel')) out.join = 'bevel'; else if (kid(lnEl, 'miter')) out.join = 'miter';
  return out;
}
function dashArray(dash, w) {
  const u = Math.max(1, w);
  return ({ dash: [4, 3], sysDash: [3, 1], sysDot: [1, 1], dot: [1, 3], dashDot: [4, 3, 1, 3], lgDash: [8, 3], lgDashDot: [8, 3, 1, 3], lgDashDotDot: [8, 3, 1, 3, 1, 3], sysDashDot: [3, 1, 1, 1], sysDashDotDot: [3, 1, 1, 1, 1, 1] }[dash] || null)?.map(v => v * u).join(' ') || null;
}

// 색 맵(p:clrMap) → 객체
function clrMapOf(e) { const m = {}; if (e) for (const a of e.attributes) m[a.name] = a.value; return m; }
