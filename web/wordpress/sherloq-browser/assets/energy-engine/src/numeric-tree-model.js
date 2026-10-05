import "../../runtime-context.js?v=0.14.5";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

const f32=Math.fround;
const unsupported=message=>{throw new EngineError('UNSUPPORTED_MODEL',message);};
const integer=(value,name)=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<0)unsupported('Invalid '+name+'.');return n;};

// This reproduces float32 operations, but expf implementations can differ by an
// ulp. Margin identity and probability/detection qualification are separate.
export function medianSigmoid(margin){
 const exponent=f32(Math.exp(Math.min(-margin,f32(88.7))));
 return f32(1/f32(f32(exponent+1)+f32(1e-16)));
}

// Restricted saved-model reader, not a Python pickle/dump loader. Models are
// supplied locally; no trained weights, network request or training is embedded.
export async function compileNumericTreeModel(bytes,{budget,signal,onProgress,kind}={}){
 const specs={median:{features:[8,24,96,128],objective:'binary:logistic',initialMargin:0,format:'xgboost-numeric-binary-logistic'},'jpeg-quality':{features:[100],objective:'reg:squarederror',initialMargin:.5,format:'xgboost-numeric-quality-regression'}};
 if(!Object.hasOwn(specs,kind))unsupported('Unknown numeric tree-model family.');const spec=specs[kind];
 requireValue(bytes instanceof Uint8Array&&bytes.length>0&&bytes.length<=64*1024**2,'A JSON model of at most64 MiB is required.');
 requireValue(budget&&typeof budget.reserve==='function','A shared model budget is required.');checkAbort(signal);
 // JSON text, parsed number arrays, typed conversion and validation coexist.
 // This conservative loading bound is explicit; retained inference is smaller.
 const release=budget.reserve(bytes.length*32+1024**2);let parsed,retained=false,retainedBytes=0;
 try{
  await controlCheckpoint(signal);
  try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{unsupported('Model is not valid UTF-8 saved-model JSON.');}
  let learner=parsed?.learner,parameters=learner?.learner_model_param,booster=learner?.gradient_booster,model=booster?.model;
  if(!parameters||booster?.name!=='gbtree'||learner.objective?.name!==spec.objective)unsupported('Booster/objective does not match this verified model family.');
  const features=integer(parameters.num_feature,'feature count');
  if(!spec.features.includes(features)||integer(parameters.num_class,'class count')!==0||integer(parameters.num_target??1,'target count')!==1||Number(parameters.base_score)!==.5)unsupported('Numeric tree model features, outputs or base score are not qualified.');
  let trees=model?.trees;if(!Array.isArray(trees)||trees.length<1||trees.length>10000||!Array.isArray(model.tree_info)||model.tree_info.length!==trees.length||model.tree_info.some(x=>x!==0))unsupported('Invalid model tree groups.');
  if(integer(model.gbtree_model_param?.num_trees,'tree count')!==trees.length||integer(model.gbtree_model_param?.num_parallel_tree??1,'parallel tree count')!==1||integer(model.gbtree_model_param?.size_leaf_vector??0,'leaf vector size')!==0)unsupported('Unsupported forest layout.');
  let nodeCount=0;for(const tree of trees){nodeCount+=integer(tree?.tree_param?.num_nodes,'node count');if(nodeCount>1000000)unsupported('Numeric tree model exceeds one million nodes.');}
  let left=new Int32Array(nodeCount),right=new Int32Array(nodeCount),indices=new Uint16Array(nodeCount),values=new Float32Array(nodeCount),missing=new Uint8Array(nodeCount),roots=new Uint32Array(trees.length);
  retainedBytes=left.byteLength+right.byteLength+indices.byteLength+values.byteLength+missing.byteLength+roots.byteLength;
  let base=0;
  for(let t=0;t<trees.length;t++){
   if(t%32===0){await controlCheckpoint(signal);onProgress?.(t/trees.length);}
   const tree=trees[t],params=tree.tree_param,n=integer(params.num_nodes,'node count');
   if(n<1||integer(params.num_feature,'tree feature count')!==features||integer(params.num_deleted,'deleted nodes')!==0||integer(params.size_leaf_vector,'tree leaf vector')!==0)unsupported('Unsupported tree parameters.');
   for(const name of ['left_children','right_children','split_indices','split_conditions','default_left','split_type'])if(!Array.isArray(tree[name])||tree[name].length!==n)unsupported('Inconsistent tree arrays.');
   if(['categories','categories_nodes','categories_segments','categories_sizes'].some(name=>!Array.isArray(tree[name])||tree[name].length))unsupported('Categorical trees are not qualified.');
   roots[t]=base;
   for(let i=0;i<n;i++){
    const a=tree.left_children[i],b=tree.right_children[i],index=tree.split_indices[i],value=tree.split_conditions[i],direction=tree.default_left[i];
    if(!Number.isInteger(a)||!Number.isInteger(b)||a< -1||b< -1||a>=n||b>=n||(a===-1)!==(b===-1)||tree.split_type[i]!==0||![0,1].includes(direction)||typeof value!=='number'||!Number.isFinite(f32(value))||!Number.isInteger(index)||index<0||index>=features)unsupported('Invalid numeric tree node.');
    left[base+i]=a===-1?-1:base+a;right[base+i]=b===-1?-1:base+b;indices[base+i]=index;values[base+i]=value;missing[base+i]=direction;
   }
   // Visit every node once without recursion; reject cycles, shared children,
   // unreachable nodes and excessive depth before inference can run.
   const seen=new Uint8Array(n),queue=new Uint32Array(n),depth=new Uint16Array(n);let head=0,tail=1;seen[0]=1;
   while(head<tail){const i=queue[head++];for(const child of [tree.left_children[i],tree.right_children[i]])if(child!==-1){if(seen[child]||tail===n||depth[i]>=64)unsupported('Invalid tree topology or unsupported depth.');seen[child]=1;depth[child]=depth[i]+1;queue[tail++]=child;}}
   if(tail!==n)unsupported('Model contains unreachable nodes.');base+=n;
  }
  checkAbort(signal);onProgress?.(1);checkAbort(signal);
  const modelVersion=Array.isArray(parsed.version)?parsed.version.slice():[];
  if(modelVersion.length!==3||!modelVersion.every(x=>Number.isInteger(x)&&x>=0)||![1,2].includes(modelVersion[0]))unsupported('Unverified model serialization version.');
  parsed=learner=parameters=booster=model=trees=null;release();budget.retain(retainedBytes);retained=true;let disposed=false,activePredictions=0;
  const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Numeric tree model disposed.');};
  const free=()=>{if(disposed&&!activePredictions&&left){left=right=indices=values=missing=roots=null;budget.retained-=retainedBytes;}};
  return {
   metadata:Object.freeze({format:spec.format,features,trees:roots.length,nodes:nodeCount,baseScore:.5,modelVersion:Object.freeze(modelVersion),retainedBytes,scoreParity:kind==='median'?'Float32 sigmoid; expf rounding requires independent probability and decision checks.':'Sequential float32 additions starting with the stored base score; no sigmoid or clipping.'}),
   async predict(input,{signal,onProgress}={}){
    alive();
    requireValue((input instanceof Float64Array||input instanceof Float32Array)&&input.length%features===0,'Model features must be complete float rows.');checkAbort(signal);
    const count=input.length/features,releaseOutput=budget.reserve(count*8+features*4);activePredictions++;
    try{
     const margins=new Float32Array(count),scores=new Float32Array(count),row=new Float32Array(features);
     for(let i=0;i<count;i++){
      if(i%8===0){await controlCheckpoint(signal);alive();onProgress?.(i/count);alive();}
      for(let c=0;c<features;c++){const value=f32(input[i*features+c]);requireValue(Number.isFinite(value)||Number.isNaN(value),'Infinite model feature.');row[c]=value;}
      let sum=spec.initialMargin;
      for(const root of roots){let node=root;while(left[node]!==-1){const x=row[indices[node]];node=Number.isNaN(x)?(missing[node]?left[node]:right[node]):x<values[node]?left[node]:right[node];}sum=f32(sum+values[node]);}
      if(!Number.isFinite(sum))throw new EngineError('NUMERIC_RANGE','Tree model margin overflowed float32.');
      margins[i]=sum;scores[i]=kind==='median'?medianSigmoid(sum):sum;
     }
     onProgress?.(1);checkAbort(signal);alive();return {margins,scores,release:releaseOutput};
    }catch(error){releaseOutput();if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Tree prediction allocation failed.');throw error;}finally{activePredictions--;free();}
   },
   dispose(){disposed=true;free();}
  };
 }catch(error){if(retained)budget.retained-=retainedBytes;if(error instanceof RangeError)throw new EngineError('MEMORY_ALLOCATION','Numeric tree model allocation failed after admission.');throw error;}
 finally{parsed=null;release();}
}
