import "../../../../runtime-context.js?v=0.31.0";
/*
 * Private CPU feature-extraction derivative of Splicebuster (SB):
 * D. Cozzolino, G. Poggi and L. Verdoliva, "Splicebuster: a new blind image
 * splicing detector", IEEE WIFS, 2015. Cite the paper when using this code.
 *
 * Copyright (c) 2018 Image Processing Research Group of University Federico II
 * of Naples ('GRIP-UNINA'). All rights reserved.
 * This work should only be used for nonprofit purposes. Original LICENSE.txt
 * applies: http://www.grip.unina.it/download/LICENSE_OPEN.txt
 *
 * Arithmetic profile: native ARM H-FMA/V-separated residuals and SciPy1.17
 * four-product pooling groups. Morphology keeps mode='ignore' at true borders.
 * This module supports full-width vertical source windows, without resizing.
 */

const f32 = Math.fround, FEATURES = 50, BINS = 25;
const CR = f32(.299), CG = f32(.587), CB = f32(.114);
const points = radius => {
  const p = [];
  for (let y = -radius; y <= radius; y++) for (let x = -radius; x <= radius; x++)
    if (x*x + y*y <= radius*radius) p.push(y,x);
  return Int8Array.from(p);
};
const DISK3 = points(3), DISK2 = points(2);
const MAPPER = (() => {
  const table = new Uint8Array(81), seen = new Uint8Array(81); let num=0;
  for(let i=0;i<81;i++) {
    if(seen[i])continue;
    let v=i, reverse=0;
    for(let k=0;k<4;k++){reverse=reverse*3+v%3;v=Math.floor(v/3);}
    for(const j of [i,80-i,reverse,80-reverse]){seen[j]=1;table[j]=num;}
    num++;
  }
  return table;
})();

function integer(v, name, minimum=0) {
  if(!Number.isSafeInteger(v)||v<minimum)throw new RangeError(`${name} must be a safe integer >=${minimum}`);
  return v;
}
function safeProduct(a,b,name){const n=a*b;if(!Number.isSafeInteger(n))throw new RangeError(`${name} exceeds safe offsets`);return n;}
function safeSum(values,name){const n=values.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(n))throw new RangeError(`${name} exceeds safe offsets`);return n;}

/** Source rows needed by raw rows [a,a+n). The image boundary is authoritative. */
export function requiredWindow({imageHeight,rawRowStart,rawRowCount,stride=8,dropSaturated=true}) {
  integer(imageHeight,'imageHeight',1);integer(rawRowStart,'rawRowStart');integer(rawRowCount,'rawRowCount',1);
  if(stride!==4&&stride!==8)throw new RangeError('Only reference strides4/8 are supported');
  const total=Math.floor((imageHeight-8)/stride);
  if(rawRowStart+rawRowCount>total)throw new RangeError('Raw rows exceed the global image grid');
  const first=rawRowStart*stride,end=(rawRowStart+rawRowCount)*stride;
  // Weights are sampled at y+4. Opening radius3 twice plus erosion radius4
  // needs10 pixels around that sample: source [first-6,end+14).
  // Without saturation the cooccurrence/residual chain needs [first,end+7).
  const top=Math.max(0,first-(dropSaturated?6:0));
  const bottom=Math.min(imageHeight,end+(dropSaturated?14:7));
  return {originY:top,height:bottom-top,top,bottom,rawRowStart,rawRowCount,stride};
}

