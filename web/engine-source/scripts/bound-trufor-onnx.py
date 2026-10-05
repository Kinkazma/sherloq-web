"""Preserve global attention and pointwise fusion using dynamic ONNX row loops.

The loop contains the original operators, inputs and weights. Only independent
query/fusion rows are partitioned. No key, image pixel or context is discarded.
"""
from pathlib import Path
import argparse,json,hashlib
import onnx
from onnx import helper as h,TensorProto as T
p=argparse.ArgumentParser();p.add_argument('--directory',type=Path,default=Path(__file__).resolve().parents[1]/'.build/trufor-unfused');a=p.parse_args()
m=onnx.load(a.directory/'trufor.onnx');g=m.graph;prod={o:n for n in g.node for o in n.output};cons={}
for n in g.node:
 for x in n.input:cons.setdefault(x,[]).append(n)
replacements={};removed=set();loops=0
# Each scalar budget is supplied from the admitted workspace, never measured by a preflight.
g.input.append(h.make_tensor_value_info('attention_budget',T.INT64,[]))
for soft in list(g.node):
 if soft.op_type!='Softmax' or next((a.i for a in soft.attribute if a.name=='axis'),0)!=-1:continue
 mul=prod[soft.input[0]];mm=prod[mul.input[0]];end=cons[soft.output[0]][0]
 assert mul.op_type=='Mul' and mm.op_type=='MatMul' and end.op_type=='MatMul'
 assert len(cons[mm.output[0]])==len(cons[mul.output[0]])==len(cons[soft.output[0]])==1
 prefix=f'bounded_attention_{loops}/';outer=[];body=[]
 def node(op,inputs,output,nodes=outer,**attrs):
  name=prefix+output;nodes.append(h.make_node(op,inputs,[name],name=name,**attrs));return name
 def constant(name,values,dims=[],typ=T.INT64):return node('Constant',[],name,value=h.make_tensor(prefix+name,typ,dims,values))
 zero=constant('zero',[0]);one=constant('one',[1]);two=constant('two',[2]);three=constant('three',[3]);four=constant('four',[4]);axis=constant('axis',[2],[1]);unsqueeze=constant('unsqueeze',[0],[1]);truth=constant('true',[True],typ=T.BOOL)
 shape=node('Shape',[mm.input[0]],'query_shape');ks=node('Shape',[mm.input[1]],'key_shape')
 count=node('Gather',[shape,two],'count',axis=0);batch=node('Gather',[shape,zero],'batch',axis=0);heads=node('Gather',[shape,one],'heads',axis=0);keys=node('Gather',[ks,three],'keys',axis=0)
 rows=node('Mul',[node('Mul',[batch,heads],'batch_heads'),node('Mul',[keys,four],'key_bytes')],'row_bytes')
 chunk=node('Min',[count,node('Max',[one,node('Div',['attention_budget',rows],'budget_rows')],'positive_rows')],'chunk')
 trips=node('Div',[node('Sub',[node('Add',[count,chunk],'rounded'),one],'rounded_minus_one'),chunk],'trips')
 sequence=node('SequenceEmpty',[],'sequence',dtype=T.FLOAT)
 iteration=prefix+'iteration';condition=prefix+'condition';incoming=prefix+'incoming'
 start=node('Mul',[iteration,chunk],'start',body);stop=node('Add',[start,chunk],'stop',body)
 sv=node('Unsqueeze',[start,unsqueeze],'start_vector',body);ev=node('Unsqueeze',[stop,unsqueeze],'stop_vector',body)
 part=node('Slice',[mm.input[0],sv,ev,axis],'query_part',body)
 scores=node('MatMul',[part,mm.input[1]],'scores',body)
 scaled=node('Mul',[scores,mul.input[1]],'scaled',body)
 probabilities=node('Softmax',[scaled],'probabilities',body,axis=-1)
 values=node('MatMul',[probabilities,end.input[1]],'values',body)
 outgoing=node('SequenceInsert',[incoming,values],'outgoing',body)
 condition_out=node('Identity',[condition],'condition_out',body)
 loopbody=h.make_graph(body,prefix+'body',[h.make_tensor_value_info(iteration,T.INT64,[]),h.make_tensor_value_info(condition,T.BOOL,[]),h.make_tensor_sequence_value_info(incoming,T.FLOAT,None)],[h.make_tensor_value_info(condition_out,T.BOOL,[]),h.make_tensor_sequence_value_info(outgoing,T.FLOAT,None)])
 result=node('Loop',[trips,truth,sequence],'loop',body=loopbody)
 outer.append(h.make_node('ConcatFromSequence',[result],list(end.output),name=prefix+'concat',axis=2,new_axis=0))
 replacements[end.name]=outer;removed.update([mm.name,mul.name,soft.name,end.name]);loops+=1
