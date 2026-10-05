import {PagedSiftFeatureEngine} from './sift-paged.js';
import {createTemporarySession} from './temporary-storage.js';
import {ForgeryscopePreparation} from './forgeryscope-preparation.js';
import {requireValue,EngineError} from './errors.js';
const tensor=(data,dims)=>({data,dims,type:'float32'});
export function createForgeryscopeSift({budget,pool,factory,identity,profile={maxWorkers:2}}){
  const preparation=new ForgeryscopePreparation(budget,factory),paged=new PagedSiftFeatureEngine(budget,profile);
  return {
    identity,
    async extract(image,{transform='original',signal,backend='auto',onProgress,segmentedSift}={}){
      const {width,height,data}=image,variant=['original','fliplr','flipud','rot180'].indexOf(transform);
      requireValue(variant>=0,'Invalid SIFT transform.');
      const release=budget.reserve(4096*133*4+8);let complete=false,run;
      try{
        let result;
        if(segmentedSift===true||segmentedSift!==false&&width*height>262144){
          preparation.clear();pool.clear();let session,pending,features;
          const getTemporarySession=async()=>session??(pending??=createTemporarySession({budget,signal}).then(s=>session=s));
          const source={width,height,async readRows(y,rows){const free=budget.reserve(width*rows*3);try{const out=new Uint8Array(width*rows*3);for(let yy=0;yy<rows;yy++){const sy=variant===2||variant===3?height-1-y-yy:y+yy;if(variant===0||variant===2)out.set(data.subarray(sy*width*3,(sy+1)*width*3),yy*width*3);else for(let x=0;x<width;x++){const from=(sy*width+width-1-x)*3,to=(yy*width+x)*3;out[to]=data[from];out[to+1]=data[from+1];out[to+2]=data[from+2];}}return {pixels:{format:'rgb8',width,height:rows,data:out},release:free};}catch(e){free();throw e;}}};
          try{
            features=await paged.extract(source,{family:'Forgeryscope-SIFT',limit:4096,backend:backend==='wasm'?'cpu':backend,signal,onProgress,storageContext:{getTemporarySession}});
            const count=features.points.length/7,keypoints=new Float32Array(count*2),scales=new Float32Array(count),oris=new Float32Array(count),scores=new Float32Array(count);
            for(let i=0;i<count;i++){keypoints[i*2]=features.points[i*7];keypoints[i*2+1]=features.points[i*7+1];scales[i]=features.points[i*7+2];oris[i]=features.points[i*7+3];scores[i]=features.points[i*7+4];}
            result={keypoints:tensor(keypoints,[1,count,2]),scales:tensor(scales,[1,count]),oris:tensor(oris,[1,count]),keypoint_scores:tensor(scores,[1,count]),descriptors:tensor(features.descriptors.slice(),[1,count,128]),size:tensor(new Float32Array([width,height]),[1,2]),execution:features.metadata};
          }finally{features?.release();await session?.dispose();}
        }else result=await preparation.admitted(width*height*400+4096*1024,(m,alloc)=>{
          const p=alloc(data.byteLength,data,'HEAPU8');
          try{
            const count=m._fg_sift(p,width,height,variant);
            if(count<0)throw new EngineError('FEATURE_EXTRACTION','Native-profile SIFT extraction failed: '+count);
            const packed=m.HEAPF32.slice(m._fg_sift_points()/4,m._fg_sift_points()/4+count*5);
            const keypoints=new Float32Array(count*2),scales=new Float32Array(count),oris=new Float32Array(count),scores=new Float32Array(count);
            for(let i=0;i<count;i++){keypoints[i*2]=packed[i*5];keypoints[i*2+1]=packed[i*5+1];scales[i]=packed[i*5+2];oris[i]=packed[i*5+3];scores[i]=packed[i*5+4];}
            return {keypoints:tensor(keypoints,[1,count,2]),scales:tensor(scales,[1,count]),oris:tensor(oris,[1,count]),keypoint_scores:tensor(scores,[1,count]),descriptors:tensor(m.HEAPF32.slice(m._fg_sift_descriptors()/4,m._fg_sift_descriptors()/4+count*128),[1,count,128]),size:tensor(new Float32Array([width,height]),[1,2])};
          }finally{m._fg_sift_release();}
        },signal);
        const n=result.descriptors.dims[1];
        if(n){
          run=await pool.run('rootsift',{descriptors:{...result.descriptors,dims:[n,128]}},{signal,backend,onProgress,cpuRequired:true,workspaceBytes:n*4096,outputBytes:n*128*4});
          result.descriptors=tensor(run.result.normalized.data.slice(),[1,n,128]);
        }
        complete=true;return {...result,release};
      }finally{run?.release();if(!complete)release();}
    },
    clearCache(){preparation.clear();},
    dispose(){paged.dispose();preparation.dispose();}
  };
}
