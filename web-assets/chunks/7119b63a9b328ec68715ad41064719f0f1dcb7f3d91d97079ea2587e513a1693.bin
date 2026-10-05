import "../../runtime-context.js?v=0.14.5";
import {extractAlikedSegmented} from './aliked-segmented.js';
import {EngineError,requireValue,checkAbort,checkpoint} from './errors.js';
import {decodeForgeryscopeYolo,parseForgeryscopePanels} from './forgeryscope-yolo.js';
import {overlapFromAffine} from './forgeryscope-geometry.js';
import {runMicroMatcher} from './forgeryscope-micro-matcher.js';
const MiB=1024**2,f=Math.fround;
const bytes=object=>Object.values(object).reduce((n,t)=>n+(t?.data?.byteLength??0),0);
const tensor=(data,dims)=>({data,dims,type:'float32'});
export function cropForgeryscopeRGB(image,box){
  const norm=(x,n)=>Math.max(0,Math.min(n,(x=Math.trunc(x))<0?n+x:x));
  const x=norm(box[0],image.width),y=norm(box[1],image.height),right=norm(box[2],image.width),bottom=norm(box[3],image.height),w=right-x,h=bottom-y;
  requireValue(w>0&&h>0,'Empty panel crop.');
  const data=new Uint8Array(w*h*3);
  for(let row=0;row<h;row++)data.set(image.data.subarray(((y+row)*image.width+x)*3,((y+row)*image.width+right)*3),row*w*3);
  return {data,width:w,height:h};
}
/** Actual public model stages. SIFT is the shared native-compatible extractor
 * contract; absence is an explicit error, never an ALIKED substitute.
 */
