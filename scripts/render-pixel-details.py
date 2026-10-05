"""Magnify exact source/result windows around reported pixel candidates."""
from pathlib import Path
import json,hashlib
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image
root=Path(__file__).resolve().parent.parent
folder=Path(__file__).resolve().parent/'results/street-dead-hot-pixels'
p=folder/'result.json';r=json.loads(p.read_text())
source=Image.open(root/r['job']['input']).convert('RGB');overlay=Image.open(folder/'result.png').convert('RGB')
values=r['candidates'];locations=sorted(set((values[i],values[i+1]) for i in range(0,len(values),6)))[:6]
fig,axes=plt.subplots(len(locations),2,figsize=(6,2.4*len(locations)),dpi=130,layout='constrained')
windows=[]
for row,(x,y) in enumerate(locations):
 box=(max(0,x-12),max(0,y-12),min(source.width,x+13),min(source.height,y+13));windows.append({'candidate':[x,y],'box':list(box)})
 for col,(image,label) in enumerate([(source,'Original pixels'),(overlay,'Detector overlay')]):
  ax=axes[row,col];ax.imshow(image.crop(box),interpolation='nearest');ax.set_title(f'{label} · ({x}, {y})',fontsize=9);ax.set_axis_off()
fig.suptitle('Street Photo — six reported pixel candidates',fontsize=13)
out=folder/'details.png';fig.savefig(out,facecolor='white');plt.close(fig)
im=Image.open(out).convert('RGB');sha=lambda b:hashlib.sha256(b).hexdigest()
r['outputs']=[{'file':'result.png','width':r['outputDimensions'][0],'height':r['outputDimensions'][1],'sha256':r['outputSha256'],'rawRgbSha256':r['rawRgbSha256']},{'file':'details.png','width':im.width,'height':im.height,'sha256':sha(out.read_bytes()),'rawRgbSha256':sha(im.tobytes())}]
r['presentation']={'windows':windows,'selection':'First six distinct reported coordinates sorted by x then y.','sampling':'Nearest-neighbor display of unmodified source/result windows.'}
p.write_text(json.dumps(r,indent=2)+'\n')
