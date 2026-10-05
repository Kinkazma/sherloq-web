import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{
 try{if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>M3 primitive verification</title>');return;}
 const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname));if(!path.startsWith(root.endsWith(sep)?root:root+sep))throw Error('path');
 res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'})[extname(path)]??'application/octet-stream');res.end(await readFile(path));
 }catch{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
 const checks=await page.evaluate(async()=>{
  const {siftG2nnMatch}=await import('/src/sift-g2nn.js'),{pairedBiomes}=await import('/src/copy-biomes.js'),{parseTextBoxes,supportedTextBoxes}=await import('/src/text-regions.js');
  const result=[],equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b),reserveMemory=()=>{};
  const g=await(await fetch('/tests/m3-data/g2nn-reference.json')).json();
  for(const c of g.cases){const r=await siftG2nnMatch({...c.options,points:Float32Array.from(c.points.flat()),descriptors:Float32Array.from(c.descriptors.flat()),members:Uint8Array.from(c.members.flat()),zoneCount:c.members[0]?.length??1,variants:c.options.variants?Uint8Array.from(c.options.variants):null,axes:c.options.axes?.map(x=>Float32Array.from(x))??null},{reserveMemory});if(!equal([...r.pairs],c.expected.flat())||!equal([...r.pairSearchRegions],c.owners)||r.candidateComparisons!==c.evaluated)throw Error(c.name);result.push('g2nn/'+c.name);}
  const b=await(await fetch('/tests/m3-data/copy-biomes-reference.json')).json();
  for(const c of b.cases){const r=await pairedBiomes(Float32Array.from(c.points.flat()),Float64Array.from(c.pairs.flat()),c.tolerance,{reserveMemory,pairSearchRegions:c.zones?Int32Array.from(c.zones):null});if(!equal(r.map(x=>[...x]),c.expected))throw Error(c.name);result.push('biomes/'+c.name);}
  const t=await(await fetch('/tests/m3-data/text-regions-reference.json')).json(),boxes=parseTextBoxes(t.tsv,[0,0],t.width,t.height),accepted=await supportedTextBoxes({width:t.width,height:t.height,format:'rgb8',data:Uint8Array.from(t.rgb)},boxes,{reserveMemory});if(!equal(boxes,t.parsed)||!equal(accepted,t.supported))throw Error('text');result.push('text/native');
  const {createGeometryKernel,verifyCopyGeometry,rejectSelfCopies}=await import('/src/copy-geometry.js'),{copyPalette,refineCopyBiomes}=await import('/src/copy-subbiomes.js');
  const geometry=await(await fetch('/tests/m3-data/copy-geometry-reference.json')).json(),kernel=await createGeometryKernel({reserveMemory});
  try{for(const c of geometry.cases){const points=Float32Array.from(c.points.flat()),pairs=Float64Array.from(c.pairs.flat()),groups=c.groups.map(x=>Uint32Array.from(x)),expected=c.expected;
    const r=await verifyCopyGeometry(points,pairs,groups,{...c,kernel,reserveMemory});if(!equal(r.groups.map(x=>[...x]),expected.groups))throw Error('geometry/groups/'+c.name);
    if(c.model!=='Homography'&&!equal(r.models,expected.models))throw Error('geometry/models/'+c.name);
    const palette=copyPalette(r.groups,pairs,.7,{reserveMemory}),refined=await refineCopyBiomes(points,pairs,r.groups,r.models,palette.colors,palette.bases,c.tolerance,{reserveMemory});
    if(!equal([...refined.colors],expected.shades.flat())||!equal(refined.groups.map(x=>[...x]),expected.refined)||!equal(refined.provenance,expected.provenance))throw Error('geometry/subbiomes/'+c.name);
    const filtered=await rejectSelfCopies(points,pairs,r.groups,r.models,c.minimumDistance,{reserveMemory,kernel});if(!equal(filtered.groups.map(x=>[...x]),expected.accepted))throw Error('geometry/overlap/'+c.name);result.push('geometry/'+c.name);
  }}finally{kernel.dispose();}return result;
 });
 const report={status:'passed',browser:browser.version(),checks};await writeFile(new URL('../docs/m3-primitives-chrome-proof.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,browser:report.browser,checks:checks.length}));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
