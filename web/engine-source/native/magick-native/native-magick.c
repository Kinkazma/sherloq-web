/* Private native-precision decoder prototype. ImageMagick public C API only. */
#include <emscripten/emscripten.h>
#include <stdint.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>
#include "MagickCore/MagickCore.h"

#if (MAGICKCORE_QUANTUM_DEPTH != 16 && MAGICKCORE_QUANTUM_DEPTH != 32) || !defined(MAGICKCORE_HDRI_SUPPORT)
#error "The native reader requires an HDRI core with the declared quantum precision."
#endif

static Image *current = NULL;
static ExceptionInfo *exception_info = NULL;
static int initialized = 0;
static char error_text[2048];
unsigned native_magick_alpha(void);

static void close_image(void) {
  if (current != NULL) current = DestroyImageList(current);
}

static void save_error(const char *fallback) {
  const char *reason = exception_info && exception_info->reason
    ? exception_info->reason : fallback;
  const char *description = exception_info && exception_info->description
    ? exception_info->description : "";
  snprintf(error_text, sizeof(error_text), "%s%s%s", reason,
    *description ? ": " : "", description);
}

EMSCRIPTEN_KEEPALIVE int native_magick_init(void) {
  if (!initialized) {
    MagickCoreGenesis("", MagickFalse);
    exception_info = AcquireExceptionInfo();
    initialized = 1;
  }
  return sizeof(Quantum) == (MAGICKCORE_QUANTUM_DEPTH == 32 ? sizeof(double) : sizeof(float));
}

EMSCRIPTEN_KEEPALIVE void native_magick_close(void) { close_image(); }

EMSCRIPTEN_KEEPALIVE void native_magick_dispose(void) {
  close_image();
  if (exception_info) exception_info = DestroyExceptionInfo(exception_info);
  if (initialized) MagickCoreTerminus();
  initialized = 0;
}

EMSCRIPTEN_KEEPALIVE int native_magick_set_budget(double memory_bytes) {
  if (!initialized || memory_bytes < 0 || memory_bytes > 4294967295.0) return 0;
  return SetMagickResourceLimit(MemoryResource, (MagickSizeType)memory_bytes)
    && SetMagickResourceLimit(MapResource, 0)
    && SetMagickResourceLimit(DiskResource, 0)
    && SetMagickResourceLimit(ThreadResource, 1)
    /* This particular upstream resource uses size < limit, not <=. */
    && SetMagickResourceLimit(ListLengthResource, 2);
}

#ifdef SHERLOQ_PAGED_CACHE
EMSCRIPTEN_KEEPALIVE int native_magick_set_cache_budget(double memory_bytes,
  double backing_bytes) {
  if (!(backing_bytes >= 0.0 && backing_bytes <= 9007199254740991.0)) return 0;
  if (!native_magick_set_budget(memory_bytes)) return 0;
  if (setenv("MAGICK_TEMPORARY_PATH", "/native-cache", 1) != 0) return 0;
  /* Upstream admission compares current < limit. These inclusive parent
     allowances fund exactly their bytes; +1 is a comparison sentinel only. */
  return SetMagickResourceLimit(MemoryResource, (MagickSizeType)memory_bytes+1)
    && SetMagickResourceLimit(DiskResource, (MagickSizeType)backing_bytes+1);
}
EMSCRIPTEN_KEEPALIVE int native_magick_async_cache(void) { return 1; }
EMSCRIPTEN_KEEPALIVE unsigned native_magick_cache_type(void) {
  return current ? GetImagePixelCacheType(current) : UndefinedCache;
}
#endif

static int read_image(const unsigned char *bytes, size_t length,
  const char *format, int ping, int source_file) {
  ImageInfo *info;
  close_image();
  error_text[0] = '\0';
  if (!initialized || (!source_file && (!bytes || !length)) || !format) return 0;
  for (const char *p = format; *p; ++p)
    if (!((*p >= 'A' && *p <= 'Z') || (*p >= '0' && *p <= '9'))) return 0;
  ClearMagickException(exception_info);
  info = AcquireImageInfo();
  CopyMagickString(info->magick, format, MagickPathExtent);
  info->scene = 0;
  info->number_scenes = 1;
  info->ping = ping ? MagickTrue : MagickFalse;
  if (source_file) {
    CopyMagickString(info->filename, "/native-source/original", MagickPathExtent);
    current = ReadImage(info, exception_info);
  } else current = ping ? PingBlob(info, bytes, length, exception_info)
                       : BlobToImage(info, bytes, length, exception_info);
  info = DestroyImageInfo(info);
  if (!current) { save_error("Image decoding failed."); return 0; }
  current = GetFirstImageInList(current);
  return 1;
}

EMSCRIPTEN_KEEPALIVE int native_magick_probe(const unsigned char *bytes,
  size_t length, const char *format) {
  return read_image(bytes, length, format, 1, 0);
}

EMSCRIPTEN_KEEPALIVE int native_magick_open(const unsigned char *bytes,
  size_t length, const char *format) {
  return read_image(bytes, length, format, 0, 0);
}

