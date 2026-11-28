// ── 홈 화면에 추가 ──
// · 크롬·엣지(안드로이드): beforeinstallprompt 를 받아 두었다가 단추를 누르면 바로 설치 창을 띄운다.
// · 아이폰·삼성 인터넷, 설치 창을 아직 못 받은 크롬: 그 브라우저의 메뉴 순서를 보여 준다.
// · 카카오톡·라인 같은 앱 안 브라우저는 홈 화면 추가를 막으므로 먼저 휴대폰 브라우저로 옮긴다.
//   옮길 때 ?add=home 을 붙여 열어, 옮겨 간 브라우저에서 바로 안내를 띄운다.
const UA = navigator.userAgent || '';
const ENV = (() => {
  const ios = /iPad|iPhone|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(UA);
  const kakao = /KAKAOTALK/i.test(UA);
  const line = /\sLine\//.test(UA);
  // 네이버·다음·인스타그램·페이스북·밴드 앱 안 화면, 그 밖의 안드로이드 웹뷰(; wv)
  const inapp = kakao || line || /NAVER\(inapp|DaumApps|Instagram|FBAN|FBAV|FB_IAB|BAND\//i.test(UA) || (android && /;\s?wv\)/.test(UA));
  return { ios, android, kakao, line, inapp, mobile: ios || android, samsung: !inapp && /SamsungBrowser/i.test(UA) };
})();
const A2HS_KEY = 'gilnavi.a2hs.v1';   // 첫 화면 카드를 닫은 때(이 시각까지 숨김)
const MARK_SVG = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#0B5CAD"/><path d="M11 25V15.5a3.5 3.5 0 0 1 3.5-3.5H20" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/><path d="M19 7.2 25.5 12 19 16.8z" fill="#fff"/></svg>';
let installEvt = null;   // 크롬이 준 설치 창(한 번 쓰면 끝)
let a2g = null;          // 열려 있는 안내 { kind }

const isStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
// 웹 주소(https 또는 localhost)로 열었고 앱 설명서(manifest)가 있을 때만 홈 화면에 추가할 수 있다(내려받은 파일은 안 됨)
const webApp = () => window.isSecureContext && /^https?:$/.test(location.protocol) && !!document.querySelector('link[rel="manifest"]');
const a2hsOffer = () => webApp() && ENV.mobile && !isStandalone() && !S.installed;   // 휴대폰에서만(컴퓨터는 주소창의 설치 아이콘)
const a2hsHidden = () => { try { return +localStorage.getItem(A2HS_KEY) > Date.now(); } catch (e) { return false; } };
const hideA2hs = days => { try { localStorage.setItem(A2HS_KEY, String(Date.now() + days * 864e5)); } catch (e) { /* 저장 못 하면 이번만 */ } };
const pageUrl = () => location.origin + location.pathname;
// 이 브라우저에서 보여 줄 메뉴 안내 종류
const a2hsKind = () => ENV.inapp ? 'inapp' : ENV.ios ? 'ios' : ENV.samsung ? 'samsung' : 'android';

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();   // 브라우저 자체 알림 대신 첫 화면 카드·안내의 단추로 띄운다
  installEvt = e;
  a2hsChanged();
});
window.addEventListener('appinstalled', () => {
  installEvt = null; S.installed = true;
  closeA2hsGuide();
  a2hsChanged();
  toast('홈 화면에 추가했습니다. 다음부터는 아이콘을 눌러 여세요', 4000);
});
function a2hsChanged() {
  if (a2g) renderA2hsGuide();
  // 카드가 새로 생기거나 없어질 때만 다시 그린다(목록을 보던 자리 유지)
  if (S.screen === 'home' && !!$('#a2hsCard') !== (a2hsOffer() && !a2hsHidden())) renderSheet();
}

// 첫 화면 목록 맨 위의 카드
function installCard() {
  if (!a2hsOffer() || a2hsHidden()) return null;
  const sub = ENV.kakao ? '카카오톡에서는 휴대폰 브라우저로 옮겨서 추가합니다'
    : ENV.inapp ? '앱 안 화면에서는 휴대폰 브라우저로 옮겨서 추가합니다'
      : '아이콘을 누르면 앱처럼 바로 열리고 화면을 넓게 씁니다';
  return h('div', { class: 'a2hs', id: 'a2hsCard' },
    h('button', { class: 'a2hs__main', type: 'button', id: 'btnA2hs', onclick: () => addToHome() },
      h('span', { class: 'a2hs__mark', svg: MARK_SVG }),
      h('span', { class: 'a2hs__txt' }, h('b', { text: '홈 화면에 추가' }), h('small', { text: sub })),
      h('span', { class: 'a2hs__go', text: '추가' })),
    h('button', { class: 'icon-btn a2hs__x', type: 'button', id: 'btnA2hsX', 'aria-label': '홈 화면 추가 카드 닫기', svg: ic('close', 18),
      onclick: () => { hideA2hs(60); renderSheet(); toast('설정 → 앱 정보에서 언제든 홈 화면에 추가할 수 있습니다', 3500); } }));
}

