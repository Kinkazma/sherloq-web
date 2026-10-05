from pathlib import Path
import ast,re,os,json,hashlib
root=Path(__file__).resolve().parents[1];source=Path(os.environ['SHERLOQ_NATIVE_CORE'])/'digest.py';text=source.read_text();tree=ast.parse(text);node=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='ballistics');ns=dict(re=re);exec(compile(ast.Module(body=[node],type_ignores=[]),str(source),'exec'),ns)
names=['DSCN1234.JPG','dsc_0001.jpg','FUJI4321.JPG','IMG_9876.JPG','PIC12345.JPG','IMG_123.JPG','PIC1234.JPG','IMG_1234.jpeg','copy-IMG_1234.JPG','IMG_1234.JPG.bak','photo.png','','İMG_1234.JPG','ıMG_1234.JPG','DſCN1234.JPG','IMG_1234.JPG\n','IMG_1234.JPG\r','IMG_1234.JPG\r\n','IMG_１２３４.JPG']
(root/'tests/data/filename-native.json').write_text(json.dumps(dict(sourceSha256=hashlib.sha256(text.encode()).hexdigest(),cases=[dict(name=name,hint=ns['ballistics'](name)) for name in names]),indent=2,ensure_ascii=False)+'\n')
