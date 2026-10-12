"""Independently check a real D2PRL large-source NPZ without loading full planes.

The browser proof supplies the six complete plane hashes. Optional reference
metadata supplies independent native hashes; no oracle .bin files are read.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import zipfile
import zlib

PAGE_BYTES = 1024 * 1024
HEADER_BYTES = 65536
JSON_BYTES = 8 * 1024 * 1024
FIELDS = ("map", "mask", "analyzed", "candidates", "target", "source")
FLOAT_FIELDS = {"map", "target", "source"}
JSON_FIELDS = ("metadata_json", "browser_provenance_json")


def require(value, message):
    if not value:
        raise ValueError(message)


def file_sha(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while True:
            part = stream.read(PAGE_BYTES)
            if not part:
                break
            digest.update(part)
    return digest.hexdigest()


def read_json(path):
    with path.open(encoding="utf-8") as stream:
        value = json.load(stream)
    require(isinstance(value, dict), "JSON proof/reference must be an object")
    return value


class CrcReader:
    """Count and checksum the NPY header and payload in one bounded ZIP pass."""
    def __init__(self, stream):
        self.stream = stream
        self.position = 0
        self.crc = 0

    def read(self, size=-1):
        require(size >= 0, "Unbounded ZIP reads are not permitted")
        value = self.stream.read(size)
        self.position += len(value)
        self.crc = zlib.crc32(value, self.crc)
        return value

    def tell(self):
        return self.position


def npy_header(stream, info, np):
    version = np.lib.format.read_magic(stream)
    require(version in ((1, 0), (2, 0)), "Unsupported NPY header version")
    reader = (np.lib.format.read_array_header_1_0 if version == (1, 0)
              else np.lib.format.read_array_header_2_0)
    shape, fortran, dtype = reader(stream, max_header_size=HEADER_BYTES)
    require(not fortran and not dtype.hasobject, "C-order non-object NPY required")
    require(all(isinstance(n, int) and n >= 0 for n in shape), "Invalid NPY shape")
    elements = 1
    for extent in shape:
        elements *= extent
    payload_bytes = elements * dtype.itemsize
    require(stream.tell() + payload_bytes == info.file_size, "NPY declared extent differs from ZIP member")
    return shape, dtype, elements, payload_bytes


def finish_crc(stream, info):
    require(stream.read(1) == b"", "Unexpected trailing NPY payload")
    require(stream.tell() == info.file_size and stream.crc == info.CRC,
            "Complete ZIP member CRC differs: " + info.filename)


def select_browser(document, byte_length, archive_sha):
    rows = document.get("rows")
    rows = rows if isinstance(rows, list) else [document]
    matches = [row for row in rows if isinstance(row, dict)
               and isinstance(row.get("exported"), dict)
               and row["exported"].get("byteLength") == byte_length
               and row["exported"].get("sha256") == archive_sha]
    require(len(matches) == 1, "Exactly one browser export must match archive bytes and SHA")
    browser = matches[0]
    require(browser.get("status") == "passed", "Selected browser result is not passed")
    require(isinstance(browser.get("records"), list) and browser["records"], "Browser result records required")
    final = browser["records"][-1]
    require(final.get("name") == "refilter" and final.get("inferences") == 0
            and final.get("metrics", {}).get("inferences") == 0,
            "The exported cached refilter must report zero inference")
    require(set(final.get("outputs", {})) == set(FIELDS), "Exactly six browser scientific outputs required")
    dimensions = browser.get("dimensions")
    require(isinstance(dimensions, list) and len(dimensions) == 2
            and all(isinstance(n, int) and n > 0 for n in dimensions), "Source dimensions required")
    for key in ("sourceSha256", "pixelSha256"):
        value = browser.get(key)
        require(isinstance(value, str) and len(value) == 64
                and all(c in "0123456789abcdef" for c in value), "Pinned " + key + " required")
    if isinstance(document.get("source"), dict):
        source = document["source"]
        require(source.get("dimensions") == dimensions
                and source.get("pixelSha256") == browser["pixelSha256"]
                and source.get("original", {}).get("sha256") == browser["sourceSha256"],
                "Top-level and selected browser source identities differ")
    return browser, final, dimensions


def native_outputs(reference, browser, final):
    if reference is None:
        return None
    require([reference.get("width"), reference.get("height")] == browser["dimensions"]
            and reference.get("pixelSha256") == browser["pixelSha256"]
            and reference.get("original", {}).get("sha256") == browser["sourceSha256"],
            "Reference and browser source identities differ")
    records = reference.get("records", [])
    if not records:
        require(reference.get("oracle", {}).get("status") == "not-generated",
                "Reference has no native output hashes or explicit source-only declaration")
        return None
    matches = [record for record in records if record.get("name") == final["name"]]
    require(len(matches) == 1 and set(matches[0].get("outputs", {})) == set(FIELDS),
            "Independent native refilter hashes for all six outputs required")
    return matches[0]["outputs"]


def check(args):
    import numpy as np

    proof_path, npz_path, output_path = (Path(value).resolve() for value in
                                       (args.browser_proof, args.npz, args.output))
    reference_path = Path(args.reference).resolve() if args.reference else None
    require(output_path not in {proof_path, npz_path, reference_path}, "Output must not overwrite an input")
    document = read_json(proof_path)
    byte_length = npz_path.stat().st_size
    archive_sha = file_sha(npz_path)
    browser, final, dimensions = select_browser(document, byte_length, archive_sha)
    reference = read_json(reference_path) if reference_path else None
    independent = native_outputs(reference, browser, final)
    expected_shape = (dimensions[1], dimensions[0])
    array_records, crc_records = [], []
    metadata_headers = {}
    with zipfile.ZipFile(npz_path) as archive:
        expected_names = {key + ".npy" for key in (*FIELDS, *JSON_FIELDS)}
        names = archive.namelist()
        require(len(names) == len(expected_names) and set(names) == expected_names,
                "NPZ must contain exactly six arrays and the two metadata entries")
        require(all(not info.flag_bits & 1 for info in archive.infolist()), "Encrypted NPZ members are not supported")
        for key in (*FIELDS, *JSON_FIELDS):
            info = archive.getinfo(key + ".npy")
            with archive.open(info) as member:
                stream = CrcReader(member)
                shape, dtype, elements, payload_bytes = npy_header(stream, info, np)
                if key in JSON_FIELDS:
                    require(shape == () and dtype.kind == "U" and payload_bytes <= JSON_BYTES,
                            "Bounded scalar Unicode JSON metadata required")
                    remaining = payload_bytes
                    while remaining:
                        part = stream.read(min(PAGE_BYTES, remaining))
                        require(part, "Truncated JSON payload")
                        remaining -= len(part)
                    metadata_headers[key] = {"bytes": payload_bytes, "dtype": str(dtype)}
                else:
                    spec = final["outputs"][key]
                    desired = np.dtype("<f4" if key in FLOAT_FIELDS else "u1")
                    require(shape == expected_shape and dtype == desired,
                            "Scientific array shape/dtype differs: " + key)
                    require(spec.get("shape") == list(shape) and spec.get("dtype") == str(dtype)
                            and spec.get("bytes") == payload_bytes,
                            "Browser scientific extent differs: " + key)
                    digest, nonzero, finite, binary, remaining = hashlib.sha256(), 0, True, True, payload_bytes
                    while remaining:
                        part = stream.read(min(PAGE_BYTES, remaining))
                        require(part and len(part) % dtype.itemsize == 0, "Truncated/misaligned scientific payload")
                        remaining -= len(part)
                        digest.update(part)
                        values = np.frombuffer(part, dtype=dtype)
                        nonzero += int(np.count_nonzero(values))
                        finite = finite and bool(np.isfinite(values).all())
                        if key != "map":
                            binary = binary and bool(((values == 0) | (values == 1)).all())
                    digest = digest.hexdigest()
                    require(digest == spec.get("sha256") and finite and spec.get("finite") is True
                            and nonzero == spec.get("nonzero") and (key == "map" or binary),
                            "Complete browser scientific plane check differs: " + key)
                    if independent is not None:
                        native = independent[key]
                        require(native.get("shape") == list(shape) and native.get("dtype") == str(dtype)
                                and native.get("bytes") == payload_bytes and native.get("sha256") == digest,
                                "Complete independent native plane SHA differs: " + key)
                    array_records.append(dict(array=key, shape=list(shape), dtype=str(dtype),
                                              bytes=payload_bytes, sha256=digest, nonzero=nonzero,
                                              finite=finite, binary=None if key == "map" else binary,
                                              nativeHashChecked=independent is not None))
                finish_crc(stream, info)
                crc_records.append(dict(member=info.filename, bytes=info.file_size, crc32=info.CRC, passed=True))

    # np.load explicitly refuses pickle. Only bounded scalar JSON entries are
    # materialized; scientific members above were read as at most1MiB windows.
    with np.load(npz_path, allow_pickle=False) as arrays:
        require(set(arrays.files) == set(FIELDS) | set(JSON_FIELDS), "NumPy NPZ names differ")
        metadata = json.loads(arrays["metadata_json"].item())
        provenance = json.loads(arrays["browser_provenance_json"].item())
    require(isinstance(metadata, dict) and isinstance(provenance, dict), "Metadata JSON objects required")
    require(metadata.get("pixelSha256") == browser["pixelSha256"]
            and metadata.get("inferences") == 0 and metadata.get("inference_performed") is False,
            "Cached export RGB identity/inference provenance differs")
    require(provenance.get("originalSha256") == browser["sourceSha256"]
            and provenance.get("layout") == "segmented"
            and provenance.get("operation") == "ai.clones.d2prl",
            "Original Blob/layout/operation provenance differs")
    require(metadata.get("sourceProvenance", {}).get("originalSha256") == browser["sourceSha256"],
            "Analysis source Blob provenance differs")
    require(provenance.get("decode", {}).get("layout") == "segmented-scanlines",
            "Actual segmented source decode provenance required")
    requested = browser.get("backend")
    require(requested in ("cpu", "webgpu"), "Explicit browser backend required")
    require(metadata.get("backend") == ("gpu" if requested == "webgpu" else "cpu")
            and provenance.get("backend") == ("webgpu-convolutions-wasm" if requested == "webgpu" else "cpu-wasm"),
            "Export backend differs from the actually measured browser backend")
    model_keys = {"bytes", "sha256", "modelId", "checkpointSha256"}
    exported_model, measured_model = provenance.get("model"), browser.get("model")
    require(isinstance(exported_model, dict) and isinstance(measured_model, dict)
            and set(exported_model) == model_keys
            and all(exported_model[key] == measured_model.get(key) for key in model_keys),
            "Export model identity differs")
    executions = final.get("executions")
    require(isinstance(executions, list) and executions, "Measured per-zone executions required")
    require(metadata.get("cache_hits") == len(executions), "Cached raw-grid count differs")
    zones = metadata.get("zones")
    require(isinstance(zones, list) and len(zones) == len(executions), "Export zone geometry differs")
    for zone, measured in zip(zones, executions):
        require(all(zone.get(key) == measured.get(key) for key in ("id", "bounds", "decision", "execution")),
                "Per-zone model execution/decision provenance differs")

    return dict(schema=1, status="passed", checkedAtUtc=datetime.now(timezone.utc).isoformat(),
                scope="Actual browser NPZ: complete archive SHA/bytes, all eight ZIP member CRCs, NumPy allow_pickle=False, six full plane SHA/shapes/dtypes, source Blob/RGB/layout/backend and zero cached inference. Optional native comparison uses independent manifest hashes without oracle bins.",
                browserProof=dict(file=str(proof_path), sha256=file_sha(proof_path), variant=browser.get("variant"),
                                  meaning="Input JSON bytes at check time; a runner may append this independent result afterward."),
                reference=dict(file=str(reference_path), sha256=file_sha(reference_path), nativePlaneHashesChecked=independent is not None) if reference_path else None,
                bytes=byte_length, sha256=archive_sha,
                archive=dict(file=str(npz_path), bytes=byte_length, sha256=archive_sha),
                dimensions=dimensions, sourceSha256=browser["sourceSha256"], pixelSha256=browser["pixelSha256"],
                backend=requested, exportBackend=provenance["backend"], cachedInferences=0,
                numpy=np.__version__, allowPickle=False, scientificPageBytes=PAGE_BYTES,
                metadataMaximumBytes=JSON_BYTES, fullScientificArraysMaterialized=0,
                metadataHeaders=metadata_headers, zipCrc=crc_records, records=array_records,
                speedClaim=None, rssClaim=None)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--browser-proof", required=True, help="Direct browser row JSON or runner report.json with rows")
    parser.add_argument("--npz", required=True, help="Actual persisted baseline/candidate.npz")
    parser.add_argument("--output", required=True, help="Independent JSON check result, distinct from all inputs")
    parser.add_argument("--reference", help="Optional source-only30MP manifest or native96MP reference with six refilter hashes")
    args = parser.parse_args()
    try:
        report = check(args)
    except Exception as error:
        report = dict(schema=1, status="rejected", error=dict(type=type(error).__name__, message=str(error)),
                      scope="Independent NPZ check failed; no model/browser work performed.")
    output = Path(args.output).resolve()
    inputs = {Path(args.browser_proof).resolve(), Path(args.npz).resolve()}
    if args.reference:
        inputs.add(Path(args.reference).resolve())
    require(output not in inputs, "Output must not overwrite an input")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(dict(status=report["status"], output=str(output), arrays=len(report.get("records", [])),
                          bytes=report.get("archive", {}).get("bytes"), error=report.get("error"))), flush=True)
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
