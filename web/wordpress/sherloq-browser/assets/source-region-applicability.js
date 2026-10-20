// Documentary tools inspect the encoded evidence. Pixel selections cannot
// change a file digest, byte window, signature, structure or metadata record.
// Extracted thumbnails and every pixel comparison retain their own adapters.
export function sourceRegionApplicability(task={}){
 const operation=task.operation,params=task.params??{};
 const original=operation==='file.hex'||operation==='file.digest'||operation==='metadata.structure'||operation==='metadata.location'||operation==='metadata.c2pa'||operation==='metadata.exiftool'&&['dump','headers','location'].includes(params.mode??'dump');
 return original?{applicable:false,input:'original-encoded-evidence',reason:'documentary-original-source'}:{applicable:true,input:'scientific-pixel-domain'};
}
