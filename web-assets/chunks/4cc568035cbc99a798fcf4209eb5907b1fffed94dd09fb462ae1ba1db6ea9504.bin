
fn a32(a:f32,b:f32)->f32{return fma(1.0,a,b);}
fn s32(a:f32,b:f32)->f32{return fma(-1.0,b,a);}
fn twoSum(a:f32,b:f32)->vec2<f32>{let s=a32(a,b);let v=s32(s,a);let error=a32(s32(a,s32(s,v)),s32(b,v));return vec2<f32>(s,error);}
fn ddAdd(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let s=twoSum(a.x,b.x);return twoSum(s.x,a32(s.y,a32(a.y,b.y)));}
fn ddSub(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{return ddAdd(a,-b);}
fn ddMul(a:vec2<f32>,b:vec2<f32>)->vec2<f32>{let p=a.x*b.x;var e=fma(a.x,b.x,-p);e=fma(a.x,b.y,e);e=fma(a.y,b.x,e);e=fma(a.y,b.y,e);return twoSum(p,e);}
fn ddFma(a:vec2<f32>,b:vec2<f32>,c:vec2<f32>)->vec2<f32>{return ddAdd(ddMul(a,b),c);}
@group(0) @binding(0) var<storage,read> input:array<u32>;
@group(0) @binding(1) var<storage,read_write> variance:array<f32>;

fn castCertified(value:vec2<f32>,radius:f32)->bool{
 let bits=bitcast<u32>(value.x);let magnitude=bits&2147483647u;let exponent=magnitude>>23u;if(exponent<=24u||exponent>=255u){return false;}
 let step=bitcast<f32>((exponent-24u)<<23u);var lower=select(step,step*0.5,(magnitude&8388607u)==0u);var upper=step;
 if((bits&2147483648u)!=0u){let swap=upper;upper=lower;lower=swap;}
 return s32(value.y,radius)> -lower&&a32(value.y,radius)<upper;
}
fn down32(value:f32)->f32{let bits=bitcast<u32>(value);if((bits&2147483647u)<8388608u){return -bitcast<f32>(8388608u);}return bitcast<f32>(select(bits-1u,bits+1u,(bits&2147483648u)!=0u));}
fn up32(value:f32)->f32{let bits=bitcast<u32>(value);if((bits&2147483647u)<8388608u){return bitcast<f32>(8388608u);}return bitcast<f32>(select(bits+1u,bits-1u,(bits&2147483648u)!=0u));}
fn squareInterval(value:vec2<f32>,radius:f32)->vec2<f32>{
 let lo=down32(a32(value.x,down32(s32(value.y,radius))));let hi=up32(a32(value.x,up32(a32(value.y,radius))));let maximum=max(abs(lo),abs(hi));
 if(maximum>0.0&&maximum<bitcast<f32>(536870912u)){return vec2<f32>(0.0,bitcast<f32>(8388608u));}
 let lower=select(min(lo*lo,hi*hi),0.0,lo<=0.0&&hi>=0.0);return vec2<f32>(lower,maximum*maximum);
}
@group(0) @binding(2) var<storage,read_write> rejected:array<u32>;
struct Params{width:u32,height:u32,plane:u32,groupsX:u32};
@group(0) @binding(3) var<uniform> p:Params;
fn byte(at:u32)->u32{return (input[at/4u]>>((at%4u)*8u))&255u;}
@compute @workgroup_size(32) fn main(@builtin(global_invocation_id) id:vec3<u32>){
let block=id.x+id.y*p.groupsX*32u;if(block>=arrayLength(&variance)){return;}
let channel=block/p.plane;let point=block%p.plane;let cols=p.width-2u;
let first=byte(((point/cols)*p.width+point%cols)*3u+channel);var sameBytes=true;for(var dy=0u;dy<3u&&sameBytes;dy++){for(var dx=0u;dx<3u&&sameBytes;dx++){sameBytes=byte(((point/cols+dy)*p.width+point%cols+dx)*3u+channel)==first;}}if(sameBytes){variance[block]=0.0;rejected[block]=first+2u;return;}
let v0=vec2<f32>(f32(byte(((point/cols+0u)*p.width+point%cols+0u)*3u+channel)),0.0);
let v1=vec2<f32>(f32(byte(((point/cols+0u)*p.width+point%cols+1u)*3u+channel)),0.0);
let v2=vec2<f32>(f32(byte(((point/cols+0u)*p.width+point%cols+2u)*3u+channel)),0.0);
let v3=vec2<f32>(f32(byte(((point/cols+1u)*p.width+point%cols+0u)*3u+channel)),0.0);
let v4=vec2<f32>(f32(byte(((point/cols+1u)*p.width+point%cols+1u)*3u+channel)),0.0);
let v5=vec2<f32>(f32(byte(((point/cols+1u)*p.width+point%cols+2u)*3u+channel)),0.0);
let v6=vec2<f32>(f32(byte(((point/cols+2u)*p.width+point%cols+0u)*3u+channel)),0.0);
let v7=vec2<f32>(f32(byte(((point/cols+2u)*p.width+point%cols+1u)*3u+channel)),0.0);
let v8=vec2<f32>(f32(byte(((point/cols+2u)*p.width+point%cols+2u)*3u+channel)),0.0);
let v9=vec2<f32>(bitcast<f32>(1073741824u),bitcast<f32>(0u));
let v10=ddMul(v0,v9);
let v11=ddMul(v1,v9);
let v12=ddSub(v6,v3);
let v13=ddSub(v7,v4);
let v14=ddAdd(v6,v3);
let v15=ddAdd(v7,v4);
let v16=ddMul(v14,v9);
let v17=ddMul(v15,v9);
let v18=vec2<f32>(bitcast<f32>(3204448256u),bitcast<f32>(0u));
let v19=ddFma(v16,v18,v10);
let v20=ddFma(v17,v18,v11);
let v21=ddAdd(v10,v16);
let v22=ddAdd(v11,v17);
let v23=vec2<f32>(bitcast<f32>(1071494103u),bitcast<f32>(855999691u));
let v24=ddMul(v12,v23);
let v25=ddMul(v13,v23);
let v26=ddAdd(v19,v24);
let v27=ddAdd(v20,v25);
let v28=ddSub(v19,v24);
let v29=ddSub(v20,v25);
let v30=vec2<f32>(bitcast<f32>(1053885932u),bitcast<f32>(2994683196u));
let v31=ddMul(v30,v21);
let v32=ddMul(v30,v22);
let v33=ddMul(v30,v28);
let v34=ddMul(v30,v29);
let v35=ddMul(v30,v26);
let v36=ddMul(v30,v27);
let v37=vec2<f32>(bitcast<f32>(1056964608u),bitcast<f32>(2759852032u));
let v38=ddMul(v33,v37);
let v39=ddMul(v34,v37);
let v40=vec2<f32>(bitcast<f32>(1063105495u),bitcast<f32>(847611083u));
let v41=ddFma(v40,v35,v38);
let v42=ddFma(v40,v36,v39);
let v43=-v35;
let v44=-v36;
let v45=ddMul(v37,v43);
let v46=ddMul(v37,v44);
let v47=ddFma(v40,v33,v45);
let v48=ddFma(v40,v34,v46);
let v49=ddAdd(v41,v47);
let v50=ddAdd(v42,v48);
let v51=vec2<f32>(bitcast<f32>(1056964608u),bitcast<f32>(0u));
let v52=ddMul(v49,v51);
let v53=ddMul(v50,v51);
let v54=ddSub(v41,v47);
let v55=ddSub(v42,v48);
let v56=ddMul(v54,v51);
let v57=ddMul(v55,v51);
let v58=vec2<f32>(bitcast<f32>(1060439283u),bitcast<f32>(844097402u));
let v59=ddMul(v31,v58);
let v60=ddMul(v32,v58);
let v61=ddMul(v2,v9);
let v62=ddSub(v8,v5);
let v63=ddAdd(v8,v5);
let v64=ddMul(v63,v9);
let v65=ddFma(v64,v18,v61);
let v66=ddAdd(v61,v64);
let v67=ddMul(v62,v23);
let v68=ddAdd(v65,v67);
let v69=ddSub(v65,v67);
let v70=ddMul(v30,v66);
let v71=ddMul(v30,v69);
let v72=ddMul(v30,v68);
let v73=ddMul(v71,v37);
let v74=ddFma(v40,v72,v73);
let v75=-v72;
let v76=ddMul(v37,v75);
let v77=ddFma(v40,v71,v76);
let v78=ddAdd(v74,v77);
let v79=ddMul(v78,v51);
let v80=ddSub(v74,v77);
let v81=ddMul(v80,v51);
let v82=ddMul(v70,v58);
let v83=ddMul(v59,v9);
let v84=ddMul(v52,v9);
let v85=ddSub(v82,v60);
let v86=ddSub(v79,v53);
let v87=ddAdd(v82,v60);
let v88=ddAdd(v79,v53);
let v89=ddMul(v87,v9);
let v90=ddMul(v88,v9);
let v91=ddFma(v89,v18,v83);
let v92=ddFma(v90,v18,v84);

let v94=ddAdd(v84,v90);
let v95=ddMul(v85,v23);
let v96=ddMul(v86,v23);
let v97=ddAdd(v91,v95);
let v98=ddAdd(v92,v96);
let v99=ddSub(v91,v95);
let v100=ddSub(v92,v96);

let v102=ddMul(v30,v94);
let v103=ddMul(v30,v99);
let v104=ddMul(v30,v100);
let v105=ddMul(v30,v97);
let v106=ddMul(v30,v98);
let v107=ddMul(v103,v37);
let v108=ddMul(v104,v37);
let v109=ddFma(v40,v105,v107);
let v110=ddFma(v40,v106,v108);
let v111=-v105;
let v112=-v106;
let v113=ddMul(v37,v111);
let v114=ddMul(v37,v112);
let v115=ddFma(v40,v103,v113);
let v116=ddFma(v40,v104,v114);
let v117=ddAdd(v109,v115);
let v118=ddAdd(v110,v116);
let v119=ddMul(v117,v51);
let v120=ddMul(v118,v51);
let v121=ddSub(v109,v115);

let v123=ddMul(v121,v51);


let v126=ddMul(v102,v58);
let v127=ddMul(v56,v9);

let v129=ddAdd(v81,v57);
let v130=ddMul(v129,v9);

let v132=ddAdd(v127,v130);



let v136=ddMul(v30,v132);











let v148=ddMul(v136,v58);
var squares:array<f32,9>;
var lowerSquares:array<f32,9>;var upperSquares:array<f32,9>;
squares[0]=0.0;
lowerSquares[0]=0.0;upperSquares[0]=0.0;
let c1=a32(v119.x,v119.y);squares[1]=c1*c1;
if(castCertified(v119,bitcast<f32>(821690108u))){lowerSquares[1]=squares[1];upperSquares[1]=squares[1];}else{let interval=squareInterval(v119,bitcast<f32>(821690108u));lowerSquares[1]=interval.x;upperSquares[1]=interval.y;}
let c2=a32(v123.x,v123.y);squares[2]=c2*c2;
if(castCertified(v123,bitcast<f32>(821789173u))){lowerSquares[2]=squares[2];upperSquares[2]=squares[2];}else{let interval=squareInterval(v123,bitcast<f32>(821789173u));lowerSquares[2]=interval.x;upperSquares[2]=interval.y;}
let c3=a32(v126.x,v126.y);squares[3]=c3*c3;
if(castCertified(v126,bitcast<f32>(816909820u))){lowerSquares[3]=squares[3];upperSquares[3]=squares[3];}else{let interval=squareInterval(v126,bitcast<f32>(816909820u));lowerSquares[3]=interval.x;upperSquares[3]=interval.y;}
let c4=a32(v120.x,v120.y);squares[4]=c4*c4;
if(castCertified(v120,bitcast<f32>(828418023u))){lowerSquares[4]=squares[4];upperSquares[4]=squares[4];}else{let interval=squareInterval(v120,bitcast<f32>(828418023u));lowerSquares[4]=interval.x;upperSquares[4]=interval.y;}
squares[5]=0.0;
lowerSquares[5]=0.0;upperSquares[5]=0.0;
let c6=a32(v148.x,v148.y);squares[6]=c6*c6;
if(castCertified(v148,bitcast<f32>(817389350u))){lowerSquares[6]=squares[6];upperSquares[6]=squares[6];}else{let interval=squareInterval(v148,bitcast<f32>(817389350u));lowerSquares[6]=interval.x;upperSquares[6]=interval.y;}
squares[7]=0.0;
lowerSquares[7]=0.0;upperSquares[7]=0.0;
squares[8]=0.0;
lowerSquares[8]=0.0;upperSquares[8]=0.0;
var r0=squares[0];
var r1=squares[1];
var r2=squares[2];
var r3=squares[3];
var r4=squares[4];
var r5=squares[5];
var r6=squares[6];
var r7=squares[7];
var sum=a32(a32(a32(r0,r1),a32(r2,r3)),a32(a32(r4,r5),a32(r6,r7)));
sum=a32(sum,squares[8]);
variance[block]=sum;
var rLo0=lowerSquares[0];
var rLo1=lowerSquares[1];
var rLo2=lowerSquares[2];
var rLo3=lowerSquares[3];
var rLo4=lowerSquares[4];
var rLo5=lowerSquares[5];
var rLo6=lowerSquares[6];
var rLo7=lowerSquares[7];
var sumLo=a32(a32(a32(rLo0,rLo1),a32(rLo2,rLo3)),a32(a32(rLo4,rLo5),a32(rLo6,rLo7)));
sumLo=a32(sumLo,lowerSquares[8]);
var rHi0=upperSquares[0];
var rHi1=upperSquares[1];
var rHi2=upperSquares[2];
var rHi3=upperSquares[3];
var rHi4=upperSquares[4];
var rHi5=upperSquares[5];
var rHi6=upperSquares[6];
var rHi7=upperSquares[7];
var sumHi=a32(a32(a32(rHi0,rHi1),a32(rHi2,rHi3)),a32(a32(rHi4,rHi5),a32(rHi6,rHi7)));
sumHi=a32(sumHi,upperSquares[8]);
let error=max(abs(s32(sum,sumLo)),abs(s32(sumHi,sum)));rejected[block]=select(0u,1u,!(sum>=sumLo&&sum<=sumHi&&sum>=0.0&&sum<=1e30&&bitcast<u32>(sumLo)==bitcast<u32>(sumHi)&&bitcast<u32>(sum)==bitcast<u32>(sumLo)&&error<=bitcast<f32>(953267991u)));
}