/** Allocation-only plan; does not touch pixels or run calibration work. */
export function planRaw(options) {
  const width=integer(options.width,'width',1),height=integer(options.height,'height',1);
  const imageWidth=integer(options.imageWidth??width,'imageWidth',1);
  const imageHeight=integer(options.imageHeight??height,'imageHeight',1);
  const originY=integer(options.originY??0,'originY');
  if(width!==imageWidth)throw new RangeError('Only full-width vertical windows are implemented');
  if(originY+height>imageHeight)throw new RangeError('Source window exceeds the global image');
  const small=safeProduct(imageWidth,imageHeight,'Image pixels')<=20000;
  const stride=options.stride??(small?4:8),ksize=options.ksize??(small?64:128);
  if(stride!==4&&stride!==8)throw new RangeError('Only reference strides4/8 are supported');
  if(ksize!==64&&ksize!==128)throw new RangeError('Only reference pooling sizes64/128 are supported');
  const rawTotalRows=Math.floor((imageHeight-8)/stride),rawCols=Math.floor((imageWidth-8)/stride);
  if(rawTotalRows<1||rawCols<1)throw new RangeError('Image is too small for raw SPAM features');
  const rawRowStart=integer(options.rawRowStart??0,'rawRowStart');
  const rawRowCount=integer(options.rawRowCount??rawTotalRows-rawRowStart,'rawRowCount',1);
  const dropSaturated=options.dropSaturated!==false;
  const required=requiredWindow({imageHeight,rawRowStart,rawRowCount,stride,dropSaturated});
  if(originY>required.top||originY+height<required.bottom)
    throw new RangeError(`Source window lacks exact context: need [${required.top},${required.bottom}), received [${originY},${originY+height})`);
  const pixels=safeProduct(width,height,'Window pixels'),cells=safeProduct(rawRowCount,rawCols,'Raw feature cells');
  const residualRows=rawRowCount*stride+3,residualCols=width-4;
  const residualElements=safeProduct(residualRows,residualCols,'Residual elements');
  if(residualElements>pixels)throw new RangeError('Residual workspace exceeds its source window');
  const outputBytes=safeSum([safeProduct(cells,FEATURES*4+4,'Raw output bytes'),safeProduct(rawRowCount+rawCols,8,'Coordinate bytes')],'Raw output bytes');
  const grayBytes=safeProduct(pixels,4,'Grayscale bytes');
  const workspaceBytes=dropSaturated?safeProduct(pixels,3,'Morphology bytes'):safeProduct(residualElements,2,'Residual bytes');
  const peakAdditionalBytes=safeSum([grayBytes,workspaceBytes,outputBytes,200,4096],'Additional bytes');
  return {width,height,imageWidth,imageHeight,originY,small,stride,ksize,
    rawRowStart,rawRowCount,rawTotalRows,rawCols,features:FEATURES,bins:BINS,
    ky:ksize/stride,kx:ksize/stride,dropSaturated,requiredWindow:required,
    residualRows,residualCols,residualElements,grayBytes,workspaceBytes,outputBytes,
    peakAdditionalBytes,
    memoryMeaning:'Additional typed-array envelopes; caller RGB and browser overhead are separate'};
}

export function rgb8ToGrayF32(rgb,width,height) {
  if(!(rgb instanceof Uint8Array||rgb instanceof Uint8ClampedArray)||rgb.length!==width*height*3)
    throw new RangeError('Expected packed RGB8 for the complete source window');
  const gray=new Float32Array(width*height);
  for(let i=0,j=0;i<gray.length;i++,j+=3)
    gray[i]=f32(f32(f32(CR*rgb[j])+f32(CG*rgb[j+1]))+f32(CB*rgb[j+2]))/256;
  return gray;
}

function morphDisk(src,dst,width,height,footprint,erosion) {
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    let value=erosion?1:0;
    for(let k=0;k<footprint.length;k+=2) {
      const yy=y+footprint[k],xx=x+footprint[k+1];
      if(yy<0||yy>=height||xx<0||xx>=width)continue;
      const v=src[yy*width+xx]!==0;
      if(erosion?!v:v){value=erosion?0:1;break;}
    }
    dst[y*width+x]=value;
  }
}

/** Exact square binary erosion with neutral true outside, two integer passes. */
export function erodeSquareSliding(src,width,height,radius=4,{horizontal,output}={}) {
  integer(width,'width',1);integer(height,'height',1);integer(radius,'radius');
  if(!(src instanceof Uint8Array)||src.length!==width*height)throw new RangeError('Invalid binary erosion input');
  const tmp=horizontal??new Uint8Array(src.length),dst=output??new Uint8Array(src.length);
  if(!(tmp instanceof Uint8Array)||!(dst instanceof Uint8Array)||tmp.length!==src.length||dst.length!==src.length||tmp.buffer===src.buffer||dst.buffer===tmp.buffer)
    throw new RangeError('Erosion passes require distinct compatible buffers');
  for(let y=0;y<height;y++) {
    const row=y*width;let zeros=0;
    for(let x=0;x<=Math.min(radius,width-1);x++)zeros+=src[row+x]===0;
    for(let x=0;x<width;x++) {
      tmp[row+x]=zeros===0;
      if(x-radius>=0)zeros-=src[row+x-radius]===0;
      if(x+radius+1<width)zeros+=src[row+x+radius+1]===0;
    }
  }
  for(let x=0;x<width;x++) {
    let zeros=0;
    for(let y=0;y<=Math.min(radius,height-1);y++)zeros+=tmp[y*width+x]===0;
    for(let y=0;y<height;y++) {
      dst[y*width+x]=zeros===0;
      if(y-radius>=0)zeros-=tmp[(y-radius)*width+x]===0;
      if(y+radius+1<height)zeros+=tmp[(y+radius+1)*width+x]===0;
    }
  }
  return dst;
}

