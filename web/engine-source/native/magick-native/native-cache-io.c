/* Private transport wrappers. The ImageMagick Core and pixel math are unchanged.
 * Wrapping a complete C WASI call keeps iovec iteration on the instrumented C
 * stack; JS stream_ops never starts an unawaited asynchronous operation. */
#include <emscripten/emscripten.h>
#include <wasi/api.h>
#include <stdint.h>
#include <stddef.h>

EM_JS(int,native_cache_fd,(int fd),{
  return Module.nativePixelCache && Module.nativePixelCache.ownsFd(fd) ? 1 : 0;
});

EM_JS(int,native_cache_read,(int fd,void *pointer,size_t length,int positioned,double offset),{
  if(Asyncify.state===Asyncify.State.Rewinding)return Asyncify.handleAsync(()=>Promise.resolve(0));
  try {
    var result=Module.nativePixelCache.read(fd,pointer>>>0,length>>>0,positioned,offset);
    if(result&&typeof result.then==='function')return Asyncify.handleAsync(()=>result.catch(error=>{
      Module.nativePixelCache.captureFailure(error);return -1;
    }));
    return result;
  } catch(error) {Module.nativePixelCache.captureFailure(error);return -1;}
});

EM_JS(int,native_cache_write,(int fd,const void *pointer,size_t length,int positioned,double offset),{
  if(Asyncify.state===Asyncify.State.Rewinding)return Asyncify.handleAsync(()=>Promise.resolve(0));
  try {
    var result=Module.nativePixelCache.write(fd,pointer>>>0,length>>>0,positioned,offset);
    if(result&&typeof result.then==='function')return Asyncify.handleAsync(()=>result.catch(error=>{
      Module.nativePixelCache.captureFailure(error);return -1;
    }));
    return result;
  } catch(error) {Module.nativePixelCache.captureFailure(error);return -1;}
});

extern __wasi_errno_t __real___wasi_fd_read(__wasi_fd_t,const __wasi_iovec_t *,size_t,size_t *);
extern __wasi_errno_t __real___wasi_fd_write(__wasi_fd_t,const __wasi_ciovec_t *,size_t,size_t *);
extern __wasi_errno_t __real___wasi_fd_pread(__wasi_fd_t,const __wasi_iovec_t *,size_t,__wasi_filesize_t,size_t *);
extern __wasi_errno_t __real___wasi_fd_pwrite(__wasi_fd_t,const __wasi_ciovec_t *,size_t,__wasi_filesize_t,size_t *);

__wasi_errno_t __wrap___wasi_fd_read(__wasi_fd_t fd,const __wasi_iovec_t *iov,size_t count,size_t *total) {
  if(!native_cache_fd(fd))return __real___wasi_fd_read(fd,iov,count,total);
  *total=0;
  for(size_t i=0;i<count;++i){int n=native_cache_read(fd,iov[i].buf,iov[i].buf_len,0,0);
    if(n<0)return __WASI_ERRNO_IO;*total+=(size_t)n;if((size_t)n<iov[i].buf_len)break;}
  return __WASI_ERRNO_SUCCESS;
}
__wasi_errno_t __wrap___wasi_fd_write(__wasi_fd_t fd,const __wasi_ciovec_t *iov,size_t count,size_t *total) {
  if(!native_cache_fd(fd))return __real___wasi_fd_write(fd,iov,count,total);
  *total=0;
  for(size_t i=0;i<count;++i){int n=native_cache_write(fd,iov[i].buf,iov[i].buf_len,0,0);
    if(n<0)return __WASI_ERRNO_IO;*total+=(size_t)n;if((size_t)n<iov[i].buf_len)break;}
  return __WASI_ERRNO_SUCCESS;
}
__wasi_errno_t __wrap___wasi_fd_pread(__wasi_fd_t fd,const __wasi_iovec_t *iov,size_t count,
  __wasi_filesize_t offset,size_t *total) {
  if(!native_cache_fd(fd))return __real___wasi_fd_pread(fd,iov,count,offset,total);
  *total=0;
  for(size_t i=0;i<count;++i){int n=native_cache_read(fd,iov[i].buf,iov[i].buf_len,1,(double)offset+*total);
    if(n<0)return __WASI_ERRNO_IO;*total+=(size_t)n;if((size_t)n<iov[i].buf_len)break;}
  return __WASI_ERRNO_SUCCESS;
}
__wasi_errno_t __wrap___wasi_fd_pwrite(__wasi_fd_t fd,const __wasi_ciovec_t *iov,size_t count,
  __wasi_filesize_t offset,size_t *total) {
  if(!native_cache_fd(fd))return __real___wasi_fd_pwrite(fd,iov,count,offset,total);
  *total=0;
  for(size_t i=0;i<count;++i){int n=native_cache_write(fd,iov[i].buf,iov[i].buf_len,1,(double)offset+*total);
    if(n<0)return __WASI_ERRNO_IO;*total+=(size_t)n;if((size_t)n<iov[i].buf_len)break;}
  return __WASI_ERRNO_SUCCESS;
}
