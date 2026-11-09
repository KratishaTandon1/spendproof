#!/usr/bin/env python3
"""Register or reuse the hosted demo listener on the owner's sandbox REST app."""
import argparse
import base64
import json
import ssl
import urllib.error
import urllib.parse
import urllib.request

from configure import NoRedirects, read_values, write_values

BASE = 'https://api-m.sandbox.paypal.com'
EVENTS = ['PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.PENDING', 'PAYMENT.CAPTURE.REFUNDED']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True)
    parser.add_argument('--register', action='store_true', help='Explicitly register/reuse the sandbox listener and save its ID.')
    args = parser.parse_args()
    url = urllib.parse.urlparse(args.url)
    if url.scheme != 'https' or not url.hostname or not url.hostname.endswith('.workers.dev') or url.path != '/api/webhooks/paypal' or url.username or url.password or url.query or url.fragment:
        raise ValueError('Use the deployed workers.dev HTTPS URL ending /api/webhooks/paypal.')
    if not args.register:
        print('Check only: URL is suitable. Use --register to configure the sandbox REST app.')
        return
    values = read_values()
    if not values.get('PAYPAL_CLIENT_ID') or not values.get('PAYPAL_CLIENT_SECRET'):
        raise ValueError('Configure the sandbox app privately first.')
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirects(),
                                         urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    credential = base64.b64encode((values['PAYPAL_CLIENT_ID'] + ':' + values['PAYPAL_CLIENT_SECRET']).encode()).decode()
    token_request = urllib.request.Request(BASE + '/v1/oauth2/token', data=b'grant_type=client_credentials',
        headers={'Authorization': 'Basic ' + credential, 'Content-Type': 'application/x-www-form-urlencoded'})
    with opener.open(token_request, timeout=25) as response:
        token = json.load(response)['access_token']

    def request(path, body=None):
        req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body else None,
            headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with opener.open(req, timeout=25) as response:
            return json.load(response)

    existing = request('/v1/notifications/webhooks').get('webhooks', [])
    webhook = next((item for item in existing if item.get('url') == args.url), None)
    if webhook:
        selected = {event['name'] for event in webhook.get('event_types', [])}
        if not set(EVENTS).issubset(selected) and '*' not in selected:
            raise ValueError('This URL already has different subscriptions. Review it before updating.')
    else:
        webhook = request('/v1/notifications/webhooks',
            {'url': args.url, 'event_types': [{'name': name} for name in EVENTS]})
    if not webhook.get('id'):
        raise ValueError('PayPal did not return a webhook ID.')
    values['PAYPAL_WEBHOOK_ID'] = webhook['id']
    write_values(values)
    print('Sandbox listener configured for:', args.url)
    print('Subscribed events:', ', '.join(EVENTS))
    print('Webhook ID saved privately. Actual signed delivery still needs verification.')


if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        raise SystemExit('PayPal sandbox webhook setup returned HTTP ' + str(error.code) + '. No credentials were displayed.')
    except (ValueError, OSError, KeyError):
        raise SystemExit('Webhook setup did not complete. Check the URL, sandbox app, and network. No credentials were displayed.')
