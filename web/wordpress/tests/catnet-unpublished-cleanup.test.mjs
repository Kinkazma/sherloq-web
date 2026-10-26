import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCatnetScopedBlob} from '../sherloq-browser/assets/catnet-scoped-client.js';
function fixture(primary,{afterDescriptor=false}={}){
 const sha='a'.repeat(64),domain={origin:[1,2],width:8,height:8,fingerprint:'f'.repeat(64)},calls=[];
 const presentation={purpose:'preparation-envelope',preparationContext:'envelope-not-scientific-membership',origin:[1,2],width:8,height:8,sha256:sha,sourceRegionDomain:domain,sourceRegionSourceSurface:{id:'presentation',revision:1,width:8,height:8,format:'rgb8'},async dispose(){calls.push('presentation');throw Error('presentation release failed');}};
 return{calls,args:{request:{domain,expectedSourceSha256:sha,blob:new Blob(),params:{}},acquirePresentation:async()=>presentation,client:{async analyzeBlob(){if(!afterDescriptor)throw primary;return{id:'unpublished',width:8,height:8};},async metadata(){throw primary;},async release(){calls.push('descriptor');throw Error('descriptor release failed');}}}};
}
for(const afterDescriptor of[false,true])test('frozen primary survives all unpublished retirement failures, descriptor='+afterDescriptor,async()=>{const primary=Object.freeze(Object.assign(Error('cancelled primary'),{code:'CANCELLED'})),f=fixture(primary,{afterDescriptor});await assert.rejects(analyzeCatnetScopedBlob(f.args),error=>error===primary);assert.deepEqual(f.calls,afterDescriptor?['descriptor','presentation']:['presentation']);});
test('extensible primary records aggregate cleanup failures without replacing its identity',async()=>{const primary=Object.assign(Error('native source error'),{code:'STORAGE_IO'}),f=fixture(primary,{afterDescriptor:true});await assert.rejects(analyzeCatnetScopedBlob(f.args),error=>error===primary&&error.cleanupError instanceof AggregateError&&error.cleanupError.errors.length===2);assert.deepEqual(f.calls,['descriptor','presentation']);});
