
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
@compute @workgroup_size(32) fn codec(@builtin(global_invocation_id) id:vec3<u32>){
 let block=id.x+id.y*p.groupsX*32u;if(block>=p.blocks){return;}let yn=p.yCols*p.yRows;let cn=p.cCols*p.cRows;let channel=select(select(1u,2u,block>=yn+cn),0u,block<yn);let local=select(select(block-yn,block-yn-cn,channel==2u),block,channel==0u);let cols=select(p.cCols,p.yCols,channel==0u);let bx=local%cols*8u;let by=local/cols*8u;let qo=select(64u,0u,channel==0u);
 var work:array<i32,64>;for(var y=0u;y<8u;y++){var x:array<i32,8>;for(var k=0u;k<8u;k++){x[k]=sample(bx+k,by+y,channel)-128;}let r=fdct(x,0u);for(var k=0u;k<8u;k++){work[y*8u+k]=r[k];}}
 for(var x=0u;x<8u;x++){var v:array<i32,8>;for(var k=0u;k<8u;k++){v[k]=work[k*8u+x];}let r=fdct(v,1u);for(var k=0u;k<8u;k++){let q=i32(quant[qo+k*8u+x]);let value=r[k];let coefficient=(abs(value)+q*4)/(q*8);work[k*8u+x]=select(coefficient,-coefficient,value<0);}}
 for(var k=0u;k<32u;k++){coefficientOutput[block*32u+k]=(bitcast<u32>(work[k*2u])&65535u)|((bitcast<u32>(work[k*2u+1u])&65535u)<<16u);}
 for(var x=0u;x<8u;x++){var v:array<i32,8>;for(var k=0u;k<8u;k++){v[k]=work[k*8u+x]*i32(quant[qo+k*8u+x]);}let r=idct(v,0u);for(var k=0u;k<8u;k++){work[k*8u+x]=r[k];}}
 for(var y=0u;y<8u;y++){var v:array<i32,8>;for(var k=0u;k<8u;k++){v[k]=work[y*8u+k];}let r=idct(v,1u);for(var k=0u;k<8u;k++){planes[block*64u+y*8u+k]=limit(r[k]);}}
}
fn readPlane(c:u32,x:i32,y:i32)->i32 {let width=select((p.width+1u)/2u,p.width,c==0u);let height=select((p.height+1u)/2u,p.height,c==0u);let xx=u32(clamp(x,0,i32(width)-1));let yy=u32(clamp(y,0,i32(height)-1));let cols=select(p.cCols,p.yCols,c==0u);let offset=select(p.yCols*p.yRows+(c-1u)*p.cCols*p.cRows,0u,c==0u);return i32(planes[(offset+yy/8u*cols+xx/8u)*64u+yy%8u*8u+xx%8u]);}
fn chroma(c:u32,x:u32,y:u32)->i32 {let xx=i32(x/2u);let yy=i32(y/2u);if((p.width+1u)/2u<=2u){return readPlane(c,xx,yy);}let vy=yy+select(-1,1,(y&1u)!=0u);let vx=xx+select(-1,1,(x&1u)!=0u);let a=readPlane(c,xx,yy)*3+readPlane(c,xx,vy);let b=readPlane(c,vx,yy)*3+readPlane(c,vx,vy);return (a*3+b+select(8,7,(x&1u)!=0u))>>4u;}
fn lookup(a:u32,b:u32)->u32{let i=(a<<8u)|b;return (tone[i/4u]>>((i%4u)*8u))&255u;}
fn renderPixel(at:u32)->vec2u{if(at>=p.width*p.height){return vec2u(0u);}let x=at%p.width;let y=at/p.width;let yy=readPlane(0u,i32(x),i32(y));let cb=chroma(1u,x,y)-128;let cr=chroma(2u,x,y)-128;let r=u32(clamp(yy+((91881*cr+32768)>>16u),0,255));let g=u32(clamp(yy+((-22554*cb-46802*cr+32768)>>16u),0,255));let b=u32(clamp(yy+((116130*cb+32768)>>16u),0,255));let raw=r|(g<<8u)|(b<<16u);var rr=lookup(u32(byte(at*3u)),r);var gg=lookup(u32(byte(at*3u+1u)),g);var bb=lookup(u32(byte(at*3u+2u)),b);if(p.gray!=0u){let gray=(rr*9798u+gg*19235u+bb*3735u+16384u)>>15u;rr=gray;gg=gray;bb=gray;}return vec2u(rr|(gg<<8u)|(bb<<16u),raw);}
fn pairByte(at:u32)->u32{return (pairInput[at/4u]>>((at%4u)*8u))&255u;}
fn residualPixel(at:u32)->u32{if(at>=p.width*p.height){return 0u;}var r=lookup(u32(byte(at*3u)),pairByte(at*3u));var g=lookup(u32(byte(at*3u+1u)),pairByte(at*3u+1u));var b=lookup(u32(byte(at*3u+2u)),pairByte(at*3u+2u));if(p.gray!=0u){let gray=(r*9798u+g*19235u+b*3735u+16384u)>>15u;r=gray;g=gray;b=gray;}return r|(g<<8u)|(b<<16u);}
fn packFour(v:vec4u)->vec3u{return vec3u(v.x|((v.y&255u)<<24u),(v.y>>8u)|((v.z&65535u)<<16u),(v.z>>16u)|(v.w<<8u));}
@compute @workgroup_size(64) fn render(@builtin(global_invocation_id) id:vec3<u32>){let group=id.x+id.y*p.renderGroupsX*64u;let at=group*4u;if(at>=p.width*p.height){return;}let a=renderPixel(at);let b=renderPixel(at+1u);let c=renderPixel(at+2u);let d=renderPixel(at+3u);let result=packFour(vec4u(a.x,b.x,c.x,d.x));let raw=packFour(vec4u(a.y,b.y,c.y,d.y));let words=(p.width*p.height*3u+3u)/4u;for(var k=0u;k<3u;k++){if(group*3u+k<words){output[group*3u+k]=result[k];if(p.captureRaw!=0u){rawOutput[group*3u+k]=raw[k];}}}}
@compute @workgroup_size(64) fn residual(@builtin(global_invocation_id) id:vec3<u32>){let group=id.x+id.y*p.renderGroupsX*64u;let at=group*4u;if(at>=p.width*p.height){return;}let result=packFour(vec4u(residualPixel(at),residualPixel(at+1u),residualPixel(at+2u),residualPixel(at+3u)));let words=(p.width*p.height*3u+3u)/4u;for(var k=0u;k<3u;k++){if(group*3u+k<words){output[group*3u+k]=result[k];}}}

@group(0) @binding(8) var<storage,read_write> coefficientOutput:array<u32>;
fn recompressedPixel(at:u32)->u32{if(at>=p.width*p.height){return 0u;}let x=at%p.width;let y=at/p.width;let yy=readPlane(0u,i32(x),i32(y));let cb=chroma(1u,x,y)-128;let cr=chroma(2u,x,y)-128;let r=u32(clamp(yy+((91881*cr+32768)>>16u),0,255));let g=u32(clamp(yy+((-22554*cb-46802*cr+32768)>>16u),0,255));let b=u32(clamp(yy+((116130*cb+32768)>>16u),0,255));let raw=r|(g<<8u)|(b<<16u);return raw;}
@compute @workgroup_size(64) fn recompressed(@builtin(global_invocation_id) id:vec3<u32>){let group=id.x+id.y*p.renderGroupsX*64u;let at=group*4u;if(at>=p.width*p.height){return;}let raw=packFour(vec4u(recompressedPixel(at),recompressedPixel(at+1u),recompressedPixel(at+2u),recompressedPixel(at+3u)));let words=(p.width*p.height*3u+3u)/4u;for(var k=0u;k<3u;k++){if(group*3u+k<words){rawOutput[group*3u+k]=raw[k];}}}
