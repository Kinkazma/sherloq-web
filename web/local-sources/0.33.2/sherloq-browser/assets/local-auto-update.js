export const AUTO_UPDATE_KEY='sherloq.local.auto-update';
export const AUTO_UPDATE_CHANNEL='stable';
export const MAX_IGNORED_VERSIONS=20;

const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
function safeJSON(value,depth=0){
 if(depth>10)throw Error('Preference nesting too deep');
 if(value===null||typeof value==='boolean'||typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=65536)return value;
 if(Array.isArray(value)&&value.length<=10000)return value.map(item=>safeJSON(item,depth+1));
 if(object(value)&&Object.keys(value).length<=1000)return Object.fromEntries(Object.entries(value).map(([key,item])=>{if(['__proto__','prototype','constructor'].includes(key)||key.length>200)throw Error('Invalid preference name');return[key,safeJSON(item,depth+1)];}));
 throw Error('Invalid preference JSON');
}
export function parseProductVersion(value){
 if(typeof value!=='string'||value.length>200)return null;
 const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
 if(!match)return null;
 const prerelease=match[4]?.split('.')||[];
 if(prerelease.some(part=>/^\d+$/.test(part)&&part.length>1&&part[0]==='0'))return null;
 return {numbers:match.slice(1,4).map(BigInt),prerelease};
}
export function compareProductVersions(left,right){
 const a=parseProductVersion(left),b=parseProductVersion(right);if(!a||!b)return null;
 for(let index=0;index<3;index++)if(a.numbers[index]!==b.numbers[index])return a.numbers[index]>b.numbers[index]?1:-1;
 if(!a.prerelease.length||!b.prerelease.length)return a.prerelease.length===b.prerelease.length?0:a.prerelease.length?-1:1;
 for(let index=0;index<Math.max(a.prerelease.length,b.prerelease.length);index++){
  const x=a.prerelease[index],y=b.prerelease[index];if(x===y)continue;if(x===undefined)return-1;if(y===undefined)return 1;
  const nx=/^\d+$/.test(x),ny=/^\d+$/.test(y);if(nx&&ny)return BigInt(x)>BigInt(y)?1:-1;if(nx!==ny)return nx?-1:1;return x>y?1:-1;
 }return 0;
}
export function recoverAutoUpdatePreferences(input){
 const issues=[];if(input===undefined||input===null)input={};if(!object(input))throw Error('Invalid automatic update preferences');
 const original=safeJSON(input),value={...original,schema:'sherloq.auto-update/1',enabled:false,ignoredVersions:[]};
 if(original.schema!==undefined&&original.schema!==value.schema)issues.push({path:'schema',kind:'incompatible',message:'Unknown automatic update schema'});
 else if(typeof original.enabled==='boolean')value.enabled=original.enabled;
 else if(original.enabled!==undefined)issues.push({path:'enabled',kind:'incompatible',message:'Expected boolean'});
 if(original.ignoredVersions!==undefined){
  if(!Array.isArray(original.ignoredVersions))issues.push({path:'ignoredVersions',kind:'incompatible',message:'Expected ignored version list'});
  else for(const [index,item]of original.ignoredVersions.entries()){
   if(!object(item)||item.channel!==AUTO_UPDATE_CHANNEL||!parseProductVersion(item.version)){issues.push({path:'ignoredVersions.'+index,kind:'incompatible',message:'Invalid ignored release'});continue;}
   if(!value.ignoredVersions.some(previous=>previous.channel===item.channel&&previous.version===item.version))value.ignoredVersions.push(item);
  }
 }
 if(value.ignoredVersions.length>MAX_IGNORED_VERSIONS){issues.push({path:'ignoredVersions',kind:'incompatible',message:'Ignored release history bounded to 20 entries'});value.ignoredVersions=value.ignoredVersions.slice(-MAX_IGNORED_VERSIONS);}
 return {value,issues};
}
export function ignoredAutoUpdate(preferences,plan){return preferences.ignoredVersions.some(item=>item.channel===AUTO_UPDATE_CHANNEL&&item.version===plan.release.version);}
export function ignoreAutoUpdateVersion(preferences,plan){return {...preferences,ignoredVersions:[...preferences.ignoredVersions.filter(item=>item.channel!==AUTO_UPDATE_CHANNEL||item.version!==plan.release.version),{channel:AUTO_UPDATE_CHANNEL,version:plan.release.version}].slice(-MAX_IGNORED_VERSIONS)};}
export function canOfferAutoUpdate(plan,active,preferences){
 if(!preferences.enabled||!plan?.release||!/^[a-f0-9]{64}$/.test(plan.identity||'')||plan.identity===active?.identity)return false;
 const {release,shell}=plan;
 if(release.shell?.sha256!==plan.identity||release.manifest?.sha256!==shell?.manifest||release.catalog?.sha256!==shell?.catalog||release.version!==shell?.version)return false;
 if(!/^[a-f0-9]{64}$/.test(shell.manifest||'')||!/^[a-f0-9]{64}$/.test(shell.catalog||''))return false;
 const order=compareProductVersions(release.version,active?.version);return order!==null&&order>=0&&!ignoredAutoUpdate(preferences,plan);
}
