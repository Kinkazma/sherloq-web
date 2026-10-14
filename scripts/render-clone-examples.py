"""Lay out genuine engine outputs and encode lightweight gallery previews."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib
import json
import shutil

REPO = Path(__file__).resolve().parents[1]
RUNS = REPO / "scripts/results"
RESULTS = REPO / "examples/results"
PREVIEWS = REPO / "screenshots/readme-webp"
def font(size, bold=False):
    for name in (["DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"] if bold else ["DejaVuSans.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"]):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            pass
    return ImageFont.load_default()

FONT = font(16)
TITLE_FONT = font(21, True)
sha = lambda data: hashlib.sha256(data).hexdigest()


def preview(source):
    original = Image.open(source).convert("RGB")
    frame = original.copy()
    frame.thumbnail((2400, 1800), Image.Resampling.LANCZOS)
    target = PREVIEWS / source.relative_to(REPO).with_suffix(".webp")
    target.parent.mkdir(parents=True, exist_ok=True)
    quality = 88
    while True:
        frame.save(target, "WEBP", quality=quality, method=6)
        if target.stat().st_size <= 500000:
            break
        if quality > 62:
            quality -= 4
        else:
            frame.thumbnail((int(frame.width * .9), int(frame.height * .9)), Image.Resampling.LANCZOS)
    return dict(source=str(source.relative_to(REPO)), preview=str(target.relative_to(REPO)),
                sourceBytes=source.stat().st_size, previewBytes=target.stat().st_size,
                sourceSha256=sha(source.read_bytes()), previewSha256=sha(target.read_bytes()),
                sourceDimensions=list(original.size), previewDimensions=list(frame.size), quality=quality)


def board(target, title, panels, columns=None):
    columns = columns or len(panels)
    rows = (len(panels) + columns - 1) // columns
    tile_width, tile_height, margin, gap = 416, 320, 20, 16
    image = Image.new("RGB", (2 * margin + columns * tile_width + (columns - 1) * gap,
                               68 + rows * (tile_height + 38) + margin), "#f6f8fa")
    draw = ImageDraw.Draw(image)
    draw.text((margin, 20), title, font=TITLE_FONT, fill="#1f2328")
    for index, (label, filename) in enumerate(panels):
        x = margin + (index % columns) * (tile_width + gap)
        y = 68 + (index // columns) * (tile_height + 38)
        draw.text((x, y), label, font=FONT, fill="#1f2328")
        frame = Image.open(filename).convert("RGB")
        if frame.size != (tile_width, tile_height):
            raise ValueError("This layout requires unchanged 416 × 320 rasters")
        image.paste(frame, (x, y + 28))
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target)
    return target


def main():
    ids = ["three-cells-mgcfdn", "three-cells-cmseg-generalization", "three-cells-selfdm-map",
           "three-cells-selfdm-proposal", "three-cells-aliked", "three-cells-xfeat-pair",
           "three-cells-efficient-loftr", "three-cells-ssg", "microscopy-ppocrv6"]
    records = []
    new_previews = [preview(REPO / "examples/three-cells/input.png")]
    for name in ids:
        source, destination = RUNS / name, RESULTS / name
        destination.mkdir(parents=True, exist_ok=True)
        record = json.loads((source / "result.json").read_text())
        # Never copy exploratory or obsolete images into the published set.
        for output in record["outputs"] + record.get("scientific", []):
            item = source / output["file"]
            if sha(item.read_bytes()) != output["sha256"]:
                raise ValueError("Output hash mismatch: " + str(item))
            shutil.copyfile(item, destination / item.name)
        if record["job"]["operation"] == "tampering.copyMove.sparse":
            style = record["result"]["style"]
            if any(style.get(key) for key in ("circles", "lines", "points")) or not style.get("areas"):
                raise ValueError("Only the native Biomes presentation is permitted")
        # Transient browser origins are not useful public provenance.
        import re
        serialized = json.dumps(record, ensure_ascii=False, indent=2)
        serialized = re.sub(r"http://127\.0\.0\.1:\d+/", "", serialized)
        (destination / "result.json").write_text(serialized + "\n")
        records.append(dict(id=name, operation=record["job"]["operation"], input=record["job"]["input"],
                            inputSha256=record["inputSha256"], sourceCommit=record["sourceCommit"],
                            engine=record.get("engine"), sourceDimensions=record["sourceDimensions"],
                            outputs=record["outputs"], scientific=record.get("scientific", [])))

    inp = REPO / "examples/three-cells/input.png"
    output = lambda name, file="overlay.png": RESULTS / name / file
    boards = [
        board(RESULTS / "three-cells-localization/comparison.png", "CMSeg-Net and MGCFDN", [
            ("Input", inp), ("CMSeg-Net overlay", output("three-cells-cmseg-generalization")),
            ("MGCFDN overlay", output("three-cells-mgcfdn"))]),
        board(RESULTS / "three-cells-selfdm/comparison.png", "SelfDM", [
            ("Input", inp), ("Initial map overlay", output("three-cells-selfdm-map")),
            ("Complete pipeline overlay", output("three-cells-selfdm-proposal")),
            ("Complete pipeline mask", output("three-cells-selfdm-proposal", "mask.png"))], columns=2),
        board(RESULTS / "three-cells-learned-biomes/comparison.png", "Learned matching - Biomes", [
            ("Input", inp), ("XFeat + LighterGlue - selected pair", output("three-cells-xfeat-pair", "result.png")),
            ("ALIKED + LightGlue - full image", output("three-cells-aliked", "result.png"))]),
        board(RESULTS / "three-cells-efficient-loftr/comparison.png", "EfficientLoFTR - Biomes", [
            ("Input", inp), ("Two selected regions", output("three-cells-efficient-loftr", "result.png"))]),
        board(RESULTS / "three-cells-ssg/comparison.png", "SSG - localized mask", [
            ("Input", inp), ("Native SSIM mask", output("three-cells-ssg", "result.png"))]),
    ]
    for target in boards:
        new_previews.append(preview(target))
    new_previews.append(preview(output("microscopy-ppocrv6", "result.png")))
    # Keep native rasters directly accessible, including views not embedded in README.
    manifest_file = RESULTS / "manifest.json"
    manifest = json.loads(manifest_file.read_text())
    replaced = {r["id"] for r in records}
    manifest["examples"] = [r for r in manifest["examples"] if r["id"] not in replaced] + records
    manifest["lastUpdated"] = "2026-10-14"
    manifest["scope"] = "Illustrative direct-engine outputs, with per-run engine and source identities. Not accuracy certification. Preview reductions are display-only."
    manifest_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    preview_file = PREVIEWS / "manifest.json"
    manifest = json.loads(preview_file.read_text())
    replaced = {r["preview"] for r in new_previews}
    manifest["images"] = [r for r in manifest["images"] if r["preview"] not in replaced] + new_previews
    preview_file.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"runs": len(records), "previews": len(new_previews),
                      "previewBytes": sum(r["previewBytes"] for r in new_previews),
                      "largestPreview": max(r["previewBytes"] for r in new_previews)}))


if __name__ == "__main__":
    main()
