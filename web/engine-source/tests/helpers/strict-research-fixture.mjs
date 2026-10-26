export function strictResearchFixture(method='focal'){
 const width=12,height=8,pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>(i*13+17)%256)},fragments=[[1,1,5,5],[7,2,11,7]].map((bounds,index)=>({id:'native-fragment-'+index,bounds,map:Float32Array.from({length:6},(_,i)=>(index+i)/7),...(method==='adaifl'?{mask:Uint8Array.from({length:6},(_,i)=>i%2)}:{features:Float32Array.from({length:6*288},(_,i)=>(i+index)/100)}),metadata:{method,native_shape:[2,3],provider:'wasm'}})),data={width,height,fragments,metadata:{method,native_shape:null,strictSourceRegions:{schema:'sherloq.strict-research/1',fragmentCount:2,excludedSamplesRead:false},nativeFragments:fragments.map(f=>({id:f.id,bounds:f.bounds,metadata:f.metadata}))}};
 return{width,height,pixels,data};
}
export function sampleWindow(image,{x=0,y=0,w=image.width,h=image.height,step=1}={}){
 const width=Math.ceil(w/step),height=Math.ceil(h/step),data=new Uint8Array(width*height*3);for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){const at=((y+yy*step)*image.width+x+xx*step)*3;data.set(image.data.subarray(at,at+3),(yy*width+xx)*3);}return{width,height,format:'rgb8',data};
}
