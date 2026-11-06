// One document owns one update probe. Resource dialogs and result rendering
// contribute activity here instead of racing independent probe responses.
let active=0,frozen=false;
export const localActivityBusy=()=>active>0;
export const localActivityFrozen=()=>frozen;
export const setLocalActivityFrozen=value=>{frozen=!!value;};
export async function withLocalActivity(fn,{allowFrozen=false}={}){
 if(frozen&&!allowFrozen)throw Object.assign(Error('A local change is being activated; retry after it finishes.'),{code:'LOCAL_FROZEN'});
 active++;
 try{return await fn();}finally{active--;}
}
