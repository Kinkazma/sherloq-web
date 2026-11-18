import "../../runtime-context.js?v=0.33.3";
// Unprofiled presentation only. The U16 rules match the existing native
// PNG/TIFF code path, including the intermediate rounded CMYK code.
import {EngineError} from './errors.js';
const code16 = value => Math.round(value / 257);
const subtract16 = (ink, white) => Math.round((65535 - ink) * white / 65535);
function nominal(value, white) {
  if (!Number.isFinite(value)) throw new EngineError('COLOR_DOMAIN_UNSUPPORTED', 'Stored non-finite colour has no admitted numeric projection.');
  return Math.max(0, Math.min(1, value / white));
}
export function projectCodeViewInto(samples, output, {model, floating, inputUnits, d}) {
  const stride = d.channels;
  if (!floating) {
    if (model === 'GRAY') for (let i = 0, o = 0; i < samples.length; i += stride) {
      const value = code16(samples[i]); output[o++] = value; output[o++] = value; output[o++] = value;
    }
    else if (model === 'CMYK') for (let i = 0, o = 0; i < samples.length; i += stride) {
      const white = 65535 - samples[i + 3];
      output[o++] = code16(subtract16(samples[i], white)); output[o++] = code16(subtract16(samples[i + 1], white)); output[o++] = code16(subtract16(samples[i + 2], white));
    }
    else for (let i = 0, o = 0; i < samples.length; i += stride) {
      output[o++] = code16(samples[i]); output[o++] = code16(samples[i + 1]); output[o++] = code16(samples[i + 2]);
    }
    return output;
  }
  // An explicit clipped display of numeric codes. There is no declared
  // transfer, assumed ICC profile, gamut conversion or HDR tone mapping.
  if (model === 'GRAY') for (let i = 0, o = 0; i < samples.length; i += stride) {
    const value = Math.round(255 * nominal(samples[i], 1)); output[o++] = value; output[o++] = value; output[o++] = value;
  }
  else if (model === 'CMYK') for (let i = 0, o = 0; i < samples.length; i += stride) {
    const level = inputUnits === 'percent-ink' ? 100 : 1, white = 1 - nominal(samples[i + 3], level);
    output[o++] = Math.round(255 * (1 - nominal(samples[i], level)) * white);
    output[o++] = Math.round(255 * (1 - nominal(samples[i + 1], level)) * white);
    output[o++] = Math.round(255 * (1 - nominal(samples[i + 2], level)) * white);
  }
  else for (let i = 0, o = 0; i < samples.length; i += stride) {
    output[o++] = Math.round(255 * nominal(samples[i], 1)); output[o++] = Math.round(255 * nominal(samples[i + 1], 1)); output[o++] = Math.round(255 * nominal(samples[i + 2], 1));
  }
  return output;
}
