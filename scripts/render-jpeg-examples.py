"""Plot saved engine values. Never infer or modify detector measurements."""
from pathlib import Path
import hashlib
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from PIL import Image

root = Path(__file__).resolve().parent / 'results'
for name in ('street-recompression', 'street-multiple-compression'):
    folder = root / name
    record = json.loads((folder / 'numeric.json').read_text())
    data = record['result']['data']
    fig, ax = plt.subplots(figsize=(10, 5.5), dpi=160, layout='constrained')
    if name == 'street-recompression':
        ax.plot(data['qualities'], data['raw'], color='#2466ad', linewidth=2)
        ax.set(xlabel='JPEG quality', ylabel='Mean absolute pixel error (0–255)',
               title='Street Photo — JPEG recompression curve', xlim=(0, 100))
        ax.grid(alpha=.2)
        caption = '101 recompressions of the original JPEG. The curve does not count previous compressions.'
    else:
        rows = data['records']
        labels = [','.join(map(str, row['frequency'])) for row in rows]
        ax.bar(labels, [row['score'] for row in rows], color=['#2466ad' if row['eligible'] else '#999999' for row in rows])
        ax.axhline(data['threshold'], color='#b85245', linestyle='--', label=f"Decision threshold: {data['threshold']}")
        ax.set(xlabel='Luminance DCT frequency (u,v)', ylabel='Lattice-depletion score (not a probability)',
               title='Street Photo — aligned double-JPEG analysis', ylim=(0, 1.05))
        ax.legend(loc='upper right')
        caption = f"Engine result: {data['verdict']} · {data['supporting_frequencies']}/{data['tested_frequencies']} supporting frequencies. Not an authenticity verdict."
    fig.text(.5, -.035, caption, ha='center', fontsize=9)
    output = folder / 'result.png'
    fig.savefig(output, bbox_inches='tight', facecolor='white')
    plt.close(fig)
    image = Image.open(output).convert('RGB')
    sha = lambda b: hashlib.sha256(b).hexdigest()
    record.update(runtime='Direct Node.js execution of the web engine; chart drawn from its unchanged numeric values with Matplotlib.',
                  outputDimensions=list(image.size), outputSha256=sha(output.read_bytes()),
                  rawRgbSha256=sha(image.tobytes()), presentation={'type':'numeric chart', 'script':'scripts/render-jpeg-examples.py'})
    (folder / 'result.json').write_text(json.dumps(record, indent=2) + '\n')
    print(name, data.get('verdict', 'curve'), image.size)
