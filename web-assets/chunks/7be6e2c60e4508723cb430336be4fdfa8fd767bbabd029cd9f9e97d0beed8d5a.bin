// PRIVATE entry point appended to the SAME candidate WGSL module. It reuses
// MPS Philox, roundedAdd, nonlocalIsLocal, wrap, Shape and both source uniforms.
// source contains only the immutable pair before nonlocal (2N floats).
export const FUSED_NONLOCAL_RANDOM_ENTRYPOINT='nonlocalResidentRandomMain';
export const FUSED_NONLOCAL_RANDOM_WGSL=String.raw`
@compute @workgroup_size(64) fn nonlocalResidentRandomMain(@builtin(global_invocation_id) id:vec3<u32>){
 let at=id.x;if(at>=shape.count){return;}let i=shape.begin+at;let n=shape.side*shape.side;
 let gx=f32(i%shape.side);let gy=f32(i/shape.side);
 let oldX=source[i];let oldY=source[n+i];var x=oldX;var y=oldY;
 if(nonlocalIsLocal(oldX,oldY)){
  let nx=mpsPhiloxValue(nonlocalSource.counterX,nonlocalSource.key,i);
  let ny=mpsPhiloxValue(nonlocalSource.counterY,nonlocalSource.key,i);
  x=roundedAdd(-gx,f32(shape.side)*nx);y=roundedAdd(-gy,f32(shape.side)*ny);
 }
 let minX=roundedAdd(x,-25.0);let maxX=roundedAdd(x,25.0);
 let minY=roundedAdd(y,-25.0);let maxY=roundedAdd(y,25.0);
 let a=mpsPhiloxValue(randomSource.counter,randomSource.key,i);
 let b=roundedAdd(1.0,mpsPhiloxValue(randomSource.counter,randomSource.key,n+i));
 let dx=roundedAdd(maxX,-minX)*0.5;let dy=roundedAdd(maxY,-minY)*0.5;
 let x0=roundedAdd(minX,dx*a);let x1=roundedAdd(minX,dx*b);
 let y0=roundedAdd(minY,dy*a);let y1=roundedAdd(minY,dy*b);
 let xs=array<f32,5>(x0,x1,x0,x1,x);let ys=array<f32,5>(y0,y0,y1,y1,y);
 for(var k=0u;k<5u;k++){output[k*shape.count+at]=wrap(xs[k],gx);output[(5u+k)*shape.count+at]=wrap(ys[k],gy);}
}
`;
