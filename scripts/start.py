#!/usr/bin/env python3
"""Start local development without opening a browser or contacting PayPal."""
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]

def main():
    env = os.environ.copy()
    npm = shutil.which('npm')
    if not npm:
        versions = sorted((Path.home() / '.nvm/versions/node').glob('v22*/bin/npm'))
        if versions:
            npm = str(versions[-1])
            env['PATH'] = str(versions[-1].parent) + os.pathsep + env.get('PATH', '')
    if not npm:
        sys.exit('Install Node.js 22.13 or newer, then run this command again.')
    if not (ROOT / 'node_modules').is_dir():
        sys.exit('From the project folder, run npm ci once to install dependencies.')
    env['WRANGLER_SEND_METRICS'] = 'false'
    env['WRANGLER_LOG_PATH'] = str(Path(tempfile.gettempdir()) / 'spendproof-wrangler-logs')
    if not (ROOT / 'dist/index.html').exists():
        subprocess.run([npm, 'run', 'build'], cwd=ROOT, env=env, check=True)
    subprocess.run([npm, 'run', 'db:local'], cwd=ROOT, env=env, check=True)
    children = []
    try:
        for command in ['dev:api', 'dev']:
            children.append(subprocess.Popen([npm, 'run', command], cwd=ROOT, env=env, start_new_session=True))
        print('\nSpendProof: http://127.0.0.1:5173/\nNo browser opens automatically. Press Ctrl+C to stop.\n', flush=True)
        while all(child.poll() is None for child in children):
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        for child in children:
            if child.poll() is None:
                os.killpg(child.pid, signal.SIGTERM)
        for child in children:
            child.wait()

if __name__ == '__main__':
    try:
        main()
    except subprocess.CalledProcessError:
        sys.exit('Setup did not finish. Resolve the error above, then retry.')
