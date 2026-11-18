// Source header facts copied from the same already-needed Q8 Ping object.
export interface SourceSampleChannel {
    readonly name: string;
    readonly role: 'color' | 'alpha' | 'index' | 'meta';
    readonly codedType: 'uint' | 'sint' | 'float' | 'shared-exponent' | 'unknown';
    readonly codedBits: number | null;
    readonly exponentBits: number;
}
export interface SourceSamplesInfo {
    readonly schema: 'sherloq.coder-source-samples/1';
    readonly precisionOrigin: 'decoder-source-header';
    readonly coder: string;
    readonly sourceModel: string;
    readonly channels: ReadonlyArray<SourceSampleChannel>;
    readonly alpha: Readonly<{present: boolean; association: 'unknown' | 'straight' | 'premultiplied'}>;
    readonly valueEncoding: Readonly<Record<string, string | number | null>>;
    readonly selection: Readonly<{
        preferredQuantumDepth: 8 | 16 | 32 | null;
        metadataComplete: boolean;
        preservationQualified: false;
        reason: string;
    }>;
}
const maximumBytes = 16384;
const encoder = new TextEncoder();
const roles = new Set(['color', 'alpha', 'index', 'meta']);
const types = new Set(['uint', 'sint', 'float', 'shared-exponent', 'unknown']);
function safeText(value: unknown, label: string): void {
    if (typeof value !== 'string' || encoder.encode(value).length > 127)
        throw new TypeError('Invalid ' + label);
}
function bits(value: unknown): boolean {
    return value === null || typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 64;
}
/** @internal */
export function parseSourceFacts(json: string): SourceSamplesInfo {
    if (typeof json !== 'string' || encoder.encode(json).length >= maximumBytes)
        throw new TypeError('Invalid metadata size');
    const f = JSON.parse(json) as SourceSamplesInfo;
    if (!f || f.schema !== 'sherloq.coder-source-samples/1' || f.precisionOrigin !== 'decoder-source-header' ||
        !Array.isArray(f.channels) || !f.channels.length || f.channels.length > 64)
        throw new TypeError('Invalid source metadata');
    safeText(f.coder, 'coder');
    safeText(f.sourceModel, 'source model');
    if (Object.keys(f).some(k => !['schema', 'precisionOrigin', 'coder', 'sourceModel', 'channels', 'alpha', 'valueEncoding'].includes(k)))
        throw new TypeError('Unknown source metadata field');
    const names = new Set<string>();
    for (const c of f.channels) {
        if (Object.keys(c).some(k => !['name', 'role', 'codedType', 'codedBits', 'exponentBits'].includes(k)))
            throw new TypeError('Unknown source channel field');
        safeText(c.name, 'channel name');
        if (names.has(c.name)) throw new TypeError('Duplicate source channel');
        names.add(c.name);
        if (!roles.has(c.role) || !types.has(c.codedType) || !bits(c.codedBits) ||
            !Number.isInteger(c.exponentBits) || c.exponentBits < 0 || c.exponentBits > 64)
            throw new TypeError('Invalid source channel');
    }
    if (!f.alpha || typeof f.alpha.present !== 'boolean' || !['unknown', 'straight', 'premultiplied'].includes(f.alpha.association) ||
        f.alpha.present !== f.channels.some(c => c.role === 'alpha'))
        throw new TypeError('Invalid source alpha');
    if (!f.valueEncoding || typeof f.valueEncoding !== 'object' || Array.isArray(f.valueEncoding))
        throw new TypeError('Invalid source encoding');
    for (const [key, value] of Object.entries(f.valueEncoding)) {
        safeText(key, 'encoding key');
        if (!(value === null || typeof value === 'number' && Number.isFinite(value) ||
              typeof value === 'string' && encoder.encode(value).length <= 127))
            throw new TypeError('Invalid source encoding value');
    }
    const known = f.channels.every(c => c.codedType !== 'unknown' && c.codedBits !== null);
    const floating = f.channels.some(c => c.codedType === 'float' || c.codedType === 'shared-exponent');
    const maximum = Math.max(...f.channels.map(c => c.codedBits ?? 0));
    const preferredQuantumDepth = floating || maximum > 16 ? 32 : maximum > 8 ? 16 : known ? 8 : null;
    return Object.freeze({...f, channels: Object.freeze(f.channels.map(c => Object.freeze({...c}))),
        alpha: Object.freeze({...f.alpha}), valueEncoding: Object.freeze({...f.valueEncoding}),
        selection: Object.freeze({preferredQuantumDepth,
            metadataComplete: known && !(typeof f.valueEncoding.uninspectedExtraChannels === 'number' && f.valueEncoding.uninspectedExtraChannels > 0),
            preservationQualified: false,
            reason: floating ? 'floating-decoded-domain' : !known ? 'source-metadata-incomplete' : maximum > 8 ? 'declared-integer-precision' : 'declared-eight-bit-or-lower'})});
}
