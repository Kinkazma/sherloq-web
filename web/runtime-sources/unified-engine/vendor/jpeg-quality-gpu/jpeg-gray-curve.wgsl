// Native grayscale JPEG pixel-loss composition; transport and funding belong to its provider.
// Integer ISLOW primitives pinned to the existing ELA source above.
struct Params { width:u32,height:u32,cols:u32,blocks:u32,groupsX:u32,qualities:u32,pad0:u32,pad1:u32 };
@group(0) @binding(0) var<storage,read> input:array<u32>;
@group(0) @binding(1) var<storage,read_write> transformed:array<i32>;
@group(0) @binding(2) var<storage,read> quant:array<u32>;
@group(0) @binding(3) var<storage,read_write> partial:array<u32>;
@group(0) @binding(4) var<storage,read_write> result:array<vec2u>;
@group(0) @binding(5) var<uniform> p:Params;
fn byte(at:u32)->i32 { return i32((input[at/4u]>>((at%4u)*8u))&255u); }
fn desc(a:i32,s:u32)->i32 { return (a+(1i<<(s-1u)))>>s; }
fn limit(a:i32)->u32 { let x=u32(a)&1023u;if(x<128u){return x+128u;}if(x<512u){return 255u;}if(x<896u){return 0u;}return x-896u; }
fn fdct(x:array<i32,8>,stage:u32)->array<i32,8>{
 var a0=x[0]+x[7];var a7=x[0]-x[7];var a1=x[1]+x[6];var a6=x[1]-x[6];var a2=x[2]+x[5];var a5=x[2]-x[5];var a3=x[3]+x[4];var a4=x[3]-x[4];
 let t10=a0+a3;let t13=a0-a3;let t11=a1+a2;let t12=a1-a2;var r:array<i32,8>;
 if(stage==0u){r[0]=(t10+t11)<<2u;r[4]=(t10-t11)<<2u;}else{r[0]=desc(t10+t11,2u);r[4]=desc(t10-t11,2u);}
 let shift=select(11u,15u,stage!=0u);var z1=(t12+t13)*4433;r[2]=desc(z1+t13*6270,shift);r[6]=desc(z1-t12*15137,shift);
 z1=a4+a7;var z2=a5+a6;var z3=a4+a6;var z4=a5+a7;let z5=(z3+z4)*9633;
 a4=a4*2446;a5=a5*16819;a6=a6*25172;a7=a7*12299;z1=z1*(-7373);z2=z2*(-20995);z3=z3*(-16069)+z5;z4=z4*(-3196)+z5;
 r[7]=desc(a4+z1+z3,shift);r[5]=desc(a5+z2+z4,shift);r[3]=desc(a6+z2+z3,shift);r[1]=desc(a7+z1+z4,shift);return r;
}
fn idct(x:array<i32,8>,stage:u32)->array<i32,8>{
 var r:array<i32,8>;if(all(vec4<i32>(x[1],x[2],x[3],x[4])==vec4<i32>(0))&&all(vec3<i32>(x[5],x[6],x[7])==vec3<i32>(0))){let dc=select(x[0]<<2u,desc(x[0],5u),stage!=0u);for(var i=0u;i<8u;i++){r[i]=dc;}return r;}
 var z2=x[2];var z3=x[6];var z1=(z2+z3)*4433;var t2=z1-z3*15137;var t3=z1+z2*6270;let t0=(x[0]+x[4])<<13u;let t1=(x[0]-x[4])<<13u;
 let t10=t0+t3;let t13=t0-t3;let t11=t1+t2;let t12=t1-t2;var a0=x[7];var a1=x[5];var a2=x[3];var a3=x[1];
 z1=a0+a3;z2=a1+a2;z3=a0+a2;var z4=a1+a3;let z5=(z3+z4)*9633;
 a0=a0*2446;a1=a1*16819;a2=a2*25172;a3=a3*12299;z1=z1*(-7373);z2=z2*(-20995);z3=z3*(-16069)+z5;z4=z4*(-3196)+z5;
 a0=a0+z1+z3;a1=a1+z2+z4;a2=a2+z2+z3;a3=a3+z1+z4;let shift=select(11u,18u,stage!=0u);
 r[0]=desc(t10+a3,shift);r[7]=desc(t10-a3,shift);r[1]=desc(t11+a2,shift);r[6]=desc(t11-a2,shift);r[2]=desc(t12+a1,shift);r[5]=desc(t12-a1,shift);r[3]=desc(t13+a0,shift);r[4]=desc(t13-a0,shift);return r;
}

@compute @workgroup_size(32) fn transform(@builtin(global_invocation_id) id:vec3u) {
 let block=id.x+id.y*p.groupsX*32u;if(block>=p.blocks){return;}
 let bx=block%p.cols*8u;let by=block/p.cols*8u;var work:array<i32,64>;
 for(var y=0u;y<8u;y++){var v:array<i32,8>;for(var x=0u;x<8u;x++){v[x]=byte(min(by+y,p.height-1u)*p.width+min(bx+x,p.width-1u))-128;}let row=fdct(v,0u);for(var x=0u;x<8u;x++){work[y*8u+x]=row[x];}}
 for(var x=0u;x<8u;x++){var v:array<i32,8>;for(var y=0u;y<8u;y++){v[y]=work[y*8u+x];}let col=fdct(v,1u);for(var y=0u;y<8u;y++){transformed[block*64u+y*8u+x]=col[y];}}
}
@compute @workgroup_size(32) fn loss(@builtin(global_invocation_id) id:vec3u) {
 let block=id.x+id.y*p.groupsX*32u;let quality=id.z;if(block>=p.blocks||quality>=p.qualities){return;}
 let bx=block%p.cols*8u;let by=block/p.cols*8u;var work:array<i32,64>;
 for(var k=0u;k<64u;k++){let q=i32(quant[quality*64u+k]);let value=transformed[block*64u+k];let c=(abs(value)+q*4)/(q*8);work[k]=select(c,-c,value<0)*q;}
 for(var x=0u;x<8u;x++){var v:array<i32,8>;for(var y=0u;y<8u;y++){v[y]=work[y*8u+x];}let col=idct(v,0u);for(var y=0u;y<8u;y++){work[y*8u+x]=col[y];}}
 var total=0u;for(var y=0u;y<8u;y++){var v:array<i32,8>;for(var x=0u;x<8u;x++){v[x]=work[y*8u+x];}let row=idct(v,1u);for(var x=0u;x<8u;x++){if(bx+x<p.width&&by+y<p.height){total+=u32(abs(byte((by+y)*p.width+bx+x)-i32(limit(row[x]))));}}}
 partial[quality*p.blocks+block]=total;
}
var<workgroup> sums:array<vec2u,256>;
fn add64(a:vec2u,b:vec2u)->vec2u { let low=a.x+b.x;return vec2u(low,a.y+b.y+u32(low<a.x)); }
@compute @workgroup_size(256) fn reduce(@builtin(local_invocation_index) lane:u32,@builtin(workgroup_id) group:vec3u) {
 let quality=group.x;var sum=vec2u(0u);for(var block=lane;block<p.blocks;block+=256u){sum=add64(sum,vec2u(partial[quality*p.blocks+block],0u));}sums[lane]=sum;workgroupBarrier();
 for(var stride=128u;stride>0u;stride/=2u){if(lane<stride){sums[lane]=add64(sums[lane],sums[lane+stride]);}workgroupBarrier();}
 if(lane==0u){result[quality]=sums[0];}
}
