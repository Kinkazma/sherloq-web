"""Apply metadata and numerical I/O precision fixes to the private pinned Core."""
from pathlib import Path
import difflib, hashlib, json, os, tarfile
ROOT = Path(os.environ['NATIVE_MAGICK_BUILD_ROOT']).resolve()
IM = ROOT / 'sources/imagemagick'
changes = {}
archive=ROOT/'archives/imagemagick.tar.gz'
expected=json.loads((ROOT/'SOURCE-ARCHIVES.json').read_text())['imagemagick']
if hashlib.sha256(archive.read_bytes()).hexdigest()!=expected['sha256']:
    raise ValueError('Pinned ImageMagick source archive differs')
source=tarfile.open(archive)
source_prefix=source.getmembers()[0].name.split('/')[0]

def replace(name, old, new, count=1):
    path = IM / name
    if name not in changes:
        original = source.extractfile(source_prefix+'/'+name).read().decode()
        changes[name] = [original, original]
    original, value = changes[name]
    if value.count(old) != count:
        raise ValueError(f'Pinned source context differs in {name}: {old[:60]}')
    changes[name][1] = value.replace(old, new)

# A floating JXL must request Float32 from libjxl, not the bounded UINT16
# chosen from bits_per_sample alone, nor Float16 bytes imported as Float32.
replace('coders/jxl.c',
        'static inline void JXLInitImage(Image *image,JxlBasicInfo *basic_info)',
        'static inline void JXLInitImage(Image *image,JxlBasicInfo *basic_info,\n  ExceptionInfo *exception)')
replace('coders/jxl.c',
        '  image->depth=basic_info->bits_per_sample;',
        '  image->depth=MagickMax(basic_info->bits_per_sample,basic_info->alpha_bits);\n'
        '  (void) FormatImageProperty(image,"native:color-depth","%u",basic_info->bits_per_sample);\n'
        '  (void) FormatImageProperty(image,"native:alpha-depth","%u",basic_info->alpha_bits);\n'
        '  if (basic_info->exponent_bits_per_sample != 0 ||\n'
        '      basic_info->alpha_exponent_bits != 0)\n'
        '    (void) SetImageProperty(image,"quantum:format","floating-point",exception);')
replace('coders/jxl.c', 'JXLInitImage(image,&basic_info);',
        'JXLInitImage(image,&basic_info,exception);', 2)
replace('coders/jxl.c', '        JXLSetFormat(image,&pixel_format,exception);',
        '        JXLSetFormat(image,&pixel_format,exception);\n'
        '        if (basic_info.exponent_bits_per_sample != 0 || basic_info.alpha_exponent_bits != 0)\n'
        '          pixel_format.data_type=JXL_TYPE_FLOAT;', 2)
replace('coders/pnm.c',
        '        image->endian=quantum_scale < 0.0 ? LSBEndian : MSBEndian;\n        image->depth=32;\n        quantum_info=AcquireQuantumInfo(image_info,image);',
        '        image->endian=quantum_scale < 0.0 ? LSBEndian : MSBEndian;\n'
        '        image->depth=32;\n'
        '        (void) SetImageProperty(image,"quantum:format","floating-point",exception);\n'
        '        quantum_info=AcquireQuantumInfo(image_info,image);')

replace('coders/psd.c', '  image->depth=psd_info.depth;',
        '  image->depth=psd_info.depth;\n'
        '  if (psd_info.depth > 16)\n'
        '    (void) SetImageProperty(image,"quantum:format","floating-point",exception);')

# Determine declared alpha before the first cache allocation as well as Ping.
# The later QuantumInfo association/deassociation policy remains unchanged.
replace('coders/tiff.c',
        '    if ((photometric == PHOTOMETRIC_MINISBLACK) ||\n'
        '        (photometric == PHOTOMETRIC_MINISWHITE))\n'
        '      (void) SetImageColorspace(image,GRAYColorspace,exception);',
        '    (void) TIFFGetFieldDefaulted(tiff,TIFFTAG_EXTRASAMPLES,&extra_samples,&sample_info,sans);\n'
        '    if (extra_samples == 0 && samples_per_pixel == 4 && photometric == PHOTOMETRIC_RGB)\n'
        '      image->alpha_trait=BlendPixelTrait;\n'
        '    for (i=0; i < extra_samples; ++i)\n'
        '      if (sample_info[i] == EXTRASAMPLE_ASSOCALPHA || sample_info[i] == EXTRASAMPLE_UNASSALPHA)\n'
        '        image->alpha_trait=BlendPixelTrait;\n'
        '    if (extra_samples && IsStringTrue(GetImageOption(image_info,"tiff:assume-alpha")) != MagickFalse)\n'
        '      image->alpha_trait=BlendPixelTrait;\n'
        '    if ((photometric == PHOTOMETRIC_MINISBLACK) ||\n'
        '        (photometric == PHOTOMETRIC_MINISWHITE))\n'
        '      (void) SetImageColorspace(image,GRAYColorspace,exception);')

