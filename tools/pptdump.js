// .ppt 구조 보기(개발용): node tools/pptdump.js 파일.ppt
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../src/js/13-ppt.js', 'utf8');
const mod = new Function('MIME', 'Deck', 'b64bytes', 'S', 'NS', src + '; return { cfbOpen, PptStream, pptShape, MSOSPT, pptOpt };')({}, null, null, {}, { a: '', r: '', p: '' });
const buf = fs.readFileSync(process.argv[2]);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
const cfb = mod.cfbOpen(ab);
const D = new mod.PptStream(cfb.read('PowerPoint Document'));
const names = { 0x03E8: 'Document', 0x03EE: 'Slide', 0x03F8: 'MainMaster', 0x03F0: 'Notes', 0x0FF0: 'SlideListWithText', 0x040C: 'Drawing', 0xF002: 'DgContainer', 0xF003: 'SpgrContainer', 0xF004: 'SpContainer', 0x0FF5: 'UserEdit', 0x1772: 'PersistDir', 0x03F2: 'Environment', 0x040B: 'DrawingGroup' };
function walk(r, depth, maxDepth) {
  for (const c of D.kids(r)) {
    if (c.type === 0xF004) {
      const sh = mod.pptShape(D, c);
      const props = [...sh.opt].map(([k, v]) => k.toString(16) + '=' + (v.data ? `[${v.data.length}b]` : '0x' + (v.v >>> 0).toString(16))).join(' ');
      console.log(' '.repeat(depth * 2) + `SP type=${sh.type}(${mod.MSOSPT[sh.type] || '?'}) flags=0x${sh.flags.toString(16)} anchor=${JSON.stringify(sh.anchor || sh.child)} ph=${sh.ph ? sh.ph.id : '-'} tb=${sh.textbox ? 'y' : 'n'} ${props}`);
      continue;
    }
    console.log(' '.repeat(depth * 2) + `${(names[c.type] || '0x' + c.type.toString(16))} inst=${c.inst} len=${c.len}`);
    if (c.ver === 0xF && depth < maxDepth) walk(c, depth + 1, maxDepth);
  }
}
const top = { body: 0, len: D.u8.length };
walk(top, 0, +(process.argv[3] || 6));
