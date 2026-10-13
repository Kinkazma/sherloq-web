import {deflateSync} from 'node:zlib';
// Old isolated UI fixtures do not contain real scientific NPZ data. Their
// tests exercise selection/progress/native-output presentation, not rerendering.
export function unavailableResultDisplayFactory(){
 return {describe(image){return {available:false,preferences:{schema:'sherloq.batch-result-display-preferences/1',mode:image.finalDisplay?.kind==='biomes'?'biomes':'corroboration',opacity:.35}};},async dispose(){},async preparePreview(){throw Error('Result rerendering is outside this isolated UI fixture.');},async ensureRendered(){throw Error('Result rerendering is outside this isolated UI fixture.');}};
}
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc=bytes=>{let value=0xffffffff;for(const b of bytes)value=table[(value^b)&255]^(value>>>8);return(value^0xffffffff)>>>0;};
export function solidPng(rgb){
 const chunk=(name,data)=>{const type=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);type.copy(out,4);Buffer.from(data).copy(out,8);out.writeUInt32BE(crc(Buffer.concat([type,Buffer.from(data)])),out.length-4);return out;};
 const dimensions=Buffer.alloc(13);dimensions.writeUInt32BE(2,0);dimensions.writeUInt32BE(2,4);dimensions[8]=8;dimensions[9]=2;
 return new Blob([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',dimensions),chunk('IDAT',deflateSync(Buffer.from([0,...rgb,...rgb,0,...rgb,...rgb]))),chunk('IEND',[])],{type:'image/png'});
}
export function displayFixture(){
 const artifacts=new Map(),original=solidPng([245,245,245]),native=solidPng([20,130,220]),corroboration=solidPng([235,60,50]);
 const image=(id,maximum,methods,kind)=>({id,name:id+'.png',width:2,height:2,blob:original,thumbnail:original,selected:true,family:'microscopy',state:'done',score:{clones:maximum,additional:0,total:maximum,incomplete:false},occurrences:[{studyId:'study',page:1}],preparation:{status:'ready',fingerprint:'f'.repeat(64),regions:[],excluded:[]},runs:[{title:'SIFT + G2NN + RANSAC',toolId:'clone-15',kind:'clones',operation:'tampering.copyMove.sparse',status:'done',positive:maximum>0,scopeSupport:{mode:'input-exclusions'},files:['native-'+id+'.png']}],finalDisplay:{kind,files:['final-'+id+'.png','final-'+id+'.npz'],methods,maximum,pendingRendering:false,scopeFingerprint:'f'.repeat(64)}});
 const images=[image('single',1,['SIFT'],'biomes'),image('double',2,['SIFT','Forgeryscope'],'corroboration'),image('four',4,['SIFT','Forgeryscope','D2PRL','SSG'],'corroboration'),image('derived',1,['D2PRL'],'biomes')];
 images[0].runs[0].view={areas:true,circles:false,lines:false,points:false};images[0].finalDisplay.files[0]=images[0].runs[0].files[0];
 images[3].runs[0].scopeSupport={mode:'derived-evidence'};images[3].runs.push({title:'TruFor',kind:'map',operation:'m2.trufor',status:'done',positive:false,scopeSupport:{mode:'raw-only'},files:['raw-derived.png']});
 for(const i of images){artifacts.set('native-'+i.id+'.png',native);artifacts.set(i.finalDisplay.files[0],i.finalDisplay.kind==='corroboration'?corroboration:native);artifacts.set(i.finalDisplay.files[1],new Blob(['exact native scientific counts']));}artifacts.set('raw-derived.png',corroboration);
 artifacts.dispose=async()=>{};
 const studies=[{id:'study',name:'Scientific study',errors:[]}],results=[{...studies[0],retained:true,status:'flagged',score:{clones:4,additional:0,total:4},completed:4,selected:4}];
 return {images,studies,results,errors:[],artifacts,finishedAt:'2026-10-12T10:00:00Z',configuration:{options:{scientificFiltering:true,threshold:2,basis:'clones'},recipes:[]},original,native,corroboration};
}
