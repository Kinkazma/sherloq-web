// Development evidence, not a production admission oracle. CDP reads existing
// counters: no evaluate(), heap snapshot, GC, probe or pause-on-start. A separate
// one-shot CPU sample can capture an unresponsive coordinator after a failure.
export async function createChromiumMemoryObserver(browser,{timeoutMs=3000}={}){
 const root=await browser.newBrowserCDPSession(),sessions=new Map(),pending=new Map();let sequence=0,closed=false,sampling;
 const received=({sessionId,message})=>{let reply;try{reply=JSON.parse(message);}catch{return;}const key=sessionId+':'+reply.id,request=pending.get(key);if(!request)return;pending.delete(key);clearTimeout(request.timer);reply.error?request.reject(new Error(reply.error.message)):request.resolve(reply.result);};
 root.on('Target.receivedMessageFromTarget',received);
 root.on('Target.detachedFromTarget',({sessionId})=>{for(const [id,value]of sessions)if(value.sessionId===sessionId)sessions.delete(id);});
 const send=(sessionId,method,params={})=>new Promise((resolve,reject)=>{
  const id=++sequence,key=sessionId+':'+id,timer=setTimeout(()=>{pending.delete(key);reject(new Error('Counter query timed out: '+method));},timeoutMs);
  pending.set(key,{resolve,reject,timer});root.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(error=>{const request=pending.get(key);if(request){pending.delete(key);clearTimeout(timer);reject(error);}});
 });
 return {
  async profileStalledCoordinator(){
   // Development-only evidence after repeated unanswered diagnostics. Sample
   // this run's coordinator for one second; never pause it or run a canary.
   if(closed)return null;const {targetInfos}=await root.send('Target.getTargets'),target=targetInfos.find(value=>value.type==='worker'&&value.url.endsWith('/src/worker.js'));
   if(!target)return {unavailable:'Coordinator target absent'};
   let session=sessions.get(target.targetId);if(!session){session=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});sessions.set(target.targetId,session);}
   let started=false;try{await send(session.sessionId,'Profiler.enable');await send(session.sessionId,'Profiler.setSamplingInterval',{interval:1000});await send(session.sessionId,'Profiler.start');started=true;await new Promise(resolve=>setTimeout(resolve,1000));const result=await send(session.sessionId,'Profiler.stop');started=false;return {at:new Date().toISOString(),targetId:target.targetId,url:target.url,...result,scope:'One-second CPU sample after three unanswered coordinator diagnostics; no pause, GC, heap snapshot or capacity trial.'};}
   finally{if(started)await send(session.sessionId,'Profiler.stop').catch(()=>{});await send(session.sessionId,'Profiler.disable').catch(()=>{});}
  },
  sample(reason='diagnostic'){
   if(closed)return Promise.resolve(null);if(sampling)return sampling;
   sampling=(async()=>{
    const at=new Date().toISOString(),{targetInfos}=await root.send('Target.getTargets'),live=new Set(targetInfos.map(t=>t.targetId)),counters=[];
    for(const [id,value]of sessions)if(!live.has(id)){sessions.delete(id);await root.send('Target.detachFromTarget',{sessionId:value.sessionId}).catch(()=>{});}
    // Sample sequentially to avoid a burst across all compute workers.
    for(const target of targetInfos.filter(t=>['page','worker','shared_worker','service_worker'].includes(t.type))){
     if(closed)break;
     try{let session=sessions.get(target.targetId);if(!session){session=await root.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});sessions.set(target.targetId,session);}
      const identity=await send(session.sessionId,'Runtime.getIsolateId'),memory=await send(session.sessionId,'Runtime.getHeapUsage');
      counters.push({targetId:target.targetId,type:target.type,url:target.url,isolateId:identity.id,...memory});
     }catch(error){counters.push({targetId:target.targetId,type:target.type,url:target.url,error:error.message});}
    }
    let processes;try{processes=(await root.send('SystemInfo.getProcessInfo')).processInfo;}catch(error){processes={error:error.message};}
    return {at,reason,counters,processes,sampleDurationMs:Date.now()-Date.parse(at),scope:'Per-isolate CDP counters and cumulative process CPU seconds (including CPU time of the GPU process, not GPU utilization); shared backing may appear in multiple isolates. No free-memory estimate, no sum across workers.',preflightExecutions:0};
   })().finally(()=>{sampling=null;});return sampling;
  },
  async close(){if(closed)return;closed=true;for(const request of pending.values()){clearTimeout(request.timer);request.reject(new Error('Memory observer closed'));}pending.clear();for(const value of sessions.values())await root.send('Target.detachFromTarget',{sessionId:value.sessionId}).catch(()=>{});sessions.clear();root.off('Target.receivedMessageFromTarget',received);await root.detach().catch(()=>{});await sampling?.catch(()=>{});}
 };
}
