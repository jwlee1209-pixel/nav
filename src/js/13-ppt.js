// ───────────────────────── 옛 PowerPoint(.ppt, 97-2003) 가져오기 ─────────────────────────
// 이진 파일의 슬라이드·글자·도형·그림을 읽어 빈 서식 위에 새 .pptx 를 만든다.
const MU = 1587.5;   // 마스터 단위(1/576 인치) → EMU

function cfbOpen(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf);
  const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
  if (!sig.every((x, i) => b[i] === x)) throw new Error('OLE 복합 문서가 아닙니다.');
  const secSize = 1 << dv.getUint16(0x1E, true), miniSize = 1 << dv.getUint16(0x20, true);
  const numFat = dv.getUint32(0x2C, true), firstDir = dv.getUint32(0x30, true), cutoff = dv.getUint32(0x38, true);
  const firstMiniFat = dv.getUint32(0x3C, true), firstDifat = dv.getUint32(0x44, true), numDifat = dv.getUint32(0x48, true);
  const sector = id => { const off = (id + 1) * secSize; if (off + secSize > b.length) throw new Error('파일이 손상되었습니다(섹터).'); return b.subarray(off, off + secSize); };
  const sectorDv = id => { const s = sector(id); return new DataView(s.buffer, s.byteOffset, secSize); };
  const fatIds = [];
  for (let i = 0; i < 109 && fatIds.length < numFat; i++) { const v = dv.getUint32(0x4C + i * 4, true); if (v < 0xFFFFFFFA) fatIds.push(v); }
  let dId = firstDifat;
  for (let k = 0; k < numDifat && dId < 0xFFFFFFFA; k++) {
    const s = sectorDv(dId);
    for (let i = 0; i < secSize / 4 - 1 && fatIds.length < numFat; i++) { const v = s.getUint32(i * 4, true); if (v < 0xFFFFFFFA) fatIds.push(v); }
    dId = s.getUint32(secSize - 4, true);
  }
  const fat = [];
  for (const id of fatIds) { const s = sectorDv(id); for (let i = 0; i < secSize / 4; i++) fat.push(s.getUint32(i * 4, true)); }
  const chain = start => { const ids = []; let id = start, g = 0; while (id < 0xFFFFFFFA && g++ < 1e6) { ids.push(id); id = fat[id]; if (id === undefined) break; } return ids; };
  const readChain = (start, size) => { const out = new Uint8Array(size); let pos = 0; for (const id of chain(start)) { const s = sector(id); const n = Math.min(secSize, size - pos); out.set(s.subarray(0, n), pos); pos += n; if (pos >= size) break; } return out; };
  const dirBytes = readChain(firstDir, chain(firstDir).length * secSize);
  const entries = [];
  for (let i = 0; i + 128 <= dirBytes.length; i += 128) {
    const e = new DataView(dirBytes.buffer, dirBytes.byteOffset + i, 128);
    const nlen = e.getUint16(64, true);
    let name = ''; for (let k = 0; k < nlen - 2; k += 2) name += String.fromCharCode(e.getUint16(k, true));
    entries.push({ name, type: e.getUint8(66), start: e.getUint32(116, true), size: e.getUint32(120, true) });
  }
  const root = entries.find(e => e.type === 5);
  const mini = root ? readChain(root.start, root.size) : new Uint8Array(0);
  const miniFat = [];
  if (firstMiniFat < 0xFFFFFFFA) { const mf = readChain(firstMiniFat, chain(firstMiniFat).length * secSize); const mv = new DataView(mf.buffer, mf.byteOffset, mf.length); for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mv.getUint32(i, true)); }
  const streamOf = e => {
    if (e.size < cutoff) { const out = new Uint8Array(e.size); let pos = 0, id = e.start, g = 0; while (id < 0xFFFFFFFA && pos < e.size && g++ < 1e6) { const n = Math.min(miniSize, e.size - pos); out.set(mini.subarray(id * miniSize, id * miniSize + n), pos); pos += n; id = miniFat[id]; } return out; }
    return readChain(e.start, e.size);
  };
  return {
    has: name => entries.some(x => x.type === 2 && x.name === name),
    read: name => { const e = entries.find(x => x.type === 2 && x.name === name); if (!e) throw new Error('스트림 없음: ' + name); return streamOf(e); },
  };
}

// ── 레코드 ──
class PptStream {
  constructor(u8) { this.u8 = u8; this.dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); }
  rec(off) {
    if (off == null || off < 0 || off + 8 > this.u8.length) return null;
    const vi = this.dv.getUint16(off, true);
    return { ver: vi & 0xF, inst: vi >>> 4, type: this.dv.getUint16(off + 2, true), len: this.dv.getUint32(off + 4, true), off, body: off + 8, get end() { return this.body + this.len; } };
  }
  kids(r) {
    const out = []; if (!r) return out;
    let o = r.body; const end = Math.min(r.body + r.len, this.u8.length);
    while (o + 8 <= end) { const c = this.rec(o); if (!c || c.body + c.len > end + 0) { if (c) out.push(c); break; } out.push(c); o = c.body + c.len; }
    return out;
  }
  kid(r, type, inst) { return this.kids(r).find(c => c.type === type && (inst == null || c.inst === inst)) || null; }
  deep(r, type) { for (const c of this.kids(r)) { if (c.type === type) return c; if (c.ver === 0xF) { const f = this.deep(c, type); if (f) return f; } } return null; }
  u16(o) { return this.dv.getUint16(o, true); } i16(o) { return this.dv.getInt16(o, true); }
  u32(o) { return this.dv.getUint32(o, true); } i32(o) { return this.dv.getInt32(o, true); }
  utf16(o, n) { let s = ''; for (let i = 0; i + 1 < n; i += 2) s += String.fromCharCode(this.u16(o + i)); return s; }
  bytes8(o, n) { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8[o + i]); return s; }
}

// ── 글자 서식(TextPFException / TextCFException) ──
function pptColorIdx(S2, o) { return { r: S2.u8[o], g: S2.u8[o + 1], b: S2.u8[o + 2], idx: S2.u8[o + 3] }; }
function pptPF(S2, o) {
  const m = S2.u32(o); o += 4;
  const v = {};
  if (m & 0xF) { const f = S2.u16(o); o += 2; if (m & 1) v.hasBullet = !!(f & 1); if (m & 2) v.buHasFont = !!(f & 2); if (m & 4) v.buHasColor = !!(f & 4); if (m & 8) v.buHasSize = !!(f & 8); }
  if (m & 0x80) { v.buChar = S2.u16(o); o += 2; }
  if (m & 0x10) { v.buFont = S2.u16(o); o += 2; }
  if (m & 0x40) { v.buSize = S2.i16(o); o += 2; }
  if (m & 0x20) { v.buColor = pptColorIdx(S2, o); o += 4; }
  if (m & 0x800) { v.align = S2.u16(o); o += 2; }
  if (m & 0x1000) { v.lnSpc = S2.i16(o); o += 2; }
  if (m & 0x2000) { v.spBef = S2.i16(o); o += 2; }
  if (m & 0x4000) { v.spAft = S2.i16(o); o += 2; }
  if (m & 0x100) { v.marL = S2.i16(o); o += 2; }
  if (m & 0x400) { v.indent = S2.i16(o); o += 2; }
  if (m & 0x8000) o += 2;
  if (m & 0x100000) { const n = S2.u16(o); o += 2 + n * 4; }
  if (m & 0x10000) o += 2;
  if (m & 0xE0000) o += 2;
  if (m & 0x200000) o += 2;
  return { v, end: o };
}
// mode 'spec' = MS-PPT 문서대로, 'poi' = 일부 필드를 크기 0 으로(오래된 파일 호환)
function pptCF(S2, o, mode) {
  const m = S2.u32(o); o += 4;
  const v = {};
  if (m & 0xFFFF) { const s = S2.u16(o); o += 2; if (m & 1) v.b = !!(s & 1); if (m & 2) v.i = !!(s & 2); if (m & 4) v.u = !!(s & 4); }
  if (m & 0x10000) { v.font = S2.u16(o); o += 2; }
  if (m & 0x200000) { v.eaFont = S2.u16(o); o += 2; }
  if (m & 0x400000) o += 2;
  if (m & 0x800000) o += 2;
  if (m & 0x20000) { v.size = S2.u16(o); o += 2; }
  if (m & 0x40000) { v.color = pptColorIdx(S2, o); o += 4; }
  if (m & 0x80000) { v.pos = S2.i16(o); o += 2; }
  if (mode === 'spec') {
    if (m & 0x100000) o += 4;
    if (m & 0x1000000) { v.eaFont2 = S2.u16(o); o += 2; }
    if (m & 0x2000000) o += 2;
    if (m & 0x4000000) o += 4;
  }
  return { v, end: o };
}
function pptStyleRuns(S2, r, textLen) {
  const tryMode = mode => {
    let o = r.body; const end = r.body + r.len, total = textLen + 1;
    const pf = [], cf = [];
    let sum = 0;
    while (sum < total && o + 6 <= end) { const n = S2.u32(o), lvl = S2.u16(o + 4); o += 6; const x = pptPF(S2, o); o = x.end; pf.push({ n, lvl, v: x.v }); sum += n; if (!n) break; }
    sum = 0;
    while (sum < total && o + 4 <= end) { const n = S2.u32(o); o += 4; const x = pptCF(S2, o, mode); o = x.end; cf.push({ n, v: x.v }); sum += n; if (!n) break; }
    return { pf, cf, ok: o === end };
  };
  const a = tryMode('spec');
  if (a.ok) return a;
  const b = tryMode('poi');
  return b.ok ? b : a;
}
function pptMasterStyle(S2, r) {
  const tryMode = mode => {
    let o = r.body; const end = r.body + r.len;
    const n = S2.u16(o); o += 2;
    const lv = [];
    for (let i = 0; i < n && i < 9 && o < end; i++) {
      if (r.inst >= 5) o += 2;
      const p = pptPF(S2, o); o = p.end;
      const c = pptCF(S2, o, mode); o = c.end;
      lv.push({ pf: p.v, cf: c.v });
    }
    return { lv, ok: o === end };
  };
  const a = tryMode('spec');
  if (a.ok) return a.lv;
  const b = tryMode('poi');
  return (b.ok ? b : a).lv;
}

