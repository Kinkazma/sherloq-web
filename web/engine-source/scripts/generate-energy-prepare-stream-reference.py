"""Owned native preparation reference with deterministic streamed inputs."""
from pathlib import Path
import sys,json,hashlib,numpy as np,cv2 as cv
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'));cv.setNumThreads(1)
from gui.sherloq_app.core.ela_energy import prepare_energy,segment_energy
from gui.sherloq_app.core.auto_zones import detect_panels
from gui.sherloq_app.core.ela_energy_auto import estimate,deviations
w,h=1027,1021;n=w*h;i=np.arange(n,dtype=np.uint32);x=i%w;y=i//w
v=((i*73)&255).astype(np.uint8);v[(x<3)|(x>=w-3)|(y<3)|(y>=h-3)|(abs(x.astype(np.int64)-w//2)<3)]=255
rgb=np.repeat(v[:,None],3,axis=1).reshape(h,w,3)
planes=np.stack([(((i*(17+q*4))^(i>>3))&65535).astype(np.float64)/257 for q in range(3)]).astype(np.float32).reshape(3,h,w)
polygons=detect_panels(rgb);quantiles=[.01,.99];result=prepare_energy(rgb,planes,quantiles=quantiles)
sha=lambda a:hashlib.sha256(a.tobytes()).hexdigest()
labels,regions=segment_energy({**result,'metadata':{'block':16}},0,1,offset=7,energy_thresholds=[1,1])
report=dict(width=w,height=h,quantiles=quantiles,polygons=[p.astype(int).tolist() if hasattr(p,'astype') else [[int(a),int(b)] for a,b in p] for p in polygons],summary=result['energy_summary'],segmentation=dict(block=16,minimum=1,offset=7,thresholds=[1,1],labelsSha256=sha(labels),regions=regions),profileEstimate=estimate({**result,'energy_planes':planes}),scoreDeviations=deviations(result),sourceSha256=sha(rgb),planeSha256=[sha(p) for p in planes],arrays={k:sha(result[k]) for k in ['energy_low_score','energy_high_score','energy_scope']},nativeSha256=hashlib.sha256((root.parent/'source/gui/sherloq_app/core/ela_energy.py').read_bytes()).hexdigest(),numpy=np.__version__,opencv=cv.__version__)
(root/'tests/data/energy-prepare-stream-native.json').write_text(json.dumps(report,indent=2)+'\n');print(len(polygons),'native panels')
