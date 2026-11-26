# 길잡이 내비

무료 지도(OpenStreetMap)로 길을 찾고 한국어 음성으로 안내하는 개인용 차량 내비게이션. HTML 파일 하나로 동작한다.

## 쓰는 법
- PC: `dist/길잡이내비_v버전.html` 을 크롬·엣지로 연다. 위치 권한을 허용하면 현재 위치에서 출발한다. 위치가 없으면 출발지를 직접 고르고 ‘모의 주행’으로 안내를 미리 들을 수 있다.
- 휴대폰: 위치(GPS)·화면 꺼짐 방지는 https 주소에서만 동작한다. `dist/index.html` 을 GitHub Pages·Netlify 같은 무료 정적 호스팅에 올려 그 주소로 연다.
- 저장 데이터(집·회사·즐겨찾기·설정·주행 기록)는 그 브라우저에만 남는다. 설정 > 데이터에서 백업 파일로 옮긴다.

## 기능
- 검색: Photon(komoot) + Nominatim. 검색 버튼을 누를 때만 요청(자동완성 없음), 결과 7일 캐시, 서비스별 초당 1회 이하.
- 경로: Valhalla(FOSSGIS) 우선, 응답 없으면 OSRM(FOSSGIS). 옵션 추천/최단거리/무료도로/고속도로 회피, 경유지 3곳, 후보 경로 최대 3개.
- 안내: 다음 회전 표지판(일반도로 청색·고속도로 녹색), 시계 방향 표현(1시 방향 등), 고속도로 2km·1km·500m / 일반도로 1km·300m / ‘잠시 후’, 연속 회전 ‘이어서’, 긴 직진 안내, 경로 이탈 시 진행 방향을 반영해 재탐색, 경유지·도착 안내.
- 개인화: 내 주행 기록(시간대별 중앙값)으로 도착 시간 보정, 요일·시간대가 비슷할 때 자주 간 곳 추천, 연비·유가로 유류비 계산.
- 화면: 주간/야간 자동(해 고도), 진행 방향 위·3D 시점, 모의 주행(×1·×2·×4).

## 개발
```
npm install
node build.js 1.0        # dist/길잡이내비_v1.0.html, dist/index.html
node test/unit.js        # 경로 정규화·안내 문구·안내 엔진·개인화
node test/e2e.js phone   # 가짜 네트워크로 전체 흐름(스크린샷: test/out)
node test/e2e2.js        # 내 장소 등록·길게 누르기·경유지·백업
```
소스: `src/index.html`, `src/app.css`, `src/js/*.js`(번호 순서로 하나의 즉시 실행 함수에 묶임). 지도 라이브러리 MapLibre GL JS 5.24.0 을 파일 안에 넣는다.

## 출처·정책
지도 OpenFreeMap · © OpenMapTiles · © OpenStreetMap 기여자. 경로 Valhalla·OSRM(FOSSGIS 공개 서버). 검색 Photon(komoot)·Nominatim — https://operations.osmfoundation.org/policies/nominatim/
실시간 교통·단속 카메라 정보 없음.
