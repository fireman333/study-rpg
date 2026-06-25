import pathlib
from PIL import Image, ImageDraw, ImageFont
HERE=pathlib.Path(__file__).resolve().parent
PREVIEW=HERE/'preview'
files=sorted(PREVIEW.glob('*.png'))
THUMB_W=340; COLS=4; LABEL_H=26
def thumb(f):
    im=Image.open(f).convert('RGB')
    w=THUMB_W; h=int(im.height*w/im.width)
    im=im.resize((w,h))
    canvas=Image.new('RGB',(w,h+LABEL_H),'white')
    canvas.paste(im,(0,LABEL_H))
    d=ImageDraw.Draw(canvas)
    name=f.stem.replace('104-2-','').replace('醫學','M').replace('-醫學','-M')
    d.text((4,6),f.stem.split('-')[-1]+' '+f.stem,fill=(0,0,0))
    return canvas
thumbs=[thumb(f) for f in files]
# split into sheets of 12 (3 rows x 4 cols)
PER=12
for si in range(0,len(thumbs),PER):
    chunk=thumbs[si:si+PER]
    rows=(len(chunk)+COLS-1)//COLS
    cw=THUMB_W; ch=max(t.height for t in chunk)
    sheet=Image.new('RGB',(cw*COLS, ch*rows),'white')
    for i,t in enumerate(chunk):
        r,c=divmod(i,COLS)
        sheet.paste(t,(c*cw, r*ch))
    out=HERE/f'_work/contact-{si//PER+1}.png'
    sheet.save(out)
    print("wrote",out, sheet.size)
