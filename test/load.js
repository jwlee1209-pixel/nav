// 브라우저용 소스 파일들을 Node vm 에서 불러와 순수 함수만 시험한다
const fs = require('fs'), path = require('path'), vm = require('vm');
module.exports = function load(names, extra = {}) {
  const dir = path.join(__dirname, '..', 'src', 'js');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort();
  const pick = files.filter(f => names.some(n => f.includes(n)));
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math, URL, performance: { now: () => Date.now() }, localStorage: { getItem() { return null; }, setItem() {} }, ...extra });
  const src = pick.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n;\n');
  const exportsList = ['hav','brg','angDiff','offsetPt','decodePolyline','encodePolyline','cumDist','locate','pointAt','sliceLine','projSeg','normValhalla','normOsrm','finalizeRoute','sayStep','showStep','turnCore','distWords','iconFor','Guide','Sim','josa','fmtDist','fmtDur','etaFactor','suggestions','store','timeBand','sunAltitude','isNightAt','photonToPlace','nominatimToPlace','looksLikeAddress','clockOf'];
  vm.runInContext(src + '\n;globalThis.__x = {' + exportsList.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(',') + '};', ctx);
  return ctx.__x;
};
