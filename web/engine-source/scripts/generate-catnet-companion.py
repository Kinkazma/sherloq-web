from pathlib import Path
import sys,json
import numpy as np
from PIL import Image
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core import catnet
out=root/'.build/catnet';rgb=np.random.default_rng(808).integers(0,256,(71,83,3),dtype=np.uint8)
file,source=catnet.source_for(rgb[:,:,::-1],None,out);image,table,meta=catnet.prepare(file);rgb.tofile(out/'companion-source.rgb');image.numpy().tofile(out/'companion-image.f32');table.numpy().tofile(out/'companion-table.f32')
(out/'companion-reference.json').write_text(json.dumps(dict(width=83,height=71,source=source,metadata=meta,jpeg=file.name,rgb='companion-source.rgb',image='companion-image.f32',table='companion-table.f32'),separators=(',',':'))+'\n')
# Eight actual EXIF transformations, using the native array operation.
values=np.arange(5*7,dtype=np.float32).reshape(5,7)
(root/'tests/data/catnet-orientation.json').write_text(json.dumps([dict(orientation=o,shape=list(catnet.orient(values,o).shape),values=catnet.orient(values,o).ravel().tolist()) for o in range(1,9)],separators=(',',':'))+'\n')
