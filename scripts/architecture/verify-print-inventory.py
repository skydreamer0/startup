"""Read-only, dependency-free snapshot and reviewed effect/test mapping checks.

This is a bounded source review, not a Python semantic analyzer or device test.
The inventory is generated separately; this command never refreshes acceptance.
"""
from __future__ import annotations
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import tomllib

MODULE = 'systems/enterprise-admin/local-print-agent'
PLAN = 'systems/enterprise-admin/infrastructure/plans/architecture-v2'
REFERENCES = [
    'systems/enterprise-admin/admin-ui/src/services/localLabelPrinter.ts',
    'systems/enterprise-admin/admin-ui/src/components/MedicineLabelDialog.tsx',
    'systems/enterprise-admin/admin-ui/src/__tests__/MedicineLabelDialog.test.tsx',
    'systems/enterprise-admin/infrastructure/adr/adr_023_local_ble_medicine_label_bridge.md',
]
EXCLUDED_PARTS = {'.git', '__pycache__', '.pytest_cache', '.venv', 'venv', 'reports', 'work', 'private'}
EXCLUDED_SUFFIXES = {'.pyc', '.pyo'}
# Reviewed edges. These are source citations, not claims that a test is sufficient
# for an entire caller chain. Untested edges have explicit gaps.
# (source symbol, effect, existing test symbols, gap)
SPECS = [
 ('src/deli720w/cli.py:main', 'CLI dispatch: scan, GATT metadata, report files, preview files, explicit BLE send', ['test_safety.py:test_send_fails_before_any_raster_or_ble','test_transport.py:test_cli_routes_only_fully_explicit_send'], 'No full CLI renderer or device run in this slice.'),
 ('scripts/scan_ble.py:<module>', 'Forwards arbitrary argv to CLI, including guarded print --send; not read-only by name', [], 'Wrapper dispatch is bounded by a new offline test; no separate existing wrapper test.'),
 ('src/deli720w/ble.py:scan', 'BLE advertisement scan, no write', ['test_safety.py:test_scan_filters_unrelated_devices','test_safety.py:test_scan_timeouts_bounded'], 'Mock scan does not prove hardware availability.'),
 ('src/deli720w/ble.py:services', 'BLE connect, enumerate GATT, disconnect; metadata report is written by CLI', ['test_safety.py:test_services_never_connects_to_unrelated_name','test_safety.py:test_services_disconnects_and_only_enumerates_metadata'], 'Metadata connection is still device I/O.'),
 ('src/deli720w/api.py:main', 'init-token or loopback serve entry', ['test_api.py:test_token_file_and_origin_validation'], 'Existing test covers helpers, not entire CLI startup.'),
 ('src/deli720w/api.py:init_token_file', 'Exclusive token-file creation and parent directory creation', ['test_api.py:test_token_file_and_origin_validation'], 'No real token created by this acceptance slice.'),
 ('src/deli720w/api.py:_load_token', 'Token-file read and format validation', ['test_api.py:test_token_file_and_origin_validation'], 'No existing private token read.'),
 ('src/deli720w/api.py:run_server', 'Starts enabled worker and binds HTTP listener only to 127.0.0.1', ['test_api.py:test_token_host_origin_gate_every_endpoint'], 'Existing test uses make_handler, not run_server; actual listener startup remains NOT_RUN.'),
 ('src/deli720w/api.py:make_handler', 'Authenticated HTTP routes; preview, queue submission, receipt reads', ['test_api.py:test_token_host_origin_gate_every_endpoint','test_api.py:test_default_off_dry_run_hash_and_no_enqueue','test_api.py:test_exact_browser_preflight_has_no_data_access'], 'HTTP/browser/origin end-to-end suite NOT_RUN in this slice.'),
 ('src/deli720w/api.py:ApiState.__post_init__', 'Validates configuration and creates report directory even when printing disabled', ['test_api.py:test_token_file_and_origin_validation'], 'No guarantee that disabled mode is filesystem-read-only.'),
 ('src/deli720w/api.py:ApiState._save_receipt', 'Exclusive durable reservation or temp-file replace', ['test_api.py:test_restart_reservation_never_requeues','test_api.py:test_worker_persistence_failure_cannot_send'], 'Atomic replacement is not an fsync or power-loss durability guarantee.'),
 ('src/deli720w/api.py:ApiState._read_receipt', 'Reads receipt and marks orphaned queued/printing outcome unknown', ['test_api.py:test_restart_reservation_never_requeues'], 'No automatic replay after restart.'),
 ('src/deli720w/api.py:ApiState.recent_receipts', 'Reads receipt files and merges in-memory status', ['test_api.py:test_exact_hash_idempotency_and_conflict_before_queue'], 'Partial source citation; malformed receipt and paging coverage not claimed.'),
 ('src/deli720w/api.py:ApiState.submit', 'Reserve receipt before in-memory queue; idempotent key/fingerprint conflict rejection', ['test_api.py:test_exact_hash_idempotency_and_conflict_before_queue','test_api.py:test_approved_symbol_job_queues_once_without_hardware_send'], 'Caller must enforce authorization, approved hash, printing_enabled and valid key; submit alone is not public authorization.'),
 ('src/deli720w/api.py:ApiState.start_worker', 'Optional daemon thread; no worker when printing disabled', ['test_api.py:test_mock_worker_submitted_unverified_and_no_retry'], 'No real thread started by new offline tests.'),
 ('src/deli720w/api.py:ApiState._work', 'Persist pre-send state, invoke transport once, persist unverified/unknown/no-bytes status', ['test_api.py:test_mock_worker_submitted_unverified_and_no_retry','test_api.py:test_worker_persistence_failure_cannot_send'], 'No automatic retry and no physical-print confirmation.'),
 ('src/deli720w/transport.py:send_approved_job', 'Validate explicit target/hash/copies/framing, reserve fresh JSON before BLE', ['test_transport.py:test_send_guard_rejects_bad_hash_copies_and_size_before_scan'], 'Source gates are not new user permission to print.'),
 ('src/deli720w/transport.py:_session', 'Exact device/profile selection, bounded chunk writes/notifications, disconnect, transmission report', ['test_transport.py:test_two_copy_single_session_with_mock_ble'], 'Acknowledged BLE bytes never imply physical print success.'),
 ('src/deli720w/raster.py:_font', 'Reads candidate font files; raises RuntimeError if no supported font exists', ['test_raster.py:test_mixed_label_is_monochrome_and_has_ink'], 'Physical readability, fonts and rendering dependencies NOT_RUN.'),
 ('src/deli720w/raster.py:save_preview', 'Creates parent and PNG preview file', ['test_raster.py:test_mixed_label_is_monochrome_and_has_ink'], 'Renderer suite NOT_RUN.'),
 ('src/deli720w/tspl.py:save_candidate', 'Creates preview PNG, TSPL binary and metadata JSON', ['test_tspl.py:test_candidate_files_and_cli_send_refusal'], 'Offline files do not establish printer compatibility.'),
 ('scripts/prepare_suite.py:main', 'Offline sample files and suite_manifest; generated argv are inert data', [], 'No existing dedicated prepare_suite test; not executed here.'),
 ('scripts/experimental_ble_job.py:preflight', 'Reads private target-name file and pinned TSPL sample; validates constrained report path', ['test_experimental_guard.py:test_preflight_requires_exact_hash_and_private_target'], 'Private target file not read; experimental entry is separate from API transport.'),
 ('scripts/experimental_ble_job.py:perform', 'Experimental one-job BLE writes and report, bounded notifications, disconnect, no retry', ['test_experimental_guard.py:test_exact_service_single_job_and_disconnect','test_experimental_guard.py:test_partial_send_is_unknown_and_never_retried','test_experimental_guard.py:test_duplicate_profile_fails_before_notify_or_write'], 'Existing experimental pytest suite NOT_RUN; no physical evidence.'),
 ('scripts/experimental_ble_job.py:main', 'Explicit experimental flag, preflight, exclusive report reservation then async BLE', ['test_experimental_guard.py:test_preflight_requires_exact_hash_and_private_target'], 'Helper citation is not full main execution.'),
 ('scripts/diagnose_windows.ps1:<file>', 'Windows device/driver/USB/OS queries and partially redacted JSON report', [], 'No existing test; Windows/device diagnostics NOT_RUN.'),
]

