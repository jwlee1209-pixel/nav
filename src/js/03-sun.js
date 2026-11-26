// ───────────────────────── 해 고도(주간·야간 자동 전환) ─────────────────────────
function sunAltitude(date, lat, lon) {
  const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0;     // J2000 기준 일수
  const g = (357.529 + 0.98560028 * d) * RAD;                        // 평균 근점 이각
  const q = 280.459 + 0.98564736 * d;                                // 평균 황경
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = ((18.697374558 + 24.06570982441908 * d) % 24) * 15;    // 도
  const H = (gmst + lon) * RAD - ra;
  const la = lat * RAD;
  return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(H)) / RAD;
}

// 현재 해 고도로 주간/야간 판단(경계에서 깜빡이지 않도록 여유를 둔다)
function isNightAt(date, lat, lon, wasNight) {
  const alt = sunAltitude(date, lat, lon);
  if (wasNight == null) return alt < -0.8;
  return wasNight ? alt < 0.5 : alt < -1.5;
}
