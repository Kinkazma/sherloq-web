export function pdfAddress(value){
 try{const url=new URL(value);if(['http:','https:','file:'].includes(url.protocol)&&!url.username&&!url.password&&/\.pdf\/?$/i.test(decodeURIComponent(url.pathname)))return url.href;}catch{}
 return null;
}

// Native PDF viewers may accept an injection while refusing its module imports.
// Opening a known PDF must therefore precede, and not depend on, injection.
export async function activateTab(tab,{inject,openPDF,protectedPage}){
 if(!Number.isInteger(tab?.id)||tab.id<0)return;
 const pdf=pdfAddress(tab.pendingUrl)||pdfAddress(tab.url);
 if(pdf)return openPDF(pdf,tab);
 try{const result=await inject(tab.id);if(!result.length)throw Error(protectedPage);}
 catch(error){if(/\.pdf(?:[?#]|$)/i.test(tab.url||''))return openPDF(tab.url,tab);throw Error(protectedPage,{cause:error});}
}
