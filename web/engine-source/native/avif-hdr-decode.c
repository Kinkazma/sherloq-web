/* SPDX-License-Identifier: GPL-3.0-or-later
 * Bounded RGB bands over libavif's original decoded planes. Gain-map maths
 * comes from libavif (BSD-2-Clause), including HDR-base to SDR-alternate maps.
 */
#include <avif/avif.h>
#include <avif/internal.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
extern uint32_t avifDecoderNativeCodecCount(const avifDecoder *decoder);
extern uint64_t avifDecoderNativeCodecWorkPixels(const avifDecoder *decoder);
extern uint64_t avifDecoderNativeCodecTileBudget(const avifDecoder *decoder);
#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define API EMSCRIPTEN_KEEPALIVE
#else
#define API
#endif
static avifDecoder *decoder;
static avifImage *base_view, *gain_view;
static avifRGBImage rgb;
static char failure[768];
static int decoded;
static uint32_t band_skip;
static avifRGBImage pair_base,pair_gain,fast_output,native_output;
static float *model;
static uint32_t model_count,model_gain_count,model_base_count,pair_rows;
static int result(avifResult r, const char *phase) {
 if(r==AVIF_RESULT_OK)return 1;
 snprintf(failure,sizeof(failure),"%s: %s (%s)",phase,avifResultToString(r),decoder?decoder->diag.error:"");return 0;
}
API void hdr_avif_close(void){avifRGBImageFreePixels(&rgb);memset(&rgb,0,sizeof(rgb));avifRGBImageFreePixels(&pair_base);memset(&pair_base,0,sizeof(pair_base));avifRGBImageFreePixels(&pair_gain);memset(&pair_gain,0,sizeof(pair_gain));avifRGBImageFreePixels(&fast_output);memset(&fast_output,0,sizeof(fast_output));avifRGBImageFreePixels(&native_output);memset(&native_output,0,sizeof(native_output));free(model);model=NULL;model_count=0;if(base_view)avifImageDestroy(base_view);base_view=NULL;if(gain_view)avifImageDestroy(gain_view);gain_view=NULL;if(decoder)avifDecoderDestroy(decoder);decoder=NULL;decoded=0;band_skip=0;}
API const char *hdr_avif_error(void){return failure;}
API int hdr_avif_open(const uint8_t *bytes,size_t size,int threads){
 hdr_avif_close();failure[0]=0;decoder=avifDecoderCreate();
 if(!decoder){snprintf(failure,sizeof(failure),"Cannot allocate AVIF decoder");return 0;}
 decoder->maxThreads=threads>0?threads:1;decoder->imageContentToDecode=AVIF_IMAGE_CONTENT_ALL|AVIF_IMAGE_CONTENT_SAMPLE_TRANSFORMS;
 /* Admission is owned by the caller after parsing, before AV1 decoding. */
 /* libavif1.4 rejects a zero imageSizeLimit. Its supported default covers
  * 100MP; the application owner still admits actual memory before decode. */
 decoder->imageSizeLimit=AVIF_DEFAULT_IMAGE_SIZE_LIMIT;decoder->imageDimensionLimit=0;
 if(!result(avifDecoderSetIOMemory(decoder,bytes,size),"input")||!result(avifDecoderParse(decoder),"parse"))return 0;
 base_view=avifImageCreateEmpty();gain_view=avifImageCreateEmpty();
 if(!base_view||!gain_view){snprintf(failure,sizeof(failure),"Cannot allocate AVIF views");return 0;}return 1;
}
API int hdr_avif_width(void){return decoder?decoder->image->width:0;}
API int hdr_avif_height(void){return decoder?decoder->image->height:0;}
API int hdr_avif_depth(void){return decoder?decoder->image->depth:0;}
API int hdr_avif_primaries(void){return decoder?decoder->image->colorPrimaries:0;}
API int hdr_avif_transfer(void){return decoder?decoder->image->transferCharacteristics:0;}
API int hdr_avif_matrix(void){return decoder?decoder->image->matrixCoefficients:0;}
API int hdr_avif_range(void){return decoder?decoder->image->yuvRange:0;}
API int hdr_avif_alpha(void){return decoder?decoder->alphaPresent:0;}
API int hdr_avif_rotation(void){return decoder&&(decoder->image->transformFlags&AVIF_TRANSFORM_IROT)?decoder->image->irot.angle:0;}
API int hdr_avif_mirror(void){return decoder&&(decoder->image->transformFlags&AVIF_TRANSFORM_IMIR)?decoder->image->imir.axis:-1;}
API int hdr_avif_has_gain_map(void){return decoder&&decoder->image->gainMap!=NULL;}
API uint32_t hdr_avif_codec_count(void){return avifDecoderNativeCodecCount(decoder);}
API double hdr_avif_codec_work_pixels(void){return (double)avifDecoderNativeCodecWorkPixels(decoder);}
API double hdr_avif_codec_tile_budget(void){return (double)avifDecoderNativeCodecTileBudget(decoder);}
API double hdr_avif_base_headroom(void){const avifGainMap*g=decoder?decoder->image->gainMap:NULL;return g&&g->baseHdrHeadroom.d?(double)g->baseHdrHeadroom.n/g->baseHdrHeadroom.d:0;}
API double hdr_avif_alt_headroom(void){const avifGainMap*g=decoder?decoder->image->gainMap:NULL;return g&&g->alternateHdrHeadroom.d?(double)g->alternateHdrHeadroom.n/g->alternateHdrHeadroom.d:0;}
API int hdr_avif_alt_transfer(void){return decoder&&decoder->image->gainMap?decoder->image->gainMap->altTransferCharacteristics:0;}
API int hdr_avif_format(void){return decoder?decoder->image->yuvFormat:0;}
API int hdr_avif_gain_width(void){return decoder&&decoder->image->gainMap&&decoder->image->gainMap->image?decoder->image->gainMap->image->width:0;}
API int hdr_avif_gain_height(void){return decoder&&decoder->image->gainMap&&decoder->image->gainMap->image?decoder->image->gainMap->image->height:0;}
API int hdr_avif_gain_depth(void){return decoder&&decoder->image->gainMap&&decoder->image->gainMap->image?decoder->image->gainMap->image->depth:0;}
API int hdr_avif_gain_format(void){return decoder&&decoder->image->gainMap&&decoder->image->gainMap->image?decoder->image->gainMap->image->yuvFormat:0;}
API int hdr_avif_gain_primaries(void){return decoder&&decoder->image->gainMap?decoder->image->gainMap->altColorPrimaries:0;}
API int hdr_avif_gain_matrix(void){return decoder&&decoder->image->gainMap?decoder->image->gainMap->altMatrixCoefficients:0;}
API int hdr_avif_use_base_color_space(void){return decoder&&decoder->image->gainMap?decoder->image->gainMap->useBaseColorSpace:1;}
API const uint8_t *hdr_avif_alt_icc(void){return decoder&&decoder->image->gainMap?decoder->image->gainMap->altICC.data:NULL;}
API int hdr_avif_alt_icc_size(void){return decoder&&decoder->image->gainMap?decoder->image->gainMap->altICC.size:0;}
API int hdr_avif_clli(void){return decoder?decoder->image->clli.maxCLL:0;}
API int hdr_avif_alt_clli(void){return decoder&&decoder->image->gainMap?decoder->image->gainMap->altCLLI.maxCLL:0;}
API double hdr_avif_gain_parameter(int kind,int channel){
 const avifGainMap *g=decoder?decoder->image->gainMap:NULL;if(!g||channel<0||channel>2)return kind==2?1:0;
 if(kind==2)return g->gainMapGamma[channel].d?(double)g->gainMapGamma[channel].n/g->gainMapGamma[channel].d:1;
 avifSignedFraction value=kind==0?g->gainMapMin[channel]:kind==1?g->gainMapMax[channel]:kind==3?g->baseOffset[channel]:g->alternateOffset[channel];return value.d?(double)value.n/value.d:0;
}
API const uint8_t *hdr_avif_icc(void){return decoder?decoder->image->icc.data:NULL;}
API int hdr_avif_icc_size(void){return decoder?decoder->image->icc.size:0;}
API int hdr_avif_decode(void){
 if(!decoder){snprintf(failure,sizeof(failure),"Decoder is closed");return 0;}
 if(!result(avifDecoderNextImage(decoder),"AV1 decode"))return 0;
 avifGainMap*g=decoder->image->gainMap;
 if(g&&g->image&&(g->image->width!=decoder->image->width||g->image->height!=decoder->image->height)){
  if(!result(avifImageScale(g->image,decoder->image->width,decoder->image->height,&decoder->diag),"gain map scale"))return 0;
 }
 decoded=1;return 1;
}
/* RGB-only presentation deliberately composites onto black in libavif.
 * Scientific RGB instead retains straight source-depth channel values. */
