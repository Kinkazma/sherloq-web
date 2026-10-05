"""Tile the unchanged 17-layer Noiseprint++ branch with its complete receptive field."""
from pathlib import Path
import json,hashlib,onnx
from onnx import helper as h,TensorProto as T
root=Path(__file__).resolve().parents[1];src=root/'.build/trufor-native-bn';out=root/'.build/trufor-streamed';out.mkdir(exist_ok=True)
m=onnx.load(src/'trufor-bounded.onnx');g=m.graph;chain=[n for n in g.node if '/dncnn/' in n.name and n.op_type not in ('Constant','Identity')];assert sum(n.op_type=='Conv' for n in chain)==17
prefix='bounded_noiseprint/';outer=[];body=[]
def node(op,inputs,name,nodes=None,**attrs):
 name=prefix+name;(outer if nodes is None else nodes).append(h.make_node(op,inputs,[name],name=name,**attrs));return name
def constant(name,value):return node('Constant',[],name,value=h.make_tensor(name,T.INT64,[],[value]))
zero=constant('zero',0);one=constant('one',1);two=constant('two',2);three=constant('three',3);halo=constant('halo',17);both=constant('both',34);cost=constant('cost',4096)
axis=node('Constant',[],'axis',value=h.make_tensor('axis',T.INT64,[1],[2]));unsq=node('Constant',[],'unsq',value=h.make_tensor('unsq',T.INT64,[1],[0]));truth=node('Constant',[],'true',value=h.make_tensor('true',T.BOOL,[],[True]))
shape=node('Shape',['rgb'],'shape');height=node('Gather',[shape,two],'height',axis=0);width=node('Gather',[shape,three],'width',axis=0)
rows=node('Sub',[node('Div',['noiseprint_budget',node('Mul',[cost,width],'row_cost')],'total_rows'),both],'core_rows');chunk=node('Min',[height,node('Max',[one,rows],'at_least_one')],'chunk')
trips=node('Div',[node('Sub',[node('Add',[height,chunk],'round'),one],'rounded'),chunk],'trips');seq=node('SequenceEmpty',[],'sequence',dtype=T.FLOAT)
it=prefix+'iteration';cond=prefix+'condition';incoming=prefix+'incoming'
top=node('Mul',[it,chunk],'top',body);bottom=node('Min',[height,node('Add',[top,chunk],'bottom_before_clamp',body)],'bottom',body)
start=node('Max',[zero,node('Sub',[top,halo],'left',body)],'start',body);stop=node('Min',[height,node('Add',[bottom,halo],'right',body)],'stop',body)
vec=lambda x,name:node('Unsqueeze',[x,unsq],name,body)
crop=node('Slice',['rgb',vec(start,'start_vector'),vec(stop,'stop_vector'),axis],'input',body);mapping={'rgb':crop}
for i,n in enumerate(chain):
 copy=onnx.NodeProto();copy.CopyFrom(n);copy.name=prefix+f'node_{i}';del copy.input[:];copy.input.extend(mapping.get(x,x) for x in n.input);del copy.output[:]
 for j,x in enumerate(n.output):mapping[x]=prefix+f'value_{i}_{j}';copy.output.append(mapping[x])
 body.append(copy)
a=node('Sub',[top,start],'output_start',body);b=node('Sub',[bottom,start],'output_end',body)
part=node('Slice',[mapping[chain[-1].output[0]],vec(a,'output_start_vector'),vec(b,'output_end_vector'),axis],'output',body)
outseq=node('SequenceInsert',[incoming,part],'outgoing',body);ok=node('Identity',[cond],'condition_out',body)
loopbody=h.make_graph(body,prefix+'body',[h.make_tensor_value_info(it,T.INT64,[]),h.make_tensor_value_info(cond,T.BOOL,[]),h.make_tensor_sequence_value_info(incoming,T.FLOAT,None)],[h.make_tensor_value_info(ok,T.BOOL,[]),h.make_tensor_sequence_value_info(outseq,T.FLOAT,None)])
loop=node('Loop',[trips,truth,seq],'loop',body=loopbody);outer.append(h.make_node('ConcatFromSequence',[loop],list(chain[-1].output),axis=2,new_axis=0))
new=[];names={n.name for n in chain}
for n in g.node:
 if n.name==chain[-1].name:new.extend(outer)
 elif n.name not in names:new.append(n)
del g.node[:];g.node.extend(new);g.input.append(h.make_tensor_value_info('noiseprint_budget',T.INT64,[]))
onnx.checker.check_model(m);target=out/'trufor-streamed.onnx';onnx.save(m,target)
r=json.loads((src/'bounded-reference.json').read_text());r.update(file=target.name,bytes=target.stat().st_size,sha256=hashlib.sha256(target.read_bytes()).hexdigest(),noiseprintHalo=17,noiseprintLoops=1,referenceDirectory='../trufor-unfused/')
(out/'reference.json').write_text(json.dumps(r,separators=(',',':'))+'\n');print(r['sha256'])
