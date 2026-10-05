import {parameters} from './pixel-utils.js';import {requireValue} from './errors.js';
export function c2paParams(input={}){
 const p=parameters(input,{trustAnchors:null});
 requireValue(p.trustAnchors===null||typeof p.trustAnchors==='string','Trust anchors must be local PEM text or null.');
 if(p.trustAnchors!==null){requireValue(p.trustAnchors.length<=8*1024**2,'Trust anchors exceed 8 MiB.');const certificates=p.trustAnchors.match(/-----BEGIN CERTIFICATE-----[A-Za-z0-9+/= \t\r\n]+-----END CERTIFICATE-----/g);requireValue(certificates?.length>0&&p.trustAnchors.replace(/-----BEGIN CERTIFICATE-----[A-Za-z0-9+/= \t\r\n]+-----END CERTIFICATE-----/g,'').trim()==='', 'Only inline PEM certificates are accepted, never URLs.');}
 return p;
}
export function c2paSettings(trustAnchors){return {core:{allowed_network_hosts:[],allow_redirects:false},verify:{verify_after_reading:true,verify_trust:true,verify_timestamp_trust:true,ocsp_fetch:false,remote_manifest_fetch:false},trust:trustAnchors===null?{anchors:[]}:{trust_anchors:trustAnchors}};}
// Exact native core/c2pa.py state policy. Timestamp/ingredient findings remain in report.
export function summarizeC2pa(report,metadata,error=null){
 if(report===null){const text=String(error??'');return {metadata,manifest:text==='C2pa(JumbfNotFound)'?'absent':text.startsWith('C2pa(RemoteManifestUrl(')?'remote_unavailable':'read_error',integrity:'unknown',signature:'unknown',trust:metadata.trust_configured?'unknown':'not_configured',error:text,report:null};}
 requireValue(report&&typeof report==='object'&&!Array.isArray(report),'Invalid C2PA report.');
 const active=report.validation_results?.activeManifest??{},success=new Set((active.success??[]).map(x=>x.code??'')),failure=(active.failure??[]).map(x=>x.code??'');
 const hasFailure=prefixes=>failure.some(code=>prefixes.some(prefix=>code.startsWith(prefix)));
 const integrity=hasFailure(['assertion.dataHash.','assertion.bmffHash.','assertion.boxesHash.','assertion.hashedURI.'])?'invalid':['assertion.dataHash.match','assertion.bmffHash.match','assertion.boxesHash.match'].some(code=>success.has(code))?'valid':'unknown';
 const signature=hasFailure(['claimSignature.'])?'invalid':success.has('claimSignature.validated')?'valid':'unknown';
 const trust=!metadata.trust_configured?'not_configured':success.has('signingCredential.trusted')&&!hasFailure(['signingCredential.'])?'trusted':hasFailure(['signingCredential.'])?'untrusted':'unknown';
 return {metadata,manifest:report.active_manifest?'present':'unknown',integrity,signature,trust,failures:active.failure??[],report};
}
