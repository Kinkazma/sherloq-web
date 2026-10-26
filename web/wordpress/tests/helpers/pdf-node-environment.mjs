// PDF.js constructs a matrix during module initialization. These Node tests
// exercise its real exported operator constants and our RenderTask contracts;
// supplied canvas fakes own their pixels. Browser tests verify real rendering.
// These deliberately small initializers are not a canvas or geometry polyfill.
globalThis.DOMMatrix??=class DOMMatrix{
 constructor(values=[1,0,0,1,0,0]){[this.a,this.b,this.c,this.d,this.e,this.f]=values;}
};
globalThis.Path2D??=class Path2D{};
globalThis.ImageData??=class ImageData{};
