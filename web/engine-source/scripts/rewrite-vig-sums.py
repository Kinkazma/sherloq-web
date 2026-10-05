"""Native outer cascade for VIG squared channel norms; no oracle constants."""
from pathlib import Path
import ast,hashlib,json
import numpy as np
import onnx
from onnx import helper as H,numpy_helper as N,TensorProto as T
root=Path(__file__).resolve().parents[1];base=root/'.build/segmentation-models/mgcfdn-vig';fixtures=base/'topk-paired-spots'
reference=json.loads((fixtures/'reference.json').read_text());source=root/'scripts/rewrite-segmentation-mean.py'
definition=next(n for n in ast.parse(source.read_text()).body if isinstance(n,ast.FunctionDef) and n.name=='rewrite_outer')
# Reuse the qualified sum topology, omitting only its final mean division.
changed=0
for statement in definition.body:
    if isinstance(statement,ast.Assign) and isinstance(statement.targets[0],ast.Name) and statement.targets[0].id=='mean':
        assert isinstance(statement.value,ast.Call) and statement.value.func.id=='node' and statement.value.args[0].value=='Div'
        statement.value=ast.Name(id='total',ctx=ast.Load());changed+=1
assert changed==1
namespace=dict(np=np,H=H,N=N,T=T);exec(compile(ast.fix_missing_locations(ast.Module(body=[definition],type_ignores=[])),source.name,'exec'),namespace)
def rewrite(input_name,output_name,prefix):
    nodes,constants=namespace['rewrite_outer'](input_name,prefix+'four_dim',256,640,1,prefix)
    constants.append(N.from_array(np.array([1,256,1],np.int64),prefix+'output_shape'))
    nodes.append(H.make_node('Reshape',[prefix+'four_dim',prefix+'output_shape'],[output_name],name=prefix+'reshape_output'))
    return nodes,constants
model=onnx.load(base/'unfolded.onnx');nodes=[];count=0
for node in model.graph.node:
    if node.op_type=='ReduceSum' and '/dilated_knn_graph/' in node.name:
        native=reference['sums'][count];assert native['input']['shape']==[1,256,640] and native['output']['shape']==[1,256,1]
        replacements,constants=rewrite(node.input[0],node.output[0],'native_vig_sum_'+str(count)+'_');nodes.extend(replacements);model.graph.initializer.extend(constants);count+=1
    else:nodes.append(node)
assert count==len(reference['sums'])==16
model.graph.ClearField('node');model.graph.node.extend(nodes);onnx.checker.check_model(model);target=base/'native-sums.onnx';onnx.save(model,target)
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
un,ui=rewrite('input','output','unit_');graph=H.make_graph(un,'native-vig-square-sum',[H.make_tensor_value_info('input',T.FLOAT,[1,256,640])],[H.make_tensor_value_info('output',T.FLOAT,[1,256,1])],ui)
unit=H.make_model(graph,opset_imports=[H.make_opsetid('',18)],ir_version=10);onnx.checker.check_model(unit);path=fixtures/'sum-unit.onnx';onnx.save(unit,path)
spec=dict(file=path.name,bytes=path.stat().st_size,sha256=sha(path))
(fixtures/'sum-reference.json').write_text(json.dumps(dict(schema=1,records=[dict(r,model=spec) for r in reference['sums']]),indent=2)+'\n')
report=dict(schema=1,status='unqualified-arithmetic-candidate',model=dict(file=target.name,bytes=target.stat().st_size,sha256=sha(target)),sumNodes=count,sourceModelSha256=sha(base/'unfolded.onnx'),reusedMeanSourceSha256=sha(source),scriptSha256=sha(Path(__file__)))
target.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
