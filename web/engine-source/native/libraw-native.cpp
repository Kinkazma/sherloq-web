// LibRaw's unsigned native sensor samples and linear RGB16 development.
// No thumbnail or RGB8 intermediary contributes to the developed image.
#include <libraw/libraw.h>
#include <emscripten.h>
#include <cstdint>
#include <cstring>
#include <sstream>
#include <string>
#include <new>
#include <cmath>
#include <iomanip>

EM_JS(int, raw_progress, (int phase, int iteration, int expected), {
 if (Module['rawAbortFlag'] && Atomics.load(Module['rawAbortFlag'], 0)) return 1;
 if (Module['rawProgress']) Module['rawProgress'](phase, iteration, expected);
 return 0;
});

class NativeRaw final : public LibRaw {
public:
 void linear_curve() { gamma_curve(1.0, 1.0, 2, 65536); }
 const unsigned char *profile() const { return (const unsigned char*)libraw_internal_data.output_data.oprof; }
};
static NativeRaw *decoder=nullptr;
static int failure=0;
static std::string metadata,sensor_metadata;
static bool unpacked=false,processed=false;
static int progress(void*,enum LibRaw_progress phase,int iteration,int expected){return raw_progress((int)phase,iteration,expected);}
static void data_error(void*,const char*,const INT64){/* Report LibRaw's return code; never emit source names. */}
static std::string quote(const char *value){std::string out="\"";for(const unsigned char *p=(const unsigned char*)value;*p;p++){if(*p=='\\'||*p=='\"'){out+='\\';out+=(char)*p;}else if(*p>=32)out+=(char)*p;}return out+'\"';}

