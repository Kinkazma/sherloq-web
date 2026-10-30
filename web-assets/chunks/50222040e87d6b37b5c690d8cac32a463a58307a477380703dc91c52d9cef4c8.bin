
struct Params { width:u32,height:u32,yCols:u32,yRows:u32,cCols:u32,cRows:u32,blocks:u32,groupsX:u32,gray:u32,renderGroupsX:u32,captureRaw:u32 };
@group(0) @binding(0) var<storage,read> input:array<u32>;
@group(0) @binding(1) var<storage,read> quant:array<u32>;
@group(0) @binding(2) var<storage,read_write> planes:array<u32>;
@group(0) @binding(3) var<storage,read_write> output:array<u32>;
@group(0) @binding(4) var<storage,read> tone:array<u32>;
@group(0) @binding(5) var<uniform> p:Params;
@group(0) @binding(6) var<storage,read> pairInput:array<u32>;
@group(0) @binding(7) var<storage,read_write> rawOutput:array<u32>;
fn desc(a:i32,s:u32)->i32 { return (a+(1i<<(s-1u)))>>s; }
fn limit(a:i32)->u32 { let x=u32(a)&1023u;if(x<128u){return x+128u;}if(x<512u){return 255u;}if(x<896u){return 0u;}return x-896u; }
fn byte(at:u32)->i32{return i32((input[at/4u]>>((at%4u)*8u))&255u);}
fn color(x:u32,y:u32,c:u32)->i32 { let i=(min(y,p.height-1u)*p.width+min(x,p.width-1u))*3u;let r=byte(i);let g=byte(i+1u);let b=byte(i+2u);
 if(c==0u){return (19595*r+38470*g+7471*b+32768)>>16u;}
 if(c==1u){return (-11059*r-21709*g+32768*b+8421375)>>16u;}
 return (32768*r-27439*g-5329*b+8421375)>>16u;
}
fn sample(x:u32,y:u32,c:u32)->i32 {if(c==0u){return color(x,y,c);}let yy=min(y,(p.height-1u)/2u)*2u;return (color(x*2u,yy,c)+color(x*2u+1u,yy,c)+color(x*2u,yy+1u,c)+color(x*2u+1u,yy+1u,c)+1i+i32(x&1u))>>2u;}
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

// The source/colour, native integer DCT/IDCT, edge extension, quantization,
// fancy chroma upsampling and RGB reconstruction above/below are unchanged.
@group(0) @binding(9) var<storage,read_write> blockErrors:array<u32>;
@group(0) @binding(10) var<storage,read_write> preparedDct:array<i32>;
@group(0) @binding(11) var<storage,read> selectedBlocks:array<u32>;
@group(0) @binding(12) var<storage,read_write> selectedTerms:array<u32>;
@group(0) @binding(13) var<storage,read> selectedCells:array<u32>;

