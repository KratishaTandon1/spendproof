#!/usr/bin/env python3
"""Scrape the local entry page and test the real API with isolated cookie jars.

No browser cookies, credentials, AI calls or PayPal operations are used.
"""
import argparse
import http.cookiejar
import json
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:5173')
    args = parser.parse_args()
    target = urllib.parse.urlsplit(args.base_url)
    if target.hostname not in ['localhost', '127.0.0.1', '::1'] or target.scheme != 'http':
        parser.error('This smoke test only targets a local development server.')
    base = args.base_url.rstrip('/')
    passed = []

    def session():
        return urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def call(client, path, body=None):
        request = urllib.request.Request(base + '/api' + path,
            data=None if body is None else json.dumps(body).encode(),
            headers={} if body is None else {'Content-Type': 'application/json'})
        try:
            with client.open(request, timeout=15) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def check(label, condition):
        if not condition:
            raise AssertionError(label)
        passed.append(label)
        print('PASS:', label)

    a, b = session(), session()
    with a.open(base, timeout=15) as page:
        source = page.read().decode()
        check('Entry page exposes the application title and mount point',
              'SpendProof' in source and 'id="root"' in source)
    _, first = call(a, '/state')
    _, second = call(b, '/state')
    check('Two fresh sessions have different workspaces', first['workspace']['id'] != second['workspace']['id'])
    code, request = call(a, '/requests', {'title': 'Isolated HTTP smoke test',
        'intent': 'Three licences, USD 60 maximum, one-time only.', 'quantity': 3, 'cap': 6000})
    check('Valid request is persisted', code == 201)
    key = request['id']
    code, result = call(a, '/requests/' + key + '/plan', {'mode': 'manual', 'offerId': 'studio-plus'})
    check('Recurring offer is blocked', code == 200 and result['evaluation']['decision'] == 'BLOCK')
    check('Blocked proposal cannot be approved', call(a, '/plans/' + key + '/approve', {})[0] == 409)
    check('Another session cannot export the purchase', call(b, '/audit/' + key + '/export')[0] == 404)
    code, result = call(a, '/requests/' + key + '/plan', {'mode': 'manual', 'offerId': 'studio-kit'})
    check('Permitted offer has an exact $54 total', code == 200 and result['evaluation']['decision'] == 'ALLOW' and result['evaluation']['total'] == 5400)
    code, proof = call(a, '/audit/' + key + '/export')
    check('Proof contains both versions and removes internal keys', code == 200 and len(proof['versions']) == 2 and 'operation_key' not in proof['purchase'] and 'workspace_id' not in proof['purchase'])
    check('Invalid quantity receives a client error', call(a, '/requests', {'title':'Invalid','intent':'Invalid test request','quantity':0,'cap':6000})[0] == 400)
    check('Unknown catalogue ID receives a client error', call(a, '/requests/' + key + '/plan', {'mode':'manual','offerId':'unknown-item'})[0] == 400)
    check('Missing report receives a client error', call(a, '/report', {})[0] == 400)
    report = {'selectedPageId':'proof', 'pages':[{'id':'proof','widgets':{},'widgetLayout':{}}]}
    check('Valid report can be saved', call(a, '/report', {'report':report})[0] == 200)
    _, current = call(a, '/state')
    _, other = call(b, '/state')
    check('Report persists only in its own workspace', current['report'] == report and other['report'] is None)
    check('Planning never reserves or spends funds', current['workspace']['available'] == 15000 and current['workspace']['reserved'] == 0 and current['workspace']['spent'] == 0)
    print('\nPassed', len(passed), 'live HTTP checks. No AI or PayPal calls were made.')


if __name__ == '__main__':
    main()