function saturationWorkspace(gray,width,height) {
  const a=new Uint8Array(gray.length),b=new Uint8Array(gray.length),c=new Uint8Array(gray.length);
  for(let i=0;i<a.length;i++)a[i]=gray[i]<6/256;
  morphDisk(a,b,width,height,DISK3,true);morphDisk(b,c,width,height,DISK3,false);
  for(let i=0;i<a.length;i++)a[i]=gray[i]>252/256;
  morphDisk(a,b,width,height,DISK2,true);morphDisk(b,a,width,height,DISK2,false);
  for(let i=0;i<c.length;i++)c[i]=1-(c[i]|a[i]);
  erodeSquareSliding(c,width,height,4,{horizontal:a,output:b});
  return {weights:b,h:a,v:c};
}

export function saturationWeightsSliding(gray,width,height) {
  if(!(gray instanceof Float32Array)||gray.length!==width*height)throw new RangeError('Invalid grayscale geometry');
  return saturationWorkspace(gray,width,height).weights;
}

function quant(r) {
  return Math.min(2,Math.max(0,Math.sign(r)*Math.floor(f32(Math.abs(f32(r/(6/256)))+.5))+1));
}

/** Returns raw histograms for global raw rows, before pooling and square root. */
export function prepareRaw(options) {
  const p=planRaw(options),gray=rgb8ToGrayF32(options.rgb,p.width,p.height);
  let pixelWeights,h,v;
  if(p.dropSaturated) {
    const space=saturationWorkspace(gray,p.width,p.height);pixelWeights=space.weights;
    // Reuse the two no-longer-needed morphology backings for quantized residues.
    h=space.h.subarray(0,p.residualElements);v=space.v.subarray(0,p.residualElements);
  } else {h=new Uint8Array(p.residualElements);v=new Uint8Array(p.residualElements);}
  const y0=p.rawRowStart*p.stride-p.originY,w=p.width,rc=p.residualCols;
  for(let y=0;y<p.residualRows;y++)for(let x=0;x<rc;x++) {
    const at=(y0+y+2)*w+x;
    let rh=gray[at+1];rh=f32(rh-3*gray[at+2]);rh=f32(rh+3*gray[at+3]);rh=f32(rh-gray[at+4]);
    const av=(y0+y)*w+x+2;
    let rv=gray[av+w];rv=f32(rv+f32(-3*gray[av+2*w]));rv=f32(rv+f32(3*gray[av+3*w]));rv=f32(rv-gray[av+4*w]);
    const i=y*rc+x;h[i]=quant(rh);v[i]=quant(rv);
  }
  const cells=p.rawRowCount*p.rawCols,spam=new Float32Array(cells*FEATURES),weights=new Float32Array(cells);
  const range0=new Float64Array(p.rawRowCount),range1=new Float64Array(p.rawCols),hist=new Uint16Array(BINS*4);
  const s=p.stride;
  for(let by=0;by<p.rawRowCount;by++)for(let bx=0;bx<p.rawCols;bx++) {
    hist.fill(0);let total=0;
    for(let dy=0;dy<s;dy++)for(let dx=0;dx<s;dx++) {
      const y=by*s+dy,x=bx*s+dx;
      if(pixelWeights&&!pixelWeights[(y0+y+4)*w+x+4])continue;
      total++;
      const a=(y+2)*rc+x,b=y*rc+x+2;
      const hh=h[a]+3*h[a+1]+9*h[a+2]+27*h[a+3];
      const vh=v[a]+3*v[a+1]+9*v[a+2]+27*v[a+3];
      const hv=h[b]+3*h[b+rc]+9*h[b+2*rc]+27*h[b+3*rc];
      const vv=v[b]+3*v[b+rc]+9*v[b+2*rc]+27*v[b+3*rc];
      hist[MAPPER[hh]]++;hist[BINS+MAPPER[vh]]++;hist[2*BINS+MAPPER[hv]]++;hist[3*BINS+MAPPER[vv]]++;
    }
    const cell=by*p.rawCols+bx,offset=cell*FEATURES;weights[cell]=total/(s*s);
    if(total)for(let f=0;f<BINS;f++) {
      spam[offset+f]=f32(f32(hist[BINS+f]/total)+f32(hist[2*BINS+f]/total));
      spam[offset+BINS+f]=f32(f32(hist[f]/total)+f32(hist[3*BINS+f]/total));
    }
  }
  for(let y=0;y<p.rawRowCount;y++)range0[y]=(p.rawRowStart+y)*s+4+(s-1)/2;
  for(let x=0;x<p.rawCols;x++)range1[x]=x*s+4+(s-1)/2;
  return {spam,weights,range0,range1,shape:[p.rawRowCount,p.rawCols,FEATURES],
    rawRowStart:p.rawRowStart,rawTotalRows:p.rawTotalRows,settings:p};
}

