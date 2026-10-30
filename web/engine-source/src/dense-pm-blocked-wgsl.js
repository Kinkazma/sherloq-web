import {densePmWgsl} from './dense-pm-base-wgsl.js';
// Six native parent deltas use at most six previous fronts and dy/dfront<=1.
// Sixteen halo rows on either side suffice for sixteen exact local fronts.
// No core writes the live field until the separate global commit dispatch.
export function densePmBlockedWgsl(dimensions){
 const common=densePmWgsl.slice(0,densePmWgsl.indexOf('@compute')).replace('let dimensions=p.a.z;','let dimensions='+dimensions+'u;');
 return common+String.raw`
@group(0) @binding(5) var<storage,read_write> pendingField:array<vec4u>;
@group(0) @binding(6) var<storage,read_write> physicalOffers:array<u32>;
var<workgroup> history:array<u32,448>;
var<workgroup> physicalCounts:array<u32,64>;
fn parentMatch(nx:i32,ny:i32,firstY:i32)->i32{
 let width=i32(p.a.x);let height=i32(p.a.y);
 if(nx<0||nx>=width||ny<0||ny>=height){return -1;}
 let negative=p.b.y!=0u;let xx=select(nx,width-1-nx,negative);let yy=select(ny,height-1-ny,negative);let q=xx+2*yy;
 if(q>=i32(p.b.x)){
  let lane=yy-firstY;if(lane<0||lane>=64){return -1;}
  return bitcast<i32>(history[u32(q-i32(p.b.x))%7u*64u+u32(lane)]);
 }
 return bitcast<i32>(field[u32(ny)*p.a.x+u32(nx)].x);
}
@compute @workgroup_size(64)
fn initialize(@builtin(global_invocation_id) id:vec3u){
 let width=p.a.x;let height=p.a.y;let i=id.x;if(i>=width*height){return;}
 var value=vec3u(4294967295u,2139095040u,0u);
 if(packed[i]!=0u){
  let which=select(0u,1u,p.d.x!=0u&&(packed[i]&1u)!=0u);let offset=select(p.c.x,p.c.z,which!=0u);let count=select(p.c.y,p.c.w,which!=0u);
  if(count!=0u){var state=p.b.w^((i+1u)*2654435761u);if(state==0u){state=1u;}
   for(var attempt=0u;attempt<64u&&value.x==4294967295u;attempt++){state=random(state);value=offer(i,i32(packed[offset+state%count]),value);}
  }
 }field[i]=vec4u(value,0u);
}
@compute @workgroup_size(64)
fn propagate(@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_index) lane:u32){
 let width=p.a.x;let height=p.a.y;let firstY=i32(group.x)*32-16;let yy=firstY+i32(lane);let negative=p.b.y!=0u;let sign=select(1,-1,negative);
 var physical=0u;
 for(var t=0u;t<16u;t++){
  let q=p.b.x+t;let xx=i32(q)-2*yy;var value=vec3u(4294967295u,2139095040u,0u);
  if(lane>=t&&lane<64u-t&&q<width+2u*height-2u&&yy>=0&&yy<i32(height)&&xx>=0&&xx<i32(width)){
   let x=select(xx,i32(width)-1-xx,negative);let y=select(yy,i32(height)-1-yy,negative);let i=u32(y)*width+u32(x);value=field[i].xyz;let previousCount=value.z;
   if(packed[i]!=0u){
    let dxs=array<i32,4>(-sign,0,-sign,sign);let dys=array<i32,4>(0,-sign,-sign,-sign);
    for(var neighbor=0u;neighbor<4u;neighbor++){
     let nx=x+dxs[neighbor];let ny=y+dys[neighbor];if(nx<0||nx>=i32(width)||ny<0||ny>=i32(height)){continue;}
     let m=parentMatch(nx,ny,firstY);if(m<0){continue;}
     var tx=x+(m%i32(width)-nx);var ty=y+(m/i32(width)-ny);if(tx>=0&&tx<i32(width)&&ty>=0&&ty<i32(height)){value=offer(i,ty*i32(width)+tx,value);}
     let n2x=nx+dxs[neighbor];let n2y=ny+dys[neighbor];if(n2x<0||n2x>=i32(width)||n2y<0||n2y>=i32(height)){continue;}
     let m2=parentMatch(n2x,n2y,firstY);if(m2<0){continue;}
     tx=x+2*(m%i32(width)-nx)-(m2%i32(width)-n2x);ty=y+2*(m/i32(width)-ny)-(m2/i32(width)-n2y);if(tx>=0&&tx<i32(width)&&ty>=0&&ty<i32(height)){value=offer(i,ty*i32(width)+tx,value);}
    }
    var state=p.b.w^((i+1u)*2654435761u)^((p.b.z+1u)*2246822519u);if(state==0u){state=1u;}
    let m=bitcast<i32>(value.x);let cx=select(m%i32(width),x,m<0);let cy=select(m/i32(width),y,m<0);let maximum=i32(p.d.w);let bound=maximum-i32(p.a.w>>1u);
    for(var window=min(maximum,i32(max(width,height)));window>=1;window/=2){
     let xmin=max(max(0,cx-window),x-bound);let xmax=min(min(i32(width)-1,cx+window),x+bound);let ymin=max(max(0,cy-window),y-bound);let ymax=min(min(i32(height)-1,cy+window),y+bound);
     if(xmin>xmax||ymin>ymax){continue;}state=random(state);let tx=xmin+i32(state%u32(xmax-xmin+1));state=random(state);let ty=ymin+i32(state%u32(ymax-ymin+1));value=offer(i,ty*i32(width)+tx,value);
    }
   }
   physical+=value.z-previousCount;
   if(lane>=16u&&lane<48u){pendingField[t*height+u32(yy)]=vec4u(value,0u);}
  }
  history[t%7u*64u+lane]=value.x;workgroupBarrier();
 }
 physicalCounts[lane]=physical;workgroupBarrier();
 if(lane==0u){var sum=0u;for(var k=0u;k<64u;k++){sum+=physicalCounts[k];}let blocks=(p.a.x+2u*p.a.y-2u+15u)/16u;physicalOffers[(p.b.z*blocks+p.b.x/16u)*((height+31u)/32u)+group.x]=sum;}
}
@compute @workgroup_size(64)
fn commit(@builtin(global_invocation_id) id:vec3u){
 let width=p.a.x;let height=p.a.y;let t=id.x/height;let yy=id.x%height;if(t>=16u){return;}
 let q=p.b.x+t;if(q>=width+2u*height-2u){return;}let xx=i32(q)-2*i32(yy);if(xx<0||xx>=i32(width)){return;}
 let negative=p.b.y!=0u;let x=select(xx,i32(width)-1-xx,negative);let y=select(i32(yy),i32(height)-1-i32(yy),negative);field[u32(y)*width+u32(x)]=pendingField[t*height+yy];
}
`;
}
