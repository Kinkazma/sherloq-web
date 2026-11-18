// cc float-color-oracle.c -I/path/to/lcms/include -L/path/to/lcms/lib -llcms2 -o oracle
// oracle profile.icc source-float32.bin rgb|gray|cmyk rgb8|rgb16|xyz out.bin
// Sources are native-endian Float32; CMYK values are percentages0..100.
#include <lcms2.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
int main(int n,char**v){if(n!=6)return 2;FILE*f=fopen(v[1],"rb");if(!f)return 3;fseek(f,0,SEEK_END);long ps=ftell(f);rewind(f);void*p=malloc(ps);if(!p)return 4;fread(p,1,ps,f);fclose(f);unsigned channels=!strcmp(v[3],"rgb")?3:!strcmp(v[3],"cmyk")?4:!strcmp(v[3],"gray")?1:0;if(!channels)return 5;cmsUInt32Number input=channels==3?TYPE_RGB_FLT:channels==4?TYPE_CMYK_FLT:TYPE_GRAY_FLT,output=!strcmp(v[4],"rgb8")?TYPE_RGB_8:!strcmp(v[4],"rgb16")?TYPE_RGB_16:TYPE_XYZ_FLT;unsigned bytes=output==TYPE_RGB_8?1:output==TYPE_RGB_16?2:4;cmsHPROFILE a=cmsOpenProfileFromMem(p,ps),b=output==TYPE_XYZ_FLT?cmsCreateXYZProfile():cmsCreate_sRGBProfile();cmsHTRANSFORM t=cmsCreateTransform(a,input,b,output,INTENT_RELATIVE_COLORIMETRIC,0);if(!t)return 6;f=fopen(v[2],"rb");if(!f)return 7;fseek(f,0,SEEK_END);long size=ftell(f);rewind(f);if(size<=0||size%(channels*4))return 8;unsigned pixels=size/(channels*4);void*s=malloc(size),*d=malloc((size_t)pixels*3*bytes);if(!s||!d)return 9;fread(s,1,size,f);fclose(f);cmsDoTransform(t,s,d,pixels);f=fopen(v[5],"wb");if(!f)return 10;fwrite(d,1,(size_t)pixels*3*bytes,f);fclose(f);cmsDeleteTransform(t);cmsCloseProfile(a);cmsCloseProfile(b);free(p);free(s);free(d);return 0;}
