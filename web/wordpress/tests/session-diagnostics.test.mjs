import test from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticValue,diagnosticScriptURL,diagnosticWorkerFailure,normalizeDiagnosticEvent} from '../sherloq-browser/assets/runtime-context.js';
import {createSessionLog,summarizeSessionEvents} from '../sherloq-browser/assets/session-log.js';

test('an explicitly absent C2PA manifest is kept in logs without enabling a bug submission',async()=>{
 const event={level:'error',kind:'worker.error',worker:'https://site.test/unified-engine/src/c2pa-worker.js?v=0.15.1',error:'C2pa(JumbfNotFound)'};
 const normalized=normalizeDiagnosticEvent(event);assert.equal(normalized.level,'info');assert.equal(normalized.classification,'c2pa-manifest-absent');assert.equal(normalized.error,event.error);
 const log=createSessionLog({indexedDB:null});log.append(event);assert.equal(log.hasErrors,false);assert.equal((await log.report()).summary.errorEvents,0);await log.close();
 for(const changed of [{error:'C2pa(OtherError)'},{error:{code:'C2PA_RUNTIME',message:'C2pa(JumbfNotFound)'}},{worker:'https://site.test/other-worker.js'}])assert.equal(normalizeDiagnosticEvent({...event,...changed}).level,'error');
});

test('only explicit ORT warning prefixes change console.error severity',()=>{
 const warning='\u001b[0;93m2026-10-11 23:28:45.671225 [W:onnxruntime:, session_state.cc:1397 VerifyEachNodeIsAssignedToAnEp] Some nodes use CPU.\u001b[m';
 const event={level:'error',kind:'console',method:'error',args:[warning]};
 assert.equal(normalizeDiagnosticEvent(event).level,'warning');assert.equal(normalizeDiagnosticEvent(event).args[0],warning);assert.equal(event.level,'error');
 assert.equal(normalizeDiagnosticEvent({...event,args:['[W:onnxruntime:webgpu] warning']}).level,'warning');
 for(const args of [['[E:onnxruntime:, execution] genuine failure'],['[W:onnxruntime:, execution] warning\n[E:onnxruntime:, execution] genuine failure'],['Failure while parsing [W:onnxruntime:, warning]'],[warning,'a second genuine error'],[warning,Error('failed')],[]])assert.equal(normalizeDiagnosticEvent({...event,args}).level,'error');
});

test('named ResizeObserver notifications remain logged as warnings',()=>{
 for(const message of ['ResizeObserver loop completed with undelivered notifications.','ResizeObserver loop limit exceeded']){
  const entry=normalizeDiagnosticEvent({kind:'uncaught',level:'error',error:new Error(message)});assert.equal(entry.level,'warning');assert.equal(entry.error.message,message);
 }
 assert.equal(normalizeDiagnosticEvent({kind:'uncaught',level:'error',error:Error('ResizeObserver constructor failed')}).level,'error');
});

test('worker script identities are preserved without private image names or URL credentials',()=>{
 const value=diagnosticValue({filename:'/Users/private/person-photo.jpg',other:{filename:'https://site.test/uploads/private-photo.jpeg',sourceURL:'https://site.test/uploads/private-photo.jpeg'},script:{filename:'https://person:credential@site.test/unified-engine/src/worker.js?token=secret&filename=person-photo.jpg'}});
 assert.equal(value.filename,'[omitted]');assert.equal(value.other.filename,'[omitted]');assert.equal(value.other.sourceURL,'[omitted]');assert.match(value.script.filename,/\/unified-engine\/src\/worker\.js/);
 assert.ok(!JSON.stringify(value).includes('secret'));assert.ok(!JSON.stringify(value).includes('person-photo'));assert.ok(!JSON.stringify(value).includes('credential'));
 assert.equal(diagnosticScriptURL('file:///Users/private/script.js'),null);assert.equal(diagnosticScriptURL('data:image/png;base64,pixels'),null);assert.equal(diagnosticScriptURL('/Users/private/script.js'),null);
 assert.equal(diagnosticScriptURL('https://site.test/ort/runtime.mjs'),'https://site.test/ort/runtime.mjs');
});

