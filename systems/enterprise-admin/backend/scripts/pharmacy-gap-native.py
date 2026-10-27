from pathlib import Path
import os, sys, json, subprocess, secrets, uuid, time, hashlib, datetime

# Assertions below enforce ownership; never allow optimized Python to strip them.
if not __debug__:
    raise RuntimeError('Run without Python -O / PYTHONOPTIMIZE')
import argparse
parser = argparse.ArgumentParser(description='Opt-in owned API/PG acceptance; never accepts a database URL')
parser.add_argument('mode', choices=['probe', 'test'])
parser.add_argument('--expected-head', required=True)
parser.add_argument('--prepared-backend', required=True, type=Path)
parser.add_argument('--npm-prefix', required=True, type=Path)
parser.add_argument('--output-root', required=True, type=Path)
parser.add_argument('--probe-receipt', type=Path)
args = parser.parse_args()
assert sys.platform.startswith('linux') and os.geteuid()==1000 and os.getegid()==1000, 'Requires an authorized isolated Linux host with UID/GID 1000'
repo = Path(__file__).resolve().parents[4]
backend = args.prepared_backend.resolve()
npm_prefix = args.npm_prefix.resolve()
root = args.output_root.resolve()
root.mkdir(parents=True, exist_ok=True)
HEAD = args.expected_head
assert len(HEAD) == 40 and all(c in '0123456789abcdef' for c in HEAD), 'Expected full source SHA'
assert subprocess.check_output(['git','-C',str(repo),'rev-parse','HEAD'],text=True).strip() == HEAD, 'Checkout must match expected source'
assert not subprocess.check_output(['git','-C',str(repo),'status','--porcelain','--untracked-files=no'],text=True).strip(), 'Commit tracked changes first'
assert backend != repo/'systems/enterprise-admin/backend', 'Use an archived source copy, never the ambient checkout'
assert (npm_prefix/'node_modules/npm/package.json').is_file()
assert json.loads((npm_prefix/'node_modules/npm/package.json').read_text())['version'] == '11.21.0'
mode = args.mode
if mode == 'test':
    assert args.probe_receipt, 'First complete and clean up a standalone probe'
    prerequisite = json.loads(args.probe_receipt.read_text())
    assert prerequisite['mode'] == 'probe' and prerequisite['passed'] and prerequisite['sourceHead'] == HEAD
    assert all(prerequisite['cleanup'].get(k) is True for k in ['clientAbsent','databaseAbsent','dbContainerAbsent','volumesAbsent','networkAbsent'])
nonce = uuid.uuid4().hex
name = 'pharmacy-gap-' + nonce
database = 'pharmacy_gap_' + nonce
output = root/('internal-' + mode + '-' + nonce)
output.mkdir(mode=0o700)
password = secrets.token_urlsafe(32)  # Newly generated synthetic credential only, never persisted in evidence.
db_id = client_id = network_id = None
volumes = []
events = []
cleanup = {}
error = None
test_exit = None
completed = False
local_docker_verified = False
print(str(output), flush=True)

def run(args, timeout=30):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        # TimeoutExpired.__str__ embeds argv, including synthetic credentials.
        raise RuntimeError('Bounded subprocess timed out; arguments omitted') from None
    if p.returncode:
        raise RuntimeError(args[0] + ' exit ' + str(p.returncode) + ': ' + p.stderr.replace(password, '[synthetic credential omitted]'))
    return p.stdout.strip()

def docker(*args):
    assert local_docker_verified, 'Local Docker endpoint must be verified first'
    return run(['docker', '--host', 'unix:///var/run/docker.sock', *args])