export class ForgeryscopeNetworks {
  constructor({pool,preparation,budget,assets,sift,alikedSegments=false}){this.pool=pool;this.preparation=preparation;this.budget=budget;this.assets=assets;this.sift=sift;this.alikedSegments=alikedSegments;}
  async detect(image,kind,options={}){
    const prepared=await this.preparation.yolo(image,options);let run;
    try{
      const n=prepared.tensor.dims[2]*prepared.tensor.dims[3];
      run=await this.pool.run(kind==='panels'?'yolo_panel_extractor':'yolo_lane_extractor',{rgb:prepared.tensor},{...options,workspaceBytes:n*512,outputBytes:n*4,cpuRequired:true});
      const t=run.result.predictions;
      const rows=await decodeForgeryscopeYolo(t.data,{...options,kind,width:image.width,height:image.height,inputWidth:prepared.tensor.dims[3],inputHeight:prepared.tensor.dims[2],classes:t.dims[1]-4,anchors:t.dims[2]});
      return kind==='panels'?parseForgeryscopePanels(rows,this.assets.yolo_panel_extractor.classes):rows;
    }finally{run?.release();prepared.release();}
  }
  async embed(images,name,options={}){
    const spec=this.assets[name],count=images.length;
    requireValue(count>0&&count<=8,'Native embedding batches contain 1–8 images.');
    const n=spec.width*spec.height*3,release=this.budget.reserve(count*n*4);let run;
    try{
      const data=new Float32Array(count*n);
      for(let i=0;i<count;i++){const p=await this.preparation.embedding(images[i],spec,options);try{data.set(p.tensor.data,i*n);}finally{p.release();}}
      run=await this.pool.run(name,{rgb:tensor(data,[count,3,spec.height,spec.width])},{...options,workspaceBytes:count*spec.width*spec.height*1024,outputBytes:count*1024*4});
      requireValue(run.result.embedding.data.length===count*1024,'Embedding shape mismatch.');
      return {vectors:run.result.embedding.data,release:run.release};
    }catch(e){run?.release();throw e;}finally{release();}
  }
  async extractBlot(image,transform='original',options={}){
    if(this.alikedSegments&&(options.segmentedAliked||image.width*image.height>262144)){requireValue(transform==='original','Blot extraction uses original orientation.');return extractAlikedSegmented(image,{pool:this.pool,preparation:this.preparation,budget:this.budget,...options});}
    const {width:w,height:h}=image,n=w*h,owned=[],releaseInput=this.budget.reserve(n*12+512*32);let complete=false;
    const keep=async(name,feeds,workspaceBytes,outputBytes)=>{const r=await this.pool.run(name,feeds,{...options,workspaceBytes,outputBytes,cpuRequired:true});owned.push(r);return r.result;};
    try{
      const data=new Float32Array(n*3),flipX=['fliplr','rot180'].includes(transform),flipY=['flipud','rot180'].includes(transform);
      for(let y=0;y<h;y++){
        if(y%128===0)await checkpoint(options.signal);
        for(let x=0;x<w;x++)for(let c=0;c<3;c++)data[c*n+y*w+x]=image.data[((flipY?h-y-1:y)*w+(flipX?w-x-1:x))*3+c]/255;
      }
      const padded=(Math.ceil(h/32)*32)*(Math.ceil(w/32)*32);
      const dense=await keep('aliked-blot-dense',{image:tensor(data,[1,3,h,w])},padded*2048,n*129*4);
      const detected=await keep('aliked-blot-detect',{scores:dense.scores},n*32,n*4+4);
      const indices=await this.preparation.select(dense.scores,detected.nms,detected.mean.data[0],options),k=indices.data.length;
      if(!k)return {keypoints:tensor(new Float32Array(0),[1,0,2]),descriptors:tensor(new Float32Array(0),[1,0,128]),keypoint_scores:tensor(new Float32Array(0),[1,0]),size:tensor(new Float32Array([w,h]),[1,2]),release:()=>{}};
      const localized=await keep('aliked-blot-localize',{scores:dense.scores,indices},n*8+k*512,k*16);
      const described=await keep('aliked-blot-describe',{features:dense.features,keypoints:localized.keypoints},n*512+k*32768,k*160*4);
      const resultBytes=k*131*4+8,release=this.budget.reserve(resultBytes);
      try{
        const points=new Float32Array(k*2);
        for(let i=0;i<points.length;i++){
          const size=i%2?h:w;
          const pixel=f(f((size-1)*f(localized.keypoints.data[i]+1))/2);
          points[i]=f(f(pixel+.5)-.5); // native Extractor with resize=None, scale=1
        }
        const result={keypoints:tensor(points,[1,k,2]),descriptors:tensor(described.descriptors.data.slice(),[1,k,128]),keypoint_scores:tensor(localized.confidence.data.slice(),[1,k]),size:tensor(new Float32Array([w,h]),[1,2]),release};
        complete=true;return result;
      }finally{if(!complete)release();}
    }finally{for(const r of owned)r.release();releaseInput();}
  }
  async match(image0,image1,label,options={}){
    const micro=label==='Microscopy';
    if(micro&&!this.sift)throw new EngineError('MODEL_UNAVAILABLE','Native-compatible SIFT extractor is required for microscopy.');
    const extract=(image,transform)=>micro?this.sift.extract(image,{...options,transform,resize:null,max_num_keypoints:4096}):this.extractBlot(image,transform,options);
    const a=await extract(image0,'original');let best=null;
    try{
      for(const transform of micro?['original','fliplr','flipud','rot180']:['original']){
        const b=await extract(image1,transform);let matched,release;
        try{
          const n=a.keypoints.dims[1],m=b.keypoints.dims[1];if(n<4||m<4)continue;
          const inputs={keypoints0:a.keypoints,keypoints1:b.keypoints,descriptors0:a.descriptors,descriptors1:b.descriptors,size0:a.size,size1:b.size};
          if(micro){
            Object.assign(inputs,{scales0:a.scales,scales1:b.scales,oris0:a.oris,oris1:b.oris});
            release=this.budget.reserve((n+m)*32768+MiB);
            const result=await runMicroMatcher(inputs,{...options,runGraph:async(name,feeds)=>{
              const r=await this.pool.run('micro/'+name,feeds,{...options,workspaceBytes:(n*m)*64+(n+m)*8192,outputBytes:(n+m)*32768});
              try{return r.result;}finally{r.release();} // outer state reservation retains graph outputs
            }});
            matched={matches0:{data:result.matches0},scores0:{data:result.matching_scores0}};
          }else{
            const r=await this.pool.run('lightglue-blot',inputs,{...options,workspaceBytes:n*m*96+(n+m)*8192,outputBytes:(n+m)*12});
            matched=r.result;release=r.release;
          }
          const p0=[],p1=[],scores=[];
          for(let i=0;i<n;i++){const j=Number(matched.matches0.data[i]);if(j>=0){p0.push(...a.keypoints.data.subarray(i*2,i*2+2));p1.push(...b.keypoints.data.subarray(j*2,j*2+2));scores.push(matched.scores0.data[i]);}}
          const estimate=await this.preparation.affine(new Float32Array(p0),new Float32Array(p1),!micro,options);
          if(estimate.error)continue;
          const result=overlapFromAffine(estimate.matrix,estimate.inliers,new Float32Array(scores),[image0.width,image0.height],[image1.width,image1.height],transform);
          if(!result.error&&(!best||result.mean_match_score>best.mean_match_score))best=result;
        }finally{release?.();b.release();}
      }
    }finally{a.release();}
    if(best&&!micro){delete best.H_transformed;delete best.transform_type;}
    checkAbort(options.signal);return best??{error:micro?'All transform variations failed to find matches':'Affine transformation computation failed'};
  }
}
