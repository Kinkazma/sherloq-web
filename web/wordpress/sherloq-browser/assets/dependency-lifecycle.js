import {dependencyWorkerManifest} from './dependency-client-routing.js';
// A late first installation resumes this page. A newer resource worker pins
// mounted windows and their descendants before taking over; it does not ask
// those windows to unload sources or finish their current calculations.
export function connectDependencyWorker(serviceWorker, expected, {workerType='module',onStatus=()=>{},slowAfterMs=15000,pollMs=2000}={}) {
 return new Promise((resolve,reject)=>{
  let registration,finished=false,checking=false;
  const observed=new Set(),matches=worker=>worker?.scriptURL===expected.href,identity=dependencyWorkerManifest(expected.href,expected),compatible=worker=>matches(worker)||!!identity&&dependencyWorkerManifest(worker,expected)===identity;
  const cleanup=()=>{clearTimeout(slow);clearInterval(poll);serviceWorker.removeEventListener('controllerchange',check);serviceWorker.removeEventListener('message',probe);registration?.removeEventListener('updatefound',check);for(const worker of observed)worker.removeEventListener('statechange',check);};
  const finish=error=>{if(finished)return;finished=true;cleanup();error?reject(error):resolve();};
  const probe=event=>{if(finished||!matches(event.source))return;if(event.data?.type==='dependency-bootstrap-ready')event.ports?.[0]?.postMessage({ready:true});else if(event.data?.type==='dependency-activation-error')finish(Error(event.data.error||'SHERLOQ resource activation failed.'));};
  const observe=worker=>{if(worker&&!observed.has(worker)){observed.add(worker);worker.addEventListener('statechange',check);}};
  function check(){
   if(finished||checking)return;checking=true;
   try{
    if(compatible(serviceWorker.controller)){finish();return;}
    observe(registration?.installing);observe(registration?.waiting);
    if(matches(registration?.waiting)){
     onStatus('waiting');
     registration.waiting.postMessage({type:'dependency-activate-coexist',previousManifest:dependencyWorkerManifest(registration.active||serviceWorker.controller,expected)});
    }else if([...observed].some(worker=>matches(worker)&&worker.state==='redundant'))finish(Error('Dependency installation failed.'));
   }finally{checking=false;}
  }
  const slow=setTimeout(()=>{if(!finished)onStatus('slow');},slowAfterMs),poll=setInterval(check,pollMs);
  serviceWorker.addEventListener('controllerchange',check);serviceWorker.addEventListener('message',probe);
  onStatus('installing');
  if(compatible(serviceWorker.controller)){finish();return;}
  Promise.resolve().then(()=>serviceWorker.register(expected,{type:workerType,scope:'./',updateViaCache:'none'})).then(value=>{
   if(finished)return;registration=value;registration.addEventListener('updatefound',check);check();
  },finish);
 });
}