test('worker failures keep source, line, column, phase and original cause',()=>{
 const initial=Object.assign(Error('module request failed'),{code:'DEPENDENCY_HTTP',details:{status:503,pixels:Uint8Array.of(9)}});
 const event={type:'error',message:'Could not initialize',filename:'https://site.test/unified-engine/src/neural-graph-worker.js',lineno:17,colno:9,stage:'initialization',error:initial};
 const record=diagnosticValue(diagnosticWorkerFailure(event,'https://site.test/unified-engine/src/worker.js'));
 assert.equal(record.error.sourceURL,event.filename);assert.equal(record.error.line,17);assert.equal(record.error.column,9);assert.equal(record.error.stage,'initialization');assert.equal(record.error.cause.code,'DEPENDENCY_HTTP');assert.equal(record.error.cause.details.status,503);assert.equal(record.error.cause.details.pixels,'[omitted]');
 const opaque=diagnosticValue(diagnosticWorkerFailure({type:'error'},'https://site.test/loupe-full-worker.js?v=0.15.0'));
 assert.equal(opaque.error.sourceURL,'https://site.test/loupe-full-worker.js?v=0.15.0');assert.equal(opaque.error.browserMessageMissing,true);assert.match(opaque.error.message,/without a browser error message/);
});

test('status-only failures such as ELA are included in the report and documented-bug gate',async()=>{
 const log=createSessionLog({indexedDB:null});
 log.append({level:'error',kind:'console',method:'error',args:['[W:onnxruntime:, execution] warning']});log.append({level:'error',kind:'uncaught',error:{message:'ResizeObserver loop completed with undelivered notifications.'}});
 assert.equal(log.hasErrors,false);
 log.append({level:'info',kind:'operation.status',operation:'ela.classic',message:'Erreur ·  Moteur indisponible'});
 assert.equal(log.hasErrors,true);const report=await log.report();assert.equal(report.errorCount,1);assert.equal(report.events.length,4);assert.equal(report.summary.warningEvents,2);assert.equal(report.summary.operationFailures,1);assert.equal(report.summary.operations[0].state,'error');assert.equal(report.summary.operations[0].failures[0].reportedViaStatus,true);await log.close();
});

test('summary retains earlier failures, links their status, and distinguishes later completion',()=>{
 const events=[
  {index:1,time:'2026-10-11T21:29:55.871Z',level:'error',kind:'operation.error',error:{code:'WORKER_FAILED',message:'M2 worker failed'},operationContext:{operation:'m2.catnet',progress:null}},
  {index:2,time:'2026-10-11T21:29:55.872Z',level:'info',kind:'operation.status',operation:'m2.catnet',message:'Erreur · WORKER_FAILED M2 worker failed'},
  {index:3,time:'2026-10-11T21:34:40.332Z',level:'info',kind:'operation.status',operation:'m2.catnet',message:'Calcul en cours…'},
  {index:4,time:'2026-10-11T21:34:53.617Z',level:'info',kind:'operation.status',operation:'m2.catnet',message:'Calcul terminé'},
  {index:5,time:'2026-10-11T21:35:20.482Z',level:'info',kind:'tool.close',operation:'m2.catnet'},
  {index:6,time:'2026-10-11T21:42:59.093Z',level:'info',kind:'operation.status',operation:'inspection.magnifier',message:'Loupe : le traitement n’a pas abouti. Loupe preparation worker failed'},
 ];
 const summary=summarizeSessionEvents(events),cat=summary.operations.find(o=>o.operation==='m2.catnet');assert.equal(summary.operationFailures,2);assert.equal(cat.failures.length,1);assert.equal(cat.failures[0].eventIndex,1);assert.equal(cat.failures[0].statusEventIndex,2);assert.equal(cat.state,'completed');assert.equal(cat.closed,true);assert.equal(cat.completions[0].eventIndex,4);assert.equal(summary.operations.find(o=>o.operation==='inspection.magnifier').state,'error');
});

test('rapid status-only retry failures remain separate documented attempts',()=>{
 const events=Array.from({length:12},(_,index)=>({index:index+1,time:new Date(Date.parse('2026-10-11T21:42:57.742Z')+index*10).toISOString(),level:'info',kind:'operation.status',operation:'inspection.magnifier',message:'Loupe : le traitement n’a pas abouti. Loupe preparation worker failed'}));
 assert.equal(summarizeSessionEvents(events).operationFailures,12);
});