static int copy_straight_alpha_rgb(const avifImage *view,uint32_t first,uint32_t rows,uint16_t *native){
 avifRGBImage straight;avifRGBImageSetDefaults(&straight,view);straight.format=AVIF_RGB_FORMAT_RGBA;straight.alphaPremultiplied=AVIF_FALSE;
 if(!result(avifRGBImageAllocatePixels(&straight),"native alpha pair allocation")||!result(avifImageYUVToRGB(view,&straight),"native alpha pair conversion")){avifRGBImageFreePixels(&straight);return 0;}
 const uint32_t maximum=(1u<<straight.depth)-1;
 for(uint32_t row=0;row<rows;row++){
  const uint8_t *source=straight.pixels+(size_t)(first+row)*straight.rowBytes;
  for(uint32_t x=0;x<straight.width;x++)for(uint32_t c=0;c<3;c++){
   const uint32_t value=straight.depth>8?((const uint16_t*)source)[x*4+c]:source[x*4+c];
   native[((size_t)row*straight.width+x)*3+c]=(uint16_t)((value*65535u+maximum/2)/maximum);
  }
 }
 avifRGBImageFreePixels(&straight);return 1;
}
/* libavif requires view origins to follow both source chroma grids. A band
 * beginning on an odd row may need three preceding rows rather than two.
 * Runtime bands are at most128 rows: an odd step is at most127, so the
 * aligned view still fits the existing132-row workspace envelope. */