def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def facts(data: bytes, path: str) -> dict:
    if not path.endswith('.py'):
        return {}
    tree = ast.parse(data, filename=path)
    symbols = {}
    def visit(nodes, prefix=''):
        for n in nodes:
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                name = prefix + n.name
                symbols[name] = {'line': n.lineno, 'endLine': n.end_lineno,
                                 'astSha256': digest(ast.dump(n, include_attributes=False).encode())}
                visit(n.body, name + '.')
    visit(tree.body)
    imports = sorted(ast.dump(n, include_attributes=False) for n in ast.walk(tree)
                     if isinstance(n, (ast.Import, ast.ImportFrom)))
    calls = sorted({ast.unparse(n.func) for n in ast.walk(tree) if isinstance(n, ast.Call)})
    local = sorted({n.module or '' for n in ast.walk(tree) if isinstance(n, ast.ImportFrom) and n.level})
    return {'moduleAstSha256': digest(ast.dump(tree, include_attributes=False).encode()),
            'symbols': symbols, 'imports': imports, 'calls': calls, 'relativeModules': local}

def files(root: Path) -> list[str]:
    # Prune private/runtime directories BEFORE descent or reads. A normal
    # installation keeps real token and printer reports in private/ and
    # captures/private/; neither content nor nested filenames are inventory.
    result = []
    base = root / MODULE
    for directory, directories, filenames in os.walk(base, topdown=True, followlinks=False):
        directories[:] = sorted(d for d in directories
                                if d not in EXCLUDED_PARTS and not d.endswith('.egg-info'))
        for name in directories:
            p = Path(directory) / name
            if p.is_symlink(): raise ValueError(f'symlink is not reviewed: {p.relative_to(root)}')
        for name in sorted(filenames):
            p = Path(directory) / name
            rel = p.relative_to(base)
            if p.suffix in EXCLUDED_SUFFIXES: continue
            if len(rel.parts) == 2 and rel.parts[0] == 'samples' and p.suffix in {'.png', '.json'}:
                continue  # Generated preview/suite artifacts, per module .gitignore.
            if p.is_symlink(): raise ValueError(f'symlink is not reviewed: {p.relative_to(root)}')
            result.append(p.relative_to(root).as_posix())
    return sorted(result + REFERENCES)