test('source decode and hashing end at readiness without claiming a completed analysis',()=>{
 for(const [running,ready]of [['Calcul en cours…','Prêt. Calcul CPU dans un worker dédié.'],['Computing…','Ready. CPU computation runs in a dedicated worker.']]){
  const events=['decode','original-sha256'].map((phase,index)=>({index:index+1,level:'info',kind:'operation.status',operation:'file.digest',message:running+' · '+phase}));
  events.push({index:3,level:'info',kind:'operation.status',operation:'file.digest',message:ready});
  const summary=summarizeSessionEvents(events),operation=summary.operations[0];assert.equal(operation.state,'ready');assert.equal(operation.readiness,'ready');assert.equal(operation.lastReadyEventIndex,3);assert.equal(operation.completions.length,0);assert.equal(summary.operationFailures,0);
 }
});

test('readiness after reset or an uncompleted retry retains the unresolved failure',()=>{
 const error={index:1,time:'2026-10-12T00:01:00.000Z',level:'error',kind:'operation.error',operation:'detail.gradient',error:{code:'WORKER_FAILED',message:'initial worker failure'}};
 for(const retry of [[],[{index:2,level:'info',kind:'operation.status',operation:'detail.gradient',message:'Calcul en cours…'}]]){
  const summary=summarizeSessionEvents([error,...retry,{index:3,level:'info',kind:'operation.status',operation:'detail.gradient',message:'Prêt.'}]),operation=summary.operations[0];assert.equal(operation.state,'error');assert.equal(operation.readiness,'ready');assert.equal(operation.failures[0].code,'WORKER_FAILED');assert.equal(operation.completions.length,0);assert.equal(summary.operationFailures,1);
 }
});

test('only explicit completion can resolve an earlier failure, while its evidence remains',()=>{
 const events=[
  {index:1,level:'error',kind:'operation.error',operation:'detail.gradient',error:{code:'WORKER_FAILED',message:'initial failure'}},
  {index:2,level:'info',kind:'operation.status',operation:'detail.gradient',message:'Computing…'},
  {index:3,level:'info',kind:'operation.status',operation:'detail.gradient',message:'Analysis complete'},
  {index:4,level:'info',kind:'operation.status',operation:'detail.gradient',message:'Ready.'},
 ];
 const operation=summarizeSessionEvents(events).operations[0];assert.equal(operation.state,'completed');assert.equal(operation.readiness,'ready');assert.equal(operation.failures.length,1);assert.deepEqual(operation.completions,[{eventIndex:3,time:undefined}]);
});

test('a new running attempt is not considered completed by its subsequent ready status',()=>{
 const events=[
  {index:1,level:'info',kind:'operation.status',operation:'detail.gradient',message:'Calcul terminé'},
  {index:2,level:'info',kind:'operation.status',operation:'detail.gradient',message:'Calcul en cours…'},
  {index:3,level:'info',kind:'operation.status',operation:'detail.gradient',message:'Prêt.'},
 ];
 const operation=summarizeSessionEvents(events).operations[0];assert.equal(operation.state,'ready');assert.equal(operation.completions.length,1);assert.equal(operation.completions[0].eventIndex,1);
});

const automaticFailure={code:'INVALID_INPUT',message:'Image too small for 25 complete native ELA cells',cause:{code:'NATIVE_CELL_COUNT',message:'Insufficient complete cells',details:{required:25,available:12}}};
function automaticEvent(index,{id='automatic-first',states={patchmatch:'done',sift:'done',forgeryscope:'done',d2prl:'done',ela:'failed'},attempts={ela:1},errors={ela:automaticFailure},context='automatic-context',sequence=6,...state}={}){
 return {index,time:new Date(Date.parse('2026-10-12T00:00:00Z')+index*37).toISOString(),context,sequence,level:'info',kind:'worker.progress',progress:{...(id?{id}:{}),phase:'automatic-state',state:{states,attempts,errors,...state}}};
}
const automaticRequest=(operation='analysis.complete',context='automatic-context',sequence=6)=>({index:1,context,sequence,level:'info',kind:'worker.request',method:'run',operation});