static uint32_t band_first_row(uint32_t y){
 uint32_t first=y>=2?y-2:0;avifPixelFormatInfo info;
 avifGetPixelFormatInfo(decoder->image->yuvFormat,&info);
 uint32_t shift=info.monochrome?0:info.chromaShiftY;
 if(decoder->image->gainMap&&decoder->image->gainMap->image){
  avifGetPixelFormatInfo(decoder->image->gainMap->image->yuvFormat,&info);
  if(!info.monochrome&&info.chromaShiftY>shift)shift=info.chromaShiftY;
 }
 return first&~((1u<<shift)-1u);
}
/* mode0: straight decoded RGB samples at16bit container precision.
 * mode1: colour-managed SDR reconstruction; headroom0, BT709/sRGB.
 * Both return only the requested rows, never a full RGB allocation. */
API int hdr_avif_band(uint32_t y,uint32_t rows,int mode){
 if(!decoded||!rows||y>=decoder->image->height||rows>decoder->image->height-y){snprintf(failure,sizeof(failure),"Invalid AVIF band");return 0;}
 avifRGBImageFreePixels(&rgb);memset(&rgb,0,sizeof(rgb));
 uint32_t first=band_first_row(y),end=y+rows+2;if(end>decoder->image->height)end=decoder->image->height;band_skip=y-first;
 avifCropRect crop={0,first,decoder->image->width,end-first};
 if(!result(avifImageSetViewRect(base_view,decoder->image,&crop),"RGB band view"))return 0;
 avifRGBImageSetDefaults(&rgb,base_view);rgb.format=AVIF_RGB_FORMAT_RGB;rgb.depth=16;rgb.isFloat=AVIF_FALSE;
 if(mode==0){if(!result(avifRGBImageAllocatePixels(&rgb),"RGB band allocation"))return 0;if(base_view->alphaPlane)return copy_straight_alpha_rgb(base_view,0,base_view->height,(uint16_t*)rgb.pixels);return result(avifImageYUVToRGB(base_view,&rgb),"RGB band conversion");}
 avifGainMap *original=decoder->image->gainMap,*empty=NULL,local;
 if(original&&original->image){
  if(!result(avifImageSetViewRect(gain_view,original->image,&crop),"gain band view"))return 0;
  local=*original;local.image=gain_view;
 }else{
  empty=avifGainMapCreate();if(!empty){snprintf(failure,sizeof(failure),"Cannot allocate gain metadata");return 0;}local=*empty;
 }
 avifDiagnostics diag;avifResult code=avifImageApplyGainMap(base_view,&local,0,AVIF_COLOR_PRIMARIES_BT709,AVIF_TRANSFER_CHARACTERISTICS_SRGB,&rgb,NULL,&diag);
 if(empty)avifGainMapDestroy(empty);
 if(code!=AVIF_RESULT_OK){snprintf(failure,sizeof(failure),"SDR reconstruction: %s (%s)",avifResultToString(code),diag.error);return 0;}return 1;
}
API const uint16_t *hdr_avif_pixels(void){return(const uint16_t*)(rgb.pixels+(size_t)band_skip*rgb.rowBytes);}
API uint32_t hdr_avif_row_bytes(void){return rgb.rowBytes;}
static int make_model(void){
 if(model)return 1;
 const avifImage *image=decoder->image;const avifGainMap *g=image->gainMap;
 if(image->icc.size||(g&&g->altICC.size)){snprintf(failure,sizeof(failure),"Gain-map ICC needs the explicit ICC adapter");return 0;}
 if(g&&!result(avifGainMapValidateMetadata(g,&decoder->diag),"gain map metadata"))return 0;
 model_base_count=1u<<image->depth;model_gain_count=g&&g->image?1u<<g->image->depth:2;
 model_count=32+model_base_count+3*model_gain_count+65536;model=calloc(model_count,sizeof(float));if(!model){snprintf(failure,sizeof(failure),"Gain-map table allocation failed");return 0;}
 model[0]=model_base_count-1;model[1]=model_gain_count-1;model[29]=32;model[30]=32+model_base_count;model[31]=32+model_base_count+3*model_gain_count;
 avifColorPrimaries math=g&&!(g->useBaseColorSpace||g->altColorPrimaries==AVIF_COLOR_PRIMARIES_UNSPECIFIED)?g->altColorPrimaries:image->colorPrimaries;
 double input[3][3]={{1,0,0},{0,1,0},{0,0,1}},output[3][3]={{1,0,0},{0,1,0},{0,0,1}};
 if(image->colorPrimaries!=math&&!avifColorPrimariesComputeRGBToRGBMatrix(image->colorPrimaries,math,input)){snprintf(failure,sizeof(failure),"Unsupported input gain-map primaries");free(model);model=NULL;model_count=0;return 0;}
 if(math!=AVIF_COLOR_PRIMARIES_BT709&&!avifColorPrimariesComputeRGBToRGBMatrix(math,AVIF_COLOR_PRIMARIES_BT709,output)){snprintf(failure,sizeof(failure),"Unsupported output gain-map primaries");free(model);model=NULL;model_count=0;return 0;}
 for(int r=0;r<3;r++)for(int c=0;c<3;c++){model[5+r*3+c]=input[r][c];model[14+r*3+c]=output[r][c];}
 avifTransferFunction linear=avifTransferCharacteristicsGetGammaToLinearFunction(image->transferCharacteristics),gamma=avifTransferCharacteristicsGetLinearToGammaFunction(AVIF_TRANSFER_CHARACTERISTICS_SRGB);
 for(uint32_t i=0;i<model_base_count;i++)model[32+i]=linear((float)i/(model_base_count-1));
 for(uint32_t i=0;i<65536;i++)model[(uint32_t)model[31]+i]=gamma((float)i/65535);
 float weight=0;if(g){float base=(float)g->baseHdrHeadroom.n/g->baseHdrHeadroom.d,alt=(float)g->alternateHdrHeadroom.n/g->alternateHdrHeadroom.d;if(base!=alt){weight=fminf(1,fmaxf(0,(0-base)/(alt-base)));if(alt<base)weight=-weight;}}
 model[2]=weight;
 for(int c=0;c<3;c++){
  float min=g?(float)g->gainMapMin[c].n/g->gainMapMin[c].d:0,max=g?(float)g->gainMapMax[c].n/g->gainMapMax[c].d:0,inv=g?(float)g->gainMapGamma[c].d/g->gainMapGamma[c].n:1;
  model[23+c]=g?(float)g->baseOffset[c].n/g->baseOffset[c].d:0;model[26+c]=g?(float)g->alternateOffset[c].n/g->alternateOffset[c].d:0;
  for(uint32_t i=0;i<model_gain_count;i++){float p=powf((float)i/(model_gain_count-1),inv),log=(1-p)*min+p*max;model[(uint32_t)model[30]+c*model_gain_count+i]=exp2f(log*weight);}
 }
 return 1;
}
API const float *hdr_avif_model(void){return make_model()?model:NULL;}
API uint32_t hdr_avif_model_count(void){return model_count;}
/* The source-depth RGB grids are exactly the inputs used by libavif's
 * reference gain-map function. Expensive transfer/gain powers are tabled once. */
