import "../../runtime-context.js?v=0.31.0";
// Shared immutable image-format definitions. Import and recompression providers
// expose their own capabilities over the same identities; tools consume RGB8.
const formats=[
 {id:'jpeg',label:'JPEG',magick:'Jpeg',lossy:true,lossless:false,maximumDimension:65500,encoder:'libjpeg-turbo-3.0.3/ISLOW/4:2:0'},
 {id:'webp',label:'WebP',magick:'WebP',lossy:true,lossless:true,maximumDimension:16383},
 {id:'avif',label:'AVIF',magick:'Avif',lossy:true,lossless:true},
 {id:'heic',label:'HEIC / HEVC',magick:'Heic',lossy:true,lossless:true,requiresIsolation:true},
 {id:'png',label:'PNG',lossyLabel:'PNG palette quantifiée',magick:'Png',lossy:true,lossless:true,qualityKind:'palette-colors'},
 {id:'bmp',label:'BMP',lossyLabel:'BMP RLE palette quantifiée',magick:'Bmp3',lossy:true,lossless:true,qualityKind:'palette-colors'},
 {id:'tiff',label:'TIFF / Deflate',magick:'Tiff',lossy:false,lossless:true},
 {id:'jp2',label:'JPEG 2000 / JP2',magick:'Jp2',lossy:true,lossless:true},
 {id:'j2k',label:'JPEG 2000 / codestream',magick:'J2k',lossy:true,lossless:true},
 {id:'jxl',label:'JPEG XL',magick:'Jxl',lossy:true,lossless:true},
 {id:'gif',label:'GIF / palette 256 couleurs',magick:'Gif',lossy:true,lossless:false,qualityMeaningful:false,palette:true},
 {id:'tga',label:'TGA',magick:'Tga',lossy:false,lossless:true,maximumDimension:65535},
 {id:'ico',label:'ICO',magick:'Ico',lossy:false,lossless:true,maximumDimension:256},
 {id:'pcx',label:'PCX',magick:'Pcx',lossy:false,lossless:true},
 {id:'ppm',label:'PPM',magick:'Ppm',lossy:false,lossless:true},
 {id:'pam',label:'PAM',magick:'Pam',lossy:false,lossless:true},
 {id:'psd',label:'PSD',magick:'Psd',lossy:false,lossless:true},
 {id:'exr',label:'OpenEXR / RGB8',magick:'Exr',lossy:false,lossless:true},
 {id:'qoi',label:'QOI',magick:'Qoi',lossy:false,lossless:true},
 {id:'farbfeld',label:'Farbfeld',magick:'Farbfeld',lossy:false,lossless:true}
];
export const IMAGE_FORMATS=Object.freeze(formats.map(f=>Object.freeze({qualityMeaningful:f.lossy,...f})));
