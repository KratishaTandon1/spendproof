import json
from pathlib import Path
import sys
import tempfile
import unittest
import zipfile

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
try:
    import package_release as release
finally:
    sys.path.pop(0)


class ReleaseTests(unittest.TestCase):
    def make_source(self, root):
        for name in release.ROOT_FILES:
            (root / name).write_text('public source\n')
        for name in release.SOURCE_FOLDERS:
            (root / name).mkdir()
        (root / 'src' / 'app.ts').write_text('export const app = true;\n')

    def test_source_only_archive_excludes_private_local_state_and_has_a_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'project with spaces'
            root.mkdir()
            self.make_source(root)
            for name in ['.dev.vars', '.env.production', 'private-notes.txt']:
                (root / name).write_text('do-not-package')
            for name in ['node_modules', '.wrangler', '.git', 'dist', 'test-results']:
                (root / name).mkdir()
                (root / name / 'secret.txt').write_text('do-not-package')
            (root / 'scripts' / '__pycache__').mkdir()
            (root / 'scripts' / '__pycache__' / 'cached.pyc').write_bytes(b'cached')
            output = Path(directory) / 'handoff.zip'
            count, checksum = release.build_release(root, output)
            with zipfile.ZipFile(output) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(len(archive.namelist()), count)
                self.assertIn('spendproof/.gitignore', archive.namelist())
                self.assertIn('spendproof/src/app.ts', archive.namelist())
                self.assertFalse(any('secret.txt' in name or '__pycache__' in name for name in archive.namelist()))
                self.assertNotIn('spendproof/.dev.vars', archive.namelist())
                manifest = json.loads(archive.read('spendproof/RELEASE-MANIFEST.json'))
                self.assertEqual(len(manifest['files']), count - 1)
            self.assertIn(checksum, output.with_suffix('.zip.sha256').read_text())

    def test_private_value_in_source_rejects_release_before_writing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_source(root)
            (root / 'src' / 'app.ts').write_text('accidentally-embedded-key')
            output = root / 'unsafe.zip'
            with self.assertRaisesRegex(ValueError, 'configured private value'):
                release.build_release(root, output, ['accidentally-embedded-key'])
            self.assertFalse(output.exists())

    def test_hidden_source_file_is_not_silently_published(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.make_source(root)
            (root / 'src' / '.env').write_text('private-value')
            with self.assertRaisesRegex(ValueError, 'hidden source file'):
                release.build_release(root, root / 'unsafe.zip')

    def test_symlink_cannot_pull_unrelated_data_into_the_archive(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'project'
            root.mkdir()
            self.make_source(root)
            private = Path(directory) / 'outside.txt'
            private.write_text('not part of project')
            try:
                (root / 'src' / 'link.txt').symlink_to(private)
            except OSError:
                self.skipTest('Symlink creation is unavailable on this host')
            with self.assertRaisesRegex(ValueError, 'Symlinks'):
                release.build_release(root, root / 'unsafe.zip')


if __name__ == '__main__':
    unittest.main()