// ── 도형(OfficeArt) ──
// 배열 속성: 적힌 길이가 머리(6바이트)를 빼고 적힌 파일이 많다
const ARRAY_PIDS = new Set([0x0145, 0x0146, 0x0151, 0x0152, 0x0155, 0x0156, 0x0157, 0x0158, 0x0197, 0x01CF, 0x0383]);
function pptOpt(S2, r) {
  const m = new Map();
  if (!r) return m;
  const n = r.inst;
  let o = r.body, cx = r.body + n * 6;
  for (let i = 0; i < n && o + 6 <= r.end; i++, o += 6) {
    const id = S2.u16(o), val = S2.u32(o + 2);
    const pid = id & 0x3FFF, complex = !!(id & 0x8000);
    const e = { v: val, bid: !!(id & 0x4000) };
    if (complex) {
      let len = val;
      if (ARRAY_PIDS.has(pid) && val && cx + 6 <= r.end) {
        const ne = S2.u16(cx), cb = S2.u16(cx + 4);
        const es = cb === 0xFFF0 ? 4 : cb;
        if (ne * es === val) len = val + 6;
      }
      e.data = S2.u8.subarray(cx, Math.min(cx + len, r.end)); cx += len;
    }
    m.set(pid, e);
  }
  return m;
}
function pptShape(S2, r) {
  const sh = { rec: r, type: 0, id: 0, flags: 0, opt: new Map(), anchor: null, child: null, ph: null, textbox: null, grpBounds: null };
  for (const c of S2.kids(r)) {
    if (c.type === 0xF00A) { sh.type = c.inst; sh.id = S2.u32(c.body); sh.flags = S2.u32(c.body + 4); }
    else if (c.type === 0xF00B) { for (const [k, v] of pptOpt(S2, c)) sh.opt.set(k, v); }
    else if (c.type === 0xF121 || c.type === 0xF122) { for (const [k, v] of pptOpt(S2, c)) if (!sh.opt.has(k)) sh.opt.set(k, v); }
    else if (c.type === 0xF009) sh.grpBounds = { l: S2.i32(c.body), t: S2.i32(c.body + 4), r: S2.i32(c.body + 8), b: S2.i32(c.body + 12) };
    else if (c.type === 0xF00F) sh.child = { l: S2.i32(c.body), t: S2.i32(c.body + 4), r: S2.i32(c.body + 8), b: S2.i32(c.body + 12) };
    else if (c.type === 0xF010) {
      if (c.len >= 16) sh.anchor = { t: S2.i32(c.body), l: S2.i32(c.body + 4), r: S2.i32(c.body + 8), b: S2.i32(c.body + 12) };
      else if (c.len >= 8) sh.anchor = { t: S2.i16(c.body), l: S2.i16(c.body + 2), r: S2.i16(c.body + 4), b: S2.i16(c.body + 6) };
    } else if (c.type === 0xF011) {
      const ph = S2.kid(c, 0x0BC3);
      if (ph) sh.ph = { pos: S2.i32(ph.body), id: S2.u8[ph.body + 4], size: S2.u8[ph.body + 5] };
    } else if (c.type === 0xF00D) sh.textbox = c;
  }
  return sh;
}
// 속성 찾기: 도형 자신 → 마스터 도형(hspMaster) 순서
function optGet(sh, pid) { for (let s = sh, k = 0; s && k < 5; s = s.base, k++) if (s.opt.has(pid)) return s.opt.get(pid); return null; }
const optV = (sh, pid, d) => { const e = optGet(sh, pid); return e ? e.v : d; };
// 불(bool) 묶음: 값 비트 + 쓰임 비트(16 위)
function optBool(sh, pid, bit, d, defs) {
  for (let s = sh, k = 0; s && k < 5; s = s.base, k++) { const e = s.opt.get(pid); if (e && (e.v & (bit << 16))) return !!(e.v & bit); }
  if (defs && defs.has(pid)) { const v = defs.get(pid).v; if (v & (bit << 16)) return !!(v & bit); }
  return d;
}

