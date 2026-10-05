// Composed scientific path, still experimental: fixed native 448/298/597 graph.
// The loader supplies actual verified parameters; no expected activations enter.
import {requireValue,checkAbort} from '../../src/errors.js';
export function createDescriptors({convolution,math,budget,loadConvolution,loadBatchNorm}) {
 let busy=false;
 return {
  async run(rgb,{signal,onStage}={}) {
   requireValue(!busy,'Descriptors busy');requireValue(rgb instanceof Float32Array&&rgb.length===3*448*448,'Native-prepared RGB448 tensor required');checkAbort(signal);busy=true;
   const held=new Set(),keep=r=>(held.add(r),r),drop=r=>{if(held.delete(r))r.release();};
   let release;
   try {
    release=budget.reserve((36+96)*448*448*2+rgb.byteLength);
    const zm=new Uint16Array(36*448*448),cnn=new Uint16Array(96*448*448);
    const trace=async(name,data)=>{checkAbort(signal);await onStage?.(name,data);checkAbort(signal);};
    const conv=async(name,input)=>{const spec=await loadConvolution(name,{signal});try{return keep(await convolution.run({...spec,input},{signal}));}finally{spec.release?.();}};
    const unary=async(operation,input,args={})=>keep(await math.run(operation,{input,...args},{signal}));
    for(const [scaleIndex,side] of [597,448,298].entries()) {
     let scaled;
     if(side!==448)scaled=await unary('resize',rgb,{channels:3,height:448,width:448,outHeight:side,outWidth:side});
     const image=scaled?.data??rgb;await trace(side+'-input',image);
     const real=await conv(side+'-zm-real',image),imag=await conv(side+'-zm-imag',image);
     await trace(side+'-zm-real',real.data);await trace(side+'-zm-imag',imag.data);
     let magnitude=await unary('magnitude',real.data,{imag:imag.data});drop(real);drop(imag);
     if(side!==448){const resized=await unary('resize',magnitude.data,{channels:12,height:side,width:side,outHeight:448,outWidth:448});drop(magnitude);magnitude=resized;}
     await trace(side+'-zm-float',magnitude.data);
     const zmHalf=await unary('half',magnitude.data);drop(magnitude);zm.set(zmHalf.data,scaleIndex*12*448*448);drop(zmHalf);
     let value=await unary('reflect',image,{channels:3,height:side,width:side,pad:7});if(scaled)drop(scaled);
     await trace(side+'-cnn-input',value.data);
     for(const index of [0,3,6,9,12]) {
      const output=await conv(side+'-cnn-'+index,value.data);drop(value);value=output;
      await trace(side+'-cnn-'+index,value.data);
      if(index!==12){const params=await loadBatchNorm(side+'-cnn-'+index,{signal});let affine;try{affine=await unary('affine',value.data,{channels:value.shape[1],height:value.shape[2],width:value.shape[3],...params});}finally{params.release?.();}drop(value);value=affine;await trace(side+'-relu-'+index,value.data);}
     }
     if(side!==448){const resized=await unary('resize',value.data,{channels:32,height:side,width:side,outHeight:448,outWidth:448});drop(value);value=resized;}
     await trace(side+'-cnn-float',value.data);
     const cnnHalf=await unary('half',value.data);drop(value);cnn.set(cnnHalf.data,scaleIndex*32*448*448);drop(cnnHalf);
    }
    const free=release;release=null;
    return {zm,cnn,release:free};
   } finally { for(const value of held)value.release();release?.();busy=false; }
  }
 };
}
