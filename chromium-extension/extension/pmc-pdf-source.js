import {fetchResource} from './resources.js';

const bucket='https://pmc-oa-opendata.s3.amazonaws.com/';
export function pmcPDFIdentity(address){
 try{
  const url=new URL(address);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return null;
  const prefix=url.hostname==='pmc.ncbi.nlm.nih.gov'?'':url.hostname==='www.ncbi.nlm.nih.gov'?'/pmc':null;if(prefix===null)return null;
  const match=decodeURIComponent(url.pathname).match(new RegExp('^'+prefix+'/articles/(PMC[1-9][0-9]*)(?:\\.([1-9][0-9]*))?/pdf(?:/[^/]*)?/?$','i'));
  return match?{id:match[1].toUpperCase(),version:match[2]||null}:null;
 }catch{return null;}
}

// PMC documents this public dataset as its download service. It serves the
// deposited PDF itself, without the interactive website's preparation page.
// Never guess a different article version when the source URL is ambiguous.
// https://pmc.ncbi.nlm.nih.gov/tools/pmcaws/
export async function fetchPublicPMCPDF(address,{fetchFile=fetchResource}={}){
 const identity=pmcPDFIdentity(address);if(!identity)return null;
 const list=new URL(bucket);list.search=new URLSearchParams({'list-type':'2',prefix:identity.id+'.',delimiter:'/', 'max-keys':'100'});
 const listing=await fetchFile(list.href,{html:true}),xml=await listing.blob.text();
 if(/<IsTruncated>\s*true\s*<\/IsTruncated>/.test(xml))return null;
 const expression=new RegExp('<Prefix>('+identity.id+'\\.([1-9][0-9]*)/)</Prefix>','g');
 let versions=[...xml.matchAll(expression)].map(match=>({prefix:match[1],version:match[2]}));
 if(identity.version)versions=versions.filter(value=>value.version===identity.version);
 if(versions.length!==1)return null;
 const {prefix,version}=versions[0],stem=prefix.slice(0,-1);
 const record=await fetchFile(bucket+prefix+stem+'.json',{html:true}),metadata=JSON.parse(await record.blob.text());
 if(metadata.pmcid!==identity.id||String(metadata.version)!==version||typeof metadata.pdf_url!=='string')return null;
 const source=new URL(metadata.pdf_url),expected='/'+prefix+stem+'.pdf';
 const allowed=source.protocol==='s3:'&&source.hostname==='pmc-oa-opendata'||source.protocol==='https:'&&source.origin===new URL(bucket).origin;
 if(!allowed||source.username||source.password||source.pathname!==expected)return null;
 const url=new URL(bucket);url.pathname=expected;url.search=source.search;
 const value=await fetchFile(url.href);
 if((await value.blob.slice(0,5).text())!=='%PDF-')return null;
 return value;
}