const MSOSPT = {
  1: 'rect', 2: 'roundRect', 3: 'ellipse', 4: 'diamond', 5: 'triangle', 6: 'rtTriangle', 7: 'parallelogram', 8: 'trapezoid', 9: 'hexagon', 10: 'octagon',
  11: 'plus', 12: 'star5', 13: 'rightArrow', 14: 'rightArrow', 15: 'homePlate', 16: 'cube', 19: 'arc', 20: 'line', 21: 'plaque', 22: 'can', 23: 'donut',
  32: 'straightConnector1', 33: 'bentConnector2', 34: 'bentConnector3', 35: 'bentConnector4', 36: 'bentConnector5', 37: 'curvedConnector2', 38: 'curvedConnector3', 39: 'curvedConnector4', 40: 'curvedConnector5',
  41: 'callout1', 42: 'callout2', 43: 'callout3', 44: 'accentCallout1', 45: 'accentCallout2', 46: 'accentCallout3', 47: 'borderCallout1', 48: 'borderCallout2', 49: 'borderCallout3',
  50: 'accentBorderCallout1', 51: 'accentBorderCallout2', 52: 'accentBorderCallout3', 53: 'ribbon', 54: 'ribbon2', 55: 'chevron', 56: 'pentagon', 57: 'noSmoking', 58: 'star8', 59: 'star16', 60: 'star32',
  61: 'wedgeRectCallout', 62: 'wedgeRoundRectCallout', 63: 'wedgeEllipseCallout', 64: 'wave', 65: 'foldedCorner', 66: 'leftArrow', 67: 'downArrow', 68: 'upArrow', 69: 'leftRightArrow', 70: 'upDownArrow',
  71: 'irregularSeal1', 72: 'irregularSeal2', 73: 'lightningBolt', 74: 'heart', 75: 'rect', 76: 'quadArrow', 77: 'leftArrowCallout', 78: 'rightArrowCallout', 79: 'upArrowCallout', 80: 'downArrowCallout',
  81: 'leftRightArrowCallout', 82: 'upDownArrowCallout', 83: 'quadArrowCallout', 84: 'bevel', 85: 'leftBracket', 86: 'rightBracket', 87: 'leftBrace', 88: 'rightBrace', 89: 'leftUpArrow', 90: 'bentUpArrow',
  91: 'bentArrow', 92: 'star24', 93: 'stripedRightArrow', 94: 'notchedRightArrow', 95: 'blockArc', 96: 'smileyFace', 97: 'verticalScroll', 98: 'horizontalScroll', 99: 'circularArrow', 101: 'uturnArrow',
  102: 'curvedRightArrow', 103: 'curvedLeftArrow', 104: 'curvedUpArrow', 105: 'curvedDownArrow', 106: 'cloudCallout', 107: 'ellipseRibbon', 108: 'ellipseRibbon2',
  109: 'flowChartProcess', 110: 'flowChartDecision', 111: 'flowChartInputOutput', 112: 'flowChartPredefinedProcess', 113: 'flowChartInternalStorage', 114: 'flowChartDocument', 115: 'flowChartMultidocument',
  116: 'flowChartTerminator', 117: 'flowChartPreparation', 118: 'flowChartManualInput', 119: 'flowChartManualOperation', 120: 'flowChartConnector', 121: 'flowChartPunchedCard', 122: 'flowChartPunchedTape',
  123: 'flowChartSummingJunction', 124: 'flowChartOr', 125: 'flowChartCollate', 126: 'flowChartSort', 127: 'flowChartExtract', 128: 'flowChartMerge', 129: 'flowChartOfflineStorage', 130: 'flowChartOnlineStorage',
  131: 'flowChartMagneticTape', 132: 'flowChartMagneticDisk', 133: 'flowChartMagneticDrum', 134: 'flowChartDisplay', 135: 'flowChartDelay', 176: 'flowChartAlternateProcess', 177: 'flowChartOffpageConnector',
  178: 'callout1', 179: 'accentCallout1', 180: 'borderCallout1', 181: 'accentBorderCallout1', 182: 'leftRightUpArrow', 183: 'sun', 184: 'moon', 185: 'bracketPair', 186: 'bracePair', 187: 'star4', 188: 'doubleWave',
  189: 'actionButtonBlank', 190: 'actionButtonHome', 191: 'actionButtonHelp', 192: 'actionButtonInformation', 193: 'actionButtonForwardNext', 194: 'actionButtonBackPrevious', 195: 'actionButtonEnd',
  196: 'actionButtonBeginning', 197: 'actionButtonReturn', 198: 'actionButtonDocument', 199: 'actionButtonSound', 200: 'actionButtonMovie', 202: 'rect',
};
// 조절값을 그대로 옮겨도 뜻이 같은 모양(21600 → 100000 비율)
const ADJ_SIMPLE = new Set(['roundRect', 'triangle', 'parallelogram', 'hexagon', 'octagon', 'plus', 'can', 'cube', 'bevel', 'donut', 'foldedCorner', 'plaque']);

// 쪽 배치 → 레이아웃 형식
const PH_TYPE = { 0x0D: 'title', 0x0F: 'ctrTitle', 0x0E: 'body', 0x10: 'subTitle', 0x11: 'title', 0x12: 'body', 0x13: 'obj', 0x14: 'chart', 0x15: 'tbl', 0x16: 'clipArt', 0x17: 'dgm', 0x18: 'media', 0x19: 'obj', 0x1A: 'pic', 0x01: 'title', 0x02: 'body', 0x03: 'ctrTitle', 0x04: 'subTitle', 0x07: 'dt', 0x08: 'sldNum', 0x09: 'ftr', 0x0A: 'hdr', 0x0C: 'body' };

