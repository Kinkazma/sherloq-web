#!/usr/bin/env python3
"""Compare real native ONNX operators with exact row-window/halo assembly."""
import json
import argparse
from pathlib import Path
import numpy as np
import onnxruntime as ort

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--directory',type=Path,required=True)
root=parser.parse_args().directory
manifest=json.loads((root/'segments/manifest.json').read_text())
options=ort.SessionOptions();options.intra_op_num_threads=8
options.graph_optimization_level=ort.GraphOptimizationLevel.ORT_DISABLE_ALL
rows=[]
for stage in range(1,4):
    description=manifest['stages'][stage]
    c,scale=description['channels'],2**stage
    for branch in ['upFused','upMask']:
        name=description[branch]
        session=ort.InferenceSession(str(root/'segments'/manifest['assets'][name]['file']),options,providers=['CPUExecutionProvider'])
        x=np.random.default_rng(900+stage).standard_normal((1,c,19,11)).astype('float32')
        expected=session.run(['result'],{'x':x})[0]
        for step in [1,3,7]:
            actual=np.empty_like(expected)
            halo=1 if stage==1 else 2
            for top in range(0,x.shape[2],step):
                count=min(step,x.shape[2]-top);start=max(0,top-halo);stop=min(x.shape[2],top+count+halo)
                y=session.run(['result'],{'x':np.ascontiguousarray(x[:,:,start:stop])})[0]
                actual[:,:,top*scale:(top+count)*scale]=y[:,:,(top-start)*scale:(top-start+count)*scale]
            row={'graph':name,'step':step,'halo':halo,'max_absolute_error':float(np.abs(actual-expected).max()),'identical':bool(np.array_equal(actual,expected))}
            rows.append(row);assert row['max_absolute_error']<1e-4,row
        del session
# Each depthwise MLP must include the height-concatenation seam, including when
# that seam is exactly a row-window boundary. LayerNorm remains token-local.
for stage,description in enumerate(manifest['stages']):
    name=description['blocks'][0]['mlp'];c=description['channels']
    session=ort.InferenceSession(str(root/'segments'/manifest['assets'][name]['file']),options,providers=['CPUExecutionProvider'])
    x=np.random.default_rng(1200+stage).standard_normal((1,c,50,11)).astype('float32')
    expected=session.run(['result'],{'x':x})[0]
    for step in [7,13,25]:
        actual=np.empty_like(expected)
        for top in range(0,50,step):
            count=min(step,50-top);start=max(0,top-1);stop=min(50,top+count+1)
            y=session.run(['result'],{'x':np.ascontiguousarray(x[:,:,start:stop])})[0]
            actual[:,:,top:top+count]=y[:,:,top-start:top-start+count]
        row={'graph':name,'step':step,'halo':1,'max_absolute_error':float(np.abs(actual-expected).max()),'identical':bool(np.array_equal(actual,expected))}
        rows.append(row);assert row['max_absolute_error']<1e-4,row
    del session
out={'schema':'rita-native-row-window-qualification/1','cases':rows,'passed':len(rows),'scope':'All six trained deconvolution chains and four first-block MLPs preserve exact receptive fields; key/query global-attention splitting is qualified separately.'}
(root/'rita-row-window-qualification.json').write_text(json.dumps(out,indent=2)+'\n')
print(json.dumps({'passed':len(rows),'max_absolute_error':max(r['max_absolute_error'] for r in rows)}))
