// Preserve the complete upstream PDF.js file, including its Apache-2.0 notice.
// Only append explicit exports of the pinned implementation's native classes.
import{createHash}from'node:crypto';
import{readFile,writeFile}from'node:fs/promises';
import{pathToFileURL}from'node:url';
import{resolve}from'node:path';
const UPSTREAM_SHA256='2221020ea508479dcc1221f36f2731656339230097c69ba1f78802832c0ad685';
const VERSION='5.6.205',BUILD='ada343803';
export function exportPdfNativeDisplayInterface(input){
 const source=Buffer.from(input),digest=createHash('sha256').update(source).digest('hex');
 if(digest!==UPSTREAM_SHA256)throw Error('Unqualified PDF.js source: regenerate and qualify the native display interface before updating the pin.');
 const text=source.toString('utf8');for(const name of['CanvasGraphics','PDFObjects'])if(text.split('class '+name+'{').length!==2)throw Error('Native PDF.js constructor declaration changed.');
 const appended='\n// Native display interface; upstream implementation above is unchanged.\n'+
  'const SHERLOQ_PDF_NATIVE_DISPLAY_INTERFACE=Object.freeze('+JSON.stringify({version:VERSION,build:BUILD,revision:1,upstreamSha256:UPSTREAM_SHA256})+');\n'+
  'export{CanvasGraphics as SherloqPdfCanvasGraphics,PDFObjects as SherloqPdfObjects,SHERLOQ_PDF_NATIVE_DISPLAY_INTERFACE};\n';
 const bytes=Buffer.concat([source,Buffer.from(appended)]);
 return{bytes,receipt:{version:VERSION,build:BUILD,interfaceRevision:1,upstreamSha256:UPSTREAM_SHA256,upstreamBytes:source.length,appendedBytes:Buffer.byteLength(appended),resultBytes:bytes.length,resultSha256:createHash('sha256').update(bytes).digest('hex'),upstreamPreservedExactly:bytes.subarray(0,source.length).equals(source),exports:['SherloqPdfCanvasGraphics','SherloqPdfObjects','SHERLOQ_PDF_NATIVE_DISPLAY_INTERFACE']}};
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){if(!['--input','--output','--receipt'].includes(args[i])||!args[i+1])throw Error('Usage: --input pdf.mjs --output pdf-display.mjs [--receipt receipt.json]');options[args[i].slice(2)]=args[i+1];}
 if(!options.input||!options.output||resolve(options.input)===resolve(options.output))throw Error('Distinct input and output paths required.');
 const result=exportPdfNativeDisplayInterface(await readFile(options.input));await writeFile(options.output,result.bytes,{flag:'wx'});if(options.receipt)await writeFile(options.receipt,JSON.stringify(result.receipt,null,2)+'\n',{flag:'wx'});
}
