import{requireValue}from'./errors.js';
import{onnxFields,onnxNode,onnxInitializer}from'./onnx-scoped-graph.js';
// Same four-lane/cascade FP32 addition order as the existing native_seg_mean
// nodes. Only the population length changes from256 to admitted256F.
// No learned operator/session or native encoder mean is executed or changed.
const cat=parts=>{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){result.set(p,at);at+=p.length;}return result;};
export function effnetNativeMeanGraph({input,output,channels,plane,prefix,zeroTemplate}){
 requireValue(Number.isSafeInteger(channels)&&channels>0&&Number.isSafeInteger(plane)&&plane>0&&plane%16===0&&plane/16<16**4&&zeroTemplate?.opType==='ConstantOfShape','Admitted native FP32 cascade geometry/template required');
 const nodes=[],initializers=[];let serial=0;const vectors=Math.floor(plane/4),groups=Math.floor(vectors/4);
 function constant(value,dims,type=7){const name=prefix+'constant_'+(++serial);initializers.push(onnxInitializer(name,type,dims,type===7?BigInt64Array.from(value,BigInt):Float32Array.from(value)));return name;}
 function node(op,inputs,attributes=[]){const name=prefix+op+'_'+(++serial);nodes.push(onnxNode({name,opType:op,inputs,outputs:[name],attributes}));return name;}
 const shape=(value,dims)=>node('Reshape',[value,constant(dims,[dims.length])]);
 function zero(dims){const name=prefix+'ConstantOfShape_'+(++serial),raw=onnxNode({name,opType:'ConstantOfShape',inputs:[constant(dims,[dims.length])],outputs:[name]});nodes.push(cat([raw,...zeroTemplate.fields.filter(f=>f.number===5).map(f=>f.raw)]));return name;}
 const gather=(value,index,axis)=>node('Gather',[value,constant([index],[])],[{name:'axis',type:'INT',value:axis}]);
 const slice=(value,begin,end,axis)=>node('Slice',[value,constant([begin],[1]),constant([end],[1]),constant([axis],[1])]);
 const flat=shape(input,[1,channels,plane]);let value=shape(slice(flat,0,groups*16,2),[1,channels,groups,4,4]),count=groups;const partials=[];
 for(let level=0;level<4;level++){
  const chunks=Math.floor(count/16),tail=count%16;let partial=zero([1,channels,4,4]);
  for(let i=0;i<tail;i++)partial=node('Add',[partial,gather(value,chunks*16+i,2)]);partials.push(partial);
  if(chunks){const block=shape(slice(value,0,chunks*16,2),[1,channels,chunks,16,4,4]);value=zero([1,channels,chunks,4,4]);for(let i=0;i<16;i++)value=node('Add',[value,gather(block,i,3)]);}
  count=chunks;
 }
 requireValue(count===0,'Native mean cascade overflow');let total=partials[0];for(const partial of partials.slice(1))total=node('Add',[total,partial]);let row=gather(total,0,2);
 for(let v=groups*4;v<vectors;v++)row=node('Add',[row,slice(flat,v*4,v*4+4,2)]);for(let r=1;r<4;r++)row=node('Add',[row,gather(total,r,2)]);
 let scalar=zero([1,channels]);for(let p=vectors*4;p<plane;p++)scalar=node('Add',[scalar,gather(flat,p,2)]);for(let lane=0;lane<4;lane++)scalar=node('Add',[scalar,gather(row,lane,2)]);
 const mean=node('Div',[scalar,constant([plane],[],1)]),result=shape(mean,[1,channels,1,1]);nodes.push(onnxNode({name:prefix+'output',opType:'Identity',inputs:[result],outputs:[output]}));
 return{nodes,initializers,plane,channels,arithmetic:'native-four-lane-four-level-cascade-fp32/1'};
}
