// ───────────────────────── 한국어 안내 문구 · 회전 아이콘 ─────────────────────────
const SIDE_KO = { left: '왼쪽', right: '오른쪽' };

function sideOf(s) {
  const m = s.mod || '';
  if (/left/.test(m)) return 'left';
  if (/right/.test(m)) return 'right';
  if (s.angle != null) { if (s.angle < -12) return 'left'; if (s.angle > 12) return 'right'; }
  return null;
}
function modAngle(mod) {
  const sign = /left/.test(mod || '') ? -1 : 1;
  if (/uturn/.test(mod || '')) return 180;
  if (/slight/.test(mod || '')) return 35 * sign;
  if (/sharp/.test(mod || '')) return 140 * sign;
  if (/left|right/.test(mod || '')) return 90 * sign;
  return 0;
}
// 각도 → 시계 방향(1시=오른쪽 30°, 3시=오른쪽 90°, 11시=왼쪽 30° …)
function clockOf(a) { let c = Math.round(a / 30) % 12; if (c <= 0) c += 12; return c; }

// 회전 종류: 완만(○시 방향) · 보통(우/좌회전) · 급(○시 방향 급우/좌회전) · 유턴
function turnCore(s) {
  const mod = s.mod || '';
  const a = s.angle != null ? s.angle : modAngle(mod);
  if (s.kind === 'uturn' || mod === 'uturn' || Math.abs(a) >= 172) return { core: '유턴', short: '유턴', uturn: true, a: 180 };
  const side = sideOf(s);
  const right = side ? side === 'right' : a > 0;
  const cls = /slight/.test(mod) ? 'slight' : /sharp/.test(mod) ? 'sharp' : /left|right/.test(mod) ? 'normal'
    : (Math.abs(a) < 50 ? 'slight' : Math.abs(a) > 130 ? 'sharp' : 'normal');
  const sa = right ? Math.abs(a) : -Math.abs(a);
  if (cls === 'slight') {
    let c = clockOf(sa);
    c = right ? clamp(c === 12 ? 1 : c, 1, 2) : (c === 12 ? 11 : clamp(c, 10, 11));
    return { core: `${c}시 방향`, short: `${c}시 방향`, clock: true, a: right ? Math.max(25, Math.abs(a)) : -Math.max(25, Math.abs(a)) };
  }
  if (cls === 'sharp') {
    let c = clockOf(sa);
    c = right ? clamp(c, 4, 5) : clamp(c, 7, 8);
    return { core: `${c}시 방향 ${right ? '급우회전' : '급좌회전'}`, short: `${c}시 방향`, sharp: true, a: right ? Math.max(125, Math.abs(a)) : -Math.max(125, Math.abs(a)) };
  }
  return { core: right ? '우회전' : '좌회전', short: right ? '우회전' : '좌회전', a: right ? 90 : -90 };
}

// 말로 읽을 거리: 300미터, 1.5킬로미터
function distWords(m) {
  if (m >= 950) {
    const km = Math.round(m / 100) / 10;
    return (Number.isInteger(km) ? String(km) : km.toFixed(1)) + '킬로미터';
  }
  const r = m >= 300 ? Math.round(m / 100) * 100 : m >= 100 ? Math.round(m / 50) * 50 : Math.max(10, Math.round(m / 10) * 10);
  return r + '미터';
}

function exitTarget(s) {
  return [s.exitName, s.toward ? s.toward + ' 방면' : ''].filter(Boolean).join(' ');
}
function rampTarget(s) {
  return [s.name, s.toward ? s.toward + ' 방면' : ''].filter(Boolean).join(' ');
}

