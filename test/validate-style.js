const load = require('./load');
const { validateStyleMin } = require('@maplibre/maplibre-gl-style-spec');
const fs = require('fs'), path = require('path'), vm = require('vm');
const src = ['00-util.js', '01-geo.js', '10-mapstyle.js'].map(f => fs.readFileSync(path.join(__dirname, '../src/js', f), 'utf8')).join('\n');
const ctx = vm.createContext({});
vm.runInContext(src + ';globalThis.__b = buildStyle;', ctx);
for (const th of ['day', 'night']) {
  const st = JSON.parse(JSON.stringify(ctx.__b(th)));
  st.sources.omt = { type: 'vector', tiles: ['https://x/{z}/{x}/{y}.pbf'] };
  const errs = validateStyleMin(st);
  console.log(th, errs.length ? errs.map(e => e.message) : 'OK', st.layers.length + ' layers');
}
