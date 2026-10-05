chrome.runtime.onMessageExternal.addListener((message,sender,respond)=>{
 let url;try{url=new URL(sender.url);}catch{return;}
 if(sender.id||url.protocol!=='http:'||!['localhost','127.0.0.1'].includes(url.hostname)||message?.type!=='sherloq-system-memory-v1')return;
 chrome.system.memory.getInfo().then(({capacity,availableCapacity})=>respond({capacity,availableCapacity}),error=>respond({error:error.message}));
 return true;
});
