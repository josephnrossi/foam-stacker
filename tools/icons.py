from PIL import Image, ImageDraw
import os
here=os.path.dirname(__file__); root=os.path.join(here,'..')
em=Image.open(os.path.join(root,'assets/gilman-emblem.png')).convert('RGBA')
def make(size, maskable=False, rounded=False):
    S=1024; im=Image.new('RGBA',(S,S),(0,0,0,0)); bg=Image.new('RGBA',(S,S)); d=ImageDraw.Draw(bg)
    for y in range(S):
        t=y/S; d.line([(0,y),(S,y)],fill=(int(27-14*t),int(34-19*t),int(54-32*t),255))
    im.paste(bg,(0,0))
    d=ImageDraw.Draw(im); sc=0.8 if maskable else 1.0
    def P(x,y): return (S/2+(x-512)*sc, S/2+(y-512)*sc)
    boards=[('#ffffff','#eceef2',560,250),('#c49a6c','#c49a6c',500,250),('#f5c542','#f3f1ea',440,250),('#2f6fd6','#f3f1ea',380,250)]
    y=900; DX,DY,T=40,48,64
    for face,core,w,_ in boards:
        x=512-w/2-DX/2
        d.polygon([P(x,y-T),P(x+w,y-T),P(x+w+DX,y-T-DY),P(x+DX,y-T-DY)],fill=face)
        d.polygon([P(x+w,y-T),P(x+w+DX,y-T-DY),P(x+w+DX,y-DY),P(x+w,y)],fill='#9097a6')
        d.rectangle([P(x,y-T),P(x+w,y)],fill=core)
        d.rectangle([P(x,y-T),P(x+w,y-T+9)],fill=face if face!='#c49a6c' else '#ffffff')
        d.rectangle([P(x,y-9),P(x+w,y)],fill='#d9dce2' if face!='#2f6fd6' else '#2a5fb8')
        y-=T
    e=em.copy(); ew=int(720*sc); e=e.resize((ew,int(ew*em.size[1]/em.size[0])),Image.LANCZOS)
    im.alpha_composite(e,(int(S/2-ew/2),int(P(0,170)[1])))
    if rounded:
        m=Image.new('L',(S,S),0); ImageDraw.Draw(m).rounded_rectangle([0,0,S-1,S-1],radius=220,fill=255); im.putalpha(m)
    return im.resize((size,size),Image.LANCZOS)
make(192,rounded=True).save(os.path.join(root,'icons/icon-192.png'))
make(512,rounded=True).save(os.path.join(root,'icons/icon-512.png'))
make(512,maskable=True).save(os.path.join(root,'icons/icon-maskable-512.png'))
make(192,maskable=True).save(os.path.join(root,'icons/icon-maskable-192.png'))
make(180).convert('RGB').save(os.path.join(root,'icons/apple-touch-icon.png'))
