// ───────────────────────── 지도 스타일(OpenFreeMap 벡터 타일, 한국어 이름) ─────────────────────────
// 타일 스키마: OpenMapTiles. 주간·야간 팔레트를 같은 레이어 구조에 입힌다.
const OFM_TILES = 'https://tiles.openfreemap.org/planet';
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const PAL = {
  day: {
    bg: '#ECEFF2', resid: '#E6E9ED', park: '#D3E8CF', wood: '#C9E0C2', grass: '#DCEBD3', sand: '#EFE7D2',
    water: '#A9CBEA', waterLine: '#93BCE1', bld: '#DCDFE5', bldLine: '#CBD0D8',
    minor: '#FFFFFF', minorCase: '#CDD3DB', major: '#FFFFFF', majorCase: '#BCC4CF',
    trunk: '#FFE6A6', trunkCase: '#DDB463', mway: '#FFC452', mwayCase: '#C98A1E',
    tunnel: '#F4F5F7', tunnelCase: '#C3C9D2', rail: '#B3BAC5', oneway: '#9AA3B0', boundary: '#9C93BE',
    label: '#2A303A', halo: '#FFFFFF', roadLabel: '#46505F', placeLabel: '#141A22', poiLabel: '#5D6675', waterLabel: '#356A9C',
    route: '#2A62F4', routeCase: '#1636A0', alt: '#9FB0CF', altCase: '#71839F', arrow: '#FFFFFF',
    acc: 'rgba(42,98,244,0.12)', ptHome: '#0B5CAD', ptWork: '#0E7A4C', ptFav: '#D9822B', ptHalo: '#FFFFFF',
  },
  night: {
    bg: '#0F151C', resid: '#121921', park: '#12231B', wood: '#10201A', grass: '#131F1A', sand: '#1B1A16',
    water: '#0A1F33', waterLine: '#0D2A45', bld: '#18202A', bldLine: '#202A36',
    minor: '#252E39', minorCase: '#141A22', major: '#313C49', majorCase: '#161D26',
    trunk: '#5A4720', trunkCase: '#2B220F', mway: '#8C6420', mwayCase: '#3A290B',
    tunnel: '#1B232C', tunnelCase: '#2C3742', rail: '#36404C', oneway: '#56616E', boundary: '#5B5579',
    label: '#C7D1DD', halo: '#0A0F14', roadLabel: '#9CA9B8', placeLabel: '#E4EAF0', poiLabel: '#8693A3', waterLabel: '#6A98C6',
    route: '#4D8BFF', routeCase: '#0C2A6E', alt: '#3B4A63', altCase: '#1E2737', arrow: '#FFFFFF',
    acc: 'rgba(77,139,255,0.16)', ptHome: '#4F9BEB', ptWork: '#3DBB86', ptFav: '#F0A04B', ptHalo: '#0A0F14',
  },
};

const KO_NAME = ['coalesce', ['get', 'name:ko'], ['get', 'name_ko'], ['get', 'name']];
const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'service'];
const ZS = [6, 10, 13, 16, 19];
const W_FILL = { motorway: [0.9, 2.2, 4.6, 11, 30], trunk: [0.7, 1.8, 4, 10, 28], primary: [0.4, 1.2, 3.2, 9, 26], secondary: [0.3, 0.9, 2.6, 8, 22], tertiary: [0, 0.6, 2, 6.5, 18], minor: [0, 0, 1.2, 5, 15], service: [0, 0, 0.5, 2.6, 9] };
const W_CASE = { motorway: [1.6, 3.4, 6.2, 13.6, 34], trunk: [1.3, 2.8, 5.5, 12.6, 32], primary: [0.8, 2, 4.6, 11.4, 30], secondary: [0.6, 1.6, 3.9, 10.2, 26], tertiary: [0, 1.1, 3.2, 8.6, 22], minor: [0, 0, 2.2, 7, 18.5], service: [0, 0, 1, 4, 11.5] };

function roadWidth(T) {
  const stops = [];
  ZS.forEach((z, i) => stops.push(z, ['case', ['==', ['get', 'ramp'], 1], T.secondary[i] * 0.85,
    ['match', ['get', 'class'], 'motorway', T.motorway[i], 'trunk', T.trunk[i], 'primary', T.primary[i], 'secondary', T.secondary[i], 'tertiary', T.tertiary[i], 'minor', T.minor[i], 'service', T.service[i], 0]]));
  return ['interpolate', ['exponential', 1.5], ['zoom'], ...stops];
}
const roadColor = (P, kind) => ['match', ['get', 'class'],
  'motorway', P[kind === 'case' ? 'mwayCase' : 'mway'], 'trunk', P[kind === 'case' ? 'trunkCase' : 'trunk'],
  ['primary', 'secondary', 'tertiary'], P[kind === 'case' ? 'majorCase' : 'major'], P[kind === 'case' ? 'minorCase' : 'minor']];
