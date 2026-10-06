from pathlib import Path
import hashlib, json, io
import numpy as np
from PIL import Image,ImageDraw,ImageFont

REPO=Path(__file__).resolve().parents[1]
WORK=REPO/'scripts/results/microscopy-d2prl-automatic-zones'
OUT=WORK/'rendered'
OUT.mkdir(exist_ok=True)
input_record=json.loads((WORK/'input.json').read_text())
image=Image.open(REPO/input_record['input']).convert('RGB')
w,h=image.size
rgb=np.asarray(image)
digest=lambda data:hashlib.sha256(data).hexdigest()
assert digest((REPO/input_record['input']).read_bytes())==input_record['sha256']
ids=['global-zone']+[f'panel-{i:02}' for i in range(1,17)]
masks={};masks10={};records=[]
for name in ids:
    row=json.loads((WORK/(name+'.json')).read_text())
    assert row['metadata']['min_component']==100
    assert row['metadata']['inferences']==1
    mask=np.frombuffer((WORK/(name+'-mask.bin')).read_bytes(),np.uint8).reshape(h,w)
    assert set(np.unique(mask))<={0,1}
    assert int(mask.sum())==row['maskPixels']
    x0,y0,x1,y1=row['zone']['bounds']
    assert int(mask[y0:y1,x0:x1].sum())==int(mask.sum())
    masks[name]=mask
    refilter=json.loads((WORK/(name+'-refilter-10.json')).read_text())
    assert refilter['minimum100MatchesExportExactly'] and refilter['minimum10ContainsMinimum100']
    assert refilter['additionalInferences']==0
    mask10=np.frombuffer((WORK/(name+'-mask-10.bin')).read_bytes(),np.uint8).reshape(h,w)
    assert set(np.unique(mask10))<={0,1} and np.all(mask10>=mask)
    assert int(mask10.sum())==refilter['maskPixels']
    assert int(mask10[y0:y1,x0:x1].sum())==int(mask10.sum())
    masks10[name]=mask10
    Image.fromarray(mask10*255).save(OUT/(name+'-mask-10.png'))
    refilter['maskFile']=name+'-mask-10.png'
    refilter['maskFileSha256']=digest((OUT/refilter['maskFile']).read_bytes())
    row['minimum10Refilter']=refilter
    Image.fromarray(mask*255).save(OUT/(name+'-mask.png'))
    row['maskFile']=name+'-mask.png'
    row['maskFileSha256']=digest((OUT/row['maskFile']).read_bytes())
    row['rawGridSha256']=digest((WORK/(name+'-raw-0.bin')).read_bytes())
    records.append(row)
outputs=[]
def save(name,im,view):
    path=OUT/(name+'.png');im.save(path)
    thumb=im
    while True:
        for quality in [88,82,76,70,64]:
            stream=io.BytesIO();thumb.save(stream,'WEBP',quality=quality,method=6)
            content=stream.getvalue()
            if len(content)<=500000:break
        if len(content)<=500000:break
        thumb=im.resize((round(thumb.width*.9),round(thumb.height*.9)),Image.Resampling.LANCZOS)
    (OUT/(name+'.webp')).write_bytes(content)
    outputs.append(dict(file=name+'.png',preview=name+'.webp',view=view,width=im.width,height=im.height,sha256=digest(path.read_bytes()),rawRgbSha256=digest(im.convert('RGB').tobytes()),previewSha256=digest(content),previewBytes=len(content),previewDimensions=list(thumb.size),previewQuality=quality))
def overlay(mask):
    result=rgb.copy()
    result[mask.astype(bool)]=np.rint(rgb[mask.astype(bool)]*.65+np.array([255,210,0])*.35).astype(np.uint8)
    return Image.fromarray(result)
zones=image.copy();draw=ImageDraw.Draw(zones);font=ImageFont.load_default()
for family in ['DejaVuSans.ttf','/System/Library/Fonts/Helvetica.ttc']:
    try:
        font=ImageFont.truetype(family,40);break
    except OSError:pass
for i,row in enumerate(records[1:],1):
    x0,y0,x1,y1=row['zone']['bounds'];draw.rectangle((x0,y0,x1-1,y1-1),outline=(0,170,255),width=3)
    draw.rectangle((x0+3,y0+3,x0+70,y0+50),fill=(0,40,75));draw.text((x0+7,y0+4),str(i),font=font,fill='white')
