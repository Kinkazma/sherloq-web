//#region src/byte-array.ts
function e(e) {
	return e instanceof Int8Array || e instanceof Uint8Array || e instanceof Uint8ClampedArray;
}
//#endregion
//#region src/configuration/configuration-file.ts
var t = class {
	fileName;
	data;
	constructor(e, t) {
		this.fileName = e, this.data = t;
	}
}, n = { XmlResourceFiles: {
	log: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE logmap [\n<!ELEMENT logmap (log)+>\n<!ELEMENT log (#PCDATA)>\n<!ATTLIST log events CDATA #IMPLIED>\n<!ATTLIST log output CDATA #IMPLIED>\n<!ATTLIST log filename CDATA #IMPLIED>\n<!ATTLIST log generations CDATA #IMPLIED>\n<!ATTLIST log limit CDATA #IMPLIED>\n<!ATTLIST log format CDATA #IMPLIED>\n]>\n<logmap>\n  <log events=\"None\"/>\n  <log output=\"Debug\"/>\n  <log filename=\"Magick-%g.log\"/>\n  <log generations=\"3\"/>\n  <log limit=\"2000\"/>\n  <log format=\"%t %r %u %v %d %c[%p]: %m/%f/%l/%d\n  %e\"/>\n</logmap>\n",
	policy: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<!DOCTYPE policymap [\n<!ELEMENT policymap (policy)*>\n<!ATTLIST policymap xmlns CDATA #FIXED \"\">\n<!ELEMENT policy EMPTY>\n<!ATTLIST policy xmlns CDATA #FIXED \"\">\n<!ATTLIST policy domain NMTOKEN #REQUIRED>\n<!ATTLIST policy name NMTOKEN #IMPLIED>\n<!ATTLIST policy pattern CDATA #IMPLIED>\n<!ATTLIST policy rights NMTOKEN #IMPLIED>\n<!ATTLIST policy stealth NMTOKEN #IMPLIED>\n<!ATTLIST policy value CDATA #IMPLIED>\n]>\n<policymap>\n  <policy domain=\"cache\" name=\"shared-secret\" value=\"passphrase\"/>\n  <policy domain=\"coder\" rights=\"none\" pattern=\"EPHEMERAL\" />\n  <policy domain=\"coder\" rights=\"none\" pattern=\"MVG\" />\n  <policy domain=\"coder\" rights=\"none\" pattern=\"MSL\" />\n  <policy domain=\"path\" rights=\"none\" pattern=\"@*\" />\n  <policy domain=\"path\" rights=\"none\" pattern=\"|*\" />\n</policymap>\n"
} }, r = class e {
	constructor() {
		this.log = new t("log.xml", n.XmlResourceFiles.log), this.policy = new t("policy.xml", n.XmlResourceFiles.policy);
	}
	static default = new e();
	*all() {
		yield this.log, yield this.policy;
	}
	log;
	policy;
}, i = class {
	constructor(e, t, n) {
		this.format = e, this.name = t, this.value = n;
	}
	format;
	name;
	value;
}, a = class {
	format;
	constructor(e) {
		this.format = e;
	}
	createDefine(e, t) {
		return typeof t == "boolean" ? new i(this.format, e, t ? "true" : "false") : typeof t == "string" ? new i(this.format, e, t) : new i(this.format, e, t.toString());
	}
	hasValue(e) {
		return e != null;
	}
}, o = class e {
	_scaleX;
	_scaleY;
	_shearX;
	_shearY;
	_translateX;
	_translateY;
	constructor(e = 1, t = 1, n = 0, r = 0, i = 0, a = 0) {
		this._scaleX = e, this._scaleY = t, this._shearX = n, this._shearY = r, this._translateX = i, this._translateY = a;
	}
	get scaleX() {
		return this._scaleX;
	}
	get scaleY() {
		return this._scaleY;
	}
	get shearX() {
		return this._shearX;
	}
	get shearY() {
		return this._shearY;
	}
	get translateX() {
		return this._translateX;
	}
	get translateY() {
		return this._translateY;
	}
	draw(e) {
		e.affine(this._scaleX, this._scaleY, this._shearX, this._shearY, this._translateX, this._translateY);
	}
	reset() {
		this._scaleX = 1, this._scaleY = 1, this._shearX = 0, this._shearY = 0, this._translateX = 0, this._translateY = 0;
	}
	transformOrigin(t, n) {
		let r = new e();
		r._translateX = t, r._translateY = n, this.transform(r);
	}
	transformRotation(t) {
		let n = new e();
		n._scaleX = Math.cos(e.normalizeAngleToRadians(t)), n._scaleY = Math.cos(e.normalizeAngleToRadians(t)), n._shearX = -Math.sin(e.normalizeAngleToRadians(t)), n._shearY = Math.sin(e.normalizeAngleToRadians(t)), this.transform(n);
	}
	transformScale(t, n) {
		let r = new e();
		r._scaleX = t, r._scaleY = n, this.transform(r);
	}
	transformSkewX(t) {
		let n = new e();
		n._shearX = Math.tan(e.normalizeAngleToRadians(t)), this.transform(n);
	}
	transformSkewY(t) {
		let n = new e();
		n._shearY = Math.tan(e.normalizeAngleToRadians(t)), this.transform(n);
	}
	static normalizeAngleToRadians(e) {
		let t = e / 360, n = Math.round(t);
		return Math.abs(t - n) === .5 && n % 2 != 0 && (n = t > 0 ? n - 1 : n + 1), Math.PI * (e - n * 360) / 180;
	}
	transform(e) {
		let t = this._scaleX, n = this._scaleY, r = this._shearX, i = this._shearY, a = this._translateX, o = this._translateY;
		this._scaleX = t * e._scaleX + i * e._shearX, this._scaleY = r * e._shearY + n * e._scaleY, this._shearX = r * e._scaleX + n * e._shearX, this._shearY = t * e._shearY + i * e._scaleY, this._translateX = t * e._translateX + i * e._translateY + a, this._translateY = r * e._translateX + n * e._translateY + o;
	}
}, s = class {
	_color;
	constructor(e) {
		this._color = e;
	}
	get color() {
		return this._color;
	}
	draw(e) {
		e.borderColor(this._color);
	}
}, c = class {
	_x;
	_y;
	_paintMethod;
	constructor(e, t, n) {
		this._x = e, this._y = t, this._paintMethod = n;
	}
	get x() {
		return this._x;
	}
	get y() {
		return this._y;
	}
	get paintMethod() {
		return this._paintMethod;
	}
	draw(e) {
		e.color(this._x, this._y, this._paintMethod);
	}
}, l = class {
	_color;
	constructor(e) {
		this._color = e;
	}
	get color() {
		return this._color;
	}
	draw(e) {
		e.fillColor(this._color);
	}
}, u = class {
	_opacity;
	constructor(e) {
		this._opacity = e;
	}
	get opacity() {
		return this._opacity;
	}
	draw(e) {
		e.fillOpacity(this._opacity.toDouble() / 100);
	}
}, d = class {
	_fillRule;
	constructor(e) {
		this._fillRule = e;
	}
	get fillRule() {
		return this._fillRule;
	}
	draw(e) {
		e.fillRule(this._fillRule);
	}
}, f = class {
	_pointSize;
	constructor(e) {
		this._pointSize = e;
	}
	get pointSize() {
		return this._pointSize;
	}
	draw(e) {
		e.fontPointSize(this._pointSize);
	}
}, p = class {
	constructor(e, t) {
		this.eventType = e, this.message = t ?? "";
	}
	eventType;
	message;
}, ee = {
	Undefined: 0,
	Activate: 1,
	Associate: 2,
	Background: 3,
	Copy: 4,
	Deactivate: 5,
	Discrete: 6,
	Disassociate: 7,
	Extract: 8,
	Off: 9,
	On: 10,
	Opaque: 11,
	Remove: 12,
	Set: 13,
	Shape: 14,
	Transparent: 15,
	OffIfOpaque: 16
}, m = {
	Red: 0,
	Cyan: 0,
	Gray: 0,
	Green: 1,
	Magenta: 1,
	Blue: 2,
	Yellow: 2,
	Black: 3,
	Alpha: 4,
	Index: 5,
	Meta0: 10,
	Meta1: 11,
	Meta2: 12,
	Meta3: 13,
	Meta4: 14,
	Meta5: 15,
	Meta6: 16,
	Meta7: 17,
	Meta8: 18,
	Meta9: 19,
	Meta10: 20,
	Meta11: 21,
	Meta12: 22,
	Meta13: 23,
	Meta14: 24,
	Meta15: 25,
	Meta16: 26,
	Meta17: 27,
	Meta18: 28,
	Meta19: 29,
	Meta20: 30,
	Meta21: 31,
	Meta22: 32,
	Meta23: 33,
	Meta24: 34,
	Meta25: 35,
	Meta26: 36,
	Meta27: 37,
	Meta28: 38,
	Meta29: 39,
	Meta30: 40,
	Meta31: 41,
	Meta32: 42,
	Meta33: 43,
	Meta34: 44,
	Meta35: 45,
	Meta36: 46,
	Meta37: 47,
	Meta38: 48,
	Meta39: 49,
	Meta40: 50,
	Meta41: 51,
	Meta42: 52,
	Meta43: 53,
	Meta44: 54,
	Meta45: 55,
	Meta46: 56,
	Meta47: 57,
	Meta48: 58,
	Meta49: 59,
	Meta50: 60,
	Meta51: 61,
	Meta52: 62,
	Composite: 64
}, h = {
	Undefined: 0,
	Red: 1,
	Gray: 1,
	Cyan: 1,
	Green: 2,
	Magenta: 2,
	Blue: 4,
	Yellow: 4,
	Black: 8,
	Alpha: 16,
	Opacity: 16,
	Index: 32,
	Composite: 31,
	TrueAlpha: 256,
	get RGB() {
		return this.Red | this.Green | this.Blue;
	},
	get CMYK() {
		return this.Cyan | this.Magenta | this.Yellow | this.Black;
	},
	get CMYKA() {
		return this.Cyan | this.Magenta | this.Yellow | this.Black | this.Alpha;
	},
	Meta0: 1 << m.Meta0,
	Meta1: 1 << m.Meta1,
	Meta2: 1 << m.Meta2,
	Meta3: 1 << m.Meta3,
	Meta4: 1 << m.Meta4,
	Meta5: 1 << m.Meta5,
	Meta6: 1 << m.Meta6,
	Meta7: 1 << m.Meta7,
	Meta8: 1 << m.Meta8,
	Meta9: 1 << m.Meta9,
	Meta10: 1 << m.Meta10,
	Meta11: 1 << m.Meta11,
	Meta12: 1 << m.Meta12,
	Meta13: 1 << m.Meta13,
	Meta14: 1 << m.Meta14,
	Meta15: 1 << m.Meta15,
	Meta16: 1 << m.Meta16,
	Meta17: 1 << m.Meta17,
	Meta18: 1 << m.Meta18,
	Meta19: 1 << m.Meta19,
	Meta20: 1 << m.Meta20,
	Meta21: 1 << m.Meta21,
	All: 134217727
}, te = class {
	constructor(e, t, n, r) {
		this.red = e, this.green = t, this.blue = n, this.white = r;
	}
	red;
	green;
	blue;
	white;
}, g = {
	Undefined: 0,
	CMY: 1,
	CMYK: 2,
	Gray: 3,
	HCL: 4,
	HCLp: 5,
	HSB: 6,
	HSI: 7,
	HSL: 8,
	HSV: 9,
	HWB: 10,
	Lab: 11,
	LCH: 12,
	LCHab: 13,
	LCHuv: 14,
	Log: 15,
	LMS: 16,
	Luv: 17,
	OHTA: 18,
	Rec601YCbCr: 19,
	Rec709YCbCr: 20,
	RGB: 21,
	scRGB: 22,
	sRGB: 23,
	Transparent: 24,
	XyY: 25,
	XYZ: 26,
	YCbCr: 27,
	YCC: 28,
	YDbDr: 29,
	YIQ: 30,
	YPbPr: 31,
	YUV: 32,
	LinearGray: 33,
	Jzazbz: 34,
	DisplayP3: 35,
	Adobe98: 36,
	ProPhoto: 37,
	Oklab: 38,
	Oklch: 39,
	CAT02LMSC: 40
}, ne = {
	[g.Undefined]: "Undefined",
	[g.CMY]: "CMY",
	[g.CMYK]: "CMYK",
	[g.Gray]: "Gray",
	[g.HCL]: "HCL",
	[g.HCLp]: "HCLp",
	[g.HSB]: "HSB",
	[g.HSI]: "HSI",
	[g.HSL]: "HSL",
	[g.HSV]: "HSV",
	[g.HWB]: "HWB",
	[g.Lab]: "Lab",
	[g.LCH]: "LCH",
	[g.LCHab]: "LCHab",
	[g.LCHuv]: "LCHuv",
	[g.Log]: "Log",
	[g.LMS]: "LMS",
	[g.Luv]: "Luv",
	[g.OHTA]: "OHTA",
	[g.Rec601YCbCr]: "Rec601YCbCr",
	[g.Rec709YCbCr]: "Rec709YCbCr",
	[g.RGB]: "RGB",
	[g.scRGB]: "scRGB",
	[g.sRGB]: "sRGB",
	[g.Transparent]: "Transparent",
	[g.XyY]: "XyY",
	[g.XYZ]: "XYZ",
	[g.YCbCr]: "YCbCr",
	[g.YCC]: "YCC",
	[g.YDbDr]: "YDbDr",
	[g.YIQ]: "YIQ",
	[g.YPbPr]: "YPbPr",
	[g.YUV]: "YUV",
	[g.LinearGray]: "LinearGray",
	[g.Jzazbz]: "Jzazbz",
	[g.DisplayP3]: "DisplayP3",
	[g.Adobe98]: "Adobe98",
	[g.ProPhoto]: "ProPhoto",
	[g.Oklab]: "Oklab",
	[g.Oklch]: "Oklch",
	[g.CAT02LMSC]: "CAT02LMS"
}, _ = class {
	colorSpace = g.Undefined;
	copyright = null;
	description = null;
	manufacturer = null;
	model = null;
}, re = class {
	_data;
	_index;
	constructor(e) {
		this._data = e, this._index = 0, this.isLittleEndian = !1;
	}
	get index() {
		return this._index;
	}
	isLittleEndian;
	readLong() {
		return this.canRead(4) ? this.isLittleEndian ? this.readLongLSB() : this.readLongMSB() : null;
	}
	readString(e) {
		if (e == 0) return "";
		if (!this.canRead(e)) return null;
		let t = new TextDecoder("utf-8").decode(this._data.subarray(this._index, this._index + e)), n = t.indexOf("\0");
		return n != -1 && (t = t.substring(0, n)), this._index += e, t;
	}
	seek(e) {
		return e >= this._data.length ? !1 : (this._index = e, !0);
	}
	skip(e) {
		return this._index + e >= this._data.length ? !1 : (this._index += e, !0);
	}
	canRead(e) {
		return e > this._data.length ? !1 : this._index + e <= this._data.length;
	}
	readLongLSB() {
		let e = this._data[this._index];
		return e |= this._data[this._index + 1] << 8, e |= this._data[this._index + 2] << 16, e |= this._data[this._index + 3] << 24, this._index += 4, e;
	}
	readLongMSB() {
		let e = this._data[this._index] << 24;
		return e |= this._data[this._index + 1] << 16, e |= this._data[this._index + 2] << 8, e |= this._data[this._index + 3], this._index += 4, e;
	}
}, v = class e {
	_data = new _();
	_reader;
	constructor(e) {
		this._reader = new re(e);
	}
	static read(t) {
		let n = new e(t);
		return n.readColorSpace(), n.readTagTable(), n._data;
	}
	readColorSpace() {
		this._reader.seek(16);
		let e = this._reader.readString(4);
		e != null && (this._data.colorSpace = this.determineColorSpace(e.trimEnd()));
	}
	determineColorSpace(e) {
		switch (e) {
			case "CMY": return g.CMY;
			case "CMYK": return g.CMYK;
			case "GRAY": return g.Gray;
			case "HSL": return g.HSL;
			case "HSV": return g.HSV;
			case "Lab": return g.Lab;
			case "Luv": return g.Luv;
			case "RGB": return g.sRGB;
			case "XYZ": return g.XYZ;
			case "YCbr": return g.YCbCr;
			default: return g.Undefined;
		}
	}
	readTagTable() {
		if (!this._reader.seek(128)) return;
		let e = this._reader.readLong();
		if (e != null) for (let t = 0; t < e; t++) switch (this._reader.readLong()) {
			case 1668313716:
				this._data.copyright = this.readTag();
				break;
			case 1684370275:
				this._data.description = this.readTag();
				break;
			case 1684893284:
				this._data.manufacturer = this.readTag();
				break;
			case 1684890724:
				this._data.model = this.readTag();
				break;
			default: this._reader.skip(8);
		}
	}
	readTag() {
		let e = this._reader.readLong(), t = this._reader.readLong();
		if (e === null || t === null) return null;
		let n = this._reader.index;
		if (!this._reader.seek(e)) return null;
		let r = this.readTagValue(t);
		return this._reader.seek(n), r;
	}
	readTagValue(e) {
		switch (this._reader.readString(4)) {
			case "desc": return this.readTextDescriptionTypeValue();
			case "text": return this.readTextTypeValue(e);
			default: return null;
		}
	}
	readTextDescriptionTypeValue() {
		if (!this._reader.skip(4)) return null;
		let e = this._reader.readLong();
		return e == null ? null : this._reader.readString(e);
	}
	readTextTypeValue(e) {
		return this._reader.skip(4) ? this._reader.readString(e) : null;
	}
}, ie = class {
	constructor(e, t) {
		this.name = e, this.data = t;
	}
	name;
	data;
}, y = class extends ie {
	_data;
	constructor(e) {
		super("icc", e);
	}
	get colorSpace() {
		return this.initialize(), this._data.colorSpace;
	}
	get copyright() {
		return this.initialize(), this._data.copyright;
	}
	get description() {
		return this.initialize(), this._data.description;
	}
	get manufacturer() {
		return this.initialize(), this._data.manufacturer;
	}
	get model() {
		return this.initialize(), this._data.model;
	}
	initialize() {
		this._data ||= v.read(this.data);
	}
}, b = {
	HighRes: 0,
	Quantum: 1
}, ae = class e {
	constructor(e, t) {
		this.distortion = e, this.difference = t;
	}
	difference;
	distortion;
	static _create(t, n) {
		return new e(t, n);
	}
}, oe = class {
	constructor(e) {
		this.metric = e;
	}
	metric;
	highlightColor;
	lowlightColor;
	masklightColor;
	_setArtifacts(e) {
		this.highlightColor !== void 0 && e.setArtifact("compare:highlight-color", this.highlightColor), this.lowlightColor !== void 0 && e.setArtifact("compare:lowlight-color", this.lowlightColor), this.masklightColor !== void 0 && e.setArtifact("compare:masklight-color", this.masklightColor);
	}
}, x = {
	Undefined: 0,
	Alpha: 1,
	Atop: 2,
	Blend: 3,
	Blur: 4,
	Bumpmap: 5,
	ChangeMask: 6,
	Clear: 7,
	ColorBurn: 8,
	ColorDodge: 9,
	Colorize: 10,
	CopyBlack: 11,
	CopyBlue: 12,
	Copy: 13,
	CopyCyan: 14,
	CopyGreen: 15,
	CopyMagenta: 16,
	CopyAlpha: 17,
	CopyRed: 18,
	CopyYellow: 19,
	Darken: 20,
	DarkenIntensity: 21,
	Difference: 22,
	Displace: 23,
	Dissolve: 24,
	Distort: 25,
	DivideDst: 26,
	DivideSrc: 27,
	DstAtop: 28,
	Dst: 29,
	DstIn: 30,
	DstOut: 31,
	DstOver: 32,
	Exclusion: 33,
	HardLight: 34,
	HardMix: 35,
	Hue: 36,
	In: 37,
	Intensity: 38,
	Lighten: 39,
	LightenIntensity: 40,
	LinearBurn: 41,
	LinearDodge: 42,
	LinearLight: 43,
	Luminize: 44,
	Mathematics: 45,
	MinusDst: 46,
	MinusSrc: 47,
	Modulate: 48,
	ModulusAdd: 49,
	ModulusSubtract: 50,
	Multiply: 51,
	No: 52,
	Out: 53,
	Over: 54,
	Overlay: 55,
	PegtopLight: 56,
	PinLight: 57,
	Plus: 58,
	Replace: 59,
	Saturate: 60,
	Screen: 61,
	SoftLight: 62,
	SrcAtop: 63,
	Src: 64,
	SrcIn: 65,
	SrcOut: 66,
	SrcOver: 67,
	Threshold: 68,
	VividLight: 69,
	Xor: 70,
	Stereo: 71,
	Freeze: 72,
	Interpolate: 73,
	Negate: 74,
	Reflect: 75,
	SoftBurn: 76,
	SoftDodge: 77,
	Stamp: 78,
	RMSE: 79,
	SaliencyBlend: 80,
	SeamlessBlend: 81
}, se = {
	Warning: 300,
	ResourceLimitWarning: 300,
	TypeWarning: 305,
	OptionWarning: 310,
	DelegateWarning: 315,
	MissingDelegateWarning: 320,
	CorruptImageWarning: 325,
	FileOpenWarning: 330,
	BlobWarning: 335,
	StreamWarning: 340,
	CacheWarning: 345,
	CoderWarning: 350,
	FilterWarning: 352,
	ModuleWarning: 355,
	DrawWarning: 360,
	ImageWarning: 365,
	WandWarning: 370,
	RandomWarning: 375,
	XServerWarning: 380,
	MonitorWarning: 385,
	RegistryWarning: 390,
	ConfigureWarning: 395,
	PolicyWarning: 399,
	Error: 400,
	ResourceLimitError: 400,
	TypeError: 405,
	OptionError: 410,
	DelegateError: 415,
	MissingDelegateError: 420,
	CorruptImageError: 425,
	FileOpenError: 430,
	BlobError: 435,
	StreamError: 440,
	CacheError: 445,
	CoderError: 450,
	FilterError: 452,
	ModuleError: 455,
	DrawError: 460,
	ImageError: 465,
	WandError: 470,
	RandomError: 475,
	XServerError: 480,
	MonitorError: 485,
	RegistryError: 490,
	ConfigureError: 495,
	PolicyError: 499
}, S = class extends Error {
	_relatedErrors = [];
	constructor(e, t = se.Error) {
		super(e), this.severity = t;
	}
	severity;
	get relatedErrors() {
		return this._relatedErrors;
	}
	_setRelatedErrors(e) {
		this._relatedErrors = e;
	}
}, ce = class {
	static get depth() {
		return Number(V._api._Quantum_Depth_Get());
	}
	static get max() {
		return V._api._Quantum_Max_Get();
	}
};
//#endregion
//#region src/internal/native/string.ts
function C(e, t) {
	return e === V._api._NullPointer ? t ?? null : w(e);
}
function w(e) {
	return V._api.UTF8ToString(Number(e));
}
function T(e, t) {
	let n = C(t);
	return e._MagickMemory_Relinquish(t), n;
}
function le(e, t, n) {
	let r = e.lengthBytesUTF8(t) + 1, i = e._malloc(r);
	try {
		return e.stringToUTF8(t, i, r), n(e._CastToSize(i));
	} finally {
		e._free(i);
	}
}
function E(e, t) {
	return e === null ? t(V._api._NullPointer) : le(V._api, e, t);
}
//#endregion
//#region src/magick-color.ts
var D = class e {
	constructor(e, t, n, r, i) {
		if (e !== void 0) {
			if (typeof e == "string") {
				let t = V._api._NullPointer;
				try {
					t = V._api._MagickColor_Create(), E(e, (e) => {
						if (V._api._MagickColor_Initialize(t, e) === 0) throw new S("invalid color specified");
						this.initialize(t);
					});
				} finally {
					V._api._free(Number(t));
				}
			} else this.r = e, this.g = t ?? 0, this.b = n ?? 0, i === void 0 ? this.a = r ?? ce.max : (this.k = r ?? 0, this.a = i, this.isCmyk = !0);
		}
	}
	r = 0;
	g = 0;
	b = 0;
	a = 0;
	k = 0;
	isCmyk = !1;
	static _create(t) {
		let n = new e();
		return n.initialize(t), n;
	}
	fuzzyEquals(e, t) {
		return e == this || this._use((n) => e._use((e) => V._api._MagickColor_FuzzyEquals(n, e, t._toQuantum()) === 1));
	}
	toShortString() {
		return this.a === ce.max ? this.isCmyk ? `cmyka(${this.r},${this.g},${this.b},${this.k})` : `#${this.toHex(this.r)}${this.toHex(this.g)}${this.toHex(this.b)}` : this.toString();
	}
	toString() {
		return this.isCmyk ? `cmyka(${this.r},${this.g},${this.b},${this.k},${(this.a / ce.max).toFixed(4)})` : `#${this.toHex(this.r)}${this.toHex(this.g)}${this.toHex(this.b)}${this.toHex(this.a)}`;
	}
	_use(e) {
		let t = V._api._NullPointer;
		try {
			return t = V._api._MagickColor_Create(), V._api._MagickColor_Red_Set(t, this.r), V._api._MagickColor_Green_Set(t, this.g), V._api._MagickColor_Blue_Set(t, this.b), V._api._MagickColor_Alpha_Set(t, this.a), this.isCmyk ? (V._api._MagickColor_Black_Set(t, this.k), V._api._MagickColor_IsCMYK_Set(t, 1)) : V._api._MagickColor_IsCMYK_Set(t, 0), e(t);
		} finally {
			V._api._MagickColor_Dispose(t);
		}
	}
	initialize(e) {
		this.r = V._api._MagickColor_Red_Get(e), this.g = V._api._MagickColor_Green_Get(e), this.b = V._api._MagickColor_Blue_Get(e), this.a = V._api._MagickColor_Alpha_Get(e), this.isCmyk = V._api._MagickColor_IsCMYK_Get(e) === 1, this.isCmyk && (this.k = V._api._MagickColor_Black_Get(e));
	}
	toHex(e) {
		return e.toString(16).padStart(2, "0");
	}
}, ue = /* @__PURE__ */ function(e) {
	return e[e.NoValue = 0] = "NoValue", e[e.PercentValue = 4096] = "PercentValue", e[e.IgnoreAspectRatio = 8192] = "IgnoreAspectRatio", e[e.Less = 16384] = "Less", e[e.Greater = 32768] = "Greater", e[e.FillArea = 65536] = "FillArea", e[e.LimitPixels = 131072] = "LimitPixels", e[e.AspectRatio = 1048576] = "AspectRatio", e;
}({});
//#endregion
//#region src/internal/native/size.ts
function O(e) {
	return V._api._CastToSize(e);
}
//#endregion
//#region src/types/magick-geometry.ts
var de = class e {
	_includeXyInToString;
	_width = 0;
	_height = 0;
	_x = 0;
	_y = 0;
	_aspectRatio = !1;
	_fillArea = !1;
	_greater = !1;
	_isPercentage = !1;
	_ignoreAspectRatio = !1;
	_less = !1;
	_limitPixels = !1;
	constructor(e, t, n, r) {
		if (typeof e == "string") {
			this._includeXyInToString = e.indexOf("+") >= 0 || e.indexOf("-") >= 0;
			let t = V._api._MagickGeometry_Create();
			try {
				E(e, (n) => {
					let r = V._api._MagickGeometry_Initialize(t, n);
					if (r === ue.NoValue) throw new S("invalid geometry specified");
					this.hasFlag(r, ue.AspectRatio) ? this.initializeFromAspectRation(t, e) : this.initialize(t, r);
				});
			} finally {
				V._api._MagickGeometry_Dispose(t);
			}
		} else {
			if (n !== void 0 && r !== void 0 ? (this._width = n, this._height = r, this._x = e, this._y = t ?? 0, this._includeXyInToString = !0) : (this._width = e, this._height = t ?? this._width, this._x = 0, this._y = 0, this._includeXyInToString = !1), this._width < 0) throw new S("negative width is not allowed");
			if (this._height < 0) throw new S("negative height is not allowed");
		}
	}
	get aspectRatio() {
		return this._aspectRatio;
	}
	get fillArea() {
		return this._fillArea;
	}
	set fillArea(e) {
		this._fillArea = e;
	}
	get greater() {
		return this._greater;
	}
	set greater(e) {
		this._greater = e;
	}
	get height() {
		return this._height;
	}
	set height(e) {
		this._height = e;
	}
	get ignoreAspectRatio() {
		return this._ignoreAspectRatio;
	}
	set ignoreAspectRatio(e) {
		this._ignoreAspectRatio = e;
	}
	get isPercentage() {
		return this._isPercentage;
	}
	set isPercentage(e) {
		this._isPercentage = e;
	}
	get less() {
		return this._less;
	}
	set less(e) {
		this._less = e;
	}
	get limitPixels() {
		return this._limitPixels;
	}
	set limitPixels(e) {
		this._limitPixels = e;
	}
	get width() {
		return this._width;
	}
	set width(e) {
		this._width = e;
	}
	get x() {
		return this._x;
	}
	set x(e) {
		this._x = e;
	}
	get y() {
		return this._y;
	}
	set y(e) {
		this._y = e;
	}
	toString() {
		if (this._aspectRatio) return this._width + ":" + this._height;
		let e = "";
		return this._width == 0 && this._height == 0 ? e += "0x0" : (this._width > 0 && (e += this._width.toString()), this._height > 0 ? e += "x" + this._height.toString() : e += "x"), (this._x != 0 || this._y != 0 || this._includeXyInToString) && (this._x >= 0 && (e += "+"), e += this._x, this.y >= 0 && (e += "+"), e += this.y), this._fillArea && (e += "^"), this._greater && (e += ">"), this._isPercentage && (e += "%"), this._ignoreAspectRatio && (e += "!"), this._less && (e += "<"), this._limitPixels && (e += "@"), e;
	}
	static _fromRectangle(t) {
		if (t === V._api._NullPointer) throw new S("unable to allocate memory");
		try {
			let n = Number(V._api._MagickRectangle_Width_Get(t)), r = Number(V._api._MagickRectangle_Height_Get(t)), i = Number(V._api._MagickRectangle_X_Get(t)), a = Number(V._api._MagickRectangle_Y_Get(t));
			return new e(i, a, n, r);
		} finally {
			V._api._MagickRectangle_Dispose(t);
		}
	}
	_toRectangle(e) {
		let t = V._api._MagickRectangle_Create();
		if (t === V._api._NullPointer) throw new S("unable to allocate memory");
		try {
			return V._api._MagickRectangle_Width_Set(t, O(this._width)), V._api._MagickRectangle_Height_Set(t, O(this._height)), V._api._MagickRectangle_X_Set(t, O(this._x)), V._api._MagickRectangle_Y_Set(t, O(this._y)), e(t);
		} finally {
			V._api._MagickRectangle_Dispose(t);
		}
	}
	initialize(e, t) {
		this._width = Number(V._api._MagickGeometry_Width_Get(e)), this._height = Number(V._api._MagickGeometry_Height_Get(e)), this._x = Number(V._api._MagickGeometry_X_Get(e)), this._y = Number(V._api._MagickGeometry_Y_Get(e)), this._ignoreAspectRatio = this.hasFlag(t, ue.IgnoreAspectRatio), this._isPercentage = this.hasFlag(t, ue.PercentValue), this._fillArea = this.hasFlag(t, ue.FillArea), this._greater = this.hasFlag(t, ue.Greater), this._less = this.hasFlag(t, ue.Less), this._limitPixels = this.hasFlag(t, ue.LimitPixels);
	}
	initializeFromAspectRation(e, t) {
		this._aspectRatio = !0;
		let n = t.split(":");
		this._width = this.parseNumber(n[0]), this._height = this.parseNumber(n[1]), this._x = Number(V._api._MagickGeometry_X_Get(e)), this._y = Number(V._api._MagickGeometry_Y_Get(e));
	}
	parseNumber(e) {
		let t = 0;
		for (; t < e.length && !this.isNumber(e[t]);) t++;
		let n = t;
		for (; t < e.length && this.isNumber(e[t]);) t++;
		return parseInt(e.substr(n, t - n));
	}
	isNumber(e) {
		return e >= "0" && e <= "9";
	}
	hasFlag(e, t) {
		return (e & t) === t;
	}
}, fe = class e {
	constructor(e, t) {
		this.x = e, this.y = t ?? e;
	}
	x;
	y;
	static _create(t) {
		return t === V._api._NullPointer ? new e(0, 0) : new e(V._api._PointInfo_X_Get(t), V._api._PointInfo_Y_Get(t));
	}
}, pe = class e {
	constructor(e) {
		this.area = Number(V._api._ConnectedComponent_GetArea(e)), this.centroid = fe._create(V._api._ConnectedComponent_GetCentroid(e)), this.color = D._create(V._api._ConnectedComponent_GetColor(e)), this.height = Number(V._api._ConnectedComponent_GetHeight(e)), this.id = Number(V._api._ConnectedComponent_GetId(e)), this.width = Number(V._api._ConnectedComponent_GetWidth(e)), this.x = Number(V._api._ConnectedComponent_GetX(e)), this.y = Number(V._api._ConnectedComponent_GetY(e));
	}
	area;
	centroid;
	color;
	height;
	id;
	width;
	x;
	y;
	static _create(t, n) {
		let r = [];
		if (t === V._api._NullPointer) return r;
		for (let i = 0; i < n; i++) {
			let n = V._api._ConnectedComponent_GetInstance(t, O(i));
			n === V._api._NullPointer || V._api._ConnectedComponent_GetArea(n) < 2 ** -52 || r.push(new e(n));
		}
		return r;
	}
	toGeometry() {
		return new de(this.x, this.y, this.width, this.height);
	}
}, me = class {
	angleThreshold;
	areaThreshold;
	circularityThreshold;
	connectivity;
	diameterThreshold;
	eccentricityThreshold;
	majorAxisThreshold;
	meanColor;
	minorAxisThreshold;
	perimeterThreshold;
	constructor(e) {
		this.connectivity = e;
	}
	_setArtifacts(e) {
		this.angleThreshold !== void 0 && e.setArtifact("connected-components:angle-threshold", this.angleThreshold.toString()), this.areaThreshold !== void 0 && e.setArtifact("connected-components:area-threshold", this.areaThreshold.toString()), this.circularityThreshold !== void 0 && e.setArtifact("connected-components:circularity-threshold", this.circularityThreshold.toString()), this.diameterThreshold !== void 0 && e.setArtifact("connected-components:diameter-threshold", this.diameterThreshold.toString()), this.eccentricityThreshold !== void 0 && e.setArtifact("connected-components:eccentricity-threshold", this.eccentricityThreshold.toString()), this.majorAxisThreshold !== void 0 && e.setArtifact("connected-components:major-axis-threshold", this.majorAxisThreshold.toString()), this.meanColor !== void 0 && e.setArtifact("connected-components:mean-color", this.meanColor.toString()), this.minorAxisThreshold !== void 0 && e.setArtifact("connected-components:minor-axis-threshold", this.minorAxisThreshold.toString()), this.perimeterThreshold !== void 0 && e.setArtifact("connected-components:perimeter-threshold", this.perimeterThreshold.toString());
	}
}, he = {
	Undefined: 0,
	PixelsPerInch: 1,
	PixelsPerCentimeter: 2
}, k = class e {
	constructor(e, t, n) {
		t === void 0 ? (this.x = e, this.y = e, this.units = he.PixelsPerInch) : n === void 0 ? (this.x = e, this.y = e, this.units = t) : (this.x = e, this.y = t, this.units = n);
	}
	x;
	y;
	units;
	toString(t) {
		return t == this.units || t === he.Undefined || t === void 0 ? e.toString(this.x, this.y, t ?? he.Undefined) : this.units == he.PixelsPerCentimeter && t == he.PixelsPerInch ? e.toString(this.x * 2.54, this.y * 2.54, t) : e.toString(this.x / 2.54, this.y / 2.54, t);
	}
	static toString(e, t, n) {
		let r = `${e}x${t}`;
		switch (n) {
			case he.PixelsPerCentimeter:
				r += "cm";
				break;
			case he.PixelsPerInch: r += "inch";
		}
		return r;
	}
}, A = class e {
	static _disposeAfterExecution(t, n) {
		try {
			let r = n(t);
			return r instanceof Promise ? Promise.resolve(r).then((n) => (t.dispose(), e.checkResult(t, n), n)) : (t.dispose(), e.checkResult(t, r), r);
		} catch (e) {
			throw t.dispose(), e;
		}
	}
	static checkResult(e, t) {
		if (t === e) throw new S("The result of the function cannot be the instance that has been disposed.");
		return t;
	}
}, ge = class {
	_pointer;
	_bytes;
	_func;
	constructor(e, t, n) {
		this._pointer = e, this._func = n, this._bytes = V._api.HEAPU8.subarray(Number(e), Number(e) + t);
	}
	func(e) {
		return e._bytes === void 0 ? e._func(/* @__PURE__ */ new Uint8Array()) : e._func(e._bytes);
	}
	dispose() {
		this._pointer = V._api._MagickMemory_Relinquish(this._pointer);
	}
}, _e = class {
	instance;
	type;
	constructor(e, t) {
		this.instance = V._api._malloc(e), this.type = t, V._api.setValue(this.instance, 0, this.type);
	}
	free() {
		V._api._free(this.instance);
	}
	get ptr() {
		return V._api._CastToSize(this.instance);
	}
	get value() {
		return V._api._CastToSize(V._api.getValue(this.instance, this.type));
	}
}, j = class e extends _e {
	constructor() {
		super(V._api._PointerSize, "*");
	}
	static use(t) {
		let n = new e();
		try {
			return t(n);
		} finally {
			n.free();
		}
	}
}, M = class e {
	pointer;
	constructor(e) {
		this.pointer = e;
	}
	get ptr() {
		return this.pointer.ptr;
	}
	check(e, t) {
		return this.isError() ? t() : e();
	}
	static usePointer(t, n) {
		return j.use((r) => {
			let i = t(r.ptr);
			return e.checkException(r, i, n);
		});
	}
	static use(t, n) {
		return j.use((r) => {
			let i = t(new e(r));
			return e.checkException(r, i, n);
		});
	}
	static checkException(t, n, r) {
		if (!e.isRaised(t)) return n;
		let i = e.getErrorSeverity(t.value);
		return i >= se.Error ? e.throw(t, i) : r === void 0 ? e.dispose(t) : r(e.createError(t.value, i)), n;
	}
	isError() {
		return e.isRaised(this.pointer) ? e.getErrorSeverity(this.pointer.value) >= se.Error : !1;
	}
	static getErrorSeverity(e) {
		return V._api._MagickExceptionHelper_Severity(e);
	}
	static isRaised(e) {
		return e.value !== V._api._NullPointer;
	}
	static throw(t, n) {
		let r = e.createError(t.value, n);
		throw e.dispose(t), r;
	}
	static createError(t, n) {
		let r = new S(e.getMessage(t), n), i = V._api._MagickExceptionHelper_RelatedCount(t);
		if (i === V._api._NullPointer) return r;
		let a = [];
		for (let n = 0; n < i; n++) {
			let r = V._api._MagickExceptionHelper_Related(t, O(n)), i = e.getErrorSeverity(r), o = e.createError(r, i);
			a.push(o);
		}
		return r._setRelatedErrors(a), r;
	}
	static getMessage(e) {
		let t = V._api._MagickExceptionHelper_Message(e), n = V._api._MagickExceptionHelper_Description(e), r = C(t, "Unknown error");
		return n !== V._api._NullPointer && (r += `(${w(n)})`), r;
	}
	static dispose(e) {
		V._api._MagickExceptionHelper_Dispose(e.value);
	}
}, ve = class {
	disposeMethod;
	instance;
	constructor(e, t) {
		this.instance = e, this.disposeMethod = t;
	}
	get _instance() {
		if (this.instance !== V._api._NullPointer) return this.instance;
		throw new S("instance is disposed");
	}
	set _instance(e) {
		this.disposeInstance(this.instance), this.instance = e;
	}
	dispose() {
		this.instance = this.disposeInstance(this.instance);
	}
	_setInstance(e, t) {
		return t.check(() => this.instance !== V._api._NullPointer && (this.dispose(), this.instance = e, !0), () => (this.disposeInstance(e), !0));
	}
	disposeInstance(e) {
		return e > 0 && (this.onDispose !== void 0 && this.onDispose(), this.disposeMethod(e)), V._api._NullPointer;
	}
}, N = class e {
	constructor(e, t, n, r, i, a, o) {
		this.ascent = e, this.descent = t, this.maxHorizontalAdvance = n, this.textHeight = r, this.textWidth = i, this.underlinePosition = a, this.underlineThickness = o;
	}
	ascent;
	descent;
	maxHorizontalAdvance;
	textHeight;
	textWidth;
	underlinePosition;
	underlineThickness;
	static _create(t) {
		if (t === V._api._NullPointer) return null;
		try {
			let n = V._api._TypeMetric_Ascent_Get(t), r = V._api._TypeMetric_Descent_Get(t), i = V._api._TypeMetric_MaxHorizontalAdvance_Get(t), a = V._api._TypeMetric_TextHeight_Get(t), o = V._api._TypeMetric_TextWidth_Get(t), s = V._api._TypeMetric_UnderlinePosition_Get(t), c = V._api._TypeMetric_UnderlineThickness_Get(t);
			return new e(n, r, i, a, o, s, c);
		} finally {
			V._api._TypeMetric_Dispose(t);
		}
	}
};
//#endregion
//#region src/internal/native/array.ts
function ye(e, t) {
	if (e.byteLength === 0) throw new S("The specified array cannot be empty");
	let n = 0;
	try {
		return n = V._api._malloc(e.byteLength), V._api.HEAPU8.set(e, n), t(O(n));
	} finally {
		n !== 0 && V._api._free(n);
	}
}
function be(e, t) {
	if (e.length === 0) throw new S("The specified array cannot be empty");
	let n = e.length * 8, r = 0;
	try {
		r = V._api._malloc(n);
		let i = new ArrayBuffer(n), a = new Float64Array(i);
		for (let t = 0; t < e.length; t++) a[t] = e[t];
		return V._api.HEAPU8.set(new Int8Array(i), r), t(O(r));
	} finally {
		r !== 0 && V._api._free(r);
	}
}
function xe(e, t) {
	if (e.byteLength === 0) throw new S("The specified array cannot be empty");
	let n = 0;
	try {
		return n = V._api._malloc(e.byteLength), V._api.HEAPU8.set(e, n), t(O(n));
	} finally {
		n !== 0 && V._api._free(n);
	}
}
//#endregion
//#region src/drawing/drawing-wand.ts
var Se = class e extends ve {
	constructor(e) {
		let t = e.settings._drawing._use((t) => V._api._DrawingWand_Create(e._instance, t._instance)), n = V._api._DrawingWand_Dispose;
		super(t, n);
	}
	affine(e, t, n, r, i, a) {
		M.usePointer((o) => {
			V._api._DrawingWand_Affine(this._instance, e, t, n, r, i, a, o);
		});
	}
	borderColor(e) {
		M.usePointer((t) => {
			e._use((e) => {
				V._api._DrawingWand_BorderColor(this._instance, e, t);
			});
		});
	}
	color(e, t, n) {
		M.usePointer((r) => {
			V._api._DrawingWand_Color(this._instance, e, t, n, r);
		});
	}
	draw(e) {
		e.forEach((e) => {
			e.draw(this);
		}), M.usePointer((e) => {
			V._api._DrawingWand_Render(this._instance, e);
		});
	}
	fillColor(e) {
		M.usePointer((t) => {
			e._use((e) => {
				V._api._DrawingWand_FillColor(this._instance, e, t);
			});
		});
	}
	fillOpacity(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_FillOpacity(this._instance, e, t);
		});
	}
	fillRule(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_FillRule(this._instance, e, t);
		});
	}
	font(e) {
		M.usePointer((t) => {
			E(e, (e) => {
				V._api._DrawingWand_Font(this._instance, e, t);
			});
		});
	}
	fontPointSize(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_FontPointSize(this._instance, e, t);
		});
	}
	fontTypeMetrics(e, t) {
		return M.usePointer((n) => E(e, (e) => {
			let r = V._api._DrawingWand_FontTypeMetrics(this._instance, e, +!!t, n);
			return N._create(r);
		}));
	}
	gravity(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_Gravity(this._instance, e, t);
		});
	}
	line(e, t, n, r) {
		M.usePointer((i) => {
			V._api._DrawingWand_Line(this._instance, e, t, n, r, i);
		});
	}
	pathFinish() {
		M.usePointer((e) => {
			V._api._DrawingWand_PathFinish(this._instance, e);
		});
	}
	pathLineToAbs(e, t) {
		M.usePointer((n) => {
			V._api._DrawingWand_PathLineToAbs(this._instance, e, t, n);
		});
	}
	pathLineToRel(e, t) {
		M.usePointer((n) => {
			V._api._DrawingWand_PathLineToRel(this._instance, e, t, n);
		});
	}
	pathMoveToAbs(e, t) {
		M.usePointer((n) => {
			V._api._DrawingWand_PathMoveToAbs(this._instance, e, t, n);
		});
	}
	pathMoveToRel(e, t) {
		M.usePointer((n) => {
			V._api._DrawingWand_PathMoveToRel(this._instance, e, t, n);
		});
	}
	pathStart() {
		M.usePointer((e) => {
			V._api._DrawingWand_PathStart(this._instance, e);
		});
	}
	point(e, t) {
		M.usePointer((n) => {
			V._api._DrawingWand_Point(this._instance, e, t, n);
		});
	}
	rectangle(e, t, n, r) {
		M.usePointer((i) => {
			V._api._DrawingWand_Rectangle(this._instance, e, t, n, r, i);
		});
	}
	roundRectangle(e, t, n, r, i, a) {
		M.usePointer((o) => {
			V._api._DrawingWand_RoundRectangle(this._instance, e, t, n, r, i, a, o);
		});
	}
	strokeColor(e) {
		M.usePointer((t) => {
			e._use((e) => {
				V._api._DrawingWand_StrokeColor(this._instance, e, t);
			});
		});
	}
	strokeDashArray(e) {
		M.usePointer((t) => {
			be(e, (n) => {
				V._api._DrawingWand_StrokeDashArray(this._instance, n, O(e.length), t);
			});
		});
	}
	strokeDashOffset(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_StrokeDashOffset(this._instance, e, t);
		});
	}
	strokeWidth(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_StrokeWidth(this._instance, e, t);
		});
	}
	text(e, t, n) {
		M.usePointer((r) => {
			E(n, (n) => {
				V._api._DrawingWand_Text(this._instance, e, t, n, r);
			});
		});
	}
	textAlignment(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_TextAlignment(this._instance, e, t);
		});
	}
	textAntialias(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_TextAntialias(this._instance, +!!e, t);
		});
	}
	textDecoration(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_TextDecoration(this._instance, e, t);
		});
	}
	textInterlineSpacing(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_TextInterlineSpacing(this._instance, e, t);
		});
	}
	textInterwordspacing(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_TextInterwordSpacing(this._instance, e, t);
		});
	}
	textKerning(e) {
		M.usePointer((t) => {
			V._api._DrawingWand_TextKerning(this._instance, e, t);
		});
	}
	textUnderColor(e) {
		M.usePointer((t) => {
			e._use((e) => {
				V._api._DrawingWand_TextUnderColor(this._instance, e, t);
			});
		});
	}
	static _use(t, n) {
		let r = new e(t);
		return A._disposeAfterExecution(r, n);
	}
}, P = class e extends _e {
	constructor() {
		super(8, "double");
	}
	static use(t) {
		let n = new e();
		try {
			return t(n);
		} finally {
			n.free();
		}
	}
}, F = {
	Undefined: 0,
	Forget: 0,
	Northwest: 1,
	North: 2,
	Northeast: 3,
	West: 4,
	Center: 5,
	East: 6,
	Southwest: 7,
	South: 8,
	Southeast: 9
};
function* Ce(e) {
	for (let t of e) switch (t) {
		case F.North:
			yield "north";
			break;
		case F.Northeast:
			yield "north", yield "east";
			break;
		case F.Northwest:
			yield "north", yield "west";
			break;
		case F.East:
			yield "east";
			break;
		case F.West:
			yield "west";
			break;
		case F.South:
			yield "south";
			break;
		case F.Southeast:
			yield "south", yield "east";
			break;
		case F.Southwest: yield "south", yield "west";
	}
}
function we(e) {
	switch (e) {
		case F.North: return "north";
		case F.Northeast: return "northeast";
		case F.Northwest: return "northwest";
		case F.East: return "east";
		case F.West: return "west";
		case F.South: return "south";
		case F.Southeast: return "southeast";
		case F.Southwest: return "southwest";
		case F.Center: return "center";
		default: return;
	}
}
//#endregion
//#region src/types/magick-error-info.ts
var Te = class e {
	constructor(e, t, n) {
		this.meanErrorPerPixel = e, this.normalizedMeanError = t, this.normalizedMaximumError = n;
	}
	meanErrorPerPixel;
	normalizedMaximumError;
	normalizedMeanError;
	static _create(t) {
		let n = V._api._MagickImage_MeanErrorPerPixel_Get(t._instance), r = V._api._MagickImage_NormalizedMeanError_Get(t._instance), i = V._api._MagickImage_NormalizedMaximumError_Get(t._instance);
		return new e(n, r, i);
	}
}, Ee = {
	Unknown: "UNKNOWN",
	ThreeFr: "3FR",
	ThreeG2: "3G2",
	ThreeGp: "3GP",
	A: "A",
	Aai: "AAI",
	Ai: "AI",
	APng: "APNG",
	Art: "ART",
	Arw: "ARW",
	Ashlar: "ASHLAR",
	Ase: "ASE",
	Aseprite: "ASEPRITE",
	Avci: "AVCI",
	Avi: "AVI",
	Avif: "AVIF",
	Avs: "AVS",
	B: "B",
	Bayer: "BAYER",
	Bayera: "BAYERA",
	Bgr: "BGR",
	Bgra: "BGRA",
	Bgro: "BGRO",
	Bmp: "BMP",
	Bmp2: "BMP2",
	Bmp3: "BMP3",
	Brf: "BRF",
	C: "C",
	C2pa: "C2PA",
	Cal: "CAL",
	Cals: "CALS",
	Canvas: "CANVAS",
	Caption: "CAPTION",
	Cin: "CIN",
	Cip: "CIP",
	Clip: "CLIP",
	Cmyk: "CMYK",
	Cmyka: "CMYKA",
	Cr2: "CR2",
	Cr3: "CR3",
	Crw: "CRW",
	Cube: "CUBE",
	Cur: "CUR",
	Cut: "CUT",
	Data: "DATA",
	Dcm: "DCM",
	Dcr: "DCR",
	Dcraw: "DCRAW",
	Dcx: "DCX",
	Dds: "DDS",
	Dfont: "DFONT",
	Dng: "DNG",
	Dpx: "DPX",
	Dxt1: "DXT1",
	Dxt5: "DXT5",
	Epdf: "EPDF",
	Epi: "EPI",
	Eps: "EPS",
	Eps2: "EPS2",
	Eps3: "EPS3",
	Epsf: "EPSF",
	Epsi: "EPSI",
	Ept: "EPT",
	Ept2: "EPT2",
	Ept3: "EPT3",
	Erf: "ERF",
	Exr: "EXR",
	Farbfeld: "FARBFELD",
	Fax: "FAX",
	Ff: "FF",
	Fff: "FFF",
	File: "FILE",
	Fits: "FITS",
	Fl32: "FL32",
	Flv: "FLV",
	Fractal: "FRACTAL",
	Ftp: "FTP",
	Fts: "FTS",
	Ftxt: "FTXT",
	G: "G",
	G3: "G3",
	G4: "G4",
	Gif: "GIF",
	Gif87: "GIF87",
	Gradient: "GRADIENT",
	Gray: "GRAY",
	Graya: "GRAYA",
	Group4: "GROUP4",
	Hald: "HALD",
	Hdr: "HDR",
	Heic: "HEIC",
	Heif: "HEIF",
	Histogram: "HISTOGRAM",
	Hrz: "HRZ",
	Htm: "HTM",
	Html: "HTML",
	Http: "HTTP",
	Https: "HTTPS",
	Icb: "ICB",
	Ico: "ICO",
	Icon: "ICON",
	Icn: "ICN",
	Iiq: "IIQ",
	Info: "INFO",
	Inline: "INLINE",
	Ipl: "IPL",
	Isobrl: "ISOBRL",
	Isobrl6: "ISOBRL6",
	J2c: "J2C",
	J2k: "J2K",
	Jng: "JNG",
	Jnx: "JNX",
	Jp2: "JP2",
	Jpc: "JPC",
	Jpe: "JPE",
	Jpeg: "JPEG",
	Jpg: "JPG",
	Jpm: "JPM",
	Jps: "JPS",
	Jpt: "JPT",
	Json: "JSON",
	Jxl: "JXL",
	K: "K",
	K25: "K25",
	Kdc: "KDC",
	Kernel: "KERNEL",
	Label: "LABEL",
	M: "M",
	M2v: "M2V",
	M4v: "M4V",
	Mac: "MAC",
	Map: "MAP",
	Mask: "MASK",
	Mat: "MAT",
	Matte: "MATTE",
	Mdc: "MDC",
	Mef: "MEF",
	Miff: "MIFF",
	Mkv: "MKV",
	Mng: "MNG",
	Mono: "MONO",
	Mov: "MOV",
	Mos: "MOS",
	Mp4: "MP4",
	Mpc: "MPC",
	Mpeg: "MPEG",
	Mpg: "MPG",
	Mpo: "MPO",
	Mrw: "MRW",
	Msl: "MSL",
	Msvg: "MSVG",
	Mtv: "MTV",
	Mvg: "MVG",
	Nef: "NEF",
	Nrw: "NRW",
	Null: "NULL",
	O: "O",
	Ora: "ORA",
	Orf: "ORF",
	Otb: "OTB",
	Otf: "OTF",
	Pal: "PAL",
	Palm: "PALM",
	Pam: "PAM",
	Pango: "PANGO",
	Pattern: "PATTERN",
	Pbm: "PBM",
	Pcd: "PCD",
	Pcds: "PCDS",
	Pcl: "PCL",
	Pct: "PCT",
	Pcx: "PCX",
	Pdb: "PDB",
	Pdf: "PDF",
	Pdfa: "PDFA",
	Pef: "PEF",
	Pes: "PES",
	Pfa: "PFA",
	Pfb: "PFB",
	Pfm: "PFM",
	Pgm: "PGM",
	Pgx: "PGX",
	Phm: "PHM",
	Picon: "PICON",
	Pict: "PICT",
	Pix: "PIX",
	Pjpeg: "PJPEG",
	Plasma: "PLASMA",
	Png: "PNG",
	Png00: "PNG00",
	Png24: "PNG24",
	Png32: "PNG32",
	Png48: "PNG48",
	Png64: "PNG64",
	Png8: "PNG8",
	Pnm: "PNM",
	Pocketmod: "POCKETMOD",
	Ppm: "PPM",
	Ps: "PS",
	Ps2: "PS2",
	Ps3: "PS3",
	Psb: "PSB",
	Psd: "PSD",
	Ptif: "PTIF",
	Pwp: "PWP",
	Qoi: "QOI",
	R: "R",
	RadialGradient: "RADIAL-GRADIENT",
	Raf: "RAF",
	Ras: "RAS",
	Raw: "RAW",
	Rgb: "RGB",
	Rgb565: "RGB565",
	Rgba: "RGBA",
	Rgbo: "RGBO",
	Rgf: "RGF",
	Rla: "RLA",
	Rle: "RLE",
	Rmf: "RMF",
	Rw2: "RW2",
	Rwl: "RWL",
	Scr: "SCR",
	Screenshot: "SCREENSHOT",
	Sct: "SCT",
	Sf3: "SF3",
	Sfw: "SFW",
	Sgi: "SGI",
	Shtml: "SHTML",
	Six: "SIX",
	Sixel: "SIXEL",
	SparseColor: "SPARSE-COLOR",
	Sr2: "SR2",
	Srf: "SRF",
	Srw: "SRW",
	Stegano: "STEGANO",
	Sti: "STI",
	StrImg: "STRIMG",
	Sun: "SUN",
	Svg: "SVG",
	Svgz: "SVGZ",
	Text: "TEXT",
	Tga: "TGA",
	Thumbnail: "THUMBNAIL",
	Tif: "TIF",
	Tiff: "TIFF",
	Tiff64: "TIFF64",
	Tile: "TILE",
	Tim: "TIM",
	Tm2: "TM2",
	Ttc: "TTC",
	Ttf: "TTF",
	Txt: "TXT",
	Ubrl: "UBRL",
	Ubrl6: "UBRL6",
	Uil: "UIL",
	Uyvy: "UYVY",
	Vda: "VDA",
	Vicar: "VICAR",
	Vid: "VID",
	Viff: "VIFF",
	Vips: "VIPS",
	Vst: "VST",
	WebM: "WEBM",
	WebP: "WEBP",
	Wbmp: "WBMP",
	Wbinfo: "WBINFO",
	Wmv: "WMV",
	Wpg: "WPG",
	X3f: "X3F",
	Xbm: "XBM",
	Xc: "XC",
	Xcf: "XCF",
	Xpm: "XPM",
	Xps: "XPS",
	Xv: "XV",
	Y: "Y",
	Yaml: "YAML",
	Ycbcr: "YCBCR",
	Ycbcra: "YCBCRA",
	Yuv: "YUV"
}, De = {
	Undefined: 0,
	Coalesce: 1,
	CompareAny: 2,
	CompareClear: 3,
	CompareOverlay: 4,
	Dispose: 5,
	Optimize: 6,
	OptimizeImage: 7,
	OptimizePlus: 8,
	OptimizeTrans: 9,
	RemoveDups: 10,
	RemoveZero: 11,
	Composite: 12,
	Merge: 13,
	Flatten: 14,
	Mosaic: 15,
	Trimbounds: 16
}, Oe = class extends ve {
	constructor(e) {
		let t = V._api._DrawingSettings_Create(), n = V._api._DrawingSettings_Dispose;
		super(t, n);
		let r = e.affine;
		r !== void 0 && V._api._DrawingSettings_SetAffine(this._instance, r.scaleX, r.scaleY, r.shearX, r.shearY, r.translateX, r.translateY), e.borderColor !== void 0 && e.borderColor._use((e) => {
			V._api._DrawingSettings_BorderColor_Set(this._instance, e);
		}), e.fillColor !== void 0 && e.fillColor._use((e) => {
			V._api._DrawingSettings_FillColor_Set(this._instance, e);
		}), e.fillRule !== void 0 && V._api._DrawingSettings_FillRule_Set(this._instance, e.fillRule), e.font !== void 0 && E(q._getFontFileName(e.font), (e) => {
			V._api._DrawingSettings_Font_Set(this._instance, e);
		}), e.fontPointsize !== void 0 && V._api._DrawingSettings_FontPointsize_Set(this._instance, e.fontPointsize), e.strokeColor !== void 0 && e.strokeColor._use((e) => {
			V._api._DrawingSettings_StrokeColor_Set(this._instance, e);
		});
		let i = e.strokeDashArray;
		i !== void 0 && be(i, (e) => {
			V._api._DrawingSettings_SetStrokeDashArray(this._instance, e, O(i.length));
		}), e.strokeDashOffset !== void 0 && V._api._DrawingSettings_StrokeDashOffset_Set(this._instance, e.strokeDashOffset), e.strokeWidth !== void 0 && V._api._DrawingSettings_StrokeWidth_Set(this._instance, e.strokeWidth), e.textAntiAlias !== void 0 && V._api._DrawingSettings_TextAntiAlias_Set(this._instance, +!!e.textAntiAlias), e.textGravity !== void 0 && V._api._DrawingSettings_TextGravity_Set(this._instance, e.textGravity), e.textKerning !== void 0 && V._api._DrawingSettings_TextKerning_Set(this._instance, e.textKerning), e.textUnderColor !== void 0 && e.textUnderColor._use((e) => {
			V._api._DrawingSettings_TextUnderColor_Set(this._instance, e);
		});
	}
	setFillColor(e) {
		e === void 0 ? V._api._DrawingSettings_FillColor_Set(this._instance, V._api._NullPointer) : e._use((e) => {
			V._api._DrawingSettings_FillColor_Set(this._instance, e);
		});
	}
	setFillPattern(e) {
		M.usePointer((t) => {
			e === void 0 ? V._api._DrawingSettings_SetFillPattern(this._instance, V._api._NullPointer, t) : V._api._DrawingSettings_SetFillPattern(this._instance, e._instance, t);
		});
	}
}, ke = class {
	affine;
	borderColor;
	backgroundColor;
	fillColor;
	fillRule;
	font;
	fontPointsize;
	strokeColor;
	strokeDashArray;
	strokeDashOffset;
	strokeWidth;
	textAntiAlias;
	textGravity;
	textKerning;
	textUnderColor;
	_use(e) {
		let t = new Oe(this);
		return A._disposeAfterExecution(t, e);
	}
}, Ae = {
	Undefined: 0,
	EvenOdd: 1,
	NonZero: 2
}, je = class extends ve {
	constructor(e) {
		let t = V._api._MagickSettings_Create(), n = V._api._MagickSettings_Dispose;
		super(t, n), e._colorFuzz !== void 0 && V._api._MagickSettings_SetColorFuzz(this._instance, e._colorFuzz), e._fileName !== void 0 && E(e._fileName, (e) => {
			V._api._MagickSettings_SetFileName(this._instance, e);
		}), e._ping && V._api._MagickSettings_SetPing(this._instance, 1), e._quality !== void 0 && V._api._MagickSettings_SetQuality(this._instance, O(e._quality)), e.antiAlias !== void 0 && V._api._MagickSettings_AntiAlias_Set(this._instance, +!!e.antiAlias), e.backgroundColor !== void 0 && e.backgroundColor._use((e) => {
			V._api._MagickSettings_BackgroundColor_Set(this._instance, e);
		}), e.colorSpace !== void 0 && V._api._MagickSettings_ColorSpace_Set(this._instance, e.colorSpace), e.colorType !== void 0 && V._api._MagickSettings_ColorType_Set(this._instance, e.colorType), e.compression !== void 0 && V._api._MagickSettings_Compression_Set(this._instance, e.compression), e.debug !== void 0 && V._api._MagickSettings_Debug_Set(this._instance, +!!e.debug), e.density !== void 0 && E(e.density.toString(), (e) => {
			V._api._MagickSettings_Density_Set(this._instance, e);
		}), e.depth !== void 0 && V._api._MagickSettings_Depth_Set(this._instance, O(e.depth)), e.endian !== void 0 && V._api._MagickSettings_Endian_Set(this._instance, e.endian), e.fillColor !== void 0 && this.setOption("fill", e.fillColor.toString()), e.font !== void 0 && E(q._getFontFileName(e.font), (e) => {
			V._api._MagickSettings_SetFont(this._instance, e);
		}), e.fontPointsize !== void 0 && V._api._MagickSettings_FontPointsize_Set(this._instance, e.fontPointsize), e.format !== void 0 && E(e.format, (e) => {
			V._api._MagickSettings_Format_Set(this._instance, e);
		}), e.interlace !== void 0 && V._api._MagickSettings_Interlace_Set(this._instance, e.interlace), e.page !== void 0 && E(e.page.toString(), (e) => {
			V._api._MagickSettings_SetPage(this._instance, e);
		}), e.strokeColor !== void 0 && this.setOption("stroke", e.strokeColor.toString()), e.strokeWidth !== void 0 && this.setOption("strokeWidth", e.strokeWidth.toString()), e.textInterlineSpacing !== void 0 && this.setOption("interline-spacing", e.textInterlineSpacing.toString());
		for (let t in e._options) this.setOption(t, e._options[t]);
	}
	setOption(e, t) {
		E(e, (e) => {
			E(t, (t) => {
				V._api._MagickSettings_SetOption(this._instance, e, t);
			});
		});
	}
}, Me = class e {
	_colorFuzz;
	_drawing = new ke();
	_fileName;
	_onArtifact;
	_options = {};
	_ping = !1;
	_quality;
	get affine() {
		return this._drawing.affine;
	}
	set affine(e) {
		this._drawing.affine = e;
	}
	antiAlias;
	backgroundColor;
	get borderColor() {
		return this._drawing.borderColor;
	}
	set borderColor(e) {
		this._drawing.borderColor = e;
	}
	colorSpace;
	colorType;
	compression;
	debug;
	density;
	depth;
	endian;
	get fillColor() {
		return this._drawing.fillColor;
	}
	set fillColor(e) {
		this.setDefineAndArtifact("fill", e?.toString()), this._drawing.fillColor = e;
	}
	get fillRule() {
		return this._drawing.fillRule ?? Ae.Undefined;
	}
	set fillRule(e) {
		this._drawing.fillRule = e;
	}
	get font() {
		return this._drawing.font;
	}
	set font(e) {
		this._drawing.font = e;
	}
	get fontPointsize() {
		return this._drawing.fontPointsize;
	}
	set fontPointsize(e) {
		this._drawing.fontPointsize = e;
	}
	format;
	interlace;
	page;
	get strokeColor() {
		return this._drawing.strokeColor;
	}
	set strokeColor(e) {
		this._drawing.strokeColor = e;
	}
	get strokeDashArray() {
		return this._drawing.strokeDashArray;
	}
	set strokeDashArray(e) {
		this._drawing.strokeDashArray = e;
	}
	get strokeDashOffset() {
		return this._drawing.strokeDashOffset;
	}
	set strokeDashOffset(e) {
		this._drawing.strokeDashOffset = e;
	}
	get strokeWidth() {
		return this._drawing.strokeWidth;
	}
	set strokeWidth(e) {
		this.setDefineAndArtifact("stroke", e?.toString()), this._drawing.strokeWidth = e;
	}
	get textAntiAlias() {
		return this._drawing.textAntiAlias;
	}
	set textAntiAlias(e) {
		this._drawing.textAntiAlias = e;
	}
	textInterlineSpacing;
	get textKerning() {
		return this._drawing.textKerning;
	}
	set textKerning(e) {
		this.setDefineAndArtifact("kerning", e?.toString()), this._drawing.textKerning = e;
	}
	get textGravity() {
		return this._drawing.textGravity;
	}
	set textGravity(e) {
		this.setDefineAndArtifact("gravity", we(e)), this._drawing.textGravity = e;
	}
	get textUnderColor() {
		return this._drawing.textUnderColor;
	}
	set textUnderColor(e) {
		this._drawing.textUnderColor = e;
	}
	getDefine(e, t) {
		return t === void 0 ? this._options[e] ?? null : this._options[`${e}:${t}`] ?? null;
	}
	removeDefine(e, t) {
		if (t === void 0) delete this._options[e];
		else {
			let n = this.parseDefine(e, t);
			delete this._options[n];
		}
	}
	setDefine(e, t, n) {
		if (n === void 0) this._options[e] = t;
		else {
			let r = this.parseDefine(e, t);
			typeof n == "string" ? this._options[r] = n : typeof n == "number" ? this._options[r] = n.toString() : this._options[r] = n ? "true" : "false";
		}
	}
	setDefines(e) {
		e.getDefines().forEach((e) => {
			e !== void 0 && this.setDefine(e.format, e.name, e.value);
		});
	}
	_clone() {
		let t = new e();
		return Object.assign(t, this), t;
	}
	_use(e) {
		let t = new je(this);
		return A._disposeAfterExecution(t, e);
	}
	parseDefine(e, t) {
		return e === Ee.Unknown ? t : `${e}:${t}`;
	}
	setDefineAndArtifact(e, t) {
		t === void 0 ? this.removeDefine(e) : this.setDefine(e, t), this._onArtifact !== void 0 && this._onArtifact(e, t);
	}
}, I = class extends Me {
	constructor(e) {
		super(), Object.assign(this, e);
	}
	extractArea;
	frameIndex;
	frameCount;
	height;
	get syncImageWithExifProfile() {
		let e = this.getDefine("exif:sync-image");
		return e === null || e.toLowerCase() === "true";
	}
	set syncImageWithExifProfile(e) {
		this.setDefine("exif:sync-image", e.toString());
	}
	get syncImageWithTiffProperties() {
		let e = this.getDefine("tiff:sync-image");
		return e === null || e.toLowerCase() === "true";
	}
	set syncImageWithTiffProperties(e) {
		this.setDefine("tiff:sync-image", e.toString());
	}
	width;
	_use(e) {
		let t = new je(this), n = this.getSize();
		if (n !== "" && E(n, (e) => {
			V._api._MagickSettings_SetSize(t._instance, e);
		}), this.frameIndex !== void 0 || this.frameCount !== void 0) {
			let e = O(this.frameIndex ?? 0), n = O(this.frameCount ?? 1);
			V._api._MagickSettings_SetScene(t._instance, e), V._api._MagickSettings_SetNumberScenes(t._instance, n), E((this.frameCount === void 0 ? e.toString() : `${e}-${Number(e) + Number(n)}`).toString(), (e) => {
				V._api._MagickSettings_SetScenes(t._instance, e);
			});
		}
		return this.extractArea !== void 0 && E(this.extractArea.toString(), (e) => {
			V._api._MagickSettings_Extract_Set(t._instance, e);
		}), A._disposeAfterExecution(t, e);
	}
	getSize() {
		return this.width !== void 0 && this.height !== void 0 ? `${this.width}x${this.height}` : this.width === void 0 ? this.height === void 0 ? "" : `x${this.height}` : `${this.width}x`;
	}
}, Ne = {
	Undefined: 0,
	No: 1,
	Riemersma: 2,
	FloydSteinberg: 3
}, Pe = class extends ve {
	constructor(e) {
		let t = V._api._QuantizeSettings_Create(), n = V._api._QuantizeSettings_Dispose;
		super(t, n), V._api._QuantizeSettings_SetColors(this._instance, O(e.colors)), V._api._QuantizeSettings_SetColorSpace(this._instance, e.colorSpace), V._api._QuantizeSettings_SetDitherMethod(this._instance, e.ditherMethod ?? Ne.No), V._api._QuantizeSettings_SetMeasureErrors(this._instance, +!!e.measureErrors), V._api._QuantizeSettings_SetTreeDepth(this._instance, O(e.treeDepth));
	}
}, Fe = class {
	constructor() {
		this.colors = 256, this.colorSpace = g.Undefined, this.ditherMethod = Ne.Riemersma, this.measureErrors = !1, this.treeDepth = 0;
	}
	colors;
	colorSpace;
	ditherMethod;
	measureErrors;
	treeDepth;
	_use(e) {
		let t = new Pe(this);
		return A._disposeAfterExecution(t, e);
	}
}, Ie = class e {
	_image;
	_names = [];
	constructor(e) {
		this._image = e;
	}
	setArtifact(e, t) {
		this._names.push(e), this._image.setArtifact(e, t);
	}
	static use(t, n) {
		let r = new e(t);
		try {
			return n(r);
		} finally {
			r.dispose();
		}
	}
	dispose() {
		for (let e of this._names) this._image.removeArtifact(e);
	}
}, L = class e extends Array {
	constructor() {
		super();
	}
	static create(t) {
		let n = e.createObject();
		return t !== void 0 && n.read(t), n;
	}
	dispose() {
		let e = this.pop();
		for (; e !== void 0;) e.dispose(), e = this.pop();
	}
	appendHorizontally(e) {
		return this.createImage((e, t) => V._api._MagickImageCollection_Append(e, 0, t.ptr), e);
	}
	appendVertically(e) {
		return this.createImage((e, t) => V._api._MagickImageCollection_Append(e, 1, t.ptr), e);
	}
	clone(t) {
		return e.use((e) => {
			for (let t = 0; t < this.length; t++) e.push(Ye._clone(this[t]));
			return t(e);
		});
	}
	coalesce() {
		this.replaceImages((e, t) => V._api._MagickImageCollection_Coalesce(e, t.ptr));
	}
	combine(e, t) {
		let n = t, r = g.sRGB;
		return typeof e == "number" ? r = e : n = e, this.createImage((e, t) => V._api._MagickImageCollection_Combine(e, r, t.ptr), n);
	}
	complex(e, t) {
		return Ie.use(this[0], (n) => (e._setArtifacts(n), this.createImage((t, n) => V._api._MagickImageCollection_Complex(t, e.complexOperator, n.ptr), t)));
	}
	deconstruct() {
		this.replaceImages((e, t) => V._api._MagickImageCollection_Deconstruct(e, t.ptr));
	}
	evaluate(e, t) {
		return this.createImage((t, n) => V._api._MagickImageCollection_Evaluate(t, O(e), n.ptr), t);
	}
	flatten(e) {
		return this.mergeImages(De.Flatten, e);
	}
	fx(e, t, n) {
		this.throwIfEmpty();
		let r = h.All, i = n;
		return typeof t == "number" ? r = t : i = t, E(e, (e) => this.createImage((t, n) => V._api._MagickImageCollection_Fx(t, e, O(r), n.ptr), i));
	}
	merge(e) {
		return this.mergeImages(De.Merge, e);
	}
	montage(t, n) {
		return this.throwIfEmpty(), this.attachImages((r) => {
			let i = t._use((e) => M.use((t) => {
				let n = V._api._MagickImageCollection_Montage(r, e._instance, t.ptr);
				return this.checkResult(n, t);
			}));
			return e._createFromImages(i, this.getSettings(), (e) => {
				let r = t.transparentColor;
				return r !== void 0 && e.forEach((e) => {
					e.transparent(r);
				}), e.merge(n);
			});
		});
	}
	morph(e) {
		if (this.length < 2) throw new S("operation requires at least two images");
		this.replaceImages((t, n) => V._api._MagickImageCollection_Morph(t, O(e), n.ptr));
	}
	mosaic(e) {
		return this.mergeImages(De.Mosaic, e);
	}
	optimize() {
		this.replaceImages((e, t) => V._api._MagickImageCollection_Optimize(e, t.ptr));
	}
	optimizePlus() {
		this.replaceImages((e, t) => V._api._MagickImageCollection_OptimizePlus(e, t.ptr));
	}
	optimizeTransparency() {
		this.throwIfEmpty(), this.attachImages((e) => {
			M.usePointer((t) => {
				V._api._MagickImageCollection_OptimizeTransparency(e, t);
			});
		});
	}
	ping(e, t) {
		this.readOrPing(!0, e, t);
	}
	polynomial(e, t) {
		return this.createImage((t, n) => be(e, (r) => V._api._MagickImageCollection_Polynomial(t, r, O(e.length), n.ptr)), t);
	}
	quantize(e) {
		this.throwIfEmpty();
		let t = e === void 0 ? new Fe() : e;
		return this.attachImages((e) => {
			t._use((t) => {
				M.usePointer((n) => {
					V._api._MagickImageCollection_Quantize(e, t._instance, n);
				});
			});
		}), t.measureErrors ? Te._create(this[0]) : null;
	}
	read(e, t) {
		this.readOrPing(!1, e, t);
	}
	remap(e, t) {
		this.throwIfEmpty();
		let n = t === void 0 ? new Fe() : t;
		this.attachImages((t) => {
			n._use((n) => {
				M.use((r) => {
					V._api._MagickImageCollection_Remap(t, n._instance, e._instance, r.ptr);
				});
			});
		});
	}
	resetPage() {
		this.forEach((e) => {
			e.resetPage();
		});
	}
	smushHorizontal(e, t) {
		return this.smush(e, !1, t);
	}
	smushVertical(e, t) {
		return this.smush(e, !0, t);
	}
	trimBounds() {
		this.mergeImages(De.Trimbounds, () => {});
	}
	static use(t) {
		let n = e.create();
		return A._disposeAfterExecution(n, t);
	}
	write(e, t) {
		this.throwIfEmpty();
		let n = V._api._NullPointer, r = 0, i = this[0], a = this.getSettings();
		t === void 0 ? (t = e, a.format = i.format) : a.format = e, M.use((e) => {
			j.use((t) => {
				a._use((i) => {
					this.attachImages((a) => {
						n = V._api._MagickImage_WriteBlob(a, i._instance, t.ptr, e.ptr), r = Number(t.value);
					});
				});
			});
		});
		let o = new ge(n, r, t);
		return A._disposeAfterExecution(o, o.func);
	}
	static _createFromImages(t, n, r) {
		let i = e.createObject();
		return i.addImages(t, n._clone()), r(i);
	}
	addImages(e, t) {
		t.format = Ee.Unknown;
		let n = e;
		for (; n !== V._api._NullPointer;) {
			let e = V._api._MagickImage_GetNext(n);
			V._api._MagickImage_SetNext(n, V._api._NullPointer), this.push(Ye._createFromImage(n, t)), n = e;
		}
	}
	attachImages(e) {
		try {
			for (let e = 0; e < this.length - 1; e++) V._api._MagickImage_SetNext(this[e]._instance, this[e + 1]._instance);
			return e(this[0]._instance);
		} finally {
			for (let e = 0; e < this.length - 1; e++) V._api._MagickImage_SetNext(this[e]._instance, V._api._NullPointer);
		}
	}
	checkResult(e, t) {
		return t.check(() => e, () => (V._api._MagickImageCollection_Dispose(e), V._api._NullPointer));
	}
	static createObject() {
		return Object.create(e.prototype);
	}
	createImage(e, t) {
		this.throwIfEmpty();
		let n = this.attachImages((t) => M.use((n) => {
			let r = e(t, n);
			return this.checkResult(r, n);
		}));
		return Ye._createFromImage(n, this.getSettings())._use(t);
	}
	getSettings() {
		return this[0]._getSettings()._clone();
	}
	mergeImages(e, t) {
		return this.createImage((t, n) => V._api._MagickImageCollection_Merge(t, O(e), n.ptr), t);
	}
	readOrPing(e, t, n) {
		this.dispose(), M.use((r) => {
			let i = n === void 0 ? new I() : new I(n);
			i._ping = e, typeof t == "string" ? (i._fileName = t, i._use((e) => {
				let t = V._api._MagickImageCollection_ReadFile(e._instance, r.ptr);
				this.addImages(t, i);
			})) : i._use((e) => {
				let n = t.byteLength, a = 0;
				try {
					a = V._api._malloc(n), V._api.HEAPU8.set(t, a);
					let o = O(a), s = V._api._MagickImageCollection_ReadBlob(e._instance, o, V._api._NullPointer, O(n), r.ptr);
					this.addImages(s, i);
				} finally {
					a !== 0 && V._api._free(a);
				}
			});
		});
	}
	replaceImages(e) {
		this.throwIfEmpty();
		let t = this.attachImages((t) => M.use((n) => {
			let r = e(t, n);
			return this.checkResult(r, n);
		})), n = this.getSettings()._clone();
		this.dispose(), this.addImages(t, n);
	}
	smush(e, t, n) {
		return this.createImage((n, r) => V._api._MagickImageCollection_Smush(n, O(e), +!!t, r.ptr), n);
	}
	throwIfEmpty() {
		if (this.length === 0) throw new S("operation requires at least one image");
	}
}, R = class e {
	_value;
	constructor(e) {
		this._value = e;
	}
	static _fromQuantum(t) {
		return new e(t / ce.max * 100);
	}
	multiply(e) {
		return e * this._value / 100;
	}
	toDouble() {
		return this._value;
	}
	toString() {
		return `${parseFloat(this._value.toFixed(2))}%`;
	}
	_toQuantum() {
		return ce.max * (this._value / 100);
	}
}, Le = class {
	static use(e, t, n) {
		let r = V._api._MagickRectangle_Create();
		try {
			V._api._MagickRectangle_X_Set(r, O(t.x)), V._api._MagickRectangle_Y_Set(r, O(t.y));
			let i = t.width, a = t.height;
			return t.isPercentage && (i = new R(t.width).multiply(e.width), a = new R(t.height).multiply(e.height)), V._api._MagickRectangle_Width_Set(r, O(i)), V._api._MagickRectangle_Height_Set(r, O(a)), n(r);
		} finally {
			V._api._MagickRectangle_Dispose(r);
		}
	}
}, Re = class {
	static _use(e, t, n) {
		let r = V._api._NullPointer;
		try {
			return r = V._api._OffsetInfo_Create(), V._api._PrimaryInfo_X_Set(r, e), V._api._PrimaryInfo_Y_Set(r, t), n(r);
		} finally {
			V._api._free(Number(r));
		}
	}
}, ze = class {
	_values;
	constructor() {
		this._values = Array(7).fill(0);
	}
	get(e) {
		return this._values[e];
	}
	set(e, t) {
		this._values[e] = t;
	}
}, Be = class e {
	_huPhashes = /* @__PURE__ */ new Map();
	_hash = "";
	channel;
	constructor(e, t, n) {
		if (this.channel = e, typeof n == "string") this.parseHash(t, n);
		else for (let e = 0; e < t.length; e++) {
			let r = new ze();
			for (let t = 0; t < 7; t++) {
				let i = V._api._ChannelPerceptualHash_GetHuPhash(n, O(e), O(t));
				r.set(t, i);
			}
			this._huPhashes.set(t[e], r);
		}
	}
	huPhash(e, t) {
		if (t < 0 || t > 6) throw new S("Invalid index specified");
		let n = this._huPhashes.get(e);
		if (n === void 0) throw new S("Invalid color space specified");
		return n.get(t);
	}
	sumSquaredDistance(e) {
		let t = 0;
		return this._huPhashes.forEach((n, r) => {
			for (let i = 0; i < 7; i++) {
				let a = n.get(i), o = e.huPhash(r, i);
				t += (a - o) * (a - o);
			}
		}), t;
	}
	toString() {
		return this._hash == "" && this.setHash(), this._hash;
	}
	parseHash(t, n) {
		this._hash = n;
		let r = 0;
		for (let i of t) {
			let t = new ze();
			for (let i = 0; i < 7; i++, r += 5) {
				let a = Number.parseInt(n.substring(r, r + 5), 16);
				if (isNaN(a)) throw new S("Invalid hash specified");
				let o = a / e.powerOfTen(a >> 17);
				a & 65536 && (o = -o), t.set(i, o);
			}
			this._huPhashes.set(i, t);
		}
	}
	static powerOfTen(e) {
		switch (e) {
			case 2: return 100;
			case 3: return 1e3;
			case 4: return 1e4;
			case 5: return 1e5;
			case 6: return 1e6;
			default: return 10;
		}
	}
	setHash() {
		this._hash = "", this._huPhashes.forEach((e) => {
			for (let t = 0; t < 7; t++) {
				let n = e.get(t), r = 0;
				for (; r < 7 && Math.abs(n * 10) < 65356;) n *= 10, r++;
				r <<= 1, r < 0 && (r |= 1), r = (r << 16) + Math.floor(n < 0 ? -(n - .5) : n + .5), this._hash += r.toString(16);
			}
		});
	}
}, Ve = class e {
	_red;
	_green;
	_blue;
	constructor(t, n, r) {
		if (typeof t == "string") {
			let r = n ?? e._defaultColorspaces();
			e._validateColorSpaces(r);
			let i = 35 * r.length;
			if (t.length !== 3 * i) throw new S("Invalid hash size");
			this._red = new Be(m.Red, r, t.substring(0, i)), this._blue = new Be(m.Blue, r, t.substring(i, i + i)), this._green = new Be(m.Green, r, t.substring(i + i));
		} else this._red = t, this._green = n, this._blue = r;
	}
	static _create(t, n, r) {
		if (r === V._api._NullPointer) throw new S("The native operation failed to create an instance");
		let i = e.createChannel(t, n, r, m.Red), a = e.createChannel(t, n, r, m.Green), o = e.createChannel(t, n, r, m.Blue);
		return new e(i, a, o);
	}
	static _defaultColorspaces() {
		return [g.XyY, g.HSB];
	}
	static _validateColorSpaces(e) {
		if (e.length < 1 || e.length > 6) throw new S("Invalid number of colorspaces, the minimum is 1 and the maximum is 6");
		if (new Set(e).size !== e.length) throw new S("Specifying the same colorspace more than once is not allowed");
	}
	getChannel(e) {
		switch (e) {
			case m.Red: return this._red;
			case m.Green: return this._green;
			case m.Blue: return this._blue;
			default: return null;
		}
	}
	sumSquaredDistance(e) {
		let t = e.getChannel(m.Red), n = e.getChannel(m.Green), r = e.getChannel(m.Blue);
		if (t === null || n === null || r === null) throw new S("The other perceptual hash should contain a red, green and blue channel.");
		return this._red.sumSquaredDistance(t) + this._green.sumSquaredDistance(n) + this._blue.sumSquaredDistance(r);
	}
	toString() {
		return this._red.toString() + this._green.toString() + this._blue.toString();
	}
	static createChannel(e, t, n, r) {
		return new Be(r, t, V._api._PerceptualHash_GetInstance(e._instance, n, O(r)));
	}
}, He = class e extends ve {
	image;
	constructor(e) {
		let t = M.usePointer((t) => V._api._PixelCollection_Create(e._instance, t)), n = V._api._PixelCollection_Dispose;
		super(t, n), this.image = e;
	}
	static _create(t) {
		return new e(t);
	}
	static _use(t, n) {
		let r = new e(t);
		return A._disposeAfterExecution(r, n);
	}
	static _map(t, n, r) {
		let i = new e(t);
		try {
			i.use(0, 0, t.width, t.height, n, (e) => {
				r(Number(e));
			});
		} finally {
			i.dispose();
		}
	}
	getArea(e, t, n, r) {
		return M.usePointer((i) => {
			let a = Number(V._api._PixelCollection_GetArea(this._instance, O(e), O(t), O(n), O(r), i)), o = Number(n * r * this.image.channelCount);
			return V._api.HEAPU8.subarray(a, a + o);
		});
	}
	getReadOnlyArea(e, t, n, r) {
		return M.usePointer((i) => {
			let a = Number(V._api._PixelCollection_GetReadOnlyArea(this.image._instance, O(e), O(t), O(n), O(r), i)), o = Number(n * r * this.image.channelCount);
			return V._api.HEAPU8.subarray(a, a + o);
		});
	}
	getChannelIndex(e) {
		return this.image._channelOffset(e);
	}
	getColor(e, t) {
		let n = this.getArea(e, t, 1, 1), r = Array.from(n), i = this.image._channelOffset(m.Index);
		if (i >= 0 && r.splice(i, 1), r.length === 0) return null;
		if (r.length === 1) return new D(r[0], r[0], r[0]);
		if (r.length === 2) return new D(r[0], r[0], r[0], r[1]);
		let a = this.image._channelOffset(m.Black) >= 0, o = this.image._channelOffset(m.Alpha) >= 0;
		return a ? r.length === 4 || !o ? new D(r[0], r[1], r[2], r[3], ce.max) : new D(r[0], r[1], r[2], r[3], r[4]) : r.length === 3 || !o ? new D(r[0], r[1], r[2]) : new D(r[0], r[1], r[2], r[3]);
	}
	getPixel(e, t) {
		return this.getArea(e, t, 1, 1);
	}
	setArea(e, t, n, r, i) {
		M.usePointer((a) => {
			let o = i instanceof Uint8Array ? i : new Uint8Array(i);
			xe(o, (i) => {
				let s = O(o.length);
				V._api._PixelCollection_SetArea(this._instance, O(e), O(t), O(n), O(r), i, s, a);
			});
		});
	}
	setPixel(e, t, n) {
		n instanceof Uint8Array, this.setArea(e, t, 1, 1, n);
	}
	toByteArray(e, t, n, r, i) {
		return this.use(e, t, n, r, i, (e) => {
			if (e === V._api._NullPointer) return null;
			let t = Number(n * r * i.length), a = Number(e);
			return V._api.HEAPU8.slice(a, a + t);
		});
	}
	use(e, t, n, r, i, a) {
		return E(i, (i) => M.use((o) => {
			let s = V._api._PixelCollection_ToByteArray(this._instance, O(e), O(t), O(n), O(r), i, o.ptr);
			return o.check(() => {
				let e = a(s);
				return s = V._api._MagickMemory_Relinquish(s), e;
			}, () => (s = V._api._MagickMemory_Relinquish(s), null));
		}));
	}
}, Ue = {
	Undefined: 0,
	Average: 1,
	Brightness: 2,
	Lightness: 3,
	MS: 4,
	Rec601Luma: 5,
	Rec601Luminance: 6,
	Rec709Luma: 7,
	Rec709Luminance: 8,
	RMS: 9
}, We = {
	Undefined: 0,
	Average: 1,
	Average9: 2,
	Average16: 3,
	Background: 4,
	Bilinear: 5,
	Blend: 6,
	Catrom: 7,
	Integer: 8,
	Mesh: 9,
	Nearest: 10,
	Spline: 11
}, Ge = class e {
	constructor(e, t, n) {
		this.x = e, this.y = t, this.z = n;
	}
	x;
	y;
	z;
	static _create(t) {
		return t === V._api._NullPointer ? new e(0, 0, 0) : new e(V._api._PrimaryInfo_X_Get(t), V._api._PrimaryInfo_Y_Get(t), V._api._PrimaryInfo_Z_Get(t));
	}
	_use(e) {
		let t = V._api._NullPointer;
		try {
			t = V._api._PrimaryInfo_Create(), V._api._PrimaryInfo_X_Set(t, this.x), V._api._PrimaryInfo_Y_Set(t, this.y), V._api._PrimaryInfo_Z_Set(t, this.z), e(t);
		} finally {
			V._api._PrimaryInfo_Dispose(t);
		}
	}
}, z = class {
	channel;
	depth;
	entropy;
	kurtosis;
	maximum;
	mean;
	minimum;
	skewness;
	standardDeviation;
	constructor(e, t) {
		this.channel = e, this.depth = Number(V._api._ChannelStatistics_Depth_Get(t)), this.entropy = V._api._ChannelStatistics_Entropy_Get(t), this.kurtosis = V._api._ChannelStatistics_Kurtosis_Get(t), this.maximum = V._api._ChannelStatistics_Maximum_Get(t), this.mean = V._api._ChannelStatistics_Mean_Get(t), this.minimum = V._api._ChannelStatistics_Minimum_Get(t), this.skewness = V._api._ChannelStatistics_Skewness_Get(t), this.standardDeviation = V._api._ChannelStatistics_StandardDeviation_Get(t);
	}
}, Ke = class e {
	_channels = /* @__PURE__ */ new Map();
	get channels() {
		return Array.from(this._channels.keys());
	}
	composite() {
		return this._channels.get(m.Composite);
	}
	getChannel(e) {
		let t = this._channels.get(e);
		return t === void 0 ? null : t;
	}
	static _create(t, n, r) {
		let i = new e();
		return t.channels.forEach((e) => {
			r >> e & 1 && i.addChannel(n, e);
		}), i.addChannel(n, m.Composite), i;
	}
	addChannel(e, t) {
		let n = V._api._Statistics_GetInstance(e, O(t));
		n !== V._api._NullPointer && this._channels.set(t, new z(t, n));
	}
}, qe = class {
	static toArray(e) {
		if (e === V._api._NullPointer) return null;
		let t = Number(V._api._StringInfo_Datum_Get(e)), n = Number(V._api._StringInfo_Length_Get(e));
		return V._api.HEAPU8.subarray(t, t + n);
	}
}, Je = class {
	constructor(e) {
		this.error = e;
	}
	error;
}, Ye = class t extends ve {
	_settings;
	_progress;
	_warning;
	constructor(e, t) {
		super(e, V._api._MagickImage_Dispose), this._settings = t, this._settings._onArtifact = this.onSettingsArtifactChanged.bind(this);
	}
	get animationDelay() {
		return Number(V._api._MagickImage_AnimationDelay_Get(this._instance));
	}
	set animationDelay(e) {
		V._api._MagickImage_AnimationDelay_Set(this._instance, O(e));
	}
	get animationIterations() {
		return Number(V._api._MagickImage_AnimationIterations_Get(this._instance));
	}
	set animationIterations(e) {
		V._api._MagickImage_AnimationIterations_Set(this._instance, O(e));
	}
	get animationTicksPerSecond() {
		return Number(V._api._MagickImage_AnimationTicksPerSecond_Get(this._instance));
	}
	set animationTicksPerSecond(e) {
		V._api._MagickImage_AnimationTicksPerSecond_Set(this._instance, O(e));
	}
	get artifactNames() {
		let e = [];
		V._api._MagickImage_ResetArtifactIterator(this._instance);
		let t = V._api._MagickImage_GetNextArtifactName(this._instance);
		for (; t !== V._api._NullPointer;) e.push(w(t)), t = V._api._MagickImage_GetNextArtifactName(this._instance);
		return e;
	}
	get attributeNames() {
		let e = [];
		V._api._MagickImage_ResetAttributeIterator(this._instance);
		let t = V._api._MagickImage_GetNextAttributeName(this._instance);
		for (; t !== V._api._NullPointer;) e.push(w(t)), t = V._api._MagickImage_GetNextAttributeName(this._instance);
		return e;
	}
	get backgroundColor() {
		let e = V._api._MagickImage_BackgroundColor_Get(this._instance);
		return D._create(e);
	}
	set backgroundColor(e) {
		e._use((e) => {
			V._api._MagickImage_BackgroundColor_Set(this._instance, e);
		});
	}
	get baseHeight() {
		return Number(V._api._MagickImage_BaseHeight_Get(this._instance));
	}
	get baseWidth() {
		return Number(V._api._MagickImage_BaseWidth_Get(this._instance));
	}
	get blackPointCompensation() {
		return V._api._MagickImage_BlackPointCompensation_Get(this._instance) === 1;
	}
	set blackPointCompensation(e) {
		V._api._MagickImage_BlackPointCompensation_Set(this._instance, +!!e);
	}
	get borderColor() {
		let e = V._api._MagickImage_BorderColor_Get(this._instance);
		return D._create(e);
	}
	set borderColor(e) {
		e._use((e) => {
			V._api._MagickImage_BorderColor_Set(this._instance, e);
		});
	}
	get boundingBox() {
		return this.useExceptionPointer((e) => {
			let t = V._api._MagickImage_BoundingBox_Get(this._instance, e), n = de._fromRectangle(t);
			return n.width === 0 || n.height === 0 ? null : n;
		});
	}
	get channelCount() {
		return Number(V._api._MagickImage_ChannelCount_Get(this._instance));
	}
	get channels() {
		let e = [];
		return [
			m.Red,
			m.Green,
			m.Blue,
			m.Black,
			m.Alpha
		].forEach((t) => {
			V._api._MagickImage_HasChannel(this._instance, O(t)) && e.push(t);
		}), e;
	}
	get chromaticity() {
		return new te(Ge._create(V._api._MagickImage_ChromaRed_Get(this._instance)), Ge._create(V._api._MagickImage_ChromaGreen_Get(this._instance)), Ge._create(V._api._MagickImage_ChromaBlue_Get(this._instance)), Ge._create(V._api._MagickImage_ChromaWhite_Get(this._instance)));
	}
	set chromaticity(e) {
		e.blue._use((e) => V._api._MagickImage_ChromaBlue_Set(this._instance, e)), e.green._use((e) => V._api._MagickImage_ChromaGreen_Set(this._instance, e)), e.red._use((e) => V._api._MagickImage_ChromaRed_Set(this._instance, e)), e.white._use((e) => V._api._MagickImage_ChromaWhite_Set(this._instance, e));
	}
	get classType() {
		return Number(V._api._MagickImage_ClassType_Get(this._instance));
	}
	set classType(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_ClassType_Set(this._instance, O(e), t);
		});
	}
	get colorFuzz() {
		return R._fromQuantum(V._api._MagickImage_ColorFuzz_Get(this._instance));
	}
	set colorFuzz(e) {
		let t = e._toQuantum();
		V._api._MagickImage_ColorFuzz_Set(this._instance, t), this._settings._colorFuzz = t;
	}
	get colormapSize() {
		return Number(V._api._MagickImage_ColormapSize_Get(this._instance));
	}
	set colormapSize(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_ColormapSize_Set(this._instance, O(e), t);
		});
	}
	get colorSpace() {
		return Number(V._api._MagickImage_ColorSpace_Get(this._instance));
	}
	set colorSpace(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_ColorSpace_Set(this._instance, O(e), t);
		});
	}
	get colorType() {
		return this.settings.colorType === void 0 ? Number(V._api._MagickImage_ColorType_Get(this._instance)) : this.settings.colorType;
	}
	set colorType(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_ColorType_Set(this._instance, O(e), t);
		});
	}
	get comment() {
		return this.getAttribute("comment");
	}
	set comment(e) {
		e === null ? this.removeAttribute("comment") : this.setAttribute("comment", e);
	}
	get compose() {
		return Number(V._api._MagickImage_Compose_Get(this._instance));
	}
	set compose(e) {
		V._api._MagickImage_Compose_Set(this._instance, O(e));
	}
	get compression() {
		return Number(V._api._MagickImage_Compression_Get(this._instance));
	}
	get density() {
		return new k(V._api._MagickImage_ResolutionX_Get(this._instance), V._api._MagickImage_ResolutionY_Get(this._instance), Number(V._api._MagickImage_ResolutionUnits_Get(this._instance)));
	}
	set density(e) {
		V._api._MagickImage_ResolutionX_Set(this._instance, e.x), V._api._MagickImage_ResolutionY_Set(this._instance, e.y), V._api._MagickImage_ResolutionUnits_Set(this._instance, O(e.units));
	}
	get depth() {
		return Number(V._api._MagickImage_Depth_Get(this._instance));
	}
	set depth(e) {
		V._api._MagickImage_Depth_Set(this._instance, O(e));
	}
	get endian() {
		return Number(V._api._MagickImage_Endian_Get(this._instance));
	}
	set endian(e) {
		V._api._MagickImage_Endian_Set(this._instance, O(e));
	}
	get fileName() {
		return C(V._api._MagickImage_FileName_Get(this._instance));
	}
	get filterType() {
		return Number(V._api._MagickImage_FilterType_Get(this._instance));
	}
	set filterType(e) {
		V._api._MagickImage_FilterType_Set(this._instance, O(e));
	}
	get format() {
		return C(V._api._MagickImage_Format_Get(this._instance), "");
	}
	set format(e) {
		E(e.toString(), (e) => V._api._MagickImage_Format_Set(this._instance, e));
	}
	get gamma() {
		return V._api._MagickImage_Gamma_Get(this._instance);
	}
	get gifDisposeMethod() {
		return Number(V._api._MagickImage_GifDisposeMethod_Get(this._instance));
	}
	set gifDisposeMethod(e) {
		V._api._MagickImage_GifDisposeMethod_Set(this._instance, O(e));
	}
	get hasAlpha() {
		return this.toBool(V._api._MagickImage_HasAlpha_Get(this._instance));
	}
	set hasAlpha(e) {
		this.useExceptionPointer((t) => {
			e && this.alpha(ee.Opaque), V._api._MagickImage_HasAlpha_Set(this._instance, this.fromBool(e), t);
		});
	}
	get height() {
		return Number(V._api._MagickImage_Height_Get(this._instance));
	}
	get interlace() {
		return Number(V._api._MagickImage_Interlace_Get(this._instance));
	}
	get isOpaque() {
		return this.useExceptionPointer((e) => this.toBool(V._api._MagickImage_IsOpaque_Get(this._instance, e)));
	}
	get interpolate() {
		return Number(V._api._MagickImage_Interpolate_Get(this._instance));
	}
	set interpolate(e) {
		V._api._MagickImage_Interpolate_Set(this._instance, O(e));
	}
	get label() {
		return this.getAttribute("label");
	}
	set label(e) {
		e === null ? this.removeAttribute("label") : this.setAttribute("label", e);
	}
	get matteColor() {
		let e = V._api._MagickImage_MatteColor_Get(this._instance);
		return D._create(e);
	}
	set matteColor(e) {
		e._use((e) => {
			V._api._MagickImage_MatteColor_Set(this._instance, e);
		});
	}
	get metaChannelCount() {
		return Number(V._api._MagickImage_MetaChannelCount_Get(this._instance));
	}
	set metaChannelCount(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_MetaChannelCount_Set(this._instance, O(e), t);
		});
	}
	get orientation() {
		return Number(V._api._MagickImage_Orientation_Get(this._instance));
	}
	set orientation(e) {
		V._api._MagickImage_Orientation_Set(this._instance, O(e));
	}
	get onProgress() {
		return this._progress;
	}
	set onProgress(e) {
		e === void 0 ? this.disposeProgressDelegate() : $e.setProgressDelegate(this), this._progress = e;
	}
	get onWarning() {
		return this._warning;
	}
	set onWarning(e) {
		this._warning = e;
	}
	get page() {
		let e = V._api._MagickImage_Page_Get(this._instance);
		return de._fromRectangle(e);
	}
	set page(e) {
		e._toRectangle((e) => {
			V._api._MagickImage_Page_Set(this._instance, e);
		});
	}
	get profileNames() {
		let e = [];
		V._api._MagickImage_ResetProfileIterator(this._instance);
		let t = V._api._MagickImage_GetNextProfileName(this._instance);
		for (; t !== V._api._NullPointer;) e.push(w(t)), t = V._api._MagickImage_GetNextProfileName(this._instance);
		return e;
	}
	get quality() {
		return Number(V._api._MagickImage_Quality_Get(this._instance));
	}
	set quality(e) {
		let t = e < 1 ? 1 : e;
		t = t > 100 ? 100 : t, V._api._MagickImage_Quality_Set(this._instance, O(t)), this._settings._quality = t;
	}
	get renderingIntent() {
		return Number(V._api._MagickImage_RenderingIntent_Get(this._instance));
	}
	set renderingIntent(e) {
		V._api._MagickImage_RenderingIntent_Set(this._instance, O(e));
	}
	get settings() {
		return this._settings;
	}
	get signature() {
		return this.useExceptionPointer((e) => C(V._api._MagickImage_Signature_Get(this._instance, e)));
	}
	get totalColors() {
		return this.useExceptionPointer((e) => Number(V._api._MagickImage_TotalColors_Get(this._instance, e)));
	}
	get virtualPixelMethod() {
		return Number(V._api._MagickImage_VirtualPixelMethod_Get(this._instance));
	}
	set virtualPixelMethod(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_VirtualPixelMethod_Set(this._instance, O(e), t);
		});
	}
	get width() {
		return Number(V._api._MagickImage_Width_Get(this._instance));
	}
	adaptiveBlur(e, t) {
		let n = this.valueOrDefault(e, 0), r = this.valueOrDefault(t, 1);
		this.useException((e) => {
			let t = V._api._MagickImage_AdaptiveBlur(this._instance, n, r, e.ptr);
			this._setInstance(t, e);
		});
	}
	adaptiveResize(e, t) {
		let n = typeof e == "number" ? new de(0, 0, e, t) : e;
		this.useException((e) => {
			E(n.toString(), (t) => {
				let n = V._api._MagickImage_AdaptiveResize(this._instance, t, e.ptr);
				this._setInstance(n, e);
			});
		});
	}
	adaptiveSharpen(e, t, n) {
		let r = 0, i = t ?? 1, a = n ?? h.Undefined;
		e !== void 0 && (t === void 0 ? a = e : r = e), this.useException((e) => {
			let t = V._api._MagickImage_AdaptiveSharpen(this._instance, r, i, O(a), e.ptr);
			this._setInstance(t, e);
		});
	}
	adaptiveThreshold(e, t, n, r) {
		let i = n instanceof R ? n._toQuantum() : 0, a = r ?? h.Undefined;
		typeof n == "number" && (a = n), this.useException((n) => {
			let r = V._api._MagickImage_AdaptiveThreshold(this._instance, O(e), O(t), i, O(a), n.ptr);
			this._setInstance(r, n);
		});
	}
	addNoise(e, t, n) {
		let r = 1, i = n ?? h.Undefined;
		t !== void 0 && (n === void 0 ? i = t : r = t), this.useException((t) => {
			let n = V._api._MagickImage_AddNoise(this._instance, O(e), r, O(i), t.ptr);
			this._setInstance(n, t);
		});
	}
	affineTransform(e) {
		this.useException((t) => {
			let n = V._api._MagickImage_AffineTransform(this._instance, e.scaleX, e.scaleY, e.shearX, e.shearY, e.translateX, e.translateY, t.ptr);
			this._setInstance(n, t);
		});
	}
	alpha(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_SetAlpha(this._instance, O(e), t);
		});
	}
	annotate(e, t, n, r) {
		return this.useExceptionPointer((i) => this._settings._drawing._use((a) => {
			E(e, (e) => {
				let o = null, s = F.Undefined, c = 0;
				typeof t == "object" ? (o = t.toString(), n !== void 0 && (s = n), r !== void 0 && (c = r)) : (s = t, n !== void 0 && (c = n)), E(o, (t) => {
					V._api._MagickImage_Annotate(this._instance, a._instance, e, t, O(s), c, i);
				});
			});
		}));
	}
	autoGamma(e) {
		this.useExceptionPointer((t) => {
			let n = this.valueOrDefault(e, h.Composite);
			V._api._MagickImage_AutoGamma(this._instance, O(n), t);
		});
	}
	autoLevel(e) {
		this.useExceptionPointer((t) => {
			let n = this.valueOrDefault(e, h.Undefined);
			V._api._MagickImage_AutoLevel(this._instance, O(n), t);
		});
	}
	autoOrient() {
		this.useException((e) => {
			let t = V._api._MagickImage_AutoOrient(this._instance, e.ptr);
			this._setInstance(t, e);
		});
	}
	autoThreshold(e) {
		this.useException((t) => {
			V._api._MagickImage_AutoThreshold(this._instance, O(e), t.ptr);
		});
	}
	bilateralBlur(e, t, n, r) {
		let i = this.valueOrComputedDefault(n, () => Math.sqrt(Number(e * e + t * t))), a = this.valueOrDefault(r, i * .25);
		this.useException((n) => {
			let r = V._api._MagickImage_BilateralBlur(this._instance, O(e), O(t), i, a, n.ptr);
			this._setInstance(r, n);
		});
	}
	blackThreshold(e, t) {
		let n = this.valueOrDefault(t, h.Composite);
		this.useException((t) => {
			E(e.toString(), (e) => {
				V._api._MagickImage_BlackThreshold(this._instance, e, O(n), t.ptr);
			});
		});
	}
	blueShift(e) {
		let t = this.valueOrDefault(e, 1.5);
		this.useException((e) => {
			let n = V._api._MagickImage_BlueShift(this._instance, t, e.ptr);
			this._setInstance(n, e);
		});
	}
	blur(e, t, n) {
		let r = 0, i = this.valueOrDefault(t, 1), a = this.valueOrDefault(n, h.Undefined);
		e !== void 0 && (t === void 0 ? a = e : r = e), this.useException((e) => {
			let t = V._api._MagickImage_Blur(this._instance, r, i, O(a), e.ptr);
			this._setInstance(t, e);
		});
	}
	border(e, t) {
		let n = new de(0, 0, e, this.valueOrDefault(t, e));
		this.useException((e) => {
			n._toRectangle((t) => {
				let n = V._api._MagickImage_Border(this._instance, t, e.ptr);
				this._setInstance(n, e);
			});
		});
	}
	brightnessContrast(e, t, n) {
		let r = this.valueOrDefault(n, h.Undefined);
		this.useException((n) => {
			V._api._MagickImage_BrightnessContrast(this._instance, e.toDouble(), t.toDouble(), O(r), n.ptr);
		});
	}
	cannyEdge(e, t, n, r) {
		let i = this.valueOrDefault(e, 0), a = this.valueOrDefault(t, 1), o = this.valueOrDefault(n, new R(10)).toDouble() / 100, s = this.valueOrDefault(r, new R(30)).toDouble() / 100;
		this.useException((e) => {
			let t = V._api._MagickImage_CannyEdge(this._instance, i, a, o, s, e.ptr);
			this._setInstance(t, e);
		});
	}
	charcoal(e, t) {
		let n = e === void 0 ? 0 : e, r = t === void 0 ? 1 : t;
		this.useException((e) => {
			let t = V._api._MagickImage_Charcoal(this._instance, n, r, e.ptr);
			this._setInstance(t, e);
		});
	}
	chop(e) {
		this.useException((t) => {
			e._toRectangle((e) => {
				let n = V._api._MagickImage_Chop(this._instance, e, t.ptr);
				this._setInstance(n, t);
			});
		});
	}
	chopHorizontal(e, t) {
		this.chop(new de(e, 0, t, 0));
	}
	chopVertical(e, t) {
		this.chop(new de(0, e, 0, t));
	}
	clahe(e, t, n, r) {
		this.useExceptionPointer((i) => {
			let a = O(e instanceof R ? e.multiply(this.width) : e), o = O(t instanceof R ? t.multiply(this.height) : t);
			V._api._MagickImage_Clahe(this._instance, a, o, O(n), r, i);
		});
	}
	clone(e) {
		return t._clone(this)._use(e);
	}
	cloneArea(e, n) {
		return M.usePointer((r) => e._toRectangle((i) => Re._use(0, 0, (a) => {
			let o = V._api._MagickImage_CloneArea(this._instance, O(e.width), O(e.height), r);
			return V._api._MagickImage_CopyPixels(o, this._instance, i, a, O(h.Undefined), r), n(new t(o, this._settings));
		})));
	}
	clut(e, t, n) {
		let r = this.valueOrDefault(t, We.Undefined), i = this.valueOrDefault(n, h.Undefined);
		this.useExceptionPointer((t) => {
			V._api._MagickImage_Clut(this._instance, e._instance, O(r), O(i), t);
		});
	}
	colorAlpha(e) {
		if (!this.hasAlpha) return;
		let n = t.create();
		n.read(e, this.width, this.height), n.composite(this, x.SrcOver, new fe(0, 0)), this._instance = n._instance;
	}
	colorDecisionList(e) {
		this.useExceptionPointer((t) => {
			E(e, (e) => {
				V._api._MagickImage_ColorDecisionList(this._instance, e, t);
			});
		});
	}
	compare(e, n, r, i) {
		let a = n instanceof oe, o = a ? n.metric : n, s = r;
		i !== void 0 && (s = i);
		let c = h.Undefined;
		if (typeof s != "function") return s !== void 0 && (c = s), this.useExceptionPointer((t) => V._api._MagickImage_CompareDistortion(this._instance, e._instance, O(o), O(c), t));
		r !== void 0 && typeof r != "function" && (c = r);
		let l = Ie.use(this, (r) => (a && n._setArtifacts(r), P.use((n) => {
			let r = this.useExceptionPointer((t) => V._api._MagickImage_Compare(this._instance, e._instance, O(o), O(c), n.ptr, t)), i = n.value, a = t._createFromImage(r, this._settings);
			return ae._create(i, a);
		})));
		return l.difference._use(() => s(l));
	}
	composite(e, t, n, r, i) {
		let a = 0, o = 0, s = x.In, c = h.All, l = null;
		t instanceof fe ? (a = t.x, o = t.y) : t !== void 0 && (s = t), n instanceof fe ? (a = n.x, o = n.y) : typeof n == "string" ? l = n : n !== void 0 && (c = n), typeof r == "string" ? l = r : r !== void 0 && (c = r), i !== void 0 && (c = i), l !== null && this.setArtifact("compose:args", l), this.useExceptionPointer((t) => {
			V._api._MagickImage_Composite(this._instance, e._instance, O(a), O(o), O(s), O(c), t);
		}), l !== null && this.removeArtifact("compose:args");
	}
	compositeGravity(e, t, n, r, i, a) {
		let o = 0, s = 0, c = x.In, l = h.All, u = null;
		n instanceof fe ? (o = n.x, s = n.y) : n !== void 0 && (c = n), r instanceof fe ? (o = r.x, s = r.y) : typeof r == "string" ? u = r : r !== void 0 && (l = r), typeof i == "string" ? u = i : i !== void 0 && (l = i), a !== void 0 && (l = a), u !== null && this.setArtifact("compose:args", u), this.useExceptionPointer((n) => {
			V._api._MagickImage_CompositeGravity(this._instance, e._instance, O(t), O(o), O(s), O(c), O(l), n);
		}), u !== null && this.removeArtifact("compose:args");
	}
	connectedComponents(e) {
		let t = typeof e == "number" ? new me(e) : e;
		return Ie.use(this, (e) => (t._setArtifacts(e), this.useException((e) => j.use((n) => {
			try {
				let r = V._api._MagickImage_ConnectedComponents(this._instance, O(t.connectivity), n.ptr, e.ptr);
				return this._setInstance(r, e), pe._create(n.value, Number(this.colormapSize));
			} finally {
				n.value !== V._api._NullPointer && V._api._ConnectedComponent_DisposeList(n.value);
			}
		}))));
	}
	contrast = () => this.contrastPrivate(!0);
	contrastStretch(e, t, n) {
		let r = Number(this.width * this.height), i = e.multiply(r), a = 0, o = this.valueOrDefault(n, h.Undefined);
		t instanceof R ? a = r - t.multiply(r) : (a = r - e.multiply(r), t !== void 0 && (o = t)), this.useExceptionPointer((e) => {
			V._api._MagickImage_ContrastStretch(this._instance, i, a, O(o), e);
		});
	}
	static create(e, n, r) {
		let i = new t(t.createInstance(), new Me());
		return e !== void 0 && i.readOrPing(!1, e, n, r), i;
	}
	crop(e, t, n) {
		let r, i;
		typeof e == "number" ? t !== void 0 && (r = new de(e, t), i = this.valueOrDefault(n, F.Undefined)) : (r = e, i = this.valueOrDefault(t, F.Undefined)), this.useException((e) => {
			E(r.toString(), (t) => {
				let n = V._api._MagickImage_Crop(this._instance, t, O(i), e.ptr);
				this._setInstance(n, e);
			});
		});
	}
	cropToTiles(e, t, n) {
		let r, i;
		return typeof e == "number" && typeof t == "number" && n !== void 0 ? (r = new de(0, 0, e, t), i = n) : typeof e != "number" && typeof t != "number" && (r = e, i = t), this.useException((e) => E(r.toString(), (t) => {
			let n = V._api._MagickImage_CropToTiles(this._instance, t, e.ptr);
			return L._createFromImages(n, this._settings, (e) => i(e));
		}));
	}
	cycleColormap(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_CycleColormap(this._instance, O(e), t);
		});
	}
	deskew(e, t) {
		return Ie.use(this, (n) => {
			t !== void 0 && n.setArtifact("deskew:auto-crop", t), this.useException((t) => {
				let n = V._api._MagickImage_Deskew(this._instance, e._toQuantum(), t.ptr);
				this._setInstance(n, t);
			});
			let r = Number(this.getArtifact("deskew:angle"));
			return isNaN(r) ? 0 : r;
		});
	}
	determineBitDepth(e) {
		let t = this.valueOrDefault(e, h.Undefined);
		return this.useExceptionPointer((e) => Number(V._api._MagickImage_DetermineBitDepth(this._instance, O(t), e)));
	}
	distort(e, t) {
		Ie.use(this, (n) => {
			let r, i = 0;
			typeof e == "number" ? r = e : (r = e.method, i = +!!e.bestFit, e._setArtifacts(n)), this.useException((e) => {
				be(t, (n) => {
					let a = V._api._MagickImage_Distort(this._instance, O(r), i, n, O(t.length), e.ptr);
					this._setInstance(a, e);
				});
			});
		});
	}
	draw(...e) {
		let t = e.flat();
		t.length !== 0 && Se._use(this, (e) => {
			e.draw(t);
		});
	}
	evaluate(e, t, n, r) {
		if (typeof t == "number") {
			let r = t, i = typeof n == "number" ? n : n._toQuantum();
			this.useExceptionPointer((t) => {
				V._api._MagickImage_EvaluateOperator(this._instance, O(e), O(r), i, t);
			});
		} else if (r !== void 0) {
			if (typeof n != "number") throw new S("this should not happen");
			let i = t, a = n, o = typeof r == "number" ? r : r._toQuantum();
			if (i.isPercentage) throw new S("percentage is not supported");
			this.useExceptionPointer((t) => {
				Le.use(this, i, (n) => {
					V._api._MagickImage_EvaluateGeometry(this._instance, O(e), n, O(a), o, t);
				});
			});
		}
	}
	extent(e, t, n) {
		let r = F.Undefined, i;
		typeof e == "number" ? typeof t == "number" && (i = new de(e, t)) : i = e, typeof t == "number" ? r = t : t !== void 0 && (this.backgroundColor = t), typeof n == "number" ? r = n : n !== void 0 && (this.backgroundColor = n), this.useException((e) => {
			E(i.toString(), (t) => {
				let n = V._api._MagickImage_Extent(this._instance, t, O(r), e.ptr);
				this._setInstance(n, e);
			});
		});
	}
	flip() {
		this.useException((e) => {
			let t = V._api._MagickImage_Flip(this._instance, e.ptr);
			this._setInstance(t, e);
		});
	}
	floodFill(e, t, n, r) {
		this.floodFillPrivate(e, t, n, r, !1);
	}
	flop() {
		this.useException((e) => {
			let t = V._api._MagickImage_Flop(this._instance, e.ptr);
			this._setInstance(t, e);
		});
	}
	formatExpression(e) {
		return this.useExceptionPointer((t) => this._settings._use((n) => E(e, (e) => {
			let r = V._api._MagickImage_FormatExpression(this._instance, n._instance, e, t);
			return T(V._api, r);
		})));
	}
	gammaCorrect(e, t) {
		let n = this.valueOrDefault(t, h.Undefined);
		this.useExceptionPointer((t) => {
			V._api._MagickImage_GammaCorrect(this._instance, e, O(n), t);
		});
	}
	gaussianBlur(e, t, n) {
		let r = this.valueOrDefault(t, 1), i = this.valueOrDefault(n, h.Undefined);
		this.useException((t) => {
			let n = V._api._MagickImage_GaussianBlur(this._instance, e, r, O(i), t.ptr);
			this._setInstance(n, t);
		});
	}
	getArtifact(e) {
		return E(e, (e) => C(V._api._MagickImage_GetArtifact(this._instance, e)));
	}
	getAttribute(e) {
		return this.useException((t) => E(e, (e) => C(V._api._MagickImage_GetAttribute(this._instance, e, t.ptr))));
	}
	getColormapColor(e) {
		let t = V._api._MagickImage_GetColormapColor(this._instance, O(e));
		return t === V._api._NullPointer ? null : D._create(t);
	}
	getColorProfile() {
		for (let e of ["icc", "icm"]) {
			let t = this.getProfilePrivate(e);
			if (t !== null) return new y(t);
		}
		return null;
	}
	getPixels(e) {
		if (this._settings._ping) throw new S("image contains no pixel data");
		return He._use(this, e);
	}
	getProfile(e) {
		let t = this.getProfilePrivate(e);
		return t === null ? null : new ie(e, t);
	}
	getWriteMask(e) {
		let n = this.useExceptionPointer((e) => V._api._MagickImage_GetWriteMask(this._instance, e)), r = n === V._api._NullPointer ? null : new t(n, new Me());
		return r == null ? e(r) : r._use(e);
	}
	grayscale(e = Ue.Undefined) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_Grayscale(this._instance, O(e), t);
		});
	}
	hasProfile(e) {
		return E(e, (e) => this.toBool(V._api._MagickImage_HasProfile(this._instance, e)));
	}
	histogram() {
		let e = /* @__PURE__ */ new Map();
		return this.useExceptionPointer((t) => {
			j.use((n) => {
				let r = V._api._MagickImage_Histogram(this._instance, n.ptr, t);
				if (r !== V._api._NullPointer) {
					let t = n.value;
					for (let n = 0; n < t; n++) {
						let t = V._api._MagickColorCollection_Get(r, O(n)), i = D._create(t), a = V._api._MagickColor_Count_Get(t);
						e.set(i.toString(), a);
					}
					V._api._MagickColorCollection_Dispose(r);
				}
			});
		}), e;
	}
	inverseContrast = () => this.contrastPrivate(!1);
	inverseFloodFill(e, t, n, r) {
		this.floodFillPrivate(e, t, n, r, !0);
	}
	inverseLevel(e, t, n, r) {
		let i = this.valueOrDefault(n, 1), a = this.valueOrDefault(r, h.Composite);
		this.useExceptionPointer((n) => {
			V._api._MagickImage_InverseLevel(this._instance, e.toDouble(), t._toQuantum(), i, O(a), n);
		});
	}
	inverseLevelColors(e, t, n) {
		this.levelColorsPrivate(!0, e, t, n);
	}
	inverseOpaque = (e, t) => this.opaquePrivate(e, t, !0);
	inverseSigmoidalContrast(e, t, n) {
		this.sigmoidalContrastPrivate(!1, e, t, n);
	}
	inverseTransparent = (e) => this.transparentPrivate(e, !0);
	level(e, t, n, r) {
		let i = this.valueOrDefault(n, 1), a = this.valueOrDefault(r, h.Composite);
		this.useExceptionPointer((n) => {
			V._api._MagickImage_Level(this._instance, e.toDouble(), t._toQuantum(), i, O(a), n);
		});
	}
	levelColors(e, t, n) {
		this.levelColorsPrivate(!1, e, t, n);
	}
	linearStretch(e, t) {
		this.useExceptionPointer((n) => {
			V._api._MagickImage_LinearStretch(this._instance, e.toDouble(), t._toQuantum(), n);
		});
	}
	liquidRescale(e, t) {
		let n = typeof e == "number" ? new de(e, t) : e;
		this.useException((e) => {
			E(n.toString(), (t) => {
				let r = V._api._MagickImage_LiquidRescale(this._instance, t, Number(n.x), Number(n.y), e.ptr);
				this._setInstance(r, e);
			});
		});
	}
	negate(e) {
		this.useExceptionPointer((t) => {
			let n = this.valueOrDefault(e, h.Undefined);
			V._api._MagickImage_Negate(this._instance, 0, O(n), t);
		});
	}
	negateGrayScale(e) {
		this.useExceptionPointer((t) => {
			let n = this.valueOrDefault(e, h.Undefined);
			V._api._MagickImage_Negate(this._instance, 1, O(n), t);
		});
	}
	normalize() {
		this.useExceptionPointer((e) => {
			V._api._MagickImage_Normalize(this._instance, e);
		});
	}
	modulate(e, t, n) {
		let r = this.valueOrDefault(t, new R(100)), i = this.valueOrDefault(n, new R(100));
		this.useExceptionPointer((t) => {
			E(`${e.toDouble()}/${r.toDouble()}/${i.toDouble()}`, (e) => {
				V._api._MagickImage_Modulate(this._instance, e, t);
			});
		});
	}
	morphology(e) {
		this.useException((t) => {
			E(e.kernel, (n) => {
				let r = V._api._MagickImage_Morphology(this._instance, O(e.method), n, O(e.channels), O(e.iterations), t.ptr);
				this._setInstance(r, t);
			});
		});
	}
	motionBlur(e, t, n) {
		this.useException((r) => {
			let i = V._api._MagickImage_MotionBlur(this._instance, e, t, n, r.ptr);
			this._setInstance(i, r);
		});
	}
	oilPaint(e) {
		let t = this.valueOrDefault(e, 3);
		this.useException((e) => {
			let n = V._api._MagickImage_OilPaint(this._instance, t, 0, e.ptr);
			this._setInstance(n, e);
		});
	}
	opaque = (e, t) => this.opaquePrivate(e, t, !1);
	ping(e, t) {
		this.readOrPing(!0, e, t);
	}
	perceptualHash(e) {
		let t = this.valueOrDefault(e, Ve._defaultColorspaces());
		return Ve._validateColorSpaces(t), Ie.use(this, (e) => {
			let n = t.map((e) => ne[e]).join(",");
			return e.setArtifact("phash:colorspaces", n), this.useExceptionPointer((e) => {
				let n = V._api._MagickImage_PerceptualHash(this._instance, e);
				try {
					return Ve._create(this, t, n);
				} finally {
					V._api._PerceptualHash_DisposeList(n);
				}
			});
		});
	}
	quantize(e) {
		let t = this.valueOrDefault(e, new Fe());
		return this.useException((e) => {
			t._use((t) => {
				V._api._MagickImage_Quantize(this._instance, t._instance, e.ptr);
			});
		}), t.measureErrors ? Te._create(this) : null;
	}
	read(e, t, n) {
		this.readOrPing(!1, e, t, n);
	}
	readFromCanvas(e, t) {
		let n = e.getContext("2d", t);
		if (n === null) return;
		let r = n.getImageData(0, 0, e.width, e.height), i = new I();
		i.format = Ee.Rgba, i.width = e.width, i.height = e.height, this.useException((e) => {
			this.readFromArray(r.data, i, e);
		});
	}
	removeArtifact(e) {
		E(e, (e) => {
			V._api._MagickImage_RemoveArtifact(this._instance, e);
		});
	}
	removeAttribute(e) {
		E(e, (e) => {
			V._api._MagickImage_RemoveAttribute(this._instance, e);
		});
	}
	removeProfile(e) {
		E(typeof e == "string" ? e : e.name, (e) => {
			V._api._MagickImage_RemoveProfile(this._instance, e);
		});
	}
	removeWriteMask() {
		this.useExceptionPointer((e) => {
			V._api._MagickImage_SetWriteMask(this._instance, V._api._NullPointer, e);
		});
	}
	resetPage() {
		this.page = new de(0, 0, 0, 0);
	}
	resize(e, t, n) {
		let r = this.filterType, i;
		typeof e == "number" ? (i = new de(e, t), n !== void 0 && (r = n)) : (i = e, t !== void 0 && (r = t)), this.useException((e) => {
			E(i.toString(), (t) => {
				let n = V._api._MagickImage_Resize(this._instance, t, r, e.ptr);
				this._setInstance(n, e);
			});
		});
	}
	roll(e, t) {
		this.useException((n) => {
			let r = V._api._MagickImage_Roll(this._instance, O(e), O(t), n.ptr);
			this._setInstance(r, n);
		});
	}
	rotate(e) {
		this.useException((t) => {
			let n = V._api._MagickImage_Rotate(this._instance, e, t.ptr);
			this._setInstance(n, t);
		});
	}
	separate(e, t) {
		return this.useException((n) => {
			let r, i = h.Undefined;
			if (typeof e == "number" && t !== void 0) i = e, r = t;
			else if (typeof e == "function") r = e;
			else throw new S("invalid arguments");
			let a = V._api._MagickImage_Separate(this._instance, O(i), n.ptr);
			return L._createFromImages(a, this._settings, (e) => r(e));
		});
	}
	sepiaTone(e = new R(80)) {
		this.useException((t) => {
			let n = typeof e == "number" ? new R(e) : e, r = V._api._MagickImage_SepiaTone(this._instance, n._toQuantum(), t.ptr);
			this._setInstance(r, t);
		});
	}
	setArtifact(e, t) {
		let n;
		n = typeof t == "string" ? t : typeof t == "boolean" ? this.fromBool(t).toString() : t.toString(), E(e, (e) => {
			E(n, (t) => {
				V._api._MagickImage_SetArtifact(this._instance, e, t);
			});
		});
	}
	setAttribute(e, t) {
		this.useException((n) => {
			E(e, (e) => {
				E(t, (t) => {
					V._api._MagickImage_SetAttribute(this._instance, e, t, n.ptr);
				});
			});
		});
	}
	setCompression(e) {
		V._api._MagickImage_Compression_Set(this._instance, O(e));
	}
	setProfile(e, t) {
		let n = typeof e == "string" ? e : e.name, r;
		t === void 0 ? typeof e != "string" && (r = e.data) : r = t, this.useException((e) => {
			E(n, (t) => {
				ye(r, (n) => {
					V._api._MagickImage_SetProfile(this._instance, t, n, O(r.byteLength), e.ptr);
				});
			});
		});
	}
	setWriteMask(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_SetWriteMask(this._instance, e._instance, t);
		});
	}
	shadow(e, t, n, r, i) {
		let a, o = typeof e == "number" ? e : 5, s = this.valueOrDefault(t, 5), c = this.valueOrDefault(n, .5), l = this.valueOrDefault(r, new R(80)), u = typeof e == "number" ? i : e;
		u !== void 0 && (a = this.backgroundColor, this.backgroundColor = u);
		try {
			this.useException((e) => {
				let t = V._api._MagickImage_Shadow(this._instance, O(o), O(s), c, l.toDouble(), e.ptr);
				this._setInstance(t, e);
			});
		} finally {
			a !== void 0 && (this.backgroundColor = a);
		}
	}
	sharpen(e, t, n) {
		let r = this.valueOrDefault(e, 0), i = this.valueOrDefault(t, 1), a = this.valueOrDefault(n, h.Undefined);
		this.useException((e) => {
			let t = V._api._MagickImage_Sharpen(this._instance, r, i, O(a), e.ptr);
			this._setInstance(t, e);
		});
	}
	shave(e, t) {
		this.useException((n) => {
			let r = V._api._MagickImage_Shave(this._instance, O(e), O(t), n.ptr);
			this._setInstance(r, n);
		});
	}
	sigmoidalContrast(e, t, n) {
		this.sigmoidalContrastPrivate(!0, e, t, n);
	}
	solarize(e = new R(50)) {
		this.useException((t) => {
			let n = typeof e == "number" ? new R(e) : e;
			V._api._MagickImage_Solarize(this._instance, n._toQuantum(), t.ptr);
		});
	}
	splice(e, t) {
		let n = this.valueOrDefault(t, F.Undefined);
		E(e.toString(), (e) => {
			this.useException((t) => {
				let r = V._api._MagickImage_Splice(this._instance, e, O(n), t.ptr);
				this._setInstance(r, t);
			});
		});
	}
	statistics(e) {
		let t = this.valueOrDefault(e, h.All);
		return this.useExceptionPointer((e) => {
			let n = V._api._MagickImage_Statistics(this._instance, O(t), e), r = Ke._create(this, n, t);
			return V._api._Statistics_DisposeList(n), r;
		});
	}
	strip() {
		this.useExceptionPointer((e) => {
			V._api._MagickImage_Strip(this._instance, e);
		});
	}
	transformColorSpace(e, t, n) {
		let r = e, i, a = b.Quantum;
		t !== void 0 && (typeof t == "number" ? a = t : i = t), n !== void 0 && (a = n);
		let o = this.hasProfile("icc") || this.hasProfile("icm");
		if (i === void 0) {
			if (!o) return !1;
			i = r;
		} else {
			if (r.colorSpace !== this.colorSpace) return !1;
			o || this.setProfile(r);
		}
		return a === b.Quantum ? Ie.use(this, (e) => {
			e.setArtifact("profile:highres-transform", !1), this.setProfile(i);
		}) : this.setProfile(i), !0;
	}
	threshold(e, t) {
		let n = this.valueOrDefault(t, h.Undefined);
		this.useExceptionPointer((t) => {
			V._api._MagickImage_Threshold(this._instance, e._toQuantum(), O(n), t);
		});
	}
	thumbnail(e, t) {
		let n = typeof e == "number" ? new de(e, t) : e;
		this.useException((e) => {
			E(n.toString(), (t) => {
				let n = V._api._MagickImage_Thumbnail(this._instance, t, e.ptr);
				this._setInstance(n, e);
			});
		});
	}
	toString = () => `${this.format} ${this.width}x${this.height} ${this.depth}-bit ${ne[this.colorSpace]}`;
	transparent(e) {
		e._use((e) => {
			this.useExceptionPointer((t) => {
				V._api._MagickImage_Transparent(this._instance, e, 0, t);
			});
		});
	}
	trim(...e) {
		if (e.length > 0) {
			if (e.length == 1 && e[0] instanceof R) {
				let t = e[0];
				this.setArtifact("trim:percent-background", t.toDouble().toString());
			} else {
				let t = [...new Set(Ce(e))].join(",");
				this.setArtifact("trim:edges", t);
			}
		}
		this.useException((e) => {
			let t = V._api._MagickImage_Trim(this._instance, e.ptr);
			this._setInstance(t, e), this.removeArtifact("trim:edges"), this.removeArtifact("trim:percent-background");
		});
	}
	wave(e, t, n) {
		let r = this.valueOrDefault(e, this.interpolate), i = this.valueOrDefault(t, 25), a = this.valueOrDefault(n, 150);
		this.useException((e) => {
			let t = V._api._MagickImage_Wave(this._instance, O(r), i, a, e.ptr);
			this._setInstance(t, e);
		});
	}
	vignette(e, t, n, r) {
		let i = this.valueOrDefault(e, 0), a = this.valueOrDefault(t, 1), o = this.valueOrDefault(n, 0), s = this.valueOrDefault(r, 0);
		this.useException((e) => {
			let t = V._api._MagickImage_Vignette(this._instance, i, a, O(o), O(s), e.ptr);
			this._setInstance(t, e);
		});
	}
	whiteThreshold(e, t) {
		let n = this.valueOrDefault(t, h.Composite);
		this.useException((t) => {
			E(e.toString(), (e) => {
				V._api._MagickImage_WhiteThreshold(this._instance, e, O(n), t.ptr);
			});
		});
	}
	write(e, t) {
		let n = V._api._NullPointer, r = 0;
		t === void 0 ? t = e : this._settings.format = e, this.useException((e) => {
			j.use((t) => {
				this._settings._use((i) => {
					try {
						n = V._api._MagickImage_WriteBlob(this._instance, i._instance, t.ptr, e.ptr), r = Number(t.value);
					} catch (e) {
						throw n !== V._api._NullPointer && (n = V._api._MagickMemory_Relinquish(n)), e;
					}
				});
			});
		});
		let i = new ge(n, r, t);
		return A._disposeAfterExecution(i, i.func);
	}
	writeToCanvas(e, t) {
		e.width = this.width, e.height = this.height;
		let n = e.getContext("2d", t);
		n !== null && He._map(this, "RGBA", (e) => {
			let t = n.createImageData(this.width, this.height), r = 0;
			for (let n = 0; n < this.height; n++) for (let n = 0; n < this.width; n++) t.data[r++] = V._api.HEAPU8[e++], t.data[r++] = V._api.HEAPU8[e++], t.data[r++] = V._api.HEAPU8[e++], t.data[r++] = V._api.HEAPU8[e++];
			n.putImageData(t, 0, 0);
		});
	}
	static _createFromImage(e, n) {
		return new t(e, n);
	}
	_channelOffset(e) {
		return V._api._MagickImage_HasChannel(this._instance, O(e)) ? Number(V._api._MagickImage_ChannelOffset(this._instance, O(e))) : -1;
	}
	static _clone(e) {
		return M.usePointer((n) => new t(V._api._MagickImage_Clone(e._instance, n), e._settings._clone()));
	}
	_getSettings() {
		return this._settings;
	}
	_instanceNotInitialized() {
		throw new S("no image has been read");
	}
	_setInstance(e, t) {
		if (super._setInstance(e, t) === !0 || e === V._api._NullPointer && this.onProgress !== void 0) return !0;
		throw new S("out of memory");
	}
	_use(e) {
		return A._disposeAfterExecution(this, e);
	}
	static _create(e) {
		return t.create()._use(e);
	}
	onDispose() {
		this.disposeProgressDelegate();
	}
	contrastPrivate(e) {
		this.useExceptionPointer((t) => {
			V._api._MagickImage_Contrast(this._instance, this.fromBool(e), t);
		});
	}
	static createInstance() {
		return M.usePointer((e) => V._api._MagickImage_Create(V._api._NullPointer, e));
	}
	disposeProgressDelegate() {
		$e.removeProgressDelegate(this), this._progress = void 0;
	}
	floodFillPrivate(e, n, r, i, a) {
		let o = i;
		o === void 0 && this.getPixels((e) => {
			let t = e.getColor(n, r);
			t !== null && (o = t);
		}), typeof e == "number" && o !== void 0 && (o.a = e), this.settings._drawing._use((i) => {
			e instanceof D ? (i.setFillColor(e), i.setFillPattern()) : e instanceof t && (i.setFillColor(), i.setFillPattern(e)), this.useExceptionPointer((e) => {
				o === void 0 ? V._api._MagickImage_FloodFill(this._instance, i._instance, O(n), O(r), V._api._NullPointer, this.fromBool(a), e) : o._use((t) => {
					V._api._MagickImage_FloodFill(this._instance, i._instance, O(n), O(r), t, this.fromBool(a), e);
				});
			});
		});
	}
	fromBool(e) {
		return +!!e;
	}
	getProfilePrivate(e) {
		return E(e, (e) => {
			let t = V._api._MagickImage_GetProfile(this._instance, e), n = qe.toArray(t);
			return n === null ? null : n;
		});
	}
	levelColorsPrivate(e, t, n, r) {
		let i = this.valueOrDefault(r, h.RGB);
		this.useExceptionPointer((r) => {
			t._use((t) => {
				n._use((n) => {
					V._api._MagickImage_LevelColors(this._instance, t, n, O(i), this.fromBool(e), r);
				});
			});
		});
	}
	onSettingsArtifactChanged(e, t) {
		t === void 0 ? this.removeArtifact(e) : this.setArtifact(e, t);
	}
	opaquePrivate(e, t, n) {
		this.useExceptionPointer((r) => {
			e._use((e) => {
				t._use((t) => {
					V._api._MagickImage_Opaque(this._instance, e, t, this.fromBool(n), r);
				});
			});
		});
	}
	readOrPing(t, n, r, i) {
		this.useException((a) => {
			let o = r instanceof I ? r : new I(this._settings);
			if (o._ping = t, this._settings._ping = t, o.frameCount !== void 0 && o.frameCount > 1) throw new S("The frame count can only be set to 1 when a single image is being read.");
			if (typeof n == "string") o._fileName = n;
			else if (e(n)) {
				this.readFromArray(n, o, a);
				return;
			} else o._fileName = "xc:" + n.toShortString(), o.width = typeof r == "number" ? r : 0, o.height = typeof i == "number" ? i : 0;
			o._use((e) => {
				let t = V._api._MagickImage_ReadFile(e._instance, a.ptr);
				this._setInstance(t, a);
			});
		});
	}
	readFromArray(e, t, n) {
		t._use((t) => {
			ye(e, (r) => {
				let i = O(e.byteLength), a = V._api._MagickImage_ReadBlob(t._instance, r, V._api._NullPointer, i, n.ptr);
				this._setInstance(a, n);
			});
		});
	}
	sigmoidalContrastPrivate(e, t, n, r) {
		let i;
		i = n === void 0 ? ce.max * .5 : typeof n == "number" ? n : n.multiply(ce.max);
		let a = O(this.valueOrDefault(r, h.Undefined));
		this.useExceptionPointer((n) => {
			V._api._MagickImage_SigmoidalContrast(this._instance, this.fromBool(e), t, i, a, n);
		});
	}
	toBool(e) {
		return e === 1;
	}
	transparentPrivate(e, t) {
		e._use((e) => {
			this.useExceptionPointer((n) => {
				V._api._MagickImage_Transparent(this._instance, e, this.fromBool(t), n);
			});
		});
	}
	valueOrDefault(e, t) {
		return e === void 0 ? t : e;
	}
	valueOrComputedDefault(e, t) {
		return e === void 0 ? t() : e;
	}
	useException(e) {
		return M.use(e, (e) => {
			this.onWarning !== void 0 && this.onWarning(new Je(e));
		});
	}
	useExceptionPointer(e) {
		return M.usePointer(e, (e) => {
			this.onWarning !== void 0 && this.onWarning(new Je(e));
		});
	}
};
//#endregion
//#region ../../native-package/x64/magick.js
async function Xe(e = {}) {
	var t = e, n = !!globalThis.window, r = !!globalThis.WorkerGlobalScope;
	globalThis.process?.versions?.node && globalThis.process?.type, (!globalThis.crypto || !globalThis.crypto.getRandomValues) && (globalThis.crypto = { getRandomValues: (e) => {
		for (let t = 0; t < e.length; t++) e[t] = Math.random() * 256 | 0;
	} }), t._CastToSize = (e) => BigInt(e), t._NullPointer = 0n, t._PointerSize = 8;
	var i = "./this.program", a = (e, t) => {
		throw t;
	}, o = {}.url, s = "";
	function c(e) {
		return t.locateFile ? t.locateFile(e, s) : s + e;
	}
	var l, u;
	if (n || r) {
		try {
			s = new URL(".", o).href;
		} catch {}
		r && (u = (e) => {
			var t = new XMLHttpRequest();
			return t.open("GET", e, !1), t.responseType = "arraybuffer", t.send(null), new Uint8Array(t.response);
		}), l = async (e) => {
			if (m(e)) return new Promise((t, n) => {
				var r = new XMLHttpRequest();
				r.open("GET", e, !0), r.responseType = "arraybuffer", r.onload = () => {
					if (r.status == 200 || r.status == 0 && r.response) {
						t(r.response);
						return;
					}
					n(r.status);
				}, r.onerror = n, r.send(null);
			});
			var t = await fetch(e, { credentials: "same-origin" });
			if (t.ok) return t.arrayBuffer();
			throw Error(t.status + " : " + t.url);
		};
	}
	var d = console.log.bind(console), f = console.error.bind(console), p, ee = !1, m = (e) => e.startsWith("file://");
	class h {}
	class te extends h {}
	class g extends h {
		constructor(e) {
			super(), this.excPtr = e;
		}
	}
	function ne() {
		return ki.buffer;
	}
	function _() {
		if (!C?.buffer?.resizable) {
			var e = ne();
			C = new Int8Array(e), nt = new Int16Array(e), t.HEAPU8 = Ne = new Uint8Array(e), Mt = new Uint16Array(e), V = new Int32Array(e), H = new Uint32Array(e), Pn = new Float32Array(e), Fn = new Float64Array(e), U = new BigInt64Array(e), A = new BigUint64Array(e);
		}
	}
	function re() {
		!t.noFSInit && !B.initialized && B.init(), I.init(), io._b(), B.ignorePermissions = !1;
	}
	function v(e) {
		throw e = `Aborted(${e})`, f(e), ee = !0, e += ". Build with -sASSERTIONS for more info.", new WebAssembly.RuntimeError(e);
	}
	var ie;
	function y() {
		return t.locateFile ? c("magick.wasm") : new URL("data:text/plain;base64,").href;
	}
	function b(e) {
		if (e == ie && p) return new Uint8Array(p);
		if (u) return u(e);
		throw "both async and sync fetching of the wasm failed";
	}
	async function ae(e) {
		if (!p) try {
			var t = await l(e);
			return new Uint8Array(t);
		} catch {}
		return b(e);
	}
	async function oe(e, t) {
		try {
			var n = await ae(e);
			return await WebAssembly.instantiate(n, t);
		} catch (e) {
			f(`failed to asynchronously prepare wasm: ${e}`), v(e);
		}
	}
	async function x(e, t, n) {
		if (!e && !m(t)) try {
			var r = fetch(t, { credentials: "same-origin" });
			return await WebAssembly.instantiateStreaming(r, n);
		} catch (e) {
			f(`wasm streaming compile failed: ${e}`), f("falling back to ArrayBuffer instantiation");
		}
		return oe(t, n);
	}
	function se() {
		return { a: Mi };
	}
	async function S() {
		function e(e) {
			return io = e.exports, io = no(io), ji(io), _(), io;
		}
		function n(t) {
			return e(t.instance);
		}
		var r = se(), i = t.instantiateWasm;
		return i ? new Promise((t) => {
			i(r, (n) => t(e(n)));
		}) : (ie ??= y(), n(await x(p, ie, r)));
	}
	class ce {
		name = "ExitStatus";
		constructor(e) {
			this.message = `Program terminated with exit(${e})`, this.status = e;
		}
	}
	var C, w = (e) => Ci(e), T = () => wi(), le = 9007199254740992, E = -9007199254740992, D = (e) => e < E || e > le ? NaN : Number(e), ue = [], O = (e) => {
		e = Number(e);
		var t = ue[e];
		return t || (ue[e] = t = Ai.get(BigInt(e))), t;
	};
	function de(e, t) {
		return e = D(e), O(e)(t);
	}
	var fe = [], pe = 0, me = function(e) {
		e = D(e);
		var t = (() => {
			var t = new ge(e);
			return t.get_caught() || (t.set_caught(!0), pe--), t.set_rethrown(!1), fe.push(t), Oi(e);
		})();
		return BigInt(t);
	}, he = null, k = () => {
		$(0, 0);
		var e = fe.pop();
		Ti(e.excPtr), he = null;
	}, A;
	class ge {
		constructor(e) {
			this.excPtr = e, this.ptr = e - 48;
		}
		set_type(e) {
			A[(this.ptr + 8) / 8] = BigInt(e);
		}
		get_type() {
			return Number(A[(this.ptr + 8) / 8]);
		}
		set_destructor(e) {
			A[(this.ptr + 16) / 8] = BigInt(e);
		}
		get_destructor() {
			return Number(A[(this.ptr + 16) / 8]);
		}
		set_caught(e) {
			e = +!!e, C[this.ptr + 24] = e;
		}
		get_caught() {
			return C[this.ptr + 24] != 0;
		}
		set_rethrown(e) {
			e = +!!e, C[this.ptr + 25] = e;
		}
		get_rethrown() {
			return C[this.ptr + 25] != 0;
		}
		init(e, t) {
			this.set_adjusted_ptr(0), this.set_type(e), this.set_destructor(t);
		}
		set_adjusted_ptr(e) {
			A[(this.ptr + 32) / 8] = BigInt(e);
		}
		get_adjusted_ptr() {
			return Number(A[(this.ptr + 32) / 8]);
		}
	}
	var _e = (e) => Si(e), j = (e) => {
		var t = he?.excPtr;
		if (!t) return _e(0), 0;
		var n = new ge(t);
		n.set_adjusted_ptr(t);
		var r = n.get_type();
		if (!r) return _e(0), t;
		for (var i of e) {
			if (!i || i === r) break;
			var a = n.ptr + 32;
			if (Di(i, r, a)) return _e(i), t;
		}
		return _e(r), t;
	}, M = () => BigInt(j([])), ve = (e) => (e = D(e), BigInt(j([e]))), N = (e, t, n) => (e = D(e), t = D(t), n = D(n), BigInt(j([
		e,
		t,
		n
	]))), ye = () => {
		fe.length || v("no exception to throw");
		var e = fe.at(-1), t = e.excPtr;
		throw e.set_rethrown(!0), e.set_caught(!1), pe++, Ei(t), he = new g(t), he;
	};
	function be(e, t, n) {
		throw e = D(e), t = D(t), n = D(n), new ge(e).init(t, n), Ei(e), he = new g(e), pe++, he;
	}
	var xe = () => pe;
	function Se(e) {
		throw e = D(e), he ||= new g(e), he;
	}
	var P = {
		isAbs: (e) => e.charAt(0) === "/",
		splitPath: (e) => /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(e).slice(1),
		normalizeArray: (e, t) => {
			for (var n = 0, r = e.length - 1; r >= 0; r--) {
				var i = e[r];
				i === "." ? e.splice(r, 1) : i === ".." ? (e.splice(r, 1), n++) : n && (e.splice(r, 1), n--);
			}
			if (t) for (; n; n--) e.unshift("..");
			return e;
		},
		normalize: (e) => {
			var t = P.isAbs(e), n = e.slice(-1) === "/";
			return e = P.normalizeArray(e.split("/").filter((e) => !!e), !t).join("/"), !e && !t && (e = "."), e && n && (e += "/"), (t ? "/" : "") + e;
		},
		dirname: (e) => {
			var t = P.splitPath(e), n = t[0], r = t[1];
			return !n && !r ? "." : (r &&= r.slice(0, -1), n + r);
		},
		basename: (e) => e && e.match(/([^\/]+|\/)\/*$/)[1],
		join: (...e) => P.normalize(e.join("/")),
		join2: (e, t) => P.normalize(e + "/" + t)
	}, F = () => (e) => (crypto.getRandomValues(e), 0), Ce = (e) => (Ce = F())(e), we = {
		resolve: (...e) => {
			for (var t = "", n = !1, r = e.length - 1; r >= -1 && !n; r--) {
				var i = r >= 0 ? e[r] : B.cwd();
				if (typeof i != "string") throw TypeError("Arguments to path.resolve must be strings");
				if (!i) return "";
				t = i + "/" + t, n = P.isAbs(i);
			}
			return t = P.normalizeArray(t.split("/").filter((e) => !!e), !n).join("/"), (n ? "/" : "") + t || ".";
		},
		relative: (e, t) => {
			e = we.resolve(e).slice(1), t = we.resolve(t).slice(1);
			function n(e) {
				for (var t = 0; t < e.length && e[t] === ""; t++);
				for (var n = e.length - 1; n >= 0 && e[n] === ""; n--);
				return t > n ? [] : e.slice(t, n - t + 1);
			}
			for (var r = n(e.split("/")), i = n(t.split("/")), a = Math.min(r.length, i.length), o = a, s = 0; s < a; s++) if (r[s] !== i[s]) {
				o = s;
				break;
			}
			for (var c = [], s = o; s < r.length; s++) c.push("..");
			return c = c.concat(i.slice(o)), c.join("/");
		}
	}, Te = globalThis.TextDecoder && new TextDecoder(), Ee = (e, t, n, r) => {
		var i = t + n;
		if (r) return i;
		for (; e[t] && !(t >= i);) ++t;
		return t;
	}, De = (e, t = 0, n, r) => {
		var i = Ee(e, t, n, r);
		if (i - t > 16 && e.buffer && Te) return Te.decode(e.subarray(t, i));
		for (var a = ""; t < i;) {
			var o = e[t++];
			if (!(o & 128)) {
				a += String.fromCharCode(o);
				continue;
			}
			var s = e[t++] & 63;
			if ((o & 224) == 192) {
				a += String.fromCharCode((o & 31) << 6 | s);
				continue;
			}
			var c = e[t++] & 63;
			if (o = (o & 240) == 224 ? (o & 15) << 12 | s << 6 | c : (o & 7) << 18 | s << 12 | c << 6 | e[t++] & 63, o < 65536) a += String.fromCharCode(o);
			else {
				var l = o - 65536;
				a += String.fromCharCode(55296 | l >> 10, 56320 | l & 1023);
			}
		}
		return a;
	}, Oe = [], ke = (e) => {
		for (var t = 0, n = 0; n < e.length; ++n) {
			var r = e.charCodeAt(n);
			r <= 127 ? t++ : r <= 2047 ? t += 2 : r >= 55296 && r <= 57343 ? (t += 4, ++n) : t += 3;
		}
		return t;
	}, Ae = (e, t, n, r) => {
		if (!(r > 0)) return 0;
		for (var i = n, a = n + r - 1, o = 0; o < e.length; ++o) {
			var s = e.codePointAt(o);
			if (s <= 127) {
				if (n >= a) break;
				t[n++] = s;
			} else if (s <= 2047) {
				if (n + 1 >= a) break;
				t[n++] = 192 | s >> 6, t[n++] = 128 | s & 63;
			} else if (s <= 65535) {
				if (n + 2 >= a) break;
				t[n++] = 224 | s >> 12, t[n++] = 128 | s >> 6 & 63, t[n++] = 128 | s & 63;
			} else {
				if (n + 3 >= a) break;
				t[n++] = 240 | s >> 18, t[n++] = 128 | s >> 12 & 63, t[n++] = 128 | s >> 6 & 63, t[n++] = 128 | s & 63, o++;
			}
		}
		return t[n] = 0, n - i;
	}, je = (e, t, n) => {
		var r = n > 0 ? n : ke(e) + 1, i = Array(r), a = Ae(e, i, 0, i.length);
		return t && (i.length = a), i;
	}, Me = () => {
		if (!Oe.length) {
			var e = null;
			if (globalThis.window?.prompt && (e = window.prompt("Input: "), e !== null && (e += "\n")), !e) return null;
			Oe = je(e, !0);
		}
		return Oe.shift();
	}, I = {
		ttys: [],
		init() {},
		shutdown() {},
		register(e, t) {
			I.ttys[e] = {
				input: [],
				output: [],
				ops: t
			}, B.registerDevice(e, I.stream_ops);
		},
		stream_ops: {
			open(e) {
				var t = I.ttys[e.node.rdev];
				if (!t) throw new B.ErrnoError(43);
				e.tty = t, e.seekable = !1;
			},
			close(e) {
				e.tty.ops.fsync(e.tty);
			},
			fsync(e) {
				e.tty.ops.fsync(e.tty);
			},
			read(e, t, n, r, i) {
				if (!e.tty || !e.tty.ops.get_char) throw new B.ErrnoError(60);
				for (var a = 0, o = 0; o < r; o++) {
					var s;
					try {
						s = e.tty.ops.get_char(e.tty);
					} catch {
						throw new B.ErrnoError(29);
					}
					if (s === void 0 && !a) throw new B.ErrnoError(6);
					if (s == null) break;
					a++, t[n + o] = s;
				}
				return a && (e.node.atime = Date.now()), a;
			},
			write(e, t, n, r, i) {
				if (!e.tty || !e.tty.ops.put_char) throw new B.ErrnoError(60);
				try {
					for (var a = 0; a < r; a++) e.tty.ops.put_char(e.tty, t[n + a]);
				} catch {
					throw new B.ErrnoError(29);
				}
				return r && (e.node.mtime = e.node.ctime = Date.now()), a;
			}
		},
		default_tty_ops: {
			get_char(e) {
				return Me();
			},
			put_char(e, t) {
				t === null || t === 10 ? (d(De(e.output)), e.output = []) : t != 0 && e.output.push(t);
			},
			fsync(e) {
				e.output?.length > 0 && (d(De(e.output)), e.output = []);
			},
			ioctl_tcgets(e) {
				return {
					c_iflag: 25856,
					c_oflag: 5,
					c_cflag: 191,
					c_lflag: 35387,
					c_cc: [
						3,
						28,
						127,
						21,
						4,
						0,
						1,
						0,
						17,
						19,
						26,
						0,
						18,
						15,
						23,
						22,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0
					]
				};
			},
			ioctl_tcsets(e, t, n) {
				return 0;
			},
			ioctl_tiocgwinsz(e) {
				return [24, 80];
			}
		},
		default_tty1_ops: {
			put_char(e, t) {
				t === null || t === 10 ? (f(De(e.output)), e.output = []) : t != 0 && e.output.push(t);
			},
			fsync(e) {
				e.output?.length > 0 && (f(De(e.output)), e.output = []);
			}
		}
	}, Ne, Pe = (e, t) => Ne.fill(0, e, e + t), Fe = (e, t) => Math.ceil(e / t) * t, Ie = (e) => {
		e = Fe(e, 65536);
		var t = xi(65536, e);
		return t && Pe(t, e), t;
	}, L = {
		ops_table: null,
		mount(e) {
			return L.createNode(null, "/", 16895, 0);
		},
		createNode(e, t, n, r) {
			if (B.isBlkdev(n) || B.isFIFO(n)) throw new B.ErrnoError(63);
			L.ops_table ||= {
				dir: {
					node: {
						getattr: L.node_ops.getattr,
						setattr: L.node_ops.setattr,
						lookup: L.node_ops.lookup,
						mknod: L.node_ops.mknod,
						rename: L.node_ops.rename,
						unlink: L.node_ops.unlink,
						rmdir: L.node_ops.rmdir,
						readdir: L.node_ops.readdir,
						symlink: L.node_ops.symlink
					},
					stream: { llseek: L.stream_ops.llseek }
				},
				file: {
					node: {
						getattr: L.node_ops.getattr,
						setattr: L.node_ops.setattr
					},
					stream: {
						llseek: L.stream_ops.llseek,
						read: L.stream_ops.read,
						write: L.stream_ops.write,
						mmap: L.stream_ops.mmap,
						msync: L.stream_ops.msync
					}
				},
				link: {
					node: {
						getattr: L.node_ops.getattr,
						setattr: L.node_ops.setattr,
						readlink: L.node_ops.readlink
					},
					stream: {}
				},
				chrdev: {
					node: {
						getattr: L.node_ops.getattr,
						setattr: L.node_ops.setattr
					},
					stream: B.chrdev_stream_ops
				}
			};
			var i = B.createNode(e, t, n, r);
			return B.isDir(i.mode) ? (i.node_ops = L.ops_table.dir.node, i.stream_ops = L.ops_table.dir.stream, i.contents = {}) : B.isFile(i.mode) ? (i.node_ops = L.ops_table.file.node, i.stream_ops = L.ops_table.file.stream, i.usedBytes = 0, i.contents = L.emptyFileContents ??= /* @__PURE__ */ new Uint8Array()) : B.isLink(i.mode) ? (i.node_ops = L.ops_table.link.node, i.stream_ops = L.ops_table.link.stream) : B.isChrdev(i.mode) && (i.node_ops = L.ops_table.chrdev.node, i.stream_ops = L.ops_table.chrdev.stream), i.atime = i.mtime = i.ctime = Date.now(), e && (e.contents[t] = i, e.atime = e.mtime = e.ctime = i.atime), i;
		},
		getFileDataAsTypedArray(e) {
			return e.contents.subarray(0, e.usedBytes);
		},
		expandFileStorage(e, t) {
			var n = e.contents.length;
			if (!(n >= t)) {
				t = Math.max(t, n * (n < 1048576 ? 2 : 1.125) >>> 0), n && (t = Math.max(t, 256));
				var r = L.getFileDataAsTypedArray(e);
				e.contents = new Uint8Array(t), e.contents.set(r);
			}
		},
		resizeFileStorage(e, t) {
			if (e.usedBytes != t) {
				var n = e.contents;
				e.contents = new Uint8Array(t), e.contents.set(n.subarray(0, Math.min(t, e.usedBytes))), e.usedBytes = t;
			}
		},
		node_ops: {
			getattr(e) {
				var t = {};
				return t.dev = B.isChrdev(e.mode) ? e.id : 1, t.ino = e.id, t.mode = e.mode, t.nlink = 1, t.uid = 0, t.gid = 0, t.rdev = e.rdev, t.size = B.isDir(e.mode) ? 4096 : B.isFile(e.mode) ? e.usedBytes : B.isLink(e.mode) ? e.link.length : 0, t.atime = new Date(e.atime), t.mtime = new Date(e.mtime), t.ctime = new Date(e.ctime), t.blksize = 4096, t.blocks = Math.ceil(t.size / t.blksize), t;
			},
			setattr(e, t) {
				for (let n of [
					"mode",
					"atime",
					"mtime",
					"ctime"
				]) t[n] != null && (e[n] = t[n]);
				t.size !== void 0 && L.resizeFileStorage(e, t.size);
			},
			lookup(e, t) {
				throw L.doesNotExistError || (L.doesNotExistError = new B.ErrnoError(44), L.doesNotExistError.stack = "<generic error, no stack>"), L.doesNotExistError;
			},
			mknod(e, t, n, r) {
				return L.createNode(e, t, n, r);
			},
			rename(e, t, n) {
				var r;
				try {
					r = B.lookupNode(t, n);
				} catch {}
				if (r) {
					if (B.isDir(e.mode)) for (var i in r.contents) throw new B.ErrnoError(55);
					B.hashRemoveNode(r);
				}
				delete e.parent.contents[e.name], t.contents[n] = e, e.name = n, t.ctime = t.mtime = e.parent.ctime = e.parent.mtime = Date.now();
			},
			unlink(e, t) {
				delete e.contents[t], e.ctime = e.mtime = Date.now();
			},
			rmdir(e, t) {
				for (var n in B.lookupNode(e, t).contents) throw new B.ErrnoError(55);
				delete e.contents[t], e.ctime = e.mtime = Date.now();
			},
			readdir(e) {
				return [
					".",
					"..",
					...Object.keys(e.contents)
				];
			},
			symlink(e, t, n) {
				var r = L.createNode(e, t, 41471, 0);
				return r.link = n, r;
			},
			readlink(e) {
				if (!B.isLink(e.mode)) throw new B.ErrnoError(28);
				return e.link;
			}
		},
		stream_ops: {
			read(e, t, n, r, i) {
				var a = e.node.contents;
				if (i >= e.node.usedBytes) return 0;
				var o = Math.min(e.node.usedBytes - i, r);
				return t.set(a.subarray(i, i + o), n), o;
			},
			write(e, t, n, r, i, a) {
				if (t.buffer === C.buffer && (a = !1), !r) return 0;
				var o = e.node;
				return o.mtime = o.ctime = Date.now(), a ? (o.contents = t.subarray(n, n + r), o.usedBytes = r) : !o.usedBytes && !i ? (o.contents = t.slice(n, n + r), o.usedBytes = r) : (L.expandFileStorage(o, i + r), o.contents.set(t.subarray(n, n + r), i), o.usedBytes = Math.max(o.usedBytes, i + r)), r;
			},
			llseek(e, t, n) {
				var r = t;
				if (n === 1 ? r += e.position : n === 2 && B.isFile(e.node.mode) && (r += e.node.usedBytes), r < 0) throw new B.ErrnoError(28);
				return r;
			},
			mmap(e, t, n, r, i) {
				if (!B.isFile(e.node.mode)) throw new B.ErrnoError(43);
				var a, o, s = e.node.contents;
				if (!(i & 2) && s.buffer === C.buffer) o = !1, a = s.byteOffset;
				else {
					if (o = !0, a = Ie(t), !a) throw new B.ErrnoError(48);
					s && ((n > 0 || n + t < s.length) && (s = s.subarray ? s.subarray(n, n + t) : Array.prototype.slice.call(s, n, n + t)), C.set(s, a));
				}
				return {
					ptr: a,
					allocated: o
				};
			},
			msync(e, t, n, r, i) {
				return L.stream_ops.write(e, t, 0, r, n, !1), 0;
			}
		}
	}, R = (e) => {
		if (typeof e != "string") return e;
		var t = {
			r: 0,
			"r+": 2,
			w: 577,
			"w+": 578,
			a: 1089,
			"a+": 1090
		}[e];
		if (t === void 0) throw Error(`Unknown file open mode: ${e}`);
		return t;
	}, Le = (e) => (typeof e == "string" && (e = je(e, !0)), e.subarray || (e = new Uint8Array(e)), e), Re = (e, t) => {
		var n = 0;
		return e && (n |= 365), t && (n |= 146), n;
	}, ze = async (e) => {
		var t = await l(e);
		return new Uint8Array(t);
	}, Be = (...e) => B.createDataFile(...e), Ve = (e) => e, He = null, Ue = async () => He, We = 0, Ge = null, z = (e) => {
		We--, We || Ge();
	}, Ke = (e) => {
		We || (He = new Promise((e) => Ge = e)), We++;
	}, qe = [], Je = async (e, t) => {
		typeof Browser < "u" && Browser.init();
		for (var n of qe) if (n.canHandle(t)) return n.handle(e, t);
		return e;
	}, Ye = async (e, t, n, r, i, a, o, s) => {
		var c = t ? we.resolve(P.join2(e, t)) : e, l = Ve(`cp ${c}`);
		Ke(l);
		try {
			var u = n;
			typeof n == "string" && (u = await ze(n)), u = await Je(u, c), s?.(), a || Be(e, t, u, r, i, o);
		} finally {
			z(l);
		}
	}, Xe = (e, t, n, r, i, a, o, s, c, l) => {
		Ye(e, t, n, r, i, s, c, l).then(a).catch(o);
	}, B = {
		root: null,
		mounts: [],
		devices: {},
		streams: [],
		nextInode: 1,
		nameTable: null,
		currentPath: "/",
		initialized: !1,
		ignorePermissions: !0,
		filesystems: null,
		syncFSRequests: 0,
		ErrnoError: class {
			name = "ErrnoError";
			constructor(e) {
				this.errno = e;
			}
		},
		FSStream: class {
			shared = {};
			get object() {
				return this.node;
			}
			set object(e) {
				this.node = e;
			}
			get isRead() {
				return (this.flags & 2097155) != 1;
			}
			get isWrite() {
				return !!(this.flags & 2097155);
			}
			get isAppend() {
				return this.flags & 1024;
			}
			get flags() {
				return this.shared.flags;
			}
			set flags(e) {
				this.shared.flags = e;
			}
			get position() {
				return this.shared.position;
			}
			set position(e) {
				this.shared.position = e;
			}
		},
		FSNode: class {
			node_ops = {};
			stream_ops = {};
			readMode = 365;
			writeMode = 146;
			mounted = null;
			constructor(e, t, n, r) {
				e ||= this, this.parent = e, this.mount = e.mount, this.id = B.nextInode++, this.name = t, this.mode = n, this.rdev = r, this.atime = this.mtime = this.ctime = Date.now();
			}
			get read() {
				return (this.mode & this.readMode) === this.readMode;
			}
			set read(e) {
				e ? this.mode |= this.readMode : this.mode &= ~this.readMode;
			}
			get write() {
				return (this.mode & this.writeMode) === this.writeMode;
			}
			set write(e) {
				e ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
			}
			get isFolder() {
				return B.isDir(this.mode);
			}
			get isDevice() {
				return B.isChrdev(this.mode);
			}
			addListener(e, t = !1) {
				var n = {
					cb: e,
					exclusive: t
				}, r = this.listeners ??= /* @__PURE__ */ new Set();
				return r.add(n), {
					listeners: r,
					entry: n
				};
			}
			notifyListeners(e) {
				if (this.listeners) {
					var t;
					for (var n of this.listeners) n.exclusive ? (t ||= []).push(n) : n.cb(e);
					if (t) {
						var r = (this.exclTurn || 0) % t.length;
						this.exclTurn = r + 1, t[r].cb(e);
					}
				}
			}
		},
		lookupPath(e, t = {}) {
			if (!e) throw new B.ErrnoError(44);
			t.follow_mount ??= !0, P.isAbs(e) || (e = B.cwd() + "/" + e);
			linkloop: for (var n = 0; n < 40; n++) {
				for (var r = e.split("/").filter((e) => !!e), i = B.root, a = "/", o = 0; o < r.length; o++) {
					var s = o === r.length - 1;
					if (s && t.parent) break;
					if (r[o] !== ".") {
						if (r[o] === "..") {
							if (a = P.dirname(a), B.isRoot(i)) {
								e = a + "/" + r.slice(o + 1).join("/"), n--;
								continue linkloop;
							}
							i = i.parent;
							continue;
						}
						a = P.join2(a, r[o]);
						try {
							i = B.lookupNode(i, r[o]);
						} catch (e) {
							if (e?.errno === 44 && s && t.noent_okay) return { path: a };
							throw e;
						}
						if (B.isMountpoint(i) && (!s || t.follow_mount) && (i = i.mounted.root), B.isLink(i.mode) && (!s || t.follow)) {
							if (!i.node_ops.readlink) throw new B.ErrnoError(52);
							var c = i.node_ops.readlink(i);
							P.isAbs(c) || (c = P.dirname(a) + "/" + c), e = c + "/" + r.slice(o + 1).join("/");
							continue linkloop;
						}
					}
				}
				return {
					path: a,
					node: i
				};
			}
			throw new B.ErrnoError(32);
		},
		getPath(e) {
			for (var t;;) {
				if (B.isRoot(e)) {
					var n = e.mount.mountpoint;
					return t ? n[n.length - 1] === "/" ? n + t : `${n}/${t}` : n;
				}
				t = t ? `${e.name}/${t}` : e.name, e = e.parent;
			}
		},
		hashName(e, t) {
			for (var n = 0, r = 0; r < t.length; r++) n = (n << 5) - n + t.charCodeAt(r) | 0;
			return (e + n >>> 0) % B.nameTable.length;
		},
		hashAddNode(e) {
			var t = B.hashName(e.parent.id, e.name);
			e.name_next = B.nameTable[t], B.nameTable[t] = e;
		},
		hashRemoveNode(e) {
			var t = B.hashName(e.parent.id, e.name);
			if (B.nameTable[t] === e) B.nameTable[t] = e.name_next;
			else for (var n = B.nameTable[t]; n;) {
				if (n.name_next === e) {
					n.name_next = e.name_next;
					break;
				}
				n = n.name_next;
			}
		},
		lookupNode(e, t) {
			var n = B.mayLookup(e);
			if (n) throw new B.ErrnoError(n);
			for (var r = B.hashName(e.id, t), i = B.nameTable[r]; i; i = i.name_next) {
				var a = i.name;
				if (i.parent.id === e.id && a === t) return i;
			}
			return B.lookup(e, t);
		},
		createNode(e, t, n, r) {
			var i = new B.FSNode(e, t, n, r);
			return B.hashAddNode(i), i;
		},
		destroyNode(e) {
			B.hashRemoveNode(e);
		},
		isRoot(e) {
			return e === e.parent;
		},
		isMountpoint(e) {
			return !!e.mounted;
		},
		isFile(e) {
			return (e & 61440) == 32768;
		},
		isDir(e) {
			return (e & 61440) == 16384;
		},
		isLink(e) {
			return (e & 61440) == 40960;
		},
		isChrdev(e) {
			return (e & 61440) == 8192;
		},
		isBlkdev(e) {
			return (e & 61440) == 24576;
		},
		isFIFO(e) {
			return (e & 61440) == 4096;
		},
		isSocket(e) {
			return (e & 49152) == 49152;
		},
		flagsToPermissionString(e) {
			var t = [
				"r",
				"w",
				"rw"
			][e & 3];
			return e & 512 && (t += "w"), t;
		},
		nodePermissions(e, t) {
			return B.ignorePermissions ? 0 : t.includes("r") && !(e.mode & 292) || t.includes("w") && !(e.mode & 146) || t.includes("x") && !(e.mode & 73) ? 2 : 0;
		},
		mayLookup(e) {
			return B.isDir(e.mode) ? B.nodePermissions(e, "x") || (e.node_ops.lookup ? 0 : 2) : 54;
		},
		mayCreate(e, t) {
			if (!B.isDir(e.mode)) return 54;
			try {
				return B.lookupNode(e, t), 20;
			} catch {}
			return B.nodePermissions(e, "wx");
		},
		mayDelete(e, t, n) {
			var r;
			try {
				r = B.lookupNode(e, t);
			} catch (e) {
				return e.errno;
			}
			var i = B.nodePermissions(e, "wx");
			if (i) return i;
			if (n) {
				if (!B.isDir(r.mode)) return 54;
				if (B.isRoot(r) || B.getPath(r) === B.cwd()) return 10;
			} else if (B.isDir(r.mode)) return 31;
			return 0;
		},
		mayOpen(e, t) {
			if (!e) return 44;
			if (B.isLink(e.mode)) return 32;
			var n = B.flagsToPermissionString(t);
			return B.isDir(e.mode) && (n !== "r" || t & 576) ? 31 : B.nodePermissions(e, n);
		},
		checkOpExists(e, t) {
			if (!e) throw new B.ErrnoError(t);
			return e;
		},
		MAX_OPEN_FDS: 4096,
		nextfd() {
			for (var e = 0; e <= B.MAX_OPEN_FDS; e++) if (!B.streams[e]) return e;
			throw new B.ErrnoError(33);
		},
		getStreamChecked(e) {
			var t = B.getStream(e);
			if (!t) throw new B.ErrnoError(8);
			return t;
		},
		getStream: (e) => B.streams[e],
		createStream(e, t = -1) {
			return e = Object.assign(new B.FSStream(), e), t == -1 && (t = B.nextfd()), e.fd = t, B.streams[t] = e, e;
		},
		closeStream(e) {
			B.streams[e] = null;
		},
		dupStream(e, t = -1) {
			var n = B.createStream(e, t);
			return n.stream_ops?.dup?.(n), n;
		},
		doSetAttr(e, t, n) {
			var r = e?.stream_ops.setattr, i = r ? e : t;
			r ??= t.node_ops.setattr, B.checkOpExists(r, 63);
			try {
				r(i, n);
			} catch (e) {
				throw e instanceof RangeError ? new B.ErrnoError(22) : e;
			}
		},
		chrdev_stream_ops: {
			open(e) {
				e.stream_ops = B.getDevice(e.node.rdev).stream_ops, e.stream_ops.open?.(e);
			},
			llseek() {
				throw new B.ErrnoError(70);
			}
		},
		major: (e) => e >> 8,
		minor: (e) => e & 255,
		makedev: (e, t) => e << 8 | t,
		registerDevice(e, t) {
			B.devices[e] = { stream_ops: t };
		},
		getDevice: (e) => B.devices[e],
		getMounts(e) {
			for (var t = [], n = [e]; n.length;) {
				var r = n.pop();
				t.push(r), n.push(...r.mounts);
			}
			return t;
		},
		syncfs(e, t) {
			typeof e == "function" && (t = e, e = !1), B.syncFSRequests++, B.syncFSRequests > 1 && f(`warning: ${B.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
			var n = B.getMounts(B.root.mount), r = 0;
			function i(e) {
				return B.syncFSRequests--, t(e);
			}
			function a(e) {
				if (e) return a.errored ? void 0 : (a.errored = !0, i(e));
				++r >= n.length && i(null);
			}
			for (var o of n) o.type.syncfs ? o.type.syncfs(o, e, a) : a(null);
		},
		mount(e, t, n) {
			var r = n === "/", i = !n, a;
			if (r && B.root) throw new B.ErrnoError(10);
			if (!r && !i) {
				var o = B.lookupPath(n, { follow_mount: !1 });
				if (n = o.path, a = o.node, B.isMountpoint(a)) throw new B.ErrnoError(10);
				if (!B.isDir(a.mode)) throw new B.ErrnoError(54);
			}
			var s = {
				type: e,
				opts: t,
				mountpoint: n,
				mounts: []
			}, c = e.mount(s);
			return c.mount = s, s.root = c, r ? B.root = c : a && (a.mounted = s, a.mount && a.mount.mounts.push(s)), c;
		},
		unmount(e) {
			var t = B.lookupPath(e, { follow_mount: !1 });
			if (!B.isMountpoint(t.node)) throw new B.ErrnoError(28);
			var n = t.node, r = n.mounted, i = B.getMounts(r);
			for (var [a, o] of Object.entries(B.nameTable)) for (; o;) {
				var s = o.name_next;
				i.includes(o.mount) && B.destroyNode(o), o = s;
			}
			n.mounted = null;
			var c = n.mount.mounts.indexOf(r);
			n.mount.mounts.splice(c, 1);
		},
		lookup(e, t) {
			return e.node_ops.lookup(e, t);
		},
		mknod(e, t, n) {
			var r = B.lookupPath(e, { parent: !0 }).node, i = P.basename(e);
			if (!i) throw new B.ErrnoError(28);
			if (i === "." || i === "..") throw new B.ErrnoError(20);
			var a = B.mayCreate(r, i);
			if (a) throw new B.ErrnoError(a);
			if (!r.node_ops.mknod) throw new B.ErrnoError(63);
			return r.node_ops.mknod(r, i, t, n);
		},
		statfs(e) {
			return B.statfsNode(B.lookupPath(e, { follow: !0 }).node);
		},
		statfsStream(e) {
			return B.statfsNode(e.node);
		},
		statfsNode(e) {
			var t = {
				bsize: 4096,
				frsize: 4096,
				blocks: 1e6,
				bfree: 5e5,
				bavail: 5e5,
				files: B.nextInode,
				ffree: B.nextInode - 1,
				fsid: 42,
				flags: 2,
				namelen: 255
			};
			return e.node_ops.statfs && Object.assign(t, e.node_ops.statfs(e.mount.opts.root)), t;
		},
		create(e, t = 438) {
			return t &= 4095, t |= 32768, B.mknod(e, t, 0);
		},
		mkdir(e, t = 511) {
			return t &= 1023, t |= 16384, B.mknod(e, t, 0);
		},
		mkdirTree(e, t) {
			var n = e.split("/"), r = "";
			for (var i of n) if (i) {
				(r || P.isAbs(e)) && (r += "/"), r += i;
				try {
					B.mkdir(r, t);
				} catch (e) {
					if (e.errno != 20) throw e;
				}
			}
		},
		mkdev(e, t, n) {
			return n === void 0 && (n = t, t = 438), t |= 8192, B.mknod(e, t, n);
		},
		symlink(e, t) {
			if (!we.resolve(e)) throw new B.ErrnoError(44);
			var n = B.lookupPath(t, { parent: !0 }).node;
			if (!n) throw new B.ErrnoError(44);
			var r = P.basename(t), i = B.mayCreate(n, r);
			if (i) throw new B.ErrnoError(i);
			if (!n.node_ops.symlink) throw new B.ErrnoError(63);
			return n.node_ops.symlink(n, r, e);
		},
		link(e, t, n) {
			var r = B.lookupPath(t, { parent: !0 }).node;
			if (!r) throw new B.ErrnoError(44);
			var i = P.basename(t), a = B.mayCreate(r, i);
			if (a) throw new B.ErrnoError(a);
			if (!r.node_ops.link) throw new B.ErrnoError(34);
			return r.node_ops.link(r, i, e, n);
		},
		rename(e, t) {
			var n = P.dirname(e), r = P.dirname(t), i = P.basename(e), a = P.basename(t), o = B.lookupPath(e, { parent: !0 }), s = o.node, c;
			if (o = B.lookupPath(t, { parent: !0 }), c = o.node, !s || !c) throw new B.ErrnoError(44);
			if (s.mount !== c.mount) throw new B.ErrnoError(75);
			var l = B.lookupNode(s, i), u = we.relative(e, r);
			if (u.charAt(0) !== ".") throw new B.ErrnoError(28);
			if (u = we.relative(t, n), u.charAt(0) !== ".") throw new B.ErrnoError(55);
			var d;
			try {
				d = B.lookupNode(c, a);
			} catch {}
			if (l !== d) {
				var f = B.isDir(l.mode), p = B.mayDelete(s, i, f);
				if (p || (p = d ? B.mayDelete(c, a, f) : B.mayCreate(c, a), p)) throw new B.ErrnoError(p);
				if (!s.node_ops.rename) throw new B.ErrnoError(63);
				if (B.isMountpoint(l) || d && B.isMountpoint(d)) throw new B.ErrnoError(10);
				if (c !== s && (p = B.nodePermissions(s, "w"), p)) throw new B.ErrnoError(p);
				B.hashRemoveNode(l);
				try {
					s.node_ops.rename(l, c, a), l.parent = c;
				} catch (e) {
					throw e;
				} finally {
					B.hashAddNode(l);
				}
			}
		},
		rmdir(e) {
			var t = B.lookupPath(e, { parent: !0 }).node, n = P.basename(e), r = B.lookupNode(t, n), i = B.mayDelete(t, n, !0);
			if (i) throw new B.ErrnoError(i);
			if (!t.node_ops.rmdir) throw new B.ErrnoError(63);
			if (B.isMountpoint(r)) throw new B.ErrnoError(10);
			t.node_ops.rmdir(t, n), B.destroyNode(r);
		},
		readdir(e) {
			var t = B.lookupPath(e, { follow: !0 }).node;
			return B.checkOpExists(t.node_ops.readdir, 54)(t);
		},
		unlink(e) {
			var t = B.lookupPath(e, { parent: !0 }).node;
			if (!t) throw new B.ErrnoError(44);
			var n = P.basename(e), r = B.lookupNode(t, n), i = B.mayDelete(t, n, !1);
			if (i) throw new B.ErrnoError(i);
			if (!t.node_ops.unlink) throw new B.ErrnoError(63);
			if (B.isMountpoint(r)) throw new B.ErrnoError(10);
			t.node_ops.unlink(t, n), B.destroyNode(r);
		},
		readlink(e) {
			var t = B.lookupPath(e).node;
			if (!t) throw new B.ErrnoError(44);
			if (!t.node_ops.readlink) throw new B.ErrnoError(28);
			return t.node_ops.readlink(t);
		},
		stat(e, t) {
			var n = B.lookupPath(e, { follow: !t }).node;
			return B.checkOpExists(n.node_ops.getattr, 63)(n);
		},
		fstat(e) {
			var t = B.getStreamChecked(e), n = t.node, r = t.stream_ops.getattr, i = r ? t : n;
			return r ??= n.node_ops.getattr, B.checkOpExists(r, 63), r(i);
		},
		lstat(e) {
			return B.stat(e, !0);
		},
		doChmod(e, t, n, r) {
			B.doSetAttr(e, t, {
				mode: n & 4095 | t.mode & -4096,
				ctime: Date.now(),
				dontFollow: r
			});
		},
		chmod(e, t, n) {
			var r = typeof e == "string" ? B.lookupPath(e, { follow: !n }).node : e;
			B.doChmod(null, r, t, n);
		},
		lchmod(e, t) {
			B.chmod(e, t, !0);
		},
		fchmod(e, t) {
			var n = B.getStreamChecked(e);
			B.doChmod(n, n.node, t, !1);
		},
		doChown(e, t, n) {
			B.doSetAttr(e, t, {
				timestamp: Date.now(),
				dontFollow: n
			});
		},
		chown(e, t, n, r) {
			var i = typeof e == "string" ? B.lookupPath(e, { follow: !r }).node : e;
			B.doChown(null, i, r);
		},
		lchown(e, t, n) {
			B.chown(e, t, n, !0);
		},
		fchown(e, t, n) {
			var r = B.getStreamChecked(e);
			B.doChown(r, r.node, !1);
		},
		doTruncate(e, t, n) {
			if (B.isDir(t.mode)) throw new B.ErrnoError(31);
			if (!B.isFile(t.mode)) throw new B.ErrnoError(28);
			var r = B.nodePermissions(t, "w");
			if (r) throw new B.ErrnoError(r);
			B.doSetAttr(e, t, {
				size: n,
				timestamp: Date.now()
			});
		},
		truncate(e, t) {
			if (t < 0) throw new B.ErrnoError(28);
			var n = typeof e == "string" ? B.lookupPath(e, { follow: !0 }).node : e;
			B.doTruncate(null, n, t);
		},
		ftruncate(e, t) {
			var n = B.getStreamChecked(e);
			if (t < 0 || !(n.flags & 2097155)) throw new B.ErrnoError(28);
			B.doTruncate(n, n.node, t);
		},
		utime(e, t, n, r) {
			var i = B.lookupPath(e, { follow: !r });
			B.doSetAttr(null, i.node, {
				atime: t,
				mtime: n,
				dontFollow: r
			});
		},
		open(e, t, n = 438) {
			if (e === "") throw new B.ErrnoError(44);
			t = R(t), n = t & 64 ? n & 4095 | 32768 : 0;
			var r, i;
			if (typeof e == "object") r = e;
			else {
				i = e.endsWith("/");
				var a = B.lookupPath(e, {
					follow: !(t & 131072),
					noent_okay: !0
				});
				r = a.node, e = a.path;
			}
			var o = !1;
			if (t & 64) {
				if (r) {
					if (t & 128) throw new B.ErrnoError(20);
				} else if (i) throw new B.ErrnoError(31);
				else r = B.mknod(e, n | 511, 0), o = !0;
			}
			if (!r) throw new B.ErrnoError(44);
			if (B.isChrdev(r.mode) && (t &= -513), t & 65536 && !B.isDir(r.mode)) throw new B.ErrnoError(54);
			if (!o) {
				var s = B.mayOpen(r, t);
				if (s) throw new B.ErrnoError(s);
			}
			t & 512 && !o && B.truncate(r, 0), t &= -131713;
			var c = B.createStream({
				node: r,
				path: B.getPath(r),
				flags: t,
				seekable: !0,
				position: 0,
				stream_ops: r.stream_ops,
				ungotten: [],
				error: !1
			});
			return c.stream_ops.open && c.stream_ops.open(c), o && B.chmod(r, n & 511), c;
		},
		close(e) {
			if (B.isClosed(e)) throw new B.ErrnoError(8);
			e.getdents &&= null, e.node?.notifyListeners(32);
			try {
				e.stream_ops.close && e.stream_ops.close(e);
			} catch (e) {
				throw e;
			} finally {
				B.closeStream(e.fd);
			}
			e.fd = null;
		},
		isClosed(e) {
			return e.fd === null;
		},
		llseek(e, t, n) {
			if (B.isClosed(e)) throw new B.ErrnoError(8);
			if (!e.seekable || !e.stream_ops.llseek) throw new B.ErrnoError(70);
			if (n != 0 && n != 1 && n != 2) throw new B.ErrnoError(28);
			return e.position = e.stream_ops.llseek(e, t, n), e.ungotten = [], e.position;
		},
		read(e, t, n, r, i) {
			if (r < 0 || i < 0) throw new B.ErrnoError(28);
			if (B.isClosed(e) || (e.flags & 2097155) == 1) throw new B.ErrnoError(8);
			if (B.isDir(e.node.mode)) throw new B.ErrnoError(31);
			if (!e.stream_ops.read) throw new B.ErrnoError(28);
			var a = i !== void 0;
			if (!a) i = e.position;
			else if (!e.seekable) throw new B.ErrnoError(70);
			var o = e.stream_ops.read(e, t, n, r, i);
			return a || (e.position += o), o;
		},
		write(e, t, n, r, i, a) {
			if (r < 0 || i < 0) throw new B.ErrnoError(28);
			if (B.isClosed(e) || !(e.flags & 2097155)) throw new B.ErrnoError(8);
			if (B.isDir(e.node.mode)) throw new B.ErrnoError(31);
			if (!e.stream_ops.write) throw new B.ErrnoError(28);
			e.seekable && e.flags & 1024 && B.llseek(e, 0, 2);
			var o = i !== void 0;
			if (!o) i = e.position;
			else if (!e.seekable) throw new B.ErrnoError(70);
			var s = e.stream_ops.write(e, t, n, r, i, a);
			return o || (e.position += s), s;
		},
		mmap(e, t, n, r, i) {
			if (r & 2 && !(i & 2) && (e.flags & 2097155) != 2 || (e.flags & 2097155) == 1) throw new B.ErrnoError(2);
			if (!e.stream_ops.mmap) throw new B.ErrnoError(43);
			if (!t) throw new B.ErrnoError(28);
			return e.stream_ops.mmap(e, t, n, r, i);
		},
		msync(e, t, n, r, i) {
			return e.stream_ops.msync ? e.stream_ops.msync(e, t, n, r, i) : 0;
		},
		ioctl(e, t, n) {
			if (!e.stream_ops.ioctl) throw new B.ErrnoError(59);
			return e.stream_ops.ioctl(e, t, n);
		},
		readFile(e, t = {}) {
			t.flags = t.flags ?? 0, t.encoding = t.encoding ?? "binary", t.encoding !== "utf8" && t.encoding !== "binary" && v(`Invalid encoding type "${t.encoding}"`);
			var n = B.open(e, t.flags), r = B.stat(e).size, i = new Uint8Array(r);
			return B.read(n, i, 0, r, 0), t.encoding === "utf8" && (i = De(i)), B.close(n), i;
		},
		writeFile(e, t, n = {}) {
			n.flags = n.flags ?? 577;
			var r = B.open(e, n.flags, n.mode);
			t = Le(t), B.write(r, t, 0, t.byteLength, void 0, n.canOwn), B.close(r);
		},
		cwd: () => B.currentPath,
		chdir(e) {
			var t = B.lookupPath(e, { follow: !0 });
			if (t.node === null) throw new B.ErrnoError(44);
			if (!B.isDir(t.node.mode)) throw new B.ErrnoError(54);
			var n = B.nodePermissions(t.node, "x");
			if (n) throw new B.ErrnoError(n);
			B.currentPath = t.path;
		},
		createDefaultDirectories() {
			B.mkdir("/tmp"), B.mkdir("/home"), B.mkdir("/home/web_user");
		},
		createDefaultDevices() {
			B.mkdir("/dev"), B.registerDevice(B.makedev(1, 3), {
				read: () => 0,
				write: (e, t, n, r, i) => r,
				llseek: () => 0
			}), B.mkdev("/dev/null", B.makedev(1, 3)), I.register(B.makedev(5, 0), I.default_tty_ops), I.register(B.makedev(6, 0), I.default_tty1_ops), B.mkdev("/dev/tty", B.makedev(5, 0)), B.mkdev("/dev/tty1", B.makedev(6, 0));
			var e = /* @__PURE__ */ new Uint8Array(1024), t = 0, n = () => (t ||= (Ce(e), e.byteLength), e[--t]);
			B.createDevice("/dev", "random", n), B.createDevice("/dev", "urandom", n), B.mkdir("/dev/shm"), B.mkdir("/dev/shm/tmp");
		},
		createSpecialDirectories() {
			B.mkdir("/proc");
			var e = B.mkdir("/proc/self");
			B.mkdir("/proc/self/fd"), B.mount({ mount() {
				var t = B.createNode(e, "fd", 16895, 73);
				return t.stream_ops = { llseek: L.stream_ops.llseek }, t.node_ops = {
					lookup(e, t) {
						var n = +t, r = B.getStreamChecked(n), i = {
							parent: null,
							mount: { mountpoint: "fake" },
							node_ops: { readlink: () => r.path },
							id: n + 1
						};
						return i.parent = i, i;
					},
					readdir() {
						return Array.from(B.streams.entries()).filter(([e, t]) => t).map(([e, t]) => e.toString());
					}
				}, t;
			} }, {}, "/proc/self/fd");
		},
		createStandardStreams(e, t, n) {
			e ? B.createDevice("/dev", "stdin", e) : B.symlink("/dev/tty", "/dev/stdin"), t ? B.createDevice("/dev", "stdout", null, t) : B.symlink("/dev/tty", "/dev/stdout"), n ? B.createDevice("/dev", "stderr", null, n) : B.symlink("/dev/tty1", "/dev/stderr"), B.open("/dev/stdin", 0), B.open("/dev/stdout", 1), B.open("/dev/stderr", 1);
		},
		staticInit() {
			B.nameTable = Array(4096), B.mount(L, {}, "/"), B.createDefaultDirectories(), B.createDefaultDevices(), B.createSpecialDirectories(), B.filesystems = { MEMFS: L };
		},
		init(e, t, n) {
			B.initialized = !0, B.createStandardStreams(e, t, n);
		},
		quit() {
			B.initialized = !1;
			for (var e of B.streams) e && B.close(e);
		},
		findObject(e, t) {
			var n = B.analyzePath(e, t);
			return n.exists ? n.object : null;
		},
		analyzePath(e, t) {
			try {
				var n = B.lookupPath(e, { follow: !t });
				e = n.path;
			} catch {}
			var r = {
				isRoot: !1,
				exists: !1,
				error: 0,
				name: null,
				path: null,
				object: null,
				parentExists: !1,
				parentPath: null,
				parentObject: null
			};
			try {
				var n = B.lookupPath(e, { parent: !0 });
				r.parentExists = !0, r.parentPath = n.path, r.parentObject = n.node, r.name = P.basename(e), n = B.lookupPath(e, { follow: !t }), r.exists = !0, r.path = n.path, r.object = n.node, r.name = n.node.name, r.isRoot = n.path === "/";
			} catch (e) {
				r.error = e.errno;
			}
			return r;
		},
		createPath(e, t, n, r) {
			e = typeof e == "string" ? e : B.getPath(e);
			for (var i = t.split("/").reverse(); i.length;) {
				var a = i.pop();
				if (a) {
					var o = P.join2(e, a);
					try {
						B.mkdir(o);
					} catch (e) {
						if (e.errno != 20) throw e;
					}
					e = o;
				}
			}
			return o;
		},
		createFile(e, t, n, r, i) {
			var a = P.join2(typeof e == "string" ? e : B.getPath(e), t), o = Re(r, i);
			return B.create(a, o);
		},
		createDataFile(e, t, n, r, i, a) {
			var o = t;
			e && (e = typeof e == "string" ? e : B.getPath(e), o = t ? P.join2(e, t) : e);
			var s = Re(r, i), c = B.create(o, s);
			if (n) {
				n = Le(n), B.chmod(c, s | 146);
				var l = B.open(c, 577);
				B.write(l, n, 0, n.length, 0, a), B.close(l), B.chmod(c, s);
			}
		},
		createDevice(e, t, n, r) {
			var i = P.join2(typeof e == "string" ? e : B.getPath(e), t), a = Re(!!n, !!r);
			B.createDevice.major ??= 64;
			var o = B.makedev(B.createDevice.major++, 0);
			return B.registerDevice(o, {
				open(e) {
					e.seekable = !1;
				},
				close(e) {
					r?.buffer?.length && r(10);
				},
				read(e, t, r, i, a) {
					for (var o = 0, s = 0; s < i; s++) {
						var c;
						try {
							c = n();
						} catch {
							throw new B.ErrnoError(29);
						}
						if (c === void 0 && !o) throw new B.ErrnoError(6);
						if (c == null) break;
						o++, t[r + s] = c;
					}
					return o && (e.node.atime = Date.now()), o;
				},
				write(e, t, n, i, a) {
					for (var o = 0; o < i; o++) try {
						r(t[n + o]);
					} catch {
						throw new B.ErrnoError(29);
					}
					return i && (e.node.mtime = e.node.ctime = Date.now()), o;
				}
			}), B.mkdev(i, a, o);
		},
		forceLoadFile(e) {
			if (e.isDevice || e.isFolder || e.link || e.contents) return !0;
			if (globalThis.XMLHttpRequest) v("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
			else try {
				e.contents = u(e.url);
			} catch {
				throw new B.ErrnoError(29);
			}
		},
		createLazyFile(e, t, n, i, a) {
			class o {
				lengthKnown = !1;
				chunks = [];
				get(e) {
					if (!(e > this.length - 1 || e < 0)) {
						var t = e % this.chunkSize, n = e / this.chunkSize | 0;
						return this.getter(n)[t];
					}
				}
				setDataGetter(e) {
					this.getter = e;
				}
				cacheLength() {
					var e = new XMLHttpRequest();
					e.open("HEAD", n, !1), e.send(null), e.status >= 200 && e.status < 300 || e.status === 304 || v(`Couldn't load ${n}. Status: ${e.status}`);
					var t = Number(e.getResponseHeader("Content-length")), r, i = (r = e.getResponseHeader("Accept-Ranges")) && r === "bytes", a = (r = e.getResponseHeader("Content-Encoding")) && r === "gzip", o = 1048576;
					i || (o = t);
					var s = (e, r) => {
						e > r && v(`invalid range (${e}, ${r}) or no bytes requested!`), r > t - 1 && v(`only ${t} bytes available! programmer error!`);
						var i = new XMLHttpRequest();
						return i.open("GET", n, !1), t !== o && i.setRequestHeader("Range", `bytes=${e}-${r}`), i.responseType = "arraybuffer", i.overrideMimeType && i.overrideMimeType("text/plain; charset=x-user-defined"), i.send(null), i.status >= 200 && i.status < 300 || i.status === 304 || v(`Couldn't load ${n}. Status: ${i.status}`), i.response === void 0 ? je(i.responseText ?? "", !0) : new Uint8Array(i.response || []);
					}, c = this;
					c.setDataGetter((e) => {
						var n = e * o, r = (e + 1) * o - 1;
						return r = Math.min(r, t - 1), c.chunks[e] === void 0 && (c.chunks[e] = s(n, r)), c.chunks[e] === void 0 && v("doXHR failed!"), c.chunks[e];
					}), (a || !t) && (o = t = 1, t = this.getter(0).length, o = t, d("LazyFiles on gzip forces download of the whole file when length is accessed")), this._length = t, this._chunkSize = o, this.lengthKnown = !0;
				}
				get length() {
					return this.lengthKnown || this.cacheLength(), this._length;
				}
				get chunkSize() {
					return this.lengthKnown || this.cacheLength(), this._chunkSize;
				}
			}
			if (globalThis.XMLHttpRequest) {
				r || v("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");
				var s = {
					isDevice: !1,
					contents: new o()
				};
			} else var s = {
				isDevice: !1,
				url: n
			};
			var c = B.createFile(e, t, s, i, a);
			s.contents ? c.contents = s.contents : s.url && (c.contents = null, c.url = s.url), Object.defineProperties(c, { usedBytes: { get: function() {
				return this.contents.length;
			} } });
			var l = {};
			for (let [e, t] of Object.entries(c.stream_ops)) l[e] = (...e) => (B.forceLoadFile(c), t(...e));
			function u(e, t, n, r, i) {
				var a = e.node.contents;
				if (i >= a.length) return 0;
				var o = Math.min(a.length - i, r);
				if (a.slice) for (var s = 0; s < o; s++) t[n + s] = a[i + s];
				else for (var s = 0; s < o; s++) t[n + s] = a.get(i + s);
				return o;
			}
			return l.read = (e, t, n, r, i) => (B.forceLoadFile(c), u(e, t, n, r, i)), l.mmap = (e, t, n, r, i) => {
				B.forceLoadFile(c);
				var a = Ie(t);
				if (!a) throw new B.ErrnoError(48);
				return u(e, C, a, t, n), {
					ptr: a,
					allocated: !0
				};
			}, c.stream_ops = l, c;
		}
	}, Ze = (e, t, n) => e ? De(Ne, e, t, n) : "", V, H, U, W = {
		currentUmask: 18,
		calculateAt(e, t, n) {
			if (P.isAbs(t)) return t;
			var r = e === -100 ? B.cwd() : W.getStreamFromFD(e).path;
			if (t.length == 0) {
				if (!n) throw new B.ErrnoError(44);
				return r;
			}
			return r + "/" + t;
		},
		writeStat(e, t) {
			H[e / 4] = t.dev, H[(e + 4) / 4] = t.mode, A[(e + 8) / 8] = BigInt(t.nlink), H[(e + 16) / 4] = t.uid, H[(e + 20) / 4] = t.gid, H[(e + 24) / 4] = t.rdev, U[(e + 32) / 8] = BigInt(t.size), V[(e + 40) / 4] = 4096, V[(e + 44) / 4] = t.blocks;
			var n = t.atime.getTime(), r = t.mtime.getTime(), i = t.ctime.getTime();
			return U[(e + 48) / 8] = BigInt(Math.floor(n / 1e3)), A[(e + 56) / 8] = BigInt(n % 1e3 * 1e3 * 1e3), U[(e + 64) / 8] = BigInt(Math.floor(r / 1e3)), A[(e + 72) / 8] = BigInt(r % 1e3 * 1e3 * 1e3), U[(e + 80) / 8] = BigInt(Math.floor(i / 1e3)), A[(e + 88) / 8] = BigInt(i % 1e3 * 1e3 * 1e3), U[(e + 96) / 8] = BigInt(t.ino), 0;
		},
		writeStatFs(e, t) {
			H[(e + 8) / 4] = t.bsize, H[(e + 72) / 4] = t.bsize, U[(e + 16) / 8] = BigInt(t.blocks), U[(e + 24) / 8] = BigInt(t.bfree), U[(e + 32) / 8] = BigInt(t.bavail), U[(e + 40) / 8] = BigInt(t.files), U[(e + 48) / 8] = BigInt(t.ffree), H[(e + 56) / 4] = t.fsid, H[(e + 80) / 4] = t.flags, H[(e + 64) / 4] = t.namelen;
		},
		doMsync(e, t, n, r, i) {
			if (!B.isFile(t.node.mode)) throw new B.ErrnoError(43);
			if (r & 2) return 0;
			var a = Ne.subarray(e, e + n);
			B.msync(t, a, i, n, r);
		},
		getStreamFromFD(e) {
			return B.getStreamChecked(e);
		},
		varargs: void 0,
		getStr(e) {
			return Ze(e);
		}
	};
	function Qe(e, t) {
		e = D(e);
		try {
			return e = W.getStr(e), B.chmod(e, t), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function $e(e) {
		try {
			var t = W.getStreamFromFD(e);
			return B.dupStream(t).fd;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function G(e, t, n, r) {
		t = D(t);
		try {
			if (t = W.getStr(t), t = W.calculateAt(e, t), n & -8) return -28;
			var i = B.lookupPath(t, { follow: !0 }).node;
			if (!i) return -44;
			var a = "";
			return n & 4 && (a += "r"), n & 2 && (a += "w"), n & 1 && (a += "x"), a && B.nodePermissions(i, a) ? -2 : 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function K(e, t, n, r) {
		n = D(n), r = D(r);
		try {
			if (isNaN(n) || isNaN(r)) return -22;
			if (t != 0) return -138;
			if (n < 0 || r < 0) return -28;
			if (!W.getStreamFromFD(e).seekable) return -70;
			var i = B.fstat(e).size, a = n + r;
			return a > i && B.ftruncate(e, a), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function q(e, t) {
		try {
			return B.fchmod(e, t), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var et = () => {
		var e = Number(A[W.varargs / 8]);
		return W.varargs += 8, e;
	}, tt = () => {
		var e = V[W.varargs / 4];
		return W.varargs += 4, e;
	}, nt;
	function rt(e, t, n) {
		n = D(n), W.varargs = n;
		try {
			var r = W.getStreamFromFD(e);
			switch (t) {
				case 0:
					var i = tt();
					if (i < 0) return -28;
					for (; B.streams[i];) i++;
					return B.dupStream(r, i).fd;
				case 1:
				case 2: return 0;
				case 3: return r.flags;
				case 4:
					var i = tt(), a = 289792;
					return r.flags = r.flags & ~a | i & a, 0;
				case 5:
					var i = et(), o = 0;
					return nt[(i + o) / 2] = 2, 0;
				case 6:
				case 7: return 0;
			}
			return -28;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function it(e, t) {
		t = D(t);
		try {
			return W.writeStat(t, B.fstat(e));
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var at = (e, t, n) => Ae(e, Ne, t, n);
	function ot(e, t) {
		e = D(e), t = D(t);
		try {
			if (!t) return -28;
			var n = B.cwd(), r = ke(n) + 1;
			return t < r ? -68 : (at(n, e, t), r);
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function st(e, t, n) {
		t = D(t), n = D(n);
		try {
			var r = W.getStreamFromFD(e);
			r.getdents ||= B.readdir(r.path);
			for (var i = 280, a = 0, o = B.llseek(r, 0, 1), s = Math.floor(o / i), c = Math.min(r.getdents.length, s + Math.floor(n / i)), l = s; l < c; l++) {
				var u, d, f = r.getdents[l];
				if (f === ".") u = r.node.id, d = 4;
				else if (f === "..") u = B.lookupPath(r.path, { parent: !0 }).node.id, d = 4;
				else {
					var p;
					try {
						p = B.lookupNode(r.node, f);
					} catch (e) {
						if (e?.errno === 28) continue;
						throw e;
					}
					u = p.id, d = B.isChrdev(p.mode) ? 2 : B.isDir(p.mode) ? 4 : B.isLink(p.mode) ? 10 : 8;
				}
				U[(t + a) / 8] = BigInt(u), U[(t + a + 8) / 8] = BigInt((l + 1) * i), nt[(t + a + 16) / 2] = 280, C[t + a + 18] = d, at(f, t + a + 19, 256), a += i;
			}
			return B.llseek(r, l * i, 0), a;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function ct(e, t, n) {
		n = D(n), W.varargs = n;
		try {
			var r = W.getStreamFromFD(e);
			switch (t) {
				case 21509: return r.tty ? 0 : -59;
				case 21505:
					if (!r.tty) return -59;
					if (r.tty.ops.ioctl_tcgets) {
						var i = r.tty.ops.ioctl_tcgets(r), a = et();
						V[a / 4] = i.c_iflag || 0, V[(a + 4) / 4] = i.c_oflag || 0, V[(a + 8) / 4] = i.c_cflag || 0, V[(a + 12) / 4] = i.c_lflag || 0;
						for (var o = 0; o < 32; o++) C[a + o + 17] = i.c_cc[o] || 0;
						return 0;
					}
					return 0;
				case 21510:
				case 21511:
				case 21512: return r.tty ? 0 : -59;
				case 21506:
				case 21507:
				case 21508:
					if (!r.tty) return -59;
					if (r.tty.ops.ioctl_tcsets) {
						for (var a = et(), s = V[a / 4], c = V[(a + 4) / 4], l = V[(a + 8) / 4], u = V[(a + 12) / 4], d = [], o = 0; o < 32; o++) d.push(C[a + o + 17]);
						return r.tty.ops.ioctl_tcsets(r.tty, t, {
							c_iflag: s,
							c_oflag: c,
							c_cflag: l,
							c_lflag: u,
							c_cc: d
						});
					}
					return 0;
				case 21519:
					if (!r.tty) return -59;
					var a = et();
					return V[a / 4] = 0, 0;
				case 21520: return r.tty ? -28 : -59;
				case 21537:
				case 21531:
					var a = et();
					return B.ioctl(r, t, a);
				case 21523:
					if (!r.tty) return -59;
					if (r.tty.ops.ioctl_tiocgwinsz) {
						var f = r.tty.ops.ioctl_tiocgwinsz(r.tty), a = et();
						nt[a / 2] = f[0], nt[(a + 2) / 2] = f[1];
					}
					return 0;
				case 21524: return r.tty ? 0 : -59;
				case 21515: return r.tty ? 0 : -59;
				default: return -28;
			}
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function lt(e, t) {
		e = D(e), t = D(t);
		try {
			return e = W.getStr(e), W.writeStat(t, B.lstat(e));
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function ut(e, t, n, r) {
		t = D(t), n = D(n);
		try {
			t = W.getStr(t);
			var i = r & 256, a = r & 4096;
			return r &= -6401, t = W.calculateAt(e, t, a), W.writeStat(n, i ? B.lstat(t) : B.stat(t));
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function dt(e, t, n, r) {
		t = D(t), r = D(r), W.varargs = r;
		try {
			t = W.getStr(t), t = W.calculateAt(e, t);
			var i = r ? tt() : 0;
			return n & 64 && (i &= ~W.currentUmask), B.open(t, n, i).fd;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function ft(e, t, n, r) {
		t = D(t), n = D(n), r = D(r);
		try {
			if (t = W.getStr(t), t = W.calculateAt(e, t), r <= 0) return -28;
			var i = B.readlink(t), a = Math.min(r, ke(i)), o = C[n + a];
			return at(i, n, r + 1), C[n + a] = o, a;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function pt(e, t, n, r) {
		t = D(t), r = D(r);
		try {
			return t = W.getStr(t), r = W.getStr(r), t = W.calculateAt(e, t), r = W.calculateAt(n, r), B.rename(t, r), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function mt(e) {
		e = D(e);
		try {
			return e = W.getStr(e), B.rmdir(e), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function ht(e, t) {
		e = D(e), t = D(t);
		try {
			return e = W.getStr(e), W.writeStat(t, B.stat(e));
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function gt(e, t, n) {
		e = D(e), n = D(n);
		try {
			return e = W.getStr(e), n = W.getStr(n), n = W.calculateAt(t, n), B.symlink(e, n), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function _t(e, t, n) {
		t = D(t);
		try {
			if (t = W.getStr(t), t = W.calculateAt(e, t), !n) B.unlink(t);
			else if (n === 512) B.rmdir(t);
			else return -28;
			return 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var vt = () => v(""), yt = {}, bt = (e) => {
		for (; e.length;) {
			var t = e.pop();
			e.pop()(t);
		}
	};
	function xt(e) {
		return this.fromWireType(Number(A[e / 8]));
	}
	var St = {}, Ct = {}, wt = {};
	class Tt extends Error {
		constructor(e) {
			super(e), this.name = "InternalError";
		}
	}
	var Et = (e) => {
		throw new Tt(e);
	}, Dt = (e, t, n) => {
		e.forEach((e) => wt[e] = t);
		function r(t) {
			var r = n(t);
			r.length !== e.length && Et("Mismatched type converter count");
			for (var i = 0; i < e.length; ++i) Y(e[i], r[i]);
		}
		var i = Array(t.length), a = [], o = 0;
		for (let [e, n] of t.entries()) Ct.hasOwnProperty(n) ? i[e] = Ct[n] : (a.push(n), St.hasOwnProperty(n) || (St[n] = []), St[n].push(() => {
			i[e] = Ct[n], ++o, o === a.length && r(i);
		}));
		a.length === 0 && r(i);
	}, Ot = function(e) {
		e = D(e);
		var t = yt[e];
		delete yt[e];
		var n = t.rawConstructor, r = t.rawDestructor, i = t.fields, a = i.map((e) => e.getterReturnType).concat(i.map((e) => e.setterArgumentType));
		Dt([e], a, (e) => {
			var a = {};
			for (var [o, s] of i.entries()) {
				let t = e[o], n = s.getter, r = s.getterContext, c = e[o + i.length], l = s.setter, u = s.setterContext;
				a[s.fieldName] = {
					read: (e) => t.fromWireType(n(r, e)),
					write: (e, t) => {
						var n = [];
						l(u, e, c.toWireType(n, t)), bt(n);
					},
					optional: t.optional
				};
			}
			return [{
				name: t.name,
				fromWireType: (e) => {
					var t = {};
					for (var n in a) t[n] = a[n].read(e);
					return r(e), t;
				},
				toWireType: (e, t) => {
					for (var i in a) if (!(i in t) && !a[i].optional) throw TypeError(`Missing field: "${i}"`);
					var o = n();
					for (i in a) a[i].write(o, t[i]);
					return e !== null && e.push(r, o), o;
				},
				readValueFromPointer: xt,
				destructorFunction: r
			}];
		});
	}, kt = (e) => {
		for (var t = "";;) {
			var n = Ne[e++];
			if (!n) return t;
			t += String.fromCharCode(n);
		}
	};
	class At extends Error {
		constructor(e) {
			super(e), this.name = "BindingError";
		}
	}
	var J = (e) => {
		throw new At(e);
	};
	function jt(e, t, n = {}) {
		var r = t.name;
		if (e || J(`type "${r}" must have a positive integer typeid pointer`), Ct.hasOwnProperty(e)) {
			if (n.ignoreDuplicateRegistrations) return;
			J(`Cannot register type '${r}' twice`);
		}
		if (Ct[e] = t, delete wt[e], St.hasOwnProperty(e)) {
			var i = St[e];
			delete St[e], i.forEach((e) => e());
		}
	}
	function Y(e, t, n = {}) {
		return jt(e, t, n);
	}
	var Mt, X = (e, t, n) => {
		switch (t) {
			case 1: return n ? (e) => C[e] : (e) => Ne[e];
			case 2: return n ? (e) => nt[e / 2] : (e) => Mt[e / 2];
			case 4: return n ? (e) => V[e / 4] : (e) => H[e / 4];
			case 8: return n ? (e) => U[e / 8] : (e) => A[e / 8];
			default: throw TypeError(`invalid integer width (${t}): ${e}`);
		}
	}, Nt = function(e, t, n, r, i) {
		e = D(e), t = D(t), n = D(n), t = kt(t);
		let a = r === 0n, o = (e) => e;
		if (a) {
			let e = n * 8;
			o = (t) => typeof t == "number" ? t >>> 0 : BigInt.asUintN(e, t), i = o(i);
		}
		Y(e, {
			name: t,
			fromWireType: o,
			toWireType: (e, t) => (typeof t == "number" && (t = BigInt(t)), t),
			readValueFromPointer: X(t, n, !a),
			destructorFunction: null
		});
	};
	function Pt(e, t, n, r) {
		e = D(e), t = D(t), t = kt(t), Y(e, {
			name: t,
			fromWireType: function(e) {
				return !!e;
			},
			toWireType: function(e, t) {
				return t ? n : r;
			},
			readValueFromPointer: function(e) {
				return this.fromWireType(Ne[e]);
			},
			destructorFunction: null
		});
	}
	var Ft = (e) => ({
		count: e.count,
		deleteScheduled: e.deleteScheduled,
		preservePointerOnDelete: e.preservePointerOnDelete,
		ptr: e.ptr,
		ptrType: e.ptrType,
		smartPtr: e.smartPtr,
		smartPtrType: e.smartPtrType
	}), It = (e) => {
		function t(e) {
			return e.$$.ptrType.registeredClass.name;
		}
		J(t(e) + " instance already deleted");
	}, Lt = !1, Rt = (e) => {}, zt = (e) => {
		e.smartPtr ? e.smartPtrType.rawDestructor(e.smartPtr) : e.ptrType.registeredClass.rawDestructor(e.ptr);
	}, Bt = (e) => {
		--e.count.value, e.count.value === 0 && zt(e);
	}, Vt = (e) => globalThis.FinalizationRegistry ? (Lt = new FinalizationRegistry((e) => {
		Bt(e.$$);
	}), Vt = (e) => {
		var t = e.$$;
		if (t.smartPtr) {
			var n = { $$: t };
			Lt.register(e, n, e);
		}
		return e;
	}, Rt = (e) => Lt.unregister(e), Vt(e)) : (Vt = (e) => e, e), Ht = [], Ut = () => {
		for (; Ht.length;) {
			var e = Ht.pop();
			e.$$.deleteScheduled = !1, e.delete();
		}
	}, Wt, Gt = () => {
		let e = Kt.prototype;
		Object.assign(e, {
			isAliasOf(e) {
				if (!(this instanceof Kt) || !(e instanceof Kt)) return !1;
				var t = this.$$.ptrType.registeredClass, n = this.$$.ptr;
				e.$$ = e.$$;
				for (var r = e.$$.ptrType.registeredClass, i = e.$$.ptr; t.baseClass;) n = t.upcast(n), t = t.baseClass;
				for (; r.baseClass;) i = r.upcast(i), r = r.baseClass;
				return t === r && n === i;
			},
			clone() {
				if (this.$$.ptr || It(this), this.$$.preservePointerOnDelete) return this.$$.count.value += 1, this;
				var e = Vt(Object.create(Object.getPrototypeOf(this), { $$: { value: Ft(this.$$) } }));
				return e.$$.count.value += 1, e.$$.deleteScheduled = !1, e;
			},
			delete() {
				this.$$.ptr || It(this), this.$$.deleteScheduled && !this.$$.preservePointerOnDelete && J("Object already scheduled for deletion"), Rt(this), Bt(this.$$), this.$$.preservePointerOnDelete || (this.$$.smartPtr = void 0, this.$$.ptr = void 0);
			},
			isDeleted() {
				return !this.$$.ptr;
			},
			deleteLater() {
				return this.$$.ptr || It(this), this.$$.deleteScheduled && !this.$$.preservePointerOnDelete && J("Object already scheduled for deletion"), Ht.push(this), Ht.length === 1 && Wt && Wt(Ut), this.$$.deleteScheduled = !0, this;
			}
		});
		let t = Symbol.dispose;
		t && (e[t] = e.delete);
	};
	function Kt() {}
	var qt = (e, t) => Object.defineProperty(t, "name", { value: e }), Jt = {}, Yt = (e, t, n) => {
		if (e[t].overloadTable === void 0) {
			var r = e[t];
			e[t] = function(...r) {
				return e[t].overloadTable.hasOwnProperty(r.length) || J(`Function '${n}' called with an invalid number of arguments (${r.length}) - expects one of (${e[t].overloadTable})!`), e[t].overloadTable[r.length].apply(this, r);
			}, e[t].overloadTable = [], e[t].overloadTable[r.argCount] = r;
		}
	}, Xt = (e, n, r) => {
		t.hasOwnProperty(e) ? ((r === void 0 || t[e].overloadTable !== void 0 && t[e].overloadTable[r] !== void 0) && J(`Cannot register public name '${e}' twice`), Yt(t, e, e), t[e].overloadTable.hasOwnProperty(r) && J(`Cannot register multiple overloads of a function with the same number of arguments (${r})!`), t[e].overloadTable[r] = n) : (t[e] = n, t[e].argCount = r);
	}, Zt = 48, Qt = 57, $t = (e) => {
		e = e.replace(/[^a-zA-Z0-9_]/g, "$");
		var t = e.charCodeAt(0);
		return t >= Zt && t <= Qt ? `_${e}` : e;
	};
	function en(e, t, n, r, i, a, o, s) {
		this.name = e, this.constructor = t, this.instancePrototype = n, this.rawDestructor = r, this.baseClass = i, this.getActualType = a, this.upcast = o, this.downcast = s, this.pureVirtualFunctions = [];
	}
	var tn = (e, t, n) => {
		for (; t !== n;) t.upcast || J(`Expected null or instance of ${n.name}, got an instance of ${t.name}`), e = t.upcast(e), t = t.baseClass;
		return e;
	}, nn = (e) => {
		if (e === null) return "null";
		var t = typeof e;
		return t === "object" || t === "array" || t === "function" ? e.toString() : "" + e;
	};
	function rn(e, t) {
		if (t === null) return this.isReference && J(`null is not a valid ${this.name}`), 0;
		t.$$ || J(`Cannot pass "${nn(t)}" as a ${this.name}`), t.$$.ptr || J(`Cannot pass deleted object as a pointer of type ${this.name}`);
		var n = t.$$.ptrType.registeredClass;
		return tn(t.$$.ptr, n, this.registeredClass);
	}
	function an(e, t) {
		var n;
		if (t === null) return this.isReference && J(`null is not a valid ${this.name}`), this.isSmartPointer ? (n = this.rawConstructor(), e !== null && e.push(this.rawDestructor, n), n) : 0;
		(!t || !t.$$) && J(`Cannot pass "${nn(t)}" as a ${this.name}`), t.$$.ptr || J(`Cannot pass deleted object as a pointer of type ${this.name}`), !this.isConst && t.$$.ptrType.isConst && J(`Cannot convert argument of type ${t.$$.smartPtrType ? t.$$.smartPtrType.name : t.$$.ptrType.name} to parameter type ${this.name}`);
		var r = t.$$.ptrType.registeredClass;
		if (n = tn(t.$$.ptr, r, this.registeredClass), this.isSmartPointer) switch (t.$$.smartPtr === void 0 && J("Passing raw pointer to smart pointer is illegal"), this.sharingPolicy) {
			case 0:
				t.$$.smartPtrType === this ? n = t.$$.smartPtr : J(`Cannot convert argument of type ${t.$$.smartPtrType ? t.$$.smartPtrType.name : t.$$.ptrType.name} to parameter type ${this.name}`);
				break;
			case 1:
				n = t.$$.smartPtr;
				break;
			case 2:
				if (t.$$.smartPtrType === this) n = t.$$.smartPtr;
				else {
					var i = t.clone();
					n = this.rawShare(n, Z.toHandle(() => i.delete())), e !== null && e.push(this.rawDestructor, n);
				}
				break;
			default: J("Unsupported sharing policy");
		}
		return n;
	}
	function on(e, t) {
		if (t === null) return this.isReference && J(`null is not a valid ${this.name}`), 0;
		t.$$ || J(`Cannot pass "${nn(t)}" as a ${this.name}`), t.$$.ptr || J(`Cannot pass deleted object as a pointer of type ${this.name}`), t.$$.ptrType.isConst && J(`Cannot convert argument of type ${t.$$.ptrType.name} to parameter type ${this.name}`);
		var n = t.$$.ptrType.registeredClass;
		return tn(t.$$.ptr, n, this.registeredClass);
	}
	var sn = (e, t, n) => {
		if (t === n) return e;
		if (n.baseClass === void 0) return null;
		var r = sn(e, t, n.baseClass);
		return r === null ? null : n.downcast(r);
	}, cn = {}, ln = (e, t) => {
		for (t === void 0 && J("ptr should not be undefined"); e.baseClass;) t = e.upcast(t), e = e.baseClass;
		return t;
	}, un = (e, t) => (t = ln(e, t), cn[t]), dn = (e, t) => ((!t.ptrType || !t.ptr) && Et("makeClassHandle requires ptr and ptrType"), !!t.smartPtrType != !!t.smartPtr && Et("Both smartPtrType and smartPtr must be specified"), t.count = { value: 1 }, Vt(Object.create(e, { $$: {
		value: t,
		writable: !0
	} })));
	function fn(e) {
		e = D(e);
		var t = this.getPointee(e);
		if (!t) return this.destructor(e), null;
		var n = un(this.registeredClass, t);
		if (n !== void 0) {
			if (n.$$.count.value === 0) return n.$$.ptr = t, n.$$.smartPtr = e, n.clone();
			var r = n.clone();
			return this.destructor(e), r;
		}
		function i() {
			return this.isSmartPointer ? dn(this.registeredClass.instancePrototype, {
				ptrType: this.pointeeType,
				ptr: t,
				smartPtrType: this,
				smartPtr: e
			}) : dn(this.registeredClass.instancePrototype, {
				ptrType: this,
				ptr: e
			});
		}
		var a = Jt[this.registeredClass.getActualType(t)];
		if (!a) return i.call(this);
		var o = this.isConst ? a.constPointerType : a.pointerType, s = sn(t, this.registeredClass, o.registeredClass);
		return s === null ? i.call(this) : this.isSmartPointer ? dn(o.registeredClass.instancePrototype, {
			ptrType: o,
			ptr: s,
			smartPtrType: this,
			smartPtr: e
		}) : dn(o.registeredClass.instancePrototype, {
			ptrType: o,
			ptr: s
		});
	}
	var pn = () => {
		Object.assign(mn.prototype, {
			getPointee(e) {
				return this.rawGetPointee && (e = this.rawGetPointee(e)), e;
			},
			destructor(e) {
				this.rawDestructor?.(e);
			},
			readValueFromPointer: xt,
			fromWireType: fn
		});
	};
	function mn(e, t, n, r, i, a, o, s, c, l, u) {
		this.name = e, this.registeredClass = t, this.isReference = n, this.isConst = r, this.isSmartPointer = i, this.pointeeType = a, this.sharingPolicy = o, this.rawGetPointee = s, this.rawConstructor = c, this.rawShare = l, this.rawDestructor = u, !i && t.baseClass === void 0 ? r ? (this.toWireType = rn, this.destructorFunction = null) : (this.toWireType = on, this.destructorFunction = null) : this.toWireType = an;
	}
	var hn = (e, n, r) => {
		t.hasOwnProperty(e) || Et("Replacing nonexistent public symbol"), t[e].overloadTable !== void 0 && r !== void 0 ? t[e].overloadTable[r] = n : (t[e] = n, t[e].argCount = r);
	}, gn = (e, t, n = [], r = !1) => {
		for (var i = 1; i < e.length; ++i) e[i] == "p" && (n[i - 1] = BigInt(n[i - 1]));
		var a = O(t)(...n);
		function o(t) {
			return e[0] == "p" ? Number(t) : t;
		}
		return o(a);
	}, _n = (e, t, n = !1) => (...r) => gn(e, t, r, n), vn = (e, t, n = !1) => {
		e = kt(e);
		function r() {
			return e.includes("p") ? _n(e, t, n) : O(t);
		}
		var i = r();
		return typeof i != "function" && J(`unknown function pointer with signature ${e}: ${t}`), i;
	};
	class yn extends Error {}
	var bn = (e) => {
		var t = Q(e), n = kt(t);
		return bi(t), n;
	}, xn = (e, t) => {
		var n = [], r = {};
		function i(e) {
			if (!r[e] && !Ct[e]) {
				if (wt[e]) {
					wt[e].forEach(i);
					return;
				}
				n.push(e), r[e] = !0;
			}
		}
		throw t.forEach(i), new yn(`${e}: ` + n.map(bn).join([", "]));
	};
	function Sn(e, t, n, r, i, a, o, s, c, l, u, d, f) {
		e = D(e), t = D(t), n = D(n), r = D(r), i = D(i), a = D(a), o = D(o), s = D(s), c = D(c), l = D(l), u = D(u), d = D(d), f = D(f), u = kt(u), a = vn(i, a), s &&= vn(o, s), l &&= vn(c, l), f = vn(d, f);
		var p = $t(u);
		Xt(p, function() {
			xn(`Cannot construct ${u} due to unbound types`, [r]);
		}), Dt([
			e,
			t,
			n
		], r ? [r] : [], (t) => {
			t = t[0];
			var n, i;
			r ? (n = t.registeredClass, i = n.instancePrototype) : i = Kt.prototype;
			var o = qt(u, function(...e) {
				if (Object.getPrototypeOf(this) !== c) throw new At(`Use 'new' to construct ${u}`);
				if (d.constructor_body === void 0) throw new At(`${u} has no accessible constructor`);
				var t = d.constructor_body[e.length];
				if (t === void 0) throw new At(`Tried to invoke ctor of ${u} with invalid number of parameters (${e.length}) - expected (${Object.keys(d.constructor_body).toString()}) parameters instead!`);
				return t.apply(this, e);
			}), c = Object.create(i, { constructor: { value: o } });
			o.prototype = c;
			var d = new en(u, o, c, f, n, a, s, l);
			d.baseClass && (d.baseClass.__derivedClasses ??= [], d.baseClass.__derivedClasses.push(d));
			var ee = new mn(u, d, !0, !1, !1), m = new mn(u + "*", d, !1, !1, !1), h = new mn(u + " const*", d, !1, !0, !1);
			return Jt[e] = {
				pointerType: m,
				constPointerType: h
			}, hn(p, o), [
				ee,
				m,
				h
			];
		});
	}
	var Cn = [], wn = [
		0,
		1,
		,
		1,
		null,
		1,
		!0,
		1,
		!1,
		1
	], Tn = [];
	function En(e) {
		if (e = D(e), e > 9 && --wn[e + 1] === 0) {
			var t = wn[e];
			wn[e] = void 0;
			var n = Tn[e];
			n && (Tn[e] = void 0, n(t)), Cn.push(e);
		}
	}
	var Z = {
		toValue: (e) => (e || J(`Cannot use deleted val. handle = ${e}`), wn[e]),
		toHandle: (e) => {
			switch (e) {
				case void 0: return 2;
				case null: return 4;
				case !0: return 6;
				case !1: return 8;
				default: {
					let t = Cn.pop() || wn.length;
					return wn[t] = e, wn[t + 1] = 1, t;
				}
			}
		}
	}, Dn = {
		name: "emscripten::val",
		fromWireType: (e) => {
			var t = Z.toValue(e);
			return En(e), t;
		},
		toWireType: (e, t) => Z.toHandle(t),
		readValueFromPointer: xt,
		destructorFunction: null
	};
	function On(e) {
		return e = D(e), Y(e, Dn);
	}
	var kn = (e, t, n) => {
		switch (t) {
			case 1: return n ? function(e) {
				return this.fromWireType(C[e]);
			} : function(e) {
				return this.fromWireType(Ne[e]);
			};
			case 2: return n ? function(e) {
				return this.fromWireType(nt[e / 2]);
			} : function(e) {
				return this.fromWireType(Mt[e / 2]);
			};
			case 4: return n ? function(e) {
				return this.fromWireType(V[e / 4]);
			} : function(e) {
				return this.fromWireType(H[e / 4]);
			};
			default: throw TypeError(`invalid integer width (${t}): ${e}`);
		}
	};
	function An(e) {
		return e ? e === 1 ? "number" : "string" : "object";
	}
	function jn(e, n, r, i, a) {
		e = D(e), n = D(n), r = D(r), n = kt(n);
		let o = An(a);
		switch (o) {
			case "object": {
				function t() {}
				t.values = {}, Y(e, {
					name: n,
					constructor: t,
					valueType: o,
					fromWireType: function(e) {
						return this.constructor.values[e];
					},
					toWireType: (e, t) => t.value,
					readValueFromPointer: kn(n, r, i),
					destructorFunction: null
				}), Xt(n, t);
				break;
			}
			case "number":
				var s = {};
				Y(e, {
					name: n,
					keysMap: s,
					valueType: o,
					fromWireType: (e) => e,
					toWireType: (e, t) => t,
					readValueFromPointer: kn(n, r, i),
					destructorFunction: null
				}), Xt(n, s), delete t[n].argCount;
				break;
			case "string":
				var c = {}, l = {}, s = {};
				Y(e, {
					name: n,
					valuesMap: c,
					reverseMap: l,
					keysMap: s,
					valueType: o,
					fromWireType: function(e) {
						return this.reverseMap[e];
					},
					toWireType: function(e, t) {
						return this.valuesMap[t];
					},
					readValueFromPointer: kn(n, r, i),
					destructorFunction: null
				}), Xt(n, s), delete t[n].argCount;
		}
	}
	var Mn = (e, t) => {
		var n = Ct[e];
		return n === void 0 && J(`${t} has unknown type ${bn(e)}`), n;
	};
	function Nn(e, t, n) {
		e = D(e), t = D(t);
		var r = Mn(e, "enum");
		switch (t = kt(t), r.valueType) {
			case "object":
				var i = r.constructor, a = Object.create(r.constructor.prototype, {
					value: { value: n },
					constructor: { value: qt(`${r.name}_${t}`, function() {}) }
				});
				i.values[n] = a, i[t] = a;
				break;
			case "number":
				r.keysMap[t] = n;
				break;
			case "string": r.valuesMap[t] = n, r.reverseMap[n] = t, r.keysMap[t] = t;
		}
	}
	var Pn, Fn, In = (e, t) => {
		switch (t) {
			case 4: return function(e) {
				return this.fromWireType(Pn[e / 4]);
			};
			case 8: return function(e) {
				return this.fromWireType(Fn[e / 8]);
			};
			default: throw TypeError(`invalid float width (${t}): ${e}`);
		}
	}, Ln = function(e, t, n) {
		e = D(e), t = D(t), n = D(n), t = kt(t), Y(e, {
			name: t,
			fromWireType: (e) => e,
			toWireType: (e, t) => t,
			readValueFromPointer: In(t, n),
			destructorFunction: null
		});
	};
	function Rn(e) {
		for (var t = 1; t < e.length; ++t) if (e[t] !== null && e[t].destructorFunction === void 0) return !0;
		return !1;
	}
	var zn = {
		ftf: function(e, t, n, r, i, a, o) {
			return function() {
				return a(n(r));
			};
		},
		ftft: function(e, t, n, r, i, a, o, s, c) {
			return function(e) {
				var t = s(null, e), i = n(r, t);
				return c(t), a(i);
			};
		},
		ftfn: function(e, t, n, r, i, a, o, s) {
			return function(e) {
				return a(n(r, s(null, e)));
			};
		},
		ftfnn: function(e, t, n, r, i, a, o, s, c) {
			return function(e, t) {
				return a(n(r, s(null, e), c(null, t)));
			};
		},
		fffn: function(e, t, n, r, i, a, o, s) {
			return function(e) {
				n(r, s(null, e));
			};
		},
		ftfnnn: function(e, t, n, r, i, a, o, s, c, l) {
			return function(e, t, i) {
				return a(n(r, s(null, e), c(null, t), l(null, i)));
			};
		},
		ftfnt: function(e, t, n, r, i, a, o, s, c, l) {
			return function(e, t) {
				var i = s(null, e), o = c(null, t), u = n(r, i, o);
				return l(o), a(u);
			};
		}
	};
	function Bn(e, t, n, r) {
		let i = [
			t ? "t" : "f",
			n ? "t" : "f",
			r ? "t" : "f"
		];
		for (let n = t ? 1 : 2; n < e.length; ++n) {
			let t = e[n], r = "";
			r = t.destructorFunction === void 0 ? "u" : t.destructorFunction === null ? "n" : "t", i.push(r);
		}
		return i.join("");
	}
	function Vn(e, t, n, r, i, a) {
		var o = t.length;
		o < 2 && J("argTypes array size mismatch! Must at least get return value and receiver (this) types!");
		for (var s = t[1] !== null && n !== null, c = Rn(t), l = !t[0].isVoid, u = t[0], d = t[1], f = [
			e,
			J,
			r,
			i,
			bt,
			u.fromWireType.bind(u),
			d?.toWireType.bind(d)
		], p = 2; p < o; ++p) {
			var ee = t[p];
			f.push(ee.toWireType.bind(ee));
		}
		if (!c) for (var p = s ? 1 : 2; p < t.length; ++p) t[p].destructorFunction !== null && f.push(t[p].destructorFunction);
		return qt(e, zn[Bn(t, s, l, a)](...f));
	}
	var Hn = (e, t) => {
		for (var n = [], r = 0; r < e; r++) n.push(Number(A[(t + r * 8) / 8]));
		return n;
	}, Un = (e) => {
		e = e.trim();
		let t = e.indexOf("(");
		return t === -1 ? e : e.slice(0, t);
	};
	function Wn(e, t, n, r, i, a, o, s) {
		e = D(e), n = D(n), r = D(r), i = D(i), a = D(a);
		var c = Hn(t, n);
		e = kt(e), e = Un(e), i = vn(r, i, o), Xt(e, function() {
			xn(`Cannot call ${e} due to unbound types`, c);
		}, t - 1), Dt([], c, (n) => {
			var r = [n[0], null].concat(n.slice(1));
			return hn(e, Vn(e, r, null, i, a, o), t - 1), [];
		});
	}
	var Gn = function(e, t, n, r, i) {
		e = D(e), t = D(t), n = D(n), t = kt(t);
		let a = r === 0, o = (e) => e;
		if (a) {
			var s = 32 - 8 * n;
			o = (e) => e << s >>> s, i = o(i);
		}
		Y(e, {
			name: t,
			fromWireType: o,
			toWireType: (e, t) => t,
			readValueFromPointer: X(t, n, r !== 0),
			destructorFunction: null
		});
	};
	function Kn(e, t, n) {
		e = D(e), n = D(n);
		var r = [
			Int8Array,
			Uint8Array,
			Int16Array,
			Uint16Array,
			Int32Array,
			Uint32Array,
			Float32Array,
			Float64Array,
			BigInt64Array,
			BigUint64Array
		][t];
		function i(e) {
			var t = Number(A[e / 8]), n = Number(A[(e + 8) / 8]);
			return new r(C.buffer, n, t);
		}
		n = kt(n), Y(e, {
			name: n,
			fromWireType: i,
			readValueFromPointer: i
		}, { ignoreDuplicateRegistrations: !0 });
	}
	function qn(e, t) {
		e = D(e), t = D(t), t = kt(t);
		var n = !0;
		Y(e, {
			name: t,
			fromWireType(e) {
				var t = Number(A[e / 8]), r = e + 8, i;
				if (n) i = Ze(r, t, !0);
				else {
					i = "";
					for (var a = 0; a < t; ++a) i += String.fromCharCode(Ne[r + a]);
				}
				return bi(e), i;
			},
			toWireType(e, t) {
				t instanceof ArrayBuffer && (t = new Uint8Array(t));
				var r, i = typeof t == "string";
				i || ArrayBuffer.isView(t) && t.BYTES_PER_ELEMENT == 1 || J("Cannot pass non-string to std::string"), r = n && i ? ke(t) : t.length;
				var a = yi(8 + r + 1), o = a + 8;
				if (A[a / 8] = BigInt(r), i) {
					if (n) at(t, o, r + 1);
					else for (var s = 0; s < r; ++s) {
						var c = t.charCodeAt(s);
						c > 255 && (bi(a), J("String has UTF-16 code units that do not fit in 8 bits")), Ne[o + s] = c;
					}
				} else Ne.set(t, o);
				return e !== null && e.push(bi, a), a;
			},
			readValueFromPointer: xt,
			destructorFunction(e) {
				bi(e);
			}
		});
	}
	var Jn = globalThis.TextDecoder ? new TextDecoder("utf-16le") : void 0, Yn = (e, t, n) => {
		var r = e / 2, i = Ee(Mt, r, t / 2, n);
		if (i - r > 16 && Jn) return Jn.decode(Mt.subarray(r, i));
		for (var a = "", o = r; o < i; ++o) {
			var s = Mt[o];
			a += String.fromCharCode(s);
		}
		return a;
	}, Xn = (e, t, n = 2147483647) => {
		if (n < 2) return 0;
		n -= 2;
		for (var r = t, i = n < e.length * 2 ? n / 2 : e.length, a = 0; a < i; ++a) {
			var o = e.charCodeAt(a);
			nt[t / 2] = o, t += 2;
		}
		return nt[t / 2] = 0, t - r;
	}, Zn = (e) => e.length * 2, Qn = (e, t, n) => {
		for (var r = "", i = e / 4, a = 0; !(a >= t / 4); a++) {
			var o = H[i + a];
			if (!o && !n) break;
			r += String.fromCodePoint(o);
		}
		return r;
	}, $n = (e, t, n = 2147483647) => {
		if (n < 4) return 0;
		for (var r = t, i = r + n - 4, a = 0; a < e.length; ++a) {
			var o = e.codePointAt(a);
			if (o > 65535 && a++, V[t / 4] = o, t += 4, t + 4 > i) break;
		}
		return V[t / 4] = 0, t - r;
	}, er = (e) => {
		for (var t = 0, n = 0; n < e.length; ++n) e.codePointAt(n) > 65535 && n++, t += 4;
		return t;
	};
	function tr(e, t, n) {
		e = D(e), t = D(t), n = D(n), n = kt(n);
		var r, i, a;
		t === 2 ? (r = Yn, i = Xn, a = Zn) : (r = Qn, i = $n, a = er), Y(e, {
			name: n,
			fromWireType: (e) => {
				var n = Number(A[e / 8]), i = r(e + 8, n * t, !0);
				return bi(e), i;
			},
			toWireType: (e, r) => {
				typeof r != "string" && J(`Cannot pass non-string to C++ string type ${n}`);
				var o = a(r), s = yi(8 + o + t);
				return A[s / 8] = BigInt(o / t), i(r, s + 8, o + t), e !== null && e.push(bi, s), s;
			},
			readValueFromPointer: xt,
			destructorFunction(e) {
				bi(e);
			}
		});
	}
	function nr(e, t, n, r, i, a) {
		e = D(e), t = D(t), n = D(n), r = D(r), i = D(i), a = D(a), yt[e] = {
			name: kt(t),
			rawConstructor: vn(n, r),
			rawDestructor: vn(i, a),
			fields: []
		};
	}
	function rr(e, t, n, r, i, a, o, s, c, l) {
		e = D(e), t = D(t), n = D(n), r = D(r), i = D(i), a = D(a), o = D(o), s = D(s), c = D(c), l = D(l), yt[e].fields.push({
			fieldName: kt(t),
			getterReturnType: n,
			getter: vn(r, i),
			getterContext: a,
			setterArgumentType: o,
			setter: vn(s, c),
			setterContext: l
		});
	}
	var ir = function(e, t) {
		e = D(e), t = D(t), t = kt(t), Y(e, {
			isVoid: !0,
			name: t,
			fromWireType: () => void 0,
			toWireType: (e, t) => void 0
		});
	}, ar = () => {};
	function or(e) {
		return e = D(e), e ? -52 : 0;
	}
	var sr = () => {
		throw new te();
	}, cr = [], lr = (e) => {
		var t = cr.length;
		return cr.push(e), t;
	}, ur = (e, t) => {
		for (var n = Array(e), r = 0; r < e; ++r) n[r] = Mn(Number(A[(t + r * 8) / 8]), `parameter ${r}`);
		return n;
	}, dr = (e, t, n) => {
		var r = [], i = e(r, n);
		return r.length && (A[t / 8] = BigInt(Z.toHandle(r))), i;
	}, fr = {}, pr = (e) => {
		var t = fr[e];
		return t === void 0 ? kt(e) : t;
	}, mr = function(e, t, n) {
		t = D(t);
		var r = (() => {
			var [r, ...i] = ur(e, t), a = r.toWireType.bind(r), o = i.map((e) => e.readValueFromPointer.bind(e));
			e--;
			var s = Array(e);
			return lr(qt(`methodCaller<(${i.map((e) => e.name)}) => ${r.name}>`, (t, r, i, c) => {
				for (var l = 0, u = 0; u < e; ++u) s[u] = o[u](c + l), l += 16;
				var d;
				switch (n) {
					case 0:
						d = Z.toValue(t).apply(null, s);
						break;
					case 2:
						d = Reflect.construct(Z.toValue(t), s);
						break;
					case 3:
						d = s[0];
						break;
					case 1: d = Z.toValue(t)[pr(r)](...s);
				}
				return dr(a, i, d);
			}));
		})();
		return BigInt(r);
	};
	function hr(e) {
		e = D(e), e > 9 && (wn[e + 1] += 1);
	}
	function gr(e, t, n, r, i) {
		return e = D(e), t = D(t), n = D(n), r = D(r), i = D(i), cr[e](t, n, r, i);
	}
	var _r = () => BigInt(Z.toHandle([])), vr = (e) => (e = D(e), BigInt(Z.toHandle(pr(e)))), yr = () => BigInt(Z.toHandle({}));
	function br(e) {
		e = D(e), bt(Z.toValue(e)), En(e);
	}
	function xr(e, t, n) {
		e = D(e), t = D(t), n = D(n), e = Z.toValue(e), t = Z.toValue(t), n = Z.toValue(n), e[t] = n;
	}
	function Sr(e, t) {
		e = D(e), t = D(t);
		var n = /* @__PURE__ */ new Date(e * 1e3);
		if (isNaN(n.getTime())) return 1;
		V[t / 4] = n.getUTCSeconds(), V[(t + 4) / 4] = n.getUTCMinutes(), V[(t + 8) / 4] = n.getUTCHours(), V[(t + 12) / 4] = n.getUTCDate(), V[(t + 16) / 4] = n.getUTCMonth(), V[(t + 20) / 4] = n.getUTCFullYear() - 1900, V[(t + 24) / 4] = n.getUTCDay();
		var r = Date.UTC(n.getUTCFullYear(), 0, 1, 0, 0, 0, 0), i = (n.getTime() - r) / 864e5 | 0;
		return V[(t + 28) / 4] = i, 0;
	}
	var Cr = (e) => e % 4 == 0 && (e % 100 != 0 || e % 400 == 0), wr = [
		0,
		31,
		60,
		91,
		121,
		152,
		182,
		213,
		244,
		274,
		305,
		335
	], Tr = [
		0,
		31,
		59,
		90,
		120,
		151,
		181,
		212,
		243,
		273,
		304,
		334
	], Er = (e) => (Cr(e.getFullYear()) ? wr : Tr)[e.getMonth()] + e.getDate() - 1;
	function Dr(e, t) {
		e = D(e), t = D(t);
		var n = /* @__PURE__ */ new Date(e * 1e3);
		if (isNaN(n.getTime())) return 1;
		V[t / 4] = n.getSeconds(), V[(t + 4) / 4] = n.getMinutes(), V[(t + 8) / 4] = n.getHours(), V[(t + 12) / 4] = n.getDate(), V[(t + 16) / 4] = n.getMonth(), V[(t + 20) / 4] = n.getFullYear() - 1900, V[(t + 24) / 4] = n.getDay();
		var r = Er(n) | 0;
		V[(t + 28) / 4] = r, U[(t + 40) / 8] = BigInt(-(n.getTimezoneOffset() * 60));
		var i = new Date(n.getFullYear(), 0, 1), a = new Date(n.getFullYear(), 6, 1).getTimezoneOffset(), o = i.getTimezoneOffset(), s = (a != o && n.getTimezoneOffset() == Math.min(o, a)) | 0;
		return V[(t + 32) / 4] = s, 0;
	}
	var Or = function(e) {
		e = D(e);
		var t = (() => {
			var t = new Date(V[(e + 20) / 4] + 1900, V[(e + 16) / 4], V[(e + 12) / 4], V[(e + 8) / 4], V[(e + 4) / 4], V[e / 4], 0);
			if (isNaN(t.getTime())) return -1;
			var n = V[(e + 32) / 4], r = t.getTimezoneOffset(), i = new Date(t.getFullYear(), 0, 1), a = new Date(t.getFullYear(), 6, 1).getTimezoneOffset(), o = i.getTimezoneOffset(), s = Math.min(o, a);
			if (n < 0) n = Number(a != o && s == r);
			else if (n > 0 != (s == r)) {
				var c = n > 0 ? s : Math.max(o, a);
				if (t.setTime(t.getTime() + (c - r) * 6e4), isNaN(t.getTime())) return -1;
			}
			V[(e + 32) / 4] = n, V[(e + 24) / 4] = t.getDay();
			var l = Er(t) | 0;
			return V[(e + 28) / 4] = l, V[e / 4] = t.getSeconds(), V[(e + 4) / 4] = t.getMinutes(), V[(e + 8) / 4] = t.getHours(), V[(e + 12) / 4] = t.getDate(), V[(e + 16) / 4] = t.getMonth(), V[(e + 20) / 4] = t.getYear(), t.getTime() / 1e3;
		})();
		return BigInt(t);
	};
	function kr(e, t, n, r, i, a, o) {
		e = D(e), i = D(i), a = D(a), o = D(o);
		try {
			var s = W.getStreamFromFD(r), c = B.mmap(s, e, i, t, n), l = c.ptr;
			return V[a / 4] = c.allocated, A[o / 8] = BigInt(l), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function Ar(e, t, n, r, i, a) {
		e = D(e), t = D(t), a = D(a);
		try {
			var o = W.getStreamFromFD(i);
			n & 2 && W.doMsync(e, o, t, r, a);
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var jr = function(e, t, n, r) {
		e = D(e), t = D(t), n = D(n), r = D(r);
		var i = (/* @__PURE__ */ new Date()).getFullYear(), a = new Date(i, 0, 1), o = new Date(i, 6, 1), s = a.getTimezoneOffset(), c = o.getTimezoneOffset(), l = Math.max(s, c);
		A[e / 8] = BigInt(l * 60), V[t / 4] = Number(s != c);
		var u = (e) => {
			var t = e >= 0 ? "-" : "+", n = Math.abs(e);
			return `UTC${t}${String(Math.floor(n / 60)).padStart(2, "0")}${String(n % 60).padStart(2, "0")}`;
		}, d = u(s), f = u(c);
		c < s ? (at(d, n, 17), at(f, r, 17)) : (at(d, r, 17), at(f, n, 17));
	}, Mr = () => performance.now(), Nr = () => Date.now(), Pr = 1, Fr = (e) => e >= 0 && e <= 3;
	function Ir(e, t, n) {
		if (t = D(t), n = D(n), !Fr(e)) return 28;
		var r;
		if (e === 0) r = Nr();
		else if (Pr) r = Mr();
		else return 52;
		var i = Math.round(r * 1e3 * 1e3);
		return U[n / 8] = BigInt(i), 0;
	}
	var Lr = () => 17179869184, Rr = () => BigInt(Lr()), zr = (e) => {
		var t = (e - ki.buffer.byteLength + 65535) / 65536 | 0;
		try {
			return ki.grow(BigInt(t)), _(), 1;
		} catch {}
	};
	function Br(e) {
		e = D(e);
		var t = Ne.length, n = Lr();
		if (e > n) return !1;
		for (var r = 1; r <= 4; r *= 2) {
			var i = t * (1 + .2 / r);
			if (i = Math.min(i, e + 100663296), zr(Math.min(n, Fe(Math.max(e, i), 65536)))) return !0;
		}
		return !1;
	}
	var Vr = {}, Hr = () => i, Ur = () => {
		if (!Ur.strings) {
			var e = {
				USER: "web_user",
				LOGNAME: "web_user",
				PATH: "/",
				PWD: "/",
				HOME: "/home/web_user",
				LANG: (globalThis.navigator?.language ?? "C").replace("-", "_") + ".UTF-8",
				_: Hr()
			};
			for (var t in Vr) Vr[t] === void 0 ? delete e[t] : e[t] = Vr[t];
			var n = [];
			for (var t in e) n.push(`${t}=${e[t]}`);
			Ur.strings = n;
		}
		return Ur.strings;
	};
	function Wr(e, t) {
		e = D(e), t = D(t);
		var n = 0, r = 0;
		for (var i of Ur()) {
			var a = t + n;
			A[(e + r) / 8] = BigInt(a), n += at(i, a, Infinity) + 1, r += 8;
		}
		return 0;
	}
	function Gr(e, t) {
		e = D(e), t = D(t);
		var n = Ur();
		A[e / 8] = BigInt(n.length);
		var r = 0;
		for (var i of n) r += ke(i) + 1;
		return A[t / 8] = BigInt(r), 0;
	}
	var Kr = () => !0, qr = (e) => {
		Kr() || (ee = !0), a(e, new ce(e));
	}, Jr = (e, t) => {
		qr(e);
	};
	function Yr(e) {
		try {
			var t = W.getStreamFromFD(e);
			return B.close(t), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function Xr(e, t) {
		t = D(t);
		try {
			var n = 0, r = 0, i = 0, a = W.getStreamFromFD(e), o = a.tty ? 2 : B.isDir(a.mode) ? 3 : B.isLink(a.mode) ? 7 : 4;
			return C[t] = o, nt[(t + 2) / 2] = i, U[(t + 8) / 8] = BigInt(n), U[(t + 16) / 8] = BigInt(r), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	var Zr = (e, t, n, r) => {
		for (var i = 0, a = 0; a < n; a++) {
			var o = Number(A[t / 8]), s = Number(A[(t + 8) / 8]);
			t += 16;
			try {
				var c = B.read(e, C, o, s, r);
			} catch (e) {
				if (i > 0 && e instanceof B.ErrnoError && (e.errno == 6 || e.errno == 6)) break;
				throw e;
			}
			if (c < 0) return -1;
			if (i += c, c < s) break;
			r !== void 0 && (r += c);
		}
		return i;
	};
	function Qr(e, t, n, r, i) {
		t = D(t), n = D(n), r = D(r), i = D(i);
		try {
			if (isNaN(r)) return 22;
			var a = Zr(W.getStreamFromFD(e), t, n, r);
			return A[i / 8] = BigInt(a), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function $r(e, t, n, r) {
		t = D(t), n = D(n), r = D(r);
		try {
			var i = Zr(W.getStreamFromFD(e), t, n);
			return A[r / 8] = BigInt(i), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function ei(e, t, n, r) {
		t = D(t), r = D(r);
		try {
			if (isNaN(t)) return 22;
			var i = W.getStreamFromFD(e);
			return B.llseek(i, t, n), U[r / 8] = BigInt(i.position), i.getdents && !t && n === 0 && (i.getdents = null), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function ti(e) {
		try {
			var t = W.getStreamFromFD(e);
			return t.stream_ops?.fsync?.(t);
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	var ni = (e, t, n, r) => {
		if (n == 1) return B.write(e, C, Number(A[t / 8]), Number(A[(t + 8) / 8]), r);
		for (var i = 0, a = 0, o = t; a < n; a++, o += 16) i += Number(A[(o + 8) / 8]);
		for (var s = new Uint8Array(i), c = 0, a = 0; a < n; a++, t += 16) {
			var l = Number(A[t / 8]), u = Number(A[(t + 8) / 8]);
			s.set(Ne.subarray(l, l + u), c), c += u;
		}
		return B.write(e, s, 0, i, r);
	};
	function ri(e, t, n, r) {
		t = D(t), n = D(n), r = D(r);
		try {
			var i = ni(W.getStreamFromFD(e), t, n);
			return A[r / 8] = BigInt(i), 0;
		} catch (e) {
			if (B === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function ii(e) {
		return e = D(e), e;
	}
	function ai(e, t) {
		return e = D(e), t = D(t), Ce(Ne.subarray(e, e + t));
	}
	var oi = (e, t) => {
		if (si) for (var n = e; n < e + t; n++) {
			var r = O(n);
			r && si.set(r, n);
		}
	}, si, ci = (e) => (si || (si = /* @__PURE__ */ new WeakMap(), oi(0, Number(Ai.length))), si.get(e) || 0), li = [], ui = () => li.length ? li.pop() : Ai.grow(1n), di = (e, t) => {
		Ai.set(BigInt(e), t), ue[e] = Ai.get(BigInt(e));
	}, fi = (e) => {
		let t = e.length;
		return [
			t % 128 | 128,
			t >> 7,
			...e
		];
	}, pi = {
		i: 127,
		p: 126,
		j: 126,
		f: 125,
		d: 124,
		e: 111
	}, mi = (e) => fi(Array.from(e, (e) => pi[e])), hi = (e, t) => {
		var n = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...fi([
			1,
			96,
			...mi(t.slice(1)),
			...mi(t[0] === "v" ? "" : t[0])
		]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0), r = new WebAssembly.Module(n);
		return new WebAssembly.Instance(r, { e: { f: e } }).exports.f;
	}, gi = (e, t) => {
		var n = ci(e);
		if (n) return n;
		var r = ui();
		try {
			di(r, e);
		} catch (n) {
			if (!(n instanceof TypeError)) throw n;
			di(r, hi(e, t));
		}
		return si.set(e, r), r;
	};
	function _i(e, t = "i8") {
		switch (t.endsWith("*") && (t = "*"), t) {
			case "i1": return C[e];
			case "i8": return C[e];
			case "i16": return nt[e / 2];
			case "i32": return V[e / 4];
			case "i64": return U[e / 8];
			case "float": return Pn[e / 4];
			case "double": return Fn[e / 8];
			case "*": return Number(A[e / 8]);
			default: v(`invalid type for getValue: ${t}`);
		}
	}
	function vi(e, t, n = "i8") {
		switch (n.endsWith("*") && (n = "*"), n) {
			case "i1":
				C[e] = t;
				break;
			case "i8":
				C[e] = t;
				break;
			case "i16":
				nt[e / 2] = t;
				break;
			case "i32":
				V[e / 4] = t;
				break;
			case "i64":
				U[e / 8] = BigInt(t);
				break;
			case "float":
				Pn[e / 4] = t;
				break;
			case "double":
				Fn[e / 8] = t;
				break;
			case "*":
				A[e / 8] = BigInt(t);
				break;
			default: v(`invalid type for setValue: ${n}`);
		}
	}
	B.createPreloadedFile = Xe, B.preloadFile = Ye, B.staticInit(), Gt(), pn(), t.wasmBinary && (p = t.wasmBinary), t.addFunction = gi, t.setValue = vi, t.getValue = _i, t.UTF8ToString = Ze, t.stringToUTF8 = at, t.lengthBytesUTF8 = ke, t.FS = B;
	var Q, yi, bi, xi, $, Si, Ci, wi, Ti, Ei, Di, Oi, ki, Ai;
	function ji(e) {
		Q = e.$b, t._MagickColor_Create = e.ac, t._MagickColor_Dispose = e.bc, t._MagickColor_Count_Get = e.cc, t._MagickColor_Red_Get = e.dc, t._MagickColor_Red_Set = e.ec, t._MagickColor_Green_Get = e.fc, t._MagickColor_Green_Set = e.gc, t._MagickColor_Blue_Get = e.hc, t._MagickColor_Blue_Set = e.ic, t._MagickColor_Alpha_Get = e.jc, t._MagickColor_Alpha_Set = e.kc, t._MagickColor_Black_Get = e.lc, t._MagickColor_Black_Set = e.mc, t._MagickColor_IsCMYK_Get = e.nc, t._MagickColor_IsCMYK_Set = e.oc, t._MagickColor_Clone = e.pc, t._MagickColor_FuzzyEquals = e.qc, t._MagickColor_Initialize = e.rc, t._MagickColorCollection_Create = e.tc, t._MagickColorCollection_Dispose = e.uc, t._MagickColorCollection_Get = e.vc, t._MagickColorCollection_Set = e.wc, t._DrawingWand_Create = e.xc, t._DrawingWand_Dispose = e.yc, t._DrawingWand_Affine = e.zc, t._DrawingWand_Alpha = e.Ac, t._DrawingWand_Arc = e.Bc, t._DrawingWand_Bezier = e.Cc, t._DrawingWand_BorderColor = e.Dc, t._DrawingWand_Circle = e.Ec, t._DrawingWand_ClipPath = e.Fc, t._DrawingWand_ClipRule = e.Gc, t._DrawingWand_ClipUnits = e.Hc, t._DrawingWand_Color = e.Ic, t._DrawingWand_Composite = e.Jc, t._DrawingWand_Density = e.Kc, t._DrawingWand_Ellipse = e.Lc, t._DrawingWand_FillColor = e.Mc, t._DrawingWand_FillOpacity = e.Nc, t._DrawingWand_FillPatternUrl = e.Oc, t._DrawingWand_FillRule = e.Pc, t._DrawingWand_Font = e.Qc, t._DrawingWand_FontFamily = e.Rc, t._DrawingWand_FontPointSize = e.Sc, t._DrawingWand_FontTypeMetrics = e.Tc, t._TypeMetric_Create = e.Uc, t._DrawingWand_Gravity = e.Vc, t._DrawingWand_Line = e.Wc, t._DrawingWand_PathArcAbs = e.Xc, t._DrawingWand_PathArcRel = e.Yc, t._DrawingWand_PathClose = e.Zc, t._DrawingWand_PathCurveToAbs = e._c, t._DrawingWand_PathCurveToRel = e.$c, t._DrawingWand_PathFinish = e.ad, t._DrawingWand_PathLineToAbs = e.bd, t._DrawingWand_PathLineToHorizontalAbs = e.cd, t._DrawingWand_PathLineToHorizontalRel = e.dd, t._DrawingWand_PathLineToRel = e.ed, t._DrawingWand_PathLineToVerticalAbs = e.fd, t._DrawingWand_PathLineToVerticalRel = e.gd, t._DrawingWand_PathMoveToAbs = e.hd, t._DrawingWand_PathMoveToRel = e.id, t._DrawingWand_PathQuadraticCurveToAbs = e.jd, t._DrawingWand_PathQuadraticCurveToRel = e.kd, t._DrawingWand_PathSmoothCurveToAbs = e.ld, t._DrawingWand_PathSmoothCurveToRel = e.md, t._DrawingWand_PathSmoothQuadraticCurveToAbs = e.nd, t._DrawingWand_PathSmoothQuadraticCurveToRel = e.od, t._DrawingWand_PathStart = e.pd, t._DrawingWand_Point = e.qd, t._DrawingWand_Polygon = e.rd, t._DrawingWand_Polyline = e.sd, t._DrawingWand_PopClipPath = e.td, t._DrawingWand_PopGraphicContext = e.ud, t._DrawingWand_PopPattern = e.vd, t._DrawingWand_PushClipPath = e.wd, t._DrawingWand_PushGraphicContext = e.xd, t._DrawingWand_PushPattern = e.yd, t._DrawingWand_Rectangle = e.zd, t._DrawingWand_Render = e.Ad, t._DrawingWand_Rotation = e.Bd, t._DrawingWand_RoundRectangle = e.Cd, t._DrawingWand_Scaling = e.Dd, t._DrawingWand_SkewX = e.Ed, t._DrawingWand_SkewY = e.Fd, t._DrawingWand_StrokeAntialias = e.Gd, t._DrawingWand_StrokeColor = e.Hd, t._DrawingWand_StrokeDashArray = e.Id, t._DrawingWand_StrokeDashOffset = e.Jd, t._DrawingWand_StrokeLineCap = e.Kd, t._DrawingWand_StrokeLineJoin = e.Ld, t._DrawingWand_StrokeMiterLimit = e.Md, t._DrawingWand_StrokeOpacity = e.Nd, t._DrawingWand_StrokePatternUrl = e.Od, t._DrawingWand_StrokeWidth = e.Pd, t._DrawingWand_Text = e.Qd, t._DrawingWand_TextAlignment = e.Rd, t._DrawingWand_TextAntialias = e.Sd, t._DrawingWand_TextDecoration = e.Td, t._DrawingWand_TextDirection = e.Ud, t._DrawingWand_TextEncoding = e.Vd, t._DrawingWand_TextInterlineSpacing = e.Wd, t._DrawingWand_TextInterwordSpacing = e.Xd, t._DrawingWand_TextKerning = e.Yd, t._DrawingWand_TextUnderColor = e.Zd, t._DrawingWand_Translation = e._d, t._DrawingWand_Viewbox = e.$d, t._MagickExceptionHelper_Description = e.ae, t._MagickExceptionHelper_Dispose = e.be, t._MagickExceptionHelper_Related = e.ce, t._MagickExceptionHelper_RelatedCount = e.de, t._MagickExceptionHelper_Message = e.ee, t._MagickExceptionHelper_Severity = e.fe, t._PdfInfo_PageCount = e.ge, t._Environment_Initialize = e.he, t._Environment_GetEnv = e.ie, t._Environment_SetEnv = e.je, t._MagickMemory_Relinquish = e.ke, t._Magick_Delegates_Get = e.le, t._Magick_Features_Get = e.me, t._Magick_ImageMagickVersion_Get = e.ne, t._Magick_GetFonts = e.oe, t._Magick_GetFontFamily = e.pe, t._Magick_GetFontName = e.qe, t._Magick_GetWindowsResource = e.re, t._Magick_DisposeFonts = e.se, t._Magick_ResetRandomSeed = e.te, t._Magick_SetDefaultFontFile = e.ue, t._Magick_SetRandomSeed = e.ve, t._Magick_SetLogDelegate = e.we, t._Magick_SetLogEvents = e.xe, t._MagickFormatInfo_CreateList = e.ye, t._MagickFormatInfo_DisposeList = e.ze, t._MagickFormatInfo_CanReadMultithreaded_Get = e.Ae, t._MagickFormatInfo_CanWriteMultithreaded_Get = e.Be, t._MagickFormatInfo_Description_Get = e.Ce, t._MagickFormatInfo_Format_Get = e.De, t._MagickFormatInfo_MimeType_Get = e.Ee, t._MagickFormatInfo_Module_Get = e.Fe, t._MagickFormatInfo_SupportsMultipleFrames_Get = e.Ge, t._MagickFormatInfo_SupportsReading_Get = e.He, t._MagickFormatInfo_SupportsWriting_Get = e.Ie, t._MagickFormatInfo_Version_Get = e.Je, t._MagickFormatInfo_GetInfo = e.Ke, t._MagickFormatInfo_GetInfoByName = e.Le, t._MagickFormatInfo_GetInfoWithBlob = e.Me, t._MagickFormatInfo_Unregister = e.Ne, t._MagickImage_Create = e.Oe, t._MagickImage_Dispose = e.Pe, t._MagickImage_AnimationDelay_Get = e.Qe, t._MagickImage_AnimationDelay_Set = e.Re, t._MagickImage_AnimationIterations_Get = e.Se, t._MagickImage_AnimationIterations_Set = e.Te, t._MagickImage_AnimationTicksPerSecond_Get = e.Ue, t._MagickImage_AnimationTicksPerSecond_Set = e.Ve, t._MagickImage_BackgroundColor_Get = e.We, t._MagickImage_BackgroundColor_Set = e.Xe, t._MagickImage_BaseHeight_Get = e.Ye, t._MagickImage_BaseWidth_Get = e.Ze, t._MagickImage_BlackPointCompensation_Get = e._e, t._MagickImage_BlackPointCompensation_Set = e.$e, t._MagickImage_BorderColor_Get = e.af, t._MagickImage_BorderColor_Set = e.bf, t._MagickImage_BoundingBox_Get = e.cf, t._MagickRectangle_Create = e.df, t._MagickImage_ChannelCount_Get = e.ef, t._MagickImage_ChromaBlue_Get = e.ff, t._PrimaryInfo_Create = e.gf, t._MagickImage_ChromaBlue_Set = e.hf, t._MagickImage_ChromaGreen_Get = e.jf, t._MagickImage_ChromaGreen_Set = e.kf, t._MagickImage_ChromaRed_Get = e.lf, t._MagickImage_ChromaRed_Set = e.mf, t._MagickImage_ChromaWhite_Get = e.nf, t._MagickImage_ChromaWhite_Set = e.of, t._MagickImage_ClassType_Get = e.pf, t._MagickImage_ClassType_Set = e.qf, t._QuantizeSettings_Create = e.rf, t._QuantizeSettings_Dispose = e.sf, t._MagickImage_ColorFuzz_Get = e.tf, t._MagickImage_ColorFuzz_Set = e.uf, t._MagickImage_ColormapSize_Get = e.vf, t._MagickImage_ColormapSize_Set = e.wf, t._MagickImage_ColorSpace_Get = e.xf, t._MagickImage_ColorSpace_Set = e.yf, t._MagickImage_ColorType_Get = e.zf, t._MagickImage_ColorType_Set = e.Af, t._MagickImage_Compose_Get = e.Bf, t._MagickImage_Compose_Set = e.Cf, t._MagickImage_Compression_Get = e.Df, t._MagickImage_Compression_Set = e.Ef, t._MagickImage_Depth_Get = e.Ff, t._MagickImage_Depth_Set = e.Gf, t._MagickImage_EncodingGeometry_Get = e.Hf, t._MagickImage_Endian_Get = e.If, t._MagickImage_Endian_Set = e.Jf, t._MagickImage_FileName_Get = e.Kf, t._MagickImage_FileName_Set = e.Lf, t._MagickImage_FilterType_Get = e.Mf, t._MagickImage_FilterType_Set = e.Nf, t._MagickImage_Format_Get = e.Of, t._MagickImage_Format_Set = e.Pf, t._MagickImage_Gamma_Get = e.Qf, t._MagickImage_GifDisposeMethod_Get = e.Rf, t._MagickImage_GifDisposeMethod_Set = e.Sf, t._MagickImage_HasAlpha_Get = e.Tf, t._MagickImage_HasAlpha_Set = e.Uf, t._MagickImage_Height_Get = e.Vf, t._MagickImage_Interlace_Get = e.Wf, t._MagickImage_Interlace_Set = e.Xf, t._MagickImage_Interpolate_Get = e.Yf, t._MagickImage_Interpolate_Set = e.Zf, t._MagickImage_IsOpaque_Get = e._f, t._MagickImage_MatteColor_Get = e.$f, t._MagickImage_MatteColor_Set = e.ag, t._MagickImage_MeanErrorPerPixel_Get = e.bg, t._MagickImage_MetaChannelCount_Get = e.cg, t._MagickImage_MetaChannelCount_Set = e.dg, t._MagickImage_NormalizedMaximumError_Get = e.eg, t._MagickImage_NormalizedMeanError_Get = e.fg, t._MagickImage_Orientation_Get = e.gg, t._MagickImage_Orientation_Set = e.hg, t._MagickImage_Page_Get = e.ig, t._MagickImage_Page_Set = e.jg, t._MagickImage_Quality_Get = e.kg, t._MagickImage_Quality_Set = e.lg, t._MagickImage_RenderingIntent_Get = e.mg, t._MagickImage_RenderingIntent_Set = e.ng, t._MagickImage_ResolutionUnits_Get = e.og, t._MagickImage_ResolutionUnits_Set = e.pg, t._MagickImage_ResolutionX_Get = e.qg, t._MagickImage_ResolutionX_Set = e.rg, t._MagickImage_ResolutionY_Get = e.sg, t._MagickImage_ResolutionY_Set = e.tg, t._MagickImage_Signature_Get = e.ug, t._MagickImage_TotalColors_Get = e.vg, t._MagickImage_VirtualPixelMethod_Get = e.wg, t._MagickImage_VirtualPixelMethod_Set = e.xg, t._MagickImage_Width_Get = e.yg, t._MagickImage_AdaptiveBlur = e.zg, t._MagickImage_AdaptiveResize = e.Ag, t._MagickImage_AdaptiveSharpen = e.Bg, t._MagickImage_AdaptiveThreshold = e.Cg, t._MagickImage_AddNoise = e.Dg, t._MagickImage_AffineTransform = e.Eg, t._MagickImage_Annotate = e.Fg, t._MagickImage_AutoGamma = e.Gg, t._MagickImage_AutoLevel = e.Hg, t._MagickImage_AutoOrient = e.Ig, t._MagickImage_AutoThreshold = e.Jg, t._MagickImage_BilateralBlur = e.Kg, t._MagickImage_BlackThreshold = e.Lg, t._MagickImage_BlueShift = e.Mg, t._MagickImage_Blur = e.Ng, t._MagickImage_Border = e.Og, t._MagickImage_BrightnessContrast = e.Pg, t._MagickImage_CannyEdge = e.Qg, t._MagickImage_ChannelOffset = e.Rg, t._MagickImage_Charcoal = e.Sg, t._MagickImage_Chop = e.Tg, t._MagickImage_Clahe = e.Ug, t._MagickImage_Clamp = e.Vg, t._MagickImage_ClipPath = e.Wg, t._MagickImage_Clone = e.Xg, t._MagickImage_CloneArea = e.Yg, t._MagickImage_Clut = e.Zg, t._MagickImage_ColorDecisionList = e._g, t._MagickImage_Colorize = e.$g, t._MagickImage_ColorMatrix = e.ah, t._MagickImage_ColorThreshold = e.bh, t._MagickImage_Compare = e.ch, t._MagickImage_CompareDistortion = e.dh, t._MagickImage_Composite = e.eh, t._MagickImage_CompositeGravity = e.fh, t._MagickImage_ConnectedComponents = e.gh, t._MagickImage_Contrast = e.hh, t._MagickImage_ContrastStretch = e.ih, t._MagickImage_ConvexHull = e.jh, t._MagickImage_Convolve = e.kh, t._MagickImage_CopyPixels = e.lh, t._MagickImage_Crop = e.mh, t._MagickImage_CropToTiles = e.nh, t._MagickImage_CycleColormap = e.oh, t._MagickImage_Decipher = e.ph, t._MagickImage_Deskew = e.qh, t._MagickImage_Despeckle = e.rh, t._MagickImage_DetermineBitDepth = e.sh, t._MagickImage_DetermineColorType = e.th, t._MagickImage_Distort = e.uh, t._MagickImage_Edge = e.vh, t._MagickImage_Emboss = e.wh, t._MagickImage_Encipher = e.xh, t._MagickImage_Enhance = e.yh, t._MagickImage_Equalize = e.zh, t._MagickImage_Equals = e.Ah, t._MagickImage_EvaluateFunction = e.Bh, t._MagickImage_EvaluateGeometry = e.Ch, t._MagickImage_EvaluateOperator = e.Dh, t._MagickImage_Extent = e.Eh, t._MagickImage_Flip = e.Fh, t._MagickImage_FloodFill = e.Gh, t._MagickImage_Flop = e.Hh, t._MagickImage_FontTypeMetrics = e.Ih, t._MagickImage_FormatExpression = e.Jh, t._MagickImage_Frame = e.Kh, t._MagickImage_Fx = e.Lh, t._MagickImage_GammaCorrect = e.Mh, t._MagickImage_GaussianBlur = e.Nh, t._MagickImage_GetArtifact = e.Oh, t._MagickImage_GetAttribute = e.Ph, t._MagickImage_GetColormapColor = e.Qh, t._MagickImage_GetNext = e.Rh, t._MagickImage_GetNextArtifactName = e.Sh, t._MagickImage_GetNextAttributeName = e.Th, t._MagickImage_GetNextProfileName = e.Uh, t._MagickImage_GetProfile = e.Vh, t._MagickImage_GetReadMask = e.Wh, t._MagickImage_GetWriteMask = e.Xh, t._MagickImage_Grayscale = e.Yh, t._MagickImage_HaldClut = e.Zh, t._MagickImage_HasChannel = e._h, t._MagickImage_HasProfile = e.$h, t._MagickImage_Histogram = e.ai, t._MagickImage_HoughLine = e.bi, t._MagickImage_Implode = e.ci, t._MagickImage_ImportIndexedPixels = e.di, t._MagickImage_ImportPixels = e.ei, t._MagickImage_Integral = e.fi, t._MagickImage_InterpolativeResize = e.gi, t._MagickImage_InverseLevel = e.hi, t._MagickImage_Kmeans = e.ii, t._MagickImage_Kuwahara = e.ji, t._MagickImage_Level = e.ki, t._MagickImage_LevelColors = e.li, t._MagickImage_LinearStretch = e.mi, t._MagickImage_LiquidRescale = e.ni, t._MagickImage_LocalContrast = e.oi, t._MagickImage_Magnify = e.pi, t._MagickImage_MeanShift = e.qi, t._MagickImage_Minify = e.ri, t._MagickImage_MinimumBoundingBox = e.si, t._MagickImage_Modulate = e.ti, t._MagickImage_Moments = e.ui, t._MagickImage_Morphology = e.vi, t._MagickImage_MotionBlur = e.wi, t._MagickImage_Negate = e.xi, t._MagickImage_Normalize = e.yi, t._MagickImage_OilPaint = e.zi, t._MagickImage_Opaque = e.Ai, t._MagickImage_OrderedDither = e.Bi, t._MagickImage_Perceptible = e.Ci, t._MagickImage_PerceptualHash = e.Di, t._MagickImage_Quantize = e.Ei, t._MagickImage_Polaroid = e.Fi, t._MagickImage_Posterize = e.Gi, t._MagickImage_RaiseOrLower = e.Hi, t._MagickImage_RandomThreshold = e.Ii, t._MagickImage_RangeThreshold = e.Ji, t._MagickImage_ReadBlob = e.Ki, t._MagickImage_ReadFile = e.Li, t._MagickImage_ReadPixels = e.Mi, t._MagickImage_ReadStream = e.Ni, t._MagickImage_RegionMask = e.Oi, t._MagickImage_Remap = e.Pi, t._MagickImage_RemoveArtifact = e.Qi, t._MagickImage_RemoveAttribute = e.Ri, t._MagickImage_RemoveProfile = e.Si, t._MagickImage_ResetArtifactIterator = e.Ti, t._MagickImage_ResetAttributeIterator = e.Ui, t._MagickImage_ResetProfileIterator = e.Vi, t._MagickImage_Resample = e.Wi, t._MagickImage_Resize = e.Xi, t._MagickImage_Roll = e.Yi, t._MagickImage_Rotate = e.Zi, t._MagickImage_RotationalBlur = e._i, t._MagickImage_Sample = e.$i, t._MagickImage_Scale = e.aj, t._MagickImage_Segment = e.bj, t._MagickImage_SelectiveBlur = e.cj, t._MagickImage_Separate = e.dj, t._MagickImage_SepiaTone = e.ej, t._MagickImage_SetAlpha = e.fj, t._MagickImage_SetArtifact = e.gj, t._MagickImage_SetAttribute = e.hj, t._MagickImage_SetBitDepth = e.ij, t._MagickImage_SetClientData = e.jj, t._MagickImage_SetColormapColor = e.kj, t._MagickImage_SetColorMetric = e.lj, t._MagickImage_SetNext = e.mj, t._MagickImage_SetProfile = e.nj, t._MagickImage_SetProgressDelegate = e.oj, t._MagickImage_SetReadMask = e.pj, t._MagickImage_SetWriteMask = e.qj, t._MagickImage_Shade = e.rj, t._MagickImage_Shadow = e.sj, t._MagickImage_Sharpen = e.tj, t._MagickImage_Shave = e.uj, t._MagickImage_Shear = e.vj, t._MagickImage_SigmoidalContrast = e.wj, t._MagickImage_SparseColor = e.xj, t._MagickImage_Spread = e.yj, t._MagickImage_Sketch = e.zj, t._MagickImage_Solarize = e.Aj, t._MagickImage_SortPixels = e.Bj, t._MagickImage_Splice = e.Cj, t._MagickImage_Statistic = e.Dj, t._MagickImage_Statistics = e.Ej, t._MagickImage_Stegano = e.Fj, t._MagickImage_Stereo = e.Gj, t._MagickImage_Strip = e.Hj, t._MagickImage_SubImageSearch = e.Ij, t._MagickImage_Swirl = e.Jj, t._MagickImage_Texture = e.Kj, t._MagickImage_Threshold = e.Lj, t._MagickImage_Thumbnail = e.Mj, t._MagickImage_Tint = e.Nj, t._MagickImage_Transparent = e.Oj, t._MagickImage_TransparentChroma = e.Pj, t._MagickImage_Transpose = e.Qj, t._MagickImage_Transverse = e.Rj, t._MagickImage_Trim = e.Sj, t._MagickImage_UniqueColors = e.Tj, t._MagickImage_UnsharpMask = e.Uj, t._MagickImage_Vignette = e.Vj, t._MagickImage_Wave = e.Wj, t._MagickImage_WaveletDenoise = e.Xj, t._MagickImage_WhiteBalance = e.Yj, t._MagickImage_WhiteThreshold = e.Zj, t._MagickImage_WriteBlob = e._j, t._MagickImage_WriteFile = e.$j, t._MagickImage_WriteStream = e.ak, t._MagickImageCollection_Append = e.bk, t._MagickImageCollection_Coalesce = e.ck, t._MagickImageCollection_Combine = e.dk, t._MagickImageCollection_Complex = e.ek, t._MagickImageCollection_Deconstruct = e.fk, t._MagickImageCollection_Dispose = e.gk, t._MagickImageCollection_Evaluate = e.hk, t._MagickImageCollection_Fx = e.ik, t._MagickImageCollection_Merge = e.jk, t._MagickImageCollection_Montage = e.kk, t._MagickImageCollection_Morph = e.lk, t._MagickImageCollection_Optimize = e.mk, t._MagickImageCollection_OptimizePlus = e.nk, t._MagickImageCollection_OptimizeTransparency = e.ok, t._MagickImageCollection_Polynomial = e.pk, t._MagickImageCollection_Quantize = e.qk, t._MagickImageCollection_ReadBlob = e.rk, t._MagickImageCollection_ReadFile = e.sk, t._MagickImageCollection_ReadStream = e.tk, t._MagickImageCollection_Remap = e.uk, t._MagickImageCollection_Smush = e.vk, t._MagickImageCollection_WriteFile = e.wk, t._MagickImageCollection_WriteStream = e.xk, t._DoubleMatrix_Create = e.yk, t._DoubleMatrix_Dispose = e.zk, t._OpenCL_GetDevices = e.Ak, t._OpenCL_GetDevice = e.Bk, t._OpenCL_GetEnabled = e.Ck, t._OpenCL_SetEnabled = e.Dk, t._OpenCLDevice_DeviceType_Get = e.Ek, t._OpenCLDevice_BenchmarkScore_Get = e.Fk, t._OpenCLDevice_IsEnabled_Get = e.Gk, t._OpenCLDevice_IsEnabled_Set = e.Hk, t._OpenCLDevice_Name_Get = e.Ik, t._OpenCLDevice_Version_Get = e.Jk, t._OpenCLDevice_GetKernelProfileRecords = e.Kk, t._OpenCLDevice_GetKernelProfileRecord = e.Lk, t._OpenCLDevice_SetProfileKernels = e.Mk, t._OpenCLKernelProfileRecord_Count_Get = e.Nk, t._OpenCLKernelProfileRecord_Name_Get = e.Ok, t._OpenCLKernelProfileRecord_MaximumDuration_Get = e.Pk, t._OpenCLKernelProfileRecord_MinimumDuration_Get = e.Qk, t._OpenCLKernelProfileRecord_TotalDuration_Get = e.Rk, t._JpegOptimizer_CompressFile = e.Sk, t._JpegOptimizer_CompressStream = e.Tk, yi = t._malloc = e.Uk, bi = t._free = e.Vk, t._PixelCollection_Create = e.Wk, t._PixelCollection_Dispose = e.Xk, t._PixelCollection_GetArea = e.Yk, t._PixelCollection_GetReadOnlyArea = e.Zk, t._PixelCollection_SetArea = e._k, t._PixelCollection_ToByteArray = e.$k, t._PixelCollection_ToShortArray = e.al, t._Quantum_Depth_Get = e.bl, t._Quantum_Max_Get = e.cl, t._ResourceLimits_Area_Get = e.dl, t._ResourceLimits_Area_Set = e.el, t._ResourceLimits_Disk_Get = e.fl, t._ResourceLimits_Disk_Set = e.gl, t._ResourceLimits_Height_Get = e.hl, t._ResourceLimits_Height_Set = e.il, t._ResourceLimits_ListLength_Get = e.jl, t._ResourceLimits_ListLength_Set = e.kl, t._ResourceLimits_MaxMemoryRequest_Get = e.ll, t._ResourceLimits_MaxMemoryRequest_Set = e.ml, t._ResourceLimits_MaxProfileSize_Get = e.nl, t._ResourceLimits_MaxProfileSize_Set = e.ol, t._ResourceLimits_Memory_Get = e.pl, t._ResourceLimits_Memory_Set = e.ql, t._ResourceLimits_Thread_Get = e.rl, t._ResourceLimits_Thread_Set = e.sl, t._ResourceLimits_Throttle_Get = e.tl, t._ResourceLimits_Throttle_Set = e.ul, t._ResourceLimits_Time_Get = e.vl, t._ResourceLimits_Time_Set = e.wl, t._ResourceLimits_Width_Get = e.xl, t._ResourceLimits_Width_Set = e.yl, t._ResourceLimits_LimitMemory = e.zl, t._ResourceLimits_TrimMemory = e.Al, t._DrawingSettings_Create = e.Bl, t._DrawingSettings_Dispose = e.Cl, t._DrawingSettings_BorderColor_Get = e.Dl, t._DrawingSettings_BorderColor_Set = e.El, t._DrawingSettings_FillColor_Get = e.Fl, t._DrawingSettings_FillColor_Set = e.Gl, t._DrawingSettings_FillRule_Get = e.Hl, t._DrawingSettings_FillRule_Set = e.Il, t._DrawingSettings_Font_Get = e.Jl, t._DrawingSettings_Font_Set = e.Kl, t._DrawingSettings_FontFamily_Get = e.Ll, t._DrawingSettings_FontFamily_Set = e.Ml, t._DrawingSettings_FontPointsize_Get = e.Nl, t._DrawingSettings_FontPointsize_Set = e.Ol, t._DrawingSettings_FontStyle_Get = e.Pl, t._DrawingSettings_FontStyle_Set = e.Ql, t._DrawingSettings_FontWeight_Get = e.Rl, t._DrawingSettings_FontWeight_Set = e.Sl, t._DrawingSettings_StrokeAntiAlias_Get = e.Tl, t._DrawingSettings_StrokeAntiAlias_Set = e.Ul, t._DrawingSettings_StrokeColor_Get = e.Vl, t._DrawingSettings_StrokeColor_Set = e.Wl, t._DrawingSettings_StrokeDashOffset_Get = e.Xl, t._DrawingSettings_StrokeDashOffset_Set = e.Yl, t._DrawingSettings_StrokeLineCap_Get = e.Zl, t._DrawingSettings_StrokeLineCap_Set = e._l, t._DrawingSettings_StrokeLineJoin_Get = e.$l, t._DrawingSettings_StrokeLineJoin_Set = e.am, t._DrawingSettings_StrokeMiterLimit_Get = e.bm, t._DrawingSettings_StrokeMiterLimit_Set = e.cm, t._DrawingSettings_StrokeWidth_Get = e.dm, t._DrawingSettings_StrokeWidth_Set = e.em, t._DrawingSettings_TextAntiAlias_Get = e.fm, t._DrawingSettings_TextAntiAlias_Set = e.gm, t._DrawingSettings_TextDirection_Get = e.hm, t._DrawingSettings_TextDirection_Set = e.im, t._DrawingSettings_TextEncoding_Get = e.jm, t._DrawingSettings_TextEncoding_Set = e.km, t._DrawingSettings_TextGravity_Get = e.lm, t._DrawingSettings_TextGravity_Set = e.mm, t._DrawingSettings_TextInterlineSpacing_Get = e.nm, t._DrawingSettings_TextInterlineSpacing_Set = e.om, t._DrawingSettings_TextInterwordSpacing_Get = e.pm, t._DrawingSettings_TextInterwordSpacing_Set = e.qm, t._DrawingSettings_TextKerning_Get = e.rm, t._DrawingSettings_TextKerning_Set = e.sm, t._DrawingSettings_TextUnderColor_Get = e.tm, t._DrawingSettings_TextUnderColor_Set = e.um, t._DrawingSettings_SetAffine = e.vm, t._DrawingSettings_SetFillPattern = e.wm, t._DrawingSettings_SetStrokeDashArray = e.xm, t._DrawingSettings_SetStrokePattern = e.ym, t._DrawingSettings_SetText = e.zm, t._MagickSettings_Create = e.Am, t._MagickSettings_Dispose = e.Bm, t._MagickSettings_AntiAlias_Get = e.Cm, t._MagickSettings_AntiAlias_Set = e.Dm, t._MagickSettings_BackgroundColor_Get = e.Em, t._MagickSettings_BackgroundColor_Set = e.Fm, t._MagickSettings_ColorSpace_Get = e.Gm, t._MagickSettings_ColorSpace_Set = e.Hm, t._MagickSettings_ColorType_Get = e.Im, t._MagickSettings_ColorType_Set = e.Jm, t._MagickSettings_Compression_Get = e.Km, t._MagickSettings_Compression_Set = e.Lm, t._MagickSettings_Debug_Get = e.Mm, t._MagickSettings_Debug_Set = e.Nm, t._MagickSettings_Density_Get = e.Om, t._MagickSettings_Density_Set = e.Pm, t._MagickSettings_Depth_Get = e.Qm, t._MagickSettings_Depth_Set = e.Rm, t._MagickSettings_Endian_Get = e.Sm, t._MagickSettings_Endian_Set = e.Tm, t._MagickSettings_Extract_Get = e.Um, t._MagickSettings_Extract_Set = e.Vm, t._MagickSettings_Format_Get = e.Wm, t._MagickSettings_Format_Set = e.Xm, t._MagickSettings_FontPointsize_Get = e.Ym, t._MagickSettings_FontPointsize_Set = e.Zm, t._MagickSettings_Interlace_Get = e._m, t._MagickSettings_Interlace_Set = e.$m, t._MagickSettings_Monochrome_Get = e.an, t._MagickSettings_Monochrome_Set = e.bn, t._MagickSettings_Verbose_Get = e.cn, t._MagickSettings_Verbose_Set = e.dn, t._MagickSettings_SetColorFuzz = e.en, t._MagickSettings_SetFileName = e.fn, t._MagickSettings_SetFont = e.gn, t._MagickSettings_SetNumberScenes = e.hn, t._MagickSettings_SetOption = e.jn, t._MagickSettings_SetPage = e.kn, t._MagickSettings_SetPing = e.ln, t._MagickSettings_SetQuality = e.mn, t._MagickSettings_SetScenes = e.nn, t._MagickSettings_SetScene = e.on, t._MagickSettings_SetSize = e.pn, t._MontageSettings_Create = e.qn, t._MontageSettings_Dispose = e.rn, t._MontageSettings_SetBackgroundColor = e.sn, t._MontageSettings_SetBorderColor = e.tn, t._MontageSettings_SetBorderWidth = e.un, t._MontageSettings_SetFillColor = e.vn, t._MontageSettings_SetFont = e.wn, t._MontageSettings_SetFontPointsize = e.xn, t._MontageSettings_SetFrameGeometry = e.yn, t._MontageSettings_SetGeometry = e.zn, t._MontageSettings_SetGravity = e.An, t._MontageSettings_SetShadow = e.Bn, t._MontageSettings_SetStrokeColor = e.Cn, t._MontageSettings_SetTextureFileName = e.Dn, t._MontageSettings_SetTileGeometry = e.En, t._MontageSettings_SetTitle = e.Fn, t._QuantizeSettings_SetColors = e.Gn, t._QuantizeSettings_SetColorSpace = e.Hn, t._QuantizeSettings_SetDitherMethod = e.In, t._QuantizeSettings_SetMeasureErrors = e.Jn, t._QuantizeSettings_SetTreeDepth = e.Kn, t._ChannelMoments_Centroid_Get = e.Ln, t._ChannelMoments_EllipseAngle_Get = e.Mn, t._ChannelMoments_EllipseAxis_Get = e.Nn, t._ChannelMoments_EllipseEccentricity_Get = e.On, t._ChannelMoments_EllipseIntensity_Get = e.Pn, t._ChannelMoments_GetHuInvariants = e.Qn, t._ChannelPerceptualHash_GetHuPhash = e.Rn, t._ChannelStatistics_Depth_Get = e.Sn, t._ChannelStatistics_Entropy_Get = e.Tn, t._ChannelStatistics_Kurtosis_Get = e.Un, t._ChannelStatistics_Maximum_Get = e.Vn, t._ChannelStatistics_Mean_Get = e.Wn, t._ChannelStatistics_Minimum_Get = e.Xn, t._ChannelStatistics_Skewness_Get = e.Yn, t._ChannelStatistics_StandardDeviation_Get = e.Zn, t._Moments_DisposeList = e._n, t._Moments_GetInstance = e.$n, t._PerceptualHash_DisposeList = e.ao, t._PerceptualHash_GetInstance = e.bo, t._Statistics_DisposeList = e.co, t._Statistics_GetInstance = e.eo, t._ConnectedComponent_DisposeList = e.fo, t._ConnectedComponent_GetArea = e.go, t._ConnectedComponent_GetCentroid = e.ho, t._ConnectedComponent_GetColor = e.io, t._ConnectedComponent_GetHeight = e.jo, t._ConnectedComponent_GetId = e.ko, t._ConnectedComponent_GetWidth = e.lo, t._ConnectedComponent_GetX = e.mo, t._ConnectedComponent_GetY = e.no, t._ConnectedComponent_GetInstance = e.oo, t._MagickGeometry_Create = e.po, t._MagickGeometry_Dispose = e.qo, t._MagickGeometry_X_Get = e.ro, t._MagickGeometry_Y_Get = e.so, t._MagickGeometry_Width_Get = e.to, t._MagickGeometry_Height_Get = e.uo, t._MagickGeometry_Initialize = e.vo, t._MagickRectangle_Dispose = e.wo, t._MagickRectangle_X_Get = e.xo, t._MagickRectangle_X_Set = e.yo, t._MagickRectangle_Y_Get = e.zo, t._MagickRectangle_Y_Set = e.Ao, t._MagickRectangle_Width_Get = e.Bo, t._MagickRectangle_Width_Set = e.Co, t._MagickRectangle_Height_Get = e.Do, t._MagickRectangle_Height_Set = e.Eo, t._MagickRectangle_FromPageSize = e.Fo, t._OffsetInfo_Create = e.Go, t._OffsetInfo_Dispose = e.Ho, t._OffsetInfo_SetX = e.Io, t._OffsetInfo_SetY = e.Jo, t._PointInfo_X_Get = e.Ko, t._PointInfo_Y_Get = e.Lo, t._PointInfoCollection_Create = e.Mo, t._PointInfoCollection_Dispose = e.No, t._PointInfoCollection_GetX = e.Oo, t._PointInfoCollection_GetY = e.Po, t._PointInfoCollection_Set = e.Qo, t._PrimaryInfo_Dispose = e.Ro, t._PrimaryInfo_X_Get = e.So, t._PrimaryInfo_X_Set = e.To, t._PrimaryInfo_Y_Get = e.Uo, t._PrimaryInfo_Y_Set = e.Vo, t._PrimaryInfo_Z_Get = e.Wo, t._PrimaryInfo_Z_Set = e.Xo, t._StringInfo_Length_Get = e.Yo, t._StringInfo_Datum_Get = e.Zo, t._TypeMetric_Dispose = e._o, t._TypeMetric_Ascent_Get = e.$o, t._TypeMetric_Descent_Get = e.ap, t._TypeMetric_MaxHorizontalAdvance_Get = e.bp, t._TypeMetric_TextHeight_Get = e.cp, t._TypeMetric_TextWidth_Get = e.dp, t._TypeMetric_UnderlinePosition_Get = e.ep, t._TypeMetric_UnderlineThickness_Get = e.fp, xi = e.gp, $ = e.hp, Si = e.ip, Ci = e.jp, wi = e.kp, Ti = e.lp, Ei = e.mp, Di = e.np, Oi = e.op, ki = e.Zb, Ai = e.sc;
	}
	var Mi = {
		wb: de,
		z: me,
		E: k,
		e: M,
		k: ve,
		La: N,
		va: ye,
		a: be,
		mb: xe,
		i: Se,
		Rb: Qe,
		Pb: $e,
		Sb: G,
		zb: K,
		Ob: q,
		ua: rt,
		Nb: it,
		Ib: ot,
		vb: st,
		Vb: ct,
		Kb: lt,
		Lb: ut,
		sa: dt,
		ub: ft,
		sb: pt,
		tb: mt,
		Mb: ht,
		rb: gt,
		Ha: _t,
		Tb: vt,
		$a: Ot,
		aa: Nt,
		Ya: Pt,
		na: Sn,
		Wa: On,
		O: jn,
		h: Nn,
		xa: Ln,
		w: Wn,
		V: Gn,
		D: Kn,
		Xa: qn,
		ka: tr,
		ab: nr,
		ma: rr,
		Za: ir,
		xb: ar,
		pb: or,
		nb: sr,
		H: mr,
		C: En,
		_a: hr,
		G: gr,
		la: _r,
		Q: vr,
		ba: yr,
		F: br,
		N: xr,
		Cb: Sr,
		Db: Dr,
		Eb: Or,
		Ab: kr,
		Bb: Ar,
		Fb: jr,
		Qb: Ir,
		Ja: Nr,
		qb: Rr,
		ra: Mr,
		ob: Br,
		Wb: Wr,
		Xb: Gr,
		X: Jr,
		_: Yr,
		Ia: Xr,
		yb: Qr,
		Ka: $r,
		Gb: ei,
		Jb: ti,
		ta: ri,
		ib: aa,
		Ea: Ya,
		Fa: Ja,
		hb: sa,
		Ca: na,
		b: Qi,
		c: Ri,
		p: Fi,
		ja: Na,
		Ua: ka,
		J: $i,
		g: Ii,
		v: Wi,
		Ra: Fa,
		qa: Ki,
		ga: Qa,
		t: ea,
		n: Xi,
		y: Ji,
		fb: pa,
		gb: fa,
		Qa: La,
		A: Zi,
		M: da,
		Sa: Pa,
		d: Li,
		Yb: Wa,
		W: Pi,
		j: Gi,
		jb: qi,
		r: oa,
		kb: Ka,
		lb: Ga,
		S: ia,
		K: Sa,
		q: ta,
		T: Za,
		B: Yi,
		Ga: qa,
		Aa: la,
		o: Ma,
		fa: eo,
		Ba: ra,
		oa: Ea,
		Da: $a,
		l: zi,
		s: Ui,
		L: Hi,
		Y: Oa,
		ia: Ia,
		x: Ni,
		I: Vi,
		da: ca,
		ha: Ua,
		m: ja,
		f: Bi,
		za: ma,
		ya: ha,
		P: ba,
		ca: ya,
		eb: ga,
		Ma: Ha,
		db: Ca,
		Ta: Aa,
		u: ua,
		Z: _a,
		$: Ra,
		pa: va,
		cb: wa,
		Oa: Ba,
		ea: to,
		Na: Va,
		R: xa,
		Pa: za,
		bb: Ta,
		Va: Da,
		U: Xa,
		wa: ii,
		Ub: qr,
		Hb: ai
	};
	function Ni(e, t, n, r) {
		var i = T();
		try {
			O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Pi(e, t, n, r) {
		var i = T();
		try {
			return O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Fi(e, t, n) {
		var r = T();
		try {
			return O(Number(e))(t, n);
		} catch (e) {
			if (w(r), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ii(e, t, n) {
		var r = T();
		try {
			return O(Number(e))(t, n);
		} catch (e) {
			if (w(r), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Li(e, t) {
		var n = T();
		try {
			return O(Number(e))(t);
		} catch (e) {
			if (w(n), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Ri(e, t) {
		var n = T();
		try {
			return O(Number(e))(t);
		} catch (e) {
			if (w(n), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function zi(e, t) {
		var n = T();
		try {
			O(Number(e))(t);
		} catch (e) {
			if (w(n), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Bi(e, t, n) {
		var r = T();
		try {
			O(Number(e))(t, n);
		} catch (e) {
			if (w(r), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Vi(e, t, n, r, i) {
		var a = T();
		try {
			O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Hi(e, t, n, r) {
		var i = T();
		try {
			O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ui(e, t, n) {
		var r = T();
		try {
			O(Number(e))(t, n);
		} catch (e) {
			if (w(r), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Wi(e, t, n, r) {
		var i = T();
		try {
			return O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Gi(e, t, n) {
		var r = T();
		try {
			return O(Number(e))(t, n);
		} catch (e) {
			if (w(r), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Ki(e, t, n, r, i) {
		var a = T();
		try {
			return O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function qi(e, t, n, r) {
		var i = T();
		try {
			return O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Ji(e, t, n, r, i, a, o, s, c) {
		var l = T();
		try {
			return O(Number(e))(t, n, r, i, a, o, s, c);
		} catch (e) {
			if (w(l), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Yi(e, t, n, r, i, a, o) {
		var s = T();
		try {
			return O(Number(e))(t, n, r, i, a, o);
		} catch (e) {
			if (w(s), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Xi(e, t, n, r, i) {
		var a = T();
		try {
			return O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Zi(e) {
		var t = T();
		try {
			return O(Number(e))();
		} catch (e) {
			if (w(t), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Qi(e, t, n, r, i, a, o) {
		var s = T();
		try {
			return O(Number(e))(t, n, r, i, a, o);
		} catch (e) {
			if (w(s), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function $i(e, t, n, r) {
		var i = T();
		try {
			return O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ea(e, t, n, r) {
		var i = T();
		try {
			return O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ta(e, t, n, r, i) {
		var a = T();
		try {
			return O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function na(e, t, n) {
		var r = T();
		try {
			return O(Number(e))(t, n);
		} catch (e) {
			if (w(r), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ra(e, t, n) {
		var r = T();
		try {
			O(Number(e))(t, n);
		} catch (e) {
			if (w(r), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ia(e, t, n, r, i, a) {
		var o = T();
		try {
			return O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function aa(e, t, n) {
		var r = T();
		try {
			return O(Number(e))(t, n);
		} catch (e) {
			if (w(r), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function oa(e, t, n, r) {
		var i = T();
		try {
			return O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function sa(e, t) {
		var n = T();
		try {
			return O(Number(e))(t);
		} catch (e) {
			if (w(n), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ca(e, t, n, r, i, a) {
		var o = T();
		try {
			O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function la(e, t, n, r, i, a, o, s) {
		var c = T();
		try {
			return O(Number(e))(t, n, r, i, a, o, s);
		} catch (e) {
			if (w(c), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function ua(e, t, n, r) {
		var i = T();
		try {
			O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function da(e, t) {
		var n = T();
		try {
			return O(Number(e))(t);
		} catch (e) {
			if (w(n), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function fa(e, t, n, r, i, a, o, s, c, l) {
		var u = T();
		try {
			return O(Number(e))(t, n, r, i, a, o, s, c, l);
		} catch (e) {
			if (w(u), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function pa(e, t, n, r, i, a) {
		var o = T();
		try {
			return O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ma(e, t, n, r) {
		var i = T();
		try {
			O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ha(e, t, n, r, i, a, o, s, c, l, u) {
		var d = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s, c, l, u);
		} catch (e) {
			if (w(d), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ga(e, t, n, r, i, a) {
		var o = T();
		try {
			O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function _a(e, t, n, r, i) {
		var a = T();
		try {
			O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function va(e, t, n, r, i, a) {
		var o = T();
		try {
			O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ya(e, t, n, r, i) {
		var a = T();
		try {
			O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ba(e, t, n, r) {
		var i = T();
		try {
			O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function xa(e, t, n, r, i) {
		var a = T();
		try {
			O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Sa(e, t, n, r, i, a, o) {
		var s = T();
		try {
			return O(Number(e))(t, n, r, i, a, o);
		} catch (e) {
			if (w(s), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Ca(e, t, n, r, i, a, o, s, c, l) {
		var u = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s, c, l);
		} catch (e) {
			if (w(u), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function wa(e, t, n, r, i, a, o) {
		var s = T();
		try {
			O(Number(e))(t, n, r, i, a, o);
		} catch (e) {
			if (w(s), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ta(e, t, n, r, i, a) {
		var o = T();
		try {
			O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ea(e, t, n, r) {
		var i = T();
		try {
			O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Da(e, t, n, r, i, a, o, s, c, l) {
		var u = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s, c, l);
		} catch (e) {
			if (w(u), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Oa(e, t, n, r, i) {
		var a = T();
		try {
			O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ka(e, t, n, r, i) {
		var a = T();
		try {
			return O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Aa(e, t, n, r, i, a, o, s) {
		var c = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s);
		} catch (e) {
			if (w(c), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function ja(e, t, n, r, i) {
		var a = T();
		try {
			O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ma(e) {
		var t = T();
		try {
			O(Number(e))();
		} catch (e) {
			if (w(t), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Na(e, t, n, r, i) {
		var a = T();
		try {
			return O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Pa(e, t, n, r, i, a, o, s, c, l, u, d) {
		var f = T();
		try {
			return O(Number(e))(t, n, r, i, a, o, s, c, l, u, d);
		} catch (e) {
			if (w(f), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Fa(e, t, n, r, i, a, o, s) {
		var c = T();
		try {
			return O(Number(e))(t, n, r, i, a, o, s);
		} catch (e) {
			if (w(c), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ia(e, t, n, r, i, a) {
		var o = T();
		try {
			O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function La(e, t, n, r, i, a, o, s, c, l, u) {
		var d = T();
		try {
			return O(Number(e))(t, n, r, i, a, o, s, c, l, u);
		} catch (e) {
			if (w(d), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ra(e, t, n, r, i, a) {
		var o = T();
		try {
			O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function za(e, t, n, r, i, a, o, s) {
		var c = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s);
		} catch (e) {
			if (w(c), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ba(e, t, n, r, i, a, o, s, c) {
		var l = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s, c);
		} catch (e) {
			if (w(l), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Va(e, t, n, r, i, a, o, s, c, l, u, d) {
		var f = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s, c, l, u, d);
		} catch (e) {
			if (w(f), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ha(e, t, n, r, i, a, o) {
		var s = T();
		try {
			O(Number(e))(t, n, r, i, a, o);
		} catch (e) {
			if (w(s), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ua(e, t, n, r, i, a, o) {
		var s = T();
		try {
			O(Number(e))(t, n, r, i, a, o);
		} catch (e) {
			if (w(s), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Wa(e, t, n, r, i) {
		var a = T();
		try {
			return O(Number(e))(t, n, r, i);
		} catch (e) {
			if (w(a), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Ga(e, t, n, r, i, a) {
		var o = T();
		try {
			return O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Ka(e, t, n, r, i, a) {
		var o = T();
		try {
			return O(Number(e))(t, n, r, i, a);
		} catch (e) {
			if (w(o), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function qa(e, t, n, r, i, a, o, s) {
		var c = T();
		try {
			return O(Number(e))(t, n, r, i, a, o, s);
		} catch (e) {
			if (w(c), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Ja(e, t, n, r) {
		var i = T();
		try {
			return O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Ya(e, t, n, r) {
		var i = T();
		try {
			return O(Number(e))(t, n, r);
		} catch (e) {
			if (w(i), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Xa(e, t, n, r, i, a, o, s) {
		var c = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s);
		} catch (e) {
			if (w(c), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function Za(e, t, n, r, i, a, o) {
		var s = T();
		try {
			return O(Number(e))(t, n, r, i, a, o);
		} catch (e) {
			if (w(s), !(e instanceof h)) throw e;
			return $(1, 0), 0n;
		}
	}
	function Qa(e, t, n, r, i, a, o, s, c, l, u, d) {
		var f = T();
		try {
			return O(Number(e))(t, n, r, i, a, o, s, c, l, u, d);
		} catch (e) {
			if (w(f), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function $a(e, t, n, r, i, a, o, s, c, l, u) {
		var d = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s, c, l, u);
		} catch (e) {
			if (w(d), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function eo(e, t, n, r, i, a, o, s, c, l, u) {
		var d = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s, c, l, u);
		} catch (e) {
			if (w(d), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function to(e, t, n, r, i, a, o, s, c, l, u, d, f, p, ee, m) {
		var te = T();
		try {
			O(Number(e))(t, n, r, i, a, o, s, c, l, u, d, f, p, ee, m);
		} catch (e) {
			if (w(te), !(e instanceof h)) throw e;
			$(1, 0);
		}
	}
	function no(e) {
		e = Object.assign({}, e);
		var t = (e) => (t) => Number(e(BigInt(t))), n = (e) => (t) => e(BigInt(t));
		return e.$b = t(e.$b), e.Uk = t(e.Uk), e.Vk = n(e.Vk), e.gp = ((e) => (t, n) => Number(e(BigInt(t), BigInt(n))))(e.gp), e.hp = ((e) => (t, n) => e(BigInt(t), n))(e.hp), e.jp = n(e.jp), e._emscripten_stack_alloc = t(e._emscripten_stack_alloc), e.kp = ((e) => () => Number(e()))(e.kp), e.lp = n(e.lp), e.mp = n(e.mp), e.np = ((e) => (t, n, r) => e(BigInt(t), BigInt(n), BigInt(r)))(e.np), e.op = t(e.op), e;
	}
	async function ro() {
		We && await Ue(), !ee && re();
	}
	var io = await S();
	return await ro(), t;
}
//#endregion
//#region ../../native-package/x86/magick.js
async function B(e = {}) {
	var t, n = e, r = typeof window == "object", i = typeof WorkerGlobalScope < "u";
	typeof process == "object" && process.versions?.node && process.type, (!globalThis.crypto || !globalThis.crypto.getRandomValues) && (globalThis.crypto = { getRandomValues: (e) => {
		for (let t = 0; t < e.length; t++) e[t] = Math.random() * 256 | 0;
	} }), n._CastToSize = (e) => e, n._NullPointer = 0, n._PointerSize = 4;
	var a = "./this.program", o = (e, t) => {
		throw t;
	}, s = {}.url, c = "";
	function l(e) {
		return n.locateFile ? n.locateFile(e, c) : c + e;
	}
	var u, d;
	if (r || i) {
		try {
			c = new URL(".", s).href;
		} catch {}
		i && (d = (e) => {
			var t = new XMLHttpRequest();
			return t.open("GET", e, !1), t.responseType = "arraybuffer", t.send(null), new Uint8Array(t.response);
		}), u = async (e) => {
			if (h(e)) return new Promise((t, n) => {
				var r = new XMLHttpRequest();
				r.open("GET", e, !0), r.responseType = "arraybuffer", r.onload = () => {
					if (r.status == 200 || r.status == 0 && r.response) {
						t(r.response);
						return;
					}
					n(r.status);
				}, r.onerror = n, r.send(null);
			});
			var t = await fetch(e, { credentials: "same-origin" });
			if (t.ok) return t.arrayBuffer();
			throw Error(t.status + " : " + t.url);
		};
	}
	var f = console.log.bind(console), p = console.error.bind(console), ee, m = !1, h = (e) => e.startsWith("file://"), te, g, ne, _, re, v, ie, y, b, ae, oe, x, se, S = !1;
	function ce() {
		var e = ne.buffer;
		_ = new Int8Array(e), v = new Int16Array(e), n.HEAPU8 = re = new Uint8Array(e), ie = new Uint16Array(e), y = new Int32Array(e), b = new Uint32Array(e), ae = new Float32Array(e), oe = new Float64Array(e), x = new BigInt64Array(e), se = new BigUint64Array(e);
	}
	function C() {
		S = !0, !n.noFSInit && !G.initialized && G.init(), He.init(), va.sb(), G.ignorePermissions = !1;
	}
	function w(e) {
		e = "Aborted(" + e + ")", p(e), m = !0, e += ". Build with -sASSERTIONS for more info.";
		var t = new WebAssembly.RuntimeError(e);
		throw g?.(t), t;
	}
	var T;
	function le() {
		return n.locateFile ? l("magick.wasm") : new URL("data:text/plain;base64,").href;
	}
	function E(e) {
		if (e == T && ee) return new Uint8Array(ee);
		if (d) return d(e);
		throw "both async and sync fetching of the wasm failed";
	}
	async function D(e) {
		if (!ee) try {
			var t = await u(e);
			return new Uint8Array(t);
		} catch {}
		return E(e);
	}
	async function ue(e, t) {
		try {
			var n = await D(e);
			return await WebAssembly.instantiate(n, t);
		} catch (e) {
			p(`failed to asynchronously prepare wasm: ${e}`), w(e);
		}
	}
	async function O(e, t, n) {
		if (!e && !h(t)) try {
			var r = fetch(t, { credentials: "same-origin" });
			return await WebAssembly.instantiateStreaming(r, n);
		} catch (e) {
			p(`wasm streaming compile failed: ${e}`), p("falling back to ArrayBuffer instantiation");
		}
		return ue(t, n);
	}
	function de() {
		return { a: Ei };
	}
	async function fe() {
		function e(e, t) {
			return va = e.exports, va = ga(va), ne = va.rb, ce(), ve = va.Mb, Ti(va), va;
		}
		function t(t) {
			return e(t.instance);
		}
		var r = de();
		return n.instantiateWasm ? new Promise((t, i) => {
			n.instantiateWasm(r, (n, r) => {
				t(e(n, r));
			});
		}) : (T ??= le(), t(await O(ee, T, r)));
	}
	class pe {
		name = "ExitStatus";
		constructor(e) {
			this.message = `Program terminated with exit(${e})`, this.status = e;
		}
	}
	function me(e, t = "i8") {
		switch (t.endsWith("*") && (t = "*"), t) {
			case "i1": return _[e >>> 0];
			case "i8": return _[e >>> 0];
			case "i16": return v[e >>> 1 >>> 0];
			case "i32": return y[e >>> 2 >>> 0];
			case "i64": return x[e >>> 3 >>> 0];
			case "float": return ae[e >>> 2 >>> 0];
			case "double": return oe[e >>> 3 >>> 0];
			case "*": return b[e >>> 2 >>> 0];
			default: w(`invalid type for getValue: ${t}`);
		}
	}
	function he(e, t, n = "i8") {
		switch (n.endsWith("*") && (n = "*"), n) {
			case "i1":
				_[e >>> 0] = t;
				break;
			case "i8":
				_[e >>> 0] = t;
				break;
			case "i16":
				v[e >>> 1 >>> 0] = t;
				break;
			case "i32":
				y[e >>> 2 >>> 0] = t;
				break;
			case "i64":
				x[e >>> 3 >>> 0] = BigInt(t);
				break;
			case "float":
				ae[e >>> 2 >>> 0] = t;
				break;
			case "double":
				oe[e >>> 3 >>> 0] = t;
				break;
			case "*":
				b[e >>> 2 >>> 0] = t;
				break;
			default: w(`invalid type for setValue: ${n}`);
		}
	}
	var k = (e) => bi(e), A = () => xi(), ge = 9007199254740992, _e = -9007199254740992, j = (e) => e < _e || e > ge ? NaN : Number(e), M = [], ve, N = (e) => {
		var t = M[e];
		return t || (M[e] = t = ve.get(e)), t;
	};
	function ye(e, t) {
		return e >>>= 0, N(e)(t);
	}
	var be = [], xe = 0;
	function Se(e) {
		e >>>= 0;
		var t = new Ce(e);
		return t.get_caught() || (t.set_caught(!0), xe--), t.set_rethrown(!1), be.push(t), Si(e), wi(e);
	}
	var P = 0, F = () => {
		Q(0, 0);
		var e = be.pop();
		$(e.excPtr), P = 0;
	};
	class Ce {
		constructor(e) {
			this.excPtr = e, this.ptr = e - 24;
		}
		set_type(e) {
			b[this.ptr + 4 >>> 2 >>> 0] = e;
		}
		get_type() {
			return b[this.ptr + 4 >>> 2 >>> 0];
		}
		set_destructor(e) {
			b[this.ptr + 8 >>> 2 >>> 0] = e;
		}
		get_destructor() {
			return b[this.ptr + 8 >>> 2 >>> 0];
		}
		set_caught(e) {
			e = +!!e, _[this.ptr + 12 >>> 0] = e;
		}
		get_caught() {
			return _[this.ptr + 12 >>> 0] != 0;
		}
		set_rethrown(e) {
			e = +!!e, _[this.ptr + 13 >>> 0] = e;
		}
		get_rethrown() {
			return _[this.ptr + 13 >>> 0] != 0;
		}
		init(e, t) {
			this.set_adjusted_ptr(0), this.set_type(e), this.set_destructor(t);
		}
		set_adjusted_ptr(e) {
			b[this.ptr + 16 >>> 2 >>> 0] = e;
		}
		get_adjusted_ptr() {
			return b[this.ptr + 16 >>> 2 >>> 0];
		}
	}
	var we = (e) => yi(e), Te = (e) => {
		var t = P;
		if (!t) return we(0), 0;
		var n = new Ce(t);
		n.set_adjusted_ptr(t);
		var r = n.get_type();
		if (!r) return we(0), t;
		for (var i of e) {
			if (i === 0 || i === r) break;
			var a = n.ptr + 16;
			if (Ci(i, r, a)) return we(i), t;
		}
		return we(r), t;
	};
	function Ee() {
		return Te([]);
	}
	function De(e) {
		return e >>>= 0, Te([e]);
	}
	function Oe(e, t, n) {
		return e >>>= 0, t >>>= 0, n >>>= 0, Te([
			e,
			t,
			n
		]);
	}
	var ke = () => {
		var e = be.pop();
		e || w("no exception to throw");
		var t = e.excPtr;
		throw e.get_rethrown() || (be.push(e), e.set_rethrown(!0), e.set_caught(!1), xe++), P = t, P;
	};
	function Ae(e, t, n) {
		throw e >>>= 0, t >>>= 0, n >>>= 0, new Ce(e).init(t, n), P = e, xe++, P;
	}
	var je = () => xe;
	function Me(e) {
		throw e >>>= 0, P ||= e, P;
	}
	var I = {
		isAbs: (e) => e.charAt(0) === "/",
		splitPath: (e) => /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/.exec(e).slice(1),
		normalizeArray: (e, t) => {
			for (var n = 0, r = e.length - 1; r >= 0; r--) {
				var i = e[r];
				i === "." ? e.splice(r, 1) : i === ".." ? (e.splice(r, 1), n++) : n && (e.splice(r, 1), n--);
			}
			if (t) for (; n; n--) e.unshift("..");
			return e;
		},
		normalize: (e) => {
			var t = I.isAbs(e), n = e.slice(-1) === "/";
			return e = I.normalizeArray(e.split("/").filter((e) => !!e), !t).join("/"), !e && !t && (e = "."), e && n && (e += "/"), (t ? "/" : "") + e;
		},
		dirname: (e) => {
			var t = I.splitPath(e), n = t[0], r = t[1];
			return !n && !r ? "." : (r &&= r.slice(0, -1), n + r);
		},
		basename: (e) => e && e.match(/([^\/]+|\/)\/*$/)[1],
		join: (...e) => I.normalize(e.join("/")),
		join2: (e, t) => I.normalize(e + "/" + t)
	}, Ne = () => (e) => crypto.getRandomValues(e), Pe = (e) => {
		(Pe = Ne())(e);
	}, Fe = {
		resolve: (...e) => {
			for (var t = "", n = !1, r = e.length - 1; r >= -1 && !n; r--) {
				var i = r >= 0 ? e[r] : G.cwd();
				if (typeof i != "string") throw TypeError("Arguments to path.resolve must be strings");
				if (!i) return "";
				t = i + "/" + t, n = I.isAbs(i);
			}
			return t = I.normalizeArray(t.split("/").filter((e) => !!e), !n).join("/"), (n ? "/" : "") + t || ".";
		},
		relative: (e, t) => {
			e = Fe.resolve(e).slice(1), t = Fe.resolve(t).slice(1);
			function n(e) {
				for (var t = 0; t < e.length && e[t] === ""; t++);
				for (var n = e.length - 1; n >= 0 && e[n] === ""; n--);
				return t > n ? [] : e.slice(t, n - t + 1);
			}
			for (var r = n(e.split("/")), i = n(t.split("/")), a = Math.min(r.length, i.length), o = a, s = 0; s < a; s++) if (r[s] !== i[s]) {
				o = s;
				break;
			}
			for (var c = [], s = o; s < r.length; s++) c.push("..");
			return c = c.concat(i.slice(o)), c.join("/");
		}
	}, Ie = typeof TextDecoder < "u" ? new TextDecoder() : void 0, L = (e, t, n, r) => {
		var i = t + n;
		if (r) return i;
		for (; e[t] && !(t >= i);) ++t;
		return t;
	}, R = (e, t = 0, n, r) => {
		t >>>= 0;
		var i = L(e, t, n, r);
		if (i - t > 16 && e.buffer && Ie) return Ie.decode(e.subarray(t, i));
		for (var a = ""; t < i;) {
			var o = e[t++];
			if (!(o & 128)) {
				a += String.fromCharCode(o);
				continue;
			}
			var s = e[t++] & 63;
			if ((o & 224) == 192) {
				a += String.fromCharCode((o & 31) << 6 | s);
				continue;
			}
			var c = e[t++] & 63;
			if (o = (o & 240) == 224 ? (o & 15) << 12 | s << 6 | c : (o & 7) << 18 | s << 12 | c << 6 | e[t++] & 63, o < 65536) a += String.fromCharCode(o);
			else {
				var l = o - 65536;
				a += String.fromCharCode(55296 | l >> 10, 56320 | l & 1023);
			}
		}
		return a;
	}, Le = [], Re = (e) => {
		for (var t = 0, n = 0; n < e.length; ++n) {
			var r = e.charCodeAt(n);
			r <= 127 ? t++ : r <= 2047 ? t += 2 : r >= 55296 && r <= 57343 ? (t += 4, ++n) : t += 3;
		}
		return t;
	}, ze = (e, t, n, r) => {
		if (n >>>= 0, !(r > 0)) return 0;
		for (var i = n, a = n + r - 1, o = 0; o < e.length; ++o) {
			var s = e.codePointAt(o);
			if (s <= 127) {
				if (n >= a) break;
				t[n++ >>> 0] = s;
			} else if (s <= 2047) {
				if (n + 1 >= a) break;
				t[n++ >>> 0] = 192 | s >> 6, t[n++ >>> 0] = 128 | s & 63;
			} else if (s <= 65535) {
				if (n + 2 >= a) break;
				t[n++ >>> 0] = 224 | s >> 12, t[n++ >>> 0] = 128 | s >> 6 & 63, t[n++ >>> 0] = 128 | s & 63;
			} else {
				if (n + 3 >= a) break;
				t[n++ >>> 0] = 240 | s >> 18, t[n++ >>> 0] = 128 | s >> 12 & 63, t[n++ >>> 0] = 128 | s >> 6 & 63, t[n++ >>> 0] = 128 | s & 63, o++;
			}
		}
		return t[n >>> 0] = 0, n - i;
	}, Be = (e, t, n) => {
		var r = n > 0 ? n : Re(e) + 1, i = Array(r), a = ze(e, i, 0, i.length);
		return t && (i.length = a), i;
	}, Ve = () => {
		if (!Le.length) {
			var e = null;
			if (typeof window < "u" && typeof window.prompt == "function" && (e = window.prompt("Input: "), e !== null && (e += "\n")), !e) return null;
			Le = Be(e, !0);
		}
		return Le.shift();
	}, He = {
		ttys: [],
		init() {},
		shutdown() {},
		register(e, t) {
			He.ttys[e] = {
				input: [],
				output: [],
				ops: t
			}, G.registerDevice(e, He.stream_ops);
		},
		stream_ops: {
			open(e) {
				var t = He.ttys[e.node.rdev];
				if (!t) throw new G.ErrnoError(43);
				e.tty = t, e.seekable = !1;
			},
			close(e) {
				e.tty.ops.fsync(e.tty);
			},
			fsync(e) {
				e.tty.ops.fsync(e.tty);
			},
			read(e, t, n, r, i) {
				if (!e.tty || !e.tty.ops.get_char) throw new G.ErrnoError(60);
				for (var a = 0, o = 0; o < r; o++) {
					var s;
					try {
						s = e.tty.ops.get_char(e.tty);
					} catch {
						throw new G.ErrnoError(29);
					}
					if (s === void 0 && a === 0) throw new G.ErrnoError(6);
					if (s == null) break;
					a++, t[n + o] = s;
				}
				return a && (e.node.atime = Date.now()), a;
			},
			write(e, t, n, r, i) {
				if (!e.tty || !e.tty.ops.put_char) throw new G.ErrnoError(60);
				try {
					for (var a = 0; a < r; a++) e.tty.ops.put_char(e.tty, t[n + a]);
				} catch {
					throw new G.ErrnoError(29);
				}
				return r && (e.node.mtime = e.node.ctime = Date.now()), a;
			}
		},
		default_tty_ops: {
			get_char(e) {
				return Ve();
			},
			put_char(e, t) {
				t === null || t === 10 ? (f(R(e.output)), e.output = []) : t != 0 && e.output.push(t);
			},
			fsync(e) {
				e.output?.length > 0 && (f(R(e.output)), e.output = []);
			},
			ioctl_tcgets(e) {
				return {
					c_iflag: 25856,
					c_oflag: 5,
					c_cflag: 191,
					c_lflag: 35387,
					c_cc: [
						3,
						28,
						127,
						21,
						4,
						0,
						1,
						0,
						17,
						19,
						26,
						0,
						18,
						15,
						23,
						22,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0,
						0
					]
				};
			},
			ioctl_tcsets(e, t, n) {
				return 0;
			},
			ioctl_tiocgwinsz(e) {
				return [24, 80];
			}
		},
		default_tty1_ops: {
			put_char(e, t) {
				t === null || t === 10 ? (p(R(e.output)), e.output = []) : t != 0 && e.output.push(t);
			},
			fsync(e) {
				e.output?.length > 0 && (p(R(e.output)), e.output = []);
			}
		}
	}, Ue = (e, t) => re.fill(0, e, e + t), We = (e, t) => Math.ceil(e / t) * t, Ge = (e) => {
		e = We(e, 65536);
		var t = vi(65536, e);
		return t && Ue(t, e), t;
	}, z = {
		ops_table: null,
		mount(e) {
			return z.createNode(null, "/", 16895, 0);
		},
		createNode(e, t, n, r) {
			if (G.isBlkdev(n) || G.isFIFO(n)) throw new G.ErrnoError(63);
			z.ops_table ||= {
				dir: {
					node: {
						getattr: z.node_ops.getattr,
						setattr: z.node_ops.setattr,
						lookup: z.node_ops.lookup,
						mknod: z.node_ops.mknod,
						rename: z.node_ops.rename,
						unlink: z.node_ops.unlink,
						rmdir: z.node_ops.rmdir,
						readdir: z.node_ops.readdir,
						symlink: z.node_ops.symlink
					},
					stream: { llseek: z.stream_ops.llseek }
				},
				file: {
					node: {
						getattr: z.node_ops.getattr,
						setattr: z.node_ops.setattr
					},
					stream: {
						llseek: z.stream_ops.llseek,
						read: z.stream_ops.read,
						write: z.stream_ops.write,
						mmap: z.stream_ops.mmap,
						msync: z.stream_ops.msync
					}
				},
				link: {
					node: {
						getattr: z.node_ops.getattr,
						setattr: z.node_ops.setattr,
						readlink: z.node_ops.readlink
					},
					stream: {}
				},
				chrdev: {
					node: {
						getattr: z.node_ops.getattr,
						setattr: z.node_ops.setattr
					},
					stream: G.chrdev_stream_ops
				}
			};
			var i = G.createNode(e, t, n, r);
			return G.isDir(i.mode) ? (i.node_ops = z.ops_table.dir.node, i.stream_ops = z.ops_table.dir.stream, i.contents = {}) : G.isFile(i.mode) ? (i.node_ops = z.ops_table.file.node, i.stream_ops = z.ops_table.file.stream, i.usedBytes = 0, i.contents = null) : G.isLink(i.mode) ? (i.node_ops = z.ops_table.link.node, i.stream_ops = z.ops_table.link.stream) : G.isChrdev(i.mode) && (i.node_ops = z.ops_table.chrdev.node, i.stream_ops = z.ops_table.chrdev.stream), i.atime = i.mtime = i.ctime = Date.now(), e && (e.contents[t] = i, e.atime = e.mtime = e.ctime = i.atime), i;
		},
		getFileDataAsTypedArray(e) {
			return e.contents ? e.contents.subarray ? e.contents.subarray(0, e.usedBytes) : new Uint8Array(e.contents) : /* @__PURE__ */ new Uint8Array();
		},
		expandFileStorage(e, t) {
			var n = e.contents ? e.contents.length : 0;
			if (!(n >= t)) {
				t = Math.max(t, n * (n < 1048576 ? 2 : 1.125) >>> 0), n != 0 && (t = Math.max(t, 256));
				var r = e.contents;
				e.contents = new Uint8Array(t), e.usedBytes > 0 && e.contents.set(r.subarray(0, e.usedBytes), 0);
			}
		},
		resizeFileStorage(e, t) {
			if (e.usedBytes != t) {
				if (t == 0) e.contents = null, e.usedBytes = 0;
				else {
					var n = e.contents;
					e.contents = new Uint8Array(t), n && e.contents.set(n.subarray(0, Math.min(t, e.usedBytes))), e.usedBytes = t;
				}
			}
		},
		node_ops: {
			getattr(e) {
				var t = {};
				return t.dev = G.isChrdev(e.mode) ? e.id : 1, t.ino = e.id, t.mode = e.mode, t.nlink = 1, t.uid = 0, t.gid = 0, t.rdev = e.rdev, t.size = G.isDir(e.mode) ? 4096 : G.isFile(e.mode) ? e.usedBytes : G.isLink(e.mode) ? e.link.length : 0, t.atime = new Date(e.atime), t.mtime = new Date(e.mtime), t.ctime = new Date(e.ctime), t.blksize = 4096, t.blocks = Math.ceil(t.size / t.blksize), t;
			},
			setattr(e, t) {
				for (let n of [
					"mode",
					"atime",
					"mtime",
					"ctime"
				]) t[n] != null && (e[n] = t[n]);
				t.size !== void 0 && z.resizeFileStorage(e, t.size);
			},
			lookup(e, t) {
				throw z.doesNotExistError || (z.doesNotExistError = new G.ErrnoError(44), z.doesNotExistError.stack = "<generic error, no stack>"), z.doesNotExistError;
			},
			mknod(e, t, n, r) {
				return z.createNode(e, t, n, r);
			},
			rename(e, t, n) {
				var r;
				try {
					r = G.lookupNode(t, n);
				} catch {}
				if (r) {
					if (G.isDir(e.mode)) for (var i in r.contents) throw new G.ErrnoError(55);
					G.hashRemoveNode(r);
				}
				delete e.parent.contents[e.name], t.contents[n] = e, e.name = n, t.ctime = t.mtime = e.parent.ctime = e.parent.mtime = Date.now();
			},
			unlink(e, t) {
				delete e.contents[t], e.ctime = e.mtime = Date.now();
			},
			rmdir(e, t) {
				for (var n in G.lookupNode(e, t).contents) throw new G.ErrnoError(55);
				delete e.contents[t], e.ctime = e.mtime = Date.now();
			},
			readdir(e) {
				return [
					".",
					"..",
					...Object.keys(e.contents)
				];
			},
			symlink(e, t, n) {
				var r = z.createNode(e, t, 41471, 0);
				return r.link = n, r;
			},
			readlink(e) {
				if (!G.isLink(e.mode)) throw new G.ErrnoError(28);
				return e.link;
			}
		},
		stream_ops: {
			read(e, t, n, r, i) {
				var a = e.node.contents;
				if (i >= e.node.usedBytes) return 0;
				var o = Math.min(e.node.usedBytes - i, r);
				if (o > 8 && a.subarray) t.set(a.subarray(i, i + o), n);
				else for (var s = 0; s < o; s++) t[n + s] = a[i + s];
				return o;
			},
			write(e, t, n, r, i, a) {
				if (t.buffer === _.buffer && (a = !1), !r) return 0;
				var o = e.node;
				if (o.mtime = o.ctime = Date.now(), t.subarray && (!o.contents || o.contents.subarray)) {
					if (a) return o.contents = t.subarray(n, n + r), o.usedBytes = r, r;
					if (o.usedBytes === 0 && i === 0) return o.contents = t.slice(n, n + r), o.usedBytes = r, r;
					if (i + r <= o.usedBytes) return o.contents.set(t.subarray(n, n + r), i), r;
				}
				if (z.expandFileStorage(o, i + r), o.contents.subarray && t.subarray) o.contents.set(t.subarray(n, n + r), i);
				else for (var s = 0; s < r; s++) o.contents[i + s] = t[n + s];
				return o.usedBytes = Math.max(o.usedBytes, i + r), r;
			},
			llseek(e, t, n) {
				var r = t;
				if (n === 1 ? r += e.position : n === 2 && G.isFile(e.node.mode) && (r += e.node.usedBytes), r < 0) throw new G.ErrnoError(28);
				return r;
			},
			mmap(e, t, n, r, i) {
				if (!G.isFile(e.node.mode)) throw new G.ErrnoError(43);
				var a, o, s = e.node.contents;
				if (!(i & 2) && s && s.buffer === _.buffer) o = !1, a = s.byteOffset;
				else {
					if (o = !0, a = Ge(t), !a) throw new G.ErrnoError(48);
					s && ((n > 0 || n + t < s.length) && (s = s.subarray ? s.subarray(n, n + t) : Array.prototype.slice.call(s, n, n + t)), _.set(s, a >>> 0));
				}
				return {
					ptr: a,
					allocated: o
				};
			},
			msync(e, t, n, r, i) {
				return z.stream_ops.write(e, t, 0, r, n, !1), 0;
			}
		}
	}, Ke = (e) => {
		var t = {
			r: 0,
			"r+": 2,
			w: 577,
			"w+": 578,
			a: 1089,
			"a+": 1090
		}[e];
		if (t === void 0) throw Error(`Unknown file open mode: ${e}`);
		return t;
	}, qe = (e, t) => {
		var n = 0;
		return e && (n |= 365), t && (n |= 146), n;
	}, Je = async (e) => {
		var t = await u(e);
		return new Uint8Array(t);
	}, Ye = (...e) => G.createDataFile(...e), Xe = (e) => e, B = 0, Ze = null, V = (e) => {
		if (B--, B == 0 && Ze) {
			var t = Ze;
			Ze = null, t();
		}
	}, H = (e) => {
		B++;
	}, U = [], W = async (e, t) => {
		typeof Browser < "u" && Browser.init();
		for (var n of U) if (n.canHandle(t)) return n.handle(e, t);
		return e;
	}, Qe = async (e, t, n, r, i, a, o, s) => {
		var c = t ? Fe.resolve(I.join2(e, t)) : e, l = Xe(`cp ${c}`);
		H(l);
		try {
			var u = n;
			typeof n == "string" && (u = await Je(n)), u = await W(u, c), s?.(), a || Ye(e, t, u, r, i, o);
		} finally {
			V(l);
		}
	}, $e = (e, t, n, r, i, a, o, s, c, l) => {
		Qe(e, t, n, r, i, s, c, l).then(a).catch(o);
	}, G = {
		root: null,
		mounts: [],
		devices: {},
		streams: [],
		nextInode: 1,
		nameTable: null,
		currentPath: "/",
		initialized: !1,
		ignorePermissions: !0,
		filesystems: null,
		syncFSRequests: 0,
		ErrnoError: class {
			name = "ErrnoError";
			constructor(e) {
				this.errno = e;
			}
		},
		FSStream: class {
			shared = {};
			get object() {
				return this.node;
			}
			set object(e) {
				this.node = e;
			}
			get isRead() {
				return (this.flags & 2097155) != 1;
			}
			get isWrite() {
				return !!(this.flags & 2097155);
			}
			get isAppend() {
				return this.flags & 1024;
			}
			get flags() {
				return this.shared.flags;
			}
			set flags(e) {
				this.shared.flags = e;
			}
			get position() {
				return this.shared.position;
			}
			set position(e) {
				this.shared.position = e;
			}
		},
		FSNode: class {
			node_ops = {};
			stream_ops = {};
			readMode = 365;
			writeMode = 146;
			mounted = null;
			constructor(e, t, n, r) {
				e ||= this, this.parent = e, this.mount = e.mount, this.id = G.nextInode++, this.name = t, this.mode = n, this.rdev = r, this.atime = this.mtime = this.ctime = Date.now();
			}
			get read() {
				return (this.mode & this.readMode) === this.readMode;
			}
			set read(e) {
				e ? this.mode |= this.readMode : this.mode &= ~this.readMode;
			}
			get write() {
				return (this.mode & this.writeMode) === this.writeMode;
			}
			set write(e) {
				e ? this.mode |= this.writeMode : this.mode &= ~this.writeMode;
			}
			get isFolder() {
				return G.isDir(this.mode);
			}
			get isDevice() {
				return G.isChrdev(this.mode);
			}
		},
		lookupPath(e, t = {}) {
			if (!e) throw new G.ErrnoError(44);
			t.follow_mount ??= !0, I.isAbs(e) || (e = G.cwd() + "/" + e);
			linkloop: for (var n = 0; n < 40; n++) {
				for (var r = e.split("/").filter((e) => !!e), i = G.root, a = "/", o = 0; o < r.length; o++) {
					var s = o === r.length - 1;
					if (s && t.parent) break;
					if (r[o] !== ".") {
						if (r[o] === "..") {
							if (a = I.dirname(a), G.isRoot(i)) {
								e = a + "/" + r.slice(o + 1).join("/"), n--;
								continue linkloop;
							}
							i = i.parent;
							continue;
						}
						a = I.join2(a, r[o]);
						try {
							i = G.lookupNode(i, r[o]);
						} catch (e) {
							if (e?.errno === 44 && s && t.noent_okay) return { path: a };
							throw e;
						}
						if (G.isMountpoint(i) && (!s || t.follow_mount) && (i = i.mounted.root), G.isLink(i.mode) && (!s || t.follow)) {
							if (!i.node_ops.readlink) throw new G.ErrnoError(52);
							var c = i.node_ops.readlink(i);
							I.isAbs(c) || (c = I.dirname(a) + "/" + c), e = c + "/" + r.slice(o + 1).join("/");
							continue linkloop;
						}
					}
				}
				return {
					path: a,
					node: i
				};
			}
			throw new G.ErrnoError(32);
		},
		getPath(e) {
			for (var t;;) {
				if (G.isRoot(e)) {
					var n = e.mount.mountpoint;
					return t ? n[n.length - 1] === "/" ? n + t : `${n}/${t}` : n;
				}
				t = t ? `${e.name}/${t}` : e.name, e = e.parent;
			}
		},
		hashName(e, t) {
			for (var n = 0, r = 0; r < t.length; r++) n = (n << 5) - n + t.charCodeAt(r) | 0;
			return (e + n >>> 0) % G.nameTable.length;
		},
		hashAddNode(e) {
			var t = G.hashName(e.parent.id, e.name);
			e.name_next = G.nameTable[t], G.nameTable[t] = e;
		},
		hashRemoveNode(e) {
			var t = G.hashName(e.parent.id, e.name);
			if (G.nameTable[t] === e) G.nameTable[t] = e.name_next;
			else for (var n = G.nameTable[t]; n;) {
				if (n.name_next === e) {
					n.name_next = e.name_next;
					break;
				}
				n = n.name_next;
			}
		},
		lookupNode(e, t) {
			var n = G.mayLookup(e);
			if (n) throw new G.ErrnoError(n);
			for (var r = G.hashName(e.id, t), i = G.nameTable[r]; i; i = i.name_next) {
				var a = i.name;
				if (i.parent.id === e.id && a === t) return i;
			}
			return G.lookup(e, t);
		},
		createNode(e, t, n, r) {
			var i = new G.FSNode(e, t, n, r);
			return G.hashAddNode(i), i;
		},
		destroyNode(e) {
			G.hashRemoveNode(e);
		},
		isRoot(e) {
			return e === e.parent;
		},
		isMountpoint(e) {
			return !!e.mounted;
		},
		isFile(e) {
			return (e & 61440) == 32768;
		},
		isDir(e) {
			return (e & 61440) == 16384;
		},
		isLink(e) {
			return (e & 61440) == 40960;
		},
		isChrdev(e) {
			return (e & 61440) == 8192;
		},
		isBlkdev(e) {
			return (e & 61440) == 24576;
		},
		isFIFO(e) {
			return (e & 61440) == 4096;
		},
		isSocket(e) {
			return (e & 49152) == 49152;
		},
		flagsToPermissionString(e) {
			var t = [
				"r",
				"w",
				"rw"
			][e & 3];
			return e & 512 && (t += "w"), t;
		},
		nodePermissions(e, t) {
			return G.ignorePermissions ? 0 : t.includes("r") && !(e.mode & 292) || t.includes("w") && !(e.mode & 146) || t.includes("x") && !(e.mode & 73) ? 2 : 0;
		},
		mayLookup(e) {
			return G.isDir(e.mode) ? G.nodePermissions(e, "x") || (e.node_ops.lookup ? 0 : 2) : 54;
		},
		mayCreate(e, t) {
			if (!G.isDir(e.mode)) return 54;
			try {
				return G.lookupNode(e, t), 20;
			} catch {}
			return G.nodePermissions(e, "wx");
		},
		mayDelete(e, t, n) {
			var r;
			try {
				r = G.lookupNode(e, t);
			} catch (e) {
				return e.errno;
			}
			var i = G.nodePermissions(e, "wx");
			if (i) return i;
			if (n) {
				if (!G.isDir(r.mode)) return 54;
				if (G.isRoot(r) || G.getPath(r) === G.cwd()) return 10;
			} else if (G.isDir(r.mode)) return 31;
			return 0;
		},
		mayOpen(e, t) {
			return e ? G.isLink(e.mode) ? 32 : G.isDir(e.mode) && (G.flagsToPermissionString(t) !== "r" || t & 576) ? 31 : G.nodePermissions(e, G.flagsToPermissionString(t)) : 44;
		},
		checkOpExists(e, t) {
			if (!e) throw new G.ErrnoError(t);
			return e;
		},
		MAX_OPEN_FDS: 4096,
		nextfd() {
			for (var e = 0; e <= G.MAX_OPEN_FDS; e++) if (!G.streams[e]) return e;
			throw new G.ErrnoError(33);
		},
		getStreamChecked(e) {
			var t = G.getStream(e);
			if (!t) throw new G.ErrnoError(8);
			return t;
		},
		getStream: (e) => G.streams[e],
		createStream(e, t = -1) {
			return e = Object.assign(new G.FSStream(), e), t == -1 && (t = G.nextfd()), e.fd = t, G.streams[t] = e, e;
		},
		closeStream(e) {
			G.streams[e] = null;
		},
		dupStream(e, t = -1) {
			var n = G.createStream(e, t);
			return n.stream_ops?.dup?.(n), n;
		},
		doSetAttr(e, t, n) {
			var r = e?.stream_ops.setattr, i = r ? e : t;
			r ??= t.node_ops.setattr, G.checkOpExists(r, 63), r(i, n);
		},
		chrdev_stream_ops: {
			open(e) {
				e.stream_ops = G.getDevice(e.node.rdev).stream_ops, e.stream_ops.open?.(e);
			},
			llseek() {
				throw new G.ErrnoError(70);
			}
		},
		major: (e) => e >> 8,
		minor: (e) => e & 255,
		makedev: (e, t) => e << 8 | t,
		registerDevice(e, t) {
			G.devices[e] = { stream_ops: t };
		},
		getDevice: (e) => G.devices[e],
		getMounts(e) {
			for (var t = [], n = [e]; n.length;) {
				var r = n.pop();
				t.push(r), n.push(...r.mounts);
			}
			return t;
		},
		syncfs(e, t) {
			typeof e == "function" && (t = e, e = !1), G.syncFSRequests++, G.syncFSRequests > 1 && p(`warning: ${G.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`);
			var n = G.getMounts(G.root.mount), r = 0;
			function i(e) {
				return G.syncFSRequests--, t(e);
			}
			function a(e) {
				if (e) return a.errored ? void 0 : (a.errored = !0, i(e));
				++r >= n.length && i(null);
			}
			n.forEach((t) => {
				if (!t.type.syncfs) return a(null);
				t.type.syncfs(t, e, a);
			});
		},
		mount(e, t, n) {
			var r = n === "/", i = !n, a;
			if (r && G.root) throw new G.ErrnoError(10);
			if (!r && !i) {
				var o = G.lookupPath(n, { follow_mount: !1 });
				if (n = o.path, a = o.node, G.isMountpoint(a)) throw new G.ErrnoError(10);
				if (!G.isDir(a.mode)) throw new G.ErrnoError(54);
			}
			var s = {
				type: e,
				opts: t,
				mountpoint: n,
				mounts: []
			}, c = e.mount(s);
			return c.mount = s, s.root = c, r ? G.root = c : a && (a.mounted = s, a.mount && a.mount.mounts.push(s)), c;
		},
		unmount(e) {
			var t = G.lookupPath(e, { follow_mount: !1 });
			if (!G.isMountpoint(t.node)) throw new G.ErrnoError(28);
			var n = t.node, r = n.mounted, i = G.getMounts(r);
			Object.keys(G.nameTable).forEach((e) => {
				for (var t = G.nameTable[e]; t;) {
					var n = t.name_next;
					i.includes(t.mount) && G.destroyNode(t), t = n;
				}
			}), n.mounted = null;
			var a = n.mount.mounts.indexOf(r);
			n.mount.mounts.splice(a, 1);
		},
		lookup(e, t) {
			return e.node_ops.lookup(e, t);
		},
		mknod(e, t, n) {
			var r = G.lookupPath(e, { parent: !0 }).node, i = I.basename(e);
			if (!i) throw new G.ErrnoError(28);
			if (i === "." || i === "..") throw new G.ErrnoError(20);
			var a = G.mayCreate(r, i);
			if (a) throw new G.ErrnoError(a);
			if (!r.node_ops.mknod) throw new G.ErrnoError(63);
			return r.node_ops.mknod(r, i, t, n);
		},
		statfs(e) {
			return G.statfsNode(G.lookupPath(e, { follow: !0 }).node);
		},
		statfsStream(e) {
			return G.statfsNode(e.node);
		},
		statfsNode(e) {
			var t = {
				bsize: 4096,
				frsize: 4096,
				blocks: 1e6,
				bfree: 5e5,
				bavail: 5e5,
				files: G.nextInode,
				ffree: G.nextInode - 1,
				fsid: 42,
				flags: 2,
				namelen: 255
			};
			return e.node_ops.statfs && Object.assign(t, e.node_ops.statfs(e.mount.opts.root)), t;
		},
		create(e, t = 438) {
			return t &= 4095, t |= 32768, G.mknod(e, t, 0);
		},
		mkdir(e, t = 511) {
			return t &= 1023, t |= 16384, G.mknod(e, t, 0);
		},
		mkdirTree(e, t) {
			var n = e.split("/"), r = "";
			for (var i of n) if (i) {
				(r || I.isAbs(e)) && (r += "/"), r += i;
				try {
					G.mkdir(r, t);
				} catch (e) {
					if (e.errno != 20) throw e;
				}
			}
		},
		mkdev(e, t, n) {
			return n === void 0 && (n = t, t = 438), t |= 8192, G.mknod(e, t, n);
		},
		symlink(e, t) {
			if (!Fe.resolve(e)) throw new G.ErrnoError(44);
			var n = G.lookupPath(t, { parent: !0 }).node;
			if (!n) throw new G.ErrnoError(44);
			var r = I.basename(t), i = G.mayCreate(n, r);
			if (i) throw new G.ErrnoError(i);
			if (!n.node_ops.symlink) throw new G.ErrnoError(63);
			return n.node_ops.symlink(n, r, e);
		},
		rename(e, t) {
			var n = I.dirname(e), r = I.dirname(t), i = I.basename(e), a = I.basename(t), o = G.lookupPath(e, { parent: !0 }), s = o.node, c;
			if (o = G.lookupPath(t, { parent: !0 }), c = o.node, !s || !c) throw new G.ErrnoError(44);
			if (s.mount !== c.mount) throw new G.ErrnoError(75);
			var l = G.lookupNode(s, i), u = Fe.relative(e, r);
			if (u.charAt(0) !== ".") throw new G.ErrnoError(28);
			if (u = Fe.relative(t, n), u.charAt(0) !== ".") throw new G.ErrnoError(55);
			var d;
			try {
				d = G.lookupNode(c, a);
			} catch {}
			if (l !== d) {
				var f = G.isDir(l.mode), p = G.mayDelete(s, i, f);
				if (p || (p = d ? G.mayDelete(c, a, f) : G.mayCreate(c, a), p)) throw new G.ErrnoError(p);
				if (!s.node_ops.rename) throw new G.ErrnoError(63);
				if (G.isMountpoint(l) || d && G.isMountpoint(d)) throw new G.ErrnoError(10);
				if (c !== s && (p = G.nodePermissions(s, "w"), p)) throw new G.ErrnoError(p);
				G.hashRemoveNode(l);
				try {
					s.node_ops.rename(l, c, a), l.parent = c;
				} catch (e) {
					throw e;
				} finally {
					G.hashAddNode(l);
				}
			}
		},
		rmdir(e) {
			var t = G.lookupPath(e, { parent: !0 }).node, n = I.basename(e), r = G.lookupNode(t, n), i = G.mayDelete(t, n, !0);
			if (i) throw new G.ErrnoError(i);
			if (!t.node_ops.rmdir) throw new G.ErrnoError(63);
			if (G.isMountpoint(r)) throw new G.ErrnoError(10);
			t.node_ops.rmdir(t, n), G.destroyNode(r);
		},
		readdir(e) {
			var t = G.lookupPath(e, { follow: !0 }).node;
			return G.checkOpExists(t.node_ops.readdir, 54)(t);
		},
		unlink(e) {
			var t = G.lookupPath(e, { parent: !0 }).node;
			if (!t) throw new G.ErrnoError(44);
			var n = I.basename(e), r = G.lookupNode(t, n), i = G.mayDelete(t, n, !1);
			if (i) throw new G.ErrnoError(i);
			if (!t.node_ops.unlink) throw new G.ErrnoError(63);
			if (G.isMountpoint(r)) throw new G.ErrnoError(10);
			t.node_ops.unlink(t, n), G.destroyNode(r);
		},
		readlink(e) {
			var t = G.lookupPath(e).node;
			if (!t) throw new G.ErrnoError(44);
			if (!t.node_ops.readlink) throw new G.ErrnoError(28);
			return t.node_ops.readlink(t);
		},
		stat(e, t) {
			var n = G.lookupPath(e, { follow: !t }).node;
			return G.checkOpExists(n.node_ops.getattr, 63)(n);
		},
		fstat(e) {
			var t = G.getStreamChecked(e), n = t.node, r = t.stream_ops.getattr, i = r ? t : n;
			return r ??= n.node_ops.getattr, G.checkOpExists(r, 63), r(i);
		},
		lstat(e) {
			return G.stat(e, !0);
		},
		doChmod(e, t, n, r) {
			G.doSetAttr(e, t, {
				mode: n & 4095 | t.mode & -4096,
				ctime: Date.now(),
				dontFollow: r
			});
		},
		chmod(e, t, n) {
			var r = typeof e == "string" ? G.lookupPath(e, { follow: !n }).node : e;
			G.doChmod(null, r, t, n);
		},
		lchmod(e, t) {
			G.chmod(e, t, !0);
		},
		fchmod(e, t) {
			var n = G.getStreamChecked(e);
			G.doChmod(n, n.node, t, !1);
		},
		doChown(e, t, n) {
			G.doSetAttr(e, t, {
				timestamp: Date.now(),
				dontFollow: n
			});
		},
		chown(e, t, n, r) {
			var i = typeof e == "string" ? G.lookupPath(e, { follow: !r }).node : e;
			G.doChown(null, i, r);
		},
		lchown(e, t, n) {
			G.chown(e, t, n, !0);
		},
		fchown(e, t, n) {
			var r = G.getStreamChecked(e);
			G.doChown(r, r.node, !1);
		},
		doTruncate(e, t, n) {
			if (G.isDir(t.mode)) throw new G.ErrnoError(31);
			if (!G.isFile(t.mode)) throw new G.ErrnoError(28);
			var r = G.nodePermissions(t, "w");
			if (r) throw new G.ErrnoError(r);
			G.doSetAttr(e, t, {
				size: n,
				timestamp: Date.now()
			});
		},
		truncate(e, t) {
			if (t < 0) throw new G.ErrnoError(28);
			var n = typeof e == "string" ? G.lookupPath(e, { follow: !0 }).node : e;
			G.doTruncate(null, n, t);
		},
		ftruncate(e, t) {
			var n = G.getStreamChecked(e);
			if (t < 0 || !(n.flags & 2097155)) throw new G.ErrnoError(28);
			G.doTruncate(n, n.node, t);
		},
		utime(e, t, n) {
			var r = G.lookupPath(e, { follow: !0 }).node;
			G.checkOpExists(r.node_ops.setattr, 63)(r, {
				atime: t,
				mtime: n
			});
		},
		open(e, t, n = 438) {
			if (e === "") throw new G.ErrnoError(44);
			t = typeof t == "string" ? Ke(t) : t, n = t & 64 ? n & 4095 | 32768 : 0;
			var r, i;
			if (typeof e == "object") r = e;
			else {
				i = e.endsWith("/");
				var a = G.lookupPath(e, {
					follow: !(t & 131072),
					noent_okay: !0
				});
				r = a.node, e = a.path;
			}
			var o = !1;
			if (t & 64) {
				if (r) {
					if (t & 128) throw new G.ErrnoError(20);
				} else if (i) throw new G.ErrnoError(31);
				else r = G.mknod(e, n | 511, 0), o = !0;
			}
			if (!r) throw new G.ErrnoError(44);
			if (G.isChrdev(r.mode) && (t &= -513), t & 65536 && !G.isDir(r.mode)) throw new G.ErrnoError(54);
			if (!o) {
				var s = G.mayOpen(r, t);
				if (s) throw new G.ErrnoError(s);
			}
			t & 512 && !o && G.truncate(r, 0), t &= -131713;
			var c = G.createStream({
				node: r,
				path: G.getPath(r),
				flags: t,
				seekable: !0,
				position: 0,
				stream_ops: r.stream_ops,
				ungotten: [],
				error: !1
			});
			return c.stream_ops.open && c.stream_ops.open(c), o && G.chmod(r, n & 511), c;
		},
		close(e) {
			if (G.isClosed(e)) throw new G.ErrnoError(8);
			e.getdents &&= null;
			try {
				e.stream_ops.close && e.stream_ops.close(e);
			} catch (e) {
				throw e;
			} finally {
				G.closeStream(e.fd);
			}
			e.fd = null;
		},
		isClosed(e) {
			return e.fd === null;
		},
		llseek(e, t, n) {
			if (G.isClosed(e)) throw new G.ErrnoError(8);
			if (!e.seekable || !e.stream_ops.llseek) throw new G.ErrnoError(70);
			if (n != 0 && n != 1 && n != 2) throw new G.ErrnoError(28);
			return e.position = e.stream_ops.llseek(e, t, n), e.ungotten = [], e.position;
		},
		read(e, t, n, r, i) {
			if (r < 0 || i < 0) throw new G.ErrnoError(28);
			if (G.isClosed(e) || (e.flags & 2097155) == 1) throw new G.ErrnoError(8);
			if (G.isDir(e.node.mode)) throw new G.ErrnoError(31);
			if (!e.stream_ops.read) throw new G.ErrnoError(28);
			var a = i !== void 0;
			if (!a) i = e.position;
			else if (!e.seekable) throw new G.ErrnoError(70);
			var o = e.stream_ops.read(e, t, n, r, i);
			return a || (e.position += o), o;
		},
		write(e, t, n, r, i, a) {
			if (r < 0 || i < 0) throw new G.ErrnoError(28);
			if (G.isClosed(e) || !(e.flags & 2097155)) throw new G.ErrnoError(8);
			if (G.isDir(e.node.mode)) throw new G.ErrnoError(31);
			if (!e.stream_ops.write) throw new G.ErrnoError(28);
			e.seekable && e.flags & 1024 && G.llseek(e, 0, 2);
			var o = i !== void 0;
			if (!o) i = e.position;
			else if (!e.seekable) throw new G.ErrnoError(70);
			var s = e.stream_ops.write(e, t, n, r, i, a);
			return o || (e.position += s), s;
		},
		mmap(e, t, n, r, i) {
			if (r & 2 && !(i & 2) && (e.flags & 2097155) != 2 || (e.flags & 2097155) == 1) throw new G.ErrnoError(2);
			if (!e.stream_ops.mmap) throw new G.ErrnoError(43);
			if (!t) throw new G.ErrnoError(28);
			return e.stream_ops.mmap(e, t, n, r, i);
		},
		msync(e, t, n, r, i) {
			return e.stream_ops.msync ? e.stream_ops.msync(e, t, n, r, i) : 0;
		},
		ioctl(e, t, n) {
			if (!e.stream_ops.ioctl) throw new G.ErrnoError(59);
			return e.stream_ops.ioctl(e, t, n);
		},
		readFile(e, t = {}) {
			t.flags = t.flags || 0, t.encoding = t.encoding || "binary", t.encoding !== "utf8" && t.encoding !== "binary" && w(`Invalid encoding type "${t.encoding}"`);
			var n = G.open(e, t.flags), r = G.stat(e).size, i = new Uint8Array(r);
			return G.read(n, i, 0, r, 0), t.encoding === "utf8" && (i = R(i)), G.close(n), i;
		},
		writeFile(e, t, n = {}) {
			n.flags = n.flags || 577;
			var r = G.open(e, n.flags, n.mode);
			typeof t == "string" && (t = new Uint8Array(Be(t, !0))), ArrayBuffer.isView(t) ? G.write(r, t, 0, t.byteLength, void 0, n.canOwn) : w("Unsupported data type"), G.close(r);
		},
		cwd: () => G.currentPath,
		chdir(e) {
			var t = G.lookupPath(e, { follow: !0 });
			if (t.node === null) throw new G.ErrnoError(44);
			if (!G.isDir(t.node.mode)) throw new G.ErrnoError(54);
			var n = G.nodePermissions(t.node, "x");
			if (n) throw new G.ErrnoError(n);
			G.currentPath = t.path;
		},
		createDefaultDirectories() {
			G.mkdir("/tmp"), G.mkdir("/home"), G.mkdir("/home/web_user");
		},
		createDefaultDevices() {
			G.mkdir("/dev"), G.registerDevice(G.makedev(1, 3), {
				read: () => 0,
				write: (e, t, n, r, i) => r,
				llseek: () => 0
			}), G.mkdev("/dev/null", G.makedev(1, 3)), He.register(G.makedev(5, 0), He.default_tty_ops), He.register(G.makedev(6, 0), He.default_tty1_ops), G.mkdev("/dev/tty", G.makedev(5, 0)), G.mkdev("/dev/tty1", G.makedev(6, 0));
			var e = /* @__PURE__ */ new Uint8Array(1024), t = 0, n = () => (t === 0 && (Pe(e), t = e.byteLength), e[--t]);
			G.createDevice("/dev", "random", n), G.createDevice("/dev", "urandom", n), G.mkdir("/dev/shm"), G.mkdir("/dev/shm/tmp");
		},
		createSpecialDirectories() {
			G.mkdir("/proc");
			var e = G.mkdir("/proc/self");
			G.mkdir("/proc/self/fd"), G.mount({ mount() {
				var t = G.createNode(e, "fd", 16895, 73);
				return t.stream_ops = { llseek: z.stream_ops.llseek }, t.node_ops = {
					lookup(e, t) {
						var n = +t, r = G.getStreamChecked(n), i = {
							parent: null,
							mount: { mountpoint: "fake" },
							node_ops: { readlink: () => r.path },
							id: n + 1
						};
						return i.parent = i, i;
					},
					readdir() {
						return Array.from(G.streams.entries()).filter(([e, t]) => t).map(([e, t]) => e.toString());
					}
				}, t;
			} }, {}, "/proc/self/fd");
		},
		createStandardStreams(e, t, n) {
			e ? G.createDevice("/dev", "stdin", e) : G.symlink("/dev/tty", "/dev/stdin"), t ? G.createDevice("/dev", "stdout", null, t) : G.symlink("/dev/tty", "/dev/stdout"), n ? G.createDevice("/dev", "stderr", null, n) : G.symlink("/dev/tty1", "/dev/stderr"), G.open("/dev/stdin", 0), G.open("/dev/stdout", 1), G.open("/dev/stderr", 1);
		},
		staticInit() {
			G.nameTable = Array(4096), G.mount(z, {}, "/"), G.createDefaultDirectories(), G.createDefaultDevices(), G.createSpecialDirectories(), G.filesystems = { MEMFS: z };
		},
		init(e, t, n) {
			G.initialized = !0, G.createStandardStreams(e, t, n);
		},
		quit() {
			G.initialized = !1;
			for (var e of G.streams) e && G.close(e);
		},
		findObject(e, t) {
			var n = G.analyzePath(e, t);
			return n.exists ? n.object : null;
		},
		analyzePath(e, t) {
			try {
				var n = G.lookupPath(e, { follow: !t });
				e = n.path;
			} catch {}
			var r = {
				isRoot: !1,
				exists: !1,
				error: 0,
				name: null,
				path: null,
				object: null,
				parentExists: !1,
				parentPath: null,
				parentObject: null
			};
			try {
				var n = G.lookupPath(e, { parent: !0 });
				r.parentExists = !0, r.parentPath = n.path, r.parentObject = n.node, r.name = I.basename(e), n = G.lookupPath(e, { follow: !t }), r.exists = !0, r.path = n.path, r.object = n.node, r.name = n.node.name, r.isRoot = n.path === "/";
			} catch (e) {
				r.error = e.errno;
			}
			return r;
		},
		createPath(e, t, n, r) {
			e = typeof e == "string" ? e : G.getPath(e);
			for (var i = t.split("/").reverse(); i.length;) {
				var a = i.pop();
				if (a) {
					var o = I.join2(e, a);
					try {
						G.mkdir(o);
					} catch (e) {
						if (e.errno != 20) throw e;
					}
					e = o;
				}
			}
			return o;
		},
		createFile(e, t, n, r, i) {
			var a = I.join2(typeof e == "string" ? e : G.getPath(e), t), o = qe(r, i);
			return G.create(a, o);
		},
		createDataFile(e, t, n, r, i, a) {
			var o = t;
			e && (e = typeof e == "string" ? e : G.getPath(e), o = t ? I.join2(e, t) : e);
			var s = qe(r, i), c = G.create(o, s);
			if (n) {
				if (typeof n == "string") {
					for (var l = Array(n.length), u = 0, d = n.length; u < d; ++u) l[u] = n.charCodeAt(u);
					n = l;
				}
				G.chmod(c, s | 146);
				var f = G.open(c, 577);
				G.write(f, n, 0, n.length, 0, a), G.close(f), G.chmod(c, s);
			}
		},
		createDevice(e, t, n, r) {
			var i = I.join2(typeof e == "string" ? e : G.getPath(e), t), a = qe(!!n, !!r);
			G.createDevice.major ??= 64;
			var o = G.makedev(G.createDevice.major++, 0);
			return G.registerDevice(o, {
				open(e) {
					e.seekable = !1;
				},
				close(e) {
					r?.buffer?.length && r(10);
				},
				read(e, t, r, i, a) {
					for (var o = 0, s = 0; s < i; s++) {
						var c;
						try {
							c = n();
						} catch {
							throw new G.ErrnoError(29);
						}
						if (c === void 0 && o === 0) throw new G.ErrnoError(6);
						if (c == null) break;
						o++, t[r + s] = c;
					}
					return o && (e.node.atime = Date.now()), o;
				},
				write(e, t, n, i, a) {
					for (var o = 0; o < i; o++) try {
						r(t[n + o]);
					} catch {
						throw new G.ErrnoError(29);
					}
					return i && (e.node.mtime = e.node.ctime = Date.now()), o;
				}
			}), G.mkdev(i, a, o);
		},
		forceLoadFile(e) {
			if (e.isDevice || e.isFolder || e.link || e.contents) return !0;
			if (typeof XMLHttpRequest < "u") w("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.");
			else try {
				e.contents = d(e.url);
			} catch {
				throw new G.ErrnoError(29);
			}
		},
		createLazyFile(e, t, n, r, a) {
			class o {
				lengthKnown = !1;
				chunks = [];
				get(e) {
					if (!(e > this.length - 1 || e < 0)) {
						var t = e % this.chunkSize, n = e / this.chunkSize | 0;
						return this.getter(n)[t];
					}
				}
				setDataGetter(e) {
					this.getter = e;
				}
				cacheLength() {
					var e = new XMLHttpRequest();
					e.open("HEAD", n, !1), e.send(null), e.status >= 200 && e.status < 300 || e.status === 304 || w("Couldn't load " + n + ". Status: " + e.status);
					var t = Number(e.getResponseHeader("Content-length")), r, i = (r = e.getResponseHeader("Accept-Ranges")) && r === "bytes", a = (r = e.getResponseHeader("Content-Encoding")) && r === "gzip", o = 1048576;
					i || (o = t);
					var s = (e, r) => {
						e > r && w("invalid range (" + e + ", " + r + ") or no bytes requested!"), r > t - 1 && w("only " + t + " bytes available! programmer error!");
						var i = new XMLHttpRequest();
						return i.open("GET", n, !1), t !== o && i.setRequestHeader("Range", "bytes=" + e + "-" + r), i.responseType = "arraybuffer", i.overrideMimeType && i.overrideMimeType("text/plain; charset=x-user-defined"), i.send(null), i.status >= 200 && i.status < 300 || i.status === 304 || w("Couldn't load " + n + ". Status: " + i.status), i.response === void 0 ? Be(i.responseText || "", !0) : new Uint8Array(i.response || []);
					}, c = this;
					c.setDataGetter((e) => {
						var n = e * o, r = (e + 1) * o - 1;
						return r = Math.min(r, t - 1), c.chunks[e] === void 0 && (c.chunks[e] = s(n, r)), c.chunks[e] === void 0 && w("doXHR failed!"), c.chunks[e];
					}), (a || !t) && (o = t = 1, t = this.getter(0).length, o = t, f("LazyFiles on gzip forces download of the whole file when length is accessed")), this._length = t, this._chunkSize = o, this.lengthKnown = !0;
				}
				get length() {
					return this.lengthKnown || this.cacheLength(), this._length;
				}
				get chunkSize() {
					return this.lengthKnown || this.cacheLength(), this._chunkSize;
				}
			}
			if (typeof XMLHttpRequest < "u") {
				i || w("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");
				var s = {
					isDevice: !1,
					contents: new o()
				};
			} else var s = {
				isDevice: !1,
				url: n
			};
			var c = G.createFile(e, t, s, r, a);
			s.contents ? c.contents = s.contents : s.url && (c.contents = null, c.url = s.url), Object.defineProperties(c, { usedBytes: { get: function() {
				return this.contents.length;
			} } });
			var l = {};
			Object.keys(c.stream_ops).forEach((e) => {
				var t = c.stream_ops[e];
				l[e] = (...e) => (G.forceLoadFile(c), t(...e));
			});
			function u(e, t, n, r, i) {
				var a = e.node.contents;
				if (i >= a.length) return 0;
				var o = Math.min(a.length - i, r);
				if (a.slice) for (var s = 0; s < o; s++) t[n + s] = a[i + s];
				else for (var s = 0; s < o; s++) t[n + s] = a.get(i + s);
				return o;
			}
			return l.read = (e, t, n, r, i) => (G.forceLoadFile(c), u(e, t, n, r, i)), l.mmap = (e, t, n, r, i) => {
				G.forceLoadFile(c);
				var a = Ge(t);
				if (!a) throw new G.ErrnoError(48);
				return u(e, _, a, t, n), {
					ptr: a,
					allocated: !0
				};
			}, c.stream_ops = l, c;
		}
	}, K = (e, t, n) => (e >>>= 0, e ? R(re, e, t, n) : ""), q = {
		DEFAULT_POLLMASK: 5,
		calculateAt(e, t, n) {
			if (I.isAbs(t)) return t;
			var r = e === -100 ? G.cwd() : q.getStreamFromFD(e).path;
			if (t.length == 0) {
				if (!n) throw new G.ErrnoError(44);
				return r;
			}
			return r + "/" + t;
		},
		writeStat(e, t) {
			b[e >>> 2 >>> 0] = t.dev, b[e + 4 >>> 2 >>> 0] = t.mode, b[e + 8 >>> 2 >>> 0] = t.nlink, b[e + 12 >>> 2 >>> 0] = t.uid, b[e + 16 >>> 2 >>> 0] = t.gid, b[e + 20 >>> 2 >>> 0] = t.rdev, x[e + 24 >>> 3 >>> 0] = BigInt(t.size), y[e + 32 >>> 2 >>> 0] = 4096, y[e + 36 >>> 2 >>> 0] = t.blocks;
			var n = t.atime.getTime(), r = t.mtime.getTime(), i = t.ctime.getTime();
			return x[e + 40 >>> 3 >>> 0] = BigInt(Math.floor(n / 1e3)), b[e + 48 >>> 2 >>> 0] = n % 1e3 * 1e3 * 1e3, x[e + 56 >>> 3 >>> 0] = BigInt(Math.floor(r / 1e3)), b[e + 64 >>> 2 >>> 0] = r % 1e3 * 1e3 * 1e3, x[e + 72 >>> 3 >>> 0] = BigInt(Math.floor(i / 1e3)), b[e + 80 >>> 2 >>> 0] = i % 1e3 * 1e3 * 1e3, x[e + 88 >>> 3 >>> 0] = BigInt(t.ino), 0;
		},
		writeStatFs(e, t) {
			b[e + 4 >>> 2 >>> 0] = t.bsize, b[e + 60 >>> 2 >>> 0] = t.bsize, x[e + 8 >>> 3 >>> 0] = BigInt(t.blocks), x[e + 16 >>> 3 >>> 0] = BigInt(t.bfree), x[e + 24 >>> 3 >>> 0] = BigInt(t.bavail), x[e + 32 >>> 3 >>> 0] = BigInt(t.files), x[e + 40 >>> 3 >>> 0] = BigInt(t.ffree), b[e + 48 >>> 2 >>> 0] = t.fsid, b[e + 64 >>> 2 >>> 0] = t.flags, b[e + 56 >>> 2 >>> 0] = t.namelen;
		},
		doMsync(e, t, n, r, i) {
			if (!G.isFile(t.node.mode)) throw new G.ErrnoError(43);
			if (r & 2) return 0;
			var a = re.slice(e, e + n);
			G.msync(t, a, i, n, r);
		},
		getStreamFromFD(e) {
			return G.getStreamChecked(e);
		},
		varargs: void 0,
		getStr(e) {
			return K(e);
		}
	};
	function et(e, t) {
		e >>>= 0;
		try {
			return e = q.getStr(e), G.chmod(e, t), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function tt(e) {
		try {
			var t = q.getStreamFromFD(e);
			return G.dupStream(t).fd;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function nt(e, t, n, r) {
		t >>>= 0;
		try {
			if (t = q.getStr(t), t = q.calculateAt(e, t), n & -8) return -28;
			var i = G.lookupPath(t, { follow: !0 }).node;
			if (!i) return -44;
			var a = "";
			return n & 4 && (a += "r"), n & 2 && (a += "w"), n & 1 && (a += "x"), a && G.nodePermissions(i, a) ? -2 : 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function rt(e, t, n, r) {
		n = j(n), r = j(r);
		try {
			if (isNaN(n) || isNaN(r)) return -61;
			if (t != 0) return -138;
			if (n < 0 || r < 0) return -28;
			var i = G.fstat(e).size, a = n + r;
			return a > i && G.ftruncate(e, a), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function it(e, t) {
		try {
			return G.fchmod(e, t), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var at = () => {
		var e = y[q.varargs >>> 2 >>> 0];
		return q.varargs += 4, e;
	}, ot = at;
	function st(e, t, n) {
		n >>>= 0, q.varargs = n;
		try {
			var r = q.getStreamFromFD(e);
			switch (t) {
				case 0:
					var i = at();
					if (i < 0) return -28;
					for (; G.streams[i];) i++;
					return G.dupStream(r, i).fd;
				case 1:
				case 2: return 0;
				case 3: return r.flags;
				case 4:
					var i = at();
					return r.flags |= i, 0;
				case 12:
					var i = ot(), a = 0;
					return v[i + a >>> 1 >>> 0] = 2, 0;
				case 13:
				case 14: return 0;
			}
			return -28;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function ct(e, t) {
		t >>>= 0;
		try {
			return q.writeStat(t, G.fstat(e));
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var lt = (e, t, n) => ze(e, re, t, n);
	function ut(e, t) {
		e >>>= 0, t >>>= 0;
		try {
			if (t === 0) return -28;
			var n = G.cwd(), r = Re(n) + 1;
			return t < r ? -68 : (lt(n, e, t), r);
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function dt(e, t, n) {
		t >>>= 0, n >>>= 0;
		try {
			var r = q.getStreamFromFD(e);
			r.getdents ||= G.readdir(r.path);
			for (var i = 280, a = 0, o = G.llseek(r, 0, 1), s = Math.floor(o / i), c = Math.min(r.getdents.length, s + Math.floor(n / i)), l = s; l < c; l++) {
				var u, d, f = r.getdents[l];
				if (f === ".") u = r.node.id, d = 4;
				else if (f === "..") u = G.lookupPath(r.path, { parent: !0 }).node.id, d = 4;
				else {
					var p;
					try {
						p = G.lookupNode(r.node, f);
					} catch (e) {
						if (e?.errno === 28) continue;
						throw e;
					}
					u = p.id, d = G.isChrdev(p.mode) ? 2 : G.isDir(p.mode) ? 4 : G.isLink(p.mode) ? 10 : 8;
				}
				x[t + a >>> 3 >>> 0] = BigInt(u), x[t + a + 8 >>> 3 >>> 0] = BigInt((l + 1) * i), v[t + a + 16 >>> 1 >>> 0] = 280, _[t + a + 18 >>> 0] = d, lt(f, t + a + 19, 256), a += i;
			}
			return G.llseek(r, l * i, 0), a;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function ft(e, t, n) {
		n >>>= 0, q.varargs = n;
		try {
			var r = q.getStreamFromFD(e);
			switch (t) {
				case 21509: return r.tty ? 0 : -59;
				case 21505:
					if (!r.tty) return -59;
					if (r.tty.ops.ioctl_tcgets) {
						var i = r.tty.ops.ioctl_tcgets(r), a = ot();
						y[a >>> 2 >>> 0] = i.c_iflag || 0, y[a + 4 >>> 2 >>> 0] = i.c_oflag || 0, y[a + 8 >>> 2 >>> 0] = i.c_cflag || 0, y[a + 12 >>> 2 >>> 0] = i.c_lflag || 0;
						for (var o = 0; o < 32; o++) _[a + o + 17 >>> 0] = i.c_cc[o] || 0;
						return 0;
					}
					return 0;
				case 21510:
				case 21511:
				case 21512: return r.tty ? 0 : -59;
				case 21506:
				case 21507:
				case 21508:
					if (!r.tty) return -59;
					if (r.tty.ops.ioctl_tcsets) {
						for (var a = ot(), s = y[a >>> 2 >>> 0], c = y[a + 4 >>> 2 >>> 0], l = y[a + 8 >>> 2 >>> 0], u = y[a + 12 >>> 2 >>> 0], d = [], o = 0; o < 32; o++) d.push(_[a + o + 17 >>> 0]);
						return r.tty.ops.ioctl_tcsets(r.tty, t, {
							c_iflag: s,
							c_oflag: c,
							c_cflag: l,
							c_lflag: u,
							c_cc: d
						});
					}
					return 0;
				case 21519:
					if (!r.tty) return -59;
					var a = ot();
					return y[a >>> 2 >>> 0] = 0, 0;
				case 21520: return r.tty ? -28 : -59;
				case 21537:
				case 21531:
					var a = ot();
					return G.ioctl(r, t, a);
				case 21523:
					if (!r.tty) return -59;
					if (r.tty.ops.ioctl_tiocgwinsz) {
						var f = r.tty.ops.ioctl_tiocgwinsz(r.tty), a = ot();
						v[a >>> 1 >>> 0] = f[0], v[a + 2 >>> 1 >>> 0] = f[1];
					}
					return 0;
				case 21524: return r.tty ? 0 : -59;
				case 21515: return r.tty ? 0 : -59;
				default: return -28;
			}
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function pt(e, t) {
		e >>>= 0, t >>>= 0;
		try {
			return e = q.getStr(e), q.writeStat(t, G.lstat(e));
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function mt(e, t, n, r) {
		t >>>= 0, n >>>= 0;
		try {
			t = q.getStr(t);
			var i = r & 256, a = r & 4096;
			return r &= -6401, t = q.calculateAt(e, t, a), q.writeStat(n, i ? G.lstat(t) : G.stat(t));
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function ht(e, t, n, r) {
		t >>>= 0, r >>>= 0, q.varargs = r;
		try {
			t = q.getStr(t), t = q.calculateAt(e, t);
			var i = r ? at() : 0;
			return G.open(t, n, i).fd;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function gt(e, t, n, r) {
		t >>>= 0, n >>>= 0, r >>>= 0;
		try {
			if (t = q.getStr(t), t = q.calculateAt(e, t), r <= 0) return -28;
			var i = G.readlink(t), a = Math.min(r, Re(i)), o = _[n + a >>> 0];
			return lt(i, n, r + 1), _[n + a >>> 0] = o, a;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function _t(e, t, n, r) {
		t >>>= 0, r >>>= 0;
		try {
			return t = q.getStr(t), r = q.getStr(r), t = q.calculateAt(e, t), r = q.calculateAt(n, r), G.rename(t, r), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function vt(e) {
		e >>>= 0;
		try {
			return e = q.getStr(e), G.rmdir(e), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function yt(e, t) {
		e >>>= 0, t >>>= 0;
		try {
			return e = q.getStr(e), q.writeStat(t, G.stat(e));
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function bt(e, t, n) {
		e >>>= 0, n >>>= 0;
		try {
			return e = q.getStr(e), n = q.getStr(n), n = q.calculateAt(t, n), G.symlink(e, n), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function xt(e, t, n) {
		t >>>= 0;
		try {
			if (t = q.getStr(t), t = q.calculateAt(e, t), !n) G.unlink(t);
			else if (n === 512) G.rmdir(t);
			else return -28;
			return 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var St = () => w(""), Ct = {}, wt = (e) => {
		for (; e.length;) {
			var t = e.pop();
			e.pop()(t);
		}
	};
	function Tt(e) {
		return this.fromWireType(b[e >>> 2 >>> 0]);
	}
	var Et = {}, Dt = {}, Ot = {}, kt = class extends Error {
		constructor(e) {
			super(e), this.name = "InternalError";
		}
	}, At = (e) => {
		throw new kt(e);
	}, J = (e, t, n) => {
		e.forEach((e) => Ot[e] = t);
		function r(t) {
			var r = n(t);
			r.length !== e.length && At("Mismatched type converter count");
			for (var i = 0; i < e.length; ++i) Pt(e[i], r[i]);
		}
		var i = Array(t.length), a = [], o = 0;
		t.forEach((e, t) => {
			Dt.hasOwnProperty(e) ? i[t] = Dt[e] : (a.push(e), Et.hasOwnProperty(e) || (Et[e] = []), Et[e].push(() => {
				i[t] = Dt[e], ++o, o === a.length && r(i);
			}));
		}), a.length === 0 && r(i);
	}, jt = function(e) {
		e >>>= 0;
		var t = Ct[e];
		delete Ct[e];
		var n = t.rawConstructor, r = t.rawDestructor, i = t.fields, a = i.map((e) => e.getterReturnType).concat(i.map((e) => e.setterArgumentType));
		J([e], a, (e) => {
			var a = {};
			return i.forEach((t, n) => {
				var r = t.fieldName, o = e[n], s = e[n].optional, c = t.getter, l = t.getterContext, u = e[n + i.length], d = t.setter, f = t.setterContext;
				a[r] = {
					read: (e) => o.fromWireType(c(l, e)),
					write: (e, t) => {
						var n = [];
						d(f, e, u.toWireType(n, t)), wt(n);
					},
					optional: s
				};
			}), [{
				name: t.name,
				fromWireType: (e) => {
					var t = {};
					for (var n in a) t[n] = a[n].read(e);
					return r(e), t;
				},
				toWireType: (e, t) => {
					for (var i in a) if (!(i in t) && !a[i].optional) throw TypeError(`Missing field: "${i}"`);
					var o = n();
					for (i in a) a[i].write(o, t[i]);
					return e !== null && e.push(r, o), o;
				},
				readValueFromPointer: Tt,
				destructorFunction: r
			}];
		});
	}, Y = (e) => {
		e >>>= 0;
		for (var t = "";;) {
			var n = re[e++ >>> 0];
			if (!n) return t;
			t += String.fromCharCode(n);
		}
	}, Mt = class extends Error {
		constructor(e) {
			super(e), this.name = "BindingError";
		}
	}, X = (e) => {
		throw new Mt(e);
	};
	function Nt(e, t, n = {}) {
		var r = t.name;
		if (e || X(`type "${r}" must have a positive integer typeid pointer`), Dt.hasOwnProperty(e)) {
			if (n.ignoreDuplicateRegistrations) return;
			X(`Cannot register type '${r}' twice`);
		}
		if (Dt[e] = t, delete Ot[e], Et.hasOwnProperty(e)) {
			var i = Et[e];
			delete Et[e], i.forEach((e) => e());
		}
	}
	function Pt(e, t, n = {}) {
		return Nt(e, t, n);
	}
	var Ft = (e, t, n) => {
		switch (t) {
			case 1: return n ? (e) => _[e >>> 0] : (e) => re[e >>> 0];
			case 2: return n ? (e) => v[e >>> 1 >>> 0] : (e) => ie[e >>> 1 >>> 0];
			case 4: return n ? (e) => y[e >>> 2 >>> 0] : (e) => b[e >>> 2 >>> 0];
			case 8: return n ? (e) => x[e >>> 3 >>> 0] : (e) => se[e >>> 3 >>> 0];
			default: throw TypeError(`invalid integer width (${t}): ${e}`);
		}
	}, It = function(e, t, n, r, i) {
		e >>>= 0, t >>>= 0, n >>>= 0, t = Y(t);
		let a = r === 0n, o = (e) => e;
		if (a) {
			let e = n * 8;
			o = (t) => BigInt.asUintN(e, t), i = o(i);
		}
		Pt(e, {
			name: t,
			fromWireType: o,
			toWireType: (e, t) => (typeof t == "number" && (t = BigInt(t)), t),
			readValueFromPointer: Ft(t, n, !a),
			destructorFunction: null
		});
	};
	function Lt(e, t, n, r) {
		e >>>= 0, t >>>= 0, t = Y(t), Pt(e, {
			name: t,
			fromWireType: function(e) {
				return !!e;
			},
			toWireType: function(e, t) {
				return t ? n : r;
			},
			readValueFromPointer: function(e) {
				return this.fromWireType(re[e >>> 0]);
			},
			destructorFunction: null
		});
	}
	var Rt = (e) => ({
		count: e.count,
		deleteScheduled: e.deleteScheduled,
		preservePointerOnDelete: e.preservePointerOnDelete,
		ptr: e.ptr,
		ptrType: e.ptrType,
		smartPtr: e.smartPtr,
		smartPtrType: e.smartPtrType
	}), zt = (e) => {
		function t(e) {
			return e.$$.ptrType.registeredClass.name;
		}
		X(t(e) + " instance already deleted");
	}, Bt = !1, Vt = (e) => {}, Ht = (e) => {
		e.smartPtr ? e.smartPtrType.rawDestructor(e.smartPtr) : e.ptrType.registeredClass.rawDestructor(e.ptr);
	}, Ut = (e) => {
		--e.count.value, e.count.value === 0 && Ht(e);
	}, Wt = (e) => typeof FinalizationRegistry > "u" ? (Wt = (e) => e, e) : (Bt = new FinalizationRegistry((e) => {
		Ut(e.$$);
	}), Wt = (e) => {
		var t = e.$$;
		if (t.smartPtr) {
			var n = { $$: t };
			Bt.register(e, n, e);
		}
		return e;
	}, Vt = (e) => Bt.unregister(e), Wt(e)), Gt = [], Kt = () => {
		for (; Gt.length;) {
			var e = Gt.pop();
			e.$$.deleteScheduled = !1, e.delete();
		}
	}, qt, Jt = () => {
		let e = Yt.prototype;
		Object.assign(e, {
			isAliasOf(e) {
				if (!(this instanceof Yt) || !(e instanceof Yt)) return !1;
				var t = this.$$.ptrType.registeredClass, n = this.$$.ptr;
				e.$$ = e.$$;
				for (var r = e.$$.ptrType.registeredClass, i = e.$$.ptr; t.baseClass;) n = t.upcast(n), t = t.baseClass;
				for (; r.baseClass;) i = r.upcast(i), r = r.baseClass;
				return t === r && n === i;
			},
			clone() {
				if (this.$$.ptr || zt(this), this.$$.preservePointerOnDelete) return this.$$.count.value += 1, this;
				var e = Wt(Object.create(Object.getPrototypeOf(this), { $$: { value: Rt(this.$$) } }));
				return e.$$.count.value += 1, e.$$.deleteScheduled = !1, e;
			},
			delete() {
				this.$$.ptr || zt(this), this.$$.deleteScheduled && !this.$$.preservePointerOnDelete && X("Object already scheduled for deletion"), Vt(this), Ut(this.$$), this.$$.preservePointerOnDelete || (this.$$.smartPtr = void 0, this.$$.ptr = void 0);
			},
			isDeleted() {
				return !this.$$.ptr;
			},
			deleteLater() {
				return this.$$.ptr || zt(this), this.$$.deleteScheduled && !this.$$.preservePointerOnDelete && X("Object already scheduled for deletion"), Gt.push(this), Gt.length === 1 && qt && qt(Kt), this.$$.deleteScheduled = !0, this;
			}
		});
		let t = Symbol.dispose;
		t && (e[t] = e.delete);
	};
	function Yt() {}
	var Xt = (e, t) => Object.defineProperty(t, "name", { value: e }), Zt = {}, Qt = (e, t, n) => {
		if (e[t].overloadTable === void 0) {
			var r = e[t];
			e[t] = function(...r) {
				return e[t].overloadTable.hasOwnProperty(r.length) || X(`Function '${n}' called with an invalid number of arguments (${r.length}) - expects one of (${e[t].overloadTable})!`), e[t].overloadTable[r.length].apply(this, r);
			}, e[t].overloadTable = [], e[t].overloadTable[r.argCount] = r;
		}
	}, $t = (e, t, r) => {
		n.hasOwnProperty(e) ? ((r === void 0 || n[e].overloadTable !== void 0 && n[e].overloadTable[r] !== void 0) && X(`Cannot register public name '${e}' twice`), Qt(n, e, e), n[e].overloadTable.hasOwnProperty(r) && X(`Cannot register multiple overloads of a function with the same number of arguments (${r})!`), n[e].overloadTable[r] = t) : (n[e] = t, n[e].argCount = r);
	}, en = 48, tn = 57, nn = (e) => {
		e = e.replace(/[^a-zA-Z0-9_]/g, "$");
		var t = e.charCodeAt(0);
		return t >= en && t <= tn ? `_${e}` : e;
	};
	function rn(e, t, n, r, i, a, o, s) {
		this.name = e, this.constructor = t, this.instancePrototype = n, this.rawDestructor = r, this.baseClass = i, this.getActualType = a, this.upcast = o, this.downcast = s, this.pureVirtualFunctions = [];
	}
	var an = (e, t, n) => {
		for (; t !== n;) t.upcast || X(`Expected null or instance of ${n.name}, got an instance of ${t.name}`), e = t.upcast(e), t = t.baseClass;
		return e;
	}, on = (e) => {
		if (e === null) return "null";
		var t = typeof e;
		return t === "object" || t === "array" || t === "function" ? e.toString() : "" + e;
	};
	function sn(e, t) {
		if (t === null) return this.isReference && X(`null is not a valid ${this.name}`), 0;
		t.$$ || X(`Cannot pass "${on(t)}" as a ${this.name}`), t.$$.ptr || X(`Cannot pass deleted object as a pointer of type ${this.name}`);
		var n = t.$$.ptrType.registeredClass;
		return an(t.$$.ptr, n, this.registeredClass);
	}
	function cn(e, t) {
		var n;
		if (t === null) return this.isReference && X(`null is not a valid ${this.name}`), this.isSmartPointer ? (n = this.rawConstructor(), e !== null && e.push(this.rawDestructor, n), n) : 0;
		(!t || !t.$$) && X(`Cannot pass "${on(t)}" as a ${this.name}`), t.$$.ptr || X(`Cannot pass deleted object as a pointer of type ${this.name}`), !this.isConst && t.$$.ptrType.isConst && X(`Cannot convert argument of type ${t.$$.smartPtrType ? t.$$.smartPtrType.name : t.$$.ptrType.name} to parameter type ${this.name}`);
		var r = t.$$.ptrType.registeredClass;
		if (n = an(t.$$.ptr, r, this.registeredClass), this.isSmartPointer) switch (t.$$.smartPtr === void 0 && X("Passing raw pointer to smart pointer is illegal"), this.sharingPolicy) {
			case 0:
				t.$$.smartPtrType === this ? n = t.$$.smartPtr : X(`Cannot convert argument of type ${t.$$.smartPtrType ? t.$$.smartPtrType.name : t.$$.ptrType.name} to parameter type ${this.name}`);
				break;
			case 1:
				n = t.$$.smartPtr;
				break;
			case 2:
				if (t.$$.smartPtrType === this) n = t.$$.smartPtr;
				else {
					var i = t.clone();
					n = this.rawShare(n, On.toHandle(() => i.delete())), e !== null && e.push(this.rawDestructor, n);
				}
				break;
			default: X("Unsupporting sharing policy");
		}
		return n;
	}
	function ln(e, t) {
		if (t === null) return this.isReference && X(`null is not a valid ${this.name}`), 0;
		t.$$ || X(`Cannot pass "${on(t)}" as a ${this.name}`), t.$$.ptr || X(`Cannot pass deleted object as a pointer of type ${this.name}`), t.$$.ptrType.isConst && X(`Cannot convert argument of type ${t.$$.ptrType.name} to parameter type ${this.name}`);
		var n = t.$$.ptrType.registeredClass;
		return an(t.$$.ptr, n, this.registeredClass);
	}
	var un = (e, t, n) => {
		if (t === n) return e;
		if (n.baseClass === void 0) return null;
		var r = un(e, t, n.baseClass);
		return r === null ? null : n.downcast(r);
	}, dn = {}, fn = (e, t) => {
		for (t === void 0 && X("ptr should not be undefined"); e.baseClass;) t = e.upcast(t), e = e.baseClass;
		return t;
	}, pn = (e, t) => (t = fn(e, t), dn[t]), mn = (e, t) => ((!t.ptrType || !t.ptr) && At("makeClassHandle requires ptr and ptrType"), !!t.smartPtrType != !!t.smartPtr && At("Both smartPtrType and smartPtr must be specified"), t.count = { value: 1 }, Wt(Object.create(e, { $$: {
		value: t,
		writable: !0
	} })));
	function hn(e) {
		var t = this.getPointee(e);
		if (!t) return this.destructor(e), null;
		var n = pn(this.registeredClass, t);
		if (n !== void 0) {
			if (n.$$.count.value === 0) return n.$$.ptr = t, n.$$.smartPtr = e, n.clone();
			var r = n.clone();
			return this.destructor(e), r;
		}
		function i() {
			return this.isSmartPointer ? mn(this.registeredClass.instancePrototype, {
				ptrType: this.pointeeType,
				ptr: t,
				smartPtrType: this,
				smartPtr: e
			}) : mn(this.registeredClass.instancePrototype, {
				ptrType: this,
				ptr: e
			});
		}
		var a = Zt[this.registeredClass.getActualType(t)];
		if (!a) return i.call(this);
		var o = this.isConst ? a.constPointerType : a.pointerType, s = un(t, this.registeredClass, o.registeredClass);
		return s === null ? i.call(this) : this.isSmartPointer ? mn(o.registeredClass.instancePrototype, {
			ptrType: o,
			ptr: s,
			smartPtrType: this,
			smartPtr: e
		}) : mn(o.registeredClass.instancePrototype, {
			ptrType: o,
			ptr: s
		});
	}
	var gn = () => {
		Object.assign(_n.prototype, {
			getPointee(e) {
				return this.rawGetPointee && (e = this.rawGetPointee(e)), e;
			},
			destructor(e) {
				this.rawDestructor?.(e);
			},
			readValueFromPointer: Tt,
			fromWireType: hn
		});
	};
	function _n(e, t, n, r, i, a, o, s, c, l, u) {
		this.name = e, this.registeredClass = t, this.isReference = n, this.isConst = r, this.isSmartPointer = i, this.pointeeType = a, this.sharingPolicy = o, this.rawGetPointee = s, this.rawConstructor = c, this.rawShare = l, this.rawDestructor = u, !i && t.baseClass === void 0 ? r ? (this.toWireType = sn, this.destructorFunction = null) : (this.toWireType = ln, this.destructorFunction = null) : this.toWireType = cn;
	}
	var vn = (e, t, r) => {
		n.hasOwnProperty(e) || At("Replacing nonexistent public symbol"), n[e].overloadTable !== void 0 && r !== void 0 ? n[e].overloadTable[r] = t : (n[e] = t, n[e].argCount = r);
	}, yn = (e, t, n = [], r = !1) => {
		var i = N(t)(...n);
		function a(t) {
			return e[0] == "p" ? t >>> 0 : t;
		}
		return a(i);
	}, bn = (e, t, n = !1) => (...r) => yn(e, t, r, n), xn = (e, t, n = !1) => {
		e = Y(e);
		function r() {
			return e.includes("p") ? bn(e, t, n) : N(t);
		}
		var i = r();
		return typeof i != "function" && X(`unknown function pointer with signature ${e}: ${t}`), i;
	};
	class Sn extends Error {}
	var Cn = (e) => {
		var t = hi(e), n = Y(t);
		return _i(t), n;
	}, wn = (e, t) => {
		var n = [], r = {};
		function i(e) {
			if (!r[e] && !Dt[e]) {
				if (Ot[e]) {
					Ot[e].forEach(i);
					return;
				}
				n.push(e), r[e] = !0;
			}
		}
		throw t.forEach(i), new Sn(`${e}: ` + n.map(Cn).join([", "]));
	};
	function Tn(e, t, n, r, i, a, o, s, c, l, u, d, f) {
		e >>>= 0, t >>>= 0, n >>>= 0, r >>>= 0, i >>>= 0, a >>>= 0, o >>>= 0, s >>>= 0, c >>>= 0, l >>>= 0, u >>>= 0, d >>>= 0, f >>>= 0, u = Y(u), a = xn(i, a), s &&= xn(o, s), l &&= xn(c, l), f = xn(d, f);
		var p = nn(u);
		$t(p, function() {
			wn(`Cannot construct ${u} due to unbound types`, [r]);
		}), J([
			e,
			t,
			n
		], r ? [r] : [], (t) => {
			t = t[0];
			var n, i;
			r ? (n = t.registeredClass, i = n.instancePrototype) : i = Yt.prototype;
			var o = Xt(u, function(...e) {
				if (Object.getPrototypeOf(this) !== c) throw new Mt(`Use 'new' to construct ${u}`);
				if (d.constructor_body === void 0) throw new Mt(`${u} has no accessible constructor`);
				var t = d.constructor_body[e.length];
				if (t === void 0) throw new Mt(`Tried to invoke ctor of ${u} with invalid number of parameters (${e.length}) - expected (${Object.keys(d.constructor_body).toString()}) parameters instead!`);
				return t.apply(this, e);
			}), c = Object.create(i, { constructor: { value: o } });
			o.prototype = c;
			var d = new rn(u, o, c, f, n, a, s, l);
			d.baseClass && (d.baseClass.__derivedClasses ??= [], d.baseClass.__derivedClasses.push(d));
			var ee = new _n(u, d, !0, !1, !1), m = new _n(u + "*", d, !1, !1, !1), h = new _n(u + " const*", d, !1, !0, !1);
			return Zt[e] = {
				pointerType: m,
				constPointerType: h
			}, vn(p, o), [
				ee,
				m,
				h
			];
		});
	}
	var En = [], Z = [
		0,
		1,
		,
		1,
		null,
		1,
		!0,
		1,
		!1,
		1
	];
	function Dn(e) {
		e >>>= 0, e > 9 && --Z[e + 1] === 0 && (Z[e] = void 0, En.push(e));
	}
	var On = {
		toValue: (e) => (e || X(`Cannot use deleted val. handle = ${e}`), Z[e]),
		toHandle: (e) => {
			switch (e) {
				case void 0: return 2;
				case null: return 4;
				case !0: return 6;
				case !1: return 8;
				default: {
					let t = En.pop() || Z.length;
					return Z[t] = e, Z[t + 1] = 1, t;
				}
			}
		}
	}, kn = {
		name: "emscripten::val",
		fromWireType: (e) => {
			var t = On.toValue(e);
			return Dn(e), t;
		},
		toWireType: (e, t) => On.toHandle(t),
		readValueFromPointer: Tt,
		destructorFunction: null
	};
	function An(e) {
		return e >>>= 0, Pt(e, kn);
	}
	var jn = (e, t, n) => {
		switch (t) {
			case 1: return n ? function(e) {
				return this.fromWireType(_[e >>> 0]);
			} : function(e) {
				return this.fromWireType(re[e >>> 0]);
			};
			case 2: return n ? function(e) {
				return this.fromWireType(v[e >>> 1 >>> 0]);
			} : function(e) {
				return this.fromWireType(ie[e >>> 1 >>> 0]);
			};
			case 4: return n ? function(e) {
				return this.fromWireType(y[e >>> 2 >>> 0]);
			} : function(e) {
				return this.fromWireType(b[e >>> 2 >>> 0]);
			};
			default: throw TypeError(`invalid integer width (${t}): ${e}`);
		}
	};
	function Mn(e, t, n, r) {
		e >>>= 0, t >>>= 0, n >>>= 0, t = Y(t);
		function i() {}
		i.values = {}, Pt(e, {
			name: t,
			constructor: i,
			fromWireType: function(e) {
				return this.constructor.values[e];
			},
			toWireType: (e, t) => t.value,
			readValueFromPointer: jn(t, n, r),
			destructorFunction: null
		}), $t(t, i);
	}
	var Nn = (e, t) => {
		var n = Dt[e];
		return n === void 0 && X(`${t} has unknown type ${Cn(e)}`), n;
	};
	function Pn(e, t, n) {
		e >>>= 0, t >>>= 0;
		var r = Nn(e, "enum");
		t = Y(t);
		var i = r.constructor, a = Object.create(r.constructor.prototype, {
			value: { value: n },
			constructor: { value: Xt(`${r.name}_${t}`, function() {}) }
		});
		i.values[n] = a, i[t] = a;
	}
	var Fn = (e, t) => {
		switch (t) {
			case 4: return function(e) {
				return this.fromWireType(ae[e >>> 2 >>> 0]);
			};
			case 8: return function(e) {
				return this.fromWireType(oe[e >>> 3 >>> 0]);
			};
			default: throw TypeError(`invalid float width (${t}): ${e}`);
		}
	}, In = function(e, t, n) {
		e >>>= 0, t >>>= 0, n >>>= 0, t = Y(t), Pt(e, {
			name: t,
			fromWireType: (e) => e,
			toWireType: (e, t) => t,
			readValueFromPointer: Fn(t, n),
			destructorFunction: null
		});
	};
	function Ln(e) {
		for (var t = 1; t < e.length; ++t) if (e[t] !== null && e[t].destructorFunction === void 0) return !0;
		return !1;
	}
	var Rn = {
		ftf: function(e, t, n, r, i, a, o) {
			return function() {
				return a(n(r));
			};
		},
		ftft: function(e, t, n, r, i, a, o, s, c) {
			return function(e) {
				var t = s(null, e), i = n(r, t);
				return c(t), a(i);
			};
		},
		ftfn: function(e, t, n, r, i, a, o, s) {
			return function(e) {
				return a(n(r, s(null, e)));
			};
		},
		ftfnn: function(e, t, n, r, i, a, o, s, c) {
			return function(e, t) {
				return a(n(r, s(null, e), c(null, t)));
			};
		},
		fffn: function(e, t, n, r, i, a, o, s) {
			return function(e) {
				n(r, s(null, e));
			};
		},
		ftfnnn: function(e, t, n, r, i, a, o, s, c, l) {
			return function(e, t, i) {
				return a(n(r, s(null, e), c(null, t), l(null, i)));
			};
		},
		ftfnt: function(e, t, n, r, i, a, o, s, c, l) {
			return function(e, t) {
				var i = s(null, e), o = c(null, t), u = n(r, i, o);
				return l(o), a(u);
			};
		}
	};
	function zn(e, t, n, r) {
		let i = [
			t ? "t" : "f",
			n ? "t" : "f",
			r ? "t" : "f"
		];
		for (let n = t ? 1 : 2; n < e.length; ++n) {
			let t = e[n], r = "";
			r = t.destructorFunction === void 0 ? "u" : t.destructorFunction === null ? "n" : "t", i.push(r);
		}
		return i.join("");
	}
	function Bn(e, t, n, r, i, a) {
		var o = t.length;
		o < 2 && X("argTypes array size mismatch! Must at least get return value and 'this' types!");
		for (var s = t[1] !== null && n !== null, c = Ln(t), l = !t[0].isVoid, u = t[0], d = t[1], f = [
			e,
			X,
			r,
			i,
			wt,
			u.fromWireType.bind(u),
			d?.toWireType.bind(d)
		], p = 2; p < o; ++p) {
			var ee = t[p];
			f.push(ee.toWireType.bind(ee));
		}
		if (!c) for (var p = s ? 1 : 2; p < t.length; ++p) t[p].destructorFunction !== null && f.push(t[p].destructorFunction);
		return Xt(e, Rn[zn(t, s, l, a)](...f));
	}
	var Vn = (e, t) => {
		for (var n = [], r = 0; r < e; r++) n.push(b[t + r * 4 >>> 2 >>> 0]);
		return n;
	}, Hn = (e) => {
		e = e.trim();
		let t = e.indexOf("(");
		return t === -1 ? e : e.slice(0, t);
	};
	function Un(e, t, n, r, i, a, o, s) {
		e >>>= 0, n >>>= 0, r >>>= 0, i >>>= 0, a >>>= 0;
		var c = Vn(t, n);
		e = Y(e), e = Hn(e), i = xn(r, i, o), $t(e, function() {
			wn(`Cannot call ${e} due to unbound types`, c);
		}, t - 1), J([], c, (n) => {
			var r = [n[0], null].concat(n.slice(1));
			return vn(e, Bn(e, r, null, i, a, o), t - 1), [];
		});
	}
	var Wn = function(e, t, n, r, i) {
		e >>>= 0, t >>>= 0, n >>>= 0, t = Y(t);
		let a = r === 0, o = (e) => e;
		if (a) {
			var s = 32 - 8 * n;
			o = (e) => e << s >>> s, i = o(i);
		}
		Pt(e, {
			name: t,
			fromWireType: o,
			toWireType: (e, t) => t,
			readValueFromPointer: Ft(t, n, r !== 0),
			destructorFunction: null
		});
	};
	function Gn(e, t, n) {
		e >>>= 0, n >>>= 0;
		var r = [
			Int8Array,
			Uint8Array,
			Int16Array,
			Uint16Array,
			Int32Array,
			Uint32Array,
			Float32Array,
			Float64Array,
			BigInt64Array,
			BigUint64Array
		][t];
		function i(e) {
			var t = b[e >>> 2 >>> 0], n = b[e + 4 >>> 2 >>> 0];
			return new r(_.buffer, n, t);
		}
		n = Y(n), Pt(e, {
			name: n,
			fromWireType: i,
			readValueFromPointer: i
		}, { ignoreDuplicateRegistrations: !0 });
	}
	function Kn(e, t) {
		e >>>= 0, t >>>= 0, t = Y(t);
		var n = !0;
		Pt(e, {
			name: t,
			fromWireType(e) {
				var t = b[e >>> 2 >>> 0], r = e + 4, i;
				if (n) i = K(r, t, !0);
				else {
					i = "";
					for (var a = 0; a < t; ++a) i += String.fromCharCode(re[r + a >>> 0]);
				}
				return _i(e), i;
			},
			toWireType(e, t) {
				t instanceof ArrayBuffer && (t = new Uint8Array(t));
				var r, i = typeof t == "string";
				i || ArrayBuffer.isView(t) && t.BYTES_PER_ELEMENT == 1 || X("Cannot pass non-string to std::string"), r = n && i ? Re(t) : t.length;
				var a = gi(4 + r + 1), o = a + 4;
				if (b[a >>> 2 >>> 0] = r, i) {
					if (n) lt(t, o, r + 1);
					else for (var s = 0; s < r; ++s) {
						var c = t.charCodeAt(s);
						c > 255 && (_i(a), X("String has UTF-16 code units that do not fit in 8 bits")), re[o + s >>> 0] = c;
					}
				} else re.set(t, o >>> 0);
				return e !== null && e.push(_i, a), a;
			},
			readValueFromPointer: Tt,
			destructorFunction(e) {
				_i(e);
			}
		});
	}
	var qn = typeof TextDecoder < "u" ? new TextDecoder("utf-16le") : void 0, Jn = (e, t, n) => {
		var r = e >>> 1, i = L(ie, r, t / 2, n);
		if (i - r > 16 && qn) return qn.decode(ie.subarray(r >>> 0, i >>> 0));
		for (var a = "", o = r; o < i; ++o) {
			var s = ie[o >>> 0];
			a += String.fromCharCode(s);
		}
		return a;
	}, Yn = (e, t, n) => {
		if (n ??= 2147483647, n < 2) return 0;
		n -= 2;
		for (var r = t, i = n < e.length * 2 ? n / 2 : e.length, a = 0; a < i; ++a) {
			var o = e.charCodeAt(a);
			v[t >>> 1 >>> 0] = o, t += 2;
		}
		return v[t >>> 1 >>> 0] = 0, t - r;
	}, Xn = (e) => e.length * 2, Zn = (e, t, n) => {
		for (var r = "", i = e >>> 2, a = 0; !(a >= t / 4); a++) {
			var o = b[i + a >>> 0];
			if (!o && !n) break;
			r += String.fromCodePoint(o);
		}
		return r;
	}, Qn = (e, t, n) => {
		if (t >>>= 0, n ??= 2147483647, n < 4) return 0;
		for (var r = t, i = r + n - 4, a = 0; a < e.length; ++a) {
			var o = e.codePointAt(a);
			if (o > 65535 && a++, y[t >>> 2 >>> 0] = o, t += 4, t + 4 > i) break;
		}
		return y[t >>> 2 >>> 0] = 0, t - r;
	}, $n = (e) => {
		for (var t = 0, n = 0; n < e.length; ++n) e.codePointAt(n) > 65535 && n++, t += 4;
		return t;
	};
	function er(e, t, n) {
		e >>>= 0, t >>>= 0, n >>>= 0, n = Y(n);
		var r, i, a;
		t === 2 ? (r = Jn, i = Yn, a = Xn) : (r = Zn, i = Qn, a = $n), Pt(e, {
			name: n,
			fromWireType: (e) => {
				var n = b[e >>> 2 >>> 0], i = r(e + 4, n * t, !0);
				return _i(e), i;
			},
			toWireType: (e, r) => {
				typeof r != "string" && X(`Cannot pass non-string to C++ string type ${n}`);
				var o = a(r), s = gi(4 + o + t);
				return b[s >>> 2 >>> 0] = o / t, i(r, s + 4, o + t), e !== null && e.push(_i, s), s;
			},
			readValueFromPointer: Tt,
			destructorFunction(e) {
				_i(e);
			}
		});
	}
	function tr(e, t, n, r, i, a) {
		e >>>= 0, t >>>= 0, n >>>= 0, r >>>= 0, i >>>= 0, a >>>= 0, Ct[e] = {
			name: Y(t),
			rawConstructor: xn(n, r),
			rawDestructor: xn(i, a),
			fields: []
		};
	}
	function nr(e, t, n, r, i, a, o, s, c, l) {
		e >>>= 0, t >>>= 0, n >>>= 0, r >>>= 0, i >>>= 0, a >>>= 0, o >>>= 0, s >>>= 0, c >>>= 0, l >>>= 0, Ct[e].fields.push({
			fieldName: Y(t),
			getterReturnType: n,
			getter: xn(r, i),
			getterContext: a,
			setterArgumentType: o,
			setter: xn(s, c),
			setterContext: l
		});
	}
	var rr = function(e, t) {
		e >>>= 0, t >>>= 0, t = Y(t), Pt(e, {
			isVoid: !0,
			name: t,
			fromWireType: () => void 0,
			toWireType: (e, t) => void 0
		});
	}, ir = () => {};
	function ar(e) {
		return e >>>= 0, e ? -52 : 0;
	}
	var or = () => {
		throw Infinity;
	}, sr = [], cr = (e) => {
		var t = sr.length;
		return sr.push(e), t;
	}, lr = (e, t) => {
		for (var n = Array(e), r = 0; r < e; ++r) n[r] = Nn(b[t + r * 4 >>> 2 >>> 0], `parameter ${r}`);
		return n;
	}, ur = (e, t, n) => {
		var r = [], i = e(r, n);
		return r.length && (b[t >>> 2 >>> 0] = On.toHandle(r)), i;
	}, dr = {}, fr = (e) => {
		var t = dr[e];
		return t === void 0 ? Y(e) : t;
	}, pr = function(e, t, n) {
		t >>>= 0;
		var r = 8, [i, ...a] = lr(e, t), o = i.toWireType.bind(i), s = a.map((e) => e.readValueFromPointer.bind(e));
		e--;
		var c = Array(e);
		return cr(Xt(`methodCaller<(${a.map((e) => e.name)}) => ${i.name}>`, (t, i, a, l) => {
			for (var u = 0, d = 0; d < e; ++d) c[d] = s[d](l + u), u += r;
			var f;
			switch (n) {
				case 0:
					f = On.toValue(t).apply(null, c);
					break;
				case 2:
					f = Reflect.construct(On.toValue(t), c);
					break;
				case 3:
					f = c[0];
					break;
				case 1: f = On.toValue(t)[fr(i)](...c);
			}
			return ur(o, a, f);
		}));
	};
	function mr(e) {
		e >>>= 0, e > 9 && (Z[e + 1] += 1);
	}
	function hr(e, t, n, r, i) {
		return e >>>= 0, t >>>= 0, n >>>= 0, r >>>= 0, i >>>= 0, sr[e](t, n, r, i);
	}
	function gr() {
		return On.toHandle([]);
	}
	function _r(e) {
		return e >>>= 0, On.toHandle(fr(e));
	}
	function vr() {
		return On.toHandle({});
	}
	function yr(e) {
		e >>>= 0, wt(On.toValue(e)), Dn(e);
	}
	function br(e, t, n) {
		e >>>= 0, t >>>= 0, n >>>= 0, e = On.toValue(e), t = On.toValue(t), n = On.toValue(n), e[t] = n;
	}
	function xr(e, t) {
		e = j(e), t >>>= 0;
		var n = /* @__PURE__ */ new Date(e * 1e3);
		y[t >>> 2 >>> 0] = n.getUTCSeconds(), y[t + 4 >>> 2 >>> 0] = n.getUTCMinutes(), y[t + 8 >>> 2 >>> 0] = n.getUTCHours(), y[t + 12 >>> 2 >>> 0] = n.getUTCDate(), y[t + 16 >>> 2 >>> 0] = n.getUTCMonth(), y[t + 20 >>> 2 >>> 0] = n.getUTCFullYear() - 1900, y[t + 24 >>> 2 >>> 0] = n.getUTCDay();
		var r = Date.UTC(n.getUTCFullYear(), 0, 1, 0, 0, 0, 0), i = (n.getTime() - r) / 864e5 | 0;
		y[t + 28 >>> 2 >>> 0] = i;
	}
	var Sr = (e) => e % 4 == 0 && (e % 100 != 0 || e % 400 == 0), Cr = [
		0,
		31,
		60,
		91,
		121,
		152,
		182,
		213,
		244,
		274,
		305,
		335
	], wr = [
		0,
		31,
		59,
		90,
		120,
		151,
		181,
		212,
		243,
		273,
		304,
		334
	], Tr = (e) => (Sr(e.getFullYear()) ? Cr : wr)[e.getMonth()] + e.getDate() - 1;
	function Er(e, t) {
		e = j(e), t >>>= 0;
		var n = /* @__PURE__ */ new Date(e * 1e3);
		y[t >>> 2 >>> 0] = n.getSeconds(), y[t + 4 >>> 2 >>> 0] = n.getMinutes(), y[t + 8 >>> 2 >>> 0] = n.getHours(), y[t + 12 >>> 2 >>> 0] = n.getDate(), y[t + 16 >>> 2 >>> 0] = n.getMonth(), y[t + 20 >>> 2 >>> 0] = n.getFullYear() - 1900, y[t + 24 >>> 2 >>> 0] = n.getDay();
		var r = Tr(n) | 0;
		y[t + 28 >>> 2 >>> 0] = r, y[t + 36 >>> 2 >>> 0] = -(n.getTimezoneOffset() * 60);
		var i = new Date(n.getFullYear(), 0, 1), a = new Date(n.getFullYear(), 6, 1).getTimezoneOffset(), o = i.getTimezoneOffset(), s = (a != o && n.getTimezoneOffset() == Math.min(o, a)) | 0;
		y[t + 32 >>> 2 >>> 0] = s;
	}
	var Dr = function(e) {
		e >>>= 0;
		var t = (() => {
			var t = new Date(y[e + 20 >>> 2 >>> 0] + 1900, y[e + 16 >>> 2 >>> 0], y[e + 12 >>> 2 >>> 0], y[e + 8 >>> 2 >>> 0], y[e + 4 >>> 2 >>> 0], y[e >>> 2 >>> 0], 0), n = y[e + 32 >>> 2 >>> 0], r = t.getTimezoneOffset(), i = new Date(t.getFullYear(), 0, 1), a = new Date(t.getFullYear(), 6, 1).getTimezoneOffset(), o = i.getTimezoneOffset(), s = Math.min(o, a);
			if (n < 0) y[e + 32 >>> 2 >>> 0] = Number(a != o && s == r);
			else if (n > 0 != (s == r)) {
				var c = n > 0 ? s : Math.max(o, a);
				t.setTime(t.getTime() + (c - r) * 6e4);
			}
			y[e + 24 >>> 2 >>> 0] = t.getDay();
			var l = Tr(t) | 0;
			y[e + 28 >>> 2 >>> 0] = l, y[e >>> 2 >>> 0] = t.getSeconds(), y[e + 4 >>> 2 >>> 0] = t.getMinutes(), y[e + 8 >>> 2 >>> 0] = t.getHours(), y[e + 12 >>> 2 >>> 0] = t.getDate(), y[e + 16 >>> 2 >>> 0] = t.getMonth(), y[e + 20 >>> 2 >>> 0] = t.getYear();
			var u = t.getTime();
			return isNaN(u) ? -1 : u / 1e3;
		})();
		return BigInt(t);
	};
	function Or(e, t, n, r, i, a, o) {
		e >>>= 0, i = j(i), a >>>= 0, o >>>= 0;
		try {
			var s = q.getStreamFromFD(r), c = G.mmap(s, e, i, t, n), l = c.ptr;
			return y[a >>> 2 >>> 0] = c.allocated, b[o >>> 2 >>> 0] = l, 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	function kr(e, t, n, r, i, a) {
		e >>>= 0, t >>>= 0, a = j(a);
		try {
			var o = q.getStreamFromFD(i);
			n & 2 && q.doMsync(e, o, t, r, a);
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return -e.errno;
		}
	}
	var Ar = function(e, t, n, r) {
		e >>>= 0, t >>>= 0, n >>>= 0, r >>>= 0;
		var i = (/* @__PURE__ */ new Date()).getFullYear(), a = new Date(i, 0, 1), o = new Date(i, 6, 1), s = a.getTimezoneOffset(), c = o.getTimezoneOffset(), l = Math.max(s, c);
		b[e >>> 2 >>> 0] = l * 60, y[t >>> 2 >>> 0] = Number(s != c);
		var u = (e) => {
			var t = e >= 0 ? "-" : "+", n = Math.abs(e);
			return `UTC${t}${String(Math.floor(n / 60)).padStart(2, "0")}${String(n % 60).padStart(2, "0")}`;
		}, d = u(s), f = u(c);
		c < s ? (lt(d, n, 17), lt(f, r, 17)) : (lt(d, r, 17), lt(f, n, 17));
	}, jr = () => performance.now(), Mr = () => Date.now(), Nr = 1, Pr = (e) => e >= 0 && e <= 3;
	function Fr(e, t, n) {
		if (t = j(t), n >>>= 0, !Pr(e)) return 28;
		var r;
		if (e === 0) r = Mr();
		else if (Nr) r = jr();
		else return 52;
		var i = Math.round(r * 1e3 * 1e3);
		return x[n >>> 3 >>> 0] = BigInt(i), 0;
	}
	var Ir = () => 4294901760;
	function Lr() {
		return Ir();
	}
	var Rr = (e) => {
		var t = (e - ne.buffer.byteLength + 65535) / 65536 | 0;
		try {
			return ne.grow(t), ce(), 1;
		} catch {}
	};
	function zr(e) {
		e >>>= 0;
		var t = re.length, n = Ir();
		if (e > n) return !1;
		for (var r = 1; r <= 4; r *= 2) {
			var i = t * (1 + .2 / r);
			if (i = Math.min(i, e + 100663296), Rr(Math.min(n, We(Math.max(e, i), 65536)))) return !0;
		}
		return !1;
	}
	var Br = {}, Vr = () => a || "./this.program", Hr = () => {
		if (!Hr.strings) {
			var e = {
				USER: "web_user",
				LOGNAME: "web_user",
				PATH: "/",
				PWD: "/",
				HOME: "/home/web_user",
				LANG: (typeof navigator == "object" && navigator.language || "C").replace("-", "_") + ".UTF-8",
				_: Vr()
			};
			for (var t in Br) Br[t] === void 0 ? delete e[t] : e[t] = Br[t];
			var n = [];
			for (var t in e) n.push(`${t}=${e[t]}`);
			Hr.strings = n;
		}
		return Hr.strings;
	};
	function Ur(e, t) {
		e >>>= 0, t >>>= 0;
		var n = 0, r = 0;
		for (var i of Hr()) {
			var a = t + n;
			b[e + r >>> 2 >>> 0] = a, n += lt(i, a, Infinity) + 1, r += 4;
		}
		return 0;
	}
	function Wr(e, t) {
		e >>>= 0, t >>>= 0;
		var n = Hr();
		b[e >>> 2 >>> 0] = n.length;
		var r = 0;
		for (var i of n) r += Re(i) + 1;
		return b[t >>> 2 >>> 0] = r, 0;
	}
	var Gr = () => !0, Kr = (e) => {
		Gr() || (m = !0), o(e, new pe(e));
	}, qr = (e, t) => {
		Kr(e);
	};
	function Jr(e) {
		try {
			var t = q.getStreamFromFD(e);
			return G.close(t), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function Yr(e, t) {
		t >>>= 0;
		try {
			var n = 0, r = 0, i = 0, a = q.getStreamFromFD(e), o = a.tty ? 2 : G.isDir(a.mode) ? 3 : G.isLink(a.mode) ? 7 : 4;
			return _[t >>> 0] = o, v[t + 2 >>> 1 >>> 0] = i, x[t + 8 >>> 3 >>> 0] = BigInt(n), x[t + 16 >>> 3 >>> 0] = BigInt(r), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	var Xr = (e, t, n, r) => {
		for (var i = 0, a = 0; a < n; a++) {
			var o = b[t >>> 2 >>> 0], s = b[t + 4 >>> 2 >>> 0];
			t += 8;
			var c = G.read(e, _, o, s, r);
			if (c < 0) return -1;
			if (i += c, c < s) break;
			r !== void 0 && (r += c);
		}
		return i;
	};
	function Zr(e, t, n, r, i) {
		t >>>= 0, n >>>= 0, r = j(r), i >>>= 0;
		try {
			if (isNaN(r)) return 61;
			var a = Xr(q.getStreamFromFD(e), t, n, r);
			return b[i >>> 2 >>> 0] = a, 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function Qr(e, t, n, r) {
		t >>>= 0, n >>>= 0, r >>>= 0;
		try {
			var i = Xr(q.getStreamFromFD(e), t, n);
			return b[r >>> 2 >>> 0] = i, 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function $r(e, t, n, r) {
		t = j(t), r >>>= 0;
		try {
			if (isNaN(t)) return 61;
			var i = q.getStreamFromFD(e);
			return G.llseek(i, t, n), x[r >>> 3 >>> 0] = BigInt(i.position), i.getdents && t === 0 && n === 0 && (i.getdents = null), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function ei(e) {
		try {
			var t = q.getStreamFromFD(e);
			return t.stream_ops?.fsync ? t.stream_ops.fsync(t) : 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	var ti = (e, t, n, r) => {
		for (var i = 0, a = 0; a < n; a++) {
			var o = b[t >>> 2 >>> 0], s = b[t + 4 >>> 2 >>> 0];
			t += 8;
			var c = G.write(e, _, o, s, r);
			if (c < 0) return -1;
			if (i += c, c < s) break;
			r !== void 0 && (r += c);
		}
		return i;
	};
	function ni(e, t, n, r) {
		t >>>= 0, n >>>= 0, r >>>= 0;
		try {
			var i = ti(q.getStreamFromFD(e), t, n);
			return b[r >>> 2 >>> 0] = i, 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	function ri(e) {
		return e >>>= 0, e;
	}
	function ii(e, t) {
		e >>>= 0, t >>>= 0;
		try {
			return Pe(re.subarray(e >>> 0, e + t >>> 0)), 0;
		} catch (e) {
			if (G === void 0 || e.name !== "ErrnoError") throw e;
			return e.errno;
		}
	}
	var ai = (e) => {
		let t = e.length;
		return [
			t % 128 | 128,
			t >> 7,
			...e
		];
	}, oi = {
		i: 127,
		p: 127,
		j: 126,
		f: 125,
		d: 124,
		e: 111
	}, si = (e) => ai(Array.from(e, (e) => oi[e])), ci = (e, t) => {
		var n = Uint8Array.of(0, 97, 115, 109, 1, 0, 0, 0, 1, ...ai([
			1,
			96,
			...si(t.slice(1)),
			...si(t[0] === "v" ? "" : t[0])
		]), 2, 7, 1, 1, 101, 1, 102, 0, 0, 7, 5, 1, 1, 102, 0, 0), r = new WebAssembly.Module(n);
		return new WebAssembly.Instance(r, { e: { f: e } }).exports.f;
	}, li = (e, t) => {
		if (ui) for (var n = e; n < e + t; n++) {
			var r = N(n);
			r && ui.set(r, n);
		}
	}, ui, di = (e) => (ui || (ui = /* @__PURE__ */ new WeakMap(), li(0, ve.length)), ui.get(e) || 0), fi = [], pi = () => fi.length ? fi.pop() : ve.grow(1), mi = (e, t) => {
		ve.set(e, t), M[e] = ve.get(e);
	};
	G.createPreloadedFile = $e, G.preloadFile = Qe, G.staticInit(), Jt(), gn(), n.wasmBinary && (ee = n.wasmBinary), n.addFunction = (e, t) => {
		var n = di(e);
		if (n) return n;
		var r = pi();
		try {
			mi(r, e);
		} catch (n) {
			if (!(n instanceof TypeError)) throw n;
			mi(r, ci(e, t));
		}
		return ui.set(e, r), r;
	}, n.setValue = he, n.getValue = me, n.UTF8ToString = K, n.stringToUTF8 = lt, n.lengthBytesUTF8 = Re, n.FS = G;
	var hi, gi, _i, vi, Q, yi, bi, xi, $, Si, Ci, wi;
	function Ti(e) {
		hi = e.tb, n._MagickColor_Create = e.ub, n._MagickColor_Dispose = e.vb, n._MagickColor_Count_Get = e.wb, n._MagickColor_Red_Get = e.xb, n._MagickColor_Red_Set = e.yb, n._MagickColor_Green_Get = e.zb, n._MagickColor_Green_Set = e.Ab, n._MagickColor_Blue_Get = e.Bb, n._MagickColor_Blue_Set = e.Cb, n._MagickColor_Alpha_Get = e.Db, n._MagickColor_Alpha_Set = e.Eb, n._MagickColor_Black_Get = e.Fb, n._MagickColor_Black_Set = e.Gb, n._MagickColor_IsCMYK_Get = e.Hb, n._MagickColor_IsCMYK_Set = e.Ib, n._MagickColor_Clone = e.Jb, n._MagickColor_FuzzyEquals = e.Kb, n._MagickColor_Initialize = e.Lb, n._MagickColorCollection_Create = e.Nb, n._MagickColorCollection_Dispose = e.Ob, n._MagickColorCollection_Get = e.Pb, n._MagickColorCollection_Set = e.Qb, n._DrawingWand_Create = e.Rb, n._DrawingWand_Dispose = e.Sb, n._DrawingWand_Affine = e.Tb, n._DrawingWand_Alpha = e.Ub, n._DrawingWand_Arc = e.Vb, n._DrawingWand_Bezier = e.Wb, n._DrawingWand_BorderColor = e.Xb, n._DrawingWand_Circle = e.Yb, n._DrawingWand_ClipPath = e.Zb, n._DrawingWand_ClipRule = e._b, n._DrawingWand_ClipUnits = e.$b, n._DrawingWand_Color = e.ac, n._DrawingWand_Composite = e.bc, n._DrawingWand_Density = e.cc, n._DrawingWand_Ellipse = e.dc, n._DrawingWand_FillColor = e.ec, n._DrawingWand_FillOpacity = e.fc, n._DrawingWand_FillPatternUrl = e.gc, n._DrawingWand_FillRule = e.hc, n._DrawingWand_Font = e.ic, n._DrawingWand_FontFamily = e.jc, n._DrawingWand_FontPointSize = e.kc, n._DrawingWand_FontTypeMetrics = e.lc, n._TypeMetric_Create = e.mc, n._DrawingWand_Gravity = e.nc, n._DrawingWand_Line = e.oc, n._DrawingWand_PathArcAbs = e.pc, n._DrawingWand_PathArcRel = e.qc, n._DrawingWand_PathClose = e.rc, n._DrawingWand_PathCurveToAbs = e.sc, n._DrawingWand_PathCurveToRel = e.tc, n._DrawingWand_PathFinish = e.uc, n._DrawingWand_PathLineToAbs = e.vc, n._DrawingWand_PathLineToHorizontalAbs = e.wc, n._DrawingWand_PathLineToHorizontalRel = e.xc, n._DrawingWand_PathLineToRel = e.yc, n._DrawingWand_PathLineToVerticalAbs = e.zc, n._DrawingWand_PathLineToVerticalRel = e.Ac, n._DrawingWand_PathMoveToAbs = e.Bc, n._DrawingWand_PathMoveToRel = e.Cc, n._DrawingWand_PathQuadraticCurveToAbs = e.Dc, n._DrawingWand_PathQuadraticCurveToRel = e.Ec, n._DrawingWand_PathSmoothCurveToAbs = e.Fc, n._DrawingWand_PathSmoothCurveToRel = e.Gc, n._DrawingWand_PathSmoothQuadraticCurveToAbs = e.Hc, n._DrawingWand_PathSmoothQuadraticCurveToRel = e.Ic, n._DrawingWand_PathStart = e.Jc, n._DrawingWand_Point = e.Kc, n._DrawingWand_Polygon = e.Lc, n._DrawingWand_Polyline = e.Mc, n._DrawingWand_PopClipPath = e.Nc, n._DrawingWand_PopGraphicContext = e.Oc, n._DrawingWand_PopPattern = e.Pc, n._DrawingWand_PushClipPath = e.Qc, n._DrawingWand_PushGraphicContext = e.Rc, n._DrawingWand_PushPattern = e.Sc, n._DrawingWand_Rectangle = e.Tc, n._DrawingWand_Render = e.Uc, n._DrawingWand_Rotation = e.Vc, n._DrawingWand_RoundRectangle = e.Wc, n._DrawingWand_Scaling = e.Xc, n._DrawingWand_SkewX = e.Yc, n._DrawingWand_SkewY = e.Zc, n._DrawingWand_StrokeAntialias = e._c, n._DrawingWand_StrokeColor = e.$c, n._DrawingWand_StrokeDashArray = e.ad, n._DrawingWand_StrokeDashOffset = e.bd, n._DrawingWand_StrokeLineCap = e.cd, n._DrawingWand_StrokeLineJoin = e.dd, n._DrawingWand_StrokeMiterLimit = e.ed, n._DrawingWand_StrokeOpacity = e.fd, n._DrawingWand_StrokePatternUrl = e.gd, n._DrawingWand_StrokeWidth = e.hd, n._DrawingWand_Text = e.id, n._DrawingWand_TextAlignment = e.jd, n._DrawingWand_TextAntialias = e.kd, n._DrawingWand_TextDecoration = e.ld, n._DrawingWand_TextDirection = e.md, n._DrawingWand_TextEncoding = e.nd, n._DrawingWand_TextInterlineSpacing = e.od, n._DrawingWand_TextInterwordSpacing = e.pd, n._DrawingWand_TextKerning = e.qd, n._DrawingWand_TextUnderColor = e.rd, n._DrawingWand_Translation = e.sd, n._DrawingWand_Viewbox = e.td, n._MagickExceptionHelper_Description = e.ud, n._MagickExceptionHelper_Dispose = e.vd, n._MagickExceptionHelper_Related = e.wd, n._MagickExceptionHelper_RelatedCount = e.xd, n._MagickExceptionHelper_Message = e.yd, n._MagickExceptionHelper_Severity = e.zd, n._PdfInfo_PageCount = e.Ad, n._Environment_Initialize = e.Bd, n._Environment_GetEnv = e.Cd, n._Environment_SetEnv = e.Dd, n._MagickMemory_Relinquish = e.Ed, n._Magick_Delegates_Get = e.Fd, n._Magick_Features_Get = e.Gd, n._Magick_ImageMagickVersion_Get = e.Hd, n._Magick_GetFonts = e.Id, n._Magick_GetFontFamily = e.Jd, n._Magick_GetFontName = e.Kd, n._Magick_GetWindowsResource = e.Ld, n._Magick_DisposeFonts = e.Md, n._Magick_ResetRandomSeed = e.Nd, n._Magick_SetDefaultFontFile = e.Od, n._Magick_SetRandomSeed = e.Pd, n._Magick_SetLogDelegate = e.Qd, n._Magick_SetLogEvents = e.Rd, n._MagickFormatInfo_CreateList = e.Sd, n._MagickFormatInfo_DisposeList = e.Td, n._MagickFormatInfo_CanReadMultithreaded_Get = e.Ud, n._MagickFormatInfo_CanWriteMultithreaded_Get = e.Vd, n._MagickFormatInfo_Description_Get = e.Wd, n._MagickFormatInfo_Format_Get = e.Xd, n._MagickFormatInfo_MimeType_Get = e.Yd, n._MagickFormatInfo_Module_Get = e.Zd, n._MagickFormatInfo_SupportsMultipleFrames_Get = e._d, n._MagickFormatInfo_SupportsReading_Get = e.$d, n._MagickFormatInfo_SupportsWriting_Get = e.ae, n._MagickFormatInfo_Version_Get = e.be, n._MagickFormatInfo_GetInfo = e.ce, n._MagickFormatInfo_GetInfoByName = e.de, n._MagickFormatInfo_GetInfoWithBlob = e.ee, n._MagickFormatInfo_Unregister = e.fe, n._MagickImage_Create = e.ge, n._MagickImage_Dispose = e.he, n._MagickImage_AnimationDelay_Get = e.ie, n._MagickImage_AnimationDelay_Set = e.je, n._MagickImage_AnimationIterations_Get = e.ke, n._MagickImage_AnimationIterations_Set = e.le, n._MagickImage_AnimationTicksPerSecond_Get = e.me, n._MagickImage_AnimationTicksPerSecond_Set = e.ne, n._MagickImage_BackgroundColor_Get = e.oe, n._MagickImage_BackgroundColor_Set = e.pe, n._MagickImage_BaseHeight_Get = e.qe, n._MagickImage_BaseWidth_Get = e.re, n._MagickImage_BlackPointCompensation_Get = e.se, n._MagickImage_BlackPointCompensation_Set = e.te, n._MagickImage_BorderColor_Get = e.ue, n._MagickImage_BorderColor_Set = e.ve, n._MagickImage_BoundingBox_Get = e.we, n._MagickRectangle_Create = e.xe, n._MagickImage_ChannelCount_Get = e.ye, n._MagickImage_ChromaBlue_Get = e.ze, n._PrimaryInfo_Create = e.Ae, n._MagickImage_ChromaBlue_Set = e.Be, n._MagickImage_ChromaGreen_Get = e.Ce, n._MagickImage_ChromaGreen_Set = e.De, n._MagickImage_ChromaRed_Get = e.Ee, n._MagickImage_ChromaRed_Set = e.Fe, n._MagickImage_ChromaWhite_Get = e.Ge, n._MagickImage_ChromaWhite_Set = e.He, n._MagickImage_ClassType_Get = e.Ie, n._MagickImage_ClassType_Set = e.Je, n._QuantizeSettings_Create = e.Ke, n._QuantizeSettings_Dispose = e.Le, n._MagickImage_ColorFuzz_Get = e.Me, n._MagickImage_ColorFuzz_Set = e.Ne, n._MagickImage_ColormapSize_Get = e.Oe, n._MagickImage_ColormapSize_Set = e.Pe, n._MagickImage_ColorSpace_Get = e.Qe, n._MagickImage_ColorSpace_Set = e.Re, n._MagickImage_ColorType_Get = e.Se, n._MagickImage_ColorType_Set = e.Te, n._MagickImage_Compose_Get = e.Ue, n._MagickImage_Compose_Set = e.Ve, n._MagickImage_Compression_Get = e.We, n._MagickImage_Compression_Set = e.Xe, n._MagickImage_Depth_Get = e.Ye, n._MagickImage_Depth_Set = e.Ze, n._MagickImage_EncodingGeometry_Get = e._e, n._MagickImage_Endian_Get = e.$e, n._MagickImage_Endian_Set = e.af, n._MagickImage_FileName_Get = e.bf, n._MagickImage_FileName_Set = e.cf, n._MagickImage_FilterType_Get = e.df, n._MagickImage_FilterType_Set = e.ef, n._MagickImage_Format_Get = e.ff, n._MagickImage_Format_Set = e.gf, n._MagickImage_Gamma_Get = e.hf, n._MagickImage_GifDisposeMethod_Get = e.jf, n._MagickImage_GifDisposeMethod_Set = e.kf, n._MagickImage_HasAlpha_Get = e.lf, n._MagickImage_HasAlpha_Set = e.mf, n._MagickImage_Height_Get = e.nf, n._MagickImage_Interlace_Get = e.of, n._MagickImage_Interlace_Set = e.pf, n._MagickImage_Interpolate_Get = e.qf, n._MagickImage_Interpolate_Set = e.rf, n._MagickImage_IsOpaque_Get = e.sf, n._MagickImage_MatteColor_Get = e.tf, n._MagickImage_MatteColor_Set = e.uf, n._MagickImage_MeanErrorPerPixel_Get = e.vf, n._MagickImage_MetaChannelCount_Get = e.wf, n._MagickImage_MetaChannelCount_Set = e.xf, n._MagickImage_NormalizedMaximumError_Get = e.yf, n._MagickImage_NormalizedMeanError_Get = e.zf, n._MagickImage_Orientation_Get = e.Af, n._MagickImage_Orientation_Set = e.Bf, n._MagickImage_Page_Get = e.Cf, n._MagickImage_Page_Set = e.Df, n._MagickImage_Quality_Get = e.Ef, n._MagickImage_Quality_Set = e.Ff, n._MagickImage_RenderingIntent_Get = e.Gf, n._MagickImage_RenderingIntent_Set = e.Hf, n._MagickImage_ResolutionUnits_Get = e.If, n._MagickImage_ResolutionUnits_Set = e.Jf, n._MagickImage_ResolutionX_Get = e.Kf, n._MagickImage_ResolutionX_Set = e.Lf, n._MagickImage_ResolutionY_Get = e.Mf, n._MagickImage_ResolutionY_Set = e.Nf, n._MagickImage_Signature_Get = e.Of, n._MagickImage_TotalColors_Get = e.Pf, n._MagickImage_VirtualPixelMethod_Get = e.Qf, n._MagickImage_VirtualPixelMethod_Set = e.Rf, n._MagickImage_Width_Get = e.Sf, n._MagickImage_AdaptiveBlur = e.Tf, n._MagickImage_AdaptiveResize = e.Uf, n._MagickImage_AdaptiveSharpen = e.Vf, n._MagickImage_AdaptiveThreshold = e.Wf, n._MagickImage_AddNoise = e.Xf, n._MagickImage_AffineTransform = e.Yf, n._MagickImage_Annotate = e.Zf, n._MagickImage_AutoGamma = e._f, n._MagickImage_AutoLevel = e.$f, n._MagickImage_AutoOrient = e.ag, n._MagickImage_AutoThreshold = e.bg, n._MagickImage_BilateralBlur = e.cg, n._MagickImage_BlackThreshold = e.dg, n._MagickImage_BlueShift = e.eg, n._MagickImage_Blur = e.fg, n._MagickImage_Border = e.gg, n._MagickImage_BrightnessContrast = e.hg, n._MagickImage_CannyEdge = e.ig, n._MagickImage_ChannelOffset = e.jg, n._MagickImage_Charcoal = e.kg, n._MagickImage_Chop = e.lg, n._MagickImage_Clahe = e.mg, n._MagickImage_Clamp = e.ng, n._MagickImage_ClipPath = e.og, n._MagickImage_Clone = e.pg, n._MagickImage_CloneArea = e.qg, n._MagickImage_Clut = e.rg, n._MagickImage_ColorDecisionList = e.sg, n._MagickImage_Colorize = e.tg, n._MagickImage_ColorMatrix = e.ug, n._MagickImage_ColorThreshold = e.vg, n._MagickImage_Compare = e.wg, n._MagickImage_CompareDistortion = e.xg, n._MagickImage_Composite = e.yg, n._MagickImage_CompositeGravity = e.zg, n._MagickImage_ConnectedComponents = e.Ag, n._MagickImage_Contrast = e.Bg, n._MagickImage_ContrastStretch = e.Cg, n._MagickImage_ConvexHull = e.Dg, n._MagickImage_Convolve = e.Eg, n._MagickImage_CopyPixels = e.Fg, n._MagickImage_Crop = e.Gg, n._MagickImage_CropToTiles = e.Hg, n._MagickImage_CycleColormap = e.Ig, n._MagickImage_Decipher = e.Jg, n._MagickImage_Deskew = e.Kg, n._MagickImage_Despeckle = e.Lg, n._MagickImage_DetermineBitDepth = e.Mg, n._MagickImage_DetermineColorType = e.Ng, n._MagickImage_Distort = e.Og, n._MagickImage_Edge = e.Pg, n._MagickImage_Emboss = e.Qg, n._MagickImage_Encipher = e.Rg, n._MagickImage_Enhance = e.Sg, n._MagickImage_Equalize = e.Tg, n._MagickImage_Equals = e.Ug, n._MagickImage_EvaluateFunction = e.Vg, n._MagickImage_EvaluateGeometry = e.Wg, n._MagickImage_EvaluateOperator = e.Xg, n._MagickImage_Extent = e.Yg, n._MagickImage_Flip = e.Zg, n._MagickImage_FloodFill = e._g, n._MagickImage_Flop = e.$g, n._MagickImage_FontTypeMetrics = e.ah, n._MagickImage_FormatExpression = e.bh, n._MagickImage_Frame = e.ch, n._MagickImage_Fx = e.dh, n._MagickImage_GammaCorrect = e.eh, n._MagickImage_GaussianBlur = e.fh, n._MagickImage_GetArtifact = e.gh, n._MagickImage_GetAttribute = e.hh, n._MagickImage_GetColormapColor = e.ih, n._MagickImage_GetNext = e.jh, n._MagickImage_GetNextArtifactName = e.kh, n._MagickImage_GetNextAttributeName = e.lh, n._MagickImage_GetNextProfileName = e.mh, n._MagickImage_GetProfile = e.nh, n._MagickImage_GetReadMask = e.oh, n._MagickImage_GetWriteMask = e.ph, n._MagickImage_Grayscale = e.qh, n._MagickImage_HaldClut = e.rh, n._MagickImage_HasChannel = e.sh, n._MagickImage_HasProfile = e.th, n._MagickImage_Histogram = e.uh, n._MagickImage_HoughLine = e.vh, n._MagickImage_Implode = e.wh, n._MagickImage_ImportIndexedPixels = e.xh, n._MagickImage_ImportPixels = e.yh, n._MagickImage_Integral = e.zh, n._MagickImage_InterpolativeResize = e.Ah, n._MagickImage_InverseLevel = e.Bh, n._MagickImage_Kmeans = e.Ch, n._MagickImage_Kuwahara = e.Dh, n._MagickImage_Level = e.Eh, n._MagickImage_LevelColors = e.Fh, n._MagickImage_LinearStretch = e.Gh, n._MagickImage_LiquidRescale = e.Hh, n._MagickImage_LocalContrast = e.Ih, n._MagickImage_Magnify = e.Jh, n._MagickImage_MeanShift = e.Kh, n._MagickImage_Minify = e.Lh, n._MagickImage_MinimumBoundingBox = e.Mh, n._MagickImage_Modulate = e.Nh, n._MagickImage_Moments = e.Oh, n._MagickImage_Morphology = e.Ph, n._MagickImage_MotionBlur = e.Qh, n._MagickImage_Negate = e.Rh, n._MagickImage_Normalize = e.Sh, n._MagickImage_OilPaint = e.Th, n._MagickImage_Opaque = e.Uh, n._MagickImage_OrderedDither = e.Vh, n._MagickImage_Perceptible = e.Wh, n._MagickImage_PerceptualHash = e.Xh, n._MagickImage_Quantize = e.Yh, n._MagickImage_Polaroid = e.Zh, n._MagickImage_Posterize = e._h, n._MagickImage_RaiseOrLower = e.$h, n._MagickImage_RandomThreshold = e.ai, n._MagickImage_RangeThreshold = e.bi, n._MagickImage_ReadBlob = e.ci, n._MagickImage_ReadFile = e.di, n._MagickImage_ReadPixels = e.ei, n._MagickImage_ReadStream = e.fi, n._MagickImage_RegionMask = e.gi, n._MagickImage_Remap = e.hi, n._MagickImage_RemoveArtifact = e.ii, n._MagickImage_RemoveAttribute = e.ji, n._MagickImage_RemoveProfile = e.ki, n._MagickImage_ResetArtifactIterator = e.li, n._MagickImage_ResetAttributeIterator = e.mi, n._MagickImage_ResetProfileIterator = e.ni, n._MagickImage_Resample = e.oi, n._MagickImage_Resize = e.pi, n._MagickImage_Roll = e.qi, n._MagickImage_Rotate = e.ri, n._MagickImage_RotationalBlur = e.si, n._MagickImage_Sample = e.ti, n._MagickImage_Scale = e.ui, n._MagickImage_Segment = e.vi, n._MagickImage_SelectiveBlur = e.wi, n._MagickImage_Separate = e.xi, n._MagickImage_SepiaTone = e.yi, n._MagickImage_SetAlpha = e.zi, n._MagickImage_SetArtifact = e.Ai, n._MagickImage_SetAttribute = e.Bi, n._MagickImage_SetBitDepth = e.Ci, n._MagickImage_SetClientData = e.Di, n._MagickImage_SetColormapColor = e.Ei, n._MagickImage_SetColorMetric = e.Fi, n._MagickImage_SetNext = e.Gi, n._MagickImage_SetProfile = e.Hi, n._MagickImage_SetProgressDelegate = e.Ii, n._MagickImage_SetReadMask = e.Ji, n._MagickImage_SetWriteMask = e.Ki, n._MagickImage_Shade = e.Li, n._MagickImage_Shadow = e.Mi, n._MagickImage_Sharpen = e.Ni, n._MagickImage_Shave = e.Oi, n._MagickImage_Shear = e.Pi, n._MagickImage_SigmoidalContrast = e.Qi, n._MagickImage_SparseColor = e.Ri, n._MagickImage_Spread = e.Si, n._MagickImage_Sketch = e.Ti, n._MagickImage_Solarize = e.Ui, n._MagickImage_SortPixels = e.Vi, n._MagickImage_Splice = e.Wi, n._MagickImage_Statistic = e.Xi, n._MagickImage_Statistics = e.Yi, n._MagickImage_Stegano = e.Zi, n._MagickImage_Stereo = e._i, n._MagickImage_Strip = e.$i, n._MagickImage_SubImageSearch = e.aj, n._MagickImage_Swirl = e.bj, n._MagickImage_Texture = e.cj, n._MagickImage_Threshold = e.dj, n._MagickImage_Thumbnail = e.ej, n._MagickImage_Tint = e.fj, n._MagickImage_Transparent = e.gj, n._MagickImage_TransparentChroma = e.hj, n._MagickImage_Transpose = e.ij, n._MagickImage_Transverse = e.jj, n._MagickImage_Trim = e.kj, n._MagickImage_UniqueColors = e.lj, n._MagickImage_UnsharpMask = e.mj, n._MagickImage_Vignette = e.nj, n._MagickImage_Wave = e.oj, n._MagickImage_WaveletDenoise = e.pj, n._MagickImage_WhiteBalance = e.qj, n._MagickImage_WhiteThreshold = e.rj, n._MagickImage_WriteBlob = e.sj, n._MagickImage_WriteFile = e.tj, n._MagickImage_WriteStream = e.uj, n._MagickImageCollection_Append = e.vj, n._MagickImageCollection_Coalesce = e.wj, n._MagickImageCollection_Combine = e.xj, n._MagickImageCollection_Complex = e.yj, n._MagickImageCollection_Deconstruct = e.zj, n._MagickImageCollection_Dispose = e.Aj, n._MagickImageCollection_Evaluate = e.Bj, n._MagickImageCollection_Fx = e.Cj, n._MagickImageCollection_Merge = e.Dj, n._MagickImageCollection_Montage = e.Ej, n._MagickImageCollection_Morph = e.Fj, n._MagickImageCollection_Optimize = e.Gj, n._MagickImageCollection_OptimizePlus = e.Hj, n._MagickImageCollection_OptimizeTransparency = e.Ij, n._MagickImageCollection_Polynomial = e.Jj, n._MagickImageCollection_Quantize = e.Kj, n._MagickImageCollection_ReadBlob = e.Lj, n._MagickImageCollection_ReadFile = e.Mj, n._MagickImageCollection_ReadStream = e.Nj, n._MagickImageCollection_Remap = e.Oj, n._MagickImageCollection_Smush = e.Pj, n._MagickImageCollection_WriteFile = e.Qj, n._MagickImageCollection_WriteStream = e.Rj, n._DoubleMatrix_Create = e.Sj, n._DoubleMatrix_Dispose = e.Tj, n._OpenCL_GetDevices = e.Uj, n._OpenCL_GetDevice = e.Vj, n._OpenCL_GetEnabled = e.Wj, n._OpenCL_SetEnabled = e.Xj, n._OpenCLDevice_DeviceType_Get = e.Yj, n._OpenCLDevice_BenchmarkScore_Get = e.Zj, n._OpenCLDevice_IsEnabled_Get = e._j, n._OpenCLDevice_IsEnabled_Set = e.$j, n._OpenCLDevice_Name_Get = e.ak, n._OpenCLDevice_Version_Get = e.bk, n._OpenCLDevice_GetKernelProfileRecords = e.ck, n._OpenCLDevice_GetKernelProfileRecord = e.dk, n._OpenCLDevice_SetProfileKernels = e.ek, n._OpenCLKernelProfileRecord_Count_Get = e.fk, n._OpenCLKernelProfileRecord_Name_Get = e.gk, n._OpenCLKernelProfileRecord_MaximumDuration_Get = e.hk, n._OpenCLKernelProfileRecord_MinimumDuration_Get = e.ik, n._OpenCLKernelProfileRecord_TotalDuration_Get = e.jk, n._JpegOptimizer_CompressFile = e.kk, n._JpegOptimizer_CompressStream = e.lk, n._malloc = gi = e.mk, n._free = _i = e.nk, n._PixelCollection_Create = e.ok, n._PixelCollection_Dispose = e.pk, n._PixelCollection_GetArea = e.qk, n._PixelCollection_GetReadOnlyArea = e.rk, n._PixelCollection_SetArea = e.sk, n._PixelCollection_ToByteArray = e.tk, n._PixelCollection_ToShortArray = e.uk, n._Quantum_Depth_Get = e.vk, n._Quantum_Max_Get = e.wk, n._ResourceLimits_Area_Get = e.xk, n._ResourceLimits_Area_Set = e.yk, n._ResourceLimits_Disk_Get = e.zk, n._ResourceLimits_Disk_Set = e.Ak, n._ResourceLimits_Height_Get = e.Bk, n._ResourceLimits_Height_Set = e.Ck, n._ResourceLimits_ListLength_Get = e.Dk, n._ResourceLimits_ListLength_Set = e.Ek, n._ResourceLimits_MaxMemoryRequest_Get = e.Fk, n._ResourceLimits_MaxMemoryRequest_Set = e.Gk, n._ResourceLimits_MaxProfileSize_Get = e.Hk, n._ResourceLimits_MaxProfileSize_Set = e.Ik, n._ResourceLimits_Memory_Get = e.Jk, n._ResourceLimits_Memory_Set = e.Kk, n._ResourceLimits_Thread_Get = e.Lk, n._ResourceLimits_Thread_Set = e.Mk, n._ResourceLimits_Throttle_Get = e.Nk, n._ResourceLimits_Throttle_Set = e.Ok, n._ResourceLimits_Time_Get = e.Pk, n._ResourceLimits_Time_Set = e.Qk, n._ResourceLimits_Width_Get = e.Rk, n._ResourceLimits_Width_Set = e.Sk, n._ResourceLimits_LimitMemory = e.Tk, n._ResourceLimits_TrimMemory = e.Uk, n._DrawingSettings_Create = e.Vk, n._DrawingSettings_Dispose = e.Wk, n._DrawingSettings_BorderColor_Get = e.Xk, n._DrawingSettings_BorderColor_Set = e.Yk, n._DrawingSettings_FillColor_Get = e.Zk, n._DrawingSettings_FillColor_Set = e._k, n._DrawingSettings_FillRule_Get = e.$k, n._DrawingSettings_FillRule_Set = e.al, n._DrawingSettings_Font_Get = e.bl, n._DrawingSettings_Font_Set = e.cl, n._DrawingSettings_FontFamily_Get = e.dl, n._DrawingSettings_FontFamily_Set = e.el, n._DrawingSettings_FontPointsize_Get = e.fl, n._DrawingSettings_FontPointsize_Set = e.gl, n._DrawingSettings_FontStyle_Get = e.hl, n._DrawingSettings_FontStyle_Set = e.il, n._DrawingSettings_FontWeight_Get = e.jl, n._DrawingSettings_FontWeight_Set = e.kl, n._DrawingSettings_StrokeAntiAlias_Get = e.ll, n._DrawingSettings_StrokeAntiAlias_Set = e.ml, n._DrawingSettings_StrokeColor_Get = e.nl, n._DrawingSettings_StrokeColor_Set = e.ol, n._DrawingSettings_StrokeDashOffset_Get = e.pl, n._DrawingSettings_StrokeDashOffset_Set = e.ql, n._DrawingSettings_StrokeLineCap_Get = e.rl, n._DrawingSettings_StrokeLineCap_Set = e.sl, n._DrawingSettings_StrokeLineJoin_Get = e.tl, n._DrawingSettings_StrokeLineJoin_Set = e.ul, n._DrawingSettings_StrokeMiterLimit_Get = e.vl, n._DrawingSettings_StrokeMiterLimit_Set = e.wl, n._DrawingSettings_StrokeWidth_Get = e.xl, n._DrawingSettings_StrokeWidth_Set = e.yl, n._DrawingSettings_TextAntiAlias_Get = e.zl, n._DrawingSettings_TextAntiAlias_Set = e.Al, n._DrawingSettings_TextDirection_Get = e.Bl, n._DrawingSettings_TextDirection_Set = e.Cl, n._DrawingSettings_TextEncoding_Get = e.Dl, n._DrawingSettings_TextEncoding_Set = e.El, n._DrawingSettings_TextGravity_Get = e.Fl, n._DrawingSettings_TextGravity_Set = e.Gl, n._DrawingSettings_TextInterlineSpacing_Get = e.Hl, n._DrawingSettings_TextInterlineSpacing_Set = e.Il, n._DrawingSettings_TextInterwordSpacing_Get = e.Jl, n._DrawingSettings_TextInterwordSpacing_Set = e.Kl, n._DrawingSettings_TextKerning_Get = e.Ll, n._DrawingSettings_TextKerning_Set = e.Ml, n._DrawingSettings_TextUnderColor_Get = e.Nl, n._DrawingSettings_TextUnderColor_Set = e.Ol, n._DrawingSettings_SetAffine = e.Pl, n._DrawingSettings_SetFillPattern = e.Ql, n._DrawingSettings_SetStrokeDashArray = e.Rl, n._DrawingSettings_SetStrokePattern = e.Sl, n._DrawingSettings_SetText = e.Tl, n._MagickSettings_Create = e.Ul, n._MagickSettings_Dispose = e.Vl, n._MagickSettings_AntiAlias_Get = e.Wl, n._MagickSettings_AntiAlias_Set = e.Xl, n._MagickSettings_BackgroundColor_Get = e.Yl, n._MagickSettings_BackgroundColor_Set = e.Zl, n._MagickSettings_ColorSpace_Get = e._l, n._MagickSettings_ColorSpace_Set = e.$l, n._MagickSettings_ColorType_Get = e.am, n._MagickSettings_ColorType_Set = e.bm, n._MagickSettings_Compression_Get = e.cm, n._MagickSettings_Compression_Set = e.dm, n._MagickSettings_Debug_Get = e.em, n._MagickSettings_Debug_Set = e.fm, n._MagickSettings_Density_Get = e.gm, n._MagickSettings_Density_Set = e.hm, n._MagickSettings_Depth_Get = e.im, n._MagickSettings_Depth_Set = e.jm, n._MagickSettings_Endian_Get = e.km, n._MagickSettings_Endian_Set = e.lm, n._MagickSettings_Extract_Get = e.mm, n._MagickSettings_Extract_Set = e.nm, n._MagickSettings_Format_Get = e.om, n._MagickSettings_Format_Set = e.pm, n._MagickSettings_FontPointsize_Get = e.qm, n._MagickSettings_FontPointsize_Set = e.rm, n._MagickSettings_Interlace_Get = e.sm, n._MagickSettings_Interlace_Set = e.tm, n._MagickSettings_Monochrome_Get = e.um, n._MagickSettings_Monochrome_Set = e.vm, n._MagickSettings_Verbose_Get = e.wm, n._MagickSettings_Verbose_Set = e.xm, n._MagickSettings_SetColorFuzz = e.ym, n._MagickSettings_SetFileName = e.zm, n._MagickSettings_SetFont = e.Am, n._MagickSettings_SetNumberScenes = e.Bm, n._MagickSettings_SetOption = e.Cm, n._MagickSettings_SetPage = e.Dm, n._MagickSettings_SetPing = e.Em, n._MagickSettings_SetQuality = e.Fm, n._MagickSettings_SetScenes = e.Gm, n._MagickSettings_SetScene = e.Hm, n._MagickSettings_SetSize = e.Im, n._MontageSettings_Create = e.Jm, n._MontageSettings_Dispose = e.Km, n._MontageSettings_SetBackgroundColor = e.Lm, n._MontageSettings_SetBorderColor = e.Mm, n._MontageSettings_SetBorderWidth = e.Nm, n._MontageSettings_SetFillColor = e.Om, n._MontageSettings_SetFont = e.Pm, n._MontageSettings_SetFontPointsize = e.Qm, n._MontageSettings_SetFrameGeometry = e.Rm, n._MontageSettings_SetGeometry = e.Sm, n._MontageSettings_SetGravity = e.Tm, n._MontageSettings_SetShadow = e.Um, n._MontageSettings_SetStrokeColor = e.Vm, n._MontageSettings_SetTextureFileName = e.Wm, n._MontageSettings_SetTileGeometry = e.Xm, n._MontageSettings_SetTitle = e.Ym, n._QuantizeSettings_SetColors = e.Zm, n._QuantizeSettings_SetColorSpace = e._m, n._QuantizeSettings_SetDitherMethod = e.$m, n._QuantizeSettings_SetMeasureErrors = e.an, n._QuantizeSettings_SetTreeDepth = e.bn, n._ChannelMoments_Centroid_Get = e.cn, n._ChannelMoments_EllipseAngle_Get = e.dn, n._ChannelMoments_EllipseAxis_Get = e.en, n._ChannelMoments_EllipseEccentricity_Get = e.fn, n._ChannelMoments_EllipseIntensity_Get = e.gn, n._ChannelMoments_GetHuInvariants = e.hn, n._ChannelPerceptualHash_GetHuPhash = e.jn, n._ChannelStatistics_Depth_Get = e.kn, n._ChannelStatistics_Entropy_Get = e.ln, n._ChannelStatistics_Kurtosis_Get = e.mn, n._ChannelStatistics_Maximum_Get = e.nn, n._ChannelStatistics_Mean_Get = e.on, n._ChannelStatistics_Minimum_Get = e.pn, n._ChannelStatistics_Skewness_Get = e.qn, n._ChannelStatistics_StandardDeviation_Get = e.rn, n._Moments_DisposeList = e.sn, n._Moments_GetInstance = e.tn, n._PerceptualHash_DisposeList = e.un, n._PerceptualHash_GetInstance = e.vn, n._Statistics_DisposeList = e.wn, n._Statistics_GetInstance = e.xn, n._ConnectedComponent_DisposeList = e.yn, n._ConnectedComponent_GetArea = e.zn, n._ConnectedComponent_GetCentroid = e.An, n._ConnectedComponent_GetColor = e.Bn, n._ConnectedComponent_GetHeight = e.Cn, n._ConnectedComponent_GetId = e.Dn, n._ConnectedComponent_GetWidth = e.En, n._ConnectedComponent_GetX = e.Fn, n._ConnectedComponent_GetY = e.Gn, n._ConnectedComponent_GetInstance = e.Hn, n._MagickGeometry_Create = e.In, n._MagickGeometry_Dispose = e.Jn, n._MagickGeometry_X_Get = e.Kn, n._MagickGeometry_Y_Get = e.Ln, n._MagickGeometry_Width_Get = e.Mn, n._MagickGeometry_Height_Get = e.Nn, n._MagickGeometry_Initialize = e.On, n._MagickRectangle_Dispose = e.Pn, n._MagickRectangle_X_Get = e.Qn, n._MagickRectangle_X_Set = e.Rn, n._MagickRectangle_Y_Get = e.Sn, n._MagickRectangle_Y_Set = e.Tn, n._MagickRectangle_Width_Get = e.Un, n._MagickRectangle_Width_Set = e.Vn, n._MagickRectangle_Height_Get = e.Wn, n._MagickRectangle_Height_Set = e.Xn, n._MagickRectangle_FromPageSize = e.Yn, n._OffsetInfo_Create = e.Zn, n._OffsetInfo_Dispose = e._n, n._OffsetInfo_SetX = e.$n, n._OffsetInfo_SetY = e.ao, n._PointInfo_X_Get = e.bo, n._PointInfo_Y_Get = e.co, n._PointInfoCollection_Create = e.eo, n._PointInfoCollection_Dispose = e.fo, n._PointInfoCollection_GetX = e.go, n._PointInfoCollection_GetY = e.ho, n._PointInfoCollection_Set = e.io, n._PrimaryInfo_Dispose = e.jo, n._PrimaryInfo_X_Get = e.ko, n._PrimaryInfo_X_Set = e.lo, n._PrimaryInfo_Y_Get = e.mo, n._PrimaryInfo_Y_Set = e.no, n._PrimaryInfo_Z_Get = e.oo, n._PrimaryInfo_Z_Set = e.po, n._StringInfo_Length_Get = e.qo, n._StringInfo_Datum_Get = e.ro, n._TypeMetric_Dispose = e.so, n._TypeMetric_Ascent_Get = e.to, n._TypeMetric_Descent_Get = e.uo, n._TypeMetric_MaxHorizontalAdvance_Get = e.vo, n._TypeMetric_TextHeight_Get = e.wo, n._TypeMetric_TextWidth_Get = e.xo, n._TypeMetric_UnderlinePosition_Get = e.yo, n._TypeMetric_UnderlineThickness_Get = e.zo, vi = e.Ao, Q = e.Bo, yi = e.Co, bi = e.Do, xi = e.Eo, $ = e.Fo, Si = e.Go, Ci = e.Ho, wi = e.Io;
	}
	var Ei = {
		lb: ye,
		s: Se,
		w: F,
		g: Ee,
		j: De,
		Qa: Oe,
		fa: ke,
		b: Ae,
		ra: je,
		i: Me,
		Ja: et,
		Ha: tt,
		Ka: nt,
		ob: rt,
		Ga: it,
		X: st,
		Fa: ct,
		Aa: ut,
		kb: dt,
		Na: ft,
		Ca: pt,
		Da: mt,
		V: ht,
		jb: gt,
		gb: _t,
		ib: vt,
		Ea: yt,
		fb: bt,
		ta: xt,
		La: St,
		Za: jt,
		ia: It,
		Wa: Lt,
		aa: Tn,
		Ua: An,
		H: Mn,
		h: Pn,
		ha: In,
		q: Un,
		F: Wn,
		v: Gn,
		Va: Kn,
		Z: er,
		_a: tr,
		$: nr,
		Xa: rr,
		mb: ir,
		db: ar,
		bb: or,
		B: pr,
		u: Dn,
		Ya: mr,
		A: hr,
		_: gr,
		I: _r,
		P: vr,
		z: yr,
		G: br,
		ua: xr,
		va: Er,
		wa: Dr,
		pb: Or,
		qb: kr,
		xa: Ar,
		Ia: Fr,
		da: Mr,
		eb: Lr,
		U: jr,
		cb: zr,
		Oa: Ur,
		Pa: Wr,
		J: qr,
		L: Jr,
		ca: Yr,
		nb: Zr,
		ea: Qr,
		ya: $r,
		Ba: ei,
		W: ni,
		ba: Gi,
		oa: pa,
		pa: fa,
		r: Bi,
		Q: Qi,
		a: Ai,
		c: ki,
		f: Oi,
		k: Pi,
		ab: ua,
		D: Wi,
		d: Ri,
		N: qi,
		t: Li,
		$a: Ji,
		ka: Zi,
		M: na,
		qa: la,
		Ta: ra,
		E: zi,
		na: Hi,
		O: sa,
		Y: ia,
		C: Ii,
		T: da,
		hb: Fi,
		p: ta,
		n: ji,
		e: Mi,
		R: Yi,
		la: Xi,
		m: Di,
		l: Ni,
		x: Ki,
		o: Vi,
		y: ea,
		Sa: aa,
		ja: $i,
		K: ma,
		Ra: oa,
		S: ha,
		sa: ca,
		ma: Ui,
		ga: ri,
		Ma: Kr,
		za: ii
	};
	function Di(e, t, n, r) {
		var i = A();
		try {
			N(e)(t, n, r);
		} catch (e) {
			if (k(i), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Oi(e, t, n, r) {
		var i = A();
		try {
			return N(e)(t, n, r);
		} catch (e) {
			if (k(i), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ki(e, t, n) {
		var r = A();
		try {
			return N(e)(t, n);
		} catch (e) {
			if (k(r), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Ai(e, t) {
		var n = A();
		try {
			return N(e)(t);
		} catch (e) {
			if (k(n), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ji(e, t) {
		var n = A();
		try {
			N(e)(t);
		} catch (e) {
			if (k(n), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Mi(e, t, n) {
		var r = A();
		try {
			N(e)(t, n);
		} catch (e) {
			if (k(r), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Ni(e, t, n, r, i) {
		var a = A();
		try {
			N(e)(t, n, r, i);
		} catch (e) {
			if (k(a), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Pi(e, t, n, r, i) {
		var a = A();
		try {
			return N(e)(t, n, r, i);
		} catch (e) {
			if (k(a), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Fi(e, t, n, r) {
		var i = A();
		try {
			return N(e)(t, n, r);
		} catch (e) {
			if (k(i), e !== e + 0) throw e;
			return Q(1, 0), 0n;
		}
	}
	function Ii(e, t) {
		var n = A();
		try {
			return N(e)(t);
		} catch (e) {
			if (k(n), e !== e + 0) throw e;
			return Q(1, 0), 0n;
		}
	}
	function Li(e, t, n, r, i, a, o, s, c) {
		var l = A();
		try {
			return N(e)(t, n, r, i, a, o, s, c);
		} catch (e) {
			if (k(l), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Ri(e, t, n, r, i, a, o) {
		var s = A();
		try {
			return N(e)(t, n, r, i, a, o);
		} catch (e) {
			if (k(s), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function zi(e, t, n, r, i) {
		var a = A();
		try {
			return N(e)(t, n, r, i);
		} catch (e) {
			if (k(a), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Bi(e) {
		var t = A();
		try {
			return N(e)();
		} catch (e) {
			if (k(t), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Vi(e, t, n, r, i, a, o) {
		var s = A();
		try {
			N(e)(t, n, r, i, a, o);
		} catch (e) {
			if (k(s), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Hi(e, t, n) {
		var r = A();
		try {
			return N(e)(t, n);
		} catch (e) {
			if (k(r), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Ui(e, t, n) {
		var r = A();
		try {
			N(e)(t, n);
		} catch (e) {
			if (k(r), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Wi(e, t, n, r, i, a) {
		var o = A();
		try {
			return N(e)(t, n, r, i, a);
		} catch (e) {
			if (k(o), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Gi(e, t, n) {
		var r = A();
		try {
			return N(e)(t, n);
		} catch (e) {
			if (k(r), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Ki(e, t, n, r, i, a) {
		var o = A();
		try {
			N(e)(t, n, r, i, a);
		} catch (e) {
			if (k(o), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function qi(e, t, n, r, i, a, o, s) {
		var c = A();
		try {
			return N(e)(t, n, r, i, a, o, s);
		} catch (e) {
			if (k(c), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Ji(e, t, n, r, i, a, o, s, c, l) {
		var u = A();
		try {
			return N(e)(t, n, r, i, a, o, s, c, l);
		} catch (e) {
			if (k(u), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Yi(e, t, n, r) {
		var i = A();
		try {
			N(e)(t, n, r);
		} catch (e) {
			if (k(i), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Xi(e, t, n, r, i, a, o, s, c, l, u) {
		var d = A();
		try {
			N(e)(t, n, r, i, a, o, s, c, l, u);
		} catch (e) {
			if (k(d), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Zi(e, t, n, r, i, a, o, s, c, l, u) {
		var d = A();
		try {
			return N(e)(t, n, r, i, a, o, s, c, l, u);
		} catch (e) {
			if (k(d), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function Qi(e, t) {
		var n = A();
		try {
			return N(e)(t);
		} catch (e) {
			if (k(n), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function $i(e, t, n, r, i, a, o, s, c, l) {
		var u = A();
		try {
			N(e)(t, n, r, i, a, o, s, c, l);
		} catch (e) {
			if (k(u), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ea(e, t, n, r, i, a, o, s) {
		var c = A();
		try {
			N(e)(t, n, r, i, a, o, s);
		} catch (e) {
			if (k(c), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ta(e) {
		var t = A();
		try {
			N(e)();
		} catch (e) {
			if (k(t), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function na(e, t, n, r, i, a, o, s, c, l, u, d) {
		var f = A();
		try {
			return N(e)(t, n, r, i, a, o, s, c, l, u, d);
		} catch (e) {
			if (k(f), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ra(e, t, n, r, i, a) {
		var o = A();
		try {
			return N(e)(t, n, r, i, a);
		} catch (e) {
			if (k(o), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ia(e, t) {
		var n = A();
		try {
			return N(e)(t);
		} catch (e) {
			if (k(n), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function aa(e, t, n, r, i, a, o, s, c) {
		var l = A();
		try {
			N(e)(t, n, r, i, a, o, s, c);
		} catch (e) {
			if (k(l), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function oa(e, t, n, r, i, a, o, s, c, l, u, d) {
		var f = A();
		try {
			N(e)(t, n, r, i, a, o, s, c, l, u, d);
		} catch (e) {
			if (k(f), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function sa(e, t, n, r) {
		var i = A();
		try {
			return N(e)(t, n, r);
		} catch (e) {
			if (k(i), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ca(e, t, n, r, i, a) {
		var o = A();
		try {
			N(e)(t, n, r, i, a);
		} catch (e) {
			if (k(o), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function la(e, t, n, r, i, a) {
		var o = A();
		try {
			return N(e)(t, n, r, i, a);
		} catch (e) {
			if (k(o), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ua(e, t, n, r, i, a) {
		var o = A();
		try {
			return N(e)(t, n, r, i, a);
		} catch (e) {
			if (k(o), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function da(e, t, n, r, i) {
		var a = A();
		try {
			return N(e)(t, n, r, i);
		} catch (e) {
			if (k(a), e !== e + 0) throw e;
			return Q(1, 0), 0n;
		}
	}
	function fa(e, t, n, r) {
		var i = A();
		try {
			return N(e)(t, n, r);
		} catch (e) {
			if (k(i), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function pa(e, t, n, r) {
		var i = A();
		try {
			return N(e)(t, n, r);
		} catch (e) {
			if (k(i), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ma(e, t, n, r, i, a, o, s, c, l, u) {
		var d = A();
		try {
			N(e)(t, n, r, i, a, o, s, c, l, u);
		} catch (e) {
			if (k(d), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ha(e, t, n, r, i, a, o, s, c, l, u, d, f, p, ee, m) {
		var h = A();
		try {
			N(e)(t, n, r, i, a, o, s, c, l, u, d, f, p, ee, m);
		} catch (e) {
			if (k(h), e !== e + 0) throw e;
			Q(1, 0);
		}
	}
	function ga(e) {
		e = Object.assign({}, e);
		var t = (e) => (t) => e(t) >>> 0;
		return e.tb = t(e.tb), e.mk = t(e.mk), e.Ao = ((e) => (t, n) => e(t, n) >>> 0)(e.Ao), e._emscripten_stack_alloc = t(e._emscripten_stack_alloc), e.Eo = ((e) => () => e() >>> 0)(e.Eo), e.Io = t(e.Io), e;
	}
	function _a() {
		if (B > 0) {
			Ze = _a;
			return;
		}
		if (B > 0) {
			Ze = _a;
			return;
		}
		function e() {
			n.calledRun = !0, !m && (C(), te?.(n));
		}
		e();
	}
	var va = await fe();
	return _a(), t = S ? n : new Promise((e, t) => {
		te = e, g = t;
	}), t;
}
//#endregion
//#region src/image-magick.ts
var Ze = class {
	constructor(e) {
		if (e instanceof URL) {
			if (e.protocol !== "http:" && e.protocol !== "https:") throw new S("Only http/https protocol is supported");
			this.locateFile = () => e.href;
		} else e instanceof WebAssembly.Module ? this.instantiateWasm = (t, n) => {
			n(new WebAssembly.Instance(e, t));
		} : this.wasmBinary = e;
	}
	wasmBinary;
	instantiateWasm;
	locateFile;
}, V = class {
	api;
	constructor() {}
	async _initialize(e, t, n) {
		if (this.api !== void 0) return;
		let r = await e(new Ze(t));
		this.writeConfigurationFiles(r, n), le(r, "MAGICK_CONFIGURE_PATH", (e) => {
			le(r, "/xml", (t) => {
				r._Environment_SetEnv(e, t), r._Environment_Initialize(), this.api = r;
			});
		});
	}
	static get _api() {
		if (!H.api) throw new S("`await initializeImageMagick` should be called to initialize the library");
		return H.api;
	}
	static set _api(e) {
		H.api = e;
	}
	static read(t, n, r, i) {
		return Ye._create((a) => {
			let o = i;
			if (typeof t != "string" && !e(t)) typeof n == "number" && typeof r == "number" && a.read(t, n, r);
			else if (typeof n != "number" && typeof r != "number") {
				o = r;
				let e;
				n instanceof I ? e = n : typeof n == "string" ? (e = new I(), e.format = n) : o = n, a.read(t, e);
			}
			return o(a);
		});
	}
	static readCollection(e, t, n) {
		return L.use((r) => {
			let i = n, a;
			return t instanceof I ? a = t : typeof t == "string" ? (a = new I(), a.format = t) : i = t, r.read(e, a), i(r);
		});
	}
	static readFromCanvas(e, t, n) {
		return Ye._create((r) => (r.readFromCanvas(e, n), t(r)));
	}
	writeConfigurationFiles(e, t) {
		e.FS.analyzePath("/xml").exists || e.FS.mkdir("/xml");
		for (let n of t.all()) {
			let t = e.FS.open(`/xml/${n.fileName}`, "w"), r = new TextEncoder().encode(n.data);
			e.FS.write(t, r, 0, r.length), e.FS.close(t);
		}
	}
}, H = new V();
async function U(e, t) {
	await H._initialize(B, e, t ?? r.default);
}
async function W(e, t) {
	await H._initialize(Xe, e, t ?? r.default);
}
//#endregion
//#region src/events/progress-event.ts
var Qe = class {
	constructor(e, t, n) {
		this.origin = e, this.progress = new R((t + 1) / (n * 100));
	}
	origin;
	progress;
	cancel = !1;
}, $e = class e {
	static _logDelegate = 0;
	static _onLog;
	static _progressDelegate = 0;
	static _images = {};
	static setLogDelegate(t) {
		e._logDelegate === 0 && t !== void 0 && (e._logDelegate = V._api.addFunction(e.logDelegate, "vii")), V._api._Magick_SetLogDelegate(t === void 0 ? 0 : e._logDelegate), e._onLog = t;
	}
	static setProgressDelegate(t) {
		e._progressDelegate === 0 && (this._progressDelegate = V._api.addFunction(e.progressDelegate, "iijji")), this._images[t._instance.toString()] = t, V._api._MagickImage_SetClientData(t._instance, t._instance), V._api._MagickImage_SetProgressDelegate(t._instance, O(e._progressDelegate));
	}
	static removeProgressDelegate(t) {
		V._api._MagickImage_SetClientData(t._instance, V._api._NullPointer), V._api._MagickImage_SetProgressDelegate(t._instance, V._api._NullPointer), delete e._images[t._instance.toString()];
	}
	static logDelegate(t, n) {
		if (e._onLog === void 0) return;
		let r = C(O(n), "");
		e._onLog(new p(t, r));
	}
	static progressDelegate(t, n, r, i) {
		let a = e._images[i];
		if (a === void 0 || a.onProgress === void 0) return 1;
		let o = Number(n), s = Number(r), c = new Qe(C(O(t)), o, s);
		return a.onProgress(c), +!c.cancel;
	}
}, G = class e {
	static _allFormats;
	constructor(e, t, n, r, i, a, o, s) {
		this.format = e, this.description = t, this.mimeType = n, this.moduleFormat = r, this.supportsMultipleFrames = i, this.supportsReading = a, this.supportsWriting = o, this.version = s;
	}
	description;
	format;
	mimeType;
	moduleFormat;
	supportsMultipleFrames;
	supportsReading;
	supportsWriting;
	version;
	static get all() {
		return e._allFormats === void 0 && (e._allFormats = e.loadFormats()), e._allFormats;
	}
	static loadFormats() {
		return M.usePointer((t) => j.use((n) => {
			let r = V._api._MagickFormatInfo_CreateList(n.ptr, t), i = n.value;
			try {
				let n = Array(Number(i)), a = Object.values(Ee);
				for (let o = 0; o < i; o++) {
					let i = V._api._MagickFormatInfo_GetInfo(r, O(o), t), s = C(V._api._MagickFormatInfo_Format_Get(i)), c = e.convertFormat(s, a), l = C(V._api._MagickFormatInfo_Description_Get(i), ""), u = C(V._api._MagickFormatInfo_MimeType_Get(i)), d = C(V._api._MagickFormatInfo_Module_Get(i)), f = e.convertFormat(d, a), p = V._api._MagickFormatInfo_SupportsMultipleFrames_Get(i) == 1, ee = V._api._MagickFormatInfo_SupportsReading_Get(i) == 1, m = V._api._MagickFormatInfo_SupportsWriting_Get(i) == 1, h = C(V._api._MagickFormatInfo_Version_Get(i));
					n[o] = new e(c, l, u, f, p, ee, m, h);
				}
				return n;
			} finally {
				V._api._MagickFormatInfo_DisposeList(r, i);
			}
		}));
	}
	static convertFormat(e, t) {
		return e === null ? Ee.Unknown : t.includes(e) ? e : Ee.Unknown;
	}
}, K = {
	None: 0,
	Accelerate: 1,
	Annotate: 2,
	Blob: 4,
	Cache: 8,
	Coder: 16,
	Configure: 32,
	Deprecate: 64,
	Draw: 128,
	Exception: 256,
	Image: 512,
	Locale: 1024,
	Module: 2048,
	Pixel: 4096,
	Policy: 8192,
	Resource: 16384,
	Trace: 32768,
	Transform: 65536,
	User: 131072,
	Wand: 262144,
	Detailed: 2147450879,
	get All() {
		return this.Detailed | this.Trace;
	}
}, q = class e {
	static get delegates() {
		return C(V._api._Magick_Delegates_Get(), "Unknown");
	}
	static get features() {
		return C(V._api._Magick_Features_Get(), " ").slice(0, -1);
	}
	static get imageMagickVersion() {
		return C(V._api._Magick_ImageMagickVersion_Get(), "Unknown");
	}
	static get supportedFormats() {
		return G.all;
	}
	static onLog;
	static addFont(e, t) {
		let n = V._api.FS;
		n.analyzePath("/fonts").exists || n.mkdir("/fonts");
		let r = n.open(`/fonts/${e}`, "w");
		n.write(r, t, 0, t.length), n.close(r);
	}
	static resetRandomSeed = () => V._api._Magick_ResetRandomSeed();
	static setRandomSeed = (e) => V._api._Magick_SetRandomSeed(e);
	static setLogEvents(t) {
		let n = t == K.None ? void 0 : e.logDelegate;
		$e.setLogDelegate(n), E(e.getEventTypeString(t), (e) => V._api._Magick_SetLogEvents(e));
	}
	static _getFontFileName(e) {
		let t = `/fonts/${e}`;
		if (!V._api.FS.analyzePath(t).exists) throw `Unable to find a font with the name '${e}', register it with the addFont method of the Magick class.`;
		return t;
	}
	static getEventTypeString(e) {
		if (e == K.All) return "All,Trace";
		if (e == K.Detailed) return "All";
		switch (e) {
			case K.Accelerate: return "Accelerate";
			case K.Annotate: return "Annotate";
			case K.Blob: return "Blob";
			case K.Cache: return "Cache";
			case K.Coder: return "Coder";
			case K.Configure: return "Configure";
			case K.Deprecate: return "Deprecate";
			case K.Draw: return "Draw";
			case K.Exception: return "Exception";
			case K.Image: return "Image";
			case K.Locale: return "Locale";
			case K.Module: return "Module";
			case K.Pixel: return "Pixel";
			case K.Policy: return "Policy";
			case K.Resource: return "Resource";
			case K.Trace: return "Trace";
			case K.Transform: return "Transform";
			case K.User: return "User";
			case K.Wand: return "Wand";
			case K.None:
			default: return "None";
		}
	}
	static logDelegate(t) {
		e.onLog !== void 0 && e.onLog(t);
	}
}, et = class {
	_font;
	constructor(e) {
		this._font = e;
	}
	get font() {
		return this._font;
	}
	draw(e) {
		let t = q._getFontFileName(this._font);
		e.font(t);
	}
}, tt = class {
	_gravity;
	constructor(e) {
		this._gravity = e;
	}
	get gravity() {
		return this._gravity;
	}
	draw(e) {
		e.gravity(this._gravity);
	}
}, nt = class {
	_startX;
	_startY;
	_endX;
	_endY;
	constructor(e, t, n, r) {
		this._startX = e, this._startY = t, this._endX = n, this._endY = r;
	}
	get startX() {
		return this._startX;
	}
	get startY() {
		return this._startY;
	}
	get endX() {
		return this._endX;
	}
	get endY() {
		return this._endY;
	}
	draw(e) {
		e.line(this._startX, this._startY, this._endX, this._endY);
	}
}, rt = class {
	_paths = [];
	constructor(e) {
		this._paths = e;
	}
	draw(e) {
		e.pathStart();
		for (let t of this._paths) t.draw(e);
		e.pathFinish();
	}
}, it = class {
	_x;
	_y;
	constructor(e, t) {
		this._x = e, this._y = t;
	}
	get x() {
		return this._x;
	}
	get y() {
		return this._y;
	}
	draw(e) {
		e.point(this._x, this._y);
	}
}, at = class {
	_upperLeftX;
	_upperLeftY;
	_lowerRightX;
	_lowerRightY;
	constructor(e, t, n, r) {
		this._upperLeftX = e, this._upperLeftY = t, this._lowerRightX = n, this._lowerRightY = r;
	}
	get upperLeftX() {
		return this._upperLeftX;
	}
	get upperLeftY() {
		return this._upperLeftY;
	}
	get lowerRightX() {
		return this._lowerRightX;
	}
	get lowerRightY() {
		return this._lowerRightY;
	}
	draw(e) {
		e.rectangle(this._upperLeftX, this._upperLeftY, this._lowerRightX, this._lowerRightY);
	}
}, ot = class {
	_upperLeftX;
	_upperLeftY;
	_lowerRightX;
	_lowerRightY;
	_cornerWidth;
	_cornerHeight;
	constructor(e, t, n, r, i, a) {
		this._upperLeftX = e, this._upperLeftY = t, this._lowerRightX = n, this._lowerRightY = r, this._cornerWidth = i, this._cornerHeight = a;
	}
	get upperLeftX() {
		return this._upperLeftX;
	}
	get upperLeftY() {
		return this._upperLeftY;
	}
	get lowerRightX() {
		return this._lowerRightX;
	}
	get lowerRightY() {
		return this._lowerRightY;
	}
	get cornerWidth() {
		return this._cornerWidth;
	}
	get cornerHeight() {
		return this._cornerHeight;
	}
	draw(e) {
		e.roundRectangle(this._upperLeftX, this._upperLeftY, this._lowerRightX, this._lowerRightY, this._cornerWidth, this._cornerHeight);
	}
}, st = class {
	_color;
	constructor(e) {
		this._color = e;
	}
	get color() {
		return this._color;
	}
	draw(e) {
		e.strokeColor(this._color);
	}
}, ct = class {
	_dash = [];
	constructor(e) {
		this._dash = [...e];
	}
	get dash() {
		return this._dash;
	}
	draw(e) {
		e.strokeDashArray(this._dash);
	}
}, lt = class {
	_offset;
	constructor(e) {
		this._offset = e;
	}
	get offset() {
		return this._offset;
	}
	draw(e) {
		e.strokeDashOffset(this._offset);
	}
}, ut = class {
	_width;
	constructor(e) {
		this._width = e;
	}
	get width() {
		return this._width;
	}
	draw(e) {
		e.strokeWidth(this._width);
	}
}, dt = class {
	_alignment;
	constructor(e) {
		this._alignment = e;
	}
	get alignment() {
		return this._alignment;
	}
	draw(e) {
		e.textAlignment(this._alignment);
	}
}, ft = class e {
	_isEnabled;
	constructor(e) {
		this._isEnabled = e;
	}
	static get disabled() {
		return new e(!1);
	}
	static get enabled() {
		return new e(!0);
	}
	get isEnabled() {
		return this._isEnabled;
	}
	draw(e) {
		e.textAntialias(this._isEnabled);
	}
}, pt = class {
	_decoration;
	constructor(e) {
		this._decoration = e;
	}
	get decoration() {
		return this._decoration;
	}
	draw(e) {
		e.textDecoration(this._decoration);
	}
}, mt = class {
	_spacing;
	constructor(e) {
		this._spacing = e;
	}
	get spacing() {
		return this._spacing;
	}
	draw(e) {
		e.textInterlineSpacing(this._spacing);
	}
}, ht = class {
	_spacing;
	constructor(e) {
		this._spacing = e;
	}
	get spacing() {
		return this._spacing;
	}
	draw(e) {
		e.textInterwordspacing(this._spacing);
	}
}, gt = class {
	_kerning;
	constructor(e) {
		this._kerning = e;
	}
	get kerning() {
		return this._kerning;
	}
	draw(e) {
		e.textKerning(this._kerning);
	}
}, _t = class {
	_color;
	constructor(e) {
		this._color = e;
	}
	get color() {
		return this._color;
	}
	draw(e) {
		e.textUnderColor(this._color);
	}
}, vt = class {
	_x;
	_y;
	_value;
	constructor(e, t, n) {
		this._x = e, this._y = t, this._value = n;
	}
	get x() {
		return this._x;
	}
	get y() {
		return this._y;
	}
	get value() {
		return this._value;
	}
	draw(e) {
		e.text(this._x, this._y, this._value);
	}
}, yt = class {
	static get None() {
		return new D(0, 0, 0, 0);
	}
	static get Transparent() {
		return new D(0, 0, 0, 0);
	}
	static get AliceBlue() {
		return new D(240, 248, 255, 255);
	}
	static get AntiqueWhite() {
		return new D(250, 235, 215, 255);
	}
	static get Aqua() {
		return new D(0, 255, 255, 255);
	}
	static get Aquamarine() {
		return new D(127, 255, 212, 255);
	}
	static get Azure() {
		return new D(240, 255, 255, 255);
	}
	static get Beige() {
		return new D(245, 245, 220, 255);
	}
	static get Bisque() {
		return new D(255, 228, 196, 255);
	}
	static get Black() {
		return new D(0, 0, 0, 255);
	}
	static get BlanchedAlmond() {
		return new D(255, 235, 205, 255);
	}
	static get Blue() {
		return new D(0, 0, 255, 255);
	}
	static get BlueViolet() {
		return new D(138, 43, 226, 255);
	}
	static get Brown() {
		return new D(165, 42, 42, 255);
	}
	static get BurlyWood() {
		return new D(222, 184, 135, 255);
	}
	static get CadetBlue() {
		return new D(95, 158, 160, 255);
	}
	static get Chartreuse() {
		return new D(127, 255, 0, 255);
	}
	static get Chocolate() {
		return new D(210, 105, 30, 255);
	}
	static get Coral() {
		return new D(255, 127, 80, 255);
	}
	static get CornflowerBlue() {
		return new D(100, 149, 237, 255);
	}
	static get Cornsilk() {
		return new D(255, 248, 220, 255);
	}
	static get Crimson() {
		return new D(220, 20, 60, 255);
	}
	static get Cyan() {
		return new D(0, 255, 255, 255);
	}
	static get DarkBlue() {
		return new D(0, 0, 139, 255);
	}
	static get DarkCyan() {
		return new D(0, 139, 139, 255);
	}
	static get DarkGoldenrod() {
		return new D(184, 134, 11, 255);
	}
	static get DarkGray() {
		return new D(169, 169, 169, 255);
	}
	static get DarkGreen() {
		return new D(0, 100, 0, 255);
	}
	static get DarkKhaki() {
		return new D(189, 183, 107, 255);
	}
	static get DarkMagenta() {
		return new D(139, 0, 139, 255);
	}
	static get DarkOliveGreen() {
		return new D(85, 107, 47, 255);
	}
	static get DarkOrange() {
		return new D(255, 140, 0, 255);
	}
	static get DarkOrchid() {
		return new D(153, 50, 204, 255);
	}
	static get DarkRed() {
		return new D(139, 0, 0, 255);
	}
	static get DarkSalmon() {
		return new D(233, 150, 122, 255);
	}
	static get DarkSeaGreen() {
		return new D(143, 188, 143, 255);
	}
	static get DarkSlateBlue() {
		return new D(72, 61, 139, 255);
	}
	static get DarkSlateGray() {
		return new D(47, 79, 79, 255);
	}
	static get DarkTurquoise() {
		return new D(0, 206, 209, 255);
	}
	static get DarkViolet() {
		return new D(148, 0, 211, 255);
	}
	static get DeepPink() {
		return new D(255, 20, 147, 255);
	}
	static get DeepSkyBlue() {
		return new D(0, 191, 255, 255);
	}
	static get DimGray() {
		return new D(105, 105, 105, 255);
	}
	static get DodgerBlue() {
		return new D(30, 144, 255, 255);
	}
	static get Firebrick() {
		return new D(178, 34, 34, 255);
	}
	static get FloralWhite() {
		return new D(255, 250, 240, 255);
	}
	static get ForestGreen() {
		return new D(34, 139, 34, 255);
	}
	static get Fuchsia() {
		return new D(255, 0, 255, 255);
	}
	static get Gainsboro() {
		return new D(220, 220, 220, 255);
	}
	static get GhostWhite() {
		return new D(248, 248, 255, 255);
	}
	static get Gold() {
		return new D(255, 215, 0, 255);
	}
	static get Goldenrod() {
		return new D(218, 165, 32, 255);
	}
	static get Gray() {
		return new D(128, 128, 128, 255);
	}
	static get Green() {
		return new D(0, 128, 0, 255);
	}
	static get GreenYellow() {
		return new D(173, 255, 47, 255);
	}
	static get Honeydew() {
		return new D(240, 255, 240, 255);
	}
	static get HotPink() {
		return new D(255, 105, 180, 255);
	}
	static get IndianRed() {
		return new D(205, 92, 92, 255);
	}
	static get Indigo() {
		return new D(75, 0, 130, 255);
	}
	static get Ivory() {
		return new D(255, 255, 240, 255);
	}
	static get Khaki() {
		return new D(240, 230, 140, 255);
	}
	static get Lavender() {
		return new D(230, 230, 250, 255);
	}
	static get LavenderBlush() {
		return new D(255, 240, 245, 255);
	}
	static get LawnGreen() {
		return new D(124, 252, 0, 255);
	}
	static get LemonChiffon() {
		return new D(255, 250, 205, 255);
	}
	static get LightBlue() {
		return new D(173, 216, 230, 255);
	}
	static get LightCoral() {
		return new D(240, 128, 128, 255);
	}
	static get LightCyan() {
		return new D(224, 255, 255, 255);
	}
	static get LightGoldenrodYellow() {
		return new D(250, 250, 210, 255);
	}
	static get LightGreen() {
		return new D(144, 238, 144, 255);
	}
	static get LightGray() {
		return new D(211, 211, 211, 255);
	}
	static get LightPink() {
		return new D(255, 182, 193, 255);
	}
	static get LightSalmon() {
		return new D(255, 160, 122, 255);
	}
	static get LightSeaGreen() {
		return new D(32, 178, 170, 255);
	}
	static get LightSkyBlue() {
		return new D(135, 206, 250, 255);
	}
	static get LightSlateGray() {
		return new D(119, 136, 153, 255);
	}
	static get LightSteelBlue() {
		return new D(176, 196, 222, 255);
	}
	static get LightYellow() {
		return new D(255, 255, 224, 255);
	}
	static get Lime() {
		return new D(0, 255, 0, 255);
	}
	static get LimeGreen() {
		return new D(50, 205, 50, 255);
	}
	static get Linen() {
		return new D(250, 240, 230, 255);
	}
	static get Magenta() {
		return new D(255, 0, 255, 255);
	}
	static get Maroon() {
		return new D(128, 0, 0, 255);
	}
	static get MediumAquamarine() {
		return new D(102, 205, 170, 255);
	}
	static get MediumBlue() {
		return new D(0, 0, 205, 255);
	}
	static get MediumOrchid() {
		return new D(186, 85, 211, 255);
	}
	static get MediumPurple() {
		return new D(147, 112, 219, 255);
	}
	static get MediumSeaGreen() {
		return new D(60, 179, 113, 255);
	}
	static get MediumSlateBlue() {
		return new D(123, 104, 238, 255);
	}
	static get MediumSpringGreen() {
		return new D(0, 250, 154, 255);
	}
	static get MediumTurquoise() {
		return new D(72, 209, 204, 255);
	}
	static get MediumVioletRed() {
		return new D(199, 21, 133, 255);
	}
	static get MidnightBlue() {
		return new D(25, 25, 112, 255);
	}
	static get MintCream() {
		return new D(245, 255, 250, 255);
	}
	static get MistyRose() {
		return new D(255, 228, 225, 255);
	}
	static get Moccasin() {
		return new D(255, 228, 181, 255);
	}
	static get NavajoWhite() {
		return new D(255, 222, 173, 255);
	}
	static get Navy() {
		return new D(0, 0, 128, 255);
	}
	static get OldLace() {
		return new D(253, 245, 230, 255);
	}
	static get Olive() {
		return new D(128, 128, 0, 255);
	}
	static get OliveDrab() {
		return new D(107, 142, 35, 255);
	}
	static get Orange() {
		return new D(255, 165, 0, 255);
	}
	static get OrangeRed() {
		return new D(255, 69, 0, 255);
	}
	static get Orchid() {
		return new D(218, 112, 214, 255);
	}
	static get PaleGoldenrod() {
		return new D(238, 232, 170, 255);
	}
	static get PaleGreen() {
		return new D(152, 251, 152, 255);
	}
	static get PaleTurquoise() {
		return new D(175, 238, 238, 255);
	}
	static get PaleVioletRed() {
		return new D(219, 112, 147, 255);
	}
	static get PapayaWhip() {
		return new D(255, 239, 213, 255);
	}
	static get PeachPuff() {
		return new D(255, 218, 185, 255);
	}
	static get Peru() {
		return new D(205, 133, 63, 255);
	}
	static get Pink() {
		return new D(255, 192, 203, 255);
	}
	static get Plum() {
		return new D(221, 160, 221, 255);
	}
	static get PowderBlue() {
		return new D(176, 224, 230, 255);
	}
	static get Purple() {
		return new D(128, 0, 128, 255);
	}
	static get RebeccaPurple() {
		return new D(102, 51, 153, 255);
	}
	static get Red() {
		return new D(255, 0, 0, 255);
	}
	static get RosyBrown() {
		return new D(188, 143, 143, 255);
	}
	static get RoyalBlue() {
		return new D(65, 105, 225, 255);
	}
	static get SaddleBrown() {
		return new D(139, 69, 19, 255);
	}
	static get Salmon() {
		return new D(250, 128, 114, 255);
	}
	static get SandyBrown() {
		return new D(244, 164, 96, 255);
	}
	static get SeaGreen() {
		return new D(46, 139, 87, 255);
	}
	static get SeaShell() {
		return new D(255, 245, 238, 255);
	}
	static get Sienna() {
		return new D(160, 82, 45, 255);
	}
	static get Silver() {
		return new D(192, 192, 192, 255);
	}
	static get SkyBlue() {
		return new D(135, 206, 235, 255);
	}
	static get SlateBlue() {
		return new D(106, 90, 205, 255);
	}
	static get SlateGray() {
		return new D(112, 128, 144, 255);
	}
	static get Snow() {
		return new D(255, 250, 250, 255);
	}
	static get SpringGreen() {
		return new D(0, 255, 127, 255);
	}
	static get SteelBlue() {
		return new D(70, 130, 180, 255);
	}
	static get Tan() {
		return new D(210, 180, 140, 255);
	}
	static get Teal() {
		return new D(0, 128, 128, 255);
	}
	static get Thistle() {
		return new D(216, 191, 216, 255);
	}
	static get Tomato() {
		return new D(255, 99, 71, 255);
	}
	static get Turquoise() {
		return new D(64, 224, 208, 255);
	}
	static get Violet() {
		return new D(238, 130, 238, 255);
	}
	static get Wheat() {
		return new D(245, 222, 179, 255);
	}
	static get White() {
		return new D(255, 255, 255, 255);
	}
	static get WhiteSmoke() {
		return new D(245, 245, 245, 255);
	}
	static get Yellow() {
		return new D(255, 255, 0, 255);
	}
	static get YellowGreen() {
		return new D(154, 205, 50, 255);
	}
}, bt = class {
	_x;
	_y;
	constructor(e, t) {
		this._x = e, this._y = t;
	}
	get x() {
		return this._x;
	}
	get y() {
		return this._y;
	}
	draw(e) {
		e.pathLineToAbs(this._x, this._y);
	}
}, xt = class {
	_x;
	_y;
	constructor(e, t) {
		this._x = e, this._y = t;
	}
	get x() {
		return this._x;
	}
	get y() {
		return this._y;
	}
	draw(e) {
		e.pathLineToRel(this._x, this._y);
	}
}, St = class {
	_x;
	_y;
	constructor(e, t) {
		this._x = e, this._y = t;
	}
	get x() {
		return this._x;
	}
	get y() {
		return this._y;
	}
	draw(e) {
		e.pathMoveToAbs(this._x, this._y);
	}
}, Ct = class {
	_x;
	_y;
	constructor(e, t) {
		this._x = e, this._y = t;
	}
	get x() {
		return this._x;
	}
	get y() {
		return this._y;
	}
	draw(e) {
		e.pathMoveToRel(this._x, this._y);
	}
}, wt = class {
	_drawables;
	_paths = [];
	constructor(e) {
		this._drawables = e;
	}
	drawables() {
		return this._drawables === void 0 ? new Tt().path(this._paths) : this._drawables.path(this._paths);
	}
	lineToAbs(e, t) {
		return this._paths.push(new bt(e, t)), this;
	}
	lineToRel(e, t) {
		return this._paths.push(new xt(e, t)), this;
	}
	moveToAbs(e, t) {
		return this._paths.push(new St(e, t)), this;
	}
	moveToRel(e, t) {
		return this._paths.push(new Ct(e, t)), this;
	}
}, Tt = class {
	_drawables = [];
	affine(e = 1, t = 1, n = 0, r = 0, i = 0, a = 0) {
		return this._drawables.push(new o(e, t, n, r, i, a)), this;
	}
	color(e, t, n) {
		return this._drawables.push(new c(e, t, n)), this;
	}
	borderColor(e) {
		return this._drawables.push(new s(e)), this;
	}
	disableTextAntiAlias() {
		return this._drawables.push(ft.disabled), this;
	}
	draw(e) {
		return e.draw(this._drawables), this;
	}
	enableTextAntiAlias() {
		return this._drawables.push(ft.enabled), this;
	}
	fillColor(e) {
		return this._drawables.push(new l(e)), this;
	}
	fillOpacity(e) {
		return this._drawables.push(new u(e)), this;
	}
	fillRule(e) {
		return this._drawables.push(new d(e)), this;
	}
	font(e) {
		return this._drawables.push(new et(e)), this;
	}
	fontPointSize(e) {
		return this._drawables.push(new f(e)), this;
	}
	fontTypeMetrics(e, t = !1) {
		return Ye._create((n) => (n.read(yt.Transparent, 1, 1), Se._use(n, (n) => (n.draw(this._drawables), n.fontTypeMetrics(e, t)))));
	}
	gravity(e) {
		return this._drawables.push(new tt(e)), this;
	}
	line(e, t, n, r) {
		return this._drawables.push(new nt(e, t, n, r)), this;
	}
	path(e) {
		return this._drawables.push(new rt(e)), this;
	}
	paths() {
		return new wt(this);
	}
	point(e, t) {
		return this._drawables.push(new it(e, t)), this;
	}
	rectangle(e, t, n, r) {
		return this._drawables.push(new at(e, t, n, r)), this;
	}
	roundRectangle(e, t, n, r, i, a) {
		return this._drawables.push(new ot(e, t, n, r, i, a)), this;
	}
	strokeColor(e) {
		return this._drawables.push(new st(e)), this;
	}
	strokeDashArray(e) {
		return this._drawables.push(new ct(e)), this;
	}
	strokeDashOffset(e) {
		return this._drawables.push(new lt(e)), this;
	}
	strokeWidth(e) {
		return this._drawables.push(new ut(e)), this;
	}
	text(e, t, n) {
		return this._drawables.push(new vt(e, t, n)), this;
	}
	textAlignment(e) {
		return this._drawables.push(new dt(e)), this;
	}
	textDecoration(e) {
		return this._drawables.push(new pt(e)), this;
	}
	textInterlineSpacing(e) {
		return this._drawables.push(new mt(e)), this;
	}
	textInterwordSpacing(e) {
		return this._drawables.push(new ht(e)), this;
	}
	textKerning(e) {
		return this._drawables.push(new gt(e)), this;
	}
	textUnderColor(e) {
		return this._drawables.push(new _t(e)), this;
	}
}, Et = {
	Undefined: 0,
	Kapur: 1,
	OTSU: 2,
	Triangle: 3
}, Dt = {
	Undefined: 0,
	Direct: 1,
	Pseudo: 2
}, Ot = {
	Undefined: 0,
	Bilevel: 1,
	Grayscale: 2,
	GrayscaleAlpha: 3,
	Palette: 4,
	PaletteAlpha: 5,
	TrueColor: 6,
	TrueColorAlpha: 7,
	ColorSeparation: 8,
	ColorSeparationAlpha: 9,
	Optimize: 10,
	PaletteBilevelAlpha: 11
}, kt = {
	Undefined: 0,
	Add: 1,
	Conjugate: 2,
	Divide: 3,
	MagnitudePhase: 4,
	Multiply: 5,
	RealImaginary: 6,
	Subtract: 7
}, At = {
	Undefined: 0,
	B44A: 1,
	B44: 2,
	BZip: 3,
	DXT1: 4,
	DXT3: 5,
	DXT5: 6,
	Fax: 7,
	Group4: 8,
	JBIG1: 9,
	JBIG2: 10,
	JPEG2000: 11,
	JPEG: 12,
	LosslessJPEG: 13,
	LZMA: 14,
	LZW: 15,
	NoCompression: 16,
	Piz: 17,
	Pxr24: 18,
	RLE: 19,
	Zip: 20,
	ZipS: 21,
	Zstd: 22,
	WebP: 23,
	DWAA: 24,
	DWAB: 25,
	BC7: 26,
	BC5: 27
}, J = {
	Undefined: 0,
	Affine: 1,
	AffineProjection: 2,
	ScaleRotateTranslate: 3,
	Perspective: 4,
	PerspectiveProjection: 5,
	BilinearForward: 6,
	BilinearReverse: 7,
	Polynomial: 8,
	Arc: 9,
	Polar: 10,
	DePolar: 11,
	Cylinder2Plane: 12,
	Plane2Cylinder: 13,
	Barrel: 14,
	BarrelInverse: 15,
	Shepards: 16,
	Resize: 17,
	Sentinel: 18,
	RigidAffine: 19
}, jt = {
	Undefined: 0,
	LSB: 1,
	MSB: 2
}, Y = {
	Undefined: 0,
	Absolute: 1,
	Fuzz: 2,
	MeanAbsolute: 3,
	MeanErrorPerPixel: 4,
	MeanSquared: 5,
	NormalizedCrossCorrelation: 6,
	PeakAbsolute: 7,
	PeakSignalToNoiseRatio: 8,
	PerceptualHash: 9,
	RootMeanSquared: 10,
	StructuralSimilarity: 11,
	StructuralDissimilarity: 12,
	PixelDifferenceCount: 13
}, Mt = {
	Undefined: 0,
	Abs: 1,
	Add: 2,
	AddModulus: 3,
	And: 4,
	Cosine: 5,
	Divide: 6,
	Exponential: 7,
	GaussianNoise: 8,
	ImpulseNoise: 9,
	LaplacianNoise: 10,
	LeftShift: 11,
	Log: 12,
	Max: 13,
	Mean: 14,
	Median: 15,
	Min: 16,
	MultiplicativeNoise: 17,
	Multiply: 18,
	Or: 19,
	PoissonNoise: 20,
	Pow: 21,
	RightShift: 22,
	RootMeanSquare: 23,
	Set: 24,
	Sine: 25,
	Subtract: 26,
	Sum: 27,
	ThresholdBlack: 28,
	Threshold: 29,
	ThresholdWhite: 30,
	UniformNoise: 31,
	Xor: 32,
	InverseLog: 33
}, X = {
	Undefined: 0,
	Point: 1,
	Box: 2,
	Triangle: 3,
	Hermite: 4,
	Hann: 5,
	Hamming: 6,
	Blackman: 7,
	Gaussian: 8,
	Quadratic: 9,
	Cubic: 10,
	Catrom: 11,
	Mitchell: 12,
	Jinc: 13,
	Sinc: 14,
	SincFast: 15,
	Kaiser: 16,
	Welch: 17,
	Parzen: 18,
	Bohman: 19,
	Bartlett: 20,
	Lagrange: 21,
	Lanczos: 22,
	LanczosSharp: 23,
	Lanczos2: 24,
	Lanczos2Sharp: 25,
	Robidoux: 26,
	RobidouxSharp: 27,
	Cosine: 28,
	Spline: 29,
	LanczosRadius: 30,
	CubicSpline: 31,
	MagicKernelSharp2013: 32,
	MagicKernelSharp2021: 33
}, Nt = {
	Undefined: 0,
	None: 1,
	Background: 2,
	Previous: 3
}, Pt = {
	Undefined: 0,
	NoInterlace: 1,
	Line: 2,
	Plane: 3,
	Partition: 4,
	Gif: 5,
	Jpeg: 6,
	Png: 7
}, Ft = {
	Undefined: "Undefined",
	Unity: "Unity",
	Gaussian: "Gaussian",
	DoG: "DoG",
	LoG: "LoG",
	Blur: "Blur",
	Comet: "Comet",
	Binomial: "Binomial",
	Laplacian: "Laplacian",
	Sobel: "Sobel",
	FreiChen: "FreiChen",
	Roberts: "Roberts",
	Prewitt: "Prewitt",
	Compass: "Compass",
	Kirsch: "Kirsch",
	Diamond: "Diamond",
	Square: "Square",
	Rectangle: "Rectangle",
	Octagon: "Octagon",
	Disk: "Disk",
	Plus: "Plus",
	Cross: "Cross",
	Ring: "Ring",
	Peaks: "Peaks",
	Edges: "Edges",
	Corners: "Corners",
	Diagonals: "Diagonals",
	LineEnds: "LineEnds",
	LineJunctions: "LineJunctions",
	Ridges: "Ridges",
	ConvexHull: "ConvexHull",
	ThinSE: "ThinSE",
	Skeleton: "Skeleton",
	Chebyshev: "Chebyshev",
	Manhattan: "Manhattan",
	Octagonal: "Octagonal",
	Euclidean: "Euclidean",
	UserDefined: "UserDefined"
}, It = {
	Undefined: 0,
	Convolve: 1,
	Correlate: 2,
	Erode: 3,
	Dilate: 4,
	ErodeIntensity: 5,
	DilateIntensity: 6,
	IterativeDistance: 7,
	Open: 8,
	Close: 9,
	OpenIntensity: 10,
	CloseIntensity: 11,
	Smooth: 12,
	EdgeIn: 13,
	EdgeOut: 14,
	Edge: 15,
	TopHat: 16,
	BottomHat: 17,
	HitAndMiss: 18,
	Thinning: 19,
	Thicken: 20,
	Distance: 21,
	Voronoi: 22
}, Lt = {
	Undefined: 0,
	Uniform: 1,
	Gaussian: 2,
	MultiplicativeGaussian: 3,
	Impulse: 4,
	Laplacian: 5,
	Poisson: 6,
	Random: 7
}, Rt = {
	Undefined: 0,
	TopLeft: 1,
	TopRight: 2,
	BottomRight: 3,
	BottomLeft: 4,
	LeftTop: 5,
	RightTop: 6,
	RightBottom: 7,
	LeftBottom: 8
}, zt = {
	Undefined: 0,
	Point: 1,
	Replace: 2,
	Floodfill: 3,
	FillToBorder: 4,
	Reset: 5
}, Bt = {
	Undefined: 0,
	Saturation: 1,
	Perceptual: 2,
	Absolute: 3,
	Relative: 4
}, Vt = {
	Undefined: 0,
	Left: 1,
	Center: 2,
	Right: 3
}, Ht = {
	Undefined: 0,
	None: 1,
	Underline: 2,
	Overline: 3,
	LineThrough: 4
}, Ut = {
	Undefined: 0,
	Background: 1,
	Dither: 2,
	Edge: 3,
	Mirror: 4,
	Random: 5,
	Tile: 6,
	Transparent: 7,
	Mask: 8,
	Black: 9,
	Gray: 10,
	White: 11,
	HorizontalTile: 12,
	VerticalTile: 13,
	HorizontalTileEdge: 14,
	VerticalTileEdge: 15,
	CheckerTile: 16
}, Wt = /* @__PURE__ */ function(e) {
	return e[e.Disabled = -1] = "Disabled", e[e.Linear = 0] = "Linear", e[e.Vng = 1] = "Vng", e[e.Ppg = 2] = "Ppg", e[e.Ahd = 3] = "Ahd", e[e.DCB = 4] = "DCB", e[e.Dht = 11] = "Dht", e[e.ModifiedAhd = 12] = "ModifiedAhd", e;
}({}), Gt = /* @__PURE__ */ function(e) {
	return e[e.Raw = 0] = "Raw", e[e.SRGB = 1] = "SRGB", e[e.AdobeRGB = 2] = "AdobeRGB", e[e.WideGamutRGB = 3] = "WideGamutRGB", e[e.KodakProPhotoRGB = 4] = "KodakProPhotoRGB", e[e.XYZ = 5] = "XYZ", e[e.ACES = 6] = "ACES", e;
}({}), Kt = class extends a {
	constructor() {
		super(Ee.Dng);
	}
	disableAutoBrightness;
	interpolationQuality;
	outputColor;
	useAutoWhitebalance;
	useCameraWhitebalance;
	getDefines() {
		let e = [];
		return this.hasValue(this.interpolationQuality) && e.push(this.createDefine("interpolation-quality", this.interpolationQuality)), this.hasValue(this.disableAutoBrightness) && e.push(this.createDefine("no-auto-bright", this.disableAutoBrightness)), this.hasValue(this.outputColor) && e.push(this.createDefine("output-color", this.outputColor)), this.hasValue(this.useCameraWhitebalance) && e.push(this.createDefine("use-camera-wb", this.useCameraWhitebalance)), this.hasValue(this.useAutoWhitebalance) && e.push(this.createDefine("use-auto-wb", this.useAutoWhitebalance)), e;
	}
}, qt = 16384, Jt = new TextEncoder(), Yt = /* @__PURE__ */ new Set([
	"color",
	"alpha",
	"index",
	"meta"
]), Xt = /* @__PURE__ */ new Set([
	"uint",
	"sint",
	"float",
	"shared-exponent",
	"unknown"
]);
function Zt(e, t) {
	if (typeof e != "string" || Jt.encode(e).length > 127) throw TypeError("Invalid " + t);
}
function Qt(e) {
	return e === null || typeof e == "number" && Number.isInteger(e) && e > 0 && e <= 64;
}
function $t(e) {
	if (typeof e != "string" || Jt.encode(e).length >= qt) throw TypeError("Invalid metadata size");
	let t = JSON.parse(e);
	if (!t || t.schema !== "sherloq.coder-source-samples/1" || t.precisionOrigin !== "decoder-source-header" || !Array.isArray(t.channels) || !t.channels.length || t.channels.length > 64) throw TypeError("Invalid source metadata");
	if (Zt(t.coder, "coder"), Zt(t.sourceModel, "source model"), Object.keys(t).some((e) => ![
		"schema",
		"precisionOrigin",
		"coder",
		"sourceModel",
		"channels",
		"alpha",
		"valueEncoding"
	].includes(e))) throw TypeError("Unknown source metadata field");
	let n = /* @__PURE__ */ new Set();
	for (let e of t.channels) {
		if (Object.keys(e).some((e) => ![
			"name",
			"role",
			"codedType",
			"codedBits",
			"exponentBits"
		].includes(e))) throw TypeError("Unknown source channel field");
		if (Zt(e.name, "channel name"), n.has(e.name)) throw TypeError("Duplicate source channel");
		if (n.add(e.name), !Yt.has(e.role) || !Xt.has(e.codedType) || !Qt(e.codedBits) || !Number.isInteger(e.exponentBits) || e.exponentBits < 0 || e.exponentBits > 64) throw TypeError("Invalid source channel");
	}
	if (!t.alpha || typeof t.alpha.present != "boolean" || ![
		"unknown",
		"straight",
		"premultiplied"
	].includes(t.alpha.association) || t.alpha.present !== t.channels.some((e) => e.role === "alpha")) throw TypeError("Invalid source alpha");
	if (!t.valueEncoding || typeof t.valueEncoding != "object" || Array.isArray(t.valueEncoding)) throw TypeError("Invalid source encoding");
	for (let [e, n] of Object.entries(t.valueEncoding)) if (Zt(e, "encoding key"), !(n === null || typeof n == "number" && Number.isFinite(n) || typeof n == "string" && Jt.encode(n).length <= 127)) throw TypeError("Invalid source encoding value");
	let r = t.channels.every((e) => e.codedType !== "unknown" && e.codedBits !== null), i = t.channels.some((e) => e.codedType === "float" || e.codedType === "shared-exponent"), a = Math.max(...t.channels.map((e) => e.codedBits ?? 0)), o = i || a > 16 ? 32 : a > 8 ? 16 : r ? 8 : null;
	return Object.freeze({
		...t,
		channels: Object.freeze(t.channels.map((e) => Object.freeze({ ...e }))),
		alpha: Object.freeze({ ...t.alpha }),
		valueEncoding: Object.freeze({ ...t.valueEncoding }),
		selection: Object.freeze({
			preferredQuantumDepth: o,
			metadataComplete: r && !(typeof t.valueEncoding.uninspectedExtraChannels == "number" && t.valueEncoding.uninspectedExtraChannels > 0),
			preservationQualified: !1,
			reason: i ? "floating-decoded-domain" : r ? a > 8 ? "declared-integer-precision" : "declared-eight-bit-or-lower" : "source-metadata-incomplete"
		})
	});
}
//#endregion
//#region src/magick-image-info.ts
var en = class e {
	_colorSpace = g.Undefined;
	_compression = At.Undefined;
	_density = new k(0, 0);
	_format = Ee.Unknown;
	_height = 0;
	_interlace = Pt.Undefined;
	_orientation = Rt.Undefined;
	_quality = 0;
	_width = 0;
	_sourceSamples = null;
	_sourceSamplesLimitation = null;
	get sourceSamples() {
		return this._sourceSamples;
	}
	get sourceSamplesLimitation() {
		return this._sourceSamplesLimitation;
	}
	get colorSpace() {
		return this._colorSpace;
	}
	get compression() {
		return this._compression;
	}
	get density() {
		return this._density;
	}
	get format() {
		return this._format;
	}
	get height() {
		return this._height;
	}
	get interlace() {
		return this._interlace;
	}
	get orientation() {
		return this._orientation;
	}
	get quality() {
		return this._quality;
	}
	get width() {
		return this._width;
	}
	constructor() {}
	read(e, t) {
		Ye._create((n) => {
			n.ping(e, t), this._colorSpace = n.colorSpace, this._compression = n.compression, this._density = n.density, this._format = n.format, this._height = n.height, this._interlace = n.interlace, this._orientation = n.orientation, this._quality = n.quality, this._width = n.width, this._sourceSamples = null, this._sourceSamplesLimitation = "decoder-source-metadata-unavailable";
			try {
				let e = n.getArtifact("sherloq:source-samples");
				typeof e == "string" && (this._sourceSamples = $t(e), this._sourceSamplesLimitation = this._sourceSamples.selection.metadataComplete ? null : "decoder-source-metadata-incomplete");
			} catch {
				this._sourceSamplesLimitation = "decoder-source-metadata-invalid";
			}
		});
	}
	static create(t, n) {
		let r = new e();
		return r.read(t, n), r;
	}
}, tn = class {
	static get area() {
		return V._api._ResourceLimits_Area_Get();
	}
	static set area(e) {
		V._api._ResourceLimits_Area_Set(e);
	}
	static get disk() {
		return V._api._ResourceLimits_Disk_Get();
	}
	static set disk(e) {
		V._api._ResourceLimits_Disk_Set(e);
	}
	static get height() {
		return V._api._ResourceLimits_Height_Get();
	}
	static set height(e) {
		V._api._ResourceLimits_Height_Set(e);
	}
	static get listLength() {
		return V._api._ResourceLimits_ListLength_Get();
	}
	static set listLength(e) {
		V._api._ResourceLimits_ListLength_Set(e);
	}
	static get maxMemoryRequest() {
		return V._api._ResourceLimits_MaxMemoryRequest_Get();
	}
	static set maxMemoryRequest(e) {
		M.usePointer((t) => {
			V._api._ResourceLimits_MaxMemoryRequest_Set(e, t);
		});
	}
	static get maxProfileSize() {
		return V._api._ResourceLimits_MaxProfileSize_Get();
	}
	static set maxProfileSize(e) {
		M.usePointer((t) => {
			V._api._ResourceLimits_MaxProfileSize_Set(e, t);
		});
	}
	static get memory() {
		return V._api._ResourceLimits_Memory_Get();
	}
	static set memory(e) {
		V._api._ResourceLimits_Memory_Set(e);
	}
	static get time() {
		return V._api._ResourceLimits_Time_Get();
	}
	static set time(e) {
		V._api._ResourceLimits_Time_Set(e);
	}
	static get width() {
		return V._api._ResourceLimits_Width_Get();
	}
	static set width(e) {
		V._api._ResourceLimits_Width_Set(e);
	}
}, nn = class {
	constructor(e) {
		this.complexOperator = e;
	}
	complexOperator;
	signalToNoiseRatio;
	_setArtifacts(e) {
		this.signalToNoiseRatio !== void 0 && e.setArtifact("complex:snr", this.signalToNoiseRatio);
	}
}, rn = class {
	constructor(e) {
		this.method = e;
	}
	method;
	bestFit = !1;
	scale;
	viewport;
	_setArtifacts(e) {
		this.scale !== void 0 && e.setArtifact("distort:scale", this.scale.toString()), this.viewport !== void 0 && e.setArtifact("distort:viewport", this.viewport.toString());
	}
}, an = class extends ve {
	constructor(e) {
		let t = V._api._MontageSettings_Create(), n = V._api._MontageSettings_Dispose;
		super(t, n), e.backgroundColor !== void 0 && e.backgroundColor._use((e) => {
			V._api._MontageSettings_SetBackgroundColor(this._instance, e);
		}), e.borderColor !== void 0 && e.borderColor._use((e) => {
			V._api._MontageSettings_SetBorderColor(this._instance, e);
		}), e.borderWidth !== void 0 && V._api._MontageSettings_SetBorderWidth(this._instance, O(e.borderWidth)), e.fillColor !== void 0 && e.fillColor._use((e) => {
			V._api._MontageSettings_SetFillColor(this._instance, e);
		}), e.font !== void 0 && E(q._getFontFileName(e.font), (e) => {
			V._api._MontageSettings_SetFont(this._instance, e);
		}), e.fontPointsize !== void 0 && V._api._MontageSettings_SetFontPointsize(this._instance, e.fontPointsize), e.frameGeometry !== void 0 && E(e.frameGeometry.toString(), (e) => {
			V._api._MontageSettings_SetFrameGeometry(this._instance, e);
		}), e.geometry !== void 0 && E(e.geometry.toString(), (e) => {
			V._api._MontageSettings_SetGeometry(this._instance, e);
		}), e.gravity !== void 0 && V._api._MontageSettings_SetGravity(this._instance, O(e.gravity)), e.shadow !== void 0 && V._api._MontageSettings_SetShadow(this._instance, +!!e.shadow), e.strokeColor !== void 0 && e.strokeColor._use((e) => {
			V._api._MontageSettings_SetStrokeColor(this._instance, e);
		}), e.textureFileName !== void 0 && E(e.textureFileName, (e) => {
			V._api._MontageSettings_SetTextureFileName(this._instance, e);
		}), e.tileGeometry !== void 0 && E(e.tileGeometry.toString(), (e) => {
			V._api._MontageSettings_SetTileGeometry(this._instance, e);
		}), e.title !== void 0 && E(e.title, (e) => {
			V._api._MontageSettings_SetTitle(this._instance, e);
		});
	}
}, on = class {
	backgroundColor;
	borderColor;
	borderWidth;
	fillColor;
	font;
	fontPointsize;
	frameGeometry;
	geometry;
	gravity;
	label;
	shadow;
	strokeColor;
	textureFileName;
	tileGeometry;
	title;
	transparentColor;
	_use(e) {
		let t = new an(this);
		return A._disposeAfterExecution(t, e);
	}
}, sn = class {
	constructor(e, t, n) {
		this.method = e, this.kernel = t, n !== void 0 && (this.kernel += `:${n}`);
	}
	channels = h.Composite;
	convolveBias;
	convolveScale;
	iterations = 1;
	kernel;
	method;
}, cn = class {
	constructor(e, t = 0) {
		this.minimum = e, this.maximum = t;
	}
	minimum;
	maximum;
	toString() {
		return this.maximum === 0 ? this.minimum.toString() : `${this.minimum}-${this.maximum}`;
	}
};
//#endregion
export { ee as AlphaAction, Et as AutoThresholdMethod, Be as ChannelPerceptualHash, z as ChannelStatistics, h as Channels, te as ChromaticityInfo, Dt as ClassType, y as ColorProfile, g as ColorSpace, ne as ColorSpaceNames, b as ColorTransformMode, Ot as ColorType, ae as CompareResult, oe as CompareSettings, kt as ComplexOperator, nn as ComplexSettings, x as CompositeOperator, At as CompressionMethod, t as ConfigurationFile, r as ConfigurationFiles, pe as ConnectedComponent, me as ConnectedComponentsSettings, a as DefinesCreator, k as Density, he as DensityUnit, J as DistortMethod, rn as DistortSettings, Ne as DitherMethod, Wt as DngInterpolation, Gt as DngOutputColor, Kt as DngReadDefines, o as DrawableAffine, s as DrawableBorderColor, c as DrawableColor, l as DrawableFillColor, u as DrawableFillOpacity, d as DrawableFillRule, et as DrawableFont, f as DrawableFontPointSize, tt as DrawableGravity, nt as DrawableLine, rt as DrawablePath, it as DrawablePoint, at as DrawableRectangle, ot as DrawableRoundRectangle, st as DrawableStrokeColor, ct as DrawableStrokeDashArray, lt as DrawableStrokeDashOffset, ut as DrawableStrokeWidth, vt as DrawableText, dt as DrawableTextAlignment, ft as DrawableTextAntiAlias, pt as DrawableTextDecoration, mt as DrawableTextInterlineSpacing, ht as DrawableTextInterwordSpacing, gt as DrawableTextKerning, _t as DrawableTextUnderColor, Tt as Drawables, Se as DrawingWand, jt as Endian, Y as ErrorMetric, Mt as EvaluateOperator, Ae as FillRule, X as FilterType, Nt as GifDisposeMethod, F as Gravity, V as ImageMagick, ie as ImageProfile, Pt as Interlace, Ft as Kernel, p as LogEvent, K as LogEventTypes, q as Magick, D as MagickColor, yt as MagickColors, i as MagickDefine, S as MagickError, Te as MagickErrorInfo, se as MagickErrorSeverity, Ee as MagickFormat, G as MagickFormatInfo, de as MagickGeometry, Ye as MagickImage, L as MagickImageCollection, en as MagickImageInfo, I as MagickReadSettings, Me as MagickSettings, on as MontageSettings, It as MorphologyMethod, sn as MorphologySettings, ve as NativeInstance, Lt as NoiseType, Re as OffsetInfo, Rt as Orientation, zt as PaintMethod, bt as PathLineToAbs, xt as PathLineToRel, St as PathMoveToAbs, Ct as PathMoveToRel, wt as Paths, R as Percentage, Ve as PerceptualHash, m as PixelChannel, He as PixelCollection, Ue as PixelIntensityMethod, We as PixelInterpolateMethod, fe as Point, Ge as PrimaryInfo, Qe as ProgressEvent, Fe as QuantizeSettings, ce as Quantum, Bt as RenderingIntent, tn as ResourceLimits, Ke as Statistics, Vt as TextAlignment, Ht as TextDecoration, cn as Threshold, N as TypeMetric, Ut as VirtualPixelMethod, Je as WarningEvent, Ce as _getGravityEdges, we as _getGravityName, e as _isByteArray, U as initializeImageMagick, W as initializeImageMagickx64 };
