# 시험용 .pptx 만들기(python-pptx): python3 tools/make_fixtures.py test/fixtures
import sys, os, io
from pptx import Presentation
from pptx.util import Emu, Pt, Inches, Cm
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from PIL import Image, ImageDraw

out = sys.argv[1] if len(sys.argv) > 1 else 'test/fixtures'
os.makedirs(out, exist_ok=True)


def png(w, h, colors, label=''):
    im = Image.new('RGB', (w, h), colors[0])
    d = ImageDraw.Draw(im)
    for i in range(0, w, 40):
        d.rectangle([i, 0, i + 19, h], fill=colors[1])
    d.ellipse([w // 4, h // 4, w * 3 // 4, h * 3 // 4], fill=colors[2])
    b = io.BytesIO(); im.save(b, 'PNG'); b.seek(0)
    return b


def jpg(w, h):
    im = Image.new('RGB', (w, h), (30, 90, 160))
    d = ImageDraw.Draw(im)
    for y in range(h):
        d.line([0, y, w, y], fill=(30 + y * 200 // h, 90, 160 - y * 100 // h))
    b = io.BytesIO(); im.save(b, 'JPEG', quality=90); b.seek(0)
    return b


# ── 1. 기본(4:3, 기본 서식 파일): 제목·글머리표·서식 섞인 글자·도형·그림·표·그룹·차트·메모 ──
p = Presentation()
s = p.slides.add_slide(p.slide_layouts[0])
s.shapes.title.text = '길잡이 발표 자료'
s.placeholders[1].text = '부제목: 2026년 11월 · 말산업연구소'
s.notes_slide.notes_text_frame.text = '첫 장 메모: 인사와 소개'

s = p.slides.add_slide(p.slide_layouts[1])
s.shapes.title.text = '주요 내용'
tf = s.placeholders[1].text_frame
tf.text = '첫째 항목 — 기본 글자'
para = tf.add_paragraph(); para.level = 1
r = para.add_run(); r.text = '둘째 수준 '
r = para.add_run(); r.text = '굵게'; r.font.bold = True
r = para.add_run(); r.text = ' 와 '
r = para.add_run(); r.text = '빨간 기울임'; r.font.italic = True; r.font.color.rgb = RGBColor(0xC0, 0x00, 0x00)
para = tf.add_paragraph(); para.text = 'Third item in English with underline'; para.runs[0].font.underline = True
para = tf.add_paragraph(); para.text = '큰 글자 32pt'; para.runs[0].font.size = Pt(32)
para = tf.add_paragraph(); para.level = 2; para.text = '셋째 수준 항목'
s.notes_slide.notes_text_frame.text = '둘째 장 메모'

s = p.slides.add_slide(p.slide_layouts[5])   # 제목만
s.shapes.title.text = '도형'
specs = [(MSO_SHAPE.RECTANGLE, '사각형', (0x44, 0x72, 0xC4)), (MSO_SHAPE.ROUNDED_RECTANGLE, '둥근 사각형', (0xED, 0x7D, 0x31)), (MSO_SHAPE.OVAL, '타원', (0x70, 0xAD, 0x47)),
         (MSO_SHAPE.ISOSCELES_TRIANGLE, '삼각형', (0xFF, 0xC0, 0x00)), (MSO_SHAPE.RIGHT_ARROW, '화살표', (0x5B, 0x9B, 0xD5)), (MSO_SHAPE.STAR_5_POINT, '별', (0xA5, 0xA5, 0xA5)),
         (MSO_SHAPE.DIAMOND, '마름모', (0x26, 0x44, 0x78)), (MSO_SHAPE.CHEVRON, '갈매기', (0x9E, 0x48, 0x0E))]
for i, (kind, label, rgb) in enumerate(specs):
    x = Inches(0.5 + (i % 4) * 2.3); y = Inches(1.8 + (i // 4) * 2.4)
    sh = s.shapes.add_shape(kind, x, y, Inches(2), Inches(1.6))
    sh.fill.solid(); sh.fill.fore_color.rgb = RGBColor(*rgb)
    sh.line.color.rgb = RGBColor(0x20, 0x20, 0x20); sh.line.width = Pt(1.5)
    sh.text_frame.text = label
    sh.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
    sh.text_frame.paragraphs[0].runs[0].font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
    if i == 5: sh.rotation = 20
ln = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(0.5), Inches(6.9), Inches(9.3), Inches(6.9))
ln.line.color.rgb = RGBColor(0xC0, 0, 0); ln.line.width = Pt(3)

s = p.slides.add_slide(p.slide_layouts[6])   # 빈 화면
s.shapes.add_picture(png(400, 300, [(240, 240, 220), (200, 220, 240), (220, 80, 60)]), Inches(0.5), Inches(0.5), Inches(4), Inches(3))
s.shapes.add_picture(jpg(320, 240), Inches(5), Inches(0.5), Inches(4.5), Inches(3.375))
tb = s.shapes.add_textbox(Inches(0.5), Inches(4.2), Inches(9), Inches(1.2))
tb.text_frame.text = '그림 두 장(PNG·JPEG)과 텍스트 상자'
tb.text_frame.paragraphs[0].runs[0].font.size = Pt(24)
tb.text_frame.paragraphs[0].alignment = PP_ALIGN.CENTER
bg = s.background.fill; bg.solid(); bg.fore_color.rgb = RGBColor(0xF4, 0xF1, 0xE8)

s = p.slides.add_slide(p.slide_layouts[5])
s.shapes.title.text = '표'
rows, cols = 4, 3
tbl = s.shapes.add_table(rows, cols, Inches(0.8), Inches(1.8), Inches(8.4), Inches(3)).table
data = [['구분', '2025년', '2026년'], ['경주 수', '1,800', '1,850'], ['매출(억 원)', '7,200', '7,450'], ['관람객(만 명)', '520', '540']]
for r_ in range(rows):
    for c_ in range(cols):
        tbl.cell(r_, c_).text = data[r_][c_]

s = p.slides.add_slide(p.slide_layouts[5])
s.shapes.title.text = '그룹과 차트'
grp = s.shapes.add_group_shape()
a = grp.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.5), Inches(2), Inches(2), Inches(1)); a.text_frame.text = '그룹 1'
b = grp.shapes.add_shape(MSO_SHAPE.OVAL, Inches(1.5), Inches(3.2), Inches(2), Inches(1)); b.text_frame.text = '그룹 2'
cd = CategoryChartData(); cd.categories = ['1분기', '2분기', '3분기']; cd.add_series('매출', (12, 18, 15))
s.shapes.add_chart(XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(4.5), Inches(1.8), Inches(5), Inches(4), cd)
p.save(os.path.join(out, 'basic.pptx'))

# ── 2. 넓은 화면(16:9): 그라데이션·자유형·하이퍼링크·세로 가운데 정렬·글자 회전 없음 ──
w = Presentation(); w.slide_width = Inches(13.333); w.slide_height = Inches(7.5)
s = w.slides.add_slide(w.slide_layouts[6])
r1 = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.6), Inches(0.6), Inches(6), Inches(3))
r1.fill.gradient(); r1.fill.gradient_angle = 0
r1.fill.gradient_stops[0].color.rgb = RGBColor(0x1F, 0x4E, 0x79); r1.fill.gradient_stops[1].color.rgb = RGBColor(0x9D, 0xC3, 0xE6)
r1.text_frame.text = '그라데이션 채우기'; r1.text_frame.vertical_anchor = MSO_ANCHOR.MIDDLE
r1.text_frame.paragraphs[0].runs[0].font.size = Pt(28); r1.text_frame.paragraphs[0].runs[0].font.bold = True
ff = s.shapes.build_freeform(Inches(7.5), Inches(4.5))
ff.add_line_segments([(Inches(9.5), Inches(1)), (Inches(11.5), Inches(4.5)), (Inches(9.5), Inches(3.4))], close=True)
fs = ff.convert_to_shape(); fs.fill.solid(); fs.fill.fore_color.rgb = RGBColor(0xE0, 0x6C, 0x00)
tb = s.shapes.add_textbox(Inches(0.6), Inches(4.4), Inches(6), Inches(1))
run = tb.text_frame.paragraphs[0].add_run(); run.text = '하이퍼링크 글자'; run.hyperlink.address = 'https://www.kra.co.kr'
tb2 = s.shapes.add_textbox(Inches(0.6), Inches(5.6), Inches(12), Inches(1.4))
tf = tb2.text_frame; tf.word_wrap = True
tf.text = '긴 문장 자동 줄바꿈 시험: 슬라이드 편집기는 글자 상자 너비에 맞춰 줄을 바꾸고, 저장한 뒤에도 같은 모양을 유지해야 합니다. The quick brown fox jumps over the lazy dog.'
w.save(os.path.join(out, 'wide.pptx'))
print('ok', os.listdir(out))
