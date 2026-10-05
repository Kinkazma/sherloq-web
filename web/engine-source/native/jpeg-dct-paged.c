/* Stored coefficients through libjpeg's original virtual-array memory manager.
 * Only the system backing-store boundary changes; entropy decoding, coefficient
 * ordering, complete-block selection and quantization tables remain native. */
#define JPEG_INTERNALS
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <setjmp.h>
#include "jpeglib.h"
#include "jerror.h"
#include "jmemsys.h"
#include <emscripten.h>

EM_ASYNC_JS(int, encoded_read, (unsigned char *ptr, unsigned size), {
 try { return await Module['readEncoded'](ptr, size); }
 catch (error) { Module['ioFailure'] = error; return -1; }
});
EM_ASYNC_JS(int, backing_open, (unsigned size), {
 try { return await Module['openBacking'](size); }
 catch (error) { Module['ioFailure'] = error; return 0; }
});
EM_ASYNC_JS(int, backing_io, (int id, unsigned char *ptr, unsigned offset, unsigned size, int writing), {
 try { await Module['backingIO'](id, ptr, offset, size, writing); return 1; }
 catch (error) { Module['ioFailure'] = error; return 0; }
});
EM_ASYNC_JS(void, backing_close, (int id), {
 try { await Module['closeBacking'](id); }
 catch (error) { Module['ioFailure'] ??= error; }
});
EM_ASYNC_JS(int, report_rows, (unsigned completed, unsigned total), {
 try { await Module['reportRows'](completed, total); return 1; }
 catch (error) { Module['ioFailure'] = error; return 0; }
});
EM_ASYNC_JS(int, decoded_write, (unsigned char *ptr, double offset, unsigned length), {
 try { await Module['writeDecoded'](ptr, offset, length); return 1; }
 catch (error) { Module['ioFailure'] = error; return 0; }
});

void *jpeg_get_small(j_common_ptr c, size_t n) { return malloc(n); }
void jpeg_free_small(j_common_ptr c, void *p, size_t n) { free(p); }
void *jpeg_get_large(j_common_ptr c, size_t n) { return malloc(n); }
void jpeg_free_large(j_common_ptr c, void *p, size_t n) { free(p); }
size_t jpeg_mem_available(j_common_ptr c, size_t minimum, size_t maximum, size_t allocated) {
 return c->mem->max_memory_to_use > allocated ? c->mem->max_memory_to_use - allocated : 0;
}
static void store_read(j_common_ptr c, backing_store_ptr info, void *buffer, long offset, long size) {
 if (offset < 0 || size < 0 || !backing_io((int)(uintptr_t)info->temp_file, buffer, offset, size, 0)) ERREXIT(c, JERR_FILE_READ);
}
static void store_write(j_common_ptr c, backing_store_ptr info, void *buffer, long offset, long size) {
 if (offset < 0 || size < 0 || !backing_io((int)(uintptr_t)info->temp_file, buffer, offset, size, 1)) ERREXIT(c, JERR_FILE_WRITE);
}
static void store_close(j_common_ptr c, backing_store_ptr info) { backing_close((int)(uintptr_t)info->temp_file); }
void jpeg_open_backing_store(j_common_ptr c, backing_store_ptr info, long size) {
 int id = size > 0 ? backing_open(size) : 0;
 if (!id) ERREXIT(c, JERR_TFILE_CREATE);
 info->temp_file = (FILE *)(uintptr_t)id;
 info->read_backing_store = store_read; info->write_backing_store = store_write; info->close_backing_store = store_close;
}
long jpeg_mem_init(j_common_ptr c) { return 8 * 1024 * 1024; }
void jpeg_mem_term(j_common_ptr c) {}