/** Pool selected global output rows from a raw rectangle with its ky-1 halo. */
export function poolRows(raw,options={}) {
  const [inRows,inCols,features]=raw.shape??[],stride=options.stride??raw.settings?.stride??8;
  const ksize=options.ksize??raw.settings?.ksize??128;
  integer(inRows,'raw rows',1);integer(inCols,'raw columns',1);
  if(features!==FEATURES||!(raw.spam instanceof Float32Array)||!(raw.weights instanceof Float32Array)
    ||raw.spam.length!==inRows*inCols*features||raw.weights.length!==inRows*inCols)
    throw new RangeError('Invalid raw SPAM rectangle');
  if((stride!==4&&stride!==8)||(ksize!==64&&ksize!==128))throw new RangeError('Unsupported pooling settings');
  const ky=ksize/stride,kx=ksize/stride,cols=inCols-kx+1;
  const rawStart=integer(raw.rawRowStart??raw.settings?.rawRowStart??0,'rawRowStart');
  const rawTotal=integer(raw.rawTotalRows??raw.settings?.rawTotalRows??inRows,'rawTotalRows',1);
  if(rawStart+inRows>rawTotal)throw new RangeError('Raw rectangle exceeds its global grid');
  const globalRows=rawTotal-ky+1;
  const start=integer(options.outputRowStart??rawStart,'outputRowStart');
  const rows=integer(options.outputRowCount??Math.min(inRows-ky+1,globalRows-start),'outputRowCount',1);
  const saturationProb=options.saturationProb??.85;
  if(!Number.isFinite(saturationProb)||saturationProb<0||saturationProb>1)throw new RangeError('Invalid saturationProb');
  if(cols<1||start<rawStart||start+rows>globalRows||start+rows+ky-1>rawStart+inRows)
    throw new RangeError('Raw rectangle lacks the requested pooling rows/halo');
  const spam=new Float32Array(rows*cols*features),weights=new Float32Array(rows*cols),valid=new Uint8Array(rows*cols);
  const range0=new Float64Array(rows),range1=new Float64Array(cols),coefficient=f32(1/(ky*kx));
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++) {
    const out=(y*cols+x)*features;let sumW=0;
    for(let dy=0;dy<ky;dy++) {
      const iy=y+start-rawStart+dy;
      for(let dx=0;dx<kx;dx+=4) {
        const i=iy*inCols+x+dx,offset=i*features;
        let w=f32(raw.weights[i]*coefficient);
        w=f32(w+raw.weights[i+1]*coefficient);w=f32(w+raw.weights[i+2]*coefficient);w=f32(w+raw.weights[i+3]*coefficient);
        sumW=f32(sumW+w);
        for(let f=0;f<features;f++) {
          let group=f32(raw.spam[offset+f]*coefficient);
          group=f32(group+raw.spam[offset+features+f]*coefficient);
          group=f32(group+raw.spam[offset+2*features+f]*coefficient);
          group=f32(group+raw.spam[offset+3*features+f]*coefficient);
          spam[out+f]=f32(spam[out+f]+group);
        }
      }
    }
    const i=y*cols+x;weights[i]=sumW;valid[i]=sumW>=saturationProb;
    for(let f=0;f<features;f++)spam[out+f]=f32(spam[out+f]/Math.max(sumW,1e-20));
  }
  for(let y=0;y<rows;y++)range0[y]=(start+y)*stride+4+(stride-1)/2+(ky-1)*stride/2;
  for(let x=0;x<cols;x++)range1[x]=x*stride+4+(stride-1)/2+(kx-1)*stride/2;
  return {spam,weights,valid,range0,range1,shape:[rows,cols,features],
    settings:{stride,ksize,ky,kx,outputRowStart:start,outputRowCount:rows,globalRows,cols}};
}

export const NUMERIC_PROFILE='native-arm-fma-group4-banded-cpu';