test('structured automatic group failures remain informational events but produce a truthful partial summary',async()=>{
 for(const message of ['Analyse partielle : tous les groupes n’ont pas abouti. Les résultats acquis restent exportables.','Partial analysis: some groups did not complete. Completed results remain exportable.']){
  const log=createSessionLog({indexedDB:null});log.append(automaticRequest());
  for(let n=0;n<7;n++)log.append(automaticEvent(n+2));
  log.append({level:'info',kind:'operation.status',operation:'analysis.complete',message});
  const report=await log.report(),summary=report.summary,operation=summary.operations[0],failure=operation.failures[0];
  assert.equal(report.errorCount,0);assert.equal(report.documentedFailures,1);assert.equal(log.hasErrors,true);assert.equal(summary.errorEvents,0);assert.equal(summary.operationFailures,1);assert.equal(summary.failedGroups,1);assert.equal(summary.groupFailureAttempts,1);
  assert.equal(operation.state,'partial');assert.equal(operation.readiness,'ready');assert.equal(operation.completions.length,0);assert.equal(operation.automaticRuns[0].groups.d2prl.state,'done');
  assert.equal(failure.group,'ela');assert.equal(failure.attempt,1);assert.equal(failure.runId,'automatic-first');assert.equal(failure.eventIndex,3);assert.equal(failure.reportedViaGroup,true);assert.deepEqual(failure.error,automaticFailure);
  assert.equal(report.events.filter(event=>event.kind==='worker.progress').length,7);assert.equal(report.events[2].level,'info');assert.deepEqual(report.events[2].progress.state.errors.ela,automaticFailure);await log.close();
 }
});

test('repeated snapshots deduplicate each group and attempt rather than collapsing distinct failures',()=>{
 const error={code:'WORKER_MESSAGE_FAILED',message:'Transfer failed',cause:{code:'DATA_CLONE',message:'Original cause'}};
 const events=[automaticRequest(),automaticEvent(2,{states:{ela:'failed',sift:'failed'},attempts:{ela:1,sift:3},errors:{ela:automaticFailure,sift:error}}),automaticEvent(3,{states:{ela:'failed',sift:'failed'},attempts:{ela:1,sift:3},errors:{ela:automaticFailure,sift:error}})];
 const summary=summarizeSessionEvents(events),operation=summary.operations[0];assert.equal(summary.failedGroups,2);assert.equal(summary.groupFailureAttempts,2);assert.equal(summary.operationFailures,2);assert.equal(summary.errorEvents,0);
 assert.deepEqual(operation.failures.map(f=>[f.group,f.attempt,f.eventIndex]),[['ela',1,2],['sift',3,2]]);assert.equal(operation.failures[1].error.cause.code,'DATA_CLONE');
});

