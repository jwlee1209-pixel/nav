// ───────────────────────── 경로 탐색(무료 OSM 경로 엔진) ─────────────────────────
// FOSSGIS 가 운영하는 공개 서버(초당 1회 이하, 가벼운 개인 사용)
const ROUTE_ENGINES = {
  valhalla: { label: 'Valhalla', base: 'https://valhalla1.openstreetmap.de/route' },
  osrm: { label: 'OSRM', base: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/' },
};
const PREF_KO = { fast: '추천', short: '최단거리', free: '무료도로', nohwy: '고속도로 회피' };
const routePace = pacer(1100);

const VOICE_KINDS = new Set(['turn', 'uturn', 'ramp', 'exit', 'fork', 'merge', 'roundabout', 'ferry', 'waypoint', 'arrive']);

async function findRoutes(points, { pref = 'fast', heading = null, engine = 'auto', signal, noFallback = false } = {}) {
  let order = engine === 'osrm' ? ['osrm', 'valhalla'] : ['valhalla', 'osrm'];
  if (noFallback) order = order.slice(0, 1);
  const errs = [];
  for (const eng of order) {
    try {
      const r = eng === 'valhalla' ? await viaValhalla(points, pref, heading, signal) : await viaOsrm(points, pref, heading, signal);
      if (r.routes.length) {
        if (errs.length) r.warn = (r.warn ? r.warn + ' ' : '') + `${ROUTE_ENGINES[order[0]].label} 서버가 응답하지 않아 ${josa(ROUTE_ENGINES[eng].label, '으로/로')} 찾았습니다.`;
        return r;
      }
      errs.push({ eng, msg: 'no-route' });
    } catch (e) {
      if (signal && signal.aborted) throw e;
      errs.push({ eng, msg: e.message, status: e.status, data: e.data });
    }
  }
  const err = new Error('route-failed');
  err.detail = errs;
  err.noPath = errs.some(e => e.status === 400 || e.msg === 'no-route' || (e.data && /NoRoute|No path/i.test(JSON.stringify(e.data))));
  throw err;
}

// ── Valhalla ──
async function viaValhalla(points, pref, heading, signal) {
  const auto = {};
  if (pref === 'short') auto.shortest = true;
  if (pref === 'free') auto.use_tolls = 0;
  if (pref === 'nohwy') auto.use_highways = 0;
  // 운전하기 쉬운 길: 길 이름이 바뀔 때(회전)마다 비용을 크게 매기고, 이면도로·생활도로·서비스도로를 피한다
  if (pref === 'easy') Object.assign(auto, { maneuver_penalty: 45, service_penalty: 60, service_factor: 2, use_living_streets: 0, use_tracks: 0 });
  const locations = points.map((p, i) => {
    const o = { lat: +(+p.lat).toFixed(6), lon: +(+p.lon).toFixed(6), type: 'break' };
    if (i === 0 && heading != null) { o.heading = Math.round(heading) % 360; o.heading_tolerance = 50; }
    return o;
  });
  const req = { locations, costing: 'auto', costing_options: { auto }, units: 'kilometers', language: 'en-US', directions_type: 'maneuvers', alternates: points.length === 2 && pref !== 'easy' ? 2 : 0 };
  const url = ROUTE_ENGINES.valhalla.base + '?json=' + encodeURIComponent(JSON.stringify(req));
  const data = await routePace(() => fetchJSON(url, { timeout: 15000, signal }));
  const trips = [data.trip, ...(data.alternates || []).map(a => a && a.trip)].filter(Boolean);
  const routes = trips.map((t, k) => normValhalla(t, k)).filter(Boolean);
  if (pref === 'short') routes.sort((a, b) => a.distance - b.distance);
  return { engine: 'valhalla', routes };
}

const VAL_TYPE = {
  1: ['depart'], 2: ['depart', 'right'], 3: ['depart', 'left'],
  4: ['arrive'], 5: ['arrive', 'right'], 6: ['arrive', 'left'],
  7: ['name'], 8: ['continue'],
  9: ['turn', 'slight right'], 10: ['turn', 'right'], 11: ['turn', 'sharp right'],
  12: ['uturn', 'right'], 13: ['uturn', 'left'],
  14: ['turn', 'sharp left'], 15: ['turn', 'left'], 16: ['turn', 'slight left'],
  17: ['ramp', 'straight'], 18: ['ramp', 'right'], 19: ['ramp', 'left'],
  20: ['exit', 'right'], 21: ['exit', 'left'],
  22: ['fork', 'straight'], 23: ['fork', 'right'], 24: ['fork', 'left'],
  25: ['merge', 'straight'], 26: ['roundabout'], 27: ['rbexit'],
  28: ['ferry'], 29: ['ferryexit'], 37: ['merge', 'right'], 38: ['merge', 'left'],
};

const signText = arr => (arr || []).map(x => x && x.text).filter(Boolean);

function normValhalla(trip, k) {
  const legs = trip.legs || [];
  if (!legs.length) return null;
  const coords = [], steps = [];
  legs.forEach((leg, li) => {
    const shape = decodePolyline(leg.shape || '', 6);
    if (!shape.length) return;
    let base;
    if (!coords.length) { base = 0; coords.push(...shape); }
    else { base = coords.length - 1; coords.push(...shape.slice(1)); }
    for (const m of leg.maneuvers || []) {
      const [kind0, mod] = VAL_TYPE[m.type] || ['continue'];
      let kind = kind0;
      if (kind === 'depart' && li > 0) kind = 'skip';
      if (kind === 'arrive' && li < legs.length - 1) kind = 'waypoint';
      const sign = m.sign || {};
      const toward = signText(sign.exit_toward_elements);
      const branch = signText(sign.exit_branch_elements);
      steps.push({
        idx: base + (m.begin_shape_index || 0), leg: li, kind, mod: mod || null,
        side: (kind === 'arrive' || kind === 'waypoint') ? (mod || null) : null,
        exit: m.roundabout_exit_count || null,
        name: (m.street_names || m.begin_street_names || [])[0] || '',
        toward: toward.length ? toward.slice(0, 2).join('·') : (branch.length ? branch.slice(0, 2).join('·') : ''),
        exitRef: signText(sign.exit_number_elements)[0] || '',
        exitName: signText(sign.exit_name_elements)[0] || '',
        hw: !!m.highway, toll: !!m.toll,
        len: (m.length || 0) * 1000, dur: m.time || 0,
      });
    }
  });
  const s = trip.summary || {};
  return finalizeRoute(coords, steps, {
    engine: 'valhalla', k,
    distance: (s.length || 0) * 1000, duration: s.time || 0,
    hasToll: !!s.has_toll, hasHwy: !!s.has_highway, hasFerry: !!s.has_ferry,
  });
}

// ── OSRM ──
async function viaOsrm(points, pref, heading, signal) {
  const coordStr = points.map(p => `${(+p.lon).toFixed(6)},${(+p.lat).toFixed(6)}`).join(';');
  const q = ['overview=false', 'steps=true', 'geometries=geojson', 'alternatives=' + (points.length === 2 ? '2' : 'false')];
  if (heading != null) q.push('bearings=' + [`${Math.round(heading) % 360},50`].concat(points.slice(1).map(() => '')).join(';'));
  const exclude = pref === 'free' ? 'toll' : pref === 'nohwy' ? 'motorway' : '';
  const url = ex => ROUTE_ENGINES.osrm.base + coordStr + '?' + q.concat(ex ? ['exclude=' + ex] : []).join('&');
  let data, warn = '';
  try {
    data = await routePace(() => fetchJSON(url(exclude), { timeout: 15000, signal }));
  } catch (e) {
    if (!exclude || (signal && signal.aborted) || e.status !== 400) throw e;
    data = await routePace(() => fetchJSON(url(''), { timeout: 15000, signal }));
    warn = `OSRM 서버가 '${PREF_KO[pref]}' 옵션을 지원하지 않아 기본 경로를 보여 줍니다.`;
  }
  if (data.code !== 'Ok') { const e = new Error(data.code || 'osrm'); e.data = data; e.status = 400; throw e; }
  const routes = (data.routes || []).map((r, k) => normOsrm(r, k)).filter(Boolean);
  if (pref === 'short') routes.sort((a, b) => a.distance - b.distance);
  return { engine: 'osrm', routes, warn };
}

function normOsrm(r, k) {
  const coords = [], steps = [];
  const legs = r.legs || [];
  let prevMode = 'driving';
  legs.forEach((leg, li) => {
    for (const s of leg.steps || []) {
      const sc = (s.geometry && s.geometry.coordinates) || [];
      if (!sc.length) continue;
      let idx;
      if (!coords.length) { idx = 0; coords.push(...sc); }
      else { idx = coords.length - 1; coords.push(...sc.slice(1)); }
      const m = s.maneuver || {};
      let mod = m.modifier || 'straight', kind = 'continue', eor = false, exit = null, side = null;
      switch (m.type) {
        case 'depart': kind = li === 0 ? 'depart' : 'skip'; break;
        case 'arrive':
          kind = li === legs.length - 1 ? 'arrive' : 'waypoint';
          side = /right/.test(mod) ? 'right' : /left/.test(mod) ? 'left' : null; break;
        case 'turn': case 'end of road': case 'roundabout turn': case 'continue':
          kind = mod === 'uturn' ? 'uturn' : mod === 'straight' ? 'continue' : 'turn';
          eor = m.type === 'end of road'; break;
        case 'new name': kind = 'name'; break;
        case 'merge': kind = 'merge'; break;
        case 'on ramp': kind = 'ramp'; break;
        case 'off ramp': kind = 'exit'; break;
        case 'fork': kind = 'fork'; break;
        case 'roundabout': case 'rotary': kind = 'roundabout'; exit = m.exit || null; break;
        case 'exit roundabout': case 'exit rotary': kind = 'rbexit'; break;
        default: kind = 'continue';
      }
      if (s.mode === 'ferry' && prevMode !== 'ferry') kind = 'ferry';
      prevMode = s.mode || 'driving';
      const cls = (s.intersections || []).flatMap(x => x.classes || []);
      let toward = s.destinations || '';
      if (toward.includes(':')) toward = toward.split(':').slice(1).join(':');
      toward = toward.split(',').map(t => t.trim()).filter(Boolean).slice(0, 2).join('·');
      steps.push({
        idx, leg: li, kind, mod, side, eor, exit,
        angle: (m.type === 'depart' || m.type === 'arrive') ? null : angDiff(m.bearing_before || 0, m.bearing_after || 0),
        name: s.name || (s.ref ? s.ref + '번 도로' : ''), ref: s.ref || '',
        toward, exitRef: s.exits || '', exitName: '',
        hw: cls.includes('motorway'), toll: cls.includes('toll'),
        len: s.distance || 0, dur: s.duration || 0,
      });
    }
  });
  if (coords.length < 2) return null;
  return finalizeRoute(coords, steps, {
    engine: 'osrm', k, distance: r.distance || 0, duration: r.duration || 0,
    hasToll: steps.some(s => s.toll), hasHwy: steps.some(s => s.hw), hasFerry: steps.some(s => s.kind === 'ferry'),
  });
}

// ── 공통 경로 모델 ──
function finalizeRoute(coords, steps, meta) {
  // 같은 점이 연속되면 정리하되, 단계의 좌표 번호는 다시 맞춘다
  const keep = [0], map = new Int32Array(coords.length);
  for (let i = 1; i < coords.length; i++) {
    const last = coords[keep[keep.length - 1]];
    if (Math.abs(coords[i][0] - last[0]) > 1e-7 || Math.abs(coords[i][1] - last[1]) > 1e-7) keep.push(i);
    map[i] = keep.length - 1;
  }
  const cc = keep.map(i => coords[i]);
  if (cc.length < 2) return null;
  const cum = cumDist(cc);
  const total = cum[cum.length - 1];
  // 경유지 뒤의 '출발' 단계는 버리되 소요 시간·거리는 앞 단계(경유지)에 합친다
  for (let i = 1; i < steps.length; i++) {
    if (steps[i].kind !== 'skip') continue;
    let j = i - 1; while (j > 0 && steps[j].kind === 'skip') j--;
    steps[j].dur = (steps[j].dur || 0) + (steps[i].dur || 0);
    steps[j].len = (steps[j].len || 0) + (steps[i].len || 0);
    if (!steps[j].hw) steps[j].hw = steps[i].hw;
  }
  steps = steps.filter(s => s.kind !== 'skip');
  let t = 0;
  for (const s of steps) {
    s.idx = map[Math.min(s.idx, map.length - 1)];
    s.at = cum[s.idx];
    s.loc = cc[s.idx];
    s.tAt = t; t += s.dur || 0;
    if (s.angle == null && s.kind !== 'depart' && s.kind !== 'arrive' && s.kind !== 'waypoint') {
      const before = pointAt(cc, cum, Math.max(0, s.at - 25)).p;
      const after = pointAt(cc, cum, Math.min(total, s.at + 25)).p;
      if (hav(before, s.loc) > 3 && hav(s.loc, after) > 3) s.angle = angDiff(brg(before, s.loc), brg(s.loc, after));
    }
    s.voice = VOICE_KINDS.has(s.kind);
  }
  // 도착 단계가 맨 끝에 오도록 보정
  const last = steps[steps.length - 1];
  if (!last || last.kind !== 'arrive') steps.push({ kind: 'arrive', idx: cc.length - 1, at: total, loc: cc[cc.length - 1], tAt: t, dur: 0, len: 0, voice: true, leg: 0, name: '' });
  for (let i = 0; i < steps.length; i++) {          // 각 단계의 실제 길이(다음 단계까지)
    const nx = steps[i + 1];
    steps[i].span = nx ? Math.max(0, nx.at - steps[i].at) : 0;
  }
  // 주요 경유 도로(길이 기준 상위 2개)
  const byName = new Map();
  for (const s of steps) if (s.name && s.span > 0) byName.set(s.name, (byName.get(s.name) || 0) + s.span);
  const roads = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
  return {
    id: meta.engine + '-' + meta.k + '-' + Date.now().toString(36),
    engine: meta.engine,
    coords: cc, cum, steps, roads,
    distance: meta.distance || total,
    duration: meta.duration || t,
    stepDur: t,
    hasToll: meta.hasToll, hasHwy: meta.hasHwy, hasFerry: meta.hasFerry,
  };
}

// ── 운전 난이도: 회전 수(좌회전·유턴 가중), 작은 길 비율 ──
function routeEase(r) {
  let turns = 0, left = 0, uturn = 0, w = 0, small = 0;
  for (const s of r.steps) {
    if (!s.voice || s.kind === 'arrive' || s.kind === 'waypoint') continue;
    let wt = 1;
    if (s.kind === 'uturn' || (s.kind === 'turn' && turnCore(s).uturn)) { wt = 2.5; uturn++; }
    else if (s.kind === 'turn') {
      const t = turnCore(s);
      if (t.clock) wt = 0.6;
      else if (sideOf(s) === 'left') { wt = 1.6; left++; }
      if (t.sharp) wt += 0.4;
    }
    else if (s.kind === 'roundabout') wt = 1.3;
    else if (s.kind === 'fork' || s.kind === 'ramp' || s.kind === 'exit') wt = 0.8;
    else if (s.kind === 'merge') wt = 0.7;
    turns++; w += wt;
  }
  // 경로 엔진이 시속 30km 미만으로 잡은 구간 = 골목·이면도로로 본다
  for (const s of r.steps) {
    const len = s.len || s.span || 0;
    if (len > 0 && s.dur > 0 && len / s.dur * 3.6 < 30) small += len;
  }
  const smallShare = r.distance > 0 ? clamp(small / r.distance, 0, 1) : 0;
  return { turns, left, uturn, smallShare, score: w + smallShare * 20 };
}

function sameRoute(a, b) {
  return Math.abs(a.distance - b.distance) < Math.max(40, a.distance * 0.01) && Math.abs(a.duration - b.duration) < Math.max(20, a.duration * 0.02);
}

// 후보 경로 정리: 내 기록으로 시간 다시 계산 → 가장 빠른 길·가장 쉬운 길 → 추천 결정
//  · '추천' 옵션에서, 가장 빠른 길이 쉬운 길보다 기준 시간(기본 10분) 이상 빠르지 않으면 쉬운 길을 추천
function rankRoutes(list, { pref = 'fast', easyPrefer = true, easyMin = 10, ts = Date.now() } = {}) {
  const uniq = [];
  for (const r of list) {
    const dup = uniq.find(u => sameRoute(u, r));
    if (dup) { if (r.easyReq) dup.easyReq = true; continue; }
    uniq.push(r);
  }
  for (const r of uniq) { r.p = personalize(r, ts); r.ease = routeEase(r); }
  if (!uniq.length) return { routes: [], rec: null };
  const fastest = uniq.reduce((a, b) => (b.p.dur < a.p.dur ? b : a));
  const easiest = uniq.reduce((a, b) => (b.ease.score < a.ease.score ? b : a));
  let rec = fastest, why = 'fast';
  const slower = (easiest.p.dur - fastest.p.dur) / 60;
  const gain = fastest.ease.score - easiest.ease.score;
  const meaningful = gain >= Math.max(2, fastest.ease.score * 0.2);
  if (pref === 'fast' && easyPrefer && easiest !== fastest && meaningful && slower < easyMin) { rec = easiest; why = 'easy'; }
  if (pref !== 'fast') { rec = uniq[0]; why = pref; }
  const rest = uniq.filter(r => r !== rec).sort((a, b) => a.p.dur - b.p.dur);
  const routes = [rec, ...rest].slice(0, 3);
  if (easiest !== rec && !routes.includes(easiest) && routes.length === 3) routes[2] = easiest;
  for (const r of routes) r.tags = [r === rec ? 'rec' : '', r === fastest ? 'fast' : '', r === easiest && easiest !== fastest ? 'easy' : ''].filter(Boolean);
  return {
    routes, rec,
    info: { why, slowerMin: slower, gain, fastest, easiest, easyMin, turnDiff: fastest.ease.turns - easiest.ease.turns },
  };
}
