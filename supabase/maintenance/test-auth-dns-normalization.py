#!/usr/bin/env python3
"""Check Docker DNS comparison compatibility without executing NUC helpers."""

import ast
import copy
from pathlib import Path
import unittest


HERE = Path(__file__).resolve().parent
HELPERS = ("harden-auth-on-nuc.sh", "inspect-auth-hardening-on-nuc.sh")
DNS_FIELDS = ("Dns", "DnsOptions", "DnsSearch")


def load_normalizer(filename):
    """Compile only the pure comparison function, never the helper driver."""
    script = (HERE / filename).read_text()
    python = script.split("<<'PY'\n", 1)[1].rsplit("\nPY", 1)[0]
    tree = ast.parse(python, filename=filename)
    matches = [
        node for node in tree.body
        if isinstance(node, ast.FunctionDef) and node.name == "stable_host_config"
    ]
    if len(matches) != 1:
        raise AssertionError(f"{filename}: expected one stable_host_config function")
    node = matches[0]
    if node.decorator_list or node.args.defaults or any(node.args.kw_defaults):
        raise AssertionError(f"{filename}: comparison function must have no executable defaults or decorators")
    namespace = {"copy": copy}
    module = ast.Module(body=[node], type_ignores=[])
    exec(compile(module, filename, "exec"), namespace)
    return namespace["stable_host_config"]


class AuthDnsNormalizationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.normalizers = {filename: load_normalizer(filename) for filename in HELPERS}

    def test_null_and_empty_lists_are_equivalent_for_each_dns_field(self):
        for filename, normalize in self.normalizers.items():
            for field in DNS_FIELDS:
                with self.subTest(helper=filename, field=field):
                    left = {"HostConfig": {field: None}}
                    right = {"HostConfig": {field: []}}
                    self.assertEqual(normalize(left), normalize(right))
                    self.assertEqual(normalize(right), normalize(left))

    def test_missing_dns_fields_remain_distinct(self):
        for filename, normalize in self.normalizers.items():
            for field in DNS_FIELDS:
                for value in (None, []):
                    with self.subTest(helper=filename, field=field, value=value):
                        self.assertNotEqual(
                            normalize({"HostConfig": {}}),
                            normalize({"HostConfig": {field: value}}),
                        )
                        self.assertNotIn(field, normalize({"HostConfig": {}}))

    def test_nonempty_dns_values_are_preserved_and_do_not_equal_empty(self):
        values = (["192.0.2.53"], ["ndots:0"], ["example.test"], [""], [None])
        for filename, normalize in self.normalizers.items():
            for field in DNS_FIELDS:
                for value in values:
                    with self.subTest(helper=filename, field=field, value=value):
                        actual = normalize({"HostConfig": {field: value}})
                        self.assertEqual(actual[field], value)
                        for empty in (None, []):
                            self.assertNotEqual(actual, normalize({"HostConfig": {field: empty}}))

    def test_dns_value_changes_and_order_remain_different(self):
        pairs = (
            (["192.0.2.53"], ["192.0.2.54"]),
            (["timeout:1"], ["timeout:2"]),
            (["a.example.test"], ["b.example.test"]),
            (["first", "second"], ["second", "first"]),
            (["one"], ["one", "one"]),
        )
        for filename, normalize in self.normalizers.items():
            for field in DNS_FIELDS:
                for left, right in pairs:
                    with self.subTest(helper=filename, field=field, left=left, right=right):
                        self.assertNotEqual(
                            normalize({"HostConfig": {field: left}}),
                            normalize({"HostConfig": {field: right}}),
                        )

    def test_other_json_types_are_not_coerced_into_empty_lists(self):
        for filename, normalize in self.normalizers.items():
            for field in DNS_FIELDS:
                for value in ("", "[]", {}, False, 0):
                    with self.subTest(helper=filename, field=field, value=value):
                        actual = normalize({"HostConfig": {field: value}})
                        self.assertIs(type(actual[field]), type(value))
                        self.assertEqual(actual[field], value)
                        self.assertNotEqual(actual, normalize({"HostConfig": {field: []}}))

    def test_other_host_configuration_fields_remain_exact(self):
        pairs = (
            ("Binds", None, []),
            ("ExtraHosts", None, []),
            ("Privileged", False, True),
            ("ReadonlyRootfs", False, True),
            ("NetworkMode", "supabase_default", "bridge"),
            ("LogConfig", {"Type": "json-file"}, {"Type": "local"}),
        )
        for filename, normalize in self.normalizers.items():
            for field, left, right in pairs:
                with self.subTest(helper=filename, field=field):
                    self.assertNotEqual(
                        normalize({"HostConfig": {field: left}}),
                        normalize({"HostConfig": {field: right}}),
                    )
                    self.assertEqual(normalize({"HostConfig": {field: left}})[field], left)

    def test_actual_recreation_fixture_allows_only_empty_dns_representation(self):
        before = {
            "Id": "before",
            "HostConfig": {
                "Dns": [], "DnsOptions": [], "DnsSearch": [],
                "NetworkMode": "supabase_default", "Privileged": False,
                "Binds": None, "ReadonlyRootfs": False,
                "LogConfig": {"Type": "json-file", "Config": {"max-size": "10m"}},
            },
        }
        after = copy.deepcopy(before)
        after["Id"] = "after"
        after["HostConfig"].update({field: None for field in DNS_FIELDS})
        for filename, normalize in self.normalizers.items():
            with self.subTest(helper=filename):
                self.assertEqual(normalize(before), normalize(after))
                changed = copy.deepcopy(after)
                changed["HostConfig"]["Dns"] = ["192.0.2.53"]
                self.assertNotEqual(normalize(before), normalize(changed))

    def test_source_and_nested_objects_are_not_mutated(self):
        original = {
            "HostConfig": {
                "Dns": None, "DnsOptions": [], "DnsSearch": ["example.test"],
                "LogConfig": {"Type": "json-file", "Config": {"max-size": "10m"}},
            },
            "Config": {"Env": ["EXAMPLE=value"]},
        }
        for filename, normalize in self.normalizers.items():
            with self.subTest(helper=filename):
                source = copy.deepcopy(original)
                result = normalize(source)
                self.assertEqual(source, original)
                result["DnsSearch"].append("other.example.test")
                result["LogConfig"]["Config"]["max-size"] = "20m"
                self.assertEqual(source, original)


if __name__ == "__main__":
    unittest.main(verbosity=2)
