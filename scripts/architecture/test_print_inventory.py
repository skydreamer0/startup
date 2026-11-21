"""Offline omission, drift and reviewed metadata negative controls."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('print_inventory', Path(__file__).with_name('verify-print-inventory.py'))
V = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V)

class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.inventory = json.loads((ROOT / V.PLAN / 'print-inventory.json').read_text())
        self.effects = json.loads((ROOT / V.PLAN / 'print-effects.json').read_text())
        for path in V.files(ROOT) + [V.PLAN + '/manifest.json']:
            target = self.root / path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / path, target)
    def verify(self): return V.verify(self.root, self.inventory, self.effects)
    def rejected(self):
        with self.assertRaises((ValueError, OSError, KeyError, StopIteration, SyntaxError)): self.verify()
    def mutate(self, relative, before, after, refresh_hash=False):
        path = V.MODULE + '/' + relative
        p = self.root / path
        source = p.read_text(); self.assertIn(before, source)
        p.write_text(source.replace(before, after, 1))
        if refresh_hash:
            data = p.read_bytes()
            record = next(r for r in self.inventory['files'] if r['path'] == path)
            record['sha256'] = hashlib.sha256(data).hexdigest()
            record['gitBlob'] = hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()
    def test_baseline(self): self.assertEqual(self.verify()['effects'], 26)
    def test_omit_source_record(self): self.inventory['files'].pop(); self.rejected()
    def test_omit_effect(self): self.effects['effects'].pop(); self.rejected()
    def test_omit_test_reference(self): self.effects['effects'][0]['existingTests'] = []; self.rejected()
    def test_wrong_owner(self): self.effects['effects'][0]['owner'] = 'AR-23'; self.rejected()
    def test_wrong_gate(self): self.effects['effects'][0]['requiredChecks'] = ['AR-18-AC99']; self.rejected()
    def test_wrong_source_symbol(self): self.effects['effects'][0]['source'] += 'missing'; self.rejected()
    def test_wrong_test_symbol(self): self.effects['effects'][0]['existingTests'][0] += 'missing'; self.rejected()
    def test_effect_label_downgrade(self): self.effects['effects'][1]['effect'] = 'read-only'; self.rejected()
    def test_unearned_runtime_pass(self): self.effects['effects'][0]['runtime'] = 'PASS'; self.rejected()
    def test_unearned_physical_pass(self): self.effects['physicalVerification'] = 'PASS'; self.rejected()
    def test_removed_gap(self): self.effects['effects'][0]['gap'] = ''; self.rejected()
    def test_added_python_writer(self):
        (self.root / V.MODULE / 'src/deli720w/new_writer.py').write_text('def write():\n    open("oops", "w")\n'); self.rejected()
    def test_added_auxiliary_entry(self):
        (self.root / V.MODULE / 'scripts/new.ps1').write_text('Write-Output test'); self.rejected()
    def test_deleted_transport(self): (self.root / V.MODULE / 'src/deli720w/transport.py').unlink(); self.rejected()
    def test_deleted_ui_reference(self): (self.root / V.REFERENCES[0]).unlink(); self.rejected()
    def test_modified_ui_reference(self):
        with (self.root / V.REFERENCES[0]).open('a') as f: f.write('\n// change\n')
        self.rejected()
    def test_changed_project_entry(self):
        self.mutate('pyproject.toml', 'deli720w.cli:main', 'deli720w.api:main'); self.rejected()
    def test_changed_transport_guard_even_with_refreshed_file_hashes(self):
        self.mutate('src/deli720w/transport.py', 'if copies not in (1, 2):', 'if False:', True); self.rejected()
    def test_changed_worker_guard_even_with_refreshed_file_hashes(self):
        self.mutate('src/deli720w/api.py', 'if self.printing_enabled:', 'if True:', True); self.rejected()
    def test_changed_test_body_even_with_refreshed_file_hashes(self):
        self.mutate('tests/test_transport.py', 'def test_send_guard_', 'def renamed_test_send_guard_', True); self.rejected()
    def test_new_import_even_with_refreshed_file_hashes(self):
        self.mutate('src/deli720w/transport.py', 'import asyncio', 'import asyncio\nimport socket', True); self.rejected()
    def test_changed_sample_bytes(self):
        p = self.root / V.MODULE / 'samples/experimental-english-30x50.tspl.bin'
        p.write_bytes(p.read_bytes() + b'x'); self.rejected()
    def test_symlink_rejected(self):
        (self.root / V.MODULE / 'src/deli720w/link.py').symlink_to('api.py'); self.rejected()
    def test_unknown_manifest_check(self):
        p = self.root / V.PLAN / 'manifest.json'; m = json.loads(p.read_text())
        next(t for t in m['tasks'] if t['id'] == 'AR-18')['requiredChecks'] = []
        p.write_text(json.dumps(m)); self.rejected()
    def test_private_directories_are_pruned_before_read_or_fixture_copy(self):
        sentinels = []
        for relative in ['private/api-token.txt', 'captures/private/transport.json']:
            p = self.root / V.MODULE / relative
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text('SYNTHETIC SENTINEL ONLY', encoding='utf-8')
            sentinels.append(p)
        original_read = Path.read_bytes
        original_walk = V.os.walk
        visited = []
        reads = []
        def read(path):
            self.assertNotIn(path, sentinels)
            reads.append(path)
            return original_read(path)
        def walk(*args, **kwargs):
            for item in original_walk(*args, **kwargs):
                visited.append(Path(item[0]))
                yield item
        with patch.object(Path, 'read_bytes', read), patch.object(V.os, 'walk', walk):
            self.verify()
            selected = V.files(self.root)
            # Fixture copy uses exactly the same selector as InventoryTests.setUp.
            with tempfile.TemporaryDirectory() as temp:
                for relative in selected:
                    target = Path(temp) / relative
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copyfile(self.root / relative, target)
                self.assertFalse(any(p.name in {'api-token.txt', 'transport.json'} for p in Path(temp).rglob('*')))
        self.assertFalse(any('private' in p.parts for p in visited))
        self.assertFalse(any('private' in p.parts for p in reads))
    def test_generated_preview_files_are_not_source(self):
        for name in ['generated.png', 'suite_manifest.json']:
            (self.root / V.MODULE / 'samples' / name).write_bytes(b'synthetic')
        self.verify()
    def test_no_inventory_side_effect(self):
        before = sorted(str(p.relative_to(self.root)) for p in self.root.rglob('*'))
        self.verify()
        self.assertEqual(before, sorted(str(p.relative_to(self.root)) for p in self.root.rglob('*')))

if __name__ == '__main__': unittest.main(verbosity=2)
