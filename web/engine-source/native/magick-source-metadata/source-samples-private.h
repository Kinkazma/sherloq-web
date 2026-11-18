/* Private metadata-only coder hook. No pixel/Quantum inspection or mutation. */
#ifndef SHERLOQ_SOURCE_SAMPLES_PRIVATE_H
#define SHERLOQ_SOURCE_SAMPLES_PRIVATE_H
#include <stdarg.h>
#include <stdio.h>
#include <string.h>
#include <math.h>
#include "MagickCore/artifact.h"
#define NF_KEY "sherloq:source-samples"
#define NF_MAX_BYTES 16384
#define NF_MAX_CHANNELS 64
typedef struct {char json[NF_MAX_BYTES],encoding[2048];size_t n,e;
 unsigned channels,fields;int failed,alpha;const char *association;} NativeFacts;
static inline void NFAppendTo(NativeFacts *f,char *out,size_t cap,size_t *n,
 const char *format,...){
 va_list ap;int count;if(f->failed)return;
 va_start(ap,format);count=vsnprintf(out+*n,cap-*n,format,ap);va_end(ap);
 if(count<0||(size_t)count>=cap-*n){f->failed=1;return;}*n+=(size_t)count;
}
#define NFAppend(f,...) NFAppendTo(f,(f)->json,sizeof((f)->json),&(f)->n,__VA_ARGS__)
static inline void NFStringTo(NativeFacts *f,char *out,size_t cap,size_t *n,const char *v){
 size_t i;if(v==NULL){NFAppendTo(f,out,cap,n,"null");return;}
 if(strlen(v)>127){f->failed=1;return;}
 NFAppendTo(f,out,cap,n,"\"");
 for(i=0;v[i];i++){
  unsigned char c=(unsigned char)v[i];
  if(c=='"'||c=='\\')NFAppendTo(f,out,cap,n,"\\%c",c);
  else if(c<32)NFAppendTo(f,out,cap,n,"\\u%04x",c);
  else NFAppendTo(f,out,cap,n,"%c",c);
 }
 NFAppendTo(f,out,cap,n,"\"");
}
#define NFString(f,v) NFStringTo(f,(f)->json,sizeof((f)->json),&(f)->n,v)
static inline void NFBegin(NativeFacts *f,const char *coder,const char *model){
 memset(f,0,sizeof(*f));f->association="unknown";
 NFAppend(f,"{\"schema\":\"sherloq.coder-source-samples/1\",\"precisionOrigin\":\"decoder-source-header\",\"coder\":");
 NFString(f,coder);NFAppend(f,",\"sourceModel\":");NFString(f,model);
 NFAppend(f,",\"channels\":[");
}
static inline void NFChannel(NativeFacts *f,const char *name,const char *role,
 const char *type,unsigned bits,unsigned exponent){
 if(f->channels>=NF_MAX_CHANNELS||bits>64||exponent>64){f->failed=1;return;}
 if(f->channels++)NFAppend(f,",");
 NFAppend(f,"{\"name\":");NFString(f,name);NFAppend(f,",\"role\":");NFString(f,role);
 NFAppend(f,",\"codedType\":");NFString(f,type);NFAppend(f,",\"codedBits\":");
 if(bits)NFAppend(f,"%u",bits);else NFAppend(f,"null");
 NFAppend(f,",\"exponentBits\":%u}",exponent);
 if(strcmp(role,"alpha")==0)f->alpha=1;
}
static inline void NFUniform(NativeFacts *f,const char *model,const char *type,
 unsigned bits,int alpha){
 const char *map=strcmp(model,"CMYK")==0?"CMYK":strcmp(model,"GRAY")==0?"Y":"RGB";
 for(size_t i=0;map[i];i++){char name[2]={map[i],0};NFChannel(f,name,"color",type,bits,0);}
 if(alpha)NFChannel(f,"A","alpha",type,bits,0);
}
static inline void NFEncodingString(NativeFacts *f,const char *key,const char *v){
 if(f->fields++)NFAppendTo(f,f->encoding,sizeof(f->encoding),&f->e,",");
 NFStringTo(f,f->encoding,sizeof(f->encoding),&f->e,key);
 NFAppendTo(f,f->encoding,sizeof(f->encoding),&f->e,":");
 NFStringTo(f,f->encoding,sizeof(f->encoding),&f->e,v);
}
static inline void NFEncodingNumber(NativeFacts *f,const char *key,double v){
 if(f->fields++)NFAppendTo(f,f->encoding,sizeof(f->encoding),&f->e,",");
 NFStringTo(f,f->encoding,sizeof(f->encoding),&f->e,key);
 NFAppendTo(f,f->encoding,sizeof(f->encoding),&f->e,":");
 if(isfinite(v))NFAppendTo(f,f->encoding,sizeof(f->encoding),&f->e,"%.17g",v);
 else NFAppendTo(f,f->encoding,sizeof(f->encoding),&f->e,"null");
}
static inline void NFEnd(NativeFacts *f,Image *image){
 NFAppend(f,"],\"alpha\":{\"present\":%s,\"association\":",f->alpha?"true":"false");
 NFString(f,f->association);NFAppend(f,"},\"valueEncoding\":{%s}}",f->encoding);
 if(f->failed||!f->channels){(void)DeleteImageArtifact(image,NF_KEY);return;}
 if(SetImageArtifact(image,NF_KEY,f->json)==MagickFalse)
  (void)DeleteImageArtifact(image,NF_KEY);
}
#endif