// ‘홈 화면에 추가’ 단추
function addToHome() {
  if (ENV.inapp) return leaveInApp();
  if (installEvt) return promptInstall();
  openA2hsGuide(a2hsKind());
}

// 앱 안 브라우저 → 휴대폰 브라우저(카카오톡: 기본 브라우저, 라인: 외부 브라우저). 못 옮기면 메뉴 안내
function leaveInApp() {
  const url = pageUrl() + '?add=home';
  const target = ENV.kakao ? 'kakaotalk://web/openExternal?url=' + encodeURIComponent(url)
    : ENV.line ? url + '&openExternalBrowser=1' : null;
  if (!target) return openA2hsGuide('inapp');   // 다른 앱은 여는 방법이 제각각이라 메뉴 안내만
  window.__lastExternal = target;   // 시험용
  try { location.href = target; } catch (e) { /* 아래에서 안내 */ }
  // 브라우저로 넘어가면 이 화면은 뒤로 숨는다. 2초 뒤에도 보이면 넘어가지 못한 것
  setTimeout(() => { if (document.visibilityState === 'visible') openA2hsGuide('inapp'); }, 2000);
}

async function promptInstall() {
  const ev = installEvt;
  if (!ev) return openA2hsGuide(a2hsKind());
  installEvt = null;   // 설치 창은 한 번만 띄울 수 있다
  try {
    await ev.prompt();
    const r = await ev.userChoice;
    if (r && r.outcome === 'accepted') {
      S.installed = true; closeA2hsGuide(); a2hsChanged();
      toast('홈 화면에 추가하는 중입니다. 잠시 뒤 아이콘이 생깁니다', 4000);
    } else if (a2g) renderA2hsGuide();
  } catch (e) {
    openA2hsGuide(a2hsKind());
  }
}

// 다른 앱(카카오톡 등)에서 ‘홈 화면에 추가’로 옮겨 왔으면 바로 안내를 띄운다
function initA2hs() {
  const q = new URLSearchParams(location.search);
  if (q.get('add') !== 'home') return;
  q.delete('add'); q.delete('openExternalBrowser');
  const rest = q.toString();
  try { history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash); } catch (e) { /* 주소는 그대로 */ }
  if (!webApp() || isStandalone() || ENV.inapp) return;
  setTimeout(() => { if (!a2g && !isStandalone() && !S.installed) openA2hsGuide(a2hsKind()); }, 600);
}

