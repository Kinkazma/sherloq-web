import {journal} from './local-update-store.js?v=0.23.0';

// Persist before navigation in the same scoped transaction/reference consumed
// by update recovery and rollback. This is not an external file-download claim.
export async function persistBridgePreferenceBackup(store,plan,backup){
 if(!/^[a-f0-9]{64}$/.test(plan?.identity)||backup?.schema!=='sherloq.preference-backup/1')throw Error('Invalid bridge preference backup identity.');
 const appBase=new URL('./',plan.appBase).href;
 return store.change(state=>{
  let key;
  if(state.active?.identity===plan.identity&&state.active.appBase===appBase)key='active';
  else if(state.bootstrapCandidate?.identity===plan.identity&&state.bootstrapCandidate.appBase===appBase&&state.bootstrapCandidate.status==='ready'&&state.bootstrapCandidate.expectedActive===state.active?.identity)key='bootstrapCandidate';
  if(!key)throw Object.assign(Error('The bridge installation changed before its preferences were saved. Keep this window open and prepare it again.'),{code:'BRIDGE_STATE_CHANGED'});
  return {...state,[key]:{...state[key],backup},journal:journal(state,'archive-bridge-preference-backup',{identity:plan.identity})};
 });
}
