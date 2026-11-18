// Reuse the site's authorized Adobe kit; font binaries are never packaged here.
export function adobeFontURL(value){
 try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='use.typekit.net'&&/^\/[a-z0-9]+\.css$/.test(u.pathname)&&!u.username&&!u.password&&!u.port&&!u.search&&!u.hash?u.href:null;}catch{return null;}
}
const url=adobeFontURL(new URLSearchParams(location.search).get('fonts'));
if(url){const link=document.createElement('link');link.rel='stylesheet';link.crossOrigin='anonymous';link.href=url;link.id='sherloq-site-fonts';document.head.append(link);}
