import {requireValue} from './errors.js';
import {selfDMProposalNativeTransform} from './selfdm-proposal-native-assets.js';
import {buildSelfDMProposalPointOwnerGraph} from './selfdm-proposal-point-owner-graph.js';
import {buildSelfDMProposalSuperGlueShapeGraph} from './selfdm-proposal-superglue-shape-graph.js';
import {buildSelfDMProposalCRFSupportGraph} from './selfdm-proposal-crf-support-graph.js';

/** Native-pool model memory was admitted before this worker loads/adapts it.
 * The small builder credit is an assertion of that existing allowance, not a
 * second allocation grant. The source digest is checked even for direct calls.
 * Unknown stage IDs never fall back to another graph or to the uncut model. */
export async function adaptSelfDMProposalWindowGraph(bytes,id,{admittedBytes}={}){
 const spec=selfDMProposalNativeTransform(id);
 requireValue(spec&&bytes instanceof Uint8Array&&bytes.byteLength===spec.sourceBytes&&Number.isSafeInteger(admittedBytes)&&admittedBytes>=spec.sourceBytes+512*1024,'Exact received Proposal native stage/model and pre-admitted worker memory required');
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');requireValue(sha===spec.sourceSha256,'Proposal native transform source bytes differ from their original model');
 const budget={reserve(n){requireValue(Number.isSafeInteger(n)&&n>=0&&n<=admittedBytes,'Proposal native builder exceeds its existing pool model admission');return()=>{}}};
 if(spec.family==='point')return buildSelfDMProposalPointOwnerGraph(bytes,spec.stage,{budget});
 if(spec.family==='shape')return buildSelfDMProposalSuperGlueShapeGraph(bytes,{budget});
 requireValue(spec.family==='crf','Exact native Proposal transform family required');return buildSelfDMProposalCRFSupportGraph(bytes,spec.stage,{budget});
}