// 음성 문장. dist: 남은 거리(m), soon: '잠시 후' 단계
function sayStep(s, dist, { soon = false, target = true } = {}) {
  const dw = distWords(dist);
  const lead = soon ? '잠시 후 ' : `${dw} 앞에서 `;
  const noun = soon ? '잠시 후 ' : `${dw} 앞 `;
  const side = sideOf(s), sd = side ? SIDE_KO[side] : '';
  const tNoun = s.toward ? `${s.toward} 방면` : (s.name || '');
  const tDir = s.toward ? `${s.toward} 방면으로 ` : (s.name ? josa(s.name, '으로/로') + ' ' : '');
  switch (s.kind) {
    case 'turn': case 'uturn': {
      const t = turnCore(s);
      const pre = s.eor ? '도로 끝에서 ' : '';
      if (t.uturn || t.sharp) return `${lead}${pre}${t.core}입니다`;
      if (t.clock) return `${lead}${pre}${t.core}${target && tNoun ? ', ' + tNoun : ''}입니다`;
      return `${lead}${pre}${target ? tDir : ''}${t.core}입니다`;
    }
    case 'ramp': {
      const tg = target ? rampTarget(s) : '';
      return `${lead}${sd ? sd + ' 방향, ' : ''}${tg ? tg + ' ' : ''}진입로입니다`;
    }
    case 'exit': {
      const tg = target ? exitTarget(s) : '';
      return `${lead}${sd ? sd + ' 방향, ' : ''}${tg ? tg + ' ' : ''}출구입니다`;
    }
    case 'fork':
      return `${noun}갈림길에서 ${target && s.toward ? s.toward + ' 방면, ' : ''}${sd ? sd : '직진'} 방향입니다`;
    case 'merge':
      return `${lead}${target && s.name ? s.name + ' ' : ''}${sd ? sd + ' 방향 ' : ''}합류입니다`;
    case 'roundabout':
      return `${noun}회전교차로에서 ${s.exit ? s.exit + '번째 출구' : '출구'}${target && tNoun ? ', ' + tNoun : ''}입니다`;
    case 'ferry':
      return `${lead}페리 탑승입니다`;
    case 'waypoint':
      return soon ? '잠시 후 경유지입니다' : `${dw} 앞에 경유지가 있습니다`;
    case 'arrive':
      return soon ? `잠시 후 목적지입니다${s.side ? '. 목적지는 ' + SIDE_KO[s.side] + '에 있습니다' : ''}` : `${dw} 앞에 목적지가 있습니다`;
    default:
      return `${lead}직진입니다`;
  }
}

// 화면 표시용: 큰 글씨(title) + 보조 줄(sub)
function showStep(s) {
  const side = sideOf(s), sd = side ? SIDE_KO[side] : '';
  const sub = s.toward ? `${s.toward} 방면` : (s.name || '');
  switch (s.kind) {
    case 'turn': case 'uturn': { const t = turnCore(s); return { title: (s.eor ? '도로 끝 ' : '') + t.short, sub }; }
    case 'ramp': return { title: (sd ? sd + ' ' : '') + '진입', sub: rampTarget(s) || sub };
    case 'exit': return { title: (sd ? sd + ' ' : '') + '출구', sub: exitTarget(s) || sub };
    case 'fork': return { title: sd ? sd + ' 길' : '갈림길 직진', sub };
    case 'merge': return { title: '합류', sub: s.name || sub };
    case 'roundabout': return { title: '회전교차로', sub: (s.exit ? s.exit + '번째 출구' : '') + (sub ? (s.exit ? ' · ' : '') + sub : '') };
    case 'ferry': return { title: '페리 탑승', sub };
    case 'waypoint': return { title: '경유지', sub: '' };
    case 'arrive': return { title: '목적지', sub: s.side ? SIDE_KO[s.side] + '에 있음' : '' };
    default: return { title: '직진', sub };
  }
}

