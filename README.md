# PPT 편집기

PowerPoint 파일(.pptx, 옛 .ppt)을 브라우저에서 열어 보고 고쳐 저장하는 프로그램. HTML 파일 하나로 동작하고, 파일은 그 컴퓨터(브라우저) 안에서만 처리한다.

## 쓰는 법
- 웹 주소: **https://jwlee1209-pixel.github.io/nav/ppt/** (크롬·엣지 권장). https 주소라 크롬·엣지에서는 ‘저장’이 원본 파일에 바로 덮어쓴다(처음 한 번 확인).
- 파일로 쓰기: `dist/PPT편집기_v버전.html` 을 내려받아 크롬·엣지로 연다(인터넷 없이 동작).
- 열기: ‘열기’ 단추 또는 창에 끌어다 놓기. 옛 .ppt 는 .pptx 로 바꿔 열고 .pptx 로 저장한다.
- 단축키·도움말: 오른쪽 위 **?** 단추.

## 파일을 두 번 눌러 열기(설치형 앱, v1.1~)
1. 크롬·엣지로 웹 주소를 열고 앱으로 설치한다: 첫 화면의 ‘앱으로 설치’, 또는 크롬 주소창 오른쪽 설치 아이콘(⋮ → 전송, 저장, 공유 → 페이지를 앱으로 설치), 엣지 … → 앱 → 이 사이트를 앱으로 설치.
2. 파일 탐색기에서 .pptx 파일 오른쪽 단추 → 연결 프로그램 → 다른 앱 선택 → ‘PPT 편집기’ → ‘항상 이 앱을 사용하여 .pptx 파일 열기’. .ppt 도 같은 방법.
3. 처음 열 때 브라우저가 ‘PPT 편집기로 이 파일 형식을 열까요?’를 묻는다 → 허용. 처음 저장할 때 ‘파일 수정 허용’을 묻는다 → 허용. 그다음부터 Ctrl+S 는 원본에 바로 저장.
- 원리: manifest 의 `file_handlers`(.pptx·.ppt·.ppsx·.pps·.potx·.pot·.pptm, 파일마다 새 창)와 `launchQueue` 로 파일 손잡이를 받는다. 옛 .ppt 는 .pptx 로 바꿔 열므로 저장은 새 이름으로 한다(원본 .ppt 는 그대로).
- 서비스 워커(`sw.js`)는 화면·아이콘만 저장해 두어 인터넷이 끊겨도 앱이 열린다. 사용자 파일은 저장하지 않는다.
- PowerPoint 로 다시 바꾸려면 연결 프로그램에서 PowerPoint 를 고르면 된다. 휴대폰·태블릿은 이 방식(파일 연결)을 지원하지 않는다.

## 기능
- 그리기: 테마·마스터·레이아웃 상속, 도형 100여 종, 그림(자르기), 표(표 스타일), 차트(보기), SmartArt(보기), 그룹, 그림자, 글자 자동 맞춤.
- 편집: 글자(일부만 서식 포함), 도형 이동·크기·회전(맞춤선), 텍스트 상자·도형·표·그림 넣기, 채우기·윤곽선, 순서, 복사·붙여넣기·복제·삭제, 실행 취소/다시 실행.
- 슬라이드: 레이아웃 골라 새로(Ctrl+M), 복제(메모·차트 함께), 삭제, 끌어서 순서, 숨기기, 발표자 메모.
- 저장: 원본 덮어쓰기(File System Access) → 다른 이름 → 내려받기. 쓰이지 않는 부분(지운 슬라이드 등)은 저장할 때 뺀다.
- 슬라이드 쇼(F5 / Shift+F5), PDF(인쇄 창의 ‘PDF로 저장’, 쪽 크기 = 슬라이드 크기).
- 옛 .ppt(97-2003): 슬라이드·글자 서식·도형·그림·배경·메모를 옮긴다(암호 걸린 파일 제외).

## 한계
- 차트·SmartArt 는 보기와 위치·크기 바꾸기만. 애니메이션·화면 전환은 쇼에서 재생하지 않는다(파일에는 남음).
- EMF/WMF 그림은 브라우저가 그리지 못해 빗금 칸으로 보인다(저장 파일에는 그대로).
- LibreOffice 로 만든 .ppt 의 일부 도형(식으로 만든 모양)은 네모로 들어온다.

## 개발
```
node build.js 1.1         # dist/PPT편집기_v1.1.html (+ dist/index.html), 웹 판 dist/web/ppt/
node build.js 1.1 --pages ../nav/docs/ppt   # 웹 판을 GitHub Pages 폴더로 복사
node tools/icons.js       # 앱 아이콘(src/web/*.png, icon.svg)
python3 tools/make_template.py   # 새 발표 자료 서식(src/template/blank.pptx, notesMaster.xml)
node test/smoke.js        # 시험 파일 모두 열기·슬라이드 그림(test/out) — python3 test/cmp.py 로 LibreOffice 그림과 나란히
node test/e2e-edit.js     # 실제 마우스·키보드로 편집 → 저장 → python-pptx·LibreOffice 로 확인
node test/e2e-ui.js       # 눌러서 편집, 오른쪽 단추 메뉴, 숨기기, 도움말, 붙여넣기
node test/e2e-print.js    # PDF(인쇄) 쪽 수·크기
node test/e2e-app.js      # 설치형 앱: 설치 가능 판정·파일 연결로 받은 파일 열기·원본 저장·내비와 함께·오프라인
node tools/pptdump.js 파일.ppt   # .ppt 구조 보기
```
소스: `src/index.html`, `src/app.css`, `src/js/*.js`(번호 순서로 하나의 즉시 실행 함수에 묶임), JSZip 3.10.1 을 파일 안에 넣는다.

웹에 올리기: `node build.js 버전 --pages <nav 저장소>/docs/ppt` 후 `claude/navi` 브랜치에 올린다(GitHub Pages: 그 브랜치의 `docs/`).
