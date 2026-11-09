import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('private_setup', Path(__file__).parents[1] / 'scripts/configure.py')
setup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(setup)


class PrivateSetupTests(unittest.TestCase):
    def setUp(self):
        self.current = {'PAYPAL_CLIENT_ID': 'old-test-client', 'PAYPAL_CLIENT_SECRET': 'old-test-secret',
                        'GROQ_API_KEY': 'test-groq-kept', 'SESSION_SECRET': 'test-session-kept',
                        'AG_STUDIO_LICENSE': 'test-licence-kept', 'PAYPAL_WEBHOOK_ID': 'old-app-webhook'}

    def test_switching_apps_preserves_other_services_and_clears_old_webhook(self):
        result = setup.merge_values(self.current, {'PAYPAL_CLIENT_ID': 'new-test-client', 'PAYPAL_CLIENT_SECRET': 'new-test-secret'})
        for key in ['GROQ_API_KEY', 'SESSION_SECRET', 'AG_STUDIO_LICENSE']:
            self.assertEqual(result[key], self.current[key])
        self.assertNotIn('PAYPAL_WEBHOOK_ID', result)
        self.assertEqual(self.current['PAYPAL_CLIENT_ID'], 'old-test-client')

    def test_partial_app_switch_and_account_email_are_rejected(self):
        for update in [{'PAYPAL_CLIENT_ID': 'new-client'}, {'PAYPAL_CLIENT_ID': 'buyer@example.com', 'PAYPAL_CLIENT_SECRET': 'test-secret'}]:
            with self.assertRaises(ValueError):
                setup.merge_values(self.current, update)

    def test_same_app_secret_rotation_preserves_its_webhook(self):
        result = setup.merge_values(self.current, {'PAYPAL_CLIENT_SECRET': 'rotated-test-secret'})
        self.assertEqual(result['PAYPAL_WEBHOOK_ID'], 'old-app-webhook')

    def test_configuration_replacement_is_owner_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / '.dev.vars'
            file.write_text('old configuration')
            with patch.object(setup, 'FILE', file):
                setup.write_values(self.current)
                self.assertEqual(setup.read_values(), self.current)
            self.assertEqual(file.stat().st_mode & 0o777, 0o600)

    def test_failed_replacement_leaves_previous_configuration_intact(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / '.dev.vars'
            file.write_text('previous configuration')
            with patch.object(setup, 'FILE', file), patch.object(setup.os, 'replace', side_effect=OSError('simulated failure')):
                with self.assertRaises(OSError):
                    setup.write_values(self.current)
            self.assertEqual(file.read_text(), 'previous configuration')
            self.assertEqual(list(Path(directory).iterdir()), [file])

    def test_paypal_only_prompts_twice_and_never_prints_credentials(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / '.dev.vars'
            with patch.object(setup, 'FILE', file):
                setup.write_values(self.current)
                output = io.StringIO()
                with patch.object(setup.sys, 'argv', ['configure.py', '--paypal-only']), patch.object(setup.sys.stdin, 'isatty', return_value=True), patch.object(setup.getpass, 'getpass', side_effect=['new-test-client', 'new-test-secret']) as prompt, patch.object(setup, 'check') as check, contextlib.redirect_stdout(output):
                    setup.main()
                self.assertEqual(prompt.call_count, 2)
                check.assert_not_called()
                for value in ['new-test-client', 'new-test-secret', 'test-groq-kept', 'test-session-kept']:
                    self.assertNotIn(value, output.getvalue())
                self.assertEqual(setup.read_values()['GROQ_API_KEY'], self.current['GROQ_API_KEY'])

    def test_studio_only_preserves_payment_and_model_configuration(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / '.dev.vars'
            with patch.object(setup, 'FILE', file):
                setup.write_values(self.current)
                output = io.StringIO()
                with patch.object(setup.sys, 'argv', ['configure.py', '--studio-only']), patch.object(setup.sys.stdin, 'isatty', return_value=True), patch.object(setup.getpass, 'getpass', return_value='new-test-studio-licence') as prompt, patch.object(setup, 'check') as check, contextlib.redirect_stdout(output):
                    setup.main()
                self.assertEqual(prompt.call_count, 1)
                check.assert_not_called()
                result = setup.read_values()
                self.assertEqual(result['AG_STUDIO_LICENSE'], 'new-test-studio-licence')
                for key, value in self.current.items():
                    if key != 'AG_STUDIO_LICENSE':
                        self.assertEqual(result[key], value)
                    self.assertNotIn(value, output.getvalue())
                self.assertNotIn('new-test-studio-licence', output.getvalue())


if __name__ == '__main__':
    unittest.main()
