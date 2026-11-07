# Builds the static TTF instances in this folder from shared/fonts (needs: pip install fonttools brotli).
import sys, os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.merge import Merger
HERE=os.path.dirname(os.path.abspath(__file__)); F=os.path.join(HERE,'../../shared/fonts/'); TMP='/tmp'
OUT=HERE+'/'
os.makedirs(OUT, exist_ok=True)
jobs=[
 ('inter-tight','inter-tight-var-normal','InterTight',[(400,'Regular'),(700,'Bold')],{}),
 ('archivo','archivo-var-normal','Archivo',[(400,'Regular'),(800,'ExtraBold')],{'wdth':100}),
 ('jetbrains-mono','jetbrains-mono-var-normal','JetBrainsMono',[(400,'Regular'),(600,'SemiBold')],{}),
 ('instrument-serif','instrument-serif-normal','InstrumentSerif',[(None,'Regular')],{}),
 ('instrument-serif','instrument-serif-italic','InstrumentSerif',[(None,'Italic')],{}),
 ('caveat','caveat-normal','Caveat',[(None,'Regular')],{}),
]
for d,base,name,inst,extra in jobs:
  for w,style in inst:
    parts=[]
    for sub in ['latin','latin-ext']:
      f=TTFont(F+d+'/'+base+'-'+sub+'.woff2')
      f.flavor=None
      if 'fvar' in f:
        loc=dict(extra)
        for a in f['fvar'].axes:
          if a.axisTag=='wght': loc['wght']=w if w else a.defaultValue
          elif a.axisTag not in loc: loc[a.axisTag]=a.defaultValue
        f=instancer.instantiateVariableFont(f,loc)
      p=os.path.join(TMP,'%s-%s-%s.ttf'%(name,style,sub))
      f.save(p); parts.append(p)
    try:
      m=Merger().merge(parts)
    except Exception as e:
      print('merge failed',name,style,e); m=TTFont(parts[0])
    for t in ['GSUB','GPOS','GDEF','STAT','DSIG']:
      if t in m: del m[t]
    m.flavor=None
    out=OUT+'%s-%s.ttf'%(name,style)
    m.save(out); print(out, os.path.getsize(out), 'glyphs', len(m.getGlyphOrder()), 'glyf' in m)
