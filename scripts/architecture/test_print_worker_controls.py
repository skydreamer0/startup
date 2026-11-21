"""Bounded source-derived tests with only Python stdlib.

Execute unchanged selected AST definitions, NOT production module imports.
No Bleak, renderer or application-module import, network connection, HTTP
listener, physical device or real worker thread is started. The stdlib event
loop may use an internal socketpair. All writes are synthetic receipts in temporary dirs.
This is not a replacement for pytest, import, HTTP, Windows or device suites.
"""
from __future__ import annotations
import ast
import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
from hashlib import sha256
import json
from pathlib import Path
import queue
import re
import socket
import subprocess
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'systems/enterprise-admin/local-print-agent'
JOB = b'SIZE 30 mm,50 mm\r\nCLS\r\nBITMAP 0,0,1,1,0,\x00\r\nPRINT 1,1\r\n'
NAME = 'DL-720W(NEW)ABCD'
ADDRESS = 'SYNTHETIC-DEVICE'

class StopLoop(BaseException): pass

def forbidden(*args, **kwargs): raise AssertionError('external capability is forbidden in offline test')

def load_selected(path, names, assignments=False, extra=None):
    """Select complete unchanged top-level definitions; never import the app."""
    tree = ast.parse(path.read_bytes(), filename=str(path.relative_to(ROOT)))
    selected = [n for n in tree.body if
                isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and n.name in names
                or assignments and isinstance(n, (ast.Assign, ast.AnnAssign))]
    found = {n.name for n in selected if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}
    if found != set(names): raise AssertionError('source definitions changed or missing')
    m = types.ModuleType('offline_print_' + uuid4().hex)
    m.__dict__.update({name: globals()[name] for name in (
        'asyncio', 'dataclass', 'field', 'datetime', 'timezone', 'sha256',
        'json', 'Path', 'queue', 're', 'threading', 'urlsplit', 'uuid4')})
    m.__dict__.update(extra or {})
    sys.modules[m.__name__] = m
    try:
        exec(compile(ast.Module(body=selected, type_ignores=[]), str(path.relative_to(ROOT)), 'exec'), m.__dict__)
    finally:
        sys.modules.pop(m.__name__, None)
    return m

class OfflineCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name)
        # Guard these known external capabilities for the reviewed pinned source.
        # This harness is not a sandbox for arbitrary future Python code.
        self.enterContext(patch.object(socket, 'create_connection', forbidden))
        self.enterContext(patch.object(socket.socket, 'connect', forbidden))
        self.enterContext(patch.object(socket.socket, 'bind', forbidden))
        self.enterContext(patch.object(subprocess, 'Popen', forbidden))

