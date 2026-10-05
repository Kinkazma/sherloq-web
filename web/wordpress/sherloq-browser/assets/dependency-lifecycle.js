// A late first installation must resume this page, not leave a dead bootstrap.
// Updates may take over only after every scoped window confirms it is still
// bootstrapping this same version (no mounted workspace/calculations).
export function connectDependencyWorker(serviceWorker, expected, {workerType='module',onStatus=()=>{},slowAfterMs=15000,pollMs=2000}={}) {
 return new Promise((resolve,reject)=>{
  let registration,finished=false,checking=false;
  const observed=new Set(),matches=worker=>worker?.scriptURL===expected.href;
  const cleanup=()=>{clearTimeout(slow);clearInterval(poll);serviceWorker.removeEventListener('controllerchange',check);serviceWorker.removeEventListener('message',probe);registration?.removeEventListener('updatefound',check);for(const worker of observed)worker.removeEventListener('statechange',check);};
  const finish=error=>{if(finished)return;finished=true;cleanup();error?reject(error):resolve();};
  const probe=event=>{if(!finished&&event.data?.type==='dependency-bootstrap-ready'&&matches(event.source))event.ports?.[0]?.postMessage({ready:true});};
  const observe=worker=>{if(worker&&!observed.has(worker)){observed.add(worker);worker.addEventListener('statechange',check);}};
  function check(){
   if(finished||checking)return;checking=true;
   try{
    if(matches(serviceWorker.controller)){finish();return;}
    observe(registration?.installing);observe(registration?.waiting);
    if(matches(registration?.waiting)){
     onStatus('waiting');
     registration.waiting.postMessage({type:'dependency-activate-when-ready'});
    }else if([...observed].some(worker=>matches(worker)&&worker.state==='redundant'))finish(Error('Dependency installation failed.'));
   }finally{checking=false;}
  }
  const slow=setTimeout(()=>{if(!finished)onStatus('slow');},slowAfterMs),poll=setInterval(check,pollMs);
  serviceWorker.addEventListener('controllerchange',check);serviceWorker.addEventListener('message',probe);
  onStatus('installing');
  Promise.resolve().then(()=>serviceWorker.register(expected,{type:workerType,scope:'./',updateViaCache:'none'})).then(value=>{
   if(finished)return;registration=value;registration.addEventListener('updatefound',check);check();
  },finish);
 });
}
