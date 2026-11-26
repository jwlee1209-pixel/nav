const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  for (const args of [[], ['--enable-unsafe-swiftshader'], ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']]) {
    const b = await chromium.launch({ args });
    const p = await b.newPage();
    const js = fs.readFileSync(__dirname + '/../node_modules/maplibre-gl/dist/maplibre-gl.js', 'utf8');
    await p.setContent(`<div id=m style="width:400px;height:300px"></div><script>${js}<\/script><script>
      window.ok = 'none';
      try {
        const map = new maplibregl.Map({container:'m', style:{version:8,sources:{l:{type:'geojson',data:{type:'Feature',geometry:{type:'LineString',coordinates:[[126.97,37.56],[126.99,37.57]]}}}},layers:[{id:'bg',type:'background',paint:{'background-color':'#2a6'}},{id:'ln',type:'line',source:'l',paint:{'line-color':'#f00','line-width':8}}]}, center:[126.98,37.565], zoom:13});
        map.on('load', () => { window.ok = 'loaded'; });
        map.on('error', e => { window.ok = 'error ' + (e.error && e.error.message); });
      } catch (e) { window.ok = 'throw ' + e.message; }
    <\/script>`);
    await p.waitForTimeout(2500);
    console.log(JSON.stringify(args), await p.evaluate(() => window.ok));
    await p.screenshot({ path: `/tmp/claude-0/-home-claude/c83ad40a-ff27-5a55-ad16-4d806e11b32d/scratchpad/webgl-${args.length}.png` });
    await b.close();
  }
})();
