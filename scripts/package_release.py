#!/usr/bin/env python3
"""Create a source-only handoff ZIP. Credentials, databases and dependencies are excluded."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import zipfile

from configure import read_values

ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = (
    '.gitignore', '.npmrc', '.env.example', 'README.md', 'LICENSE',
    'START-HERE-WINDOWS.md', 'START-WINDOWS.cmd', 'package.json',
    'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'index.html',
    'wrangler.jsonc', 'wrangler.production.json',
)
SOURCE_FOLDERS = ('src', 'scripts', 'tests', 'migrations', 'docs')
PRIVATE_NAMES = ('PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'GROQ_API_KEY',
                 'AG_STUDIO_LICENSE', 'SESSION_SECRET', 'PAYPAL_WEBHOOK_ID')


def source_payload(root):
    payload = {}
    paths = [root / name for name in ROOT_FILES]
    for folder in SOURCE_FOLDERS:
        base = root / folder
        if not base.is_dir() or base.is_symlink():
            raise ValueError('Missing or unsafe source directory: ' + folder)
        paths.extend(base.rglob('*'))
    for path in sorted(paths):
        relative = path.relative_to(root)
        if '__pycache__' in relative.parts or path.suffix in ('.pyc', '.pyo'):
            continue
        if path.is_symlink():
            raise ValueError('Symlinks are not permitted in the release: ' + relative.as_posix())
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError('Missing release file: ' + relative.as_posix())
        if any(part.startswith('.') for part in relative.parts) and relative.as_posix() not in ROOT_FILES:
            raise ValueError('Unexpected hidden source file: ' + relative.as_posix())
        payload[relative.as_posix()] = path.read_bytes()
    return payload


def build_release(root, output, private_values=()):
    payload = source_payload(root)
    private = [value.encode() for value in private_values if isinstance(value, str) and value]
    for name, content in payload.items():
        if any(value in content for value in private):
            raise ValueError('A configured private value was found in ' + name + '. No ZIP was written.')
    manifest = {'project': 'SpendProof', 'format': 'source-only Windows 11 handoff',
                'files': {name: {'bytes': len(content), 'sha256': hashlib.sha256(content).hexdigest()}
                          for name, content in payload.items()}}
    payload['RELEASE-MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    output.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.spendproof-release-', suffix='.zip', dir=output.parent)
    os.close(fd)
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, content in payload.items():
                archive.writestr('spendproof/' + name, content)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip() is not None:
                raise ValueError('ZIP integrity check failed.')
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    checksum = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix(output.suffix + '.sha256').write_text(checksum + '  ' + output.name + '\n', encoding='utf-8')
    return len(payload), checksum


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT.parent / 'releases' / 'SpendProof-Windows11.zip')
    args = parser.parse_args()
    values = read_values()
    count, checksum = build_release(ROOT, args.output.resolve(), [values.get(name, '') for name in PRIVATE_NAMES])
    print('Created:', args.output.resolve())
    print('Source files:', count)
    print('SHA-256:', checksum)
    print('Excluded: credentials, authentication tokens, local databases, node_modules, build output, logs, and test screenshots.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(str(error))
