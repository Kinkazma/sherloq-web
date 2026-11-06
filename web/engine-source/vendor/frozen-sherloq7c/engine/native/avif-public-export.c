// Public SDR-content AVIF encoder. Standard sRGB -> BT.2020 -> ST 2084 only.
// No private proxy/gain-map code or synthetic HDR highlights are included.
#include <avif/avif.h>
#include <emscripten/emscripten.h>
#include <math.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

static avifImage *image;
static avifRWData output=AVIF_DATA_EMPTY;
static avifResult failure=AVIF_RESULT_OK;
static char diagnosis[512];
static double linear[256],pq[65537];
static uint16_t *band;
static int next_row;
static int exact_rgb;

EMSCRIPTEN_KEEPALIVE void public_avif_close(void){
    avifImageDestroy(image);image=NULL;free(band);band=NULL;
    avifRWDataFree(&output);next_row=0;
}
EMSCRIPTEN_KEEPALIVE const char *public_avif_error(void){return diagnosis[0]?diagnosis:avifResultToString(failure);}
static uint16_t quantize(double v){
    double x=fmin(65536.,fmax(0.,v*65536.));int i=(int)x;
    double p=pq[i]+(i<65536?(pq[i+1]-pq[i])*(x-i):0.);
    return (uint16_t)lround(p*1023.);
}
EMSCRIPTEN_KEEPALIVE int public_avif_open(int w,int h,int chroma,int lossless){
    public_avif_close();diagnosis[0]=0;failure=AVIF_RESULT_INVALID_ARGUMENT;
    exact_rgb=lossless!=0;
    if(w<1||h<1||w>65500||h>65500||(uint64_t)w*h>268435456)return 0;
    avifPixelFormat format=chroma==444?AVIF_PIXEL_FORMAT_YUV444:chroma==422?AVIF_PIXEL_FORMAT_YUV422:chroma==420?AVIF_PIXEL_FORMAT_YUV420:AVIF_PIXEL_FORMAT_NONE;
    if(format==AVIF_PIXEL_FORMAT_NONE)return 0;
    image=avifImageCreate(w,h,exact_rgb?8:10,exact_rgb?AVIF_PIXEL_FORMAT_YUV444:format);if(!image){failure=AVIF_RESULT_OUT_OF_MEMORY;return 0;}
    image->colorPrimaries=exact_rgb?AVIF_COLOR_PRIMARIES_BT709:AVIF_COLOR_PRIMARIES_BT2020;
    image->transferCharacteristics=exact_rgb?AVIF_TRANSFER_CHARACTERISTICS_SRGB:AVIF_TRANSFER_CHARACTERISTICS_PQ;
    image->matrixCoefficients=exact_rgb?AVIF_MATRIX_COEFFICIENTS_IDENTITY:AVIF_MATRIX_COEFFICIENTS_BT2020_NCL;
    image->yuvRange=AVIF_RANGE_FULL;
    failure=avifImageAllocatePlanes(image,AVIF_PLANES_YUV);if(failure!=AVIF_RESULT_OK)return 0;
    if(exact_rgb)return 1;
    band=malloc((size_t)w*32*3*sizeof(uint16_t));if(!band){failure=AVIF_RESULT_OUT_OF_MEMORY;return 0;}
    for(int i=0;i<256;i++){double s=i/255.;linear[i]=s<=.04045?s/12.92:pow((s+.055)/1.055,2.4);}
    for(int i=0;i<=65536;i++){double p=pow((i/65536.)*203./10000.,2610./16384.);pq[i]=pow((3424./4096.+2413./128.*p)/(1.+2392./128.*p),2523./32.);}
    return 1;
}
EMSCRIPTEN_KEEPALIVE int public_avif_rows(const uint8_t *rgb,int rows){
    failure=AVIF_RESULT_INVALID_ARGUMENT;if(!image||!rgb||rows<1||rows>32||next_row+rows>(int)image->height)return 0;
    if(image->yuvFormat==AVIF_PIXEL_FORMAT_YUV420&&rows%2&&next_row+rows!=(int)image->height)return 0;
    size_t count=(size_t)image->width*rows;
    // Full-range identity AVIF stores GBR unchanged. PQ conversion, even at
    // AV1 quality 100, would not preserve the input sRGB bytes losslessly.
    if(exact_rgb){
        const int channels[3]={1,2,0};
        for(int p=0;p<3;p++)for(int y=0;y<rows;y++){
            uint8_t *dest=image->yuvPlanes[p]+(next_row+y)*image->yuvRowBytes[p];
            for(uint32_t x=0;x<image->width;x++)dest[x]=rgb[((size_t)y*image->width+x)*3+channels[p]];
        }
        next_row+=rows;return 1;
    }
    for(size_t i=0;i<count;i++){
        double r=linear[rgb[i*3]],g=linear[rgb[i*3+1]],b=linear[rgb[i*3+2]];
        band[i*3]=quantize(.627403895934699*r+.329283038377883*g+.043313065687418*b);
        band[i*3+1]=quantize(.069097289358232*r+.919540395075459*g+.011362315566309*b);
        band[i*3+2]=quantize(.016391438875150*r+.088013307877226*g+.895595253247624*b);
    }
    // RGBToYUV takes ownership of its output planes. Use an independent small
    // band, never a view into the retained image (which would free its planes).
    avifImage *part=avifImageCreate(image->width,rows,10,image->yuvFormat);
    if(!part){failure=AVIF_RESULT_OUT_OF_MEMORY;return 0;}
    part->colorPrimaries=image->colorPrimaries;part->transferCharacteristics=image->transferCharacteristics;
    part->matrixCoefficients=image->matrixCoefficients;part->yuvRange=image->yuvRange;
    avifRGBImage pixels;avifRGBImageSetDefaults(&pixels,part);pixels.format=AVIF_RGB_FORMAT_RGB;pixels.depth=10;pixels.rowBytes=image->width*6;pixels.pixels=(uint8_t*)band;pixels.avoidLibYUV=AVIF_TRUE;pixels.maxThreads=1;
    failure=avifImageRGBToYUV(part,&pixels);
    if(failure==AVIF_RESULT_OK){avifPixelFormatInfo info;avifGetPixelFormatInfo(image->yuvFormat,&info);
        for(int plane=0;plane<3;plane++){int xs=plane?info.chromaShiftX:0,ys=plane?info.chromaShiftY:0;
            size_t columns=(image->width+((1<<xs)-1))>>xs,lines=(rows+((1<<ys)-1))>>ys;
            for(size_t y=0;y<lines;y++)memcpy(image->yuvPlanes[plane]+((next_row>>ys)+y)*image->yuvRowBytes[plane],part->yuvPlanes[plane]+y*part->yuvRowBytes[plane],columns*2);
        }
    }
    avifImageDestroy(part);if(failure!=AVIF_RESULT_OK)return 0;next_row+=rows;return 1;
}
EMSCRIPTEN_KEEPALIVE int public_avif_encode(int quality,int threads){
    failure=AVIF_RESULT_INVALID_ARGUMENT;if(!image||next_row!=(int)image->height||quality<1||quality>100||threads<1||threads>64)return 0;
    avifEncoder *encoder=avifEncoderCreate();if(!encoder){failure=AVIF_RESULT_OUT_OF_MEMORY;return 0;}
    encoder->codecChoice=AVIF_CODEC_CHOICE_AOM;encoder->maxThreads=threads;encoder->quality=exact_rgb?100:quality;encoder->qualityAlpha=100;encoder->speed=6;encoder->autoTiling=AVIF_TRUE;
    failure=avifEncoderSetCodecSpecificOption(encoder,"tune","psnr");
    if(failure==AVIF_RESULT_OK){
        if(image->width<=2048 && image->height<=2048)failure=avifEncoderWrite(encoder,image,&output);
        else{
            const uint32_t columns=(image->width+2047)/2048,rows=(image->height+2047)/2048,count=columns*rows;
            // Cells share immutable parent YUV planes. libaom retires the
            // single-image encoder after each cell, reusing bounded workspace.
            avifImage **cells=calloc(count,sizeof(*cells));
            if(!cells)failure=AVIF_RESULT_OUT_OF_MEMORY;
            for(uint32_t i=0;cells && i<count && failure==AVIF_RESULT_OK;i++){
                uint32_t x=(i%columns)*2048,y=(i/columns)*2048;
                avifCropRect rect={x,y,image->width-x<2048?image->width-x:2048,image->height-y<2048?image->height-y:2048};
                cells[i]=avifImageCreateEmpty();if(!cells[i]){failure=AVIF_RESULT_OUT_OF_MEMORY;break;}
                failure=avifImageSetViewRect(cells[i],image,&rect);
            }
            if(failure==AVIF_RESULT_OK)failure=avifEncoderAddImageGrid(encoder,columns,rows,(const avifImage * const *)cells,AVIF_ADD_IMAGE_FLAG_SINGLE);
            if(failure==AVIF_RESULT_OK)failure=avifEncoderFinish(encoder,&output);
            if(cells){for(uint32_t i=0;i<count;i++)avifImageDestroy(cells[i]);free(cells);}
        }
    }
    if(failure!=AVIF_RESULT_OK)snprintf(diagnosis,sizeof(diagnosis),"%s: %s",avifResultToString(failure),encoder->diag.error);
    avifEncoderDestroy(encoder);return failure==AVIF_RESULT_OK;
}
EMSCRIPTEN_KEEPALIVE const uint8_t *public_avif_output(void){return output.data;}
EMSCRIPTEN_KEEPALIVE size_t public_avif_size(void){return output.size;}
