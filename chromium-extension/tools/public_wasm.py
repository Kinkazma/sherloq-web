"""Remove machine-specific prefixes from WebAssembly diagnostic strings only.

Keep all offsets and section sizes. Instructions, imports, exports and numerical
data stay unchanged. This does not recompile or optimize a processing engine.
"""
import re


def public_wasm(data):
    if not data.startswith(b'\0asm\x01\0\0\0'):
        raise ValueError('Invalid WebAssembly header')

    def leb(at):
        value = shift = 0
        while True:
            byte = data[at]
            at += 1
            value |= (byte & 127) << shift
            if not byte & 128:
                return value, at
            shift += 7
            if shift > 35:
                raise ValueError('Invalid WebAssembly section size')

    result = bytearray(data)
    at = 8
    pattern = re.compile(rb'/(?:Users|home)/[^\0\r\n]{1,512}?(?=/opencv-[0-9])')
    while at < len(data):
        section = data[at]
        size, payload = leb(at + 1)
        end = payload + size
        if end > len(data):
            raise ValueError('Truncated WebAssembly section')
        if section == 11:  # Data: OpenCV __FILE__ constants in diagnostic messages.
            for match in pattern.finditer(data, payload, end):
                replacement = b'/build/' + b'_' * (len(match.group()) - 7)
                result[match.start():match.end()] = replacement
        at = end
    if re.search(rb'/Users/[A-Za-z0-9_-]+/|/home/[A-Za-z0-9_-]+/', result):
        raise ValueError('Unrecognized private path: rebuild this runtime')
    assert len(result) == len(data)
    return bytes(result)
