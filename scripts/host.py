#!/usr/bin/env python3
"""Check or deploy the sandbox demo. Publishing requires an explicit flag."""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

from configure import read_values

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'wrangler.production.json'
REQUIRED = ('PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'GROQ_API_KEY',
            'AG_STUDIO_LICENSE', 'SESSION_SECRET')
SECRET_NAMES = (*REQUIRED, 'PAYPAL_WEBHOOK_ID')


def selected_secrets(values):
    missing = [name for name in REQUIRED if not values.get(name)]
    if missing:
        raise ValueError('Missing private settings: ' + ', '.join(missing))
    return {name: values[name] for name in SECRET_NAMES if values.get(name)}


def validate_config(config):
    account = config.get('account_id', '')
    database = config.get('d1_databases', [{}])[0].get('database_id', '')
    if not re.fullmatch(r'[a-fA-F0-9]{32}', account) or set(account) == {'0'}:
        raise ValueError('Set the real account_id in wrangler.production.json first.')
    if not re.fullmatch(r'[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}', database) or database == '00000000-0000-0000-0000-000000000001':
        raise ValueError('Create the hosted D1 database and set its database_id first.')
    if config.get('vars', {}).get('ENVIRONMENT') != 'sandbox':
        raise ValueError('This hosting script supports the sandbox demo only.')


def deployment_env():
    env = os.environ.copy()
    if not shutil.which('node'):
        nodes = sorted((Path.home() / '.nvm/versions/node').glob('v22*/bin/node'))
        if nodes:
            env['PATH'] = str(nodes[-1].parent) + os.pathsep + env.get('PATH', '')
    env['WRANGLER_SEND_METRICS'] = 'false'
    env['WRANGLER_LOG_PATH'] = str(Path(tempfile.gettempdir()) / 'spendproof-wrangler-logs')
    return env


def run_private(command, env, values):
    result = subprocess.run(command, cwd=ROOT, env=env, text=True,
                            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    output = result.stdout
    for value in sorted(values.values(), key=len, reverse=True):
        output = output.replace(value, '[private value hidden]')
    print(output, end='')
    if result.returncode:
        raise ValueError('The deployment command failed. No credential values are displayed.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true', help='Bundle without uploading.')
    mode.add_argument('--publish', action='store_true', help='Upload the app and selected secrets to Cloudflare.')
    mode.add_argument('--upload-secrets', action='store_true', help='Update selected secrets on the existing hosted Worker.')
    mode.add_argument('--upload-webhook', action='store_true', help='Upload only the sandbox webhook identifier to the existing Worker.')
    args = parser.parse_args()
    validate_config(json.loads(CONFIG.read_text()))
    values = selected_secrets(read_values())
    if args.upload_webhook:
        if not values.get('PAYPAL_WEBHOOK_ID'):
            raise ValueError('Register the sandbox listener and save its webhook ID first.')
        values = {'PAYPAL_WEBHOOK_ID': values['PAYPAL_WEBHOOK_ID']}
    print('Sandbox deployment configuration is ready.')
    print('Selected secret names:', ', '.join(values))
    if not (args.dry_run or args.publish or args.upload_secrets or args.upload_webhook):
        print('Check only. Nothing was uploaded. Use --dry-run to bundle or --publish to deploy.')
        return
    env = deployment_env()
    wrangler = str(ROOT / 'node_modules/.bin/wrangler')
    config_arg = ['--config', str(CONFIG)]
    if args.dry_run or args.publish:
        run_private(['npm', 'run', 'build'], env, values)
    if args.dry_run:
        run_private([wrangler, 'deploy', *config_arg, '--dry-run'], env, values)
        return
    # JSON avoids dotenv variable expansion. This file is 0600, ignored, and
    # removed even when Wrangler rejects the deployment. Never pass keys in argv.
    temporary = None
    try:
        fd, temporary = tempfile.mkstemp(prefix='.dev.vars.hosting.', suffix='.json', dir=ROOT)
        with os.fdopen(fd, 'w') as stream:
            json.dump(values, stream)
        os.chmod(temporary, 0o600)
        command = ([wrangler, 'secret', 'bulk', temporary, *config_arg] if args.upload_secrets or args.upload_webhook
                   else [wrangler, 'deploy', *config_arg, '--secrets-file', temporary, '--autoconfig=false'])
        run_private(command, env, values)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(str(error))
