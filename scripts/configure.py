#!/usr/bin/env python3
"""Private local setup. Writes only this project's ignored, owner-readable .dev.vars."""
import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import secrets
import sys
import tempfile
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
FILE = ROOT / '.dev.vars'
FIELDS = [('PAYPAL_CLIENT_ID', 'PayPal SANDBOX Client ID'),
          ('PAYPAL_CLIENT_SECRET', 'PayPal SANDBOX Secret'),
          ('GROQ_API_KEY', 'Groq FREE plan API key (optional for now)'),
          ('AG_STUDIO_LICENSE', 'AG Studio Pro with AI trial licence, not AG Grid/Charts (optional for now)'),
          ('PAYPAL_WEBHOOK_ID', 'PayPal sandbox Webhook ID (optional until deployment)')]

class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def read_values():
    if not FILE.exists():
        return {}
    values = {}
    for line in FILE.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            try:
                values[key] = json.loads(value)
            except ValueError:
                values[key] = value
    return values

def merge_values(current, updates):
    values = {**current, **updates}
    client_id = values.get('PAYPAL_CLIENT_ID', '')
    if '@' in client_id:
        raise ValueError('Use the app Client ID from Apps & Credentials, not a sandbox account email.')
    if bool(client_id) != bool(values.get('PAYPAL_CLIENT_SECRET')):
        raise ValueError('Enter both the sandbox Client ID and Secret from the same app.')
    changed = client_id != current.get('PAYPAL_CLIENT_ID', '')
    if changed and not updates.get('PAYPAL_CLIENT_SECRET'):
        raise ValueError('A changed Client ID requires the new app Secret. Nothing was saved.')
    if changed and 'PAYPAL_WEBHOOK_ID' not in updates:
        values.pop('PAYPAL_WEBHOOK_ID', None)
    values.setdefault('GROQ_MODEL', 'qwen/qwen3.8-27b')
    values.setdefault('SESSION_SECRET', secrets.token_hex(32))
    return values

def write_values(values):
    content = '# Private local configuration. Never commit this file.\n' + ''.join(
        key + '=' + json.dumps(value) + '\n' for key, value in values.items())
    fd, temporary = tempfile.mkstemp(prefix='.dev.vars.', dir=FILE.parent)
    try:
        with os.fdopen(fd, 'w') as out:
            out.write(content)
        os.chmod(temporary, 0o600)
        os.replace(temporary, FILE)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)

def check(values):
    # Match the working direct HTTPS route on this machine; never disable TLS.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirects())
    if values.get('PAYPAL_CLIENT_ID') and values.get('PAYPAL_CLIENT_SECRET'):
        token = base64.b64encode((values['PAYPAL_CLIENT_ID'] + ':' + values['PAYPAL_CLIENT_SECRET']).encode()).decode()
        request = urllib.request.Request('https://api-m.sandbox.paypal.com/v1/oauth2/token', data=b'grant_type=client_credentials', headers={'Authorization': 'Basic ' + token, 'Content-Type': 'application/x-www-form-urlencoded'})
        try:
            with opener.open(request, timeout=25) as response:
                data = json.load(response)
                print('PayPal sandbox:', 'PASS' if data.get('access_token') else 'FAILED')
        except urllib.error.HTTPError as error:
            print('PayPal sandbox: HTTP', error.code)
        except (urllib.error.URLError, OSError, ValueError):
            print('PayPal sandbox: network or TLS check failed')
    else:
        print('PayPal sandbox: not configured')
    print('Groq key:', 'configured; live model check happens in the app' if values.get('GROQ_API_KEY') else 'not configured')
    print('AG Studio licence:', 'configured; validity checked by AG Studio' if values.get('AG_STUDIO_LICENSE') else 'not configured')
    print('No credentials or access tokens are displayed.')

def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--paypal-only', action='store_true', help='Update only the sandbox app Client ID and Secret.')
    mode.add_argument('--studio-only', action='store_true', help='Update only the AG Studio licence.')
    args = parser.parse_args()
    values = read_values()
    if not args.check:
        if not sys.stdin.isatty():
            sys.exit('Run this command directly in your Terminal.')
        print('SpendProof private setup. Input is hidden. Enter keeps an existing value.')
        if args.paypal_only:
            print('Two fields only: the new US SANDBOX app Client ID, then its Secret. Other settings are kept.')
        if args.studio_only:
            print('One field only: the AG Studio Pro with AI trial licence. AG Grid/Charts keys do not cover Studio. Other settings are kept.')
        fields = FIELDS[:2] if args.paypal_only else FIELDS[3:4] if args.studio_only else FIELDS
        updates = {}
        for key, label in fields:
            value = getpass.getpass(label + (' [already set]' if values.get(key) else '') + ': ').strip()
            if value:
                updates[key] = value
        try:
            values = merge_values(values, updates)
        except ValueError as error:
            sys.exit(str(error))
        write_values(values)
        print('Saved private project configuration. Restart the API server to load it.')
    if args.check:
        check(values)
    else:
        print('PayPal sandbox:', 'configured' if values.get('PAYPAL_CLIENT_ID') and values.get('PAYPAL_CLIENT_SECRET') else 'not configured')
        print('Groq key:', 'configured' if values.get('GROQ_API_KEY') else 'not configured')
        print('AG Studio licence:', 'configured' if values.get('AG_STUDIO_LICENSE') else 'not configured')
        print('Setup makes no network calls. Run --check separately when you want an authentication check.')

if __name__ == '__main__':
    try:
        main()
    except (KeyboardInterrupt, EOFError):
        print('\nSetup cancelled.')
