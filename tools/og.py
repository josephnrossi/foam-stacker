from PIL import Image, ImageDraw, ImageFont
import os
R=os.path.join(os.path.dirname(__file__),'..')
W,H=1200,630
im=Image.new('RGB',(W,H)); d=ImageDraw.Draw(im)
for y in range(H):
    t=y/H; d.line([(0,y),(W,y)],fill=(int(27-14*t),int(34-19*t),int(54-32*t)))
shot=Image.open(os.path.join(R,'shots/iphone15-gameplay.png')).convert('RGB')
sw=int(shot.size[0]*560/shot.size[1]); shot=shot.resize((sw,560),Image.LANCZOS)
m=Image.new('L',shot.size,0); ImageDraw.Draw(m).rounded_rectangle([0,0,sw-1,559],radius=34,fill=255)
fx=W-sw-70; d.rounded_rectangle([fx-8,27,fx+sw+7,602],radius=40,fill=(40,46,66)); im.paste(shot,(fx,35),m)
logo=Image.open(os.path.join(R,'assets/gilman-logo.png')).convert('RGBA'); lw=560; logo=logo.resize((lw,int(lw*logo.size[1]/logo.size[0])),Image.LANCZOS)
im.paste(logo,(70,60),logo)
def F(sz,bold=True):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p): return ImageFont.truetype(p,sz)
    return ImageFont.load_default(sz)
y=80+logo.size[1]+30
d.text((70,y),'Foam Board',font=F(76),fill=(240,243,250)); d.text((70,y+86),'Stacker',font=F(76),fill=(245,197,66))
d.text((70,y+192),'Tap to drop. Line up a Perfect.',font=F(30,False),fill=(170,178,198))
d.text((70,y+232),'Collect all 16 Gilman boards.',font=F(30,False),fill=(170,178,198))
im.save(os.path.join(R,'og-image.png'),optimize=True)