// ── 안내 창 ──
const kbd = x => h('span', { class: 'a2g__key', ...(x.charAt(0) === '<' ? { svg: x } : { text: x }) });
const IOS_SHARE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="공유"><path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8.5 10.5h-2v10h11v-10h-2"/></svg>';
function a2hsSteps(kind) {
  const b = t => h('b', { text: t });
  if (kind === 'ios') return [
    ['공유 단추 ', kbd(IOS_SHARE), '를 누릅니다. 안 보이면 ', kbd('⋯'), ' 단추를 누르고 ', b('공유'), '를 누르세요.'],
    ['목록을 위로 올려 ', b('홈 화면에 추가'), '를 누릅니다.'],
    ['오른쪽 위 ', b('추가'), '를 누릅니다.']];
  if (kind === 'samsung') return [
    ['오른쪽 아래 ', kbd('≡'), ' 메뉴를 누릅니다.'],
    [b('현재 페이지 추가'), ' → ', b('홈 화면'), '을 차례로 누릅니다. 메뉴에 없으면 ', b('도구'), ' 안에 있습니다.'],
    [b('추가'), '를 누릅니다.']];
  if (kind === 'inapp') {
    if (ENV.kakao && ENV.ios) return [
      ['오른쪽 아래 공유 단추 ', kbd(IOS_SHARE), '를 누릅니다.'],
      ['목록에서 ', b('Safari'), '를 고릅니다.'],
      ['Safari에서 열리면 ', b('홈 화면에 추가'), '를 다시 누릅니다.']];
    if (ENV.kakao) return [
      ['오른쪽 아래 ', kbd('⋮'), ' 메뉴를 누릅니다.'],
      [b('다른 브라우저로 열기'), '를 누릅니다.'],
      ['열린 브라우저에서 ', b('홈 화면에 추가'), '를 다시 누릅니다.']];
    if (ENV.ios) return [
      ['화면 위나 아래의 ', kbd('⋯'), ' 메뉴(또는 공유 단추)를 누릅니다.'],
      [b('Safari로 열기'), '를 누릅니다.'],
      ['Safari에서 열리면 ', b('홈 화면에 추가'), '를 다시 누릅니다.']];
    return [
      ['화면 위나 아래의 ', kbd('⋮'), ' 메뉴를 누릅니다.'],
      [b('다른 브라우저로 열기'), '(또는 ', b('Chrome으로 열기'), ')를 누릅니다.'],
      ['열린 브라우저에서 ', b('홈 화면에 추가'), '를 다시 누릅니다.']];
  }
  return [   // 크롬 등 안드로이드 브라우저(설치 창을 아직 못 받았을 때)
    ['오른쪽 위 ', kbd('⋮'), ' 메뉴를 누릅니다.'],
    [b('홈 화면에 추가'), ' 또는 ', b('앱 설치'), '를 누릅니다.'],
    [b('설치'), '(또는 ', b('추가'), ')를 누릅니다.']];
}
function openA2hsGuide(kind) { a2g = { kind }; renderA2hsGuide(); }
function closeA2hsGuide() {
  if (!a2g) return;
  a2g = null;
  const box = $('#dialog');
  box.hidden = true; box.replaceChildren();
}
function renderA2hsGuide() {
  const box = $('#dialog');
  const kind = a2g.kind;
  const quick = kind !== 'inapp' && !!installEvt;   // 크롬이 설치 창을 주면 단추 하나로
  const lead = quick ? '아래 단추를 누르면 바로 추가됩니다. 다음부터는 홈 화면 아이콘으로 엽니다.'
    : kind === 'inapp' ? (ENV.kakao ? '카카오톡 안 화면에서는 홈 화면에 추가할 수 없습니다. 휴대폰 브라우저로 옮겨서 추가하세요.' : '앱 안 화면에서는 홈 화면에 추가할 수 없습니다. 휴대폰 브라우저로 옮겨서 추가하세요.')
      : '한 번 추가하면 홈 화면 아이콘으로 바로 열리고, 주소창 없이 넓은 화면으로 씁니다.';
  const btns = [];
  if (quick) btns.push(h('button', { class: 'btn btn--primary', type: 'button', id: 'a2gInstall', text: '홈 화면에 추가', onclick: () => promptInstall() }));
  if (kind === 'inapp') btns.push(h('button', { class: 'btn', type: 'button', id: 'a2gCopy', text: '주소 복사', onclick: () => copyText(pageUrl(), '주소를 복사했습니다. 크롬이나 Safari 주소창에 붙여 넣으세요') }));
  btns.push(h('button', { class: quick || kind === 'inapp' ? 'btn btn--ghost' : 'btn btn--primary', type: 'button', id: 'a2gClose', text: quick ? '나중에' : '닫기', onclick: closeA2hsGuide }));
  box.replaceChildren(h('div', { class: 'dialog__box a2g', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'a2gTitle', 'data-kind': kind },
    h('div', { class: 'a2g__head' },
      h('span', { class: 'a2hs__mark a2hs__mark--lg', svg: MARK_SVG }),
      h('div', null, h('h2', { id: 'a2gTitle', text: '홈 화면에 추가' }), h('p', { class: 'a2g__lead', text: lead }))),
    quick ? null : h('ol', { class: 'a2g__steps' }, ...a2hsSteps(kind).map(s => h('li', null, ...s))),
    kind === 'inapp' ? h('p', { class: 'a2g__url', text: pageUrl() }) : null,
    a2hsNote(kind) ? h('p', { class: 'a2g__note', text: a2hsNote(kind) }) : null,
    h('div', { class: 'dialog__btns' }, ...btns)));
  box.hidden = false;
  box.onclick = e => { if (e.target === box) closeA2hsGuide(); };
  box.onkeydown = e => { if (e.key === 'Escape') closeA2hsGuide(); };
  const dlg = box.firstChild;
  dlg.tabIndex = -1;
  dlg.focus({ preventScroll: true });   // 화면 읽기·키보드는 창 안에서 시작(단추에 포커스 테두리는 띄우지 않음)
}
// 이미 저장한 것이 있을 때만: 앱 안 화면·Safari 와 홈 화면 앱은 저장 공간이 따로라 옮겨지지 않는다
function a2hsNote(kind) {
  const has = store.home || store.work || store.favs.length || store.recents.length || store.trips.length;
  if (!has || (kind !== 'inapp' && kind !== 'ios')) return '';
  return kind === 'inapp' ? `${ENV.kakao ? '카카오톡' : '앱'} 안 화면에 저장한 집·회사·기록은 브라우저로 옮겨지지 않습니다. 홈 화면 앱에서 다시 등록하거나 설정 → 데이터의 백업 파일로 옮기세요.`
    : '아이폰의 홈 화면 앱은 Safari와 따로 저장합니다. 집·회사는 홈 화면 앱에서 다시 등록하거나 설정 → 데이터의 백업 파일로 옮기세요.';
}

async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg, 3500); }
  catch (e) { toast(text, 6000); }   // 복사를 막는 화면: 주소를 크게 보여 준다(길게 눌러 복사)
}

// 설정 → 앱 주소 보내기(카카오톡 등). 공유 창이 없으면 주소 복사
async function shareApp() {
  const data = { title: '길잡이 내비', text: '설치 없이 바로 쓰는 무료 내비게이션', url: APP_URL };
  if (navigator.share) {
    try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copyText(APP_URL, '앱 주소를 복사했습니다. 카카오톡 대화창에 붙여 넣어 보내세요');
}
