// Documentary tools inspect the encoded evidence. Pixel selections cannot
// change a file digest, byte window, signature, structure or metadata record.
// ExifTool raw embedded bytes are documentary; decoded thumbnail comparisons
// and every pixel comparison retain their own adapters.
export function sourceRegionApplicability(task={}){
 const operation=task.operation,params=task.params??{};
 if(operation==='file.similarity')return{applicable:false,input:'external-search-ui',reason:'no-local-pixel-analysis'};
 const original=operation==='file.hex'||operation==='file.digest'||operation==='metadata.structure'||operation==='metadata.location'||operation==='metadata.c2pa'||operation==='metadata.exiftool'&&['dump','headers','location','thumbnail'].includes(params.mode??'dump');
 return original?{applicable:false,input:'original-encoded-evidence',reason:'documentary-original-source'}:{applicable:true,input:'scientific-pixel-domain'};
}
