import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createSourceSamplesControlServer,createSourceSamplesControlClient} from '../src/source-samples-control.js';

const bindingOriginal=Object.freeze({imageId:'image',sourceSurfaceId:'original',sourceRevision:1,sourceSha256:'ab'.repeat(32),kind:'fixture'});
const source={sourceLeaseId:'source-lease',sourceId:'bank',revision:1,domain:'decoded',frame:0,bindingOriginal};
const defer=()=>{let resolve;const promise=new Promise(yes=>resolve=yes);return{promise,resolve};};
const tick=()=>new Promise(resolve=>queueMicrotask(resolve));
function pair({retire=()=>({retired:true}),onPeerRetire=async()=>{},budgetBytes=65536}={}){
 const budget=new Budget(budgetBytes),sent=[],replies=[],attempts=[];let client,serverFailure,clientFailure;
 const server=createSourceSamplesControlServer({post(value){attempts.push(value);if(serverFailure?.(value))throw Error('server post refused');replies.push(value);client.accept(value);}}),
  endpoint={state:{closed:false},retireSourceSamples:retire},control=server.register(endpoint,bindingOriginal,budget),
  capability=server.adoptSource(control,source),worker={postMessage(value){if(clientFailure?.(value))throw Error('client post refused');sent.push(value);server.accept(value);}};
 client=createSourceSamplesControlClient({worker,onPeerRetire});const publicSource=client.adoptSource({...source,sourceSamplesControl:capability});
 return{budget,server,client,endpoint,control,capability,publicSource,sent,replies,attempts,
  serverPostFailure(fn){serverFailure=fn;},clientPostFailure(fn){clientFailure=fn;},
  async window(sequence=1){const data=new Uint16Array([10,11,12]),wire={...source,windowLeaseId:'source-lease/w/'+sequence,samples:data,width:1,height:1};let result;
   await server.publishWindow(control,wire,[data.buffer],(value,transfer)=>{result=client.adoptWindow(structuredClone(value,{transfer}));});return result;},
  async close(){client.beginOriginalClose();await client.close();endpoint.state.closed=true;await server.close(control);
   assert.deepEqual(server.state,{services:0,sources:0,windows:0,controls:0});assert.equal(client.state.sources,0);assert.equal(budget.total(),0);},
 };
}

test('passive control server has no registered source, admission or diagnostic history',()=>{
 const server=createSourceSamplesControlServer({post(){}});assert.deepEqual(server.state,{services:0,sources:0,windows:0,controls:0});
 assert.equal(Object.hasOwn(server.state,'events'),false);
});

test('registration, source/window and response metadata are funded until acknowledged closure',async()=>{
 const p=pair(),initial=p.budget.total();assert.ok(initial>0);assert.equal(Object.hasOwn(p.publicSource,'sourceSamplesControl'),false);
 const window=await p.window();assert.ok(p.budget.total()>initial);assert.equal(Object.hasOwn(window,'sourceSamplesWindowCredit'),false);
 assert.equal(Object.hasOwn(window,'sourceNonce'),false);Object.freeze(window);
 await p.client.retire(window);assert.equal(window.samples,null);assert.equal(p.budget.total(),initial);
 await p.close();
});

test('registration admission refusal creates no source capability',()=>{
 const budget=new Budget(1),server=createSourceSamplesControlServer({post(){}});
 assert.throws(()=>server.register({retireSourceSamples(){}},bindingOriginal,budget),{code:'MEMORY_LIMIT'});
 assert.deepEqual(server.state,{services:0,sources:0,windows:0,controls:0});assert.equal(budget.total(),0);
});

test('faux serviceClosed and closure confirmation cannot discard live windows or receipts',async()=>{
 const p=pair(),window=await p.window(),before=p.budget.total();
 for(const fake of [{...p.control,nonce:'wrong',closure:'fake'},{...p.control,closure:'fake'}]){
  p.client.accept({sourceSamplesServiceClosed:fake});p.client.accept({sourceSamplesServiceClosedAck:fake});
  assert.equal(p.client.state.windows,1);assert.equal(p.client.state.sources,1);assert.equal(p.budget.total(),before);
 }
 await p.client.retire(window);await p.client.retire(source);
 // Even a scoped-looking notification needs the server's validated closure
 // confirmation. This fake closure is rejected by the still-live server.
 p.client.accept({sourceSamplesServiceClosed:{...p.control,closure:'fake'}});await tick();
 assert.equal(p.client.state.sources,1);assert.ok(p.budget.total()>0);
 await p.close();
});

