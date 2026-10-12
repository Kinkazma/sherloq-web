"""Create local numerical fixtures from a public/reference photograph.

No photograph is embedded in the exported model. These are qualification
artifacts, never calibration work performed by the shipped application.
"""
import argparse,hashlib,json
from pathlib import Path
import cv2,numpy as np
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--export-root',type=Path,required=True);parser.add_argument('--reference-image',type=Path,required=True);args=parser.parse_args();root=args.export_root.resolve()
output=root/'engine-reference';output.mkdir(parents=True,exist_ok=True)
photo=cv2.imread(str(args.reference_image),cv2.IMREAD_COLOR)
if photo is None:raise RuntimeError('Reference photograph unreadable')
texture=cv2.cvtColor(cv2.resize(photo,(160,128),interpolation=cv2.INTER_AREA),cv2.COLOR_BGR2RGB);records=[]
for name,variant,target in [('translation',{'rotation':0,'reflected':False},texture),('quarter-turn',{'rotation':270,'reflected':False},np.rot90(texture,-1)),('reflection',{'rotation':0,'reflected':True},texture[:,::-1])]:
 h,w=target.shape[:2];image=np.zeros((192,384,3),dtype=np.uint8);image[:128,:160]=texture;image[:h,192:192+w]=target
 file=name+'.rgb';data=image.tobytes();(output/file).write_bytes(data);cv2.imwrite(str(output/(name+'.png')),cv2.cvtColor(image,cv2.COLOR_RGB2BGR))
 records.append({'name':name,'variant':variant,'image':{'file':file,'width':384,'height':192,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()},'regions':[[[0,0],[159,0],[159,127],[0,127]],[[192,0],[192+w-1,0],[192+w-1,h-1],[192,h-1]]],'threshold':.2,'longSide':832})
(output/'preparation-reference.json').write_text(json.dumps({'schema':1,'referenceImageSHA':hashlib.sha256(args.reference_image.read_bytes()).hexdigest(),'records':records},indent=2)+'\n')
output=root/'browser-reference';output.mkdir(exist_ok=True);records=[]
for name in ['overlap-different-shapes','equal-shapes','no-matches','higher-threshold','smaller-shapes']:
 z=np.load(root/(name+'.npz'));record={'name':name,'files':{}}
 for key in z.files:
  a=np.ascontiguousarray(z[key],dtype='<f4');data=a.tobytes();file=name+'-'+key+'.f32';(output/file).write_bytes(data);record['files'][key]={'file':file,'dims':list(a.shape),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 records.append(record)
(output/'reference.json').write_text(json.dumps({'schema':1,'records':records,'model':json.loads((root/'manifest.json').read_text())},indent=2)+'\n')
large=(cv2.resize(cv2.imread(str(args.reference_image),cv2.IMREAD_GRAYSCALE),(832,832),interpolation=cv2.INTER_AREA).astype('<f4')/255).reshape(1,1,832,832)
raw=large.tobytes();(output/'dense-832-image.f32').write_bytes(raw)
(output/'large-reference.json').write_text(json.dumps({'file':'dense-832-image.f32','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'dims':list(large.shape)},indent=2)+'\n')
templates=Path(__file__).parent
for name,destination in [('efficient-loftr-qualification.html',output/'qualification.html'),
                         ('efficient-loftr-engine-qualification.html',root/'engine-reference/qualification.html'),
                         ('efficient-loftr-qualification-gpu-worker.mjs',output/'qualification-gpu-worker.mjs'),
                         ('efficient-loftr-large-qualification.html',output/'large.html')]:
 destination.write_text((templates/name).read_text())
print(json.dumps({'graphCases':len(records),'directory':str(root)}))