def snapshot(root: Path) -> dict:
    records = []
    for path in files(root):
        data = (root / path).read_bytes()
        records.append({'path': path, 'sha256': digest(data),
                        'gitBlob': hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest(),
                        'facts': facts(data, path)})
    project = tomllib.loads((root / MODULE / 'pyproject.toml').read_text())
    return {'schemaVersion': 1, 'scope': MODULE,
            'excludedRuntimeDirectories': sorted(EXCLUDED_PARTS) + ['*.egg-info'],
            'excludedRuntimeFiles': ['*.pyc', '*.pyo', 'samples/*.png', 'samples/*.json'],
            'entryPoints': project['project']['scripts'],
            'dependencies': project['project']['dependencies'], 'files': records}

def effect_contract() -> dict:
    rows = []
    for index, (source, effect, tests, gap) in enumerate(SPECS, 1):
        rows.append({'id': f'PRINT-{index:02}', 'source': MODULE + '/' + source,
                     'owner': 'AR-18', 'requiredChecks': ['AR-18-AC01','AR-18-AC03'],
                     'effect': effect, 'existingTests': [MODULE + '/tests/' + t for t in tests],
                     'evidenceKind': 'source-reference-only', 'runtime': 'NOT_RUN', 'gap': gap})
    return {'schemaVersion': 1, 'scope': 'local BLE medicine-label bridge only; excludes POS WebUSB/receipt devices',
            'coverage': 'Reviewed effect-bearing entry points and helpers; not whole-program semantic proof',
            'activation': 'BLOCKED', 'physicalVerification': 'NOT_RUN', 'effects': rows}

def verify(root: Path, inventory: dict | None = None, effects: dict | None = None) -> dict:
    inventory = inventory if inventory is not None else json.loads((root / PLAN / 'print-inventory.json').read_text())
    effects = effects if effects is not None else json.loads((root / PLAN / 'print-effects.json').read_text())
    actual = snapshot(root)
    if inventory != actual:
        raise ValueError('print inventory differs from current file set, content, Python facts or project entry points')
    if effects != effect_contract():
        raise ValueError('reviewed effect/test/owner/status contract differs')
    by_path = {r['path']: r for r in actual['files']}
    manifest = json.loads((root / PLAN / 'manifest.json').read_text())
    owner = next(t for t in manifest['tasks'] if t['id'] == 'AR-18')
    checks = {c['id'] for c in owner['requiredChecks']}
    for row in effects['effects']:
        if not set(row['requiredChecks']) <= checks: raise ValueError('unknown owner check')
        for ref in [row['source']] + row['existingTests']:
            path, symbol = ref.rsplit(':', 1)
            record = by_path[path]
            if symbol not in ('<file>', '<module>') and symbol not in record['facts']['symbols']:
                raise ValueError(f'unresolved source/test reference: {ref}')
    # Relative module closure is reviewed within the fixed package, without import.
    for r in actual['files']:
        if '/src/deli720w/' not in r['path']: continue
        for module in r['facts'].get('relativeModules', []):
            if module and MODULE + '/src/deli720w/' + module.replace('.', '/') + '.py' not in by_path:
                raise ValueError('unresolved local import: ' + module)
    return {'status': 'PASS', 'scope': 'bounded source inventory and reviewed references only',
            'files': len(actual['files']), 'effects': len(effects['effects']),
            'testReferences': sum(len(r['existingTests']) for r in effects['effects']),
            'originalPythonSuite': 'NOT_RUN', 'device': 'NOT_RUN', 'overallAC01': 'NOT_RUN'}

def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = p.parse_args()
    try:
        print(json.dumps(verify(args.root), indent=2)); return 0
    except (OSError, ValueError, KeyError, StopIteration, SyntaxError) as error:
        print(json.dumps({'status': 'FAIL', 'error': str(error)})); return 1

if __name__ == '__main__':
    raise SystemExit(main())
