import "../../runtime-context.js?v=0.25.0";
import{readOnnxGraph,onnxInput,onnxNode}from'./onnx-scoped-graph.js';import{requireValue}from'./errors.js';
export const SELFDM_PROPOSAL_SUPERGLUE_SHA256='2964d7a675c295999c86b6ccaf90eb5297ca2b2200dbdeb813a21eabb2361b88';
export const SELFDM_PROPOSAL_SUPERGLUE_SHAPE_POLICY='selfdm-proposal-superglue-shapes/1';
export const SELFDM_PROPOSAL_SUPERGLUE_SHAPES=Object.freeze(['proposal_image_shape0','proposal_image_shape1']);
const names=['image0','image1'],expected=['/net/Shape','/net/Shape_1','/net/Shape_2','/net/Shape_3'];
function concat(parts){const n=parts.reduce((n,p)=>n+p.length,0);requireValue(Number.isSafeInteger(n),'Native graph size overflow');const out=new Uint8Array(n);let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
function varint(value){let n=BigInt(value);const out=[];do{const p=Number(n&127n);n>>=7n;out.push(p|(n?128:0));}while(n);return Uint8Array.from(out);}
const field=(number,value)=>concat([varint(number*8+2),varint(value.length),value]);
/** Replace only four Shape(image) operations by their exact int64 dimensions.
 * The caller must have verified the original native asset. No gray/RGB atlas,
 * descriptor normalization, learned operator, point order or matcher is added.
 * This helper is not registered in the shared worker or any product gate. */
export function buildSelfDMProposalSuperGlueShapeGraph(bytes,{budget}={}){
 requireValue(bytes instanceof Uint8Array&&bytes.length===48603642&&budget?.reserve,'Verified original Proposal SuperGlue bytes and allocation admission required');const free=budget.reserve(bytes.length+524288);try{
  const graph=readOnnxGraph(bytes);requireValue(graph.nodes.length===2756&&graph.initializers.length===317&&JSON.stringify(graph.inputs)===JSON.stringify([...names,'keypoints0','keypoints1','scores0','scores1','descriptors0','descriptors1']),'Pinned native Proposal SuperGlue topology required');
  const consumers=graph.nodes.filter(n=>n.inputs.some(v=>names.includes(v)));requireValue(JSON.stringify(consumers.map(n=>n.name))===JSON.stringify(expected)&&consumers.every(n=>n.opType==='Shape'&&n.inputs.length===1&&n.outputs.length===1&&!n.fields.some(f=>f.number===5)),'Images must be consumed only by the four exact native Shape operations');
  const parts=[];let nodeIndex=0,inputIndex=0;for(const f of graph.fields){if(f.number===1){const n=graph.nodes[nodeIndex++];if(consumers.includes(n))parts.push(field(1,onnxNode({name:n.name,opType:'Identity',inputs:[SELFDM_PROPOSAL_SUPERGLUE_SHAPES[names.indexOf(n.inputs[0])]],outputs:n.outputs})));else parts.push(f.raw);}else if(f.number===11){const name=graph.inputs[inputIndex++],at=names.indexOf(name);parts.push(at<0?f.raw:field(11,onnxInput(SELFDM_PROPOSAL_SUPERGLUE_SHAPES[at],7,[4])));}else parts.push(f.raw);}
  const size=parts.reduce((n,p)=>n+p.length,0),header=concat([varint(58),varint(size)]),out=concat(graph.modelFields.flatMap(f=>f.number===7?[header,...parts]:[f.raw]));requireValue(out.length<=bytes.length+524288,'Native Shape cut exceeds admitted model size');let released=false;return{bytes:out,metadata:{policy:SELFDM_PROPOSAL_SUPERGLUE_SHAPE_POLICY,sourceSha256:SELFDM_PROPOSAL_SUPERGLUE_SHA256,originalNodes:2756,unchangedNativeNodes:2752,shapeOnlyNodes:expected,originalInitializers:317,learnedWeightsChanged:false,learnedOperatorsChanged:false,scientificParametersChanged:false,inputMeaning:'Exact [1,1,height,width] shapes of the logical native proposal images; no image values consumed by original matcher'},release(){if(!released){released=true;free();}}};
 }catch(error){free();throw error;}
}
export function createSelfDMProposalSuperGlueShapes(dimensions,{budget}={}){
 requireValue(Array.isArray(dimensions)&&dimensions.length===2&&dimensions.every(d=>Array.isArray(d)&&d.length===2&&d.every(v=>Number.isSafeInteger(v)&&v>0))&&budget?.reserve,'Both actual native logical proposal widths/heights required');const free=budget.reserve(1024+64);try{const inputs=Object.fromEntries(dimensions.map(([width,height],i)=>[SELFDM_PROPOSAL_SUPERGLUE_SHAPES[i],{type:'int64',dims:[4],data:BigInt64Array.of(1n,1n,BigInt(height),BigInt(width))}]));let released=false;return{inputs,release(){if(!released){released=true;free();}}};}catch(error){free();throw error;}
}