# Float source values are scaled into the chosen Quantum domain. Q32-HDRI
# uses double Quantum storage: clipping that intermediate to FLT_MAX loses
# valid finite Float32 inputs long before their native cache is reached.
# Q8/Q16 and non-HDRI keep their exact existing float arithmetic and bounds.
replace('MagickCore/quantum-import.c',
        'static inline float ScaleFloatPixel(const QuantumInfo *quantum_info,',
        '#if defined(MAGICKCORE_HDRI_SUPPORT) && (MAGICKCORE_QUANTUM_DEPTH == 32)\n'
        'typedef double ScaledFloatQuantum;\n'
        '#else\n'
        'typedef float ScaledFloatQuantum;\n'
        '#endif\n\n'
        'static inline ScaledFloatQuantum ScaleFloatPixel(const QuantumInfo *quantum_info,')
replace('MagickCore/quantum-import.c',
        '  if (pixel < (double) -FLT_MAX)\n    return(-FLT_MAX);\n'
        '  if (pixel > (double) FLT_MAX)\n    return(FLT_MAX);\n  return((float) pixel);',
        '#if !defined(MAGICKCORE_HDRI_SUPPORT) || (MAGICKCORE_QUANTUM_DEPTH != 32)\n'
        '  if (pixel < (double) -FLT_MAX)\n    return(-FLT_MAX);\n'
        '  if (pixel > (double) FLT_MAX)\n    return(FLT_MAX);\n'
        '#endif\n  return((ScaledFloatQuantum) pixel);')
replace('MagickCore/quantum-import.c','  float *pixel)',
        '  ScaledFloatQuantum *pixel)',2)
replace('MagickCore/quantum-import.c','          float\n            pixel;',
        '          ScaledFloatQuantum\n            pixel;',32)

# HEIC10/12 previously left-shifted into a16-bit container whose white
# was65472/65520. Keep every source code, but use the common full-range
# normalization required by the native16/CMS surface contract.
replace('coders/heic.c', 'ScaleShortToQuantum(pixel)',
        'ScaleAnyToQuantum(pixel,GetQuantumRange(image->depth) << shift)', 8)

# EXR Ping must describe the source channel type rather than inherited Q8
# defaults, and must retain declared linear chromaticities before any CMS.
old='  result=exr_get_data_window(ctxt,part_index,&data_window);'
new='''  {
    const exr_attr_chlist_t *channels=NULL;
    exr_attr_chromaticities_t chroma;
    if (exr_get_channels(ctxt,part_index,&channels) == EXR_ERR_SUCCESS && channels)
      {
        int c,has_rgb=0,has_y=0;
        unsigned color_depth=0,alpha_depth=0;
        image->depth=0;
        for (c=0; c < channels->num_channels; ++c)
          {
            const exr_pixel_type_t type=channels->entries[c].pixel_type;
            const unsigned depth=type == EXR_PIXEL_HALF ? 16 : 32;
            const char *name=channels->entries[c].name.str;
            const char *last=strrchr(name,'.');
            if (last) name=last+1;
            image->depth=MagickMax(image->depth,depth);
            if (strcmp(name,"A") == 0)
              {image->alpha_trait=BlendPixelTrait;alpha_depth=depth;}
            else color_depth=MagickMax(color_depth,depth);
            if (strcmp(name,"R") == 0 || strcmp(name,"G") == 0 || strcmp(name,"B") == 0) has_rgb=1;
            if (strcmp(name,"Y") == 0) has_y=1;
          }
        (void) SetImageProperty(image,"quantum:format","floating-point",exception);
        image->colorspace=RGBColorspace;
        if (has_y && !has_rgb) image->colorspace=LinearGRAYColorspace;
        (void) FormatImageProperty(image,"native:color-depth","%u",color_depth);
        (void) FormatImageProperty(image,"native:alpha-depth","%u",alpha_depth);
      }
    if (exr_attr_get_chromaticities(ctxt,part_index,"chromaticities",&chroma)
        == EXR_ERR_SUCCESS)
      {
        image->chromaticity.red_primary.x=chroma.red_x;
        image->chromaticity.red_primary.y=chroma.red_y;
        image->chromaticity.green_primary.x=chroma.green_x;
        image->chromaticity.green_primary.y=chroma.green_y;
        image->chromaticity.blue_primary.x=chroma.blue_x;
        image->chromaticity.blue_primary.y=chroma.blue_y;
        image->chromaticity.white_point.x=chroma.white_x;
        image->chromaticity.white_point.y=chroma.white_y;
        (void) SetImageProperty(image,"native:chromaticities","declared",exception);
      }
  }
  result=exr_get_data_window(ctxt,part_index,&data_window);'''
replace('coders/exr.c',old,new)
replace('coders/exr.c','image->colorspace=GRAYColorspace;',
        'image->colorspace=LinearGRAYColorspace;')
replace('coders/exr.c','(data_window.min.x >= data_window.max.x) ||\n      (data_window.min.y >= data_window.max.y)',
        '(data_window.min.x > data_window.max.x) ||\n      (data_window.min.y > data_window.max.y)')
records={};patch=[]
for name,(before,after) in changes.items():
    patch += difflib.unified_diff(before.splitlines(keepends=True),after.splitlines(keepends=True),'a/'+name,'b/'+name)
    records[name]={'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),
                   'afterSha256':hashlib.sha256(after.encode()).hexdigest()}
    if (IM/name).read_text()!=after:(IM/name).write_text(after)
(ROOT/'source-metadata.patch').write_text(''.join(patch))
(ROOT/'SOURCE-PATCHES.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(records,indent=2))
