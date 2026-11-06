import {requireValue} from './errors.js';
const ignored=['SourceFile','ExifTool:ExifTool','File:FileName','File:Directory','File:FileSize','File:FileModifyDate','File:FileInodeChangeDate','File:FileAccessDate','File:FileType','File:FilePermissions','File:FileTypeExtension','File:MIMEType'];
const virtualTags=['SourceFile','File:FileName','File:Directory','File:FileModifyDate','File:FileInodeChangeDate','File:FileAccessDate','File:FilePermissions'];
export function exiftoolReport(bytes){
 const parsed=JSON.parse(new TextDecoder().decode(bytes));requireValue(Array.isArray(parsed)&&parsed.length===1&&parsed[0]&&typeof parsed[0]==='object'&&!Array.isArray(parsed[0]),'Invalid ExifTool JSON report.');
 const metadata=parsed[0],virtualFile={};for(const tag of virtualTags){if(Object.hasOwn(metadata,tag)){virtualFile[tag]=metadata[tag];delete metadata[tag];}}
 const rows=[];let previous;
 for(const [key,value]of Object.entries(metadata)){
  if(((!value||Array.isArray(value)&&!value.length||value&&typeof value==='object'&&!Object.keys(value).length)&&typeof value!=='number'&&typeof value!=='boolean')||ignored.some(tag=>key.includes(tag)))continue;
  const colon=key.indexOf(':'),group=colon<0?'Other':key.slice(0,colon),tag=colon<0?key:key.slice(colon+1);
  rows.push({group,groupHeading:group===previous?null:group,tag,value});previous=group;
 }
 const latitude=metadata['Composite:GPSLatitude'],longitude=metadata['Composite:GPSLongitude'];
 const present=Object.hasOwn(metadata,'Composite:GPSLatitude')&&Object.hasOwn(metadata,'Composite:GPSLongitude');
 if(present)requireValue(typeof latitude==='number'&&typeof longitude==='number'&&Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180,'Invalid GPS coordinates in image metadata.');
 const coordinates=present?{latitude,longitude}:null;
 // A map is never contacted by the engine. B decides whether to show/open a link.
 const mapUrl=coordinates?`https://www.google.com/maps/place/${latitude},${longitude}/@${latitude},${longitude},17z/data=!4m5!3m4!1s0x0:0x0!8m2!3d${latitude}!4d${longitude}`:null;
 return {metadata,rows,coordinates,mapUrl,virtualFile,virtualFileSemantics:'Virtual runtime placeholders only, not evidence about the original operating system file. Caller sourceFile is separate.',version:'13.55'};
}
