"""Original JPEG/TIFF byte paths for the ORB adapter, including depth/alpha/orientation."""
from pathlib import Path
import argparse,hashlib,json,struct,sys
import numpy as np
import cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.cloning import CloningEngine
assert np.__version__=='1.26.4' and cv.__version__=='4.11.0'
parser=argparse.ArgumentParser();parser.add_argument('--algorithm',choices=['orb','akaze'],default='orb');args=parser.parse_args()
algorithm=1 if args.algorithm=='orb' else 2
out=root/('.build/cloning-study' if algorithm==1 else '.build/akaze-pipeline-study');rng=np.random.default_rng(250004)
names=['synthetic.jpg','progressive.jpg','exif-6-le.jpg','codec-rgb16.tiff','codec-gray16.tiff','codec-rgba8.tiff','quality-model/rgb16.tiff','median/median-1024.jpg']
inputs=[(name,(root/'fixtures'/name).read_bytes()) for name in names]
shapes=cv.imread(str(out/'shapes.png'));high=(shapes.astype(np.uint16)<<8)|rng.integers(0,256,shapes.shape,dtype=np.uint16)
ok,encoded=cv.imencode('.tiff',high);assert ok;inputs.append(('generated-shapes-rgb16.tiff',encoded.tobytes()))
ok,jpeg=cv.imencode('.jpg',shapes,[cv.IMWRITE_JPEG_QUALITY,87,cv.IMWRITE_JPEG_PROGRESSIVE,1]);assert ok
inputs.append(('generated-shapes-progressive87.jpg',jpeg.tobytes()))
# Public synthetic APP1, no camera/user metadata. Preserve encoded pixels and
# qualify the EXIF orientation before feature extraction.
exif=b'Exif\0\0'+b'II'+struct.pack('<HIH',42,8,1)+struct.pack('<HHI',0x112,3,1)+struct.pack('<H',6)+b'\0\0'+struct.pack('<I',0)
inputs.append(('generated-shapes-exif6.jpg',jpeg[:2].tobytes()+b'\xff\xe1'+struct.pack('>H',len(exif)+2)+exif+jpeg[2:].tobytes()))
alpha=np.arange(shapes.shape[0]*shapes.shape[1],dtype=np.uint8).reshape(shapes.shape[:2])
ok,rgba=cv.imencode('.tiff',np.dstack((shapes,alpha)));assert ok;inputs.append(('generated-shapes-rgba8.tiff',rgba.tobytes()))
gray=cv.cvtColor(shapes,cv.COLOR_BGR2GRAY).astype(np.uint16)*256+rng.integers(0,256,shapes.shape[:2],dtype=np.uint16)
ok,gray16=cv.imencode('.tiff',gray);assert ok;inputs.append(('generated-shapes-gray16.tiff',gray16.tobytes()))
configs=[(90,20,15,5,False,False),(100,20,15,1,True,False),(90,35,15,5,False,True),(90,20,15,5,True,True)]
cases=[]
for index,(original,data) in enumerate(inputs):
    image_name=('large-' if index==7 else '')+'original-'+str(index)
    file=image_name+'.input';(out/file).write_bytes(data)
    image=cv.imread(str(out/file));assert image is not None and min(image.shape[:2])>=7
    engine=CloningEngine(image)
    for i,params in enumerate(configs):
        prefix=image_name+'-'+str(i)
        record=dict(image=image_name,inputFile=file,sourceFixture=original,originalSha256=hashlib.sha256(data).hexdigest(),width=image.shape[1],height=image.shape[0],mask='all',params=dict(zip(['response','matching','distance','minimum','showPoints','hideLines'],params)),prefix=prefix)
        try:result,stats=engine.analyze((algorithm,)+params)
        except ValueError as error:
            record['error']=str(error);cases.append(record);print(prefix,record['error'],flush=True);continue
        response,matching,distance,minimum,show,hide=params
        points,_=engine.selected.get((algorithm,0,response));filtered,groups=engine.clustered.get((algorithm,0,response,matching,distance))
        points.astype('<f8').tofile(out/(prefix+'-points.f64'));filtered.astype('<f8').tofile(out/(prefix+'-filtered.f64'))
        np.asarray([len(g) for g in groups],dtype='<u4').tofile(out/(prefix+'-lengths.u32'))
        np.asarray(np.concatenate(groups) if groups else [],dtype='<u4').tofile(out/(prefix+'-groups.u32'))
        cv.cvtColor(result,cv.COLOR_BGR2RGB).tofile(out/(prefix+'.rgb'))
        record['stats']=stats;cases.append(record);print(prefix,stats,flush=True)
(out/'original-reference.json').write_text(json.dumps(cases,indent=2)+'\n');print(len(cases),'original-file pipelines')