test('automatic retry attempts remain in history after a later completed analysis',()=>{
 const running=automaticEvent(4,{states:{ela:'running'},attempts:{ela:2},errors:{}}),events=[automaticRequest(),automaticEvent(2),{index:3,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Analyse partielle : groupe en échec'},running];
 assert.equal(summarizeSessionEvents(events).operations[0].state,'running');
 events.push(automaticEvent(5,{attempts:{ela:2}}),automaticEvent(6,{attempts:{ela:2}}),automaticEvent(7,{states:{patchmatch:'done',sift:'done',forgeryscope:'done',d2prl:'done',ela:'done'},attempts:{ela:3},errors:{}}),{index:8,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Analyse automatique terminée.'});
 const summary=summarizeSessionEvents(events),operation=summary.operations[0];assert.equal(operation.state,'completed');assert.equal(summary.failedGroups,0);assert.equal(summary.groupFailureAttempts,2);assert.equal(summary.operationFailures,2);assert.equal(summary.errorEvents,0);assert.deepEqual(operation.failures.map(f=>[f.group,f.attempt]),[['ela',1],['ela',2]]);assert.deepEqual(operation.completions,[{eventIndex:8,time:undefined}]);
});

test('new automatic runs have separate failure identities even for the same group and attempt',()=>{
 const events=[automaticRequest(),automaticEvent(2),automaticEvent(3,{id:'automatic-second'}),automaticEvent(4,{id:'automatic-second'}),automaticEvent(5,{id:'automatic-second',states:{ela:'done'},attempts:{ela:2},errors:{}}),automaticEvent(6),{index:7,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Automatic analysis complete.'}];
 const summary=summarizeSessionEvents(events),operation=summary.operations[0];assert.equal(operation.state,'completed');assert.equal(summary.failedGroups,0);assert.equal(summary.groupFailureAttempts,2);assert.equal(operation.automaticRuns.length,2);assert.deepEqual(operation.failures.map(f=>[f.runId,f.group,f.attempt]),[['automatic-first','ela',1],['automatic-second','ela',1]]);assert.equal(operation.automaticRuns[0].failedGroups,1);assert.equal(operation.automaticRuns[1].failedGroups,0);
});

test('an automatic export completion and readiness do not erase failed detector groups',()=>{
 const events=[automaticRequest(),automaticEvent(2),{index:3,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Analyse partielle : tous les groupes n’ont pas abouti.'},{index:4,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Calcul terminé'},{index:5,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Prêt.'}];
 const summary=summarizeSessionEvents(events),operation=summary.operations[0];assert.equal(operation.state,'partial');assert.equal(operation.completions.length,0);assert.equal(summary.failedGroups,1);assert.equal(summary.operationFailures,1);assert.equal(operation.failures[0].error.cause.details.required,25);
});

test('running and recoverable pending errors are not terminal automatic group failures',()=>{
 const events=[automaticRequest(),automaticEvent(2,{states:{ela:'waiting-memory',sift:'running'},attempts:{ela:1,sift:1},errors:{},pendingErrors:{ela:{error:{code:'MEMORY_ALLOCATION',message:'Waiting for peers'}}}}),automaticEvent(3,{states:{ela:'done',sift:'done',d2prl:'skipped'},attempts:{ela:2,sift:1},errors:{}}),{index:4,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Automatic analysis complete.'}];
 const summary=summarizeSessionEvents(events),operation=summary.operations[0];assert.equal(summary.operationFailures,0);assert.equal(summary.failedGroups,0);assert.equal(summary.errorEvents,0);assert.equal(operation.state,'completed');assert.equal(operation.automaticRuns[0].groups.ela.attempt,2);
});

test('automatic progress is attributed through its worker request instead of another active operation',()=>{
 const events=[automaticRequest(),automaticRequest('analysis.clones','clones-context',9),automaticEvent(2),automaticEvent(3,{id:'clones-run',context:'clones-context',sequence:9,states:{patchmatch:'failed'},attempts:{patchmatch:1},errors:{patchmatch:{code:'WORKER_FAILED',message:'Clone worker failed'}}})];
 const summary=summarizeSessionEvents(events),complete=summary.operations.find(o=>o.operation==='analysis.complete'),clones=summary.operations.find(o=>o.operation==='analysis.clones');assert.equal(complete.failures[0].group,'ela');assert.equal(clones.failures[0].group,'patchmatch');assert.equal(summary.groupFailureAttempts,2);assert.equal(summary.failedGroups,2);
});

test('an anonymous resume snapshot stays in its current automatic run and malformed snapshots add no failure',()=>{
 const events=[automaticRequest(),automaticEvent(2),{index:3,context:'automatic-context',sequence:12,level:'info',kind:'worker.request',method:'resumeAutomatic'},automaticEvent(4,{id:null,sequence:12,states:{ela:'running'},attempts:{ela:2},errors:{}}),automaticEvent(5,{id:null,sequence:12,states:{ela:'done'},attempts:{ela:2},errors:{}}),{index:6,operation:'analysis.complete',level:'info',kind:'worker.progress',progress:{phase:'automatic-state',state:{states:[]}}},{index:7,operation:'analysis.complete',level:'info',kind:'operation.status',message:'Analyse automatique terminée.'}];
 const summary=summarizeSessionEvents(events),operation=summary.operations[0];assert.equal(operation.automaticRuns.length,1);assert.equal(operation.state,'completed');assert.equal(summary.operationFailures,1);assert.equal(summary.failedGroups,0);assert.equal(operation.failures[0].attempt,1);assert.equal(operation.automaticRuns[0].groups.ela.attempt,2);
});

test('a documented automatic allocation failure exposes an eligibility signal without rewriting raw errors or sending a report',async()=>{
 const log=createSessionLog({indexedDB:null}),error={code:'MEMORY_ALLOCATION',message:'Cannot allocate output',cause:{code:'RangeError',message:'Original allocation refusal',details:{allocationKind:'array-buffer'}}};
 log.append(automaticRequest());log.append(automaticEvent(2,{states:{d2prl:'running'},attempts:{d2prl:1},errors:{}}));assert.equal(log.hasErrors,false);
 for(let index=3;index<50;index++)log.append(automaticEvent(index,{states:{d2prl:'failed'},attempts:{d2prl:1},errors:{d2prl:error}}));
 assert.equal(log.hasErrors,true);const report=await log.report();assert.equal(report.errorCount,0);assert.equal(report.documentedFailures,1);assert.equal(report.summary.groupFailureAttempts,1);assert.equal(report.summary.failedGroups,1);assert.equal(report.summary.operations[0].failures[0].error.cause.details.allocationKind,'array-buffer');
 log.append({level:'error',kind:'worker.error',error:{code:'WORKER_FAILED',message:'Another raw failure'}});const withRaw=await log.report();assert.equal(withRaw.errorCount,1);assert.equal(withRaw.documentedFailures,2);assert.equal(withRaw.summary.errorEvents,1);assert.equal(withRaw.summary.groupFailureAttempts,1);await log.close();
});

test('durable IndexedDB batches retain the whole session beyond the recent-event window',async()=>{
 const stored=new Map();let transactions=0;
 const db={createObjectStore(){},close(){},transaction(_store,mode){
  const batch=[],tx={objectStore(){return {
   put(row){batch.push(structuredClone(row));},
   getAll(){const request={};queueMicrotask(()=>{request.result=[...stored.values()];request.onsuccess?.();});return request;}
  };}};
  if(mode==='readwrite'){transactions++;queueMicrotask(()=>{for(const row of batch)stored.set(row.index,row);tx.oncomplete?.();});}return tx;
 }};
 const indexedDB={open(){const request={result:db};queueMicrotask(()=>request.onsuccess?.());return request;}};
 const log=createSessionLog({indexedDB,id:'durable-fixture'});for(let n=0;n<600;n++)log.append({level:'info',kind:'operation.status',operation:'detail.gradient',message:'Calcul en cours…',parameters:{n}});
 const report=await log.report();assert.equal(report.eventCount,601);assert.equal(stored.size,601);assert.equal(log.recent.length,100);assert.equal(report.events[1].parameters.n,0);assert.equal(report.events.at(-1).parameters.n,599);assert.ok(transactions>1);assert.equal(report.storageError,null);await log.close();
});


test('An intentional automatic cancellation remains logged without enabling a bug submission',async()=>{
 const log=createSessionLog({indexedDB:null});
 log.append({level:'info',kind:'worker.progress',operation:'analysis.complete',progress:{id:'cancelled-run',phase:'automatic-state',state:{states:{ela:'failed'},errors:{ela:{code:'CANCELLED',message:'User cancelled'}},attempts:{ela:1}}}});
 const report=await log.report();assert.equal(report.errorCount,0);assert.equal(report.documentedFailures,0);assert.equal(log.hasErrors,false);assert.equal(report.summary.groupFailureAttempts,1);assert.equal(report.summary.operations[0].failures[0].code,'CANCELLED');await log.close();
});

test('a suspended automatic calculation remains suspended through retained-result export and readiness',()=>{
 for(const message of ['Analyse suspendue. Reprendre conserve le travail acquis.','Analysis paused. Resume preserves completed work.']){
  const events=[automaticRequest(),automaticEvent(2,{states:{ela:'running',sift:'done'},errors:{}}),automaticEvent(3,{states:{ela:'cancelled',sift:'done'},errors:{}}),{index:4,level:'info',kind:'operation.status',operation:'analysis.complete',message}];
  let operation=summarizeSessionEvents(events).operations[0];assert.equal(operation.state,'suspended');assert.equal(operation.readiness,'ready');assert.equal(operation.automaticRuns[0].state,'suspended');assert.equal(operation.automaticRuns[0].groups.ela.state,'cancelled');assert.equal(operation.completions.length,0);
  events.push(automaticEvent(5,{states:{ela:'cancelled',sift:'done'},errors:{}}),{index:6,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Calcul terminé'},{index:7,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Prêt.'});
  const summary=summarizeSessionEvents(events);operation=summary.operations[0];assert.equal(operation.state,'suspended');assert.equal(operation.readiness,'ready');assert.equal(operation.automaticRuns[0].state,'suspended');assert.equal(operation.completions.length,0);assert.equal(summary.operationFailures,0);
 }
});
test('stopping before a checkpoint settles the summary without claiming a completed calculation',()=>{
 for(const message of ['Arrêt avant la création d’un point de reprise. Relancer pour commencer.','Stopped before a resume point was created. Run to start again.']){
  const summary=summarizeSessionEvents([automaticRequest(),automaticEvent(2,{states:{ela:'pending'},errors:{}}),{index:3,level:'info',kind:'operation.status',operation:'analysis.complete',message}]),operation=summary.operations[0];
  assert.equal(operation.state,'suspended');assert.equal(operation.readiness,'ready');assert.equal(operation.automaticRuns[0].state,'suspended');assert.equal(operation.completions.length,0);assert.equal(summary.operationFailures,0);
 }
});
test('resuming a suspended run returns to running and settles as completed or partial with causes retained',()=>{
 for(const terminal of ['completed','partial']){
  const events=[automaticRequest(),automaticEvent(2,{states:{ela:'cancelled',sift:'done'},errors:{}}),{index:3,level:'info',kind:'operation.status',operation:'analysis.complete',message:'Analyse suspendue. Reprendre conserve le travail acquis.'},{index:4,context:'automatic-context',sequence:12,level:'info',kind:'worker.request',method:'resumeAutomatic'},automaticEvent(5,{id:null,sequence:12,states:{ela:'running',sift:'done'},attempts:{ela:2},errors:{}})];
  let operation=summarizeSessionEvents(events).operations[0];assert.equal(operation.state,'running');assert.equal(operation.readiness,'busy');assert.equal(operation.automaticRuns.length,1);assert.equal(operation.automaticRuns[0].state,'running');assert.equal(operation.automaticRuns[0].groups.ela.attempt,2);
  events.push(automaticEvent(6,{id:null,sequence:12,states:{ela:terminal==='completed'?'done':'failed',sift:'done'},attempts:{ela:2},errors:terminal==='completed'?{}:{ela:automaticFailure}}),{index:7,level:'info',kind:'operation.status',operation:'analysis.complete',message:terminal==='completed'?'Analyse automatique terminée.':'Analyse partielle : tous les groupes n’ont pas abouti.'});
  const summary=summarizeSessionEvents(events);operation=summary.operations[0];assert.equal(operation.state,terminal);assert.equal(operation.readiness,'ready');assert.equal(operation.automaticRuns[0].state,terminal);assert.equal(operation.completions.length,terminal==='completed'?1:0);assert.equal(summary.operationFailures,terminal==='completed'?0:1);
  if(terminal==='partial'){assert.equal(operation.failures[0].attempt,2);assert.deepEqual(operation.failures[0].error,automaticFailure);}
 }
});
test('intentional native group cancellation and suspension do not enable sending a bug report',async()=>{
 const log=createSessionLog({indexedDB:null});
 log.append(automaticRequest());log.append(automaticEvent(2,{states:{ela:'running'},errors:{}}));log.append(automaticEvent(3,{states:{ela:'cancelled'},errors:{}}));log.append({level:'info',kind:'operation.status',operation:'analysis.complete',message:'Analysis paused. Resume preserves completed work.'});
 let report=await log.report();assert.equal(report.summary.operations[0].state,'suspended');assert.equal(report.errorCount,0);assert.equal(report.documentedFailures,0);assert.equal(log.hasErrors,false);
 log.append(automaticEvent(5,{states:{ela:'running'},attempts:{ela:2},errors:{}}));assert.equal((await log.report()).summary.operations[0].state,'running');
 log.append(automaticEvent(6,{states:{ela:'done'},attempts:{ela:2},errors:{}}));log.append({level:'info',kind:'operation.status',operation:'analysis.complete',message:'Automatic analysis complete.'});
 report=await log.report();assert.equal(report.summary.operations[0].state,'completed');assert.equal(report.documentedFailures,0);assert.equal(log.hasErrors,false);assert.equal(report.events.some(event=>event.progress?.state?.states?.ela==='cancelled'),true);await log.close();
});
