import sys
def sub(p,a,b,all=False):
    s=open(p,newline='',encoding='utf-8').read()
    assert a in s,(p,a)
    if not all: assert s.count(a)==1,(p,a,s.count(a))
    open(p,'w',newline='',encoding='utf-8').write(s.replace(a,b))
