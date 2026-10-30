// Shared dense PatchMatch propagation. Direct float32 banks, native initialization and
// zero/first-order propagation; live ordered reverse stays in native C++.
export const densePmWgsl=String.raw`
struct Params {a:vec4u,b:vec4u,c:vec4u,d:vec4u};
@group(0) @binding(0) var<storage,read> first:array<f32>;
@group(0) @binding(1) var<storage,read> second:array<f32>;
@group(0) @binding(2) var<storage,read> packed:array<u32>;
@group(0) @binding(3) var<storage,read_write> field:array<vec4u>;
@group(0) @binding(4) var<uniform> p:Params;
fn random(s:u32)->u32{var r=s;r^=r<<13u;r^=r>>17u;r^=r<<5u;return r;}
fn permitted(i:u32,j:i32)->bool{
 let n=p.a.x*p.a.y;if(j<0||u32(j)>=n||i==u32(j)){return false;}
 let mi=packed[i];let mj=packed[u32(j)];if(mi==0u||mj==0u){return false;}
 if(p.d.x!=0u&&!(((mi&1u)!=0u&&(mj&2u)!=0u)||((mi&2u)!=0u&&(mj&1u)!=0u))){return false;}
 let dx=i32(i%p.a.x)-j%i32(p.a.x);let dy=i32(i/p.a.x)-j/i32(p.a.x);
 let distance=u32(dx*dx+dy*dy);return distance>=p.d.y&&distance<=p.d.z;
}
fn offer(i:u32,j:i32,old:vec3u)->vec3u{
 var result=old;if(!permitted(i,j)){return result;}result.z+=1u;
 let best=bitcast<f32>(old.y);let dimensions=p.a.z;
 if(dimensions==128u&&(bitcast<i32>(old.x)==j||best==0.0)){return result;}
 var distance=0.0;
 for(var start=0u;start<dimensions;start+=16u){
  let end=min(start+16u,dimensions);
  for(var k=start;k<end;k++){
   let delta=first[i*dimensions+k]-second[u32(j)*dimensions+k];
   let square=delta*delta;
   distance=fma(1.0,distance,square);
  }
  if(dimensions==128u&&distance>=best){break;}
 }
 if(distance<best){result.x=bitcast<u32>(j);result.y=bitcast<u32>(distance);}return result;
}
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id:vec3u){
 let width=p.a.x;let height=p.a.y;
 if(p.a.w==0u){
  let i=id.x;if(i>=width*height){return;}var value=vec3u(4294967295u,2139095040u,0u);
  if(packed[i]!=0u){
   let which=select(0u,1u,p.d.x!=0u&&(packed[i]&1u)!=0u);
   let offset=select(p.c.x,p.c.z,which!=0u);let count=select(p.c.y,p.c.w,which!=0u);
   if(count!=0u){var state=p.b.w^((i+1u)*2654435761u);if(state==0u){state=1u;}
    for(var attempt=0u;attempt<64u&&value.x==4294967295u;attempt++){state=random(state);value=offer(i,i32(packed[offset+state%count]),value);}
   }
  }field[i]=vec4u(value,0u);return;
 }
 let yy=id.x;if(yy>=height){return;}let xx=i32(p.b.x)-2*i32(yy);if(xx<0||xx>=i32(width)){return;}
 let negative=p.b.y!=0u;let sign=select(1,-1,negative);
 let x=select(xx,i32(width)-1-xx,negative);let y=select(i32(yy),i32(height)-1-i32(yy),negative);
 let i=u32(y)*width+u32(x);if(packed[i]==0u){return;}var value=field[i].xyz;
 let dxs=array<i32,4>(-sign,0,-sign,sign);let dys=array<i32,4>(0,-sign,-sign,-sign);
 for(var neighbor=0u;neighbor<4u;neighbor++){
  let nx=x+dxs[neighbor];let ny=y+dys[neighbor];if(nx<0||nx>=i32(width)||ny<0||ny>=i32(height)){continue;}
  let parent=u32(ny)*width+u32(nx);let m=bitcast<i32>(field[parent].x);if(m<0){continue;}
  var tx=x+(m%i32(width)-nx);var ty=y+(m/i32(width)-ny);
  if(tx>=0&&tx<i32(width)&&ty>=0&&ty<i32(height)){value=offer(i,ty*i32(width)+tx,value);}
  let n2x=nx+dxs[neighbor];let n2y=ny+dys[neighbor];if(n2x<0||n2x>=i32(width)||n2y<0||n2y>=i32(height)){continue;}
  let m2=bitcast<i32>(field[u32(n2y)*width+u32(n2x)].x);if(m2<0){continue;}
  tx=x+2*(m%i32(width)-nx)-(m2%i32(width)-n2x);ty=y+2*(m/i32(width)-ny)-(m2/i32(width)-n2y);
  if(tx>=0&&tx<i32(width)&&ty>=0&&ty<i32(height)){value=offer(i,ty*i32(width)+tx,value);}
 }
 var state=p.b.w^((i+1u)*2654435761u)^((p.b.z+1u)*2246822519u);if(state==0u){state=1u;}
 let m=bitcast<i32>(value.x);let cx=select(m%i32(width),x,m<0);let cy=select(m/i32(width),y,m<0);
 let maximum=i32(p.d.w);let bound=maximum-i32(p.a.w>>1u);
 for(var window=min(maximum,i32(max(width,height)));window>=1;window/=2){
  let xmin=max(max(0,cx-window),x-bound);let xmax=min(min(i32(width)-1,cx+window),x+bound);
  let ymin=max(max(0,cy-window),y-bound);let ymax=min(min(i32(height)-1,cy+window),y+bound);
  if(xmin>xmax||ymin>ymax){continue;}
  state=random(state);let tx=xmin+i32(state%u32(xmax-xmin+1));state=random(state);let ty=ymin+i32(state%u32(ymax-ymin+1));
  value=offer(i,ty*i32(width)+tx,value);
 }
 field[i]=vec4u(value,0u);
}
`;
