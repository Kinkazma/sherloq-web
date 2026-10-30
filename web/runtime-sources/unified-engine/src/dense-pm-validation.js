import "../../runtime-context.js?v=0.30.0";
// Native dense descriptor domain validation. For any IEEE float32 x:
// finite(x) && abs(x)<2 iff -2<x && x<2. NaN/inf fail both comparisons.
// Input arrays remain owned by their caller; no mutation or metadata cache.
export function normalizedBankLoop(bank){
 if(!(bank instanceof Float32Array))return false;
 for(let i=0;i<bank.length;i++){const value=bank[i];if(!(value>-2&&value<2))return false;}
 return true;
}
export function normalizedBanksLoop(first,second=first){return normalizedBankLoop(first)&&(second===first||normalizedBankLoop(second));}
export async function normalizedBanksCooperative(first,second=first,{check=()=>{},cooperate,blockValues=65536}={}){
 if(!(first instanceof Float32Array)||!(second instanceof Float32Array)||!Number.isSafeInteger(blockValues)||blockValues<1)throw new TypeError('Finite float32 banks and positive bounded page required');
 for(const bank of second===first?[first]:[first,second])for(let at=0;at<bank.length;at+=blockValues){
  check();if(cooperate)await cooperate();check();
  for(let i=at,end=Math.min(bank.length,at+blockValues);i<end;i++){const value=bank[i];if(!(value>-2&&value<2))return false;}
 }
 check();return true;
}
