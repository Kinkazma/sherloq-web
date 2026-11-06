/** Keep the existing synchronous raw-read API when possible. A strict bank
 * may perform asynchronous IO; its engine lock and reservation then remain
 * owned until both the read and provenance transformation have settled. */
export function withRawReadLifetime(read,transform,{hold,release}){
 let asynchronous=false,unlock,primary;
 function finish(error){const failures=[];try{unlock?.();}catch(e){failures.push(e);}try{release();}catch(e){failures.push(e);}if(failures.length){if(error&&typeof error==='object')error.details={...error.details,cleanupErrors:failures.map(e=>({code:e.code,message:e.message}))};else throw failures[0];}}
 try{
  const answer=transform(read());
  if(answer&&typeof answer.then==='function'){
   unlock=hold();asynchronous=true;
   return Promise.resolve(answer).then(value=>{finish();return value;},error=>{finish(error);throw error;});
  }
  return answer;
 }catch(error){primary=error;throw error;}
 finally{if(!asynchronous)finish(primary);}
}