static struct jpeg_decompress_struct decoder;
static struct { struct jpeg_error_mgr pub; jmp_buf jump; } error;
static struct jpeg_source_mgr source;
static unsigned char input[65536];
static unsigned char *decoded_rows;
static int failed;
static void fail(j_common_ptr c) { failed = c->err->msg_code == JERR_OUT_OF_MEMORY ? 2 : 1; longjmp(error.jump, 1); }
static void init_input(j_decompress_ptr c) {}
static boolean fill_input(j_decompress_ptr c) {
 int n = encoded_read(input, sizeof(input));
 if (n <= 0 || n > sizeof(input)) ERREXIT(c, JERR_INPUT_EOF);
 c->src->next_input_byte = input; c->src->bytes_in_buffer = n; return TRUE;
}
static void skip_input(j_decompress_ptr c, long n) {
 if (n <= 0) return;
 while ((size_t)n > c->src->bytes_in_buffer) { n -= c->src->bytes_in_buffer; fill_input(c); }
 c->src->next_input_byte += n; c->src->bytes_in_buffer -= n;
}
static void term_input(j_decompress_ptr c) {}
void dct_paged_close(void) { if (decoder.mem) jpeg_destroy_decompress(&decoder); free(decoded_rows); decoded_rows=NULL; }
int dct_paged_error(void) { return failed; }
int dct_paged_run(uint32_t *out, unsigned cache_bytes) {
 static const int frequencies[9] = {1, 8, 9, 2, 16, 10, 17, 3, 24};
 failed = 0; decoder.err = jpeg_std_error(&error.pub); error.pub.error_exit = fail;
 if (setjmp(error.jump)) { dct_paged_close(); return 0; }
 jpeg_create_decompress(&decoder); decoder.mem->max_memory_to_use = cache_bytes;
 source.init_source=init_input; source.fill_input_buffer=fill_input; source.skip_input_data=skip_input;
 source.resync_to_restart=jpeg_resync_to_restart; source.term_source=term_input; source.bytes_in_buffer=0; source.next_input_byte=NULL; decoder.src=&source;
 jpeg_read_header(&decoder, TRUE);
 if (decoder.data_precision != 8 || (decoder.num_components != 1 && decoder.num_components != 3)) { dct_paged_close(); return 0; }
 jvirt_barray_ptr *arrays = jpeg_read_coefficients(&decoder);
 if (!arrays) { dct_paged_close(); return 0; }
 jpeg_component_info *component = &decoder.comp_info[0];
 JQUANT_TBL *table = decoder.quant_tbl_ptrs[component->quant_tbl_no];
 if (!table) { dct_paged_close(); return 0; }
 JDIMENSION rows = decoder.image_height / 8, columns = decoder.image_width / 8;
 if (rows > component->height_in_blocks) rows = component->height_in_blocks;
 if (columns > component->width_in_blocks) columns = component->width_in_blocks;
 memset(out, 0, (4 + 9 * 258) * sizeof(uint32_t));
 out[0]=decoder.image_width; out[1]=decoder.image_height; out[2]=rows*columns; out[3]=decoder.progressive_mode;
 for (int f=0; f<9; f++) out[4+f*258]=table->quantval[frequencies[f]];
 for (JDIMENSION y=0; y<rows; y++) {
  JBLOCKARRAY row=(*decoder.mem->access_virt_barray)((j_common_ptr)&decoder, arrays[0], y, 1, FALSE);
  for (JDIMENSION x=0; x<columns; x++) for (int f=0; f<9; f++) {
   int value=row[0][x][frequencies[f]]; if (value<0) value=-value;
   uint32_t *record=out+4+f*258; if (value>=256) record[1]++; else record[2+value]++;
  }
  if ((y%32==31 || y+1==rows) && !report_rows(y+1,rows)) ERREXIT(&decoder, JERR_FILE_READ);
 }
 jpeg_finish_decompress(&decoder); int ok=error.pub.num_warnings==0; dct_paged_close(); return ok;
}
int jpeg_decode_paged(unsigned width, unsigned height, unsigned cache_bytes) {
 failed=0; decoder.err=jpeg_std_error(&error.pub); error.pub.error_exit=fail;
 if (setjmp(error.jump)) { dct_paged_close(); return 0; }
 jpeg_create_decompress(&decoder); decoder.mem->max_memory_to_use=cache_bytes;
 source.init_source=init_input; source.fill_input_buffer=fill_input; source.skip_input_data=skip_input;
 source.resync_to_restart=jpeg_resync_to_restart; source.term_source=term_input; source.bytes_in_buffer=0; source.next_input_byte=NULL; decoder.src=&source;
 jpeg_read_header(&decoder,TRUE);
 if (!width || !height || decoder.image_width!=width || decoder.image_height!=height || decoder.data_precision!=8 || (decoder.num_components!=1 && decoder.num_components!=3)) { dct_paged_close(); return 0; }
 decoder.out_color_space=JCS_RGB; decoder.dct_method=JDCT_ISLOW; jpeg_start_decompress(&decoder);
 unsigned row_bytes=width*3,chunk_rows=(1024*1024)/row_bytes; if (chunk_rows>32) chunk_rows=32;
 if (!chunk_rows) { dct_paged_close(); return 0; }
 decoded_rows=malloc((size_t)row_bytes*chunk_rows); if (!decoded_rows) ERREXIT1(&decoder,JERR_OUT_OF_MEMORY,0);
 while (decoder.output_scanline<decoder.output_height) {
  unsigned first=decoder.output_scanline,count=0;
  while (count<chunk_rows && decoder.output_scanline<decoder.output_height) {
   JSAMPROW row=decoded_rows+(size_t)count*row_bytes;
   if (jpeg_read_scanlines(&decoder,&row,1)!=1) ERREXIT(&decoder,JERR_INPUT_EOF);
   count++;
  }
  if (!decoded_write(decoded_rows,(double)((uint64_t)first*row_bytes),count*row_bytes)) ERREXIT(&decoder,JERR_FILE_WRITE);
 }
 jpeg_finish_decompress(&decoder); int ok=error.pub.num_warnings==0; dct_paged_close(); return ok;
}