class WorkerControls(OfflineCase):
    def setUp(self):
        super().setUp()
        self.api = load_selected(MODULE / 'src/deli720w/api.py', ['_json_bytes','ApiState'], True,
                                 {'send_approved_job': forbidden})
        self.state = self.api.ApiState('synthetic-token-not-a-credential', 8765, self.path / 'reports',
                                      True, ADDRESS, NAME)
        self.key = 'synthetic-idempotency-key'
        self.digest = sha256(JOB).hexdigest()
    def submit(self, key=None, copies=1): return self.state.submit(key or self.key, self.digest, copies, JOB)
    def drain_one(self):
        original = self.state.jobs.get
        def once():
            if self.state.jobs.empty(): raise StopLoop()
            return original(False)
        with patch.object(self.state.jobs, 'get', once), self.assertRaises(StopLoop): self.state._work()
        self.assertEqual(self.state.jobs.unfinished_tasks, 0)
    def sender(self, result=None, error=None, report=None):
        self.calls = []
        def send(**kw):
            self.calls.append(kw)
            if report is not None: kw['report_path'].write_text(json.dumps(report))
            if error: raise error
            return result or {'copies_write_complete': 1}
        self.api.send_approved_job = send
    def test_disabled_start_does_not_create_thread(self):
        self.state.printing_enabled = False
        with patch.object(threading, 'Thread', forbidden): self.state.start_worker()
        self.assertIsNone(self.state.worker)
    def test_enabled_start_only_requests_daemon(self):
        with patch.object(threading, 'Thread') as thread:
            self.state.start_worker()
            thread.assert_called_once_with(target=self.state._work, name='deli720w-print-worker', daemon=True)
            thread.return_value.start.assert_called_once_with()
    def test_disabled_state_still_creates_report_directory(self):
        p = self.path / 'disabled'
        self.api.ApiState('fixture', 8765, p)
        self.assertTrue(p.is_dir())
    def test_receipt_reserved_before_enqueue(self):
        old = self.state.jobs.put_nowait
        def put(item):
            receipt = json.loads(self.state._receipt_path(self.key).read_text())
            self.assertEqual(receipt['status'], 'queued'); return old(item)
        with patch.object(self.state.jobs, 'put_nowait', put): self.submit()
    def test_duplicate_and_copy_conflict_never_requeue(self):
        a, accepted = self.submit(); b, duplicate = self.submit()
        self.assertTrue(accepted); self.assertFalse(duplicate); self.assertEqual(a,b)
        with self.assertRaises(ValueError): self.submit(copies=2)
        self.assertEqual(self.state.jobs.qsize(),1)
    def test_restart_changes_queued_to_unknown_and_never_requeues(self):
        self.submit()
        other = self.api.ApiState('fixture',8765,self.state.report_dir,True,ADDRESS,NAME)
        receipt, accepted = other.submit(self.key,self.digest,1,JOB)
        self.assertFalse(accepted); self.assertEqual(receipt['status'],'outcome_unknown_after_restart')
        self.assertEqual(other.jobs.qsize(),0)
    def test_full_queue_no_receipt_written(self):
        for i in range(self.api.MAX_QUEUE_JOBS): self.submit(key=f'synthetic-key-{i}')
        with self.assertRaises(OverflowError): self.submit()
        self.assertFalse(self.state._receipt_path(self.key).exists())
    def test_initial_persistence_failure_no_enqueue(self):
        with patch.object(self.state,'_save_receipt',side_effect=OSError('synthetic failure')):
            with self.assertRaises(OSError): self.submit()
        self.assertEqual(self.state.jobs.qsize(),0)
    def test_presend_persistence_failure_never_calls_sender(self):
        self.submit(); self.sender()
        with patch.object(self.state,'_save_receipt',side_effect=OSError('synthetic failure')): self.drain_one()
        self.assertEqual(self.calls,[])
        self.assertEqual(self.state.receipts[self.key]['status'],'failed_no_bytes_sent')
    def test_success_stays_unverified_and_one_send(self):
        self.submit(); self.sender(); self.drain_one()
        self.assertEqual(len(self.calls),1)
        r=self.state.receipts[self.key]
        self.assertEqual(r['status'],'submitted_unverified'); self.assertIs(r['physical_print_verified'],False)
        self.assertFalse(self.submit()[1]); self.assertEqual(len(self.calls),1)
    def test_incomplete_copies_unknown(self):
        self.submit(copies=2); self.sender(result={'copies_write_complete':1}); self.drain_one()
        self.assertEqual(self.state.receipts[self.key]['status'],'outcome_unknown')
    def test_error_without_report_unknown_no_retry(self):
        self.submit(); self.sender(error=RuntimeError('synthetic')); self.drain_one()
        self.assertEqual(len(self.calls),1); self.assertEqual(self.state.receipts[self.key]['status'],'outcome_unknown')
    def test_zero_bytes_report_is_clean_failure(self):
        self.submit(); self.sender(error=RuntimeError('synthetic'),report={'status':'no_job_bytes_sent','bytes_attempted':0}); self.drain_one()
        self.assertEqual(self.state.receipts[self.key]['status'],'failed_no_bytes_sent')
    def test_attempted_byte_is_unknown(self):
        self.submit(); self.sender(error=RuntimeError('synthetic'),report={'status':'no_job_bytes_sent','bytes_attempted':1}); self.drain_one()
        self.assertEqual(self.state.receipts[self.key]['status'],'outcome_unknown')
    def test_final_persistence_failure_keeps_unknown_on_restart(self):
        self.submit(); self.sender()
        original = self.state._save_receipt; calls=[]
        def save(*a,**kw):
            calls.append(1)
            if len(calls)==2: raise OSError('synthetic final persistence failure')
            return original(*a,**kw)
        with patch.object(self.state,'_save_receipt',save): self.drain_one()
        self.assertTrue(self.state.receipts[self.key]['persistence_error'])
        other=self.api.ApiState('fixture',8765,self.state.report_dir)
        self.assertEqual(other._read_receipt(self.key)['status'],'outcome_unknown_after_restart')

