import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[1] / 'scripts'))
try:
    import host
finally:
    sys.path.pop(0)


class HostingTests(unittest.TestCase):
    def setUp(self):
        self.values = {name: 'private-test-' + name for name in host.REQUIRED}
        self.values['GROQ_API_KEY'] = 'private-$HOME-${EXAMPLE}-literal'
        self.config = {'account_id': 'a' * 32,
                       'd1_databases': [{'database_id': '12345678-1234-1234-1234-123456789abc'}],
                       'vars': {'ENVIRONMENT': 'sandbox'}}

    def test_secret_selection_excludes_other_local_credentials(self):
        result = host.selected_secrets({**self.values, 'CLOUDFLARE_API_TOKEN': 'never-upload-this',
                                        'UNRELATED_KEY': 'another-service'})
        self.assertEqual(set(result), set(host.REQUIRED))
        self.assertEqual(result['GROQ_API_KEY'], self.values['GROQ_API_KEY'])
        with self.assertRaises(ValueError):
            host.selected_secrets({'PAYPAL_CLIENT_ID': 'partial'})

    def test_placeholder_and_non_sandbox_targets_are_rejected(self):
        for changes in [{'account_id': '0' * 32},
                        {'d1_databases': [{'database_id': '00000000-0000-0000-0000-000000000001'}]},
                        {'vars': {'ENVIRONMENT': 'live'}}]:
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                host.validate_config({**self.config, **changes})
        host.validate_config(self.config)

    def test_default_check_does_not_execute_or_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / 'production.json'
            config.write_text(json.dumps(self.config))
            output = io.StringIO()
            with patch.object(host, 'CONFIG', config), patch.object(host, 'read_values', return_value=self.values), patch.object(sys, 'argv', ['host.py']), patch.object(host, 'run_private') as run, contextlib.redirect_stdout(output):
                host.main()
            run.assert_not_called()
            for value in self.values.values():
                self.assertNotIn(value, output.getvalue())

    def test_temporary_secret_json_is_private_literal_and_removed_on_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            config = root / 'production.json'
            config.write_text(json.dumps(self.config))
            paths = []

            def execute(command, env, values):
                if '--secrets-file' not in command:
                    return
                secret_path = Path(command[command.index('--secrets-file') + 1])
                paths.append(secret_path)
                self.assertEqual(secret_path.stat().st_mode & 0o777, 0o600)
                self.assertEqual(json.loads(secret_path.read_text()), self.values)
                for value in self.values.values():
                    self.assertNotIn(value, command)
                raise ValueError('Simulated failed upload')

            with patch.object(host, 'ROOT', root), patch.object(host, 'CONFIG', config), patch.object(host, 'read_values', return_value=self.values), patch.object(sys, 'argv', ['host.py', '--publish']), patch.object(host, 'run_private', side_effect=execute), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
                host.main()
            self.assertEqual(len(paths), 1)
            self.assertFalse(paths[0].exists())

    def test_command_output_redacts_selected_values(self):
        output = io.StringIO()
        response = SimpleNamespace(returncode=0, stdout='example: ' + self.values['GROQ_API_KEY'])
        with patch.object(host.subprocess, 'run', return_value=response), contextlib.redirect_stdout(output):
            host.run_private(['example'], {}, self.values)
        self.assertNotIn(self.values['GROQ_API_KEY'], output.getvalue())
        self.assertIn('[private value hidden]', output.getvalue())


if __name__ == '__main__':
    unittest.main()
