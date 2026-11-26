# 단속 카메라 자료 만들기: python3 -I tools/cameras.py <전국무인교통단속카메라표준데이터.xls|csv> [기준일]
# 결과: src/web/cameras.json (앱이 한 번 받아 휴대폰에 저장해 쓰는 압축 목록)
#
# 코드 해석(자료 안의 설치장소·제한속도 분포로 확인)
#   단속구분 1=과속, 2=신호, 1+2=과속·신호, 3=교통법규위반(제외), 4=불법주정차(제외), 99=구간단속·기타
#   (근거: 1은 구간 중간·'○km 전방' 위치가 많고, 2는 교차로 위치 비율이 두 배 이상 — 경기도 메타데이터의 단속유형 순서
#    '과속, 신호, 교통법규위반, 불법주정차, 기타'와도 맞음)
#   단속구간위치구분 1=구간 시작, 2=구간 끝 / 보호구역구분 1=노인, 2=어린이, 99=없음
import sys, json, re, math, os
SRC = sys.argv[1]
DATE = sys.argv[2] if len(sys.argv) > 2 else ''
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'web', 'cameras.json')

def rows_from(path):
    if path.lower().endswith('.csv'):
        import csv
        for enc in ('utf-8-sig', 'cp949'):
            try:
                with open(path, encoding=enc) as f:
                    r = list(csv.reader(f))
                break
            except UnicodeDecodeError:
                continue
        hdr_i = next(i for i, row in enumerate(r) if '위도' in row)
        return r[hdr_i], r[hdr_i + 1:]
    import xlrd
    sh = xlrd.open_workbook(path).sheet_by_index(0)
    allrows = [[str(sh.cell_value(i, c)).strip() for c in range(sh.ncols)] for i in range(sh.nrows)]
    hdr_i = next(i for i, row in enumerate(allrows) if '위도' in row)
    return allrows[hdr_i], allrows[hdr_i + 1:]

hdr, rows = rows_from(SRC)
col = {h.strip(): i for i, h in enumerate(hdr)}
def g(r, k): return r[col[k]].strip() if k in col and col[k] < len(r) else ''
def code(v):  # '01' → '1', '01+02' → '1+2'
    return '+'.join(str(int(x)) for x in re.findall(r'\d+', v)) if v else ''

kept, skip = [], {}
for r in rows:
    try:
        lat, lon = float(g(r, '위도')), float(g(r, '경도'))
    except ValueError:
        skip['좌표 없음'] = skip.get('좌표 없음', 0) + 1; continue
    if not (33 < lat < 39 and 124 < lon < 132):
        skip['좌표 범위 밖'] = skip.get('좌표 범위 밖', 0) + 1; continue
    c = code(g(r, '단속구분'))
    lim = int(float(g(r, '제한속도') or 0))
    sec = code(g(r, '단속구간위치구분'))
    try: seclen = float(g(r, '과속단속구간길이') or 0)
    except ValueError: seclen = 0
    zone = {'1': 1, '2': 2}.get(code(g(r, '보호구역구분')), 0)
    # 앱 종류 코드: 1 신호, 2 과속, 3 신호·과속, 5 구간 시작, 6 구간 끝, 9 기타(제한속도 있는 카메라)
    if sec in ('1', '2') and lim > 0:
        t = 5 if sec == '1' else 6
    elif c in ('1+2', '2+1'):
        t = 3
    elif c == '1':
        t = 2
    elif c == '2':
        t = 1
    elif c == '99' and lim > 0:
        t = 9
    else:
        skip['주정차·기타 제외'] = skip.get('주정차·기타 제외', 0) + 1; continue
    if t in (2, 3, 9) and lim <= 0:
        skip['제한속도 없는 과속'] = skip.get('제한속도 없는 과속', 0) + 1; continue
    kept.append((round(lat * 1e5), round(lon * 1e5), t, lim, zone, round(seclen * 1000) if t in (5, 6) else 0))

# 같은 자리(약 15m 안)의 같은 종류 카메라(차로별 중복)는 하나로
kept.sort()
uniq, seen = [], {}
for k in kept:
    key = (k[0] // 15, k[1] // 18, k[2], k[3])
    if key in seen: skip['같은 자리 중복'] = skip.get('같은 자리 중복', 0) + 1; continue
    seen[key] = 1; uniq.append(k)

# 압축: 위도 순 정렬, 위·경도는 앞 항목과의 차이만 기록
flat, plat, plon = [], 0, 0
for la, lo, t, lim, z, sl in uniq:
    flat += [la - plat, lo - plon, t, lim, z, sl]
    plat, plon = la, lo
counts = {}
for k in uniq: counts[k[2]] = counts.get(k[2], 0) + 1
meta = {'v': 1, 'date': DATE, 'src': '경찰청·지방자치단체 전국무인교통단속카메라표준데이터(공공데이터포털)', 'n': len(uniq),
        'fields': ['dlat_e5', 'dlon_e5', 'type', 'limit', 'zone', 'sec_len_m'], 'd': flat}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(meta, f, ensure_ascii=True, separators=(',', ':'))
print('원자료', len(rows), '건 → 사용', len(uniq), '대', '| 종류별', {
    {1: '신호', 2: '과속', 3: '신호·과속', 5: '구간 시작', 6: '구간 끝', 9: '기타'}[k]: v for k, v in sorted(counts.items())}, '| 제외', skip)
print('파일', OUT, os.path.getsize(OUT) // 1024, 'KB')
