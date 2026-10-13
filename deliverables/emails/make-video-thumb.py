# Builds public/email/what-happens-next.jpg (the video card in create-password.html) from the
# broker-onboarding poster style: brand purple, logo, chapter chips, "Watch the video | 3:54" pill.
# Run from this folder; needs Pillow + Segoe UI (Windows).
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W,H=1104,621; S=4
BG=(26,16,53); PINK=(224,69,123); ORANGE=(243,166,75); PURPLE=(147,51,234)
F=lambda n,s: ImageFont.truetype('C:/Windows/Fonts/'+n,s)
im=Image.new('RGBA',(W,H),BG+(255,))
def comp(layer):
    global im; im=Image.alpha_composite(im,layer)
def glow(cx,cy,r,col,a):
    g=Image.new('RGBA',(W,H),(0,0,0,0)); ImageDraw.Draw(g).ellipse([cx-r,cy-r,cx+r,cy+r],fill=col+(a,))
    return g.filter(ImageFilter.GaussianBlur(r*0.6))
def grad(w,h,c1=PINK,c2=ORANGE):
    g=Image.new('RGBA',(w,h)); d=ImageDraw.Draw(g)
    for x in range(w):
        t=x/max(1,w-1); d.line([(x,0),(x,h)],fill=tuple(int(c1[i]+(c2[i]-c1[i])*t) for i in range(3))+(255,))
    return g
def rmask(w,h,r,outline=0):
    m=Image.new('L',(w*S,h*S),0); dr=ImageDraw.Draw(m)
    if outline: dr.rounded_rectangle([0,0,w*S-1,h*S-1],radius=r*S,outline=255,width=outline*S)
    else: dr.rounded_rectangle([0,0,w*S-1,h*S-1],radius=r*S,fill=255)
    return m.resize((w,h),Image.LANCZOS)
def put(src,xy,mask):
    layer=Image.new('RGBA',(W,H),(0,0,0,0)); layer.paste(src,xy,mask); comp(layer)
def spaced(d,cx,y,text,font,fill,sp):
    ws=[d.textbbox((0,0),ch,font=font)[2] for ch in text]; tot=sum(ws)+sp*(len(text)-1); x=cx-tot/2
    for ch,w in zip(text,ws): d.text((x,y),ch,font=font,fill=fill); x+=w+sp
for gl in [glow(110,30,260,PINK,75),glow(1010,610,300,PURPLE,90),glow(552,300,260,(90,40,140),45)]: comp(gl)
put(grad(W,5,PINK,PURPLE),(0,0),None)
logo=Image.open('../../public/email/lead-velocity-logo.png').convert('RGBA'); lw=168; logo=logo.resize((lw,int(logo.height*lw/logo.width)),Image.LANCZOS)
comp(glow(W//2,40+logo.height//2,110,PINK,50))
put(logo,((W-lw)//2,40),logo)
d=ImageDraw.Draw(im); y=40+logo.height+20
spaced(d,W/2,y,'BROKER ONBOARDING',F('seguisb.ttf',18),PINK+(255,),5); y+=38
d.text((W//2,y),'What happens next',font=F('segoeuib.ttf',76),fill=(255,255,255,255),anchor='mt'); y+=102
put(grad(150,6,PINK,PURPLE),((W-150)//2,y),rmask(150,6,3)); y+=30
chips=[('01','Your leads'),('02','Your money'),('03','Getting better')]
fl=F('seguisb.ttf',25); fn=F('seguisb.ttf',16)
widths=[10+46+16+d.textbbox((0,0),t,font=fl)[2]+28 for _,t in chips]
gap=22; x=(W-sum(widths)-gap*2)//2; ch=66
for (n,t),w in zip(chips,widths):
    put(Image.new('RGBA',(w,ch),(255,255,255,20)),(x,y),rmask(w,ch,ch//2))
    put(Image.new('RGBA',(w,ch),(255,255,255,50)),(x,y),rmask(w,ch,ch//2,outline=1))
    c=Image.new('L',(46*S,46*S),0); ImageDraw.Draw(c).ellipse([0,0,46*S-1,46*S-1],fill=255); c=c.resize((46,46),Image.LANCZOS)
    put(grad(46,46,PINK,PURPLE),(x+10,y+10),c)
    d=ImageDraw.Draw(im)
    d.text((x+33,y+33),n,font=fn,fill=(255,255,255,255),anchor='mm')
    d.text((x+72,y+ch//2),t,font=fl,fill=(255,255,255,255),anchor='lm')
    x+=w+gap
y+=ch+32
f=F('seguisb.ttf',28); fb=F('segoeui.ttf',28)
label='Watch the video'; dur='3:54'
lw2=d.textbbox((0,0),label,font=f)[2]; dw=d.textbbox((0,0),dur,font=fb)[2]
ph=74; icon=50; pad=12; pw=pad+icon+18+lw2+20+dw+28
x0=(W-pw)//2; y0=min(y,H-ph-30)
sh=Image.new('RGBA',(W,H),(0,0,0,0)); ImageDraw.Draw(sh).rounded_rectangle([x0,y0+8,x0+pw,y0+ph+12],radius=ph//2,fill=PINK+(120,)); comp(sh.filter(ImageFilter.GaussianBlur(18)))
put(grad(pw,ph),(x0,y0),rmask(pw,ph,ph//2))
c=Image.new('L',(icon*S,icon*S),0); ImageDraw.Draw(c).ellipse([0,0,icon*S-1,icon*S-1],fill=255); c=c.resize((icon,icon),Image.LANCZOS)
cx0,cy0=x0+pad,y0+(ph-icon)//2
put(Image.new('RGBA',(icon,icon),(255,255,255,255)),(cx0,cy0),c)
tri=Image.new('L',(icon*S,icon*S),0); cc=icon*S/2; t=icon*S*0.2
ImageDraw.Draw(tri).polygon([(cc-t*0.75,cc-t),(cc-t*0.75,cc+t),(cc+t*1.05,cc)],fill=255); tri=tri.resize((icon,icon),Image.LANCZOS)
put(Image.new('RGBA',(icon,icon),PINK+(255,)),(cx0+2,cy0),tri)
d=ImageDraw.Draw(im); ty=y0+ph//2
d.text((cx0+icon+18,ty),label,font=f,fill=(255,255,255,255),anchor='lm')
sx=cx0+icon+18+lw2+10; d.line([(sx,ty-13),(sx,ty+13)],fill=(255,255,255,150),width=2)
d.text((sx+10,ty),dur,font=fb,fill=(255,255,255,240),anchor='lm')
im.convert('RGB').save('../../public/email/what-happens-next.jpg',quality=88,optimize=True,progressive=True)
import os; print(os.path.getsize('../../public/email/what-happens-next.jpg'))
