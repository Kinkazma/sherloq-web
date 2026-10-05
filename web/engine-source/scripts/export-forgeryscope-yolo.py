"""Local exports of the two public native YOLO detectors, no external downloads."""
from pathlib import Path
import argparse, copy, hashlib, json, os, sys, gc
import numpy as np
import torch
parser=argparse.ArgumentParser()
parser.add_argument('--native-root',type=Path,default=Path(__file__).resolve().parents[2])
parser.add_argument('--reference-only',action='store_true')
args=parser.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'.build/forgeryscope';out.mkdir(parents=True,exist_ok=True)
(out/'yolo-config/Ultralytics').mkdir(parents=True,exist_ok=True)
os.environ.update(NO_ALBUMENTATIONS_UPDATE='1',YOLO_AUTOINSTALL='false',YOLO_OFFLINE='true',YOLO_CONFIG_DIR=str(out/'yolo-config'))
sys.path[:0]=[str(args.native_root/'source'),str(args.native_root/'integration/clone_detectors')]
from gui.sherloq_app.core.forgeryscope_adapter import local_yolo
from gui.sherloq_app.core.clone_models import verified, WEIGHTS
from ultralytics.data.augment import LetterBox
import ultralytics, cv2, onnx
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
torch.set_num_threads(2)
records=[]
for name in ['yolo_panel_extractor','yolo_lane_extractor']:
    weight,weight_sha=verified(WEIGHTS/'02_forgeryscope'/(name+'.pt'))
    yolo=local_yolo(weight)
    model=yolo.model.float().eval();model.fuse(verbose=False)
    # Export the actual fused prediction graph; decoding stays in the graph, NMS outside.
    exported=copy.deepcopy(model)
    head=exported.model[-1];head.export=True;head.format='onnx';head.dynamic=True
    sample=torch.zeros(1,3,640,640)
    target=out/(name+'.onnx')
    if not args.reference_only:
        with torch.inference_mode():
            torch.onnx.export(exported,(sample,),target,input_names=['rgb'],output_names=['predictions'],opset_version=18,dynamo=False,
                external_data=False,dynamic_axes={'rgb':{2:'height',3:'width'},'predictions':{2:'anchors'}})
    else:
        previous=json.loads((out/(name+'.json')).read_text())
        assert previous['sha256']==sha(target) and previous['checkpointSha256']==weight_sha
    graph=onnx.load(target);onnx.checker.check_model(graph)
    cases=[]
    images=[]
    for h,w in [(257,401),(320,128)]:
        yy,xx=np.mgrid[:h,:w]
        images.append(np.stack([(xx*7+yy*11)%256,(xx*3+yy*13)%256,(xx*17+yy*5)%256],axis=2).astype(np.uint8))
    sample_root=args.native_root/'third_party/research/clone_detectors/02_forgeryscope/examples/sample_data'
    from PIL import Image
    for filename in ['wblot_sample.png','kaggle_supplemental_img_20833.png']:
        images.append(np.asarray(Image.open(sample_root/filename).convert('RGB')))
    for index,rgb in enumerate(images):
        h,w=rgb.shape[:2]
        # Native callers pass their RGB arrays directly to Ultralytics ndarray API,
        # which reverses channels (normally treating ndarray as BGR). Preserve it.
        padded=LetterBox((640,640),auto=True,stride=int(model.stride.max()))(image=rgb)
        inp=torch.from_numpy(np.ascontiguousarray(padded[:,:,::-1].transpose(2,0,1))[None]).float().div_(255).numpy()
        with torch.inference_mode():
            native=model(torch.from_numpy(inp))[0].cpu().numpy()
            actual=exported(torch.from_numpy(inp)).cpu().numpy()
        assert np.array_equal(native,actual), 'Export mode changed native decoded predictions'
        prefix=f'{name}-{index}'
        rgb.tofile(out/(prefix+'.rgb'));inp.astype('<f4').tofile(out/(prefix+'.f32'));native.astype('<f4').tofile(out/(prefix+'-predictions.f32'))
        result=yolo.predict(rgb,conf=.7 if name=='yolo_panel_extractor' else .3,iou=.4 if name=='yolo_panel_extractor' else .1,imgsz=640,device='cpu',verbose=False)[0]
        assert np.array_equal(inp,yolo.predictor.preprocess([rgb]).cpu().numpy()), 'Native predictor preprocessing differs'
        cases.append(dict(id=prefix,width=w,height=h,inputShape=list(inp.shape),outputShape=list(native.shape),rgbFile=prefix+'.rgb',inputFile=prefix+'.f32',outputFile=prefix+'-predictions.f32',boxes=result.boxes.data.cpu().numpy().tolist()))
    record=dict(id=name,checkpointSha256=weight_sha,file=target.name,bytes=target.stat().st_size,sha256=sha(target),classes=model.names,stride=int(model.stride.max()),cases=cases)
    records.append(record);(out/(name+'.json')).write_text(json.dumps(record,separators=(',',':'))+'\n')
    print(json.dumps(dict(model=name,bytes=record['bytes'],cases=len(cases),boxes=[len(c['boxes']) for c in cases])),flush=True)
    del yolo,model,exported,graph;gc.collect()
(out/'yolo-reference.json').write_text(json.dumps(dict(schema=1,torch=torch.__version__,ultralytics=ultralytics.__version__,opencv=cv2.__version__,models=records),separators=(',',':'))+'\n')
