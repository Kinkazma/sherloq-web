"""Ten deterministic English synthetic document examples; no detector here."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import hashlib, io, json, random, os
import numpy as np

HERE=Path(__file__).resolve().parent
DATA=HERE/'data';DATA.mkdir(exist_ok=True)
assert not (HERE/'dataset.json').exists(), 'Keep the frozen dataset; do not overwrite it.'
FONTS=Path(os.environ.get('SHERLOQ_EXAMPLE_FONTS','fonts'))
def font(size=16,name='Arial.ttf'): return ImageFont.truetype(str(FONTS/name),size)
def jpeg_roundtrip(image,quality):
    f=io.BytesIO();image.save(f,'JPEG',quality=quality,subsampling=0,optimize=False)
    f.seek(0);return Image.open(f).convert('RGB')
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()

# Decisions below are fixed before any inference. Each pair shares layout,
# paper texture and JPEG history; only one version undergoes a text edit.
specs=[
 {'title':'INVOICE','ref':'F-2026-1048','entity':'HORIZON WORKSHOP','family':'Arial.ttf',
  'lines':[('Customer','Camille Martin'),('Date','12/10/2026'),('Service','Binding and printing'),('Quantity','2 copies'),('Subtotal','123,83 EUR'),('VAT','24,77 EUR')],
  'targetLabel':'TOTAL DUE','before':'148,60 EUR','after':'948,60 EUR','method':'retype_same_font','edit':'Amount replaced using the same font and size.'},
 {'title':'RECEIPT','ref':'R-2026-7214','entity':'THE PAPER COUNTER','family':'Courier New.ttf',
  'lines':[('Date','13/10/2026 12:42'),('Item 1','Notebook    12,00 EUR'),('Item 2','Pen          3,20 EUR'),('Item 3','Folder       7,20 EUR'),('Cash','50,00 EUR'),('Change','27,60 EUR')],
  'targetLabel':'TOTAL','before':'22,40 EUR','after':'50,00 EUR','method':'copy_move','edit':'Amount copied from another line of the same receipt.'},
 {'title':'PURCHASE ORDER','ref':'BC-2026-1103','entity':'THE CARTOGRAPHERS HOUSE','family':'Arial.ttf',
  'lines':[('Buyer','Louise Bernard'),('Date','14/10/2026'),('Items','Paper and supplies'),('Quantity','12 sets'),('Delivery','Within five days'),('Payment','On receipt')],
  'targetLabel':'REFERENCE','before':'BC-2048','after':'BC-9048','method':'splice_compressed','edit':'Reference replaced with a separately JPEG Q75-compressed patch.'},
 {'title':'CERTIFICATE','ref':'A-2026-0081','entity':'THE BRIDGES ASSOCIATION','family':'Times New Roman.ttf',
  'lines':[('Name','Alex Moreau'),('Purpose','Workshop attendance'),('Location','Archive room'),('Duration','Three hours'),('Coordinator','Morgan Petit'),('Document','Demonstration example')],
  'targetLabel':'DATE','before':'11/10/2026','after':'21/10/2026','method':'retype_other_font','edit':'Date replaced using a slightly different font.'},
 {'title':'TRANSACTION STATEMENT','ref':'M-2026-1782','entity':'FICTIONAL WORKSHOP CASH OFFICE','family':'Arial.ttf',
  'lines':[('Account holder','Dominique Leroy'),('Period','October 2026'),('Test account','TEST-1782'),('Previous balance','310,00 EUR'),('Debit','48,00 EUR'),('Transaction','Expense reimbursement')],
  'targetLabel':'CREDIT','before':'125,00 EUR','after':'725,00 EUR','method':'single_character','edit':'One digit replaced; the rest of the field is unchanged.'},
]
samples=[]
for index,spec in enumerate(specs):
    rng=np.random.default_rng(2026101600+index)
    paper=np.clip(247+rng.normal(0,.65,(512,512)),0,255).astype(np.uint8)
    image=Image.fromarray(np.repeat(paper[:,:,None],3,axis=2))
    d=ImageDraw.Draw(image);body=font(15,spec['family']);valuefont=font(18,spec['family'])
    d.text((28,20),'SPECIMEN - SYNTHETIC DOCUMENT',font=font(10),fill=(115,119,126))
    d.text((28,53),spec['title'],font=font(23,'Arial Bold.ttf'),fill=(24,39,55))
    d.text((28,91),spec['entity'],font=font(14,'Arial Bold.ttf'),fill=(51,59,68))
    d.text((28,116),spec['ref'],font=body,fill=(65,68,73))
    d.line((28,145,484,145),fill=(140,151,162),width=1)
    for j,(label,value) in enumerate(spec['lines']):
        y=169+j*29
        d.text((28,y),label,font=body,fill=(80,82,86))
        d.text((185,y),value,font=body,fill=(29,32,36))
    d.line((28,357,484,357),fill=(140,151,162),width=1)
    target=(245,378)
    d.text((28,target[1]),spec['targetLabel'],font=font(16,'Arial Bold.ttf'),fill=(25,35,45))
    d.text(target,spec['before'],font=valuefont,fill=(28,31,35))
    d.text((28,453),'Fictional data - demonstration only; no administrative validity',font=font(10),fill=(104,109,115))
    d.text((28,473),'No hidden text; no editing label embedded in the file.',font=font(9),fill=(120,123,129))
    original=jpeg_roundtrip(image,95)
    altered=original.copy()
    bbox=ImageDraw.Draw(original).textbbox(target,spec['before'],font=valuefont)
    x0,y0,x1,y1=bbox
    replacement=spec['after']
    new_bbox=ImageDraw.Draw(original).textbbox(target,replacement,font=valuefont)
    edit_box=(x0-2,y0-2,max(x1,new_bbox[2])+2,max(y1,new_bbox[3])+2)
    if spec['method']=='single_character':
        digit_bbox=ImageDraw.Draw(original).textbbox(target,spec['before'][0],font=valuefont)
        edit_box=(digit_bbox[0]-1,digit_bbox[1]-1,digit_bbox[2]+1,digit_bbox[3]+1)
        replacement=spec['after'][0]
    x0,y0,x1,y1=edit_box
    patch=original.crop(edit_box)
    # Use existing nearby paper texture to erase the old text; do not erase
    # surrounding rules/labels or add a visible diagnostic annotation.
    background=original.crop((x0,420,x1,420+y1-y0))
    patch=background.copy()
    patch_font=valuefont if spec['method']!='retype_other_font' else font(18,'Arial.ttf')
    ImageDraw.Draw(patch).text((target[0]-x0,target[1]-y0),replacement,font=patch_font,fill=(28,31,35))
    if spec['method']=='copy_move':
        donor_position=(185,169+4*29)
        donor_bbox=ImageDraw.Draw(original).textbbox(donor_position,spec['after'],font=body)
        # Copy genuine raster text and rescale its small bounding box to the
        # target field; this is an actual raster copy-move, not a label only.
        crop=original.crop((donor_bbox[0]-2,donor_bbox[1]-2,donor_bbox[2]+2,donor_bbox[3]+2))
        patch=crop.resize((x1-x0,y1-y0),Image.Resampling.BICUBIC)
    if spec['method']=='splice_compressed':patch=jpeg_roundtrip(patch,75)
    altered.paste(patch,(x0,y0))
    target_mask=Image.new('L',(512,512));ImageDraw.Draw(target_mask).rectangle((x0,y0,x1-1,y1-1),fill=255)
    for tampered,picture in [(False,original),(True,altered)]:
        sample_id=f'doc-{index+1:02d}-'+('b' if tampered else 'a')
        image_path=DATA/(sample_id+'.jpg');mask_path=DATA/(sample_id+'-reference.png')
        picture.save(image_path,'JPEG',quality=90,subsampling=0,optimize=False)
        mask=target_mask if tampered else Image.new('L',(512,512))
        mask.save(mask_path)
        samples.append({'id':sample_id,'pair':index+1,'title':spec['title'],'tampered':tampered,
            'input':str(image_path.relative_to(HERE)),'inputSha256':sha(image_path),
            'mask':str(mask_path.relative_to(HERE)),'maskSha256':sha(mask_path),
            'positivePixels':int((np.array(mask)>0).sum()),'editBox':list(edit_box) if tampered else None,
            'method':spec['method'] if tampered else 'unchanged_control',
            'description':spec['edit'] if tampered else 'Same document before editing; identical JPEG Q95 then Q90 encoding steps.',
            'before':spec['before'],'after':spec['after'] if tampered else spec['before']})
order=[s['id'] for s in samples];random.Random(20261016).shuffle(order)
manifest={'schema':'sherloq.dtd-synthetic-examples/1','created':'2026-10-16','status':'frozen-before-inference',
    'language':'en',
    'source':'Deterministic Pillow rendering of fictional text and paper texture; no natural scan and no learned image generator.',
    'count':10,'pairs':5,'width':512,'height':512,'seed':20261016,
    'protocol':{'checkpoint':'dtd_doctamper.pth, existing FP32 ONNX conversion',
        'input':'Native JPEG Q90, 512x512; retain original DCT and quantization table; no rescaling.',
        'pixelThreshold':.5,'documentAlarmRule':'At least one pixel with foreground response >=0.5. Derived sensitive rule for this experiment; DTD has no native global verdict.',
        'groundTruth':'Exact raster intervention rectangles before final JPEG encoding, including replaced text and patch background; final JPEG ringing outside these rectangles is not labelled as text editing.',
        'controlEncoding':'Same Q95 source round-trip and Q90 final encoding in both members of every pair.',
        'selection':'All ten examples evaluated; no deletion, threshold fitting or model fitting after observing results.',
        'pixelAggregation':'Pooled confusion counts over all 10 images, plus positive-document macro precision/recall to approximate the publication aggregation.',
        'documentAggregation':'5 edited and 5 unchanged documents, paired synthetic pilot; no claim of population reliability.'},
    'inferenceOrder':order,'samples':samples}
(HERE/'dataset.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'count':len(samples),'positives':sum(s['tampered'] for s in samples),'referencePixels':sum(s['positivePixels'] for s in samples),'manifestSha256':sha(HERE/'dataset.json')}))