EMSCRIPTEN_KEEPALIVE int native_magick_probe_file(const char *format) {
  return read_image(NULL, 0, format, 1, 1);
}
EMSCRIPTEN_KEEPALIVE int native_magick_open_file(const char *format) {
  return read_image(NULL, 0, format, 0, 1);
}

EMSCRIPTEN_KEEPALIVE const char *native_magick_error(void) { return error_text; }
EMSCRIPTEN_KEEPALIVE int native_magick_quantum_depth(void) { return MAGICKCORE_QUANTUM_DEPTH; }
EMSCRIPTEN_KEEPALIVE int native_magick_quantum_bytes(void) { return sizeof(Quantum); }
EMSCRIPTEN_KEEPALIVE const char *native_magick_version(void) { return GetMagickVersion(NULL); }
EMSCRIPTEN_KEEPALIVE unsigned native_magick_width(void) { return current ? current->columns : 0; }
EMSCRIPTEN_KEEPALIVE unsigned native_magick_height(void) { return current ? current->rows : 0; }
EMSCRIPTEN_KEEPALIVE unsigned native_magick_source_depth(void) {
  const char *value = current ? GetImageProperty(current, "native:color-depth", exception_info) : NULL;
  return value ? strtoul(value, NULL, 10) : current ? current->depth : 0;
}
EMSCRIPTEN_KEEPALIVE unsigned native_magick_alpha_depth(void) {
  const char *value = current ? GetImageProperty(current, "native:alpha-depth", exception_info) : NULL;
  return value ? strtoul(value, NULL, 10) : native_magick_alpha() ? native_magick_source_depth() : 0;
}
EMSCRIPTEN_KEEPALIVE unsigned native_magick_orientation(void) { return current ? current->orientation : 0; }
EMSCRIPTEN_KEEPALIVE unsigned native_magick_alpha(void) {
  return current && (current->alpha_trait & BlendPixelTrait) != 0;
}
EMSCRIPTEN_KEEPALIVE unsigned native_magick_colorspace(void) { return current ? current->colorspace : 0; }
EMSCRIPTEN_KEEPALIVE const char *native_magick_colorspace_name(void) {
  return current ? CommandOptionToMnemonic(MagickColorspaceOptions,
    current->colorspace) : "Undefined";
}
EMSCRIPTEN_KEEPALIVE unsigned native_magick_model(void) {
  if (!current) return 0;
  if (current->colorspace == CMYKColorspace) return 4;
  if (current->colorspace == GRAYColorspace
      || current->colorspace == LinearGRAYColorspace) return 1;
  return 3;
}
EMSCRIPTEN_KEEPALIVE unsigned native_magick_source_float(void) {
  const char *value;
  if (!current) return 0;
  value = GetImageProperty(current, "quantum:format", exception_info);
  return value && strcmp(value, "floating-point") == 0;
}
EMSCRIPTEN_KEEPALIVE const char *native_magick_property(const char *name) {
  return current ? GetImageProperty(current, name, exception_info) : NULL;
}
EMSCRIPTEN_KEEPALIVE unsigned native_magick_profile_size(void) {
  const StringInfo *icc = current ? GetImageProfile(current, "icc") : NULL;
  if (!icc && current) icc = GetImageProfile(current, "icm");
  return icc ? GetStringInfoLength(icc) : 0;
}
EMSCRIPTEN_KEEPALIVE const unsigned char *native_magick_profile_data(void) {
  const StringInfo *icc = current ? GetImageProfile(current, "icc") : NULL;
  if (!icc && current) icc = GetImageProfile(current, "icm");
  return icc ? GetStringInfoDatum(icc) : NULL;
}
EMSCRIPTEN_KEEPALIVE double native_magick_chromaticity(unsigned component) {
  if (!current) return 0;
  const ChromaticityInfo *c = &current->chromaticity;
  switch (component) {
    case 0: return c->red_primary.x; case 1: return c->red_primary.y;
    case 2: return c->green_primary.x; case 3: return c->green_primary.y;
    case 4: return c->blue_primary.x; case 5: return c->blue_primary.y;
    case 6: return c->white_point.x; case 7: return c->white_point.y;
    default: return 0;
  }
}

EMSCRIPTEN_KEEPALIVE int native_magick_export(unsigned y, unsigned rows,
  const char *layout, unsigned storage, void *output) {
  if (!current || !output || !layout || !rows || y >= current->rows
      || rows > current->rows - y) return 0;
  if (strcmp(layout, "RGB") && strcmp(layout, "RGBA") && strcmp(layout, "I")
      && strcmp(layout, "IA") && strcmp(layout, "CMYK") && strcmp(layout, "CMYKA")) return 0;
  if (native_magick_source_float() && storage != 1 && storage != 2) {
    snprintf(error_text, sizeof(error_text), "A floating source must not use a bounded integer export.");
    return 0;
  }
  ClearMagickException(exception_info);
  if (storage > 3) return 0;
  const StorageType type = storage == 0 ? ShortPixel : storage == 1 ? FloatPixel
    : storage == 2 ? DoublePixel : LongPixel;
  if (ExportImagePixels(current, 0, y, current->columns, rows, layout,
      type, output, exception_info) == MagickFalse) {
    save_error("Native pixel export failed.");
    return 0;
  }
  return 1;
}
