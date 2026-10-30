// Mathematical unsigned Philox only; no model, captured state or inputs.
export const MPS_PHILOX_CORE_WGSL=String.raw`
fn mpsMultiplyHigh(a:u32,b:u32)->u32 {
 let a0=a&65535u;let a1=a>>16u;let b0=b&65535u;let b1=b>>16u;
 let p00=a0*b0;let p10=a1*b0;let p01=a0*b1;let p11=a1*b1;
 let carry=(p00>>16u)+(p10&65535u)+(p01&65535u);
 return p11+(p10>>16u)+(p01>>16u)+(carry>>16u);
}
fn mpsPhiloxBlock(counter:vec4<u32>,initialKey:vec2<u32>,index:u32)->vec4<u32>{
 let a=counter.x+index;let carry0=select(0u,1u,a<counter.x);
 let b=counter.y+carry0;let carry1=select(0u,1u,b<counter.y);
 let z=counter.z+carry1;let carry2=select(0u,1u,z<counter.z);
 var c=vec4<u32>(a,b,z,counter.w+carry2);var key=initialKey;
 for(var round=0u;round<10u;round=round+1u){
  let hi0=mpsMultiplyHigh(c.x,0xd2511f53u);let hi1=mpsMultiplyHigh(c.z,0xcd9e8d57u);
  c=vec4<u32>(hi1^c.y^key.x,0xcd9e8d57u*c.z,hi0^c.w^key.y,0xd2511f53u*c.x);
  key=key+vec2<u32>(0x9e3779b9u,0xbb67ae85u);
 }return c;
}
fn mpsPhiloxValue(counter:vec4<u32>,key:vec2<u32>,index:u32)->f32{
 let c=mpsPhiloxBlock(counter,key,index/4u);return f32(c[index%4u]&0x7fffffu)*0.00000011920928955078125;
}
`;
