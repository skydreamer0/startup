"""Reproduce the sealed print review's extra probes using only stdlib.

Run from the repository root. All fixture writes occur under a newly created
repository-relative output directory. The original six source files are pinned
and never edited. --audit-suite optionally repeats the original 52-test audit;
without it only the supplemental probes run.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True

PINS = {
    'scripts/architecture/verify-print-inventory.py': '7d6ea85f58a342a3d9091d0d6e792f0c76c73e18572dc9d98a1020df55024529',
    'scripts/architecture/test_print_inventory.py': 'e7cc1180858b6b67c82633a4ba58fa655461bdad7d2ce298a47be0daee2b6d5d',
    'scripts/architecture/test_print_worker_controls.py': 'b854d0a160db222cc859005099f5599b0286e6db46808d575f57911a55353038',
    'systems/enterprise-admin/infrastructure/plans/architecture-v2/print-inventory.json': '5b5b590253b1fea684e028342dcc1cde38f7bc8e4e6fb0faecfbebae7a7c4957',
    'systems/enterprise-admin/infrastructure/plans/architecture-v2/print-effects.json': 'e40531f05c69403c0f83e50eb7c86b18d8999ad0a7f6be741b212338dffbf36b',
    'systems/enterprise-admin/infrastructure/plans/architecture-v2/print-verification.md': '95055bbb4a3abe496b4b3c17bccad061f613a6c59606415565367ac61ac5f2fc',
}
INITIAL_VERIFIER_SHA256 = 'acbf77c3eaa0739dabf4014bfd4e1ee362490503ac15cd8c6cb2737f0f22ddab'
PRIVATE_FILES = ['private/api-token.txt', 'captures/private/transport.json']

# Exact initial file discovery implementation, preserved in the sealed review.
INITIAL_FILES_FUNCTION = '''def files(root: Path) -> list[str]:
    result = []
    for p in (root / MODULE).rglob('*'):
        rel = p.relative_to(root / MODULE)
        if set(rel.parts) & EXCLUDED_PARTS or p.suffix in EXCLUDED_SUFFIXES:
            continue
        if p.is_symlink():
            raise ValueError(f'symlink is not reviewed: {p.relative_to(root)}')
        if p.is_file(): result.append(p.relative_to(root).as_posix())
    return sorted(result + REFERENCES)

'''


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def initial_verifier(final_source):
    """Reconstruct exact historical bytes, then verify their sealed hash."""
    source = final_source.replace('import os\n', '', 1)
    source = source.replace(", 'work', 'private'}", ", 'work'}", 1)
    source = source.replace(
        "('src/deli720w/api.py:ApiState.recent_receipts', 'Reads receipt files and merges in-memory status', ['test_api.py:test_exact_hash_idempotency_and_conflict_before_queue']",
        "('src/deli720w/api.py:ApiState.recent_receipts', 'Reads receipt files and merges in-memory status', ['test_api.py:test_restart_reservation_never_requeues']", 1)
    source = source.replace(
        'Reads candidate font files; raises RuntimeError if no supported font exists',
        'Reads candidate font files or uses default font', 1)
    source = source.replace(
        "('src/deli720w/raster.py:save_preview', 'Creates parent and PNG preview file', ['test_raster.py:test_mixed_label_is_monochrome_and_has_ink']",
        "('src/deli720w/raster.py:save_preview', 'Creates parent and PNG preview file', ['test_tspl.py:test_candidate_files_and_cli_send_refusal']", 1)
    start, end = source.index('def files('), source.index('def snapshot(')
    source = source[:start] + INITIAL_FILES_FUNCTION + source[end:]
    source = source.replace("            'excludedRuntimeDirectories': sorted(EXCLUDED_PARTS) + ['*.egg-info'],\n", '', 1)
    source = source.replace("            'excludedRuntimeFiles': ['*.pyc', '*.pyo', 'samples/*.png', 'samples/*.json'],\n", '', 1)
    check(hashlib.sha256(source.encode()).hexdigest() == INITIAL_VERIFIER_SHA256,
          'Historical verifier reconstruction does not match the sealed initial hash')
    module = types.ModuleType('sealed_initial_print_inventory')
    exec(compile(source, 'scripts/architecture/verify-print-inventory.py', 'exec'), module.__dict__)
    return module


def metadata_probes(verifier, fixture, inventory, effects):
    mutations = [
        ('activation_enabled', lambda e: e.update(activation='ENABLED')),
        ('evidence_kind_runtime', lambda e: e['effects'][0].update(evidenceKind='runtime-test')),
        ('scope_expansion', lambda e: e.update(scope='all printers')),
        ('remove_worker_row', lambda e: e['effects'].pop(15)),
    ]
    results = {}
    for name, mutate in mutations:
        changed = copy.deepcopy(effects)
        mutate(changed)
        try:
            verifier.verify(fixture, inventory, changed)
        except ValueError:
            results[name] = 'REJECTED'
        else:
            raise AssertionError('Metadata mutation survived: ' + name)
    return results


def supplemental_probes(root, output, verifier, worker):
    inventory = json.loads((root / verifier.PLAN / 'print-inventory.json').read_text())
    effects = json.loads((root / verifier.PLAN / 'print-effects.json').read_text())
    result = {}
    with tempfile.TemporaryDirectory(prefix='fixture-', dir=output) as temporary:
        fixture = Path(temporary)
        for relative in verifier.files(root) + [verifier.PLAN + '/manifest.json']:
            target = fixture / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(root / relative, target)
        sentinels = []
        for relative in PRIVATE_FILES:
            path = fixture / verifier.MODULE / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('SYNTHETIC-NONSECRET-SENTINEL', encoding='utf-8')
            sentinels.append(path)

        # Reproduce the original failure with the exact initial verifier bytes.
        historical = initial_verifier((root / 'scripts/architecture/verify-print-inventory.py').read_text())
        old_inventory = copy.deepcopy(inventory)
        old_inventory.pop('excludedRuntimeDirectories')
        old_inventory.pop('excludedRuntimeFiles')
        initial_reads = []
        original_read = Path.read_bytes
        def historical_read(path):
            if path in sentinels:
                initial_reads.append(path.relative_to(fixture).as_posix())
            return original_read(path)
        with patch.object(Path, 'read_bytes', historical_read):
            try:
                historical.verify(fixture, old_inventory, historical.effect_contract())
            except ValueError as error:
                initial_failure = str(error)
            else:
                raise AssertionError('Historical private-file mismatch did not occur')
        expected_private = sorted(p.relative_to(fixture).as_posix() for p in sentinels)
        check(sorted(initial_reads) == expected_private, 'Historical read spy did not see both sentinels')
        result['initialPrivateReplay'] = {
            'verifierSha256': INITIAL_VERIFIER_SHA256,
            'privateReadsBeforeFailure': sorted(initial_reads),
            'error': initial_failure,
            'note': 'New reproduction of the historical problem with exact reconstructed initial verifier bytes. The sealed initial observation is unchanged.',
        }

        # Verify the corrected path selector neither traverses, reads nor copies.
        reads, copies, visited = [], [], []
        original_copy, original_walk = shutil.copyfile, verifier.os.walk
        def read_spy(path):
            check(path not in sentinels, 'Private sentinel read by corrected verifier')
            reads.append(path.relative_to(fixture).as_posix())
            return original_read(path)
        def copy_spy(src, dst, *args, **kwargs):
            check(Path(src) not in sentinels, 'Private sentinel copied by corrected selector')
            copies.append(Path(src).relative_to(fixture).as_posix())
            return original_copy(src, dst, *args, **kwargs)
        def walk_spy(*args, **kwargs):
            for item in original_walk(*args, **kwargs):
                visited.append(Path(item[0]).relative_to(fixture).as_posix())
                yield item
        with tempfile.TemporaryDirectory(prefix='copied-', dir=output) as destination:
            with patch.object(Path, 'read_bytes', read_spy), patch.object(shutil, 'copyfile', copy_spy), patch.object(verifier.os, 'walk', walk_spy):
                check(verifier.verify(fixture, inventory, effects)['status'] == 'PASS', 'Fixed private probe failed')
                for relative in verifier.files(fixture):
                    target = Path(destination) / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(fixture / relative, target)
        check(not any('private' in Path(p).parts for p in reads + copies + visited), 'Private subtree was accessed')
        result['fixedPrivateProbe'] = {'status': 'PASS', 'privateReads': [], 'privateCopies': [], 'privateSubtreesVisited': []}
        result['metadataMutations'] = metadata_probes(verifier, fixture, inventory, effects)

        # Change only the disposable fixture and run the exact relevant tests.
        worker.ROOT, worker.MODULE = fixture, fixture / verifier.MODULE
        mutations = [
            ('src/deli720w/api.py', 'if self.printing_enabled:', 'if True:', worker.WorkerControls, 'test_disabled_start_does_not_create_thread'),
            ('src/deli720w/transport.py', 'if copies not in (1, 2):', 'if False:', worker.TransportControls, 'test_guard_failures_precede_scan'),
        ]
        result['guardMutations'] = []
        for relative, before, after, case, method in mutations:
            path = fixture / verifier.MODULE / relative
            original = path.read_text()
            check(before in original, 'Mutation target missing: ' + relative)
            path.write_text(original.replace(before, after, 1))
            try:
                outcome = unittest.TextTestRunner(stream=io.StringIO()).run(unittest.TestSuite([case(method)]))
                check(not outcome.wasSuccessful() and not outcome.errors, 'Guard mutation was not killed by an assertion')
                result['guardMutations'].append({'source': verifier.MODULE + '/' + relative, 'test': method, 'status': 'KILLED', 'failures': len(outcome.failures), 'errors': len(outcome.errors)})
            finally:
                path.write_text(original)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='.', help='Repository-relative root from the current working directory')
    parser.add_argument('--output-dir', required=True, help='New repository-relative directory; existing directories are refused')
    parser.add_argument('--audit-suite', action='store_true', help='Also repeat all 52 tests with the original audit and Thread.start guards')
    args = parser.parse_args()
    check(not Path(args.root).is_absolute() and '..' not in Path(args.root).parts, '--root must be repository-relative')
    check(not Path(args.output_dir).is_absolute() and '..' not in Path(args.output_dir).parts, '--output-dir must be repository-relative')
    root = Path(args.root).resolve()
    for relative, expected in PINS.items():
        check(hashlib.sha256((root / relative).read_bytes()).hexdigest() == expected, 'Reviewed source pin changed: ' + relative)
    output = root / args.output_dir
    output.mkdir(parents=True, exist_ok=False)
    # Keep unittest TemporaryDirectory fixtures inside the new run directory.
    tempfile.tempdir = str(output)
    external_attempts, socket_types = [], []
    def audit(event, values):
        if event in {'socket.bind', 'socket.connect', 'socket.sendto', 'subprocess.Popen', 'os.system', 'os.exec', 'os.posix_spawn', 'os.fork'}:
            external_attempts.append(event)
            raise AssertionError('External capability forbidden in independent review: ' + event)
        if event == 'socket.__new__':
            socket_types.append((int(values[1]), int(values[2])))
    sys.addaudithook(audit)
    def no_thread(*args, **kwargs):
        raise AssertionError('Real worker thread forbidden in independent review')
    report = {'schemaVersion': 1, 'sourcePins': PINS, 'suiteRequested': args.audit_suite}
    with patch.object(threading.Thread, 'start', no_thread):
        verifier = load('review_inventory_reproduction', root / 'scripts/architecture/verify-print-inventory.py')
        worker = load('review_worker_reproduction', root / 'scripts/architecture/test_print_worker_controls.py')
        report['supplementalProbes'] = supplemental_probes(root, output, verifier, worker)
        if args.audit_suite:
            capture = io.StringIO()
            suite = unittest.defaultTestLoader.discover(str(root / 'scripts/architecture'), pattern='test_print_*.py')
            outcome = unittest.TextTestRunner(stream=capture, verbosity=1).run(suite)
            check(outcome.wasSuccessful() and outcome.testsRun == 52, 'Audited suite did not pass exactly 52 tests')
            report['auditedSuite'] = {'status': 'PASS', 'testsRun': outcome.testsRun, 'output': capture.getvalue().replace(str(root), '.')}
        else:
            report['auditedSuite'] = {'status': 'NOT_RUN', 'reason': 'Optional unchanged 52-test suite was not requested; the sealed review retains its original executed result.'}
    check(not external_attempts, 'Unexpected external audit event occurred')
    for relative, expected in PINS.items():
        check(hashlib.sha256((root / relative).read_bytes()).hexdigest() == expected, 'Reviewed source changed during reproduction: ' + relative)
    report['audit'] = {'externalEventsAttempted': external_attempts, 'socketFamiliesTypesObserved': sorted(set(socket_types)), 'realThreadStart': 'FORBIDDEN', 'scope': 'Known pinned-source capabilities only; not an arbitrary-code security sandbox.'}
    report['status'] = 'PASS'
    path = output / 'result.json'
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'status': 'PASS', 'result': path.relative_to(root).as_posix(), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