def inspect(cid): return json.loads(docker('inspect', cid))[0]
def save(file, value): (output/file).write_text(json.dumps(value, indent=2), encoding='utf-8')
def sql(query, target=None):
    return docker('exec', db_id, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', 'gap_test', '-d', target or database, '-Atc', query)

def source_check():
    rows = subprocess.check_output(['git','-C',str(repo),'ls-tree','-rz',HEAD,'--','systems/enterprise-admin/backend']).split(b'\0')
    count=0
    for row in rows:
        if not row: continue
        meta,p = row.split(b'\t',1); _,kind,oid = meta.split()
        if kind != b'blob': continue
        count += 1
        assert (backend/p.decode().removeprefix('systems/enterprise-admin/backend/')).read_bytes() == subprocess.check_output(['git','-C',str(repo),'cat-file','blob',oid.decode()]), 'Source blob changed: '+p.decode()
    assert count > 0
    expected_paths = {row.split(b'\t',1)[1].decode().removeprefix('systems/enterprise-admin/backend/') for row in rows if row}
    actual_paths = {str(p.relative_to(backend)) for p in backend.rglob('*') if p.is_file() and 'node_modules' not in p.relative_to(backend).parts}
    assert actual_paths == expected_paths, 'Archived source must contain exactly the committed files, no ambient files'
    assert not list(backend.rglob('.env')) and not list(backend.glob('.env*'))
    lock=hashlib.sha256((backend/'package-lock.json').read_bytes()).hexdigest()
    assert lock == hashlib.sha256(subprocess.check_output(['git','-C',str(repo),'show',HEAD+':systems/enterprise-admin/backend/package-lock.json'])).hexdigest()
    return {'sourceHead':HEAD,'sourceBlobs':count,'lockSha256':lock,'noDotenv':True}

def stage(label,args,timeout=60):
    with (output/(label+'.log')).open('x') as log:
        try:
            p=subprocess.run(['docker','--host','unix:///var/run/docker.sock','exec',client_id,*args],stdout=log,stderr=subprocess.STDOUT,timeout=timeout)
        except subprocess.TimeoutExpired:
            raise RuntimeError(label+' timed out; owned client will be removed') from None
    events.append({'stage':label,'exitCode':p.returncode})
    return p.returncode

try:
    # Refuse ambient remote contexts rather than silently overriding them.
    assert not any(os.environ.get(k) for k in ['DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH']), 'Refuse Docker context/TLS overrides'
    assert os.environ.get('DOCKER_HOST','') in ['', 'unix:///var/run/docker.sock'], 'Refuse nonlocal Docker endpoint'
    context=json.loads(run(['docker','context','inspect']))[0]
    assert context['Endpoints']['docker']['Host']=='unix:///var/run/docker.sock', 'Refuse nonlocal active Docker context'
    local_docker_verified = True
    save('source-before.json',source_check())
    assert not docker('ps','-q','--filter','label=pharmacy-gap'), 'Another acceptance task is running'
    pgimage=json.loads(docker('image','inspect','postgres:15-alpine@sha256:f7d23353e1b15400d22ebe31189f4d314b87a4c129cc400c8c2d8d4ca127bf81'))[0]
    nodeimage=json.loads(docker('image','inspect','node:22.23.4-bookworm@sha256:63538dfe497cc29dfafdda25ada09b46db68a3f4cc205abf1f5d6bf0913f3384'))[0]
    network_id=docker('network','create','--internal','--label','pharmacy-gap='+nonce,name+'-net')
    n=json.loads(docker('network','inspect',network_id))[0]
    assert n['Internal'] and n['Driver']=='bridge'
    db_id=docker('run','-d','--pull=never','--name',name+'-db','--label','pharmacy-gap='+nonce,'--network',network_id,
        '-e','POSTGRES_USER=gap_test','-e','POSTGRES_PASSWORD='+password,'-e','POSTGRES_DB='+database,pgimage['Id'])
    db=inspect(db_id)
    assert not db['HostConfig'].get('Binds') and not db['HostConfig'].get('PortBindings') and not db['HostConfig']['Privileged']
    volumes=[m['Name'] for m in db['Mounts'] if m['Type']=='volume']
    assert len(volumes)==1 and all(m['Type']=='volume' for m in db['Mounts'])
    for i in range(30):
        p=subprocess.run(['docker','--host','unix:///var/run/docker.sock','exec',db_id,'pg_isready','-U','gap_test','-d',database],capture_output=True,timeout=5)
        if p.returncode==0: break
        time.sleep(0.5)
    else: raise RuntimeError('Fresh PostgreSQL readiness timeout')
    assert sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'")=='0'
    identity=json.loads(sql("SELECT json_build_object('database',current_database(),'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()))"))
    db=inspect(db_id)
    assert list(db['NetworkSettings']['Networks'])==[name+'-net']
    host=db['NetworkSettings']['Networks'][name+'-net']['IPAddress']
    assert not db['HostConfig'].get('PortBindings') and all(not v for v in db['NetworkSettings']['Ports'].values())
    env={'NODE_ENV':'test','CHECKPOINT_DISABLE':'1','npm_config_offline':'true','npm_config_cache':'/tmp/npm-cache',
        'DATABASE_URL':f'postgresql://gap_test:{password}@{host}:5432/{database}',
        'JWT_ACCESS_SECRET':secrets.token_hex(32),'JWT_REFRESH_SECRET':secrets.token_hex(32),
        'PHARMACY_GAP_OUTPUT':'/evidence','PHARMACY_GAP_ALLOW_SYNTHETIC':'1',
        'PHARMACY_GAP_DATABASE_URL':f'postgresql://gap_test:{password}@{host}:5432/{database}',
        'PHARMACY_GAP_EXPECTED_HEAD':HEAD}
    args=['run','-d','--pull=never','--name',name+'-client','--label','pharmacy-gap='+nonce,'--network',network_id,
        '--user','1000:1000','--read-only','--tmpfs','/tmp','--workdir','/app',
        '--mount','type=bind,src='+str(backend)+',dst=/app,readonly',
        '--mount','type=bind,src='+str(output)+',dst=/evidence',
        '--mount','type=bind,src='+str(npm_prefix)+',dst=/task-npm,readonly']
    for key,value in env.items(): args+=['-e',key+'='+value]
    args += [nodeimage['Id'],'node','-e','setInterval(()=>{},10000)']
    client_id=docker(*args)
    c=inspect(client_id); n=json.loads(docker('network','inspect',network_id))[0]
    assert n['Internal'] and set(n['Containers'])=={db_id,client_id}
    assert list(c['NetworkSettings']['Networks'])==[name+'-net']
    assert not c['HostConfig']['Privileged'] and not c['HostConfig'].get('PortBindings') and c['HostConfig']['ReadonlyRootfs']
    assert c['Config']['User']=='1000:1000'
    assert {m['Destination']:m['RW'] for m in c['Mounts']}=={'/app':False,'/evidence':True,'/task-npm':False}
    owner={**identity,'sourceHead':HEAD,'sourceTree':run(['git','-C',str(repo),'rev-parse',HEAD+'^{tree}']),'syntheticOnly':True,
        'initialPublicTableCount':0,'dbContainerId':db_id,'clientContainerId':client_id,'networkId':network_id,
        'networkInternal':True,'onlyOwnedNetworkMembers':True,'noPublishedPorts':True,'dbHost':host,'dbPort':5432,
        'transport':'owned-internal-network','pgImageId':pgimage['Id'],'pgImageDigests':pgimage['RepoDigests'],
        'nodeImageId':nodeimage['Id'],'nodeImageDigests':nodeimage['RepoDigests'],
        'noExistingDataMounts':True,'testSha256':hashlib.sha256((backend/'src/__tests__/pharmacy-gap.native.test.ts').read_bytes()).hexdigest()}
    save('ownership.json',owner)
    schema_check = """const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict'),crypto=require('crypto');for(const [label,file] of [['source','prisma/schema.prisma'],['generated','node_modules/.prisma/client/schema.prisma']]){const out='/tmp/'+label+'.prisma';fs.copyFileSync(file,out);cp.execFileSync('node',['node_modules/prisma/build/index.js','format','--schema',out],{stdio:'pipe',timeout:30000});}assert.deepEqual(fs.readFileSync('/tmp/source.prisma'),fs.readFileSync('/tmp/generated.prisma'));fs.writeFileSync('/evidence/schema-proof.json',JSON.stringify({canonicalSchemasEqual:true,canonicalSha256:crypto.createHash('sha256').update(fs.readFileSync('/tmp/source.prisma')).digest('hex')}));"""
    if stage('schema-proof',['node','-e',schema_check],60): raise RuntimeError('Generated Prisma schema differs from committed source')
    probe="""const {PrismaClient}=require('@prisma/client');const fs=require('fs');const assert=require('assert/strict');const owner=JSON.parse(fs.readFileSync('/evidence/ownership.json'));const db=new PrismaClient();(async()=>{try{assert.equal(process.versions.node,'22.23.4');const [id]=await db.$queryRawUnsafe(\"SELECT current_database() AS database, (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier\");assert.equal(id.database,owner.database);assert.equal(id.system_identifier,owner.systemIdentifier);const [t]=await db.$queryRawUnsafe(\"SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'\");assert.equal(t.count,0);fs.writeFileSync('/evidence/client-probe.json',JSON.stringify({status:'PASS',node:process.versions.node,database:id.database,systemIdentifier:id.system_identifier,initialPublicTableCount:t.count,transport:owner.transport},null,2));}finally{await db.$disconnect();}})().catch(e=>{console.error(e.message);process.exitCode=1;});"""
    if stage('client-probe',['node','-e',probe],30): raise RuntimeError('Prisma connectivity probe failed; see client-probe.log')
    assert sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")=='0'
    if mode=='test':
        if stage('migrations',['node','node_modules/prisma/build/index.js','migrate','deploy'],60): raise RuntimeError('Owned migrations failed')
        command=['node','/task-npm/node_modules/npm/bin/npm-cli.js','test','--','src/__tests__/pharmacy-gap.native.test.ts','--maxWorkers=1','--no-cache','--configLoader=runner','--reporter=default','--reporter=json','--outputFile=/evidence/vitest.json']
        test_exit=stage('new-gap-tests',command,120)
        if test_exit:raise RuntimeError('New acceptance test failed; inspect preserved new-gap-tests.log')
        result=json.loads((output/'vitest.json').read_text());expected=2
        assert result['success'] and result['numTotalTests']==expected and result['numPassedTests']==expected and result['numFailedTests']==0 and result['numPendingTests']==0
        case_results=[case for suite in result['testResults'] for case in suite['assertionResults']]
        assert len(case_results)==2 and all(case['status']=='passed' for case in case_results)
        assert {case['title'] for case in case_results}=={
            'CAS loser can explicitly save its retained payload as revision three while immutable earlier revisions and all business rows remain unchanged',
            'actual initial receipts feed audited release, FEFO checkout, same-command replay, money-only refund and general-order debit with durable trace conservation'}
        journey=json.loads((output/'journey.json').read_text());assert len(journey['cases'])==expected
        assert journey['cleanup']=={'serverClosed':True,'prismaDisconnected':True}
        assert sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()")=='0'
        tables=sql("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename").splitlines()
        save('retained-row-counts-before-owned-drop.json',{t:int(sql('SELECT count(*) FROM "'+t+'"')) for t in tables})
    save('source-after.json',source_check())
    completed = True
except BaseException as e:
    error=(type(e).__name__+': '+str(e)).replace(password,'[synthetic credential omitted]')
finally:
    # A create call may time out after creating its resource. Reconcile only
    # this invocation's unique names AND labels before attempting cleanup.
    if local_docker_verified:
        try:
            for role in ['db','client']:
                candidates=docker('ps','-aq','--filter','name=^/'+name+'-'+role+'$').splitlines()
                assert len(candidates)<=1
                if candidates:
                    owned=inspect(candidates[0]);assert owned['Name']=='/'+name+'-'+role and owned['Config']['Labels'].get('pharmacy-gap')==nonce
                    if role=='db':
                        db_id=owned['Id'];volumes=[m['Name'] for m in owned['Mounts'] if m['Type']=='volume']
                    else:client_id=owned['Id']
            networks=docker('network','ls','-q','--filter','name=^'+name+'-net$').splitlines()
            assert len(networks)<=1
            if networks:
                owned=json.loads(docker('network','inspect',networks[0]))[0]
                assert owned['Name']==name+'-net' and owned['Labels'].get('pharmacy-gap')==nonce
                network_id=owned['Id']
        except Exception:
            cleanup['resourceReconciliationUncertain']=True
    if client_id:
        try:
            c=inspect(client_id);assert c['Id']==client_id and c['Name']=='/'+name+'-client' and c['Config']['Labels']['pharmacy-gap']==nonce
            docker('rm','-fv',client_id);cleanup['clientAbsent']=not docker('ps','-aq','--filter','id='+client_id)
        except Exception as e:cleanup['clientError']=str(e)
    if db_id:
        try:
            d=inspect(db_id);assert d['Id']==db_id and d['Name']=='/'+name+'-db' and d['Config']['Labels']['pharmacy-gap']==nonce
            sql('DROP DATABASE "'+database+'" WITH (FORCE)','postgres')
            cleanup['databaseAbsent']=sql("SELECT count(*) FROM pg_database WHERE datname='"+database+"'",'postgres')=='0'
        except Exception as e:cleanup['databaseError']=str(e)
        try:
            d=inspect(db_id);assert d['Id']==db_id and d['Name']=='/'+name+'-db' and d['Config']['Labels']['pharmacy-gap']==nonce
            docker('rm','-fv',db_id);cleanup['dbContainerAbsent']=not docker('ps','-aq','--filter','id='+db_id)
            cleanup['volumesAbsent']=all(not docker('volume','ls','-q','--filter','name='+v) for v in volumes)
        except Exception as e:cleanup['dbContainerError']=str(e)
    if network_id:
        try:
            n=json.loads(docker('network','inspect',network_id))[0];assert n['Id']==network_id and n['Name']==name+'-net' and n['Labels']['pharmacy-gap']==nonce
            docker('network','rm',network_id);cleanup['networkAbsent']=not docker('network','ls','-q','--filter','id='+network_id)
        except Exception as e:cleanup['networkError']=str(e)
    receipt={'mode':mode,'sourceHead':HEAD,'timestamp':datetime.datetime.now(datetime.timezone.utc).isoformat(),'error':error,'testExitCode':test_exit,'stages':events,'cleanup':cleanup,
        'completed':completed,
        'passed':completed and error is None and not cleanup.get('resourceReconciliationUncertain') and all(cleanup.get(k) is True for k in ['clientAbsent','databaseAbsent','dbContainerAbsent','volumesAbsent','networkAbsent'])}
    save('result.json',receipt);print(json.dumps(receipt,indent=2),flush=True)
raise SystemExit(0 if receipt['passed'] else 1)