const ROAD_SORT = ['match', ['get', 'class'], 'motorway', 7, 'trunk', 6, 'primary', 5, 'secondary', 4, 'tertiary', 3, 'minor', 2, 1];
const isRoad = ['match', ['get', 'class'], ROAD_CLASSES, true, false];
const brunnel = v => ['==', ['coalesce', ['get', 'brunnel'], ''], v];

function mapLayers(P) {
  const T = 'transportation';
  const roadLayer = (id, filter, kind, extra = {}) => ({
    id, type: 'line', source: 'omt', 'source-layer': T, filter,
    layout: { 'line-cap': kind === 'case' ? 'butt' : 'round', 'line-join': 'round', 'line-sort-key': ROAD_SORT },
    paint: { 'line-color': roadColor(P, kind), 'line-width': roadWidth(kind === 'case' ? W_CASE : W_FILL), ...extra },
  });
  const text = (size, color = P.label, halo = 1.6) => ({ 'text-color': color, 'text-halo-color': P.halo, 'text-halo-width': halo, 'text-halo-blur': 0.4 });
  return [
    { id: 'bg', type: 'background', paint: { 'background-color': P.bg } },
    { id: 'landuse-resid', type: 'fill', source: 'omt', 'source-layer': 'landuse', filter: ['match', ['get', 'class'], ['residential', 'suburb', 'neighbourhood', 'quarter'], true, false], paint: { 'fill-color': P.resid } },
    { id: 'landcover-wood', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': P.wood, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 0.9] } },
    { id: 'landcover-grass', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['match', ['get', 'class'], ['grass', 'farmland', 'wetland'], true, false], paint: { 'fill-color': P.grass, 'fill-opacity': 0.7 } },
    { id: 'landcover-sand', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'sand'], paint: { 'fill-color': P.sand } },
    { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': P.park, 'fill-opacity': 0.8 } },
    { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', filter: ['!=', ['get', 'class'], 'swimming_pool'], paint: { 'fill-color': P.water } },
    { id: 'waterway', type: 'line', source: 'omt', 'source-layer': 'waterway', paint: { 'line-color': P.waterLine, 'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 8, 0.5, 14, 2, 18, 6] } },
    { id: 'building', type: 'fill', source: 'omt', 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': P.bld, 'fill-outline-color': P.bldLine, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 16, 1] } },
    // 터널(흐리게)
    { id: 'tunnel-case', type: 'line', source: 'omt', 'source-layer': T, filter: ['all', isRoad, brunnel('tunnel')], layout: { 'line-join': 'round', 'line-sort-key': ROAD_SORT }, paint: { 'line-color': P.tunnelCase, 'line-width': roadWidth(W_CASE), 'line-dasharray': [0.6, 0.4] } },
    { id: 'tunnel-fill', type: 'line', source: 'omt', 'source-layer': T, filter: ['all', isRoad, brunnel('tunnel')], layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ROAD_SORT }, paint: { 'line-color': P.tunnel, 'line-width': roadWidth(W_FILL) } },
    // 일반 도로
    roadLayer('road-case', ['all', isRoad, ['!', ['match', ['coalesce', ['get', 'brunnel'], ''], ['tunnel', 'bridge'], true, false]]], 'case'),
    roadLayer('road-fill', ['all', isRoad, ['!', ['match', ['coalesce', ['get', 'brunnel'], ''], ['tunnel', 'bridge'], true, false]]], 'fill'),
    { id: 'rail', type: 'line', source: 'omt', 'source-layer': T, minzoom: 11, filter: ['match', ['get', 'class'], ['rail', 'transit'], true, false], paint: { 'line-color': P.rail, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.6, 16, 2], 'line-dasharray': [3, 2] } },
    // 다리(위에 다시 그림)
    roadLayer('bridge-case', ['all', isRoad, brunnel('bridge')], 'case'),
    roadLayer('bridge-fill', ['all', isRoad, brunnel('bridge')], 'fill'),
    { id: 'oneway', type: 'symbol', source: 'omt', 'source-layer': T, minzoom: 16, filter: ['all', isRoad, ['match', ['get', 'oneway'], [1, -1], true, false]],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 140, 'text-field': ['case', ['==', ['get', 'oneway'], -1], '‹', '›'], 'text-font': ['Noto Sans Bold'], 'text-size': 15, 'text-keep-upright': false, 'text-rotation-alignment': 'map', 'text-allow-overlap': true },
      paint: { 'text-color': P.oneway } },
    { id: 'boundary', type: 'line', source: 'omt', 'source-layer': 'boundary', filter: ['all', ['<=', ['coalesce', ['get', 'admin_level'], 99], 4], ['!=', ['coalesce', ['get', 'maritime'], 0], 1]], paint: { 'line-color': P.boundary, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 12, 1.4], 'line-dasharray': [3, 2] } },
    // 경로(대안 → 선택 → 다음 회전 화살표)
    { id: 'alt-case', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], false], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': P.altCase, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6, 14, 11, 18, 20] } },
    { id: 'alt', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], false], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': P.alt, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 14, 7, 18, 14] } },
    { id: 'route-case', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], true], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': P.routeCase, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 7, 14, 13, 18, 26] } },
    { id: 'route', type: 'line', source: 'routes', filter: ['==', ['get', 'sel'], true], layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': P.route, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4.5, 14, 9, 18, 19] } },
    { id: 'turn-case', type: 'line', source: 'turn', filter: ['==', ['geometry-type'], 'LineString'], minzoom: 13, layout: { 'line-join': 'round', 'line-cap': 'butt' }, paint: { 'line-color': P.routeCase, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 9, 18, 22] } },
    { id: 'turn-line', type: 'line', source: 'turn', filter: ['==', ['geometry-type'], 'LineString'], minzoom: 13, layout: { 'line-join': 'round', 'line-cap': 'butt' }, paint: { 'line-color': P.arrow, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 5, 18, 14] } },
    { id: 'turn-head', type: 'symbol', source: 'turn', filter: ['==', ['geometry-type'], 'Point'], minzoom: 13,
      layout: { 'icon-image': 'nv-head', 'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.45, 18, 1.1], 'icon-rotate': ['get', 'b'], 'icon-rotation-alignment': 'map', 'icon-pitch-alignment': 'map', 'icon-allow-overlap': true, 'icon-ignore-placement': true } },
    { id: 'me-acc', type: 'fill', source: 'acc', paint: { 'fill-color': P.acc } },
    // 글자
    { id: 'water-label', type: 'symbol', source: 'omt', 'source-layer': 'water_name', layout: { 'text-field': KO_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-max-width': 8 }, paint: text(12, P.waterLabel) },
    { id: 'road-label', type: 'symbol', source: 'omt', 'source-layer': 'transportation_name', minzoom: 12,
      filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false],
      layout: { 'symbol-placement': 'line', 'text-field': KO_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 17, 14], 'symbol-spacing': 320, 'text-padding': 4 },
      paint: text(12, P.roadLabel, 1.8) },
    { id: 'poi-label', type: 'symbol', source: 'omt', 'source-layer': 'poi', minzoom: 16, filter: ['<=', ['coalesce', ['get', 'rank'], 99], 14],
      layout: { 'text-field': KO_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': 11.5, 'text-max-width': 8, 'text-padding': 6 },
      paint: text(11, P.poiLabel, 1.4) },
    { id: 'place-small', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 11, filter: ['match', ['get', 'class'], ['suburb', 'quarter', 'neighbourhood', 'village', 'hamlet'], true, false],
      layout: { 'text-field': KO_NAME, 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 14], 'text-max-width': 7 },
      paint: text(12, P.label, 1.6) },
    { id: 'place-town', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 7, filter: ['==', ['get', 'class'], 'town'],
      layout: { 'text-field': KO_NAME, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 7, 11, 13, 15] },
      paint: text(13, P.placeLabel, 1.8) },
    { id: 'place-city', type: 'symbol', source: 'omt', 'source-layer': 'place', minzoom: 4, filter: ['==', ['get', 'class'], 'city'],
      layout: { 'text-field': KO_NAME, 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 4, ['case', ['<=', ['coalesce', ['get', 'rank'], 9], 2], 13, 11], 10, ['case', ['<=', ['coalesce', ['get', 'rank'], 9], 2], 20, 16]] },
      paint: text(15, P.placeLabel, 2) },
    // 내 장소(집·회사·즐겨찾기)
    { id: 'pts-dot', type: 'circle', source: 'pts', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 15, 7], 'circle-color': ['match', ['get', 'kind'], 'home', P.ptHome, 'work', P.ptWork, P.ptFav], 'circle-stroke-color': P.ptHalo, 'circle-stroke-width': 2 } },
    { id: 'pts-label', type: 'symbol', source: 'pts', minzoom: 11, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top', 'text-max-width': 8 },
      paint: { 'text-color': ['match', ['get', 'kind'], 'home', P.ptHome, 'work', P.ptWork, P.ptFav], 'text-halo-color': P.ptHalo, 'text-halo-width': 1.8 } },
    // 검색 결과 번호
    { id: 'hits-dot', type: 'circle', source: 'hits', paint: { 'circle-radius': 11, 'circle-color': P.route, 'circle-stroke-color': P.ptHalo, 'circle-stroke-width': 2.5 } },
    { id: 'hits-num', type: 'symbol', source: 'hits', layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#FFFFFF' } },
  ];
}

function buildStyle(theme) {
  const P = PAL[theme] || PAL.day;
  const empty = { type: 'FeatureCollection', features: [] };
  return {
    version: 8,
    glyphs: OFM_GLYPHS,
    sources: {
      omt: { type: 'vector', url: OFM_TILES },
      routes: { type: 'geojson', data: empty },
      turn: { type: 'geojson', data: empty },
      acc: { type: 'geojson', data: empty },
      pts: { type: 'geojson', data: empty },
      hits: { type: 'geojson', data: empty },
    },
    layers: mapLayers(P),
  };
}