async function importPpt(buf, name) {
  const cfb = cfbOpen(buf);
  if (cfb.has('EncryptionInfo') || cfb.has('EncryptedPackage')) throw new Error('암호가 걸린 파일은 열 수 없습니다. PowerPoint 에서 암호를 푼 뒤 다시 여세요.');
  if (!cfb.has('PowerPoint Document')) throw new Error(cfb.has('WordDocument') ? 'Word 문서입니다. PowerPoint 파일(.pptx, .ppt)을 여세요.' : cfb.has('Workbook') ? 'Excel 문서입니다. PowerPoint 파일(.pptx, .ppt)을 여세요.' : 'PowerPoint 97-2003 파일이 아닙니다.');
  if (cfb.has('EncryptedSummary')) throw new Error('암호가 걸린 .ppt 파일은 열 수 없습니다. PowerPoint 에서 암호를 푼 뒤 다시 여세요.');
  const D = new PptStream(cfb.read('PowerPoint Document'));
  const PIC = cfb.has('Pictures') ? new PptStream(cfb.read('Pictures')) : null;

  // 1) 현재 편집 → 영구 디렉터리(persist id → 위치)
  const persist = new Map();
  let docRef = null;
  let off = null;
  if (cfb.has('Current User')) {
    const cu = new PptStream(cfb.read('Current User'));
    const tok = cu.u8.length >= 20 ? cu.u32(12) : 0;
    if (tok === 0xF3D1C4DF) throw new Error('암호가 걸린 .ppt 파일은 열 수 없습니다.');
    if (cu.u8.length >= 20) off = cu.u32(16);
  }
  const editAt = o => { const r = D.rec(o); return r && r.type === 0x0FF5 ? r : null; };
  if (!editAt(off)) {   // 위치가 틀린 파일: 맨 위 레코드를 훑어 마지막 편집 기록을 찾는다
    off = null;
    for (let o = 0; o + 8 <= D.u8.length;) { const r = D.rec(o); if (!r) break; if (r.type === 0x0FF5) off = o; o = r.body + r.len; }
  }
  const visited = new Set();
  while (off != null && editAt(off) && !visited.has(off)) {
    visited.add(off);
    const ue = editAt(off), b = ue.body;
    const last = D.u32(b + 8), pdo = D.u32(b + 12);
    if (docRef == null) docRef = D.u32(b + 16);
    const pd = D.rec(pdo);
    if (pd && pd.type === 0x1772) {
      let o = pd.body;
      while (o + 4 <= pd.end) {
        const v = D.u32(o); o += 4;
        const id0 = v & 0xFFFFF, n = v >>> 20;
        for (let k = 0; k < n && o + 4 <= pd.end; k++, o += 4) if (!persist.has(id0 + k)) persist.set(id0 + k, D.u32(o));
      }
    }
    off = last || null;
  }
  let DOC = docRef != null ? D.rec(persist.get(docRef)) : null;
  if (!DOC || DOC.type !== 0x03E8) { // 마지막 수단: 처음 나오는 문서 컨테이너
    for (let o = 0; o + 8 <= D.u8.length;) { const r = D.rec(o); if (!r) break; if (r.type === 0x03E8) { DOC = r; break; } o = r.body + r.len; }
  }
  if (!DOC || DOC.type !== 0x03E8) throw new Error('.ppt 파일 구조를 읽을 수 없습니다.');

  // 2) 문서 정보
  const da = D.kid(DOC, 0x03E9);
  const slideW = da ? D.i32(da.body) : 5760, slideH = da ? D.i32(da.body + 4) : 4320;
  const env = D.kid(DOC, 0x03F2);
  const fonts = [];
  const fc = env && D.kid(env, 0x07D5);
  for (const f of D.kids(fc)) if (f.type === 0x0FB7) { let s = D.utf16(f.body, 64); s = s.split('\0')[0]; fonts.push(s); }
  const envCF = env && D.kid(env, 0x0FA4) ? pptCF(D, D.kid(env, 0x0FA4).body, 'spec').v : {};
  const envPF = env && D.kid(env, 0x0FA5) ? pptPF(D, D.kid(env, 0x0FA5).body + 2).v : {};
  const envStyles = {};
  for (const r of D.kids(env)) if (r.type === 0x0FA3) envStyles[r.inst] = pptMasterStyle(D, r);

  // 그림 창고(BStore)·기본 도형 속성
  const dgg = D.deep(D.kid(DOC, 0x040B), 0xF000);
  const bse = [];
  const dggOpt = new Map();
  for (const c of D.kids(dgg)) {
    if (c.type === 0xF001) for (const e of D.kids(c)) if (e.type === 0xF007) bse.push({ rec: e, btWin: D.u8[e.body], size: D.u32(e.body + 20), fo: D.u32(e.body + 28), cbName: D.u8[e.body + 33] });
    if (c.type === 0xF00B) for (const [k, v] of pptOpt(D, c)) dggOpt.set(k, v);
  }

  // 3) 슬라이드·마스터·메모 목록(글자 포함)
  const lists = { 0: [], 1: [], 2: [] };
  for (const L of D.kids(DOC)) {
    if (L.type !== 0x0FF0) continue;
    const arr = lists[L.inst] || (lists[L.inst] = []);
    let cur = null, txt = null;
    for (const r of D.kids(L)) {
      if (r.type === 0x03F3) { cur = { ref: D.u32(r.body), flags: D.u32(r.body + 4), id: D.u32(r.body + 12), texts: [] }; arr.push(cur); txt = null; }
      else if (!cur) continue;
      else if (r.type === 0x0F9F) { txt = { type: D.u32(r.body), text: '', style: null }; cur.texts.push(txt); }
      else if (txt && r.type === 0x0FA0) txt.text = D.utf16(r.body, r.len);
      else if (txt && r.type === 0x0FA8) txt.text = D.bytes8(r.body, r.len);
      else if (txt && r.type === 0x0FA1) txt.style = r;
    }
  }
  const container = ref => { const o = persist.get(ref); return o != null ? D.rec(o) : null; };

  // 마스터: 색 구성·글자 서식·꾸밈 도형
  const masters = new Map();   // slideId → 정보
  for (const m of lists[1]) {
    const r = container(m.ref);
    if (!r) continue;
    masters.set(m.id, readSlideLike(r, m));
  }
  function readSlideLike(r, entry) {
    const sa = D.kid(r, 0x03EF);
    const info = { rec: r, kind: r.type, entry, geom: sa ? D.u32(sa.body) : 0, masterId: sa ? D.u32(sa.body + 12) : 0, notesId: sa ? D.u32(sa.body + 16) : 0, flags: sa ? D.u16(sa.body + 20) : 7, scheme: null, styles: {} };
    const cs = D.kids(r).find(c => c.type === 0x07F0 && c.inst === 1) || D.kid(r, 0x07F0);
    if (cs) { info.scheme = []; for (let i = 0; i < 8; i++) info.scheme.push(D.u32(cs.body + i * 4) & 0xFFFFFF); }
    for (const c of D.kids(r)) if (c.type === 0x0FA3) info.styles[c.inst] = pptMasterStyle(D, c);
    info.drawing = D.deep(D.kid(r, 0x040C), 0xF002);
    return info;
  }
  const mainMaster = [...masters.values()].find(m => m.kind === 0x03F8) || [...masters.values()][0] || null;
  // 마스터 도형(번호 → 도형): 슬라이드 도형이 hspMaster 로 속성을 물려받는다
  const masterShapes = new Map();
  const collect = rec => { for (const c of D.kids(rec)) { if (c.type === 0xF004) { const s2 = pptShape(D, c); if (s2.id) masterShapes.set(s2.id, s2); } else if (c.type === 0xF003 || c.type === 0xF002) collect(c); } };
  for (const m of masters.values()) if (m.drawing) collect(m.drawing);
  const notesMap = new Map();
  for (const n of lists[2]) notesMap.set(n.id, n);

  // 4) 빈 서식 위에 만들기
  const deck = await Deck.open(b64bytes(BLANK_PPTX_B64).buffer, name);
  const prev = S.deck;
  S.deck = deck;
  const pkg = deck.pkg;
  const W = Math.round((slideW || 5760) * MU), Hh = Math.round((slideH || 4320) * MU);
  try {
    // 슬라이드 크기와 마스터·레이아웃 위치
    const sz = kid(deck.pres.documentElement, 'sldSz');
    sz.setAttribute('cx', W); sz.setAttribute('cy', Hh); sz.removeAttribute('type');
    const sx = W / 12192000, sy = Hh / 6858000;
    const m0 = allMasters()[0];
    for (const p of [m0, ...layoutsOf(m0)]) {
      for (const e of pkg.doc(p).getElementsByTagName('*')) {
        if (ln(e) === 'off') { e.setAttribute('x', Math.round(num(e, 'x', 0) * sx)); e.setAttribute('y', Math.round(num(e, 'y', 0) * sy)); }
        else if (ln(e) === 'ext' && ln(e.parentNode) === 'xfrm') { e.setAttribute('cx', Math.round(num(e, 'cx', 0) * sx)); e.setAttribute('cy', Math.round(num(e, 'cy', 0) * sy)); }
      }
    }
    // 테마: 색 구성·글꼴
    const scheme0 = (mainMaster && mainMaster.scheme) || [0xFFFFFF, 0x000000, 0x808080, 0x000000, 0xBBE0E3, 0x333399, 0x009999, 0x99CC00];
    const hex = c => [c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    const thR = pkg.relOfType(m0, REL.theme);
    const th = pkg.doc(thR.target);
    const setClr = (nm, c) => { const e = desc(th.documentElement, nm); if (!e) return; while (e.firstChild) e.firstChild.remove(); e.append(el(th, 'a:srgbClr', { val: hex(c) })); };
    setClr('lt1', scheme0[0]); setClr('dk1', scheme0[1]); setClr('lt2', scheme0[2]); setClr('dk2', scheme0[3]);
    setClr('accent1', scheme0[4]); setClr('accent2', scheme0[5]); setClr('hlink', scheme0[6]); setClr('folHlink', scheme0[7]);
    const f0 = fonts[0] || '맑은 고딕';
    const eaFont = fonts.find(f => /[가-힣]/.test(f)) || '맑은 고딕';
    for (const t of ['majorFont', 'minorFont']) { const e = desc(th.documentElement, t); if (e) { const la = kid(e, 'latin'), ea = kid(e, 'ea'); if (la) la.setAttribute('typeface', f0); if (ea) ea.setAttribute('typeface', eaFont); } }
    deck.themes = new Map();
    deck.init();

    const ctxBase = { D, PIC, fonts, envCF, envPF, envStyles, bse, dggOpt, pkg, masters, mainMaster, masterShapes, media: new Map() };
    // 마스터 배경·꾸밈
    if (mainMaster) {
      const mctx = { ...ctxBase, scheme: mainMaster.scheme || scheme0, styles: mainMaster.styles, part: m0, ids: { n: 100 }, texts: [] };
      const md = pkg.doc(m0);
      const bg = await backgroundXml(mainMaster, mctx);
      if (bg) {
        const cs = path(md.documentElement, 'cSld');
        const old = kid(cs, 'bg'); if (old) old.remove();
        cs.insertBefore(md.importNode(parseFrag(bg), true), cs.firstChild);
      }
      const deco = await drawingXml(mainMaster, mctx, { skipPh: true });
      if (deco) { const tree = spTreeOf(md); const after = kid(tree, 'grpSpPr'); for (const n of parseFrags(deco)) after.after(md.importNode(n, true)); }
    }
    // 슬라이드
    const lays = layoutsOf(m0);
    const layOf = t => lays.find(p => attr(pkg.doc(p).documentElement, 'type') === t) || lays[0];
    let made = 0;
    for (const entry of lists[0]) {
      const r = container(entry.ref);
      if (!r || r.type !== 0x03EE) continue;
      const info = readSlideLike(r, entry);
      const master = masters.get(info.masterId) || mainMaster;
      const titleMaster = master && master.kind === 0x03EE ? master : null;
      const main = titleMaster ? (masters.get(titleMaster.masterId) || mainMaster) : master;
      const scheme = (info.flags & 2) || !info.scheme ? ((titleMaster && titleMaster.scheme) || (main && main.scheme) || scheme0) : info.scheme;
      const styles = { ...((main && main.styles) || {}) };
      const path2 = pkg.freeName('ppt/slides/slide', 'xml');
      const sctx = { ...ctxBase, scheme, styles, part: path2, ids: { n: 2 }, texts: entry.texts };
      pkg.setDoc(pkg.relsPath(path2), parseXML(`<Relationships xmlns="${NS.rel}"/>`));
      let body = '', bg = '', phTypes = [];
      try {
        if (titleMaster) {   // 제목 마스터: 그 배경·꾸밈을 이 슬라이드에 직접 넣는다
          const tctx = { ...sctx, scheme: titleMaster.scheme || scheme, texts: [] };
          if (info.flags & 4) bg = (await backgroundXml(titleMaster, tctx)) || '';
          if (info.flags & 1) body += (await drawingXml(titleMaster, tctx, { skipPh: true })) || '';
        }
        if (!(info.flags & 4)) bg = (await backgroundXml(info, sctx)) || bg;
        body += (await drawingXml(info, sctx, { phOut: phTypes })) || '';
      } catch (e) { console.warn('슬라이드 가져오기 일부 실패', e); }
      const hideMaster = titleMaster || !(info.flags & 1);
      const lt = phTypes.includes('ctrTitle') ? 'title' : phTypes.filter(t => t === 'body' || t === 'obj').length >= 2 ? 'twoObj' : phTypes.includes('title') && (phTypes.includes('body') || phTypes.includes('obj')) ? 'obj' : phTypes.includes('title') ? 'titleOnly' : 'blank';
      const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"${hideMaster ? ' showMasterSp="0"' : ''}><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${body}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
      let doc = parseXML(xml);
      if (doc.getElementsByTagName('parsererror').length) { console.warn('슬라이드 XML 오류', doc.getElementsByTagName('parsererror')[0].textContent); doc = parseXML(slideXmlEmpty()); }
      pkg.setDoc(path2, doc);
      pkg.addRel(path2, REL.layout, layOf(lt));
      // 관계 순서: 레이아웃이 rId 들 중 하나면 된다
      pkg.setOverride(path2, CT.slide);
      addSlideRef(path2, made++);
      // 메모
      const ne = info.notesId ? notesMap.get(info.notesId) : null;
      if (ne) {
        try {
          const nr = container(ne.ref);
          const t = nr ? notesTextOf(nr, ne, ctxBase) : '';
          if (t.trim()) writeNotes(path2, t);
        } catch (e) { console.warn('메모 가져오기 실패', e); }
      }
    }
    if (!made) newSlide(layOf('title'), 0);
    await pkg.preloadImages();
    deck.themes = new Map();
    return deck;
  } finally { S.deck = prev; }
}
function slideXmlEmpty() {
  return `<p:sld xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
const NSDECL = `xmlns:a="${NS.a}" xmlns:r="${NS.r}" xmlns:p="${NS.p}"`;
function parseFrag(x) { const d = parseXML(`<w ${NSDECL}>${x}</w>`); return d.documentElement.firstElementChild; }
// 거꾸로 돌려준다: 같은 자리 뒤에 차례로 넣으면 원래 순서가 된다
function parseFrags(x) { const d = parseXML(`<w ${NSDECL}>${x}</w>`); return [...d.documentElement.children].reverse(); }

// ── 색 ──
function pptColor(ctx, v, d) {
  if (v == null) return d;
  const fl = v >>> 24;
  if (fl & 0x08) { const s = ctx.scheme && ctx.scheme[v & 0xFF]; return s != null ? s : d; }
  if (fl & 0x10) return d;   // 시스템 색(도형 채우기 색 따라가기 등) → 기본값
  return v & 0xFFFFFF;
}
function pptIdxColor(ctx, c) {
  if (!c) return null;
  if (c.idx === 0xFE) return c.r | (c.g << 8) | (c.b << 16);
  if (c.idx < 8 && ctx.scheme) return ctx.scheme[c.idx];
  return null;
}
const pHex = c => [c & 0xFF, (c >> 8) & 0xFF, (c >> 16) & 0xFF].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
const srgb = (c, alpha) => `<a:srgbClr val="${pHex(c)}">${alpha != null && alpha < 1 ? `<a:alpha val="${Math.round(alpha * 100000)}"/>` : ''}</a:srgbClr>`;

// ── 그림 ──
async function pptBlip(ctx, pib) {
  if (!pib || !ctx.bse[pib - 1]) return null;
  if (ctx.media.has(pib)) return ctx.media.get(pib);
  const e = ctx.bse[pib - 1];
  let S2 = ctx.PIC, at = e.fo, rec = S2 ? S2.rec(at) : null;
  if (!rec || rec.type < 0xF018 || rec.type > 0xF117) { S2 = ctx.D; rec = e.rec.len > 36 + e.cbName ? S2.rec(e.rec.body + 36 + e.cbName) : null; }
  let out = null;
  if (rec && rec.type >= 0xF018 && rec.type <= 0xF117) {
    const two = rec.inst & 1;
    const t = rec.type;
    let ext = null, data = null;
    if (t === 0xF01A || t === 0xF01B || t === 0xF01C) {   // EMF·WMF·PICT: 메타파일 머리 34바이트, 대개 압축
      const o = rec.body + 16 * (two ? 2 : 1);
      const comp = S2.u8[o + 32];
      const raw = S2.u8.subarray(o + 34, rec.end);
      data = comp === 0 ? await inflateZ(raw).catch(() => null) : raw.slice();
      ext = t === 0xF01A ? 'emf' : t === 0xF01B ? 'wmf' : 'pct';
      if (ext === 'wmf' && data) data = wmfPlaceable(data, S2, o);
    } else {
      const o = rec.body + 16 * (two ? 2 : 1) + 1;
      const raw = S2.u8.slice(o, rec.end);
      if (t === 0xF01D || t === 0xF02A) { ext = 'jpeg'; data = raw; }
      else if (t === 0xF01E) { ext = 'png'; data = raw; }
      else if (t === 0xF01F) { ext = 'bmp'; data = dibToBmp(raw); }
      else if (t === 0xF029) { ext = 'tiff'; data = raw; }
    }
    if (data && ext && ext !== 'pct') {
      const path = ctx.pkg.freeName('ppt/media/image', ext);
      ctx.pkg.setBin(path, data);
      ctx.pkg.ensureDefault(ext, MIME[ext] || 'application/octet-stream');
      out = path;
    }
  }
  ctx.media.set(pib, out);
  return out;
}
async function inflateZ(raw) {
  const ds = new DecompressionStream('deflate');
  const buf = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(buf);
}
function dibToBmp(dib) {
  const v = new DataView(dib.buffer, dib.byteOffset, dib.byteLength);
  const hs = v.getUint32(0, true), bits = v.getUint16(14, true), comp = v.getUint32(16, true);
  let pal = hs >= 40 ? v.getUint32(32, true) : 0;
  if (!pal && bits <= 8) pal = 1 << bits;
  const masks = hs === 40 && (comp === 3 || comp === 6) ? (comp === 3 ? 12 : 16) : 0;
  const off = 14 + hs + masks + pal * (hs === 12 ? 3 : 4);
  const out = new Uint8Array(14 + dib.length);
  const o = new DataView(out.buffer);
  out[0] = 0x42; out[1] = 0x4D; o.setUint32(2, out.length, true); o.setUint32(10, off, true);
  out.set(dib, 14);
  return out;
}
// WMF 앞에 위치 정보 머리(placeable header)가 없으면 붙인다
function wmfPlaceable(data, S2, mo) {
  if (data[0] === 0xD7 && data[1] === 0xCD) return data;
  const l = S2.i32(mo + 4), t = S2.i32(mo + 8), r = S2.i32(mo + 12), b = S2.i32(mo + 16);
  const out = new Uint8Array(22 + data.length), v = new DataView(out.buffer);
  v.setUint32(0, 0x9AC6CDD7, true); v.setInt16(6, l, true); v.setInt16(8, t, true); v.setInt16(10, r, true); v.setInt16(12, b, true); v.setUint16(14, 1440, true);
  let x = 0; for (let i = 0; i < 10; i += 2) x ^= v.getUint16(i, true); v.setUint16(20, x, true);
  out.set(data, 22);
  return out;
}

// ── 채우기·선 XML ──
async function fillXml(sh, ctx) {
  const D2 = ctx.dggOpt;
  if (!optBool(sh, 0x01BF, 0x10, true, D2)) return '<a:noFill/>';
  const type = optV(sh, 0x0180, D2.has(0x0180) ? D2.get(0x0180).v : 0);
  const c1 = pptColor(ctx, optV(sh, 0x0181, D2.has(0x0181) ? D2.get(0x0181).v : 0xFFFFFF), 0xFFFFFF);
  const a1 = optV(sh, 0x0182, 0x10000) / 0x10000;
  const c2 = pptColor(ctx, optV(sh, 0x0183, 0xFFFFFF), 0xFFFFFF);
  const a2 = optV(sh, 0x0184, 0x10000) / 0x10000;
  if (type === 2 || type === 3) {
    const pib = optV(sh, 0x0186, 0);
    const p = await pptBlip(ctx, pib);
    if (p) { const rid = ctx.pkg.addRel(ctx.part, REL.image, p); return `<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="${rid}"/>${type === 2 ? '<a:tile tx="0" ty="0" sx="100000" sy="100000" flip="none" algn="tl"/>' : '<a:stretch><a:fillRect/></a:stretch>'}</a:blipFill>`; }
    return `<a:solidFill>${srgb(c1, a1)}</a:solidFill>`;
  }
  if (type >= 4 && type <= 8) {
    // 색 순서·방향(LibreOffice 가져오기 규칙을 따름): 시작색 → 끝색
    const angFix = optV(sh, 0x018B, 0) | 0;
    let focus = optV(sh, 0x018C, 0) | 0;
    let chg = angFix >= 0 ? 1 : 0;
    if (!focus) chg ^= 1; else if (focus < 0) { focus = -focus; chg ^= 1; }
    const axial = focus > 40 && focus < 60;
    if (axial) chg ^= 1;
    const rectG = type === 5 || type === 6;
    if (rectG) chg ^= 1;
    let A = [c1, a1], B = [c2, a2];
    if (chg) [A, B] = [B, A];
    const start = B, end = A;
    const gs = (pos, c) => `<a:gs pos="${pos}">${srgb(c[0], c[1])}</a:gs>`;
    if (rectG || type === 8) return `<a:gradFill rotWithShape="1"><a:gsLst>${gs(0, end)}${gs(100000, start)}</a:gsLst><a:path path="${type === 6 ? 'shape' : 'rect'}"><a:fillToRect l="50000" t="50000" r="50000" b="50000"/></a:path></a:gradFill>`;
    const deg = ((Math.round(angFix / 65536) + 90) % 360 + 360) % 360;
    const stops = axial ? gs(0, start) + gs(50000, end) + gs(100000, start) : gs(0, start) + gs(100000, end);
    return `<a:gradFill rotWithShape="1"><a:gsLst>${stops}</a:gsLst><a:lin ang="${deg * 60000}" scaled="0"/></a:gradFill>`;
  }
  if (type === 1) return `<a:pattFill prst="pct50"><a:fgClr>${srgb(c1)}</a:fgClr><a:bgClr>${srgb(c2)}</a:bgClr></a:pattFill>`;
  if (type === 9) return '<a:noFill/>';
  return `<a:solidFill>${srgb(c1, a1)}</a:solidFill>`;
}
function lineXml(sh, ctx) {
  const D2 = ctx.dggOpt;
  if (!optBool(sh, 0x01FF, 0x8, true, D2)) return '<a:ln><a:noFill/></a:ln>';
  const c = pptColor(ctx, optV(sh, 0x01C0, D2.has(0x01C0) ? D2.get(0x01C0).v : 0), 0);
  const a = optV(sh, 0x01C1, 0x10000) / 0x10000;
  const w = optV(sh, 0x01CB, D2.has(0x01CB) ? D2.get(0x01CB).v : 9525);
  const dash = ['solid', 'dash', 'sysDot', 'dashDot', 'lgDashDotDot', 'sysDot', 'sysDash', 'lgDash', 'lgDashDot', 'lgDashDotDot', 'dash'][optV(sh, 0x01CE, 0)] || 'solid';
  const arrow = v => ['', 'triangle', 'stealth', 'diamond', 'oval', 'arrow'][v] || '';
  const hd = arrow(optV(sh, 0x01D0, 0)), tl = arrow(optV(sh, 0x01D1, 0));
  return `<a:ln w="${Math.max(0, w | 0)}"><a:solidFill>${srgb(c, a)}</a:solidFill>${dash !== 'solid' ? `<a:prstDash val="${dash}"/>` : ''}${hd ? `<a:headEnd type="${hd}"/>` : ''}${tl ? `<a:tailEnd type="${tl}"/>` : ''}</a:ln>`;
}

// ── 모양 ──
function geomXml(sh) {
  if ((sh.type === 0 || !MSOSPT[sh.type]) && sh.opt.has(0x0145)) {
    const c = custGeomXml(sh);
    if (c) return c;
  }
  const prst = MSOSPT[sh.type] || 'rect';
  let av = '';
  if (ADJ_SIMPLE.has(prst) && sh.opt.has(0x0147)) {
    const v = optV(sh, 0x0147, 0) | 0;
    av = `<a:gd name="adj" fmla="val ${Math.round(v * 100000 / 21600)}"/>`;
  }
  return `<a:prstGeom prst="${prst}"><a:avLst>${av}</a:avLst></a:prstGeom>`;
}
function msoArray(data) {
  if (!data || data.length < 6) return null;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = v.getUint16(0, true), cb = v.getUint16(4, true);
  return { n, cb, v, at: i => 6 + i * (cb === 0xFFF0 ? 4 : cb) };
}
function custGeomXml(sh) {
  const vx = msoArray(sh.opt.get(0x0145).data);
  if (!vx || !vx.n) return null;
  const pts = [];
  for (let i = 0; i < vx.n; i++) {
    const o = vx.at(i);
    if (o + (vx.cb === 8 ? 8 : 4) > vx.v.byteLength) break;
    if (vx.cb === 8) { const x = vx.v.getUint32(o, true), y = vx.v.getUint32(o + 4, true); if ((x & 0x80000000) || (y & 0x80000000)) return null; pts.push([x | 0, y | 0]); }   // 식을 쓰는 꼭짓점은 지원하지 않음
    else pts.push([vx.v.getInt16(o, true), vx.v.getInt16(o + 2, true)]);
  }
  const gl = optV(sh, 0x0140, 0) | 0, gt = optV(sh, 0x0141, 0) | 0;
  const gw = Math.max(1, (optV(sh, 0x0142, 21600) | 0) - gl), gh = Math.max(1, (optV(sh, 0x0143, 21600) | 0) - gt);
  const P = i => { const p = pts[Math.min(i, pts.length - 1)] || [0, 0]; return `<a:pt x="${p[0] - gl}" y="${p[1] - gt}"/>`; };
  let xml = '', k = 0, open = false;
  const seg = sh.opt.has(0x0146) ? msoArray(sh.opt.get(0x0146).data) : null;
  if (seg && seg.n) {
    for (let i = 0; i < seg.n; i++) {
      const o = seg.at(i);
      if (o + 2 > seg.v.byteLength) break;
      const s = seg.v.getUint16(o, true);
      const t = s >> 13, cnt = s & 0x1FFF;
      if (t === 2) { xml += `<a:moveTo>${P(k++)}</a:moveTo>`; open = true; }
      else if (t === 0) { for (let j = 0; j < Math.max(1, cnt); j++) xml += `<a:lnTo>${P(k++)}</a:lnTo>`; }
      else if (t === 1) { for (let j = 0; j < Math.max(1, cnt); j++) { xml += `<a:cubicBezTo>${P(k)}${P(k + 1)}${P(k + 2)}</a:cubicBezTo>`; k += 3; } }
      else if (t === 3) { if (open) xml += '<a:close/>'; }
      else if (t === 4) open = false;
      if (!xml.startsWith('<a:moveTo>') && xml) xml = `<a:moveTo>${P(0)}</a:moveTo>` + xml;
    }
  } else {
    xml = `<a:moveTo>${P(0)}</a:moveTo>` + pts.slice(1).map((p, i) => `<a:lnTo>${P(i + 1)}</a:lnTo>`).join('');
  }
  if (!xml) return null;
  return `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${gw}" h="${gh}">${xml}</a:path></a:pathLst></a:custGeom>`;
}

// ── 글자 ──
function textBlockOf(ctx, sh) {
  if (!sh.textbox) return null;
  const D = ctx.D;
  let blk = null;
  for (const r of D.kids(sh.textbox)) {
    if (r.type === 0x0F9E) { const i = D.i32(r.body); const t = ctx.texts && ctx.texts[i]; if (t) blk = { ...t }; }
    else if (r.type === 0x0F9F) blk = { type: D.u32(r.body), text: '', style: null };
    else if (blk && r.type === 0x0FA0) blk.text = D.utf16(r.body, r.len);
    else if (blk && r.type === 0x0FA8) blk.text = D.bytes8(r.body, r.len);
    else if (blk && r.type === 0x0FA1) blk.style = r;
  }
  return blk;
}
function levelStyle(ctx, type, lvl) {
  const st = ctx.styles || {};
  const pickT = t => st[t] || ctx.envStyles[t];
  const base = type === 6 ? (pickT(6) || pickT(0)) : type === 5 ? (pickT(5) || pickT(1)) : (type === 7 || type === 8) ? (pickT(type) || pickT(1)) : type === 2 ? (pickT(2) || pickT(1)) : pickT(type) || pickT(4);
  const chain = [];
  // 몸통 형식들은 본문 서식 위에 쌓인다
  if ((type === 5 || type === 7 || type === 8) && pickT(1)) chain.push(pickT(1));
  if (type === 6 && pickT(0)) chain.push(pickT(0));
  if (base) chain.push(base);
  const pf = { ...ctx.envPF }, cf = { ...ctx.envCF };
  for (const lvList of chain) { const L = lvList[Math.min(lvl, lvList.length - 1)]; if (L) { Object.assign(pf, L.pf); Object.assign(cf, L.cf); } }
  return { pf, cf };
}
const ALGN = ['l', 'ctr', 'r', 'just', 'dist', 'thaiDist', 'justLow'];
function spcXml(tag, v) {
  if (v == null) return '';
  if (v >= 0) return `<a:${tag}><a:spcPct val="${v * 1000}"/></a:${tag}>`;
  return `<a:${tag}><a:spcPts val="${Math.round(-v / 8 * 100)}"/></a:${tag}>`;
}
function pPrXml(pf, lvl, ctx, cf) {
  const at = [];
  if (lvl) at.push(`lvl="${lvl}"`);
  if (pf.marL != null) at.push(`marL="${Math.round(pf.marL * MU)}"`);
  if (pf.marL != null || pf.indent != null) at.push(`indent="${Math.round(((pf.indent || 0) - (pf.marL || 0)) * MU)}"`);
  if (pf.align != null) at.push(`algn="${ALGN[pf.align] || 'l'}"`);
  let kidsX = spcXml('lnSpc', pf.lnSpc) + spcXml('spcBef', pf.spBef) + spcXml('spcAft', pf.spAft);
  if (pf.hasBullet) {
    const bc = pf.buHasColor ? pptIdxColor(ctx, pf.buColor) : null;
    if (bc != null) kidsX += `<a:buClr>${srgb(bc)}</a:buClr>`;
    if (pf.buHasSize && pf.buSize) kidsX += pf.buSize > 0 ? `<a:buSzPct val="${pf.buSize * 1000}"/>` : `<a:buSzPts val="${-pf.buSize * 100}"/>`;
    const bf = pf.buHasFont && pf.buFont != null ? ctx.fonts[pf.buFont] : null;
    if (bf) kidsX += `<a:buFont typeface="${esc(bf)}"/>`;
    const ch = pf.buChar ? String.fromCharCode(pf.buChar) : '•';
    kidsX += `<a:buChar char="${esc(ch)}"/>`;
  } else kidsX += '<a:buNone/>';
  void cf;
  return `<a:pPr${at.length ? ' ' + at.join(' ') : ''}>${kidsX}</a:pPr>`;
}
function rPrXml(cf, ctx, tag = 'a:rPr') {
  const at = ['lang="ko-KR"', 'altLang="en-US"'];
  if (cf.size) at.push(`sz="${Math.round(cf.size * 100)}"`);
  if (cf.b != null) at.push(`b="${cf.b ? 1 : 0}"`);
  if (cf.i != null) at.push(`i="${cf.i ? 1 : 0}"`);
  if (cf.u) at.push('u="sng"');
  if (cf.pos) at.push(`baseline="${cf.pos * 1000}"`);
  at.push('dirty="0"');
  let k = '';
  const c = pptIdxColor(ctx, cf.color);
  if (c != null) k += `<a:solidFill>${srgb(c)}</a:solidFill>`;
  const lf = cf.font != null ? ctx.fonts[cf.font] : null;
  const ef = (cf.eaFont2 != null ? ctx.fonts[cf.eaFont2] : null) || (cf.eaFont != null ? ctx.fonts[cf.eaFont] : null);
  if (lf) k += `<a:latin typeface="${esc(lf)}"/>`;
  if (ef || lf) k += `<a:ea typeface="${esc(ef || lf)}"/>`;
  return `<${tag} ${at.join(' ')}>${k}</${tag}>`;
}
function textBodyXml(blk, ctx, bodyPr) {
  const style = blk.style ? pptStyleRuns(ctx.D, blk.style, blk.text.length) : { pf: [], cf: [] };
  // 글자 위치 → 문단·글자 서식 조각
  const runAt = (runs, i) => { let s = 0; for (const r of runs) { if (i < s + r.n) return r; s += r.n; } return runs[runs.length - 1] || null; };
  const cfBounds = []; { let s = 0; for (const r of style.cf) { s += r.n; cfBounds.push(s); } }
  const paras = [];
  let start = 0;
  const raw = blk.text || '';
  for (let i = 0; i <= raw.length; i++) {
    if (i === raw.length || raw[i] === '\r') { paras.push([start, i]); start = i + 1; }
  }
  let out = '';
  for (const [s, e] of paras) {
    const pr = runAt(style.pf, s);
    const lvl = pr ? Math.min(pr.lvl, 8) : 0;
    const ls = levelStyle(ctx, blk.type, lvl);
    const pf = { ...ls.pf, ...(pr ? pr.v : {}) };
    let x = '<a:p>' + pPrXml(pf, lvl, ctx);
    let i = s;
    let lastCf = { ...ls.cf, ...((runAt(style.cf, s) || {}).v || {}) };
    while (i < e) {
      const cr = runAt(style.cf, i);
      const cf = { ...ls.cf, ...(cr ? cr.v : {}) };
      lastCf = cf;
      const nb = cfBounds.find(b => b > i) || e;
      const j = Math.min(e, nb);
      const seg = raw.slice(i, j);
      const parts = seg.split('\u000B');
      parts.forEach((p, k) => {
        if (k > 0) x += `<a:br>${rPrXml(cf, ctx)}</a:br>`;
        const t = p.replace(/[\u0000-\u0008\u000C\u000E-\u001F]/g, '');
        if (t) x += `<a:r>${rPrXml(cf, ctx)}<a:t>${esc(t)}</a:t></a:r>`;
      });
      i = j;
    }
    x += rPrXml(lastCf, ctx, 'a:endParaRPr') + '</a:p>';
    out += x;
  }
  return `<p:txBody>${bodyPr}<a:lstStyle/>${out || '<a:p><a:endParaRPr lang="ko-KR" altLang="en-US"/></a:p>'}</p:txBody>`;
}
function bodyPrXml(sh, ph) {
  const ins = (pid, d) => Math.round(optV(sh, pid, d) | 0);
  const at = [`lIns="${ins(0x0081, 91440)}"`, `tIns="${ins(0x0082, 45720)}"`, `rIns="${ins(0x0083, 91440)}"`, `bIns="${ins(0x0084, 45720)}"`, 'rtlCol="0"'];
  const an = optV(sh, 0x0087, null);
  if (an != null) { at.push(`anchor="${['t', 'ctr', 'b', 't', 'ctr', 'b', 't', 'ctr', 'b', 't'][an] || 't'}"`); if ([3, 4, 5].includes(an)) at.push('anchorCtr="1"'); }
  if (optV(sh, 0x0085, 0) === 2) at.push('wrap="none"'); else at.push('wrap="square"');
  const flow = optV(sh, 0x0088, 0);
  if (flow === 1 || flow === 5) at.push('vert="eaVert"'); else if (flow === 2) at.push('vert="vert270"');
  const fit = optBool(sh, 0x00BF, 0x2, false);
  return `<a:bodyPr ${at.join(' ')}>${fit ? '<a:spAutoFit/>' : ph ? '<a:noAutofit/>' : ''}</a:bodyPr>`;
}

// ── 그리기 묶음(Drawing) → 도형 XML ──
async function backgroundXml(info, ctx) {
  const D = ctx.D;
  const dg = info.drawing;
  if (!dg) return null;
  const bgRec = D.kids(dg).find(c => c.type === 0xF004);
  if (!bgRec) return null;
  const sh = pptShape(D, bgRec);
  if (!(sh.flags & 0x400) && D.kids(dg).filter(c => c.type === 0xF004).length !== 1) return null;
  const f = await fillXml(sh, ctx);
  if (!f || f === '<a:noFill/>') return null;
  return `<p:bg><p:bgPr>${f}<a:effectLst/></p:bgPr></p:bg>`;
}
async function drawingXml(info, ctx, opt = {}) {
  const D = ctx.D;
  const dg = info.drawing;
  if (!dg) return '';
  const top = D.kid(dg, 0xF003);
  if (!top) return '';
  const items = D.kids(top);
  let out = '';
  for (let i = 1; i < items.length; i++) out += await shapeXmlOf(items[i], ctx, opt, null);
  return out;
}
function anchorBox(sh, parent) {
  const a = parent ? (sh.child || sh.anchor) : (sh.anchor || sh.child);
  if (!a) return null;
  const k = parent || !sh.anchor ? 1 : MU;
  let x = a.l * k, y = a.t * k, w = (a.r - a.l) * k, hh = (a.b - a.t) * k;
  const rot = (((optV(sh, 0x0004, 0) | 0) / 65536) % 360 + 360) % 360;
  // 45~135°, 225~315° 돌린 도형은 상자가 돌아간 채로 적혀 있다 → 원래 상자로
  if ((rot >= 45 && rot < 135) || (rot >= 225 && rot < 315)) { const cx = x + w / 2, cy = y + hh / 2; [w, hh] = [hh, w]; x = cx - w / 2; y = cy - hh / 2; }
  return { x: Math.round(x), y: Math.round(y), w: Math.max(0, Math.round(w)), h: Math.max(0, Math.round(hh)), rot };
}
function xfrmXml(b, sh, tag = 'a:xfrm', grp = null) {
  const at = [];
  if (b.rot) at.push(`rot="${Math.round(b.rot * 60000)}"`);
  if (sh.flags & 0x40) at.push('flipH="1"');
  if (sh.flags & 0x80) at.push('flipV="1"');
  return `<${tag}${at.length ? ' ' + at.join(' ') : ''}><a:off x="${b.x}" y="${b.y}"/><a:ext cx="${b.w}" cy="${b.h}"/>${grp ? `<a:chOff x="${grp.l}" y="${grp.t}"/><a:chExt cx="${Math.max(1, grp.r - grp.l)}" cy="${Math.max(1, grp.b - grp.t)}"/>` : ''}</${tag}>`;
}
async function shapeXmlOf(r, ctx, opt, parent) {
  const D = ctx.D;
  if (r.type === 0xF003) {   // 그룹
    const kidsR = D.kids(r);
    if (!kidsR.length) return '';
    const gsh = pptShape(D, kidsR[0]);
    const b = anchorBox(gsh, parent);
    if (!b) return '';
    const g = gsh.grpBounds || { l: 0, t: 0, r: b.w, b: b.h };
    let inner = '';
    for (let i = 1; i < kidsR.length; i++) inner += await shapeXmlOf(kidsR[i], ctx, { ...opt, inGroup: true }, gsh);
    if (!inner) return '';
    const id = ctx.ids.n++;
    return `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Group ${id}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr>${xfrmXml(b, gsh, 'a:xfrm', g)}</p:grpSpPr>${inner}</p:grpSp>`;
  }
  if (r.type !== 0xF004) return '';
  const sh = pptShape(D, r);
  sh.base = ctx.masterShapes ? ctx.masterShapes.get(optV(sh, 0x0301, -1)) || null : null;
  if (sh.flags & 0x8) return '';                 // 지운 도형
  if (sh.flags & 0x400) return '';               // 배경
  if (sh.flags & 0x4) return '';                 // 맨 위 그룹 자신
  const b = anchorBox(sh, parent);
  if (!b) return '';
  let phType = sh.ph ? PH_TYPE[sh.ph.id] : null;
  if (sh.ph && opt.skipPh) return '';
  if (phType && ['dt', 'sldNum', 'ftr', 'hdr'].includes(phType)) return '';
  const id = ctx.ids.n++;
  const blk = textBlockOf(ctx, sh);
  const pib = optV(sh, 0x0104, 0);
  const nameOpt = sh.opt.get(0x0380);
  const nm = nameOpt && nameOpt.data ? new PptStream(nameOpt.data).utf16(0, nameOpt.data.length).split('\0')[0] : '';
  // 그림
  if (pib && !(blk && blk.text)) {
    const p = await pptBlip(ctx, pib);
    if (p) {
      const rid = ctx.pkg.addRel(ctx.part, REL.image, p);
      const crop = (pid) => { const v = optV(sh, pid, 0) | 0; return Math.round(v / 65536 * 100000); };
      const ct = crop(0x0100), cb = crop(0x0101), cl = crop(0x0102), cr = crop(0x0103);
      const src = ct || cb || cl || cr ? `<a:srcRect${cl ? ` l="${cl}"` : ''}${ct ? ` t="${ct}"` : ''}${cr ? ` r="${cr}"` : ''}${cb ? ` b="${cb}"` : ''}/>` : '';
      const ln2 = optBool(sh, 0x01FF, 0x8, false) ? lineXml(sh, ctx) : '';
      return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(nm || 'Picture ' + id)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/>${src}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrmXml(b, sh)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${ln2}</p:spPr></p:pic>`;
    }
  }
  const prst = MSOSPT[sh.type];
  const isLine = prst === 'line' || /Connector/.test(prst || '');
  if (isLine) {
    return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${esc(nm || 'Connector ' + id)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrmXml(b, sh)}<a:prstGeom prst="${prst === 'line' ? 'line' : prst}"><a:avLst/></a:prstGeom>${lineXml(sh, ctx)}</p:spPr></p:cxnSp>`;
  }
  let phX = '';
  if (phType) {
    if (opt.phOut) opt.phOut.push(phType);
    const cnt = opt.phOut ? opt.phOut.filter(t => t === 'body' || t === 'obj').length : 1;
    const vert = sh.ph.id === 0x11 || sh.ph.id === 0x12 || sh.ph.id === 0x19;
    phX = phType === 'title' || phType === 'ctrTitle' ? `<p:ph type="${phType}"${vert ? ' orient="vert"' : ''}/>`
      : phType === 'subTitle' ? '<p:ph type="subTitle" idx="1"/>'
        : phType === 'body' || phType === 'obj' ? `<p:ph${vert ? ' orient="vert"' : ''} idx="${cnt}"/>`
          : `<p:ph type="${phType}" idx="${10 + id}"/>`;
  }
  const isTxBox = sh.type === 202 && !phType;
  const fill = phType && !optGet(sh, 0x01BF) && !optGet(sh, 0x0181) ? '<a:noFill/>' : await fillXml(sh, ctx);
  const line = phType && !optGet(sh, 0x01FF) && !optGet(sh, 0x01C0) ? '' : lineXml(sh, ctx);
  const tb = blk ? textBodyXml(blk, ctx, bodyPrXml(sh, !!phType)) : phType ? `<p:txBody>${bodyPrXml(sh, true)}<a:lstStyle/><a:p><a:endParaRPr lang="ko-KR" altLang="en-US"/></a:p></p:txBody>` : '';
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(nm || (phType ? phType + ' ' + id : isTxBox ? 'TextBox ' + id : 'Shape ' + id))}"/><p:cNvSpPr${isTxBox ? ' txBox="1"' : ''}>${phType ? '<a:spLocks noGrp="1"/>' : ''}</p:cNvSpPr><p:nvPr>${phX}</p:nvPr></p:nvSpPr><p:spPr>${xfrmXml(b, sh)}${geomXml(sh)}${fill}${line}</p:spPr>${tb}</p:sp>`;
}
// 메모 슬라이드의 본문 글
function notesTextOf(r, entry, ctx) {
  const D = ctx.D;
  const dg = D.deep(D.kid(r, 0x040C), 0xF002);
  const all = [];
  const walk = rec => { for (const c of D.kids(rec)) { if (c.type === 0xF004) all.push(pptShape(D, c)); else if (c.type === 0xF003) walk(c); } };
  if (dg) walk(dg);
  const body = all.find(s => s.ph && (s.ph.id === 0x0C || s.ph.id === 0x06)) || all.find(s => s.textbox);
  if (!body) return entry.texts.filter(t => t.type === 2).map(t => t.text).join('\n').replace(/[\r\u000B]/g, '\n');
  const blk = textBlockOf({ ...ctx, texts: entry.texts }, body);
  return blk ? blk.text.replace(/[\r\u000B]/g, '\n').replace(/[\u0000-\u0008\u000C\u000E-\u001F]/g, '') : '';
}