@compute @workgroup_size(32) fn ghostPrepare(@builtin(global_invocation_id) id:vec3<u32>){
 let block=id.x+id.y*p.groupsX*32u;if(block>=p.blocks){return;}let yn=p.yCols*p.yRows;let cn=p.cCols*p.cRows;let channel=select(select(1u,2u,block>=yn+cn),0u,block<yn);let local=select(select(block-yn,block-yn-cn,channel==2u),block,channel==0u);let cols=select(p.cCols,p.yCols,channel==0u);let bx=local%cols*8u;let by=local/cols*8u;
 var work:array<i32,64>;for(var y=0u;y<8u;y++){var x:array<i32,8>;for(var k=0u;k<8u;k++){x[k]=sample(bx+k,by+y,channel)-128;}let r=fdct(x,0u);for(var k=0u;k<8u;k++){work[y*8u+k]=r[k];}}
 for(var x=0u;x<8u;x++){var v:array<i32,8>;for(var k=0u;k<8u;k++){v[k]=work[k*8u+x];}let r=fdct(v,1u);for(var k=0u;k<8u;k++){preparedDct[block*64u+k*8u+x]=r[k];}}
}
fn ghostReconstructBlock(block:u32){
 let qo=select(64u,0u,block<p.yCols*p.yRows);var work:array<i32,64>;
 for(var k=0u;k<64u;k++){let q=i32(quant[qo+k]);let value=preparedDct[block*64u+k];let coefficient=(abs(value)+q*4)/(q*8);work[k]=select(coefficient,-coefficient,value<0);}
 for(var x=0u;x<8u;x++){var v:array<i32,8>;for(var k=0u;k<8u;k++){v[k]=work[k*8u+x]*i32(quant[qo+k*8u+x]);}let r=idct(v,0u);for(var k=0u;k<8u;k++){work[k*8u+x]=r[k];}}
 for(var y=0u;y<8u;y++){var v:array<i32,8>;for(var k=0u;k<8u;k++){v[k]=work[y*8u+k];}let r=idct(v,1u);for(var k=0u;k<8u;k++){planes[block*64u+y*8u+k]=limit(r[k]);}}
}
@compute @workgroup_size(32) fn ghostReconstruct(@builtin(global_invocation_id) id:vec3<u32>){let block=id.x+id.y*p.groupsX*32u;if(block<p.blocks){ghostReconstructBlock(block);}}
@compute @workgroup_size(32) fn ghostReconstructSelected(@builtin(global_invocation_id) id:vec3<u32>){let at=id.x+id.y*p.groupsX*32u;if(at<arrayLength(&selectedBlocks)){ghostReconstructBlock(selectedBlocks[at]);}}
@compute @workgroup_size(256) fn ghostTermsSelected(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_index) lane:u32){
 let selected=group.x;if(selected>=p.captureRaw){return;}let block=selectedCells[selected];let cols=p.width/16u;let at=((block/cols*16u+lane/16u)*p.width+block%cols*16u+lane%16u);let raw=recompressedPixel(at);let r=byte(at*3u)-i32(raw&255u);let g=byte(at*3u+1u)-i32((raw>>8u)&255u);let b=byte(at*3u+2u)-i32((raw>>16u)&255u);selectedTerms[selected*256u+lane]=u32(r*r+g*g+b*b);
}
var<workgroup> errorTerms:array<u32,256>;
var<workgroup> errorFractional:array<u32,256>;
@compute @workgroup_size(256) fn ghostErrors(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_index) lane:u32){
 let block=group.x+group.y*p.renderGroupsX;let cols=p.width/16u;let rows=p.height/16u;if(block>=cols*rows){return;}let at=((block/cols*16u+lane/16u)*p.width+block%cols*16u+lane%16u);let raw=recompressedPixel(at);let r=byte(at*3u)-i32(raw&255u);let g=byte(at*3u+1u)-i32((raw>>8u)&255u);let b=byte(at*3u+2u)-i32((raw>>16u)&255u);
 // 256 * 3 * 255^2 = 49,939,200: the complete integer reduction fits u32.
 let numerator=u32(r*r+g*g+b*b);errorTerms[lane]=numerator;errorFractional[lane]=select(0u,1u,numerator%3u!=0u);workgroupBarrier();
 for(var stride=128u;stride>0u;stride>>=1u){if(lane<stride){errorTerms[lane]+=errorTerms[lane+stride];errorFractional[lane]|=errorFractional[lane+stride];}workgroupBarrier();}
 if(lane==0u){blockErrors[p.gray*cols*rows+block]=errorTerms[0]|(errorFractional[0]<<31u);}
}
fn readPlane(c:u32,x:i32,y:i32)->i32 {let width=select((p.width+1u)/2u,p.width,c==0u);let height=select((p.height+1u)/2u,p.height,c==0u);let xx=u32(clamp(x,0,i32(width)-1));let yy=u32(clamp(y,0,i32(height)-1));let cols=select(p.cCols,p.yCols,c==0u);let offset=select(p.yCols*p.yRows+(c-1u)*p.cCols*p.cRows,0u,c==0u);return i32(planes[(offset+yy/8u*cols+xx/8u)*64u+yy%8u*8u+xx%8u]);}
fn chroma(c:u32,x:u32,y:u32)->i32 {let xx=i32(x/2u);let yy=i32(y/2u);if((p.width+1u)/2u<=2u){return readPlane(c,xx,yy);}let vy=yy+select(-1,1,(y&1u)!=0u);let vx=xx+select(-1,1,(x&1u)!=0u);let a=readPlane(c,xx,yy)*3+readPlane(c,xx,vy);let b=readPlane(c,vx,yy)*3+readPlane(c,vx,vy);return (a*3+b+select(8,7,(x&1u)!=0u))>>4u;}
fn recompressedPixel(at:u32)->u32{if(at>=p.width*p.height){return 0u;}let x=at%p.width;let y=at/p.width;let yy=readPlane(0u,i32(x),i32(y));let cb=chroma(1u,x,y)-128;let cr=chroma(2u,x,y)-128;let r=u32(clamp(yy+((91881*cr+32768)>>16u),0,255));let g=u32(clamp(yy+((-22554*cb-46802*cr+32768)>>16u),0,255));let b=u32(clamp(yy+((116130*cb+32768)>>16u),0,255));let raw=r|(g<<8u)|(b<<16u);return raw;}
// Exact IEEE754 RNE addition for the Ghost reduction's bounded domain:
// +0 or positive finite normal binary64, no exceptional inputs/overflow.
// A word pair is (least significant32bits, most significant32bits).
fn positive64Zero(a:vec2u)->bool{return (a.x|a.y)==0u;}
fn positive64Greater(a:vec2u,b:vec2u)->bool{return a.y>b.y||(a.y==b.y&&a.x>b.x);}
fn positive64RightJam(a:vec2u,shift:u32)->vec2u{
 if(shift==0u){return a;}
 if(shift<32u){return vec2u((a.x>>shift)|(a.y<<(32u-shift))|u32((a.x&((1u<<shift)-1u))!=0u),a.y>>shift);}
 if(shift==32u){return vec2u(a.y|u32(a.x!=0u),0u);}
 if(shift<64u){let s=shift-32u;return vec2u((a.y>>s)|u32(a.x!=0u||(a.y&((1u<<s)-1u))!=0u),0u);}
 return vec2u(u32((a.x|a.y)!=0u),0u);
}
fn positive64AddWords(a:vec2u,b:vec2u)->vec2u{let low=a.x+b.x;return vec2u(low,a.y+b.y+u32(low<a.x));}
fn positive64Add(x:vec2u,y:vec2u)->vec2u{
 if(positive64Zero(x)){return y;}if(positive64Zero(y)){return x;}
 var a=x;var b=y;if(positive64Greater(b,a)){a=y;b=x;}
 var exponent=a.y>>20u;let difference=exponent-(b.y>>20u);
 let sa=vec2u(a.x<<3u,(((a.y&0xfffffu)|0x100000u)<<3u)|(a.x>>29u));
 let sb=positive64RightJam(vec2u(b.x<<3u,(((b.y&0xfffffu)|0x100000u)<<3u)|(b.x>>29u)),difference);
 var sum=positive64AddWords(sa,sb);
 if((sum.y&0x1000000u)!=0u){sum=positive64RightJam(sum,1u);exponent++;}
 let round=sum.x&7u;var value=vec2u((sum.x>>3u)|(sum.y<<29u),sum.y>>3u);
 if(round>4u||(round==4u&&(value.x&1u)!=0u)){value=positive64AddWords(value,vec2u(1u,0u));}
 if((value.y&0x200000u)!=0u){value=vec2u(0u,0x100000u);exponent++;}
 return vec2u(value.x,(exponent<<20u)|(value.y&0xfffffu));
}

