// ───────────────────────── .pptx 꾸러미(zip) 읽기·쓰기 ─────────────────────────
// XML 부분은 처음에 모두 DOM 으로 읽어 두고, 편집은 이 DOM 을 바로 고친다. 저장할 때 다시 글로 바꿔 zip 에 넣는다.
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', jpe: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/x-emf', wmf: 'image/x-wmf', webp: 'image/webp', wdp: 'image/vnd.ms-photo', jfif: 'image/jpeg' };
const extOf = p => (p.match(/\.([a-z0-9]+)$/i) || [])[1]?.toLowerCase() || '';
const mimeOf = p => MIME[extOf(p)] || 'application/octet-stream';
const dirOf = p => p.slice(0, p.lastIndexOf('/'));

// 상대 경로 풀기: base 폴더 기준 '../media/a.png' → 'ppt/media/a.png'
function resolvePath(baseDir, target) {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseDir ? baseDir.split('/') : [];
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.' && seg !== '') parts.push(seg);
  }
  return parts.join('/');
}
// fromDir 에서 to 로 가는 상대 경로
function relativePath(fromDir, to) {
  const a = fromDir ? fromDir.split('/') : [], b = to.split('/');
  let i = 0;
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++;
  return '../'.repeat(a.length - i) + b.slice(i).join('/');
}

class Pkg {
  constructor(zip) {
    this.zip = zip;
    this.xml = new Map();      // 경로 → XML Document
    this.bin = new Map();      // 새로 넣은 바이너리 부분(그림) 경로 → Uint8Array
    this.files = new Set();    // 원래 들어 있던 파일
    this.removed = new Set();  // 지운 부분
    this.urls = new Map();     // 그림 미리보기 주소
  }
  static async open(buf) {
    const zip = await JSZip.loadAsync(buf);
    const p = new Pkg(zip);
    for (const name of Object.keys(zip.files)) {
      if (zip.files[name].dir) continue;
      p.files.add(name);
      if (/\.(xml|rels)$/i.test(name)) {
        const d = parseXML(await zip.file(name).async('string'));
        if (!d.getElementsByTagName('parsererror').length) p.xml.set(name, d);
      }
    }
    return p;
  }
  has(path) { return !this.removed.has(path) && (this.xml.has(path) || this.bin.has(path) || this.files.has(path)); }
  doc(path) { return this.removed.has(path) ? null : this.xml.get(path) || null; }
  setDoc(path, doc) { this.xml.set(path, doc); this.removed.delete(path); }
  setBin(path, bytes) { this.bin.set(path, bytes); this.removed.delete(path); this.urls.delete(path); }
  remove(path) { this.removed.add(path); this.xml.delete(path); this.bin.delete(path); }
  async bytes(path) {
    if (this.removed.has(path)) return null;
    if (this.bin.has(path)) return this.bin.get(path);
    const f = this.zip.file(path);
    return f ? f.async('uint8array') : null;
  }
  async url(path) {
    if (this.urls.has(path)) return this.urls.get(path);
    const b = await this.bytes(path);
    if (!b) return null;
    const u = URL.createObjectURL(new Blob([b], { type: mimeOf(path) }));
    this.urls.set(path, u);
    return u;
  }
  // 그림을 바로 그릴 수 있게 미리 주소를 만들어 둔다(그리기는 동기)
  async preloadImages() {
    const all = [...this.files, ...this.bin.keys()].filter(n => /^ppt\/(media|embeddings)\//.test(n) && /^image\//.test(mimeOf(n)));
    await Promise.all(all.map(n => this.url(n)));
  }
  urlNow(path) { return this.urls.get(path) || null; }

  relsPath(part) { const i = part.lastIndexOf('/'); return part.slice(0, i) + '/_rels/' + part.slice(i + 1) + '.rels'; }
  rels(part) {
    const d = this.doc(this.relsPath(part));
    if (!d) return [];
    return kids(d.documentElement, 'Relationship').map(e => ({
      id: e.getAttribute('Id'), type: e.getAttribute('Type'), mode: e.getAttribute('TargetMode'), raw: e.getAttribute('Target'),
      target: e.getAttribute('TargetMode') === 'External' ? e.getAttribute('Target') : resolvePath(dirOf(part), e.getAttribute('Target')), el: e,
    }));
  }
  rel(part, id) { return this.rels(part).find(r => r.id === id) || null; }
  relOfType(part, type) { return this.rels(part).find(r => r.type === type) || null; }
  addRel(part, type, target, external = false) {
    const rp = this.relsPath(part);
    let d = this.doc(rp);
    if (!d) { d = parseXML(`<Relationships xmlns="${NS.rel}"/>`); this.setDoc(rp, d); }
    const used = new Set(kids(d.documentElement, 'Relationship').map(e => e.getAttribute('Id')));
    let n = used.size + 1; while (used.has('rId' + n)) n++;
    const e = d.createElementNS(NS.rel, 'Relationship');
    e.setAttribute('Id', 'rId' + n); e.setAttribute('Type', type);
    e.setAttribute('Target', external ? target : relativePath(dirOf(part), target));
    if (external) e.setAttribute('TargetMode', 'External');
    d.documentElement.appendChild(e);
    return 'rId' + n;
  }
  removeRel(part, id) { const r = this.rel(part, id); if (r) r.el.remove(); }

  // [Content_Types].xml
  get types() { return this.doc('[Content_Types].xml'); }
  ensureDefault(ext, mime) {
    const t = this.types.documentElement;
    if (kids(t, 'Default').some(e => (e.getAttribute('Extension') || '').toLowerCase() === ext)) return;
    const e = this.types.createElementNS(NS.ct, 'Default');
    e.setAttribute('Extension', ext); e.setAttribute('ContentType', mime);
    t.insertBefore(e, t.firstElementChild);
  }
  setOverride(path, mime) {
    const t = this.types.documentElement;
    const name = '/' + path;
    let e = kids(t, 'Override').find(x => x.getAttribute('PartName') === name);
    if (!e) { e = this.types.createElementNS(NS.ct, 'Override'); e.setAttribute('PartName', name); t.appendChild(e); }
    e.setAttribute('ContentType', mime);
  }
  removeOverride(path) { const e = kids(this.types.documentElement, 'Override').find(x => x.getAttribute('PartName') === '/' + path); if (e) e.remove(); }
  // 비어 있는 이름: ppt/slides/slide{n}.xml
  freeName(prefix, ext) {
    let n = 1;
    while (this.has(`${prefix}${n}.${ext}`)) n++;
    return `${prefix}${n}.${ext}`;
  }

  async save() {
    const out = new JSZip();
    const names = new Set([...this.files, ...this.xml.keys(), ...this.bin.keys()]);
    // [Content_Types].xml 을 맨 앞에(일부 프로그램이 순서를 본다)
    const order = [...names].filter(n => !this.removed.has(n)).sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0));
    for (const n of order) {
      if (this.xml.has(n)) out.file(n, xmlString(this.xml.get(n)));
      else if (this.bin.has(n)) out.file(n, this.bin.get(n));
      else if (this.zip.file(n)) out.file(n, await this.zip.file(n).async('uint8array'));
    }
    return out.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 }, mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
}
