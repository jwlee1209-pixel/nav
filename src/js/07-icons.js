// ───────────────────────── 아이콘(선 그림) ─────────────────────────
const ICON = {
  open: '<path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 7V5a2 2 0 0 1 2-2h4l2 2"/>',
  save: '<path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v5h8V3M7 21v-7h10v7"/>',
  saveas: '<path d="M5 3h9l3 3v5"/><path d="M3 5v14a2 2 0 0 0 2 2h7"/><path d="M7 3v4h6"/><path d="M15 21l6-6-2-2-6 6v2z"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  text: '<path d="M4 6V4h16v2M9 20h6M12 4v16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  shape: '<rect x="3" y="11" width="9" height="9" rx="1"/><circle cx="16" cy="8" r="5"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M9 4v16M15 4v16"/>',
  pdf: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 14h6M9 17h4"/>',
  play: '<path d="M7 4v16l13-8z" fill="currentColor" stroke="none"/>',
  grow: '<path d="M4 18 9 6l5 12M5.6 14h6.8"/><path d="M18 5v6M15 8h6"/>',
  shrink: '<path d="M4 18 9 6l5 12M5.6 14h6.8"/><path d="M15 8h6"/>',
  alignL: '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
  alignC: '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>',
  alignR: '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>',
  alignJ: '<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>',
  bullet: '<circle cx="5" cy="7" r="1.3" fill="currentColor"/><circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="5" cy="17" r="1.3" fill="currentColor"/><path d="M9 7h11M9 12h11M9 17h11"/>',
  number: '<path d="M4 5h1.5v4M4 9h3M4 13.5a1.5 1.5 0 0 1 3 .2c0 1-3 2.3-3 3.3h3" /><path d="M10 7h10M10 12h10M10 17h10"/>',
  front: '<rect x="8" y="8" width="12" height="12" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M4 16V5a1 1 0 0 1 1-1h11"/>',
  back: '<rect x="4" y="4" width="12" height="12" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M20 8v11a1 1 0 0 1-1 1H8"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  del: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',
  zin: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6M11 8v6"/>',
  zout: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4M8 11h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const icon = (name, label) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>${label ? `<span>${label}</span>` : ''}`;

// 도형 메뉴(넣을 수 있는 모양)
const INSERT_SHAPES = [
  ['rect', '사각형'], ['roundRect', '둥근 사각형'], ['ellipse', '타원'], ['triangle', '삼각형'], ['rtTriangle', '직각 삼각형'], ['diamond', '마름모'],
  ['parallelogram', '평행 사변형'], ['trapezoid', '사다리꼴'], ['pentagon', '오각형'], ['hexagon', '육각형'], ['octagon', '팔각형'], ['plus', '십자형'],
  ['star5', '별'], ['star4', '별(4)'], ['heart', '하트'], ['lightningBolt', '번개'], ['cloud', '구름'], ['donut', '도넛'],
  ['rightArrow', '오른쪽 화살표'], ['leftArrow', '왼쪽 화살표'], ['upArrow', '위쪽 화살표'], ['downArrow', '아래쪽 화살표'], ['leftRightArrow', '양쪽 화살표'], ['chevron', '갈매기형'],
  ['homePlate', '오각형 화살표'], ['wedgeRectCallout', '말풍선'], ['wedgeRoundRectCallout', '둥근 말풍선'], ['wedgeEllipseCallout', '타원 말풍선'], ['flowChartDecision', '판단'], ['can', '원통'],
  ['line', '선'], ['arrowLine', '화살표 선'],
];
function shapeIcon(prst) {
  const g = prst === 'arrowLine' ? { paths: [{ d: 'M2,18 L24,4', fill: false, stroke: true }], line: true } : presetPaths(prst, 26, 20, {});
  const d = g.paths.map(p => `<path d="${p.d}" fill="${p.fill ? 'currentColor' : 'none'}" fill-opacity=".18" stroke="currentColor" stroke-width="1.3"/>`).join('');
  return `<svg viewBox="-1 -1 28 22">${d}${prst === 'arrowLine' ? '<path d="M24,4 l-6,1 3,4 z" fill="currentColor"/>' : ''}</svg>`;
}