extern "C" {
void raw_native_close(){delete decoder;decoder=nullptr;metadata.clear();sensor_metadata.clear();unpacked=processed=false;}
int raw_native_error(){return failure;}
const char *raw_native_error_message(){return libraw_strerror(failure);}
const char *raw_native_version(){return LibRaw::version();}
static int raw_native_open_impl(const unsigned char *bytes,unsigned length,unsigned maximum_mb,bool preserve_float){
 raw_native_close();failure=0;
 if(!bytes||!length||maximum_mb<16){failure=LIBRAW_UNSPECIFIED_ERROR;return 0;}
 try{decoder=new NativeRaw;decoder->set_progress_handler(progress,nullptr);decoder->set_dataerror_handler(data_error,nullptr);decoder->imgdata.rawparams.max_raw_memory_mb=maximum_mb;
  if(preserve_float)decoder->imgdata.rawparams.options &= ~LIBRAW_RAWOPTIONS_CONVERTFLOAT_TO_INT;
  failure=decoder->open_buffer(bytes,length);if(failure)return 0;
  const auto &d=decoder->imgdata;std::ostringstream out;
  out<<"{\"decoder\":"<<quote(LibRaw::version())<<",\"make\":"<<quote(d.idata.make)<<",\"model\":"<<quote(d.idata.model)<<",\"sourceWidth\":"<<d.sizes.width<<",\"sourceHeight\":"<<d.sizes.height<<",\"rawWidth\":"<<d.sizes.raw_width<<",\"rawHeight\":"<<d.sizes.raw_height<<",\"rawPitch\":"<<d.sizes.raw_pitch<<",\"topMargin\":"<<d.sizes.top_margin<<",\"leftMargin\":"<<d.sizes.left_margin<<",\"flip\":"<<d.sizes.flip<<",\"sourceBitDepth\":"<<d.color.raw_bps<<",\"filters\":"<<d.idata.filters<<",\"colors\":"<<d.idata.colors<<",\"colorDescription\":"<<quote(d.idata.cdesc)<<",\"blackLevel\":"<<d.color.black<<",\"whiteLevel\":"<<d.color.maximum<<",\"channelBlack\":[";
  for(int c=0;c<4;c++){if(c)out<<',';out<<d.color.cblack[c];}out<<"],\"cameraWhiteBalance\":[";for(int c=0;c<4;c++){if(c)out<<',';out<<d.color.cam_mul[c];}out<<"],\"daylightWhiteBalance\":[";for(int c=0;c<4;c++){if(c)out<<',';out<<d.color.pre_mul[c];}out<<"],\"cameraToXYZ\":[";
  for(int c=0;c<4;c++)for(int k=0;k<3;k++){if(c||k)out<<',';out<<d.color.cam_xyz[c][k];}out<<"],\"xtrans\":[";for(int y=0;y<6;y++)for(int x=0;x<6;x++){if(y||x)out<<',';out<<(unsigned)d.idata.xtrans[y][x];}out<<"],\"rawInsetCrops\":[";for(int i=0;i<2;i++){if(i)out<<',';const auto&v=d.sizes.raw_inset_crops[i];out<<"{\"x\":"<<v.cleft<<",\"y\":"<<v.ctop<<",\"width\":"<<v.cwidth<<",\"height\":"<<v.cheight<<'}';}out<<"],\"frames\":"<<d.idata.raw_count<<'}';metadata=out.str();return 1;
 }catch(const std::bad_alloc&){failure=LIBRAW_UNSUFFICIENT_MEMORY;return 0;}catch(...){failure=LIBRAW_UNSPECIFIED_ERROR;return 0;}
}
int raw_native_open(const unsigned char *bytes,unsigned length,unsigned maximum_mb){return raw_native_open_impl(bytes,length,maximum_mb,false);}
int raw_native_open_sensor(const unsigned char *bytes,unsigned length,unsigned maximum_mb){return raw_native_open_impl(bytes,length,maximum_mb,true);}
const char *raw_native_metadata(){return metadata.c_str();}
int raw_native_unpack(){if(!decoder)return 0;failure=decoder->unpack();unpacked=failure==0;return unpacked;}
int raw_native_apply_vendor_crop(){if(!unpacked||processed)return -1;return decoder->adjust_to_raw_inset_crop(1);}
int raw_native_sensor_channels(){if(!unpacked)return 0;const auto &r=decoder->imgdata.rawdata;if(r.raw_image||r.float_image)return 1;if(r.color3_image||r.float3_image)return 3;if(r.color4_image||r.float4_image)return 4;return 0;}
int raw_native_sensor_float(){if(!unpacked)return 0;const auto &r=decoder->imgdata.rawdata;return r.float_image||r.float3_image||r.float4_image?1:0;}
unsigned raw_native_sensor_rows(unsigned y,unsigned count,unsigned char *out){
 if(!unpacked||!out)return 0;const auto &d=decoder->imgdata;const auto &r=d.rawdata;unsigned channels=raw_native_sensor_channels(),bytes=raw_native_sensor_float()?4:2,width=d.sizes.raw_width,height=d.sizes.raw_height;if(!channels||!count||y>=height||count>height-y)return 0;
 const unsigned char *source=r.raw_image?(unsigned char*)r.raw_image:r.float_image?(unsigned char*)r.float_image:r.color3_image?(unsigned char*)r.color3_image:r.float3_image?(unsigned char*)r.float3_image:r.color4_image?(unsigned char*)r.color4_image:(unsigned char*)r.float4_image;
 const size_t rowbytes=(size_t)width*channels*bytes,pitch=d.sizes.raw_pitch?d.sizes.raw_pitch:rowbytes;
 if(pitch<rowbytes)return 0;for(unsigned row=0;row<count;row++)std::memcpy(out+(size_t)row*rowbytes,source+(size_t)(y+row)*pitch,rowbytes);return (unsigned)(rowbytes*count);
}
const char *raw_native_sensor_metadata(){
 if(!unpacked)return nullptr;
 const auto &d=decoder->imgdata;const auto &r=d.rawdata;const auto &s=r.sizes;const auto &c=r.color;const auto &i=r.iparams;
 libraw_decoder_info_t info;decoder->get_decoder_info(&info);
 std::ostringstream out;out<<std::setprecision(17);
 const auto number=[&](double value){if(std::isfinite(value))out<<value;else out<<"null";};
 const unsigned channels=raw_native_sensor_channels(),sample_bytes=raw_native_sensor_float()?4:2;
 out<<"{\"stage\":\"post-unpack-before-raw2image\",\"sampleType\":"<<quote(raw_native_sensor_float()?"float32":"uint16")<<",\"width\":"<<s.raw_width<<",\"height\":"<<s.raw_height<<",\"channels\":"<<channels<<",\"sourceDepth\":";if(i.dng_version&&c.raw_bps>0&&c.raw_bps<=32)out<<c.raw_bps;else out<<"null";out<<",\"librawRawBitsPerSample\":"<<c.raw_bps<<",\"orientationApplied\":false,\"selectedFrame\":"<<d.rawparams.shot_select<<",\"frameCount\":"<<i.raw_count;
 out<<",\"geometry\":{\"rawPitch\":"<<s.raw_pitch<<",\"packedRowBytes\":"<<(unsigned long long)s.raw_width*channels*sample_bytes<<",\"activeArea\":{\"x\":"<<s.left_margin<<",\"y\":"<<s.top_margin<<",\"width\":"<<s.width<<",\"height\":"<<s.height<<"},\"activeAreaSource\":\"LibRaw normalized post-open geometry\",\"pixelAspect\":";number(s.pixel_aspect);out<<",\"librawFlip\":"<<s.flip<<",\"mappingToDeveloped\":\"not-proven\",\"rawMasks\":[";
 for(int a=0;a<8;a++){if(a)out<<',';out<<'[';for(int b=0;b<4;b++){if(b)out<<',';out<<s.mask[a][b];}out<<']';}out<<"],\"rawInsetCrops\":[";
 for(int a=0;a<2;a++){if(a)out<<',';const auto &v=s.raw_inset_crops[a];out<<"{\"x\":"<<v.cleft<<",\"y\":"<<v.ctop<<",\"width\":"<<v.cwidth<<",\"height\":"<<v.cheight<<'}';}out<<"]}";
 out<<",\"cfa\":{\"filterCode\":"<<i.filters<<",\"colorDescription\":"<<quote(i.cdesc)<<",\"xtransActivePattern\":[";
 for(int y=0;y<6;y++){if(y)out<<',';out<<'[';for(int x=0;x<6;x++){if(x)out<<',';out<<(unsigned)i.xtrans[y][x];}out<<']';}out<<"],\"xtransSensorPattern\":[";
 for(int y=0;y<6;y++){if(y)out<<',';out<<'[';for(int x=0;x<6;x++){if(x)out<<',';out<<(unsigned)i.xtrans_abs[y][x];}out<<']';}out<<"]}";
 out<<",\"calibration\":{\"black\":"<<c.black<<",\"white\":"<<c.maximum<<",\"channelBlack\":[";
 for(int k=0;k<4;k++){if(k)out<<',';out<<c.cblack[k];}out<<"],\"blackPattern\":{\"rows\":"<<c.cblack[4]<<",\"columns\":"<<c.cblack[5]<<",\"values\":[";
 uint64_t count=uint64_t(c.cblack[4])*uint64_t(c.cblack[5]);if(count>4096)return nullptr;for(unsigned k=0;k<count;k++){if(k)out<<',';out<<c.cblack[k+6];}out<<"]},\"linearMaximum\":[";
 for(int k=0;k<4;k++){if(k)out<<',';out<<c.linear_max[k];}out<<"],\"floatMaximum\":";number(c.fmaximum);out<<",\"floatNormalization\":";number(c.fnorm);
 out<<",\"cameraWhiteBalance\":[";for(int k=0;k<4;k++){if(k)out<<',';number(c.cam_mul[k]);}out<<"],\"daylightWhiteBalance\":[";for(int k=0;k<4;k++){if(k)out<<',';number(c.pre_mul[k]);}out<<"],\"cameraToXYZ\":[";for(int a=0;a<4;a++)for(int b=0;b<3;b++){if(a||b)out<<',';number(c.cam_xyz[a][b]);}out<<"],\"cameraToRGB\":[";for(int a=0;a<3;a++)for(int b=0;b<4;b++){if(a||b)out<<',';number(c.rgb_cam[a][b]);}out<<"]}";
 out<<",\"dngCalibration\":{\"version\":"<<i.dng_version<<",\"colors\":[";
 for(int k=0;k<2;k++){if(k)out<<',';const auto &v=c.dng_color[k];out<<"{\"parsedFields\":"<<v.parsedfields<<",\"illuminant\":"<<v.illuminant<<",\"calibration\":[";for(int a=0;a<4;a++)for(int b=0;b<4;b++){if(a||b)out<<',';number(v.calibration[a][b]);}out<<"],\"colorMatrix\":[";for(int a=0;a<4;a++)for(int b=0;b<3;b++){if(a||b)out<<',';number(v.colormatrix[a][b]);}out<<"],\"forwardMatrix\":[";for(int a=0;a<3;a++)for(int b=0;b<4;b++){if(a||b)out<<',';number(v.forwardmatrix[a][b]);}out<<"]}";}
 const auto &l=c.dng_levels;out<<"],\"levels\":{\"parsedFields\":"<<l.parsedfields<<",\"black\":"<<l.dng_black<<",\"floatBlack\":";number(l.dng_fblack);out<<",\"blackPattern\":{\"rows\":"<<l.dng_cblack[4]<<",\"columns\":"<<l.dng_cblack[5]<<",\"channelBlack\":[";for(int k=0;k<4;k++){if(k)out<<',';out<<l.dng_cblack[k];}out<<"],\"values\":[";
 uint64_t dng_count=uint64_t(l.dng_cblack[4])*l.dng_cblack[5];if(dng_count>4096)return nullptr;for(unsigned k=0;k<dng_count;k++){if(k)out<<',';out<<l.dng_cblack[k+6];}out<<"]},\"floatBlackPattern\":{\"rows\":";number(l.dng_fcblack[4]);out<<",\"columns\":";number(l.dng_fcblack[5]);out<<",\"channelBlack\":[";for(int k=0;k<4;k++){if(k)out<<',';number(l.dng_fcblack[k]);}out<<"],\"values\":[";
 double dr=l.dng_fcblack[4],dc=l.dng_fcblack[5];if(!std::isfinite(dr)||!std::isfinite(dc)||dr<0||dc<0||std::floor(dr)!=dr||std::floor(dc)!=dc||dr*dc>4096)return nullptr;for(unsigned k=0;k<unsigned(dr*dc);k++){if(k)out<<',';number(l.dng_fcblack[k+6]);}out<<"]},\"whiteLevel\":[";for(int k=0;k<4;k++){if(k)out<<',';out<<l.dng_whitelevel[k];}out<<"],\"analogBalance\":[";for(int k=0;k<4;k++){if(k)out<<',';number(l.analogbalance[k]);}out<<"],\"asShotNeutral\":[";for(int k=0;k<4;k++){if(k)out<<',';number(l.asshotneutral[k]);}out<<"],\"defaultCrop\":[";for(int k=0;k<4;k++){if(k)out<<',';out<<l.default_crop[k];}out<<"],\"userCrop\":[";for(int k=0;k<4;k++){if(k)out<<',';number(l.user_crop[k]);}out<<"],\"baselineExposure\":";number(l.baseline_exposure);out<<",\"linearResponseLimit\":";number(l.LinearResponseLimit);out<<",\"opcodeByteLengths\":[";for(int k=0;k<3;k++){if(k)out<<',';out<<l.rawopcodes[k].len;}out<<"],\"opcodeBytesOwnedBy\":\"original-encoded-source\"}}";
 out<<",\"decoding\":{\"librawVersion\":"<<quote(LibRaw::version())<<",\"decoderName\":"<<quote(info.decoder_name)<<",\"decoderFlags\":"<<info.decoder_flags<<",\"rawOptions\":"<<d.rawparams.options<<",\"floatToInteger\":"<<((d.rawparams.options & LIBRAW_RAWOPTIONS_CONVERTFLOAT_TO_INT)?"true":"false")<<",\"warnings\":"<<d.process_warnings<<"}}";
 sensor_metadata=out.str();return sensor_metadata.c_str();
}
unsigned raw_native_sensor_metadata_size(){return unpacked?(unsigned)sensor_metadata.size():0;}
int raw_native_process(unsigned output_color,unsigned use_camera_wb,unsigned quality){
 if(!unpacked||output_color>8||output_color==5||quality>12)return 0;
 auto &p=decoder->imgdata.params;p.output_bps=16;p.output_color=(int)output_color;p.use_camera_wb=(int)!!use_camera_wb;p.use_auto_wb=0;p.no_auto_bright=1;p.bright=1.0;p.gamm[0]=p.gamm[1]=1.0;p.half_size=0;p.four_color_rgb=0;p.highlight=0;p.user_qual=(int)quality;p.med_passes=0;p.fbdd_noiserd=0;p.threshold=0.0;p.exp_correc=0;p.use_fuji_rotate=1;
 failure=decoder->dcraw_process();if(failure)return 0;const int colors=decoder->imgdata.idata.colors;if(colors!=1&&colors!=3){failure=LIBRAW_NOT_IMPLEMENTED;return 0;}decoder->linear_curve();processed=true;return 1;
}
unsigned raw_native_width(){if(!decoder)return 0;const auto &s=decoder->imgdata.sizes;return s.flip&4?s.height:s.width;}
unsigned raw_native_height(){if(!decoder)return 0;const auto &s=decoder->imgdata.sizes;return s.flip&4?s.width:s.height;}
unsigned raw_native_warnings(){return decoder?decoder->imgdata.process_warnings:0;}
const unsigned char *raw_native_profile_data(){return processed?decoder->profile():nullptr;}
unsigned raw_native_profile_size(){const auto *p=raw_native_profile_data();return p?(unsigned(p[0])<<24)|(unsigned(p[1])<<16)|(unsigned(p[2])<<8)|unsigned(p[3]):0;}
unsigned raw_native_rows(unsigned y,unsigned count,uint16_t *out){
 if(!processed||!out)return 0;const auto &d=decoder->imgdata;const unsigned width=raw_native_width(),height=raw_native_height(),sw=d.sizes.width,sh=d.sizes.height,colors=d.idata.colors,flip=d.sizes.flip;
 if(!count||y>=height||count>height-y)return 0;
 for(unsigned row=0;row<count;row++)for(unsigned x=0;x<width;x++){unsigned sy=y+row,sx=x;if(flip&4){unsigned tmp=sx;sx=sy;sy=tmp;}if(flip&2)sy=sh-1-sy;if(flip&1)sx=sw-1-sx;const auto &pixel=d.image[(size_t)sy*sw+sx];for(unsigned c=0;c<3;c++)out[((size_t)row*width+x)*3+c]=d.color.curve[pixel[colors==1?0:c]];}
 return width*count*3;
}
int raw_native_unpack_thumbnail(){if(!decoder)return 0;failure=decoder->unpack_thumb();return failure==0;}
unsigned raw_native_thumbnail_width(){return decoder?decoder->imgdata.thumbnail.twidth:0;}
unsigned raw_native_thumbnail_height(){return decoder?decoder->imgdata.thumbnail.theight:0;}
unsigned raw_native_thumbnail_format(){return decoder?decoder->imgdata.thumbnail.tformat:0;}
unsigned raw_native_thumbnail_size(){return decoder?decoder->imgdata.thumbnail.tlength:0;}
const unsigned char *raw_native_thumbnail_data(){return decoder?(unsigned char*)decoder->imgdata.thumbnail.thumb:nullptr;}
}