test('forged/old ACKs cannot settle a captured request',async()=>{
 const queue=[],worker={postMessage:value=>queue.push(value)},client=createSourceSamplesControlClient({worker}),
  capability={workerEpoch:'epoch',serviceId:'service',nonce:'nonce',sourceNonce:'source-nonce',sourceLeaseId:source.sourceLeaseId,metadataBytes:1024,bindingOriginal};
 client.adoptSource({...source,sourceSamplesControl:capability});let settled=false;
 const pending=client.retire(source).then(()=>settled=true),c=queue[0].sourceSamplesControl;
 const good={ticket:c.ticket,workerEpoch:c.workerEpoch,serviceId:c.serviceId,nonce:c.nonce,sourceNonce:c.sourceNonce,
  requestIdentity:JSON.stringify([source.sourceLeaseId,source.sourceId,1,'decoded',0,'image','original',1,bindingOriginal.sourceSha256,'fixture',null]),result:{retired:true}};
 for(const change of [{workerEpoch:'old'},{serviceId:'other'},{nonce:'wrong'},{sourceNonce:'wrong'}])client.accept({sourceSamplesControlAck:{...good,...change}});
 await tick();assert.equal(settled,false);assert.equal(client.state.pending,1);
 client.accept({sourceSamplesControlAck:good});await pending;assert.equal(client.state.pending,0);
});

test('NACK/frozen primitive retirement keeps the source and retries without another capability',async()=>{
 let calls=0;const p=pair({retire(){if(++calls===1)throw 0;return{retired:true};}});
 await assert.rejects(p.client.retire(source),value=>value===0);assert.equal(p.client.state.activeSources,1);
 await p.client.retire(source);assert.equal(calls,2);await p.close();
});

test('client postMessage failure preserves the funded source for retry',async()=>{
 const p=pair(),initial=p.budget.total();p.clientPostFailure(()=>true);
 await assert.rejects(p.client.retire(source),/client post refused/);assert.equal(p.budget.total(),initial);assert.equal(p.client.state.sources,1);
 p.clientPostFailure(null);await p.client.retire(source);await p.close();
});

test('failed ACK publication keeps the response/window owner; a retry settles both tickets exactly once',async()=>{
 let calls=0,decline=true;const attempted=defer(),p=pair({retire(){++calls;return{retired:true};}}),window=await p.window();
 p.serverPostFailure(value=>{if(value.sourceSamplesControlAck&&decline){decline=false;attempted.resolve();return true;}return false;});
 const first=p.client.retire(window);await attempted.promise;await tick();
 assert.equal(p.server.state.controls,1);assert.equal(p.server.state.windows,1);assert.equal(window.samples.constructor,Uint16Array);
 const second=p.client.retire(window);await Promise.all([first,second]);assert.equal(calls,1);
 assert.equal(p.server.state.controls,0);assert.equal(p.server.state.windows,0);assert.equal(window.samples,null);await p.close();
});

test('service notification or confirmation post failure retains registrations until the close retry ACKs',async()=>{
 for(const stage of ['sourceSamplesServiceClosed','sourceSamplesServiceClosedAck']){
  const p=pair();await p.client.retire(source);p.endpoint.state.closed=true;let decline=true;
  p.serverPostFailure(value=>value[stage]&&decline?(decline=false,true):false);
  await assert.rejects(p.server.close(p.control));assert.equal(p.server.state.services,1);assert.equal(p.client.state.sources,1);assert.ok(p.budget.total()>0);
  await p.server.close(p.control);assert.equal(p.budget.total(),0);assert.equal(p.client.state.sources,0);
 }
});

test('client closure ACK post failure remains retryable without clearing metadata early',async()=>{
 const p=pair();await p.client.retire(source);p.endpoint.state.closed=true;const attempted=defer();let decline=true;
 p.clientPostFailure(value=>{if(value.sourceSamplesControl?.action==='service-closed-ack'&&decline){decline=false;attempted.resolve();return true;}return false;});
 const closing=p.server.close(p.control);await attempted.promise;assert.equal(p.server.state.services,1);assert.equal(p.client.state.sources,1);
 await p.client.close();await closing;assert.equal(p.budget.total(),0);assert.equal(p.client.state.sources,0);
});

