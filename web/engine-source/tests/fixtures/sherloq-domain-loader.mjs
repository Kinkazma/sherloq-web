// Test only: the frozen numerical engine stays untouched. This identity core
// records the exact samples sent through its public adapter/source contract.
import {load as codecLoad} from './native16-engine-codec-loader.mjs';
export async function load(url,context,nextLoad){
 if(new URL(url).pathname.endsWith('/src/sherloq7c.js'))return{format:'module',shortCircuit:true,source:`
 export const domainTrace={events:[],inputs:[],created:0,released:0,clears:0};
 export function createSherloq7C({budget}){return{
  async createSource(rows,{signal}={}){const release=budget.reserve(rows.width*rows.height*6),data=new Uint16Array(rows.width*rows.height*3);try{await rows.readRows(0,rows.height,data,{signal});domainTrace.created++;domainTrace.inputs.push([...data]);domainTrace.events.push('source-create');let done=false;return{width:rows.width,height:rows.height,data,byteLength:data.byteLength,release(){if(done)return;done=true;release();domainTrace.released++;domainTrace.events.push('source-release');}};}catch(error){release();throw error;}},
  async run(source){const release=budget.reserve(source.data.byteLength),data=source.data.slice();let done=false;return{width:source.width,height:source.height,metrics:{actualBackend:'cpu',precision:'domain-identity-test'},async readWindow({x=0,y=0,width,height},{format='rgb8',includeScalar=false}={}){const out=format==='rgb16'?new Uint16Array(width*height*3):new Uint8Array(width*height*3),scalar=includeScalar?new Float64Array(width*height):undefined;for(let row=0;row<height;row++)for(let col=0;col<width;col++)for(let c=0;c<3;c++){const value=data[((y+row)*source.width+x+col)*3+c];out[(row*width+col)*3+c]=format==='rgb16'?value:Math.round(value/257);}return{data:out,scalar,release(){}};},release(){if(done)return;done=true;release();}};},
  async clearCache(){domainTrace.clears++;domainTrace.events.push('clear-cache');},async dispose(){},updateResourceHints(){}
 };}
 `};return codecLoad(url,context,nextLoad);
}