# The two MLP heads contain only pointwise operators after concatenation.
fusion_loops=0
g.input.append(h.make_tensor_value_info('fusion_budget',T.INT64,[]))
for conv in list(g.node):
 if conv.op_type!='Conv' or '/linear_fuse/' not in conv.name:continue
 joined=prod[conv.input[0]];chain=[joined,conv];cursor=conv
 while True:
  users=cons.get(cursor.output[0],[])
  if len(users)!=1 or users[0].op_type not in ('BatchNormalization','Relu','Conv'):break
  cursor=users[0];chain.append(cursor)
 assert chain[-1].op_type=='Conv' and 'linear_pred' in chain[-1].name
 prefix=f'bounded_fusion_{fusion_loops}/';outer=[];body=[]
 # node()/constant() close over this row-loop's prefix and lists.
 # Their default list was bound previously, so declare them again.
 def node(op,inputs,output,nodes=None,**attrs):
  name=prefix+output;(outer if nodes is None else nodes).append(h.make_node(op,inputs,[name],name=name,**attrs));return name
 def constant(name,values,dims=[],typ=T.INT64):return node('Constant',[],name,value=h.make_tensor(prefix+name,typ,dims,values))
 zero=constant('zero',[0]);one=constant('one',[1]);two=constant('two',[2]);three=constant('three',[3]);axis=constant('axis',[2],[1]);unsqueeze=constant('unsqueeze',[0],[1]);truth=constant('true',[True],typ=T.BOOL)
 shape=node('Shape',[joined.input[0]],'shape');height=node('Gather',[shape,two],'height',axis=0);width=node('Gather',[shape,three],'width',axis=0)
 # Four 512-channel feature planes, float32, batch one (the native API).
 rowbytes=node('Mul',[width,constant('bytes_per_pixel',[4*512*4])],'row_bytes')
 chunk=node('Min',[height,node('Max',[one,node('Div',['fusion_budget',rowbytes],'budget_rows')],'positive_rows')],'chunk')
 trips=node('Div',[node('Sub',[node('Add',[height,chunk],'rounded'),one],'rounded_minus_one'),chunk],'trips')
 sequence=node('SequenceEmpty',[],'sequence',dtype=T.FLOAT);iteration=prefix+'iteration';condition=prefix+'condition';incoming=prefix+'incoming'
 start=node('Mul',[iteration,chunk],'start',body);stop=node('Add',[start,chunk],'stop',body)
 sv=node('Unsqueeze',[start,unsqueeze],'start_vector',body);ev=node('Unsqueeze',[stop,unsqueeze],'stop_vector',body)
 parts=[node('Slice',[x,sv,ev,axis],f'part_{i}',body) for i,x in enumerate(joined.input)]
 mapping={}
 for i,original in enumerate(chain):
  copied=onnx.NodeProto();copied.CopyFrom(original);copied.name=prefix+f'operation_{i}'
  del copied.input[:];copied.input.extend(parts if i==0 else [mapping.get(x,x) for x in original.input])
  del copied.output[:]
  for j,x in enumerate(original.output):mapping[x]=prefix+f'value_{i}_{j}';copied.output.append(mapping[x])
  body.append(copied)
 outgoing=node('SequenceInsert',[incoming,mapping[chain[-1].output[0]]],'outgoing',body);condition_out=node('Identity',[condition],'condition_out',body)
 loopbody=h.make_graph(body,prefix+'body',[h.make_tensor_value_info(iteration,T.INT64,[]),h.make_tensor_value_info(condition,T.BOOL,[]),h.make_tensor_sequence_value_info(incoming,T.FLOAT,None)],[h.make_tensor_value_info(condition_out,T.BOOL,[]),h.make_tensor_sequence_value_info(outgoing,T.FLOAT,None)])
 result=node('Loop',[trips,truth,sequence],'loop',body=loopbody)
 outer.append(h.make_node('ConcatFromSequence',[result],list(chain[-1].output),name=prefix+'concat',axis=2,new_axis=0))
 replacements[chain[-1].name]=outer;removed.update(x.name for x in chain);fusion_loops+=1
nodes=[]
for n in g.node:
 if n.name in replacements:nodes.extend(replacements[n.name])
 elif n.name not in removed:nodes.append(n)
del g.node[:];g.node.extend(nodes)
onnx.checker.check_model(m)
path=a.directory/'trufor-bounded.onnx';onnx.save(m,path)
record=json.loads((a.directory/'reference.json').read_text());record.update(file=path.name,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),bytes=path.stat().st_size,attentionLoops=loops,fusionLoops=fusion_loops,graphOptimizationLevel='disabled')
(a.directory/'bounded-reference.json').write_text(json.dumps(record,separators=(',',':'))+'\n');print('Bounded attention blocks:',loops)
