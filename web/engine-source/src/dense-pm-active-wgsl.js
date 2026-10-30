import {densePmMetricWgsl} from './dense-pm-metric-wgsl.js';
// Native-index-preserving transport specialization. Mask bits retain their low two bits;
// the upper bits encode (native field slot + 1). Targets/RNG stay native i/j.
function densePmActiveBaseWgsl(dimensions,mode='pixel'){
 let s=densePmMetricWgsl(dimensions,mode).replace('struct Params {a:vec4u,b:vec4u,c:vec4u,d:vec4u};','struct Params {a:vec4u,b:vec4u,c:vec4u,d:vec4u,e:vec4u};');
 s=s.replace('fn random(',String.raw`fn fieldSlot(i:u32)->u32{return (packed[i]>>2u)-1u;}
fn fieldValue(i:u32)->vec4u{if(packed[i]==0u){return vec4u(4294967295u,2139095040u,0u,0u);}return field[fieldSlot(i)];}
fn random(`);
 for(const[a,b]of[
  ['first[i*dimensions+k]','first[fieldSlot(i)*dimensions+k]'],['second[u32(j)*dimensions+k]','second[fieldSlot(u32(j))*dimensions+k]'],
  ['first[i*DIM+k]','first[fieldSlot(i)*DIM+k]'],['second[u32(j)*DIM+k]','second[fieldSlot(u32(j))*DIM+k]'],
  ['field[u32(ny)*p.a.x+u32(nx)].x','fieldValue(u32(ny)*p.a.x+u32(nx)).x'],
  ['let i=id.x;if(i>=width*height){return;}','if(id.x>=p.e.y){return;}let i=packed[p.e.x+id.x];'],
  ['}field[i]=vec4u(value,0u);','}field[fieldSlot(i)]=vec4u(value,0u);'],
  ['let firstY=i32(group.x)*4-4;','let nativeGroup=packed[p.e.z+group.x];let firstY=i32(nativeGroup)*4-4;'],
  ['initial=field[i];','initial=fieldValue(i);'],['+group.x]=sum;','+nativeGroup]=sum;']
 ]){if(!s.includes(a))throw Error('Active WGSL transport substitution not found: '+a);s=s.replaceAll(a,b);}
 const start=s.indexOf('@compute @workgroup_size(64)\nfn commit');if(start<0)throw Error('Active commit boundary not found');
 return s.slice(0,start)+String.raw`
@compute @workgroup_size(64)
fn commit(@builtin(global_invocation_id) id:vec3u){
 if(id.x>=p.e.w*16u){return;}let width=p.a.x;let height=p.a.y;
 let yy=packed[p.e.z+id.x/16u]*4u+id.x%4u;let t=(id.x/4u)%4u;if(yy>=height){return;}
 let q=p.b.x+t;if(q>=width+2u*height-2u){return;}let xx=i32(q)-2*i32(yy);if(xx<0||xx>=i32(width)){return;}
 let negative=p.b.y!=0u;let x=select(xx,i32(width)-1-xx,negative);let y=select(i32(yy),i32(height)-1-i32(yy),negative);let i=u32(y)*width+u32(x);
 if(packed[i]==0u){return;}field[fieldSlot(i)]=pendingField[t*height+yy];
}
`;
}

// Private scheduling hypothesis: preserve the native SIFT early-prefix16, then
// perform exactly the same remaining ordered sum only for its live offers.
export function densePmActiveWgsl(dimensions,mode='pixel'){
 let s=densePmActiveBaseWgsl(dimensions,mode);if(dimensions!==128)return s;
 s=s.replace('var<workgroup> partials:array<u32,128>;','var<workgroup> partials:array<u32,128>;\nvar<workgroup> prefixDistance:array<f32,8>;');
 const start=s.indexOf('fn tiledOffer('),end=s.indexOf('@compute @workgroup_size(128)',start);if(start<0||end<0)throw Error('Private SIFT offer boundary changed');
 return s.slice(0,start)+String.raw`
fn tiledOffer(i:u32,j:i32,row:u32,component:u32,lane:u32){
 if(component==0u){offered[row]=j;offerFlags[row]=0u;if(queryLive[row]!=0u&&permitted(i,j)){queryStates[row].z+=1u;if(!(bitcast<i32>(queryStates[row].x)==j||bitcast<f32>(queryStates[row].y)==0.0)){offerFlags[row]=1u;}}}
 workgroupBarrier();var integerPart=0u;
 if(offerFlags[row]!=0u){let j=offered[row];let b=second[fieldSlot(u32(j))*DIM+component];let a=firstValues[row*144u+component];let delta=a-b;productValues[row*144u+component]=delta*delta;let qa=quant(bitcast<u32>(a));let adjusted=u32(max(abs(qa-quant(bitcast<u32>(b)))-2,0));integerPart=adjusted*adjusted;}
 workgroupBarrier();
 if(component==0u&&offerFlags[row]!=0u){var distance=0.0;for(var k=0u;k<16u;k++){distance=fma(1.0,distance,productValues[row*144u+k]);}prefixDistance[row]=distance;if(distance>=bitcast<f32>(queryStates[row].y)){offerFlags[row]=0u;}}
 workgroupBarrier();
 if(offerFlags[row]!=0u){let j=offered[row];for(var k=component+16u;k<DIM;k+=16u){let b=second[fieldSlot(u32(j))*DIM+k];let a=firstValues[row*144u+k];let delta=a-b;productValues[row*144u+k]=delta*delta;let qa=quant(bitcast<u32>(a));let adjusted=u32(max(abs(qa-quant(bitcast<u32>(b)))-2,0));integerPart+=adjusted*adjusted;}}
 partials[lane]=integerPart;workgroupBarrier();
 if(component==0u&&offerFlags[row]!=0u){var integer=0u;for(var k=0u;k<16u;k++){integer+=partials[row*16u+k];}var lower=0.0;if(integer!=0u){let down=bitcast<f32>(bitcast<u32>(f32(integer))-1u)*0.00000095367431640625;let corrected=down*(1.0-f32(4u*DIM+16u)/8388608.0);lower=bitcast<f32>(bitcast<u32>(corrected)-1u);}let best=bitcast<f32>(queryStates[row].y);if(lower<best){var distance=prefixDistance[row];for(var start=16u;start<DIM;start+=16u){for(var k=start;k<min(start+16u,DIM);k++){distance=fma(1.0,distance,productValues[row*144u+k]);}if(distance>=best){break;}}if(distance<best){queryStates[row].x=bitcast<u32>(offered[row]);queryStates[row].y=bitcast<u32>(distance);}}}
 workgroupBarrier();
}
`+s.slice(end);
}
