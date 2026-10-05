"""Small native-v2 fixtures, always written to this worktree (never shared fixtures)."""
from pathlib import Path
import sys,types,importlib.util,json,os
sys.dont_write_bytecode=True
import numpy as np
root=Path(__file__).resolve().parents[1]
native=Path(os.environ['SHERLOQ_NATIVE_CORE'])
package=types.ModuleType('m5reference');package.__path__=[str(native)];sys.modules[package.__name__]=package
sources=('Forgeryscope Auto','PatchMatch Zernike','PatchMatch SIFT','SIFT + G2NN + RANSAC + Panels + Text','D2PRL')
auto=types.ModuleType('m5reference.automatic_clones');auto.SOURCES=sources;auto.AI_SOURCES=('Forgeryscope Auto','D2PRL');sys.modules[auto.__name__]=auto
from m5reference.clone_corroboration import context_counts,votes,unique_envelopes
from m5reference.clone_relations import annotate,pair_relations
rect=lambda a,b,c,d:[[a,b],[c,b],[c,d],[a,d]]
entries=[]
def entry(source,polygons,context='roi:a',**kwargs):
    v=dict(id=str(len(entries)),source=source,polygons=polygons,search_context=context,**kwargs);entries.append(v);return v
entry(sources[1],[rect(-3,-4,19,24),[[9.5,247.5],[37,262],[8,280.5]]])
entry(sources[1],[rect(4,3,20,20)],context='roi:a')
entry(sources[1],[rect(6,4,22,22)],context='roi:b')
entry(sources[2],[rect(6,4,22,22)])
entry(sources[0],[rect(6,4,22,22)])
mask=np.ones((8,9),np.uint8);mask[2:6,2:7]=0
entry('D2PRL',[rect(2,2,10,9)],context='d2prl-selected-zones',pixel_mask=mask,origin=[2,2])
entry('D2PRL',[rect(3,3,11,10)],context='d2prl-selected-zones',pixel_mask=mask.copy(),origin=[3,3])
entry('ELA biomes',[rect(0,0,41,284)])
# Fractions, diagonal exclusions, native 256-row boundary, out-of-frame edges.
excluded=[[[10.5,0.5],[15.5,10.5],[8.5,16.5]],rect(-3,258,7,268)]
regions=[rect(0,0,20,100),rect(22,0,41,100),rect(0,0,41,284)]
annotations=annotate(entries,regions,regions[-1],(285,42,3))
points=np.array([[3,3],[15,15],[30,20],[20,200],[21,30],[0,0]],np.float32)
pairs=np.array([[0,1],[0,2],[0,3],[2,4],[4,5]],np.int32)
def clean(v):
 if isinstance(v,np.ndarray):return v.tolist()
 if isinstance(v,dict):return {k:clean(x) for k,x in v.items()}
 if isinstance(v,(list,tuple)):return [clean(x) for x in v]
 if isinstance(v,np.generic):return v.item()
 return v
out=root/'tests/data';out.mkdir(exist_ok=True)
(out/'composition-native.json').write_text(json.dumps(clean(dict(width=42,height=285,entries=entries,excluded=excluded,regions=regions,counts=context_counts((285,42),entries,excluded),votes=votes((285,42),entries,excluded),annotations=annotations,points=points,pairs=pairs,pairRelations=pair_relations(dict(points=points,pairs=pairs,regions=regions)))),separators=(',',':'))+'\n')
