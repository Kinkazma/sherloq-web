import {requireValue} from './errors.js';

// Qualified adapters change operator wiring, never learned tensor payloads.
// Original fields are borrowed views until one bounded final model allocation.
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const MAX_ADDED=512*1024;
function varint(value){
 let n=BigInt(value);requireValue(n>=0n,'Unsigned protobuf integer required');const bytes=[];
 do{const part=Number(n&127n);n>>=7n;bytes.push(part|(n?128:0));}while(n);
 return Uint8Array.from(bytes);
}
function readVarint(bytes,offset){
 let value=0n,shift=0n;
 for(let i=0;i<10;i++){
  requireValue(offset<bytes.length,'Truncated ONNX protobuf integer');const b=bytes[offset++];
  requireValue(i<9||b<=1,'Invalid ONNX protobuf integer');value|=BigInt(b&127)<<shift;
  if(!(b&128))return {value,offset};shift+=7n;
 }
 requireValue(false,'Unterminated ONNX protobuf integer');
}
export function onnxFields(bytes){
 requireValue(bytes instanceof Uint8Array,'ONNX protobuf bytes required');const fields=[];let at=0;
 while(at<bytes.length){
  const start=at,key=readVarint(bytes,at);at=key.offset;
  const number=Number(key.value>>3n),wire=Number(key.value&7n);
  requireValue(Number.isSafeInteger(number)&&number>0&&number<2**29&&[0,1,2,5].includes(wire),'Invalid ONNX protobuf field');
  let payloadStart=at,value;
  if(wire===0){const next=readVarint(bytes,at);value=next.value;at=next.offset;}
  else if(wire===2){const length=readVarint(bytes,at);at=length.offset;payloadStart=at;requireValue(length.value<=BigInt(bytes.length-at),'Truncated ONNX protobuf payload');at+=Number(length.value);}
  else at+=wire===1?8:4;
  requireValue(at<=bytes.length,'Truncated ONNX protobuf fixed field');
  fields.push({number,wire,value,raw:bytes.subarray(start,at),payload:bytes.subarray(payloadStart,at)});
 }
 return fields;
}
const textField=(fields,number)=>fields.filter(f=>f.number===number).map(f=>{requireValue(f.wire===2,'ONNX string field required');return decoder.decode(f.payload);});
const singleton=(fields,number)=>{const values=fields.filter(f=>f.number===number);requireValue(values.length<=1,'Duplicate singleton ONNX field');return values[0];};
function concat(parts){
 const length=parts.reduce((n,p)=>n+p.length,0);requireValue(Number.isSafeInteger(length),'ONNX output size overflow');
 const result=new Uint8Array(length);let at=0;for(const part of parts){result.set(part,at);at+=part.length;}return result;
}
function field(number,payload,wire=2){const tag=varint(BigInt(number)*8n+BigInt(wire));return concat(wire===2?[tag,varint(payload.length),payload]:[tag,payload]);}
const str=(number,value)=>field(number,encoder.encode(value));
const int=(number,value)=>field(number,varint(BigInt.asUintN(64,BigInt(value))),0);
function parseNode(raw){
 const fields=onnxFields(raw),one=n=>{const values=textField(fields,n);requireValue(values.length<=1,'Duplicate ONNX node identity');return values[0]??'';};
 return {inputs:textField(fields,1),outputs:textField(fields,2),name:one(3),opType:one(4),domain:one(7),raw,fields};
}
export function readOnnxGraph(bytes){
 const modelFields=onnxFields(bytes),graph=singleton(modelFields,7);requireValue(graph?.wire===2,'Single ONNX graph required');
 const fields=onnxFields(graph.payload),nodes=fields.filter(f=>f.number===1).map(f=>{requireValue(f.wire===2,'ONNX node message required');return parseNode(f.payload);});
 return {bytes,modelFields,graph,fields,nodes,inputs:fields.filter(f=>f.number===11).map(f=>textField(onnxFields(f.payload),1)[0]),initializers:fields.filter(f=>f.number===5).map(f=>({name:textField(onnxFields(f.payload),8)[0],raw:f.payload}))};
}
export function replaceOnnxNodeInputs(node,inputs){
 requireValue(Array.isArray(inputs)&&inputs.every(v=>typeof v==='string'),'ONNX inputs required');
 return concat([...inputs.map(v=>str(1,v)),...onnxFields(node.raw).filter(f=>f.number!==1).map(f=>f.raw)]);
}
export function onnxNode({inputs=[],outputs=[],name='',opType,attributes=[],domain=''}){
 requireValue(typeof opType==='string'&&opType.length&&[inputs,outputs].every(a=>Array.isArray(a)&&a.every(v=>typeof v==='string')),'ONNX operator and tensor names required');
 const parts=[...inputs.map(v=>str(1,v)),...outputs.map(v=>str(2,v)),str(3,name),str(4,opType)];
 for(const a of attributes){
  requireValue(typeof a.name==='string'&&['INT','FLOAT','INTS','STRING'].includes(a.type),'Supported ONNX attribute required');
  const type={FLOAT:1,INT:2,STRING:3,INTS:7}[a.type];let payload;
  if(a.type==='INT')payload=int(3,a.value);
  else if(a.type==='INTS'){requireValue(Array.isArray(a.value),'Integer attribute array required');payload=field(8,concat(a.value.map(v=>varint(BigInt.asUintN(64,BigInt(v))))));}
  else if(a.type==='STRING')payload=str(4,a.value);
  else{requireValue(Number.isFinite(a.value),'Finite ONNX attribute required');const raw=new Uint8Array(4);new DataView(raw.buffer).setFloat32(0,a.value,true);payload=field(2,raw,5);}
  parts.push(field(5,concat([str(1,a.name),payload,int(20,type)])));
 }
 if(domain)parts.push(str(7,domain));return concat(parts);
}
export function onnxInput(name,type,dims){
 requireValue(typeof name==='string'&&name.length&&Number.isSafeInteger(type)&&type>0&&Array.isArray(dims)&&dims.every(n=>Number.isSafeInteger(n)&&n>=0||typeof n==='string'&&n.length>0&&n.length<=128),'Qualified ONNX input dimensions required');
 const shape=concat(dims.map(n=>field(1,typeof n==='string'?str(2,n):int(1,n)))),tensor=concat([int(1,type),field(2,shape)]);
 return concat([str(1,name),field(2,field(1,tensor))]);
}
export function onnxInitializer(name,type,dims,data){
 requireValue(typeof name==='string'&&name.length&&Array.isArray(dims)&&dims.every(n=>Number.isSafeInteger(n)&&n>=0)&&ArrayBuffer.isView(data),'ONNX constant tensor required');
 const widths={1:4,2:1,3:1,4:2,5:2,6:4,7:8,9:1,10:2,11:8,12:4,13:8};
 requireValue(widths[type]&&dims.reduce((n,v)=>n*v,1)*widths[type]===data.byteLength,'ONNX constant shape and dtype differ');
 return concat([field(1,concat(dims.map(varint))),int(2,type),str(8,name),field(9,new Uint8Array(data.buffer,data.byteOffset,data.byteLength))]);
}
export function rewriteOnnxGraph(bytes,{rewriteNode,inputs=[],initializers=[],prependNodes=[],maxAddedBytes=MAX_ADDED}={}){
 requireValue(typeof rewriteNode==='function'&&[inputs,initializers,prependNodes].every(a=>Array.isArray(a)&&a.every(b=>b instanceof Uint8Array))&&Number.isSafeInteger(maxAddedBytes)&&maxAddedBytes>=0&&maxAddedBytes<=MAX_ADDED,'Bounded ONNX rewrite required');
 const graph=readOnnxGraph(bytes),names=new Set([...graph.inputs,...graph.initializers.map(t=>t.name),...graph.nodes.flatMap(n=>n.outputs)]);
 for(const item of [...inputs.map(raw=>({raw,number:1})),...initializers.map(raw=>({raw,number:8}))]){
  const parsed=textField(onnxFields(item.raw),item.number);requireValue(parsed.length===1&&parsed[0].length&&!names.has(parsed[0]),'Scoped ONNX input or initializer would replace an original tensor');names.add(parsed[0]);
 }
 const parts=[...prependNodes.map(n=>field(1,n))];let index=0;
 for(const f of graph.fields){
  if(f.number!==1){parts.push(f.raw);continue;}
  const replacements=rewriteNode(graph.nodes[index],index++);
  if(replacements===undefined)parts.push(f.raw);
  else if(replacements!==null){requireValue(Array.isArray(replacements)&&replacements.every(n=>n instanceof Uint8Array),'Encoded ONNX replacement nodes required');parts.push(...replacements.map(n=>field(1,n)));}
 }
 parts.push(...initializers.map(t=>field(5,t)),...inputs.map(v=>field(11,v)));
 const graphLength=parts.reduce((n,p)=>n+p.length,0),newHeader=concat([varint(58),varint(graphLength)]);
 const finalParts=graph.modelFields.flatMap(f=>f.number===7?[newHeader,...parts]:[f.raw]),length=finalParts.reduce((n,p)=>n+p.length,0);
 requireValue(length<=bytes.length+maxAddedBytes,'ONNX scope rewrite exceeds its bounded allowance');
 return concat(finalParts);
}