class TransportControls(OfflineCase):
    def setUp(self):
        super().setUp()
        self.events=[]; self.fail_write=None; self.duplicate=False; self.bad_name=False; self.notify_count=0; self.notify_size=1
        self.transport=load_selected(MODULE/'src/deli720w/transport.py',
                                      ['_validate_report_path','_session','send_approved_job'],True,
                                      {'BleakClient':forbidden,'BleakScanner':types.SimpleNamespace(discover=forbidden)})
        self.report=self.path/'report.json'
    def fake_ble(self):
        test=self; t=self.transport
        async def discover(**kw):
            test.events.append('scan')
            # Exclusive reservation must precede device discovery.
            test.assertTrue(test.report.exists())
            return {'fixture':(types.SimpleNamespace(address=ADDRESS,name=NAME),types.SimpleNamespace(local_name='wrong' if test.bad_name else NAME))}
        class Client:
            def __init__(self,*a,**kw):
                self.is_connected=False
                service=types.SimpleNamespace(uuid=t.SERVICE_UUID,characteristics=[
                    types.SimpleNamespace(uuid=t.RX_UUID,properties=['write']),
                    types.SimpleNamespace(uuid=t.TX_UUID,properties=['notify'])])
                self.services=[service]*(2 if test.duplicate else 1)
            async def connect(self): self.is_connected=True; test.events.append('connect')
            async def disconnect(self): self.is_connected=False; test.events.append('disconnect')
            async def start_notify(self,char,callback):
                test.events.append('notify')
                for _ in range(test.notify_count): callback(None,b'x'*test.notify_size)
            async def write_gatt_char(self,char,data,response):
                test.events.append(bytes(data)); test.assertTrue(response)
                if test.fail_write and sum(isinstance(v,bytes) for v in test.events)==test.fail_write:
                    raise RuntimeError('synthetic GATT failure')
        t.BleakScanner=types.SimpleNamespace(discover=discover); t.BleakClient=Client
        async def no_sleep(_): pass
        self.enterContext(patch.object(asyncio,'sleep',no_sleep))
    def send(self,**overrides):
        args=dict(address=ADDRESS,target_name=NAME,job=JOB,approved_hash=sha256(JOB).hexdigest(),copies=1,report_path=self.report)
        args.update(overrides); return self.transport.send_approved_job(**args)
    def test_guard_failures_precede_scan(self):
        for kw in [dict(address=''),dict(target_name='wrong'),dict(copies=3),dict(job=b''),dict(job=b'x'*12057),dict(approved_hash='0'*64),dict(job=b'not tspl',approved_hash=sha256(b'not tspl').hexdigest()),dict(report_path=self.path/'bad.txt')]:
            with self.subTest(kw=list(kw)), self.assertRaises(ValueError): self.send(**kw)
        self.assertFalse(self.report.exists())
    def test_existing_report_not_overwritten(self):
        self.report.write_text('reserved')
        with self.assertRaises(ValueError): self.send()
        self.assertEqual(self.report.read_text(),'reserved')
    def test_two_copies_single_session_stays_unverified(self):
        self.fake_ble(); result=self.send(copies=2)
        writes=[e for e in self.events if isinstance(e,bytes)]
        self.assertEqual(b''.join(writes),JOB*2); self.assertTrue(all(len(v)<=20 for v in writes))
        self.assertEqual(self.events.count('connect'),1); self.assertEqual(self.events.count('disconnect'),1)
        self.assertEqual(result['copies_write_complete'],2); self.assertIs(result['physical_print_verified'],False)
        self.assertEqual(result['target_address'],'[redacted]')
    def test_partial_write_unknown_no_retry_and_disconnect(self):
        self.fail_write=2; self.fake_ble()
        with self.assertRaises(RuntimeError): self.send()
        report=json.loads(self.report.read_text())
        self.assertEqual(report['status'],'outcome_unknown_after_write_attempt')
        self.assertEqual(report['chunks_attempted'],2); self.assertEqual(report['chunks_acknowledged'],1)
        self.assertEqual(self.events.count('scan'),1); self.assertEqual(self.events.count('disconnect'),1)
    def test_duplicate_profile_stops_before_notify_and_write(self):
        self.duplicate=True; self.fake_ble()
        with self.assertRaises(ValueError): self.send()
        self.assertNotIn('notify',self.events); self.assertFalse(any(isinstance(e,bytes) for e in self.events))
        self.assertEqual(json.loads(self.report.read_text())['bytes_attempted'],0)
        self.assertEqual(self.events.count('disconnect'),1)
    def test_wrong_name_stops_before_connect(self):
        self.bad_name=True; self.fake_ble()
        with self.assertRaises(ValueError): self.send()
        self.assertEqual(self.events,['scan'])
    def test_notification_event_limit(self):
        self.notify_count=70; self.fake_ble(); r=self.send()
        self.assertEqual(len(r['notify_hex']),64); self.assertTrue(r['notify_truncated'])
    def test_notification_byte_limit(self):
        self.notify_count=10; self.notify_size=1000; self.fake_ble(); r=self.send()
        self.assertEqual(len(r['notify_hex']),4); self.assertTrue(r['notify_truncated'])

class WrapperControls(OfflineCase):
    def test_scan_wrapper_forwards_send_argv_without_executing_it(self):
        path=MODULE/'scripts/scan_ble.py'; tree=ast.parse(path.read_bytes())
        # Keep original executable wrapper body; replace only imports with stubs.
        body=[n for n in tree.body if not isinstance(n,(ast.Import,ast.ImportFrom))]
        calls=[]
        ns={'__name__':'__main__','sys':sys,
            'main':lambda argv: calls.append(argv) or 0}
        with patch.object(sys, 'argv', ['scan_ble.py','print','--send']), self.assertRaises(SystemExit) as result:
            exec(compile(ast.Module(body=body,type_ignores=[]),str(path.relative_to(ROOT)),'exec'),ns)
        self.assertEqual(result.exception.code,0); self.assertEqual(calls,[['print','--send']])

if __name__=='__main__': unittest.main(verbosity=2)
