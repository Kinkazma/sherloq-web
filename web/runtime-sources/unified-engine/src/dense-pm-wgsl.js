import "../../runtime-context.js?v=0.30.0";
import {densePmBlockedWgsl} from './dense-pm-blocked-wgsl.js';
// Sixteen lanes per query, eight rows per causal tile (four core, four halo). Only lower halo is needed:
// every native parent has transformed dy<=0 and |dy|<=deltaFront.
export function densePmSmallBlockedWgsl(dimensions){
 let source=densePmBlockedWgsl(dimensions).replace('array<u32,448>','array<u32,56>').replace('array<u32,64>','array<u32,8>').replace('lane>=64','lane>=8').replace('%7u*64u','%7u*8u');
 const begin=source.indexOf('@compute @workgroup_size(64)\nfn propagate'),end=source.indexOf('@compute @workgroup_size(64)\nfn commit',begin);
 return source.slice(0,begin)+String.raw`
const DIM:u32=${dimensions}u;
var<workgroup> firstValues:array<f32,1152>;
var<workgroup> productValues:array<f32,1152>;
var<workgroup> queryStates:array<vec4u,8>;
var<workgroup> queryLive:array<u32,8>;
var<workgroup> offerFlags:array<u32,8>;
var<workgroup> offered:array<i32,8>;
var<workgroup> partials:array<u32,128>;
fn quant(bits:u32)->i32{
 let e=(bits>>23u)&255u;let mantissa=(bits&8388607u)|select(0u,8388608u,e!=0u);let shift=127u-max(e,1u)+13u;var q=0u;if(shift<32u){q=mantissa>>shift;}return select(i32(q),-i32(q),(bits&2147483648u)!=0u);
}
fn tiledOffer(i:u32,j:i32,row:u32,component:u32,lane:u32){
 if(component==0u){
  offered[row]=j;offerFlags[row]=0u;
  if(queryLive[row]!=0u&&permitted(i,j)){queryStates[row].z+=1u;if(!(DIM==128u&&(bitcast<i32>(queryStates[row].x)==j||bitcast<f32>(queryStates[row].y)==0.0))){offerFlags[row]=1u;}}
 }
 workgroupBarrier();var integerPart=0u;
 if(offerFlags[row]!=0u){
  let j=offered[row];
  for(var k=component;k<DIM;k+=16u){
   let b=second[u32(j)*DIM+k];let a=firstValues[row*144u+k];let delta=a-b;productValues[row*144u+k]=delta*delta;
   let qa=quant(bitcast<u32>(a));
   let adjusted=u32(max(abs(qa-quant(bitcast<u32>(b)))-2,0));integerPart+=adjusted*adjusted;
  }
 }partials[lane]=integerPart;workgroupBarrier();
 if(component==0u&&offerFlags[row]!=0u){
  var integer=0u;for(var k=0u;k<16u;k++){integer+=partials[row*16u+k];}
  var lower=0.0;if(integer!=0u){let down=bitcast<f32>(bitcast<u32>(f32(integer))-1u)*0.00000095367431640625;let corrected=down*(1.0-f32(4u*DIM+16u)/8388608.0);lower=bitcast<f32>(bitcast<u32>(corrected)-1u);}
  let best=bitcast<f32>(queryStates[row].y);
  if(lower<best){
   var distance=0.0;let j=offered[row];
   for(var start=0u;start<DIM;start+=16u){
    for(var k=start;k<min(start+16u,DIM);k++){distance=fma(1.0,distance,productValues[row*144u+k]);}
    if(DIM==128u&&distance>=best){break;}
   }
   if(distance<best){queryStates[row].x=bitcast<u32>(j);queryStates[row].y=bitcast<u32>(distance);}
  }
 }workgroupBarrier();
}
@compute @workgroup_size(128)
fn propagate(@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_index) lane:u32){
 let row=lane/16u;let component=lane%16u;let width=p.a.x;let height=p.a.y;let firstY=i32(group.x)*4-4;let yy=firstY+i32(row);let negative=p.b.y!=0u;let sign=select(1,-1,negative);var physical=0u;
 for(var t=0u;t<4u;t++){
  let q=p.b.x+t;let xx=i32(q)-2*yy;let valid=row>=t&&q<width+2u*height-2u&&yy>=0&&yy<i32(height)&&xx>=0&&xx<i32(width);
  let x=select(xx,i32(width)-1-xx,negative);let y=select(yy,i32(height)-1-yy,negative);let i=u32(y)*width+u32(x);
  var initial=vec4u(4294967295u,2139095040u,0u,0u);
  if(component==0u){queryLive[row]=0u;if(valid){initial=field[i];if(packed[i]!=0u){queryLive[row]=1u;}}queryStates[row]=initial;}
  workgroupBarrier();let oldCount=queryStates[row].z;
  if(queryLive[row]!=0u){for(var k=component;k<DIM;k+=16u){firstValues[row*144u+k]=first[i*DIM+k];}}workgroupBarrier();
  let dxs=array<i32,4>(-sign,0,-sign,sign);let dys=array<i32,4>(0,-sign,-sign,-sign);
  for(var neighbor=0u;neighbor<4u;neighbor++){
   let nx=x+dxs[neighbor];let ny=y+dys[neighbor];var candidates=vec2i(-1,-1);
   if(queryLive[row]!=0u&&nx>=0&&nx<i32(width)&&ny>=0&&ny<i32(height)){
    let m=parentMatch(nx,ny,firstY);if(m>=0){
     var tx=x+(m%i32(width)-nx);var ty=y+(m/i32(width)-ny);if(tx>=0&&tx<i32(width)&&ty>=0&&ty<i32(height)){candidates.x=ty*i32(width)+tx;}
     let n2x=nx+dxs[neighbor];let n2y=ny+dys[neighbor];if(n2x>=0&&n2x<i32(width)&&n2y>=0&&n2y<i32(height)){let m2=parentMatch(n2x,n2y,firstY);if(m2>=0){tx=x+2*(m%i32(width)-nx)-(m2%i32(width)-n2x);ty=y+2*(m/i32(width)-ny)-(m2/i32(width)-n2y);if(tx>=0&&tx<i32(width)&&ty>=0&&ty<i32(height)){candidates.y=ty*i32(width)+tx;}}}
    }
   }
   tiledOffer(i,candidates.x,row,component,lane);tiledOffer(i,candidates.y,row,component,lane);
  }
  var state=p.b.w^((i+1u)*2654435761u)^((p.b.z+1u)*2246822519u);if(state==0u){state=1u;}
  let m=bitcast<i32>(queryStates[row].x);let cx=select(m%i32(width),x,m<0);let cy=select(m/i32(width),y,m<0);let maximum=i32(p.d.w);let bound=maximum-i32(p.a.w>>1u);
  for(var window=min(maximum,i32(max(width,height)));window>=1;window/=2){
   let xmin=max(max(0,cx-window),x-bound);let xmax=min(min(i32(width)-1,cx+window),x+bound);let ymin=max(max(0,cy-window),y-bound);let ymax=min(min(i32(height)-1,cy+window),y+bound);var j=-1;
   if(queryLive[row]!=0u&&xmin<=xmax&&ymin<=ymax){state=random(state);let tx=xmin+i32(state%u32(xmax-xmin+1));state=random(state);let ty=ymin+i32(state%u32(ymax-ymin+1));j=ty*i32(width)+tx;}
   tiledOffer(i,j,row,component,lane);
  }
  if(component==0u){let value=queryStates[row];history[t%7u*8u+row]=value.x;if(valid){physical+=value.z-oldCount;if(row>=4u){pendingField[t*height+u32(yy)]=value;}}}workgroupBarrier();
 }
 if(component==0u){physicalCounts[row]=physical;}workgroupBarrier();
 if(lane==0u){var sum=0u;for(var k=0u;k<8u;k++){sum+=physicalCounts[k];}let blocks=(p.a.x+2u*p.a.y-2u+3u)/4u;physicalOffers[(p.b.z*blocks+p.b.x/4u)*((height+3u)/4u)+group.x]=sum;}
}
`+source.slice(end).replace('t>=16u','t>=4u');
}
