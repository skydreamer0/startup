#!/usr/bin/env python3
"""Explicit local synthetic acceptance. Requires an already approved PG install.
Never consumes an ambient database URL or touches an existing cluster.
"""
import argparse
import hashlib
import http.server
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import threading
import urllib.request

p = argparse.ArgumentParser()
p.add_argument('--pg-bin', required=True, type=Path)
p.add_argument('--output', required=True, type=Path)
args = p.parse_args()
backend = Path(__file__).resolve().parents[1]
repo = backend.parents[2]
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
pg = args.pg_bin.resolve()
assert all((pg / name).is_file() for name in ['initdb', 'pg_ctl', 'psql', 'postgres'])
assert not (backend / '.env').exists()
nonce = secrets.token_hex(16)
owned = output / ('owned-' + nonce)
owned.mkdir()
(owned / 'owner').write_text(nonce)
data = owned / 'data'
sock = owned / 'socket'
sock.mkdir()
database = 'general_trace_' + nonce
environment = {'PATH': os.environ['PATH'], 'HOME': str(owned), 'LANG': 'C.UTF-8', 'LC_ALL': 'C.UTF-8'}

def save(name, value):
    (output / name).write_text(json.dumps(value, indent=2))

def run(command, log=None, check=True, timeout=180, env=None):
    result = subprocess.run([str(x) for x in command], cwd=backend, env=env or environment,
                            capture_output=True, text=True, timeout=timeout)
    if log:
        (output / log).write_text(result.stdout + result.stderr)
    if check and result.returncode:
        raise RuntimeError(f'{command[0]} failed: {result.returncode}; see {log}')
    return result

with socket.socket() as reserve:
    reserve.bind(('127.0.0.1', 0))
    port = reserve.getsockname()[1]

def sql(statement, db='postgres'):
    return run([pg / 'psql', '-X', '-h', '127.0.0.1', '-p', port, '-U', 'test', '-d', db,
                '-v', 'ON_ERROR_STOP=1', '-At', '-c', statement]).stdout.strip()

started = False
created = False
system = None
pid = None
cleanup = {'ownedDatabaseAbsent': False, 'postgresStopped': False, 'ownedDirectoryAbsent': False}
try:
    version = run([pg / 'postgres', '--version']).stdout.strip()
    head = run(['git', '-C', repo, 'rev-parse', 'HEAD']).stdout.strip()
    tree = run(['git', '-C', repo, 'rev-parse', 'HEAD^{tree}']).stdout.strip()
    files = run(['git', '-C', repo, 'ls-files', '-z']).stdout.split('\0')
    hashes = {name: hashlib.sha256((repo / name).read_bytes()).hexdigest()
              for name in files if name and (repo / name).is_file()}
    for name in ['scripts/general-order-trace-local.ts', 'scripts/general-order-trace-owned.py',
                 'scripts/general-order-trace-guards.ts', 'scripts/general-order-trace-guards.test.ts']:
        hashes[str((backend / name).relative_to(repo))] = hashlib.sha256((backend / name).read_bytes()).hexdigest()
    save('source-hashes.json', {'head': head, 'tree': tree, 'hashes': hashes})
    save('runtime.json', {'postgres': version, 'node': run(['node', '--version']).stdout.strip(),
                          'officialSource': 'https://ftp.postgresql.org/pub/source/v15.19/',
                          'syntheticOnly': True, 'ambientDatabaseUrlUsed': False})
    run([pg / 'initdb', '-D', data, '-U', 'test', '-A', 'trust', '--no-locale', '--encoding=UTF8'], 'initdb.log')
    run([pg / 'pg_ctl', '-D', data, '-l', output / 'postgres.log', '-o',
         f"-h 127.0.0.1 -p {port} -k ''", '-w', 'start'], 'pg-start.log')
    started = True
    pid = int((data / 'postmaster.pid').read_text().splitlines()[0])
    system = sql('SELECT system_identifier FROM pg_control_system()')
    assert sql("SHOW data_directory") == str(data)
    assert sql("SHOW listen_addresses") == '127.0.0.1'
    assert sql(f"SELECT count(*) FROM pg_database WHERE datname='{database}'") == '0'
    sql(f'CREATE DATABASE "{database}"')
    created = True
    assert sql("SELECT count(*) FROM pg_tables WHERE schemaname='public'", database) == '0'
    receipt = {'nonce': nonce, 'dataDirectory': str(data), 'port': port, 'database': database,
               'systemIdentifier': system, 'output': str(output), 'sourceHead': head}
    save('ownership.json', receipt)

    # A real HTTP socket, client and native database query in this executor.
    class Smoke(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            payload = {'database': sql('SELECT current_database()', database),
                       'host': sql('SELECT inet_server_addr()', database),
                       'system': sql('SELECT system_identifier FROM pg_control_system()', database)}
            raw = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(raw)
        def log_message(self, *unused):
            pass
    smoke = http.server.HTTPServer(('127.0.0.1', 0), Smoke)
    thread = threading.Thread(target=smoke.serve_forever, daemon=True)
    thread.start()
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{smoke.server_port}/', timeout=10) as response:
            result = json.load(response)
        assert result == {'database': database, 'host': '127.0.0.1', 'system': system}
        save('loopback-smoke.json', {'status': 'passed', 'apiPort': smoke.server_port, 'postgresPort': port,
                                    'result': result, 'browserTested': False})
        print('PASS: same-executor HTTP client → HTTP server → native PostgreSQL', flush=True)
    finally:
        smoke.shutdown()
        smoke.server_close()
        thread.join()

    url = f'postgresql://test@127.0.0.1:{port}/{database}'
    testenv = {**environment, 'NODE_ENV': 'test', 'DATABASE_URL': url,
               'GENERAL_TRACE_DATABASE_URL': url, 'GENERAL_TRACE_OWNERSHIP': str(output / 'ownership.json'),
               'JWT_ACCESS_SECRET': secrets.token_hex(32), 'JWT_REFRESH_SECRET': secrets.token_hex(32)}
    run(['node', 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], 'migrations.log', env=testenv)
    suite = run(['node', '--import', 'tsx', 'scripts/general-order-trace-local.ts'],
                'acceptance.log', check=False, timeout=240, env=testenv)
    save('suite-process.json', {'exitCode': suite.returncode})
    assert suite.returncode == 0, 'Trace acceptance failed; retained log and receipts identify the case'
    print('PASS: trace acceptance; performing owned cleanup', flush=True)
finally:
    assert (owned / 'owner').read_text() == nonce
    if started:
        assert sql('SHOW data_directory') == str(data)
        assert sql('SELECT system_identifier FROM pg_control_system()') == system
        if created:
            sql(f'DROP DATABASE "{database}" WITH (FORCE)')
            cleanup['ownedDatabaseAbsent'] = sql(f"SELECT count(*) FROM pg_database WHERE datname='{database}'") == '0'
        run([pg / 'pg_ctl', '-D', data, '-m', 'fast', '-w', 'stop'], 'pg-stop.log')
        cleanup['postgresStopped'] = not (data / 'postmaster.pid').exists() and not Path(f'/proc/{pid}').exists()
        assert cleanup['postgresStopped']
    if not started or cleanup['postgresStopped']:
        shutil.rmtree(owned)
        cleanup['ownedDirectoryAbsent'] = not owned.exists()
    save('cleanup.json', cleanup)
    print(json.dumps(cleanup), flush=True)
