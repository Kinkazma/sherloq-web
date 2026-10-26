// Only autonomous initialization/loading belongs here. A complete inference
// waits on recoverable children and must not be marked as independent work.
// Keep the ticket until work actually settles, including non-abortable module
// initialization. Its returned value remains owned by the caller.
export async function withD2prlActivity(budget,id,state,work,{parent}={}) {
 // Unscoped recovery passes null when there is no outer ticket (e.g. the
 // prepaid role worker). Absence is not a foreign or expired parent ticket.
 const activity=budget.beginOperation?.({owner:'d2prl',id,parent:parent??undefined});
 activity?.setState(state);
 try{return await work(activity);}finally{activity?.release();}
}
