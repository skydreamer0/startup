"""Read committed SPEC JSON and compare fingerprints without printing values."""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--repository',type=Path,default=Path('.'))
p.add_argument('--base',required=True)
p.add_argument('--source',required=True)
a=p.parse_args()
def git(*args):return subprocess.check_output(['git','-C',str(a.repository),*args])
def spec(ref):
    text=git('show',ref+':scripts/architecture/http-writers-spec.mjs').decode('utf-8')
    return json.loads(text.split('export const SPEC = ',1)[1].strip().removesuffix(';'))
base=spec(a.base);source=spec(a.source)
old=base.pop('pins');new=source.pop('pins')
expected=[{'path':path,'sha256':value} for path,value in old.items()]
assert len(new)==27 and new==expected and base==source
for row in new:
    assert hashlib.sha256(git('show',a.source+':'+row['path'])).hexdigest()==row['sha256']
changed=git('diff-tree','--no-commit-id','--name-only','-r',a.base,a.source).decode().splitlines()
assert set(changed)=={'scripts/architecture/http-writers-'+name for name in ['spec.mjs','verify.mjs','verify.test.mjs','mutation.test.mjs']}
print(json.dumps({'status':'PASS','recordCount':27,'valuesAndOrderEqual':True,'otherSpecFieldsEqual':True,'allCommittedSourceBytesMatch':True,'changedFiles':sorted(changed),'flaggedEntryIsSourceFingerprint':True,'sourceFingerprints':'NOT_RECORDED'},indent=2))
