"""Native classical entry and ring-context fixtures, with no detector substitutes."""
from pathlib import Path
import sys,json,copy,numpy as np
root=Path(__file__).resolve().parents[1];sys.path.insert(0,str(root.parent/'source'))
from gui.sherloq_app.core.automatic_clones import point_entries,SIFT_SOURCE
from gui.sherloq_app.core.clone_relations import polygon_key,pair_relations
def box(x,y,w,h):return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]]
def encode(x):
 if isinstance(x,np.ndarray):return x.tolist()
 if isinstance(x,np.generic):return x.item()
 raise TypeError(type(x))
points=[];pairs=[];owners=[]
def add(x,y,dx,owner):
 for i,(a,b) in enumerate([(0,0),(12,0),(12,12),(0,12)]):
  left=[x+a,y+b,3,0,1,0,-1];right=[x+a+dx+i*3,y+b,3,0,1,0,-1];at=len(points);points.extend([left,right]);pairs.append([at+(i%2),at+1-(i%2),.2,float(np.linalg.norm(np.array(left[:2])-right[:2]))]);owners.append(owner)
add(5,5,25,0);add(5,30,115,2);add(110,50,30,1);add(5,5,25,2)
regions=[box(0,0,59,79),box(100,0,89,89),box(0,0,200,100)]
base=dict(points=np.array(points,np.float64),pairs=np.array(pairs,np.float64),groups=(np.arange(len(pairs)),),models=({},),regions=regions,pair_search_regions=np.array(owners,np.int32),group_algorithms=('PatchMatch Zernike',),params=(None,None,None,None,None,50),bases=((17,119,241),),biome_partitions=({'parent':0,'kind':'native-subbiome'},))
cases=[]
for name,update,source,split,low,high,maximum in [('dense-split',{},None,True,10,10000,.8),('filtered-stable',{},None,True,10,31,.8),('sift-colors',{},SIFT_SOURCE,False,10,10000,.8),('source-panels',{'models':({'source_panels':[1,2]},)},None,True,10,10000,.8),('compare',{'pair_search_regions':np.full(len(pairs),-1,np.int32)},SIFT_SOURCE,False,10,10000,.8),('unknown-owner',{'pair_search_regions':np.full(len(pairs),8,np.int32)},None,True,10,10000,.8),('unspecified',{'pair_search_regions':None},None,True,10,10000,.8),('self-policy',{'self_match_filter':{'maximum_overlap':0}},None,True,10,10000,.8),('no-groups',{'groups':()},SIFT_SOURCE,False,10,10000,.8),('float32',{'points':np.array(points,np.float32)},None,True,10,10000,.8)]:
 r={**copy.deepcopy(base),**update};expected=point_entries(r,source,low,high,maximum,split)
 cases.append(dict(name=name,result=r,pointType='float32' if r['points'].dtype==np.float32 else 'float64',options=dict(source=source,split=split,low=low,high=high,maximumOverlap=maximum),expected=expected))
lasso=[[0,0],[20,0],[20,20],[10,10],[0,20]]
rings=[[],box(0,0,10,20),lasso,lasso[2:]+lasso[:2],lasso[::-1],lasso+[lasso[0]],[[0,0],[0,0],*lasso[1:]],[[0,0],[20,0],[10,10],[20,20],[0,20]],[[.0001,-.0001],[12.3455,.0004],[12.3455,22.9999]]]
(root/'tests/data/automatic-points-native.json').write_text(json.dumps(dict(cases=cases,rings=[dict(polygon=p,key=polygon_key(p))for p in rings]),default=encode,separators=(',',':'))+'\n');print(len(cases),'point-entry cases and',len(rings),'ring identities')
