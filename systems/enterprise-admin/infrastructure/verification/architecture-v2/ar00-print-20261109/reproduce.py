"""Re-run the bounded offline checks. No install, application or device command."""
import argparse
import ast
import json
from pathlib import Path
import subprocess
import sys
import tempfile

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[6])
parser.add_argument('--output',type=Path)
parser.add_argument('--base-ref',default='5e3d6bab7e89a1bad53dcf3a6b385947fbd9111e')
parser.add_argument('--source-ref',default='a18e95b945d79dcd2624d9af09e3bc6bd66085a1')
args=parser.parse_args(); root=args.root.resolve()
out=args.output or Path(tempfile.mkdtemp(prefix='print-verification-'))
out.mkdir(parents=True,exist_ok=True)
commands={
 'print-inventory':[sys.executable,'scripts/architecture/verify-print-inventory.py'],
 'inventory-tests':[sys.executable,'scripts/architecture/test_print_inventory.py'],
 'worker-controls':[sys.executable,'scripts/architecture/test_print_worker_controls.py'],
 'node-regression':['node','--test','scripts/architecture/plan.test.mjs','scripts/architecture/seed-migrations.test.mjs','systems/enterprise-admin/infrastructure/verification/architecture-v2/ar00-closeout-20261108/gate-acceptance.test.mjs'],
 'plan-source':['node','scripts/architecture/verify-plan.mjs','--check-source'],
 'seed-source':['node','scripts/architecture/verify-seed-migrations.mjs'],
 'context':['bash','scripts/validate-agent-context.sh'],
 'source-whitespace':['git','diff','--check',args.base_ref,args.source_ref],
}
results=[]
for name,command in commands.items():
    run=subprocess.run(command,cwd=root,text=True,encoding='utf-8',stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    (out/(name+'.log')).write_text(run.stdout,encoding='utf-8')
    results.append({'id':name,'command':command,'exitCode':run.returncode,'status':'PASS' if run.returncode==0 else 'FAIL'})
syntax=[]
for path in ['scripts/architecture/verify-print-inventory.py','scripts/architecture/test_print_inventory.py','scripts/architecture/test_print_worker_controls.py']:
    ast.parse((root/path).read_text(encoding='utf-8'),filename=path);syntax.append(path)
results.append({'id':'syntax','operation':'ast.parse unchanged UTF-8 source text; no imports','paths':syntax,'status':'PASS'})
(out/'results.json').write_text(json.dumps(results,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'results':results,'originalPythonSuite':'NOT_RUN','HTTP':'NOT_RUN','device':'NOT_RUN','overallAC01':'NOT_RUN'},indent=2))
raise SystemExit(0 if all(r['status']=='PASS' for r in results) else 1)