API int hdr_avif_pair(uint32_t y,uint32_t rows){
 if(!decoded||!rows||y+rows>decoder->image->height)return 0;model_base_count=1u<<decoder->image->depth;
 avifRGBImageFreePixels(&pair_base);avifRGBImageFreePixels(&pair_gain);avifRGBImageFreePixels(&native_output);avifRGBImageFreePixels(&fast_output);memset(&pair_base,0,sizeof(pair_base));memset(&pair_gain,0,sizeof(pair_gain));memset(&native_output,0,sizeof(native_output));memset(&fast_output,0,sizeof(fast_output));
 uint32_t first=band_first_row(y),end=y+rows+2;if(end>decoder->image->height)end=decoder->image->height;band_skip=y-first;pair_rows=rows;
 avifCropRect crop={0,first,decoder->image->width,end-first};
 if(!result(avifImageSetViewRect(base_view,decoder->image,&crop),"base pair view"))return 0;
 avifRGBImageSetDefaults(&pair_base,base_view);pair_base.format=AVIF_RGB_FORMAT_RGB;
 if(!result(avifRGBImageAllocatePixels(&pair_base),"base pair allocation")||!result(avifImageYUVToRGB(base_view,&pair_base),"base pair conversion"))return 0;
 if(decoder->image->gainMap&&decoder->image->gainMap->image){
  if(!result(avifImageSetViewRect(gain_view,decoder->image->gainMap->image,&crop),"gain pair view"))return 0;
  avifRGBImageSetDefaults(&pair_gain,gain_view);pair_gain.format=AVIF_RGB_FORMAT_RGB;
  if(!result(avifRGBImageAllocatePixels(&pair_gain),"gain pair allocation")||!result(avifImageYUVToRGB(gain_view,&pair_gain),"gain pair conversion"))return 0;
 }
 avifRGBImageSetDefaults(&native_output,base_view);native_output.height=rows;native_output.format=AVIF_RGB_FORMAT_RGB;native_output.depth=16;
 if(!result(avifRGBImageAllocatePixels(&native_output),"native pair allocation"))return 0;
 /* RGB without an alpha channel deliberately composites onto black in
  * libavif. Keep that existing SDR pair unchanged, but scientific RGB must
  * not inherit this implicit multiplication. RGBA requests straight source-
  * depth components, including hidden RGB where straight alpha is zero. */
 if(base_view->alphaPlane){
  return copy_straight_alpha_rgb(base_view,band_skip,rows,(uint16_t*)native_output.pixels);
 }
 const uint32_t count=decoder->image->width*rows*3;uint16_t *native=(uint16_t*)native_output.pixels;const uint8_t *base=pair_base.pixels+(size_t)band_skip*pair_base.rowBytes;
 if(pair_base.depth>8){const uint16_t *values=(const uint16_t*)base;for(uint32_t i=0;i<count;i++)native[i]=(uint16_t)(((uint32_t)values[i]*65535u+(model_base_count-1)/2)/(model_base_count-1));}
 else for(uint32_t i=0;i<count;i++)native[i]=base[i]*257u;
 return 1;
}
API const uint8_t *hdr_avif_pair_base(void){return pair_base.pixels+(size_t)band_skip*pair_base.rowBytes;}
API const uint8_t *hdr_avif_pair_gain(void){return pair_gain.pixels?pair_gain.pixels+(size_t)band_skip*pair_gain.rowBytes:NULL;}
API const uint16_t *hdr_avif_pair_native(void){return(const uint16_t*)native_output.pixels;}
API int hdr_avif_pair_gain_depth(void){return pair_gain.depth;}
static float gamma_lookup(float value){if(!(value>0))return 0;if(value>=1)return 1;float at=value*65535;uint32_t i=(uint32_t)at;float a=model[(uint32_t)model[31]+i],b=model[(uint32_t)model[31]+i+1];return a+(b-a)*(at-i);}
API int hdr_avif_fast_sdr(void){
 if(!pair_base.pixels||!model)return 0;avifRGBImageFreePixels(&fast_output);memset(&fast_output,0,sizeof(fast_output));
 avifRGBImageSetDefaults(&fast_output,decoder->image);fast_output.width=pair_base.width;fast_output.height=pair_rows;fast_output.format=AVIF_RGB_FORMAT_RGB;fast_output.depth=16;
 if(!result(avifRGBImageAllocatePixels(&fast_output),"fast SDR band allocation"))return 0;
 const uint8_t *base=hdr_avif_pair_base(),*gain=hdr_avif_pair_gain();uint16_t *out=(uint16_t*)fast_output.pixels;
 const uint32_t count=pair_base.width*pair_rows;
 for(uint32_t i=0;i<count;i++){
  float v[3],a[3],b[3];for(int c=0;c<3;c++){uint32_t raw=pair_base.depth>8?((uint16_t*)base)[i*3+c]:base[i*3+c];v[c]=model[32+raw];}
  for(int r=0;r<3;r++)a[r]=model[5+r*3]*v[0]+model[6+r*3]*v[1]+model[7+r*3]*v[2];
  for(int c=0;c<3;c++){uint32_t raw=gain?(pair_gain.depth>8?((uint16_t*)gain)[i*3+c]:gain[i*3+c]):0;b[c]=(a[c]+model[23+c])*model[(uint32_t)model[30]+c*model_gain_count+raw]-model[26+c];}
  for(int r=0;r<3;r++){float value=model[14+r*3]*b[0]+model[15+r*3]*b[1]+model[16+r*3]*b[2];out[i*3+r]=(uint16_t)floorf(gamma_lookup(value)*65535+.5f);}
 }
 return 1;
}
API const uint16_t *hdr_avif_fast_pixels(void){return(const uint16_t*)fast_output.pixels;}
API int hdr_avif_pair_width(void){return pair_base.width;}
API int hdr_avif_pair_rows(void){return pair_rows;}
API int hdr_avif_preview_pair(uint32_t width,uint32_t height){
 if(!decoded||!width||!height||width>decoder->image->width||height>decoder->image->height){snprintf(failure,sizeof(failure),"Invalid preview pair grid");return 0;}
 avifRGBImageFreePixels(&pair_base);avifRGBImageFreePixels(&pair_gain);memset(&pair_base,0,sizeof(pair_base));memset(&pair_gain,0,sizeof(pair_gain));band_skip=0;pair_rows=height;
 avifCropRect crop={0,0,decoder->image->width,decoder->image->height};avifImage *small=avifImageCreateEmpty(),*gain=avifImageCreateEmpty();int ok=0;
 if(!small||!gain){snprintf(failure,sizeof(failure),"Cannot allocate preview pair views");goto done;}
 if(!result(avifImageSetViewRect(small,decoder->image,&crop),"preview pair view")||!result(avifImageScale(small,width,height,&decoder->diag),"preview pair scale"))goto done;
 avifRGBImageSetDefaults(&pair_base,small);pair_base.format=AVIF_RGB_FORMAT_RGB;
 if(!result(avifRGBImageAllocatePixels(&pair_base),"preview base RGB")||!result(avifImageYUVToRGB(small,&pair_base),"preview base conversion"))goto done;
 if(decoder->image->gainMap&&decoder->image->gainMap->image){
  if(!result(avifImageSetViewRect(gain,decoder->image->gainMap->image,&crop),"preview gain pair view")||!result(avifImageScale(gain,width,height,&decoder->diag),"preview gain pair scale"))goto done;
  avifRGBImageSetDefaults(&pair_gain,gain);pair_gain.format=AVIF_RGB_FORMAT_RGB;
  if(!result(avifRGBImageAllocatePixels(&pair_gain),"preview gain RGB")||!result(avifImageYUVToRGB(gain,&pair_gain),"preview gain conversion"))goto done;
 }
 ok=1;
done:if(gain)avifImageDestroy(gain);if(small)avifImageDestroy(small);return ok;
}
/* Presentation only. Reuses the AV1 planes, not a second codec decode. */
API int hdr_avif_preview(uint32_t width,uint32_t height){
 if(!decoded||!width||!height||width>decoder->image->width||height>decoder->image->height){snprintf(failure,sizeof(failure),"Invalid preview grid");return 0;}
 avifRGBImageFreePixels(&rgb);memset(&rgb,0,sizeof(rgb));band_skip=0;
 avifCropRect crop={0,0,decoder->image->width,decoder->image->height};
 avifImage *small=avifImageCreateEmpty(),*gain=avifImageCreateEmpty();avifGainMap *empty=NULL;int ok=0;
 if(!small||!gain){snprintf(failure,sizeof(failure),"Cannot allocate preview views");goto done;}
 if(!result(avifImageSetViewRect(small,decoder->image,&crop),"preview view")||!result(avifImageScale(small,width,height,&decoder->diag),"preview scale"))goto done;
 avifGainMap local,*original=decoder->image->gainMap;
 if(original&&original->image){
  if(!result(avifImageSetViewRect(gain,original->image,&crop),"preview gain view")||!result(avifImageScale(gain,width,height,&decoder->diag),"preview gain scale"))goto done;
  local=*original;local.image=gain;
 }else{empty=avifGainMapCreate();if(!empty){snprintf(failure,sizeof(failure),"Cannot allocate preview gain metadata");goto done;}local=*empty;}
 avifRGBImageSetDefaults(&rgb,small);rgb.format=AVIF_RGB_FORMAT_RGB;rgb.depth=8;rgb.isFloat=AVIF_FALSE;
 avifDiagnostics diag;avifResult code=avifImageApplyGainMap(small,&local,0,AVIF_COLOR_PRIMARIES_BT709,AVIF_TRANSFER_CHARACTERISTICS_SRGB,&rgb,NULL,&diag);
 if(code!=AVIF_RESULT_OK){snprintf(failure,sizeof(failure),"Preview SDR: %s (%s)",avifResultToString(code),diag.error);goto done;}ok=1;
done:
 if(empty)avifGainMapDestroy(empty);if(gain)avifImageDestroy(gain);if(small)avifImageDestroy(small);return ok;
}
