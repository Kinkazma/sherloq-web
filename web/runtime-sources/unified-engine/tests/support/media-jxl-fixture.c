#include <jxl/encode.h>
#include <jxl/color_encoding.h>
#include <stdio.h>
#include <stdlib.h>
#define CHECK(x) do {if((x)!=JXL_ENC_SUCCESS)return 2;} while(0)
int main(int argc,char**argv){
 JxlEncoder* enc=JxlEncoderCreate(NULL);JxlBasicInfo info;JxlEncoderInitBasicInfo(&info);info.xsize=257;info.ysize=193;info.bits_per_sample=8;info.uses_original_profile=JXL_TRUE;CHECK(JxlEncoderSetBasicInfo(enc,&info));
 JxlColorEncoding color;JxlColorEncodingSetToSRGB(&color,JXL_FALSE);CHECK(JxlEncoderSetColorEncoding(enc,&color));JxlEncoderFrameSettings* opts=JxlEncoderFrameSettingsCreate(enc,NULL);CHECK(JxlEncoderSetFrameLossless(opts,JXL_TRUE));
 FILE* in=fopen(argv[1],"rb");unsigned char* pixels=malloc(257*193*3);fseek(in,-257*193*3,SEEK_END);if(fread(pixels,1,257*193*3,in)!=257*193*3)return 3;fclose(in);
 JxlPixelFormat fmt={3,JXL_TYPE_UINT8,JXL_NATIVE_ENDIAN,0};CHECK(JxlEncoderAddImageFrame(opts,&fmt,pixels,257*193*3));JxlEncoderCloseInput(enc);
 unsigned char* output=malloc(4*1024*1024),*next=output;size_t avail=4*1024*1024;CHECK(JxlEncoderProcessOutput(enc,&next,&avail));FILE* out=fopen(argv[2],"wb");fwrite(output,1,next-output,out);fclose(out);JxlEncoderDestroy(enc);free(pixels);free(output);return 0;
}