// ── 회전 아이콘(SVG, 흰색 선) ──
function _head(x, y, a, size = 1) {
  const r = a * RAD, dx = Math.sin(r), dy = -Math.cos(r), px = Math.cos(r), py = Math.sin(r);
  const L = 20 * size, W = 15 * size;
  const bx = x - dx * L, by = y - dy * L;
  const f = v => v.toFixed(1);
  return `<path d="M${f(x)} ${f(y)}L${f(bx + px * W)} ${f(by + py * W)}L${f(bx - px * W)} ${f(by - py * W)}Z" fill="currentColor"/>`;
}
function _branch(a, len, from = [50, 54]) {
  const r = a * RAD;
  const tip = [from[0] + Math.sin(r) * len, from[1] - Math.cos(r) * len];
  const base = [tip[0] - Math.sin(r) * 16, tip[1] + Math.cos(r) * 16];
  return { tip, base };
}
function svgWrap(inner, size) {
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="11" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
function iconFor(s, size = 72) {
  const f = v => v.toFixed(1);
  const side = sideOf(s);
  const k = s.kind;
  if (k === 'arrive') {
    return svgWrap(`<path d="M30 92V12"/><path d="M34 14h44l-10 16 10 16H34z" fill="currentColor" stroke-width="6"/>`, size);
  }
  if (k === 'waypoint') {
    return svgWrap(`<path d="M50 90C50 90 24 60 24 40a26 26 0 0 1 52 0C76 60 50 90 50 90z" stroke-width="8"/><circle cx="50" cy="40" r="9" fill="currentColor" stroke="none"/>`, size);
  }
  if (k === 'ferry') {
    return svgWrap(`<path d="M16 62h68l-10 20H26z" fill="currentColor" stroke-width="6"/><path d="M50 18v40M50 20l24 30H50" stroke-width="8"/>`, size);
  }
  if (k === 'roundabout') {
    return svgWrap(`<circle cx="50" cy="40" r="19" stroke-width="9"/><path d="M50 92V60"/>` +
      `<text x="50" y="47" text-anchor="middle" font-size="22" font-weight="800" fill="currentColor" stroke="none" font-family="inherit">${s.exit || ''}</text>` +
      `<path d="M64 27L78 13" />${_head(82, 9, 45, 0.8)}`, size);
  }
  if (k === 'uturn' || (k === 'turn' && turnCore(s).uturn)) {
    return svgWrap(`<path d="M64 92V42a14 14 0 0 0-28 0v22"/>${_head(36, 82, 180)}`, size);
  }
  if (k === 'fork' || k === 'exit' || k === 'ramp') {
    const chosen = side === 'left' ? -38 : side === 'right' ? 38 : 0;
    const other = k === 'fork' ? (chosen === 0 ? 38 : -chosen) : 0;
    const c = _branch(chosen, 46), o = _branch(other, 46);
    const faint = (k === 'ramp' && chosen === 0) ? '' : `<path d="M50 54L${f(o.tip[0])} ${f(o.tip[1])}" opacity=".35"/>`;
    return svgWrap(`${faint}<path d="M50 92V54L${f(c.base[0])} ${f(c.base[1])}"/>${_head(c.tip[0], c.tip[1], chosen)}`, size);
  }
  if (k === 'merge') {
    const fromX = side === 'left' ? 80 : 20;
    return svgWrap(`<path d="M${fromX} 92Q${fromX} 62 50 50" opacity=".35"/><path d="M50 92V30"/>${_head(50, 12, 0)}`, size);
  }
  if (k === 'turn') {
    const t = turnCore(s);
    const a = clamp(t.a, -160, 160);
    const stemTop = Math.abs(a) > 110 ? 46 : 54;
    const b = _branch(a, Math.abs(a) > 110 ? 34 : 40, [50, stemTop]);
    return svgWrap(`<path d="M50 92V${stemTop}L${f(b.base[0])} ${f(b.base[1])}"/>${_head(b.tip[0], b.tip[1], a)}`, size);
  }
  return svgWrap(`<path d="M50 92V30"/>${_head(50, 12, 0)}`, size);
}
