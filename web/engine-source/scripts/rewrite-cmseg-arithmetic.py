"""Reuse the native D2PRL cascade mean and segmentation BN arithmetic.

The mean geometry is extended from224 to256 after checking the same cascade
radix still applies. No activations, masks or fitted corrections enter a graph.
"""
from pathlib import Path
import argparse, ast, ctypes as C, ctypes.util, hashlib, json
import numpy as np
import onnx
from onnx import helper as H, numpy_helper as N, TensorProto as T
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('variant',choices=['generalization','addnoise']);parser.add_argument('--bn',action='store_true');args=parser.parse_args()
base=root/'.build/segmentation-models'/('cmseg-'+args.variant)
reference=json.loads((base/'split-reference.json').read_text())
name='native-mean-bn' if args.bn else 'native-mean'
source=root/'scripts/rewrite-d2prl-mean.py'
parsed=ast.parse(source.read_text().replace('plane<=224*224','plane<=256*256'))
definitions=[node for node in parsed.body if isinstance(node,ast.FunctionDef) and node.name=='rewrite']
namespace=dict(np=np,H=H,N=N,T=T);exec(compile(ast.Module(body=definitions,type_ignores=[]),source.name,'exec'),namespace)
rewrite_mean=namespace['rewrite']
lib=C.CDLL(ctypes.util.find_library('m'));lib.fmaf.argtypes=[C.c_float,C.c_float,C.c_float];lib.fmaf.restype=C.c_float
graphs={}
for part in ['encoder','decoder']:
    model=onnx.load(base/(part+'.onnx'));nodes=[];means=0;bns=0
    values={v.name:N.to_array(v) for v in model.graph.initializer}
    aliases={n.output[0]:n.input[0] for n in model.graph.node if n.op_type=='Identity'}
    def resolve(value):
        while value in aliases:value=aliases[value]
        return np.asarray(values[value],np.float32)
    for item in model.graph.node:
        if item.op_type=='GlobalAveragePool':
            expected=[('aspp4',16,256)] if part=='encoder' else [('aspp3',24,128),('aspp2',32,64),('aspp1',96,32)]
            key,c,side=expected[means];assert '/'+key+'/' in item.name
            replacements,constants=rewrite_mean(item.input[0],item.output[0],c,side,side,'native_pool_'+str(means)+'_')
            nodes.extend(replacements);model.graph.initializer.extend(constants);means+=1
        elif args.bn and item.op_type=='BatchNormalization':
            attrs={a.name:H.get_attribute_value(a) for a in item.attribute};assert len(item.output)==1 and attrs.get('training_mode',0)==0
            weight,bias,mean,variance=[resolve(n) for n in item.input[1:]]
            alpha=weight*(np.float32(1)/np.sqrt(variance+np.float32(attrs.get('epsilon',1e-5))))
            beta=np.array([lib.fmaf(-float(m),float(a),float(b)) for m,a,b in zip(mean,alpha,bias)],np.float32)
            prefix='native_bn_'+str(bns)+'_';an,bn=prefix+'alpha',prefix+'beta'
            model.graph.initializer.extend([N.from_array(alpha.reshape(1,-1,1,1),an),N.from_array(beta.reshape(1,-1,1,1),bn)])
            nodes.extend([H.make_node('Mul',[item.input[0],an],[prefix+'product'],name=prefix+'mul'),H.make_node('Add',[prefix+'product',bn],list(item.output),name=prefix+'add')]);bns+=1
        else:nodes.append(item)
    assert means==(1 if part=='encoder' else 3)
    model.graph.ClearField('node');model.graph.node.extend(nodes);onnx.checker.check_model(model)
    target=base/(part+'-'+name+'.onnx');onnx.save(model,target);data=target.read_bytes()
    graphs[part]=dict(file=target.name,bytes=len(data),sha256=hashlib.sha256(data).hexdigest(),meanNodes=means,batchnormNodes=bns)
report=dict(schema=1,status='unqualified-arithmetic-candidate',graphs=graphs,sourceGraphs=reference['graphs'],meanSourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),scriptSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
(base/(name+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report),flush=True)
