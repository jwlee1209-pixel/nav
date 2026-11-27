# 비교 그림: 왼쪽 = 편집기, 오른쪽 = LibreOffice 참고(test/ref)
from PIL import Image
import os, glob, sys
out='test/out'; ref='test/ref'
os.makedirs(out+'/cmp', exist_ok=True)
for f in sorted(glob.glob(ref+'/*-*.png')):
    b=os.path.basename(f)[:-4]
    name,num=b.rsplit('-',1)
    for cand in [f'{out}/{name}-{num}.png', f'{out}/{name}-ppt-{num}.png']:
        if not os.path.exists(cand): continue
        A=Image.open(cand).convert('RGB'); B=Image.open(f).convert('RGB')
        h=360
        A=A.resize((int(A.width*h/A.height),h)); B=B.resize((int(B.width*h/B.height),h))
        C=Image.new('RGB',(A.width+B.width+10,h),'#888'); C.paste(A,(0,0)); C.paste(B,(A.width+10,0))
        C.save(f'{out}/cmp/{os.path.basename(cand)}')