test('peer termination rejects controls without ensure and keeps local owners across cleanup NACKs',async()=>{
 const attempts=[false,0,undefined];let callbacks=0;const p=pair({onPeerRetire(){++callbacks;return attempts.shift();}}),window=await p.window();
 for(const expected of [false,0]){
  await assert.rejects(p.client.peerTerminated({terminated:true,kind:'browser-terminate-requested'}),value=>value===expected);
  assert.equal(p.client.state.sources,1);assert.equal(p.client.state.windows,1);assert.equal(window.samples.constructor,Uint16Array);
 }
 await p.client.peerTerminated({terminated:true,kind:'browser-terminate-requested'});assert.equal(callbacks,3);assert.equal(window.samples,null);assert.equal(p.client.state.sources,0);
 await assert.rejects(p.client.retire(source));
 // The simulated remote ledger still needs its independent owning lifecycle.
 p.endpoint.state.closed=true;const closed=p.server.close(p.control);p.server.accept({sourceSamplesControl:{ticket:91,action:'service-closed-ack',...p.control,closure:p.replies.at(-1).sourceSamplesServiceClosed.closure}});
 await closed;assert.equal(p.budget.total(),0);
});

test('a captured registration cannot be closed while its endpoint is live or with cloned hints',async()=>{
 const p=pair();assert.throws(()=>p.server.close(p.control),/live source/);
 assert.throws(()=>p.server.close({...p.control}),/captured/);await p.close();
});

test('a fully admitted budget cannot block window/source ACKs or a NACK retry',async()=>{
 for(const target of ['window','source']){
  let declines=1,calls=0;const p=pair({retire(request){++calls;if((target==='window')===!!request.windowLeaseId&&declines--===1)throw 0;return{retired:true};}}),window=await p.window();
  const filled=p.budget.reserve(p.budget.limit-p.budget.total()),full=p.budget.total(),reserve=p.budget.reserve;let newReservations=0;
  p.budget.reserve=function(){++newReservations;throw Error('Retirement must use its published permit');};
  const request=target==='window'?window:source;
  await assert.rejects(p.client.retire(request),value=>value===0);assert.equal(p.budget.total(),full);assert.equal(p.client.state.windows,1);
  await p.client.retire(request);await p.client.retire(window);await p.client.retire(source);
  assert.equal(newReservations,0);assert.equal(window.samples,null);assert.equal(p.client.state.pending,0);assert.ok(calls>=2);
  p.budget.reserve=reserve;filled();await p.close();
 }
});

test('repeated controls coalesce on one pre-funded ticket while the owner is occupied',async()=>{
 const held=defer();let calls=0;const p=pair({retire(){++calls;return held.promise;}}),window=await p.window(),retirements=[];
 for(let i=0;i<100;i++)retirements.push(p.client.retire(window));
 assert.equal(p.client.state.pending,1);assert.equal(p.server.state.controls,1);
 assert.equal(new Set(p.sent.map(value=>value.sourceSamplesControl.ticket)).size,1);
 held.resolve({retired:true});await Promise.all(retirements);assert.equal(calls,1);
 await p.client.retire(window);assert.equal(calls,1);await p.close();
});


test('a gap below the largest adopted sequence is never synthesized into an ACK',async()=>{
 const p=pair(),window=await p.window(2),before=p.budget.total(),sent=p.sent.length;
 await assert.rejects(p.client.retire({...source,windowLeaseId:'source-lease/w/1'}),{code:'SOURCE_LEASE_NOT_ADOPTED'});
 assert.equal(p.sent.length,sent);assert.equal(p.budget.total(),before);assert.equal(window.samples.constructor,Uint16Array);
 await p.client.retire(window);const sentAfter=p.sent.length;
 await p.client.retire(window);assert.equal(p.sent.length,sentAfter);assert.equal(window.samples,null);
 // The out-of-order receipt range remains funded until its service closes.
 assert.ok(p.budget.total()>0);await p.close();
});

test('a registration with no published capability closes without inventing a peer ACK',async()=>{
 const budget=new Budget(65536),server=createSourceSamplesControlServer({post(){assert.fail('No peer received this registration');}}),endpoint={state:{closed:true},retireSourceSamples(){}};
 const control=server.register(endpoint,bindingOriginal,budget);assert.ok(budget.total()>0);await server.close(control);assert.equal(budget.total(),0);
});
test('a refused source response can discard only its still-unpublished capability',async()=>{
 const budget=new Budget(65536),messages=[],server=createSourceSamplesControlServer({post:value=>messages.push(value)}),endpoint={state:{closed:false},retireSourceSamples(){}};
 const control=server.register(endpoint,bindingOriginal,budget),capability=server.adoptSource(control,source,{unpublished:true}),before=budget.total();
 await assert.rejects(server.publishSource(control,{...source,sourceSamplesControl:capability},()=>{throw 0;}),value=>value===0);assert.equal(budget.total(),before);
 server.discardUnpublishedSource(control,source);assert.equal(server.state.sources,0);endpoint.state.closed=true;await server.close(control);assert.equal(messages.length,0);assert.equal(budget.total(),0);
});
