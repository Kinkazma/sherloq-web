// This mount changes only where the existing Core's file cache stores bytes.
// The C WASI wrappers await a whole native read/write call, outside JS iov loops.
import {EngineError,requireValue,checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';

const thenable=value=>value&&typeof value.then==='function';
export function mountPixelCache(FS,module,owner,{signal}={}) {
  const path='/native-cache';let failed=false,failure,closed=false,closing=false,
    ownerRetired=false,directoryOwned=false,mounted=false,uncertainMount=false,releaseFlight;
  const nodes=new Set();
  const capture=error=>{if(!failed){failed=true;failure=error;}};
  const alive=()=>{checkAbort(signal);if(closed||closing)throw new EngineError('DISPOSED','Native cache mount closing or closed.');};
  const ack=async action=>{const value=await action();requireValue(value!==false&&value!==0,'Native cache retirement was not acknowledged.');return value;};
  const attribute=node=>({dev:2,ino:node.id,mode:node.mode,nlink:node.linked?1:0,
    uid:0,gid:0,rdev:0,size:node.cache?node.cache.byteLength:4096,
    atime:new Date(0),mtime:new Date(0),ctime:new Date(0),blksize:4096,
    blocks:node.cache?Math.ceil(node.cache.byteLength/4096):0});
  const retire=node=>{
    if(node.linked||node.openStreams||!node.cache)return;
    const task=owner.retire(node.cache);
    task.then(()=>nodes.delete(node),capture);
  };
  const filesystem={mount(mount){
    const root=FS.createNode(null,'/',0o40700,0);root.mount=mount;
    root.contents=Object.create(null);root.linked=true;
    root.node_ops={getattr:attribute,lookup(_parent,name){
      const node=root.contents[name];if(!node)throw new FS.ErrnoError(44);return node;
    },readdir(){return ['.','..',...Object.keys(root.contents)];},
    mknod(parent,name,mode){
      alive();if(!FS.isFile(mode))throw new FS.ErrnoError(63);
      const node=FS.createNode(parent,name,mode,0);
      node.cache=owner.createFile();node.linked=true;node.openStreams=0;
      node.node_ops={getattr:attribute,setattr(_node,attr){
        if(attr.size!==undefined&&attr.size!==node.cache.byteLength)throw new FS.ErrnoError(28);
        if(attr.mode!==undefined)node.mode=attr.mode;
      }};
      node.stream_ops={open(){++node.openStreams;},close(){--node.openStreams;retire(node);},
        llseek(stream,offset,whence){
          const position=whence===0?offset:whence===1?stream.position+offset
            :whence===2?node.cache.byteLength+offset:-1;
          if(!Number.isSafeInteger(position)||position<0)throw new FS.ErrnoError(28);
          return position;
        },read(){throw new FS.ErrnoError(29);},write(){throw new FS.ErrnoError(29);},
      };
      nodes.add(node);root.contents[name]=node;return node;
    },unlink(_parent,name){
      const node=root.contents[name];if(!node)throw new FS.ErrnoError(44);
      delete root.contents[name];node.linked=false;retire(node);
    }};
    return root;
  }};
  const streamFor=fd=>{const stream=FS.getStream(fd);return stream&&nodes.has(stream.node)?stream:null;};
  function transfer(fd,pointer,length,positioned,offset,writing) {
    alive();const stream=streamFor(fd);
    requireValue(stream&&Number.isInteger(pointer)&&pointer>=0&&Number.isInteger(length)
      &&length>=0&&length<=0x7fffffff,'Invalid owned Core cache I/O.');
    const at=positioned?offset:stream.position;
    requireValue(Number.isSafeInteger(at)&&at>=0&&Number.isSafeInteger(at+length)
      &&pointer<=module.HEAPU8.length-length,'Invalid owned Core cache byte range.');
    const execute=()=>{
      alive();const part=module.HEAPU8.subarray(pointer,pointer+length);
      const result=writing?stream.node.cache.write(part,at):stream.node.cache.readInto(part,at);
      const finish=count=>{if(!positioned)stream.position=at+count;return count;};
      return thenable(result)?result.then(finish):finish(result);
    };
    if(writing&&at+length>stream.node.cache.byteLength) {
      const extending=stream.node.cache.ensureLength(at+length);
      return thenable(extending)?extending.then(execute):execute();
    }
    return execute();
  }
  const bridge={
    ownsFd:fd=>!!streamFor(fd),captureFailure:capture,
    read(fd,pointer,length,positioned=0,offset=0){return transfer(fd,pointer,length,positioned,offset,false);},
    write(fd,pointer,length,positioned=0,offset=0){return transfer(fd,pointer,length,positioned,offset,true);},
  };
  const handle={
    path,get failed(){return failed;},get failure(){return failure;},
    metrics:()=>owner.metrics(),
    release(){
      if(closed)return Promise.resolve();if(releaseFlight)return releaseFlight;closing=true;
      const task=(async()=>{
        if(!ownerRetired){await ack(()=>owner.dispose());ownerRetired=true;}
        if(uncertainMount){requireValue(typeof FS.lookupPath==='function','A partial cache mount requires an observed retryable state.');
          mounted=!!FS.lookupPath(path,{follow_mount:false}).node.mounted;uncertainMount=false;}
        // Each ACK survives a later failure, including a refused rmdir after
        // an already successful unmount. No new C use is admitted while closing.
        if(mounted){await ack(()=>FS.unmount(path));mounted=false;}
        if(directoryOwned){await ack(()=>FS.rmdir(path));directoryOwned=false;}
        nodes.clear();closed=true;if(module.nativePixelCache===bridge)delete module.nativePixelCache;
      })();releaseFlight=task;task.then(()=>{if(releaseFlight===task)releaseFlight=null;},()=>{if(releaseFlight===task)releaseFlight=null;});return task;
    },
  };
  let mountAttempted=false;
  try{
    try{const value=FS.mkdir(path);requireValue(value!==false&&value!==0,'Native cache directory was not acknowledged.');directoryOwned=true;}catch(error){if(error?.errno!==20)throw error;}
    mountAttempted=true;const value=FS.mount(filesystem,{},path);requireValue(value!==false&&value!==0,'Native cache mount was not acknowledged.');mounted=true;
    module.nativePixelCache=bridge;return handle;
  }catch(primary){
    if(mountAttempted)uncertainMount=true;
    // Construction is synchronous, but its existing storage owner can close
    // asynchronously. The caller adopts this one cleanup owner before retry.
    throw withRetirementOwner(primary,{dispose:()=>handle.release()},new EngineError('BUSY','Native cache mount retirement remains pending.'));
  }
}
