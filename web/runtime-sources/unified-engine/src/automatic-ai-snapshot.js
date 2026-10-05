import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';
import {automaticSnapshotArray as array} from './automatic-npz-stream.js';

const shared=['map','mask','candidates','analyzed'];
const fields={forgeryscope:[...shared,'geometric','branch_microscopy','branch_blots','branch_lanes'],d2prl:[...shared,'source','target']};
const floatFields=new Set(['map','source','target']);
const infrastructure=new Set(['width','height','metadata','provenance','metrics','release','layout','stores']);

/** Borrowed native clone_detectors ndarray contract. Hold the projected result
 * and (for D2PRL) readRawOwned leases until export settles. No inference here. */
export function automaticAiSnapshot(kind,result,{raw}={}) {
 const names=fields[kind],{width,height}=result??{},n=width*height;
 requireValue(names&&Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&Number.isSafeInteger(n)&&result.metadata,'AI scientific result and original dimensions required.');
 requireValue(Object.keys(result).every(k=>names.includes(k)||infrastructure.has(k)),'Unrecognized AI scientific result field.');
 const segmented=result.layout==='segmented';if(segmented)requireValue(names.every(k=>!Object.hasOwn(result,k))&&result.stores&&Object.keys(result.stores).length===names.length&&Object.keys(result.stores).every(k=>names.includes(k)),'Complete segmented AI stores required');else requireValue(!result.stores&&!result.layout,'Unexpected AI store layout');
 const output={};
 for(const name of names){const floating=floatFields.has(name),Type=floating?Float32Array:Uint8Array,value=segmented?result.stores[name]:result[name];requireValue(segmented?value?.byteLength===n*Type.BYTES_PER_ELEMENT&&typeof value.readInto==='function':value instanceof Type&&value.length===n,'Native AI field type or size differs: '+name);output[name]=array(value,{shape:[height,width],...(segmented?{descr:floating?'<f4':'|u1'}:{})});}
 if(kind==='d2prl'){
  const grids=raw?.rawGrids,boxes=result.metadata.boxes,shape=raw?.metadata?.raw_shape,gridBytes=3*448*448*4;
  requireValue(raw?.width===width&&raw.height===height&&Array.isArray(grids)&&grids.length>0&&Array.isArray(boxes)&&boxes.length===grids.length,'Owned raw D2PRL grids matching the projected source required.');
  requireValue(typeof result.metadata.analysisId==='string'&&result.metadata.analysisId===raw.metadata?.analysisId,'Projected and raw D2PRL analysis identities differ.');
  requireValue(Array.isArray(shape)&&shape.length===3&&shape[0]===3&&shape[1]===448&&shape[2]===448,'Native D2PRL raw shape must be [3,448,448].');
  for(let i=0;i<grids.length;i++){const g=grids[i],box=boxes[i];requireValue(g.raw instanceof Float32Array&&g.raw.byteLength===gridBytes&&Array.isArray(box)&&box.length===4&&Array.isArray(g.bounds)&&g.bounds.length===4&&box.every((v,j)=>Number.isInteger(v)&&v===g.bounds[j]),'Raw D2PRL grid order, bounds or float32 payload differs.');}
  // Native np.stack(raw) order is the analysis job order. Copy only the current
  // archive chunk, including a chunk that straddles two 448 x 448 grids.
  const source={byteLength:grids.length*gridBytes,readInto(bytes,offset){let done=0;while(done<bytes.length){const at=offset+done,index=Math.floor(at/gridBytes),within=at%gridBytes,count=Math.min(bytes.length-done,gridBytes-within),values=grids[index].raw;bytes.set(new Uint8Array(values.buffer,values.byteOffset+within,count),done);done+=count;}}};
  output.raw_probabilities=array(source,{shape:[grids.length,3,448,448],descr:'<f4'});
 }else requireValue(raw===undefined,'Forgeryscope has no D2PRL raw grids.');
 output.metadata=result.metadata;return output;
}
