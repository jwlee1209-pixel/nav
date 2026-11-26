// ───────────────────────── 공통 도구 ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 작은 DOM 생성기. text 는 textContent 로만 넣는다(외부 데이터 안전).
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'svg') el.innerHTML = v;            // 앱 안에서 만든 고정 SVG 문자열 전용
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') el.style.cssText = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : String(c));
  }
  return el;
}

// 거리 표시: 1km 미만은 m, 이상은 km
function fmtDist(m) {
  if (m == null || !isFinite(m)) return { n: '-', u: '' };
  m = Math.max(0, m);
  if (m < 995) {
    const n = m < 100 ? Math.round(m / 5) * 5 : Math.round(m / 10) * 10;
    return { n: String(n), u: 'm' };
  }
  const km = m / 1000;
  return { n: km < 9.95 ? km.toFixed(1) : String(Math.round(km)), u: 'km' };
}
const fmtDistStr = m => { const d = fmtDist(m); return d.n + d.u; };

function fmtDur(sec) {
  const m = Math.round(sec / 60);
  if (m < 1) return '1분 미만';
  if (m < 60) return m + '분';
  const hh = Math.floor(m / 60), mm = m % 60;
  return hh + '시간' + (mm ? ' ' + mm + '분' : '');
}

function fmtClock(ts) {
  const d = new Date(ts);
  let hr = d.getHours();
  const ap = hr < 12 ? '오전' : '오후';
  hr = hr % 12 || 12;
  return `${ap} ${hr}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function fmtWon(n) {
  return (Math.round(n / 10) * 10).toLocaleString('ko-KR') + '원';
}

// 한국어 조사: 받침 여부에 따라 을/를, 이/가, 은/는, 으로/로 등
function lastHangulJong(word) {
  const s = String(word).trim();
  const c = s.charCodeAt(s.length - 1);
  if (c >= 0xAC00 && c <= 0xD7A3) return (c - 0xAC00) % 28;
  const ch = s.slice(-1);
  if (/[0-9]/.test(ch)) return '013678'.includes(ch) ? (ch === '1' || ch === '7' || ch === '8' ? 8 : 1) : 0;
  if (/[a-zA-Z]/.test(ch)) return /[lmnr]/i.test(ch) ? (ch.toLowerCase() === 'l' ? 8 : 4) : 0;
  return 0;
}
function josa(word, pair) {
  const [a, b] = pair.split('/');
  const j = lastHangulJong(word);
  if (pair === '으로/로') return word + (j === 0 || j === 8 ? '로' : '으로');
  return word + (j ? a : b);
}

// 시간 초과·취소를 지원하는 JSON 요청
async function fetchJSON(url, { timeout = 12000, signal } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  const relay = () => ctl.abort();
  if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', relay); }
  try {
    let res;
    try {
      res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    } catch (e) {
      const err = new Error(signal && signal.aborted ? 'aborted' : (ctl.signal.aborted ? 'timeout' : 'network'));
      err.kind = err.message;
      throw err;
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* 아래에서 처리 */ }
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status);
      err.kind = 'http'; err.status = res.status; err.data = data;
      throw err;
    }
    if (data == null) { const err = new Error('bad-json'); err.kind = 'bad-json'; throw err; }
    return data;
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', relay);
  }
}

// 같은 서비스로 가는 요청 사이에 최소 간격을 둔다(무료 서버 이용 정책: 초당 1회 이하)
function pacer(minGap) {
  let last = 0, chain = Promise.resolve();
  return fn => {
    const run = chain.then(async () => {
      const wait = last + minGap - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    chain = run.catch(() => {});
    return run.then(fn);
  };
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