// Every per-quality plane is exact before it enters any cache. Native NumPy
// arithmetic order is retained, so future arbitrary cached quality unions do
// not depend on a presentation-specific ambiguity guard.
@group(0) @binding(14) var<storage,read> nativeThirds:array<vec2u>;
@group(0) @binding(15) var<storage,read_write> nativeMeans:array<vec2u>;
var<workgroup> nativeLanes:array<vec2u,16>;
fn nativeGhostTerm(block:u32,pixel:u32)->vec2u{
 let cols=p.width/16u;let at=(block/cols*16u+pixel/16u)*p.width+block%cols*16u+pixel%16u;let raw=recompressedPixel(at);let r=byte(at*3u)-i32(raw&255u);let g=byte(at*3u+1u)-i32((raw>>8u)&255u);let b=byte(at*3u+2u)-i32((raw>>16u)&255u);return nativeThirds[u32(r*r+g*g+b*b)];
}
@compute @workgroup_size(16) fn ghostNativeMeans(@builtin(workgroup_id) group:vec3u,@builtin(local_invocation_index) lane:u32){
 let cells=p.width/16u*(p.height/16u);let block=group.x+group.y*p.renderGroupsX;if(block>=cells){return;}let half=lane/8u;let first=half*128u+lane%8u;var sum=nativeGhostTerm(block,first);
 for(var j=1u;j<16u;j++){sum=positive64Add(sum,nativeGhostTerm(block,first+j*8u));}nativeLanes[lane]=sum;workgroupBarrier();
 if(lane==0u||lane==8u){let at=half*8u;let a=positive64Add(nativeLanes[at],nativeLanes[at+1u]);let b=positive64Add(nativeLanes[at+2u],nativeLanes[at+3u]);let c=positive64Add(nativeLanes[at+4u],nativeLanes[at+5u]);let d=positive64Add(nativeLanes[at+6u],nativeLanes[at+7u]);nativeLanes[at]=positive64Add(positive64Add(a,b),positive64Add(c,d));}workgroupBarrier();
 if(lane==0u){let value=positive64Add(nativeLanes[0],nativeLanes[8]);nativeMeans[p.gray*cells+block]=select(vec2u(value.x,value.y-0x800000u),vec2u(0u),positive64Zero(value));}
}
