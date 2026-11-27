"""새 발표 자료용 빈 서식(16:9, 맑은 고딕, 한국어 이름) 만들기.

python-pptx 의 기본 서식(PowerPoint 가 만든 Office 테마)을 바탕으로
  - 슬라이드 크기 4:3 → 16:9 (가로 위치·너비를 같은 비율로 늘림)
  - 테마 글꼴 → 맑은 고딕
  - 레이아웃 이름·안내 글 → 한국어
  - 미리보기 그림·프린터 설정 빼기
결과: src/template/blank.pptx, src/template/notesMaster.xml
"""
import io, os, re, zipfile
import pptx

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(os.path.dirname(pptx.__file__), 'templates')
OUT = os.path.join(ROOT, 'src', 'template')
os.makedirs(OUT, exist_ok=True)

W_OLD, W_NEW = 9144000, 12192000
K = W_NEW / W_OLD

LAYOUT_KO = {
    'Title Slide': '제목 슬라이드', 'Title and Content': '제목 및 내용', 'Section Header': '구역 머리글',
    'Two Content': '콘텐츠 2개', 'Comparison': '비교', 'Title Only': '제목만', 'Blank': '빈 화면',
    'Content with Caption': '캡션 있는 콘텐츠', 'Picture with Caption': '캡션 있는 그림',
    'Title and Vertical Text': '제목 및 세로 텍스트', 'Vertical Title and Text': '세로 제목 및 텍스트',
}
TEXT_KO = {
    'Click to edit Master title style': '마스터 제목 스타일 편집',
    'Click to edit Master subtitle style': '마스터 부제목 스타일 편집',
    'Click to edit Master text styles': '마스터 텍스트 스타일을 편집합니다',
    'Second level': '둘째 수준', 'Third level': '셋째 수준', 'Fourth level': '넷째 수준', 'Fifth level': '다섯째 수준',
}


def scale_x(xml):
    # a:off x, a:ext cx (가로만) — 마스터·레이아웃의 개체 틀 위치
    xml = re.sub(r'(<a:off x=")(\d+)(")', lambda m: m.group(1) + str(round(int(m.group(2)) * K)) + m.group(3), xml)
    xml = re.sub(r'(<a:ext cx=")(\d+)(")', lambda m: m.group(1) + str(round(int(m.group(2)) * K)) + m.group(3), xml)
    return xml


def ko(xml):
    xml = xml.replace('lang="en-US"', 'lang="ko-KR" altLang="en-US"')
    for en, k in TEXT_KO.items():
        xml = xml.replace('<a:t>' + en + '</a:t>', '<a:t>' + k + '</a:t>')
    for en, k in LAYOUT_KO.items():
        xml = xml.replace('<p:cSld name="' + en + '"', '<p:cSld name="' + k + '"')
    return xml


src = zipfile.ZipFile(os.path.join(TPL, 'default.pptx'))
buf = io.BytesIO()
out = zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED)
names = src.namelist()
names.sort(key=lambda n: (n != '[Content_Types].xml', n))
for n in names:
    if n in ('docProps/thumbnail.jpeg', 'ppt/printerSettings/printerSettings1.bin'):
        continue
    data = src.read(n)
    if n.endswith('.xml') or n.endswith('.rels'):
        s = data.decode('utf-8')
        if n == '_rels/.rels':
            s = re.sub(r'<Relationship [^>]*thumbnail[^>]*/>', '', s)
        elif n == 'ppt/_rels/presentation.xml.rels':
            s = re.sub(r'<Relationship [^>]*printerSettings[^>]*/>', '', s)
        elif n == '[Content_Types].xml':
            s = s.replace('<Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.presentationml.printerSettings"/>', '')
            s = s.replace('<Default Extension="jpeg" ContentType="image/jpeg"/>', '<Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/>')
        elif n == 'ppt/presentation.xml':
            s = s.replace('<p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>', '<p:sldSz cx="12192000" cy="6858000"/>')
            s = ko(s)
        elif n == 'ppt/theme/theme1.xml':
            s = s.replace('name="Office Theme"', 'name="Office 테마"')
            for tag in ('majorFont', 'minorFont'):
                s = re.sub(r'(<a:%s><a:latin typeface=")[^"]*("/><a:ea typeface=")[^"]*(")' % tag, r'\g<1>맑은 고딕\g<2>맑은 고딕\g<3>', s)
        elif n.startswith('ppt/slideMasters/slideMaster') or n.startswith('ppt/slideLayouts/slideLayout'):
            if n.endswith('.xml'):
                s = ko(scale_x(s))
        elif n == 'docProps/app.xml':
            s = re.sub(r'<Company>[^<]*</Company>', '', s)
        elif n == 'docProps/core.xml':
            s = re.sub(r'<dc:creator>[^<]*</dc:creator>', '<dc:creator></dc:creator>', s)
            s = re.sub(r'<cp:lastModifiedBy>[^<]*</cp:lastModifiedBy>', '<cp:lastModifiedBy></cp:lastModifiedBy>', s)
        data = s.encode('utf-8')
    out.writestr(n, data)
out.close()
with open(os.path.join(OUT, 'blank.pptx'), 'wb') as f:
    f.write(buf.getvalue())

# 메모 마스터(메모가 없던 파일에 처음 메모를 쓸 때 쓴다) — 한 줄로 줄이고 한국어 표시
nm = open(os.path.join(TPL, 'notesMaster.xml'), encoding='utf-8').read()
nm = re.sub(r'>\s+<', '><', nm).strip()
nm = re.sub(r'<p:notesMaster\s+', '<p:notesMaster ', nm)
nm = re.sub(r'\s+>', '>', nm)
nm = ko(nm)
with open(os.path.join(OUT, 'notesMaster.xml'), 'w', encoding='utf-8') as f:
    f.write(nm)
print('blank.pptx', len(buf.getvalue()), 'bytes; notesMaster.xml', len(nm), 'chars')