x0,y0,x1,y1=input_record['envelope']['bounds']
draw.rectangle((x0+1,y0+1,x1-2,y1-2),outline=(255,125,0),width=3)
save('automatic-zones',zones,'Automatic panel rectangles in blue; enclosing search rectangle in orange. These are search areas, not detections.')
counts={}
for minimum,selection in [(100,masks),(10,masks10)]:
    local=np.maximum.reduce([selection[k] for k in ids[1:]])
    global_mask=selection['global-zone']
    combined=np.maximum(local,global_mask)
    official=np.frombuffer((WORK/f'combined-web-{minimum}.bin').read_bytes(),np.uint8).reshape(h,w)
    assert np.array_equal(official,combined), 'Combined web projection differs from independent-mask union'
    combined=official
    save(f'local-detections-{minimum}',overlay(local),f'Union of 16 independent panel masks, minimum {minimum} model-grid pixels')
    save(f'global-detections-{minimum}',overlay(global_mask),f'Enclosing-zone mask, minimum {minimum} model-grid pixels')
    save(f'combined-detections-{minimum}',overlay(combined),f'Boolean union of local and enclosing-zone masks; minimum {minimum}; one D2PRL vote per pixel')
    for name,mask in [('local-mask',local),('global-mask',global_mask),('combined-mask',combined)]:Image.fromarray(mask*255).save(OUT/(name+f'-{minimum}.png'))
    counts[str(minimum)]={'local':int(local.sum()),'global':int(global_mask.sum()),'overlap':int((local&global_mask).sum()),'combined':int(combined.sum()),'localOnly':int((local&~global_mask).sum()),'globalOnly':int((global_mask&~local).sum())}
detail_id=max(ids[1:],key=lambda k:int(masks10[k].sum())-int(masks[k].sum()))
detail_row=next(row for row in records if row['zone']['id']==detail_id)
panel_box=tuple(detail_row['zone']['bounds'])
added=(masks10[detail_id]>masks[detail_id])
# Choose a display crop around the largest newly retained component, without
# changing any mask pixel. The full-panel views remain published above.
remaining=set(map(tuple,np.argwhere(added)));largest=[]
while remaining:
    start=min(remaining);remaining.remove(start);component=[start];pending=[start]
    while pending:
        y,x=pending.pop()
        for dy in (-1,0,1):
            for dx in (-1,0,1):
                point=(y+dy,x+dx)
                if point in remaining:remaining.remove(point);component.append(point);pending.append(point)
    if len(component)>len(largest):largest=component
assert largest, 'No newly retained component available for the threshold detail'
cy,cx=np.mean(largest,axis=0)
dw=min(192,panel_box[2]-panel_box[0]);dh=min(192,panel_box[3]-panel_box[1])
left=max(panel_box[0],min(round(cx-dw/2),panel_box[2]-dw));top=max(panel_box[1],min(round(cy-dh/2),panel_box[3]-dh))
box=(left,top,left+dw,top+dh)
scale=2
detail=Image.new('RGB',(dw*scale*3+32,dh*scale+64),(248,248,248));draw=ImageDraw.Draw(detail)
for index,(label,source) in enumerate([('Input',image),('Minimum 100',overlay(masks[detail_id])),('Minimum 10',overlay(masks10[detail_id]))]):
    x=index*(dw*scale+16);detail.paste(source.crop(box).resize((dw*scale,dh*scale),Image.Resampling.NEAREST),(x,64));draw.text((x+6,8),label,font=font,fill=(25,25,25))
save('threshold-detail',detail,f'Local panel {detail_id}: identical input crop, minimum 100, minimum 10. Selected as the panel with the most additional original-coordinate pixels at minimum 10.')
record=dict(id='microscopy-d2prl-automatic-zones',operation='ai.clones.d2prl',engine=input_record['engine'],input=input_record['input'],inputSha256=input_record['sha256'],sourceDimensions=[w,h],runtime='Direct shipped web-engine clients/workers in headless Chromium; no application UI',minimums=[100,10],nativeGrid=[448,448],automaticPanelCount=16,inferenceCount=17,additionalRefilterInferences=0,inputRecord=input_record,passes=records,detail={'zone':detail_id,'bounds':box,'selection':'Largest number of additional original-coordinate pixels at minimum 10 versus 100 among the local panels'},display={'overlay':'Uniform yellow at 35% opacity on the exported filtered union mask only; no probability weighting or hand-added detections','combined':'Boolean OR of the 17 independently exported masks; same one-model-union rule as the automatic workflow'},counts=counts,outputs=outputs)
record['sourceIdentity']=input_record.get('sourceIdentity')
record['combinedProjection']=json.loads((WORK/'combined-postprocess.json').read_text())
record['detail'].update(panelBounds=panel_box,displayScale=scale,interpolation='nearest-neighbor presentation only',cropSelection='192-pixel window centered on the largest newly retained component within the selected panel',newComponentPixels=len(largest))
record['combinedProjectionMatchesIndependentUnion']=True
record['display']['combined']='Web-engine projection of all 17 cached grids, verified byte for byte against the Boolean OR of the independently exported masks; one D2PRL vote per pixel'
(OUT/'result.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps({'counts':record['counts'],'outputs':[{k:r[k] for k in ['preview','previewBytes']} for r in outputs]},indent=2))
