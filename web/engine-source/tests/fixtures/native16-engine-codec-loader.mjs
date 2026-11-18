// Test-only codec seam: imports the actual shared RGB16/RGB8 banks and gives
// the public engine a decoder record, without requiring a browser codec.
export async function load(url,context,nextLoad){
 if(new URL(url).pathname.endsWith('/src/media-image-source.js'))return{format:'module',shortCircuit:true,source:`
 import {createRgb16Bank} from './rgb16-surface.js';
 import {createSegmentedBytes} from './segmented-bytes.js';
 import {createRgbSurface} from './rgb-surface.js';
 import {createBlobSource} from './blob-source.js';
 export async function inspectExtendedImage(){return{format:'avif',depth:16,width:3,height:3};}
 export async function loadExtendedImage(blob,{budget,signal}={}){
  const spec=JSON.parse(await blob.text()),width=spec.width,height=spec.height,n=width*height,data=Uint16Array.from(spec.values),bytes=new Uint8Array(data.length*2),view=new DataView(bytes.buffer);for(let i=0;i<data.length;i++)view.setUint16(i*2,data[i],true);
  const bank=await createRgb16Bank({width,height,budget,signal,color:{primaries:'display-p3',transfer:'pq'},sourceDepth:10,provenance:{decoder:'test-native16-codec',scale:'full-range16'}});await bank.writeBand({y:0,rows:height,data:bytes});const nativeSurface=await bank.seal(),store=await createSegmentedBytes(n*3,{budget}),sdr=Uint8Array.from(data,v=>Math.round(v/257));await store.write(sdr);const surface=createRgbSurface(store,{width,height,budget}),source=createBlobSource(blob,{budget}),sha256=await source.sha256({signal});return{kind:'image',segmented:true,source,store,surface,nativeSurface,workingDepth:16,ownsTemporarySession:false,sha256,provenance:{decoder:'test-native16-codec',sourceFormat:'avif',sourceDepth:10,presentation:'explicit-test-sdr'},retainedBytes:0,metrics:{storage:'memory'}};
 }
 `};
 return nextLoad(url,context);
}
