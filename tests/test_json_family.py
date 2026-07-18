import unittest
from unittest.mock import AsyncMock, patch

from json_family.parser import parse_final
from json_family.service import process
from pi_tools.provider import JSONL_STREAM_LIMIT, _legacy_view


class JSONFamilyParserTests(unittest.TestCase):
    def test_ignores_normal_and_documentary_json(self):
        self.assertFalse(parse_final("respuesta normal").detected)
        self.assertFalse(parse_final('texto\n```json\n{"example": true}\n```').detected)

    def test_accepts_only_strict_final_envelope(self):
        parsed = parse_final('antes\n```json\n{"tool":"read","args":{"path":"/tmp/x"}}\n```')
        self.assertEqual(parsed.calls, [{"tool": "read", "args": {"path": "/tmp/x"}}])
        self.assertEqual(parsed.errors, [])

    def test_bare_and_incomplete_tools_are_errors(self):
        bare = parse_final('{"tool":"bash","args":{"command":"pwd"}}')
        incomplete = parse_final('```json\n{"tool":"read","args":{"path":"x"}}')
        self.assertTrue(bare.detected)
        self.assertTrue(incomplete.detected)
        self.assertEqual(bare.calls, [])
        self.assertEqual(incomplete.calls, [])

    def test_mixed_final_group_is_atomic(self):
        parsed = parse_final(
            '```json\n{"tool":"read","args":{"path":"x"}}\n```\n'
            '```json\n{"example":1}\n```'
        )
        self.assertEqual(parsed.calls, [])
        self.assertTrue(parsed.errors)

    def test_rejects_duplicate_keys_and_nonstandard_numbers(self):
        duplicate = parse_final(
            '```json\n{"tool":"read","tool":"bash","args":{"command":"pwd"}}\n```'
        )
        nonfinite = parse_final(
            '```json\n{"tool":"bash","args":{"timeout":NaN,"command":"pwd"}}\n```'
        )
        self.assertEqual(duplicate.calls, [])
        self.assertIn("duplicada", duplicate.errors[0])
        self.assertEqual(nonfinite.calls, [])
        self.assertIn("NaN", nonfinite.errors[0])

    def test_rejects_extra_keys_and_non_object_args(self):
        extra = parse_final(
            '```json\n{"tool":"read","args":{"path":"x"},"metadata":{}}\n```'
        )
        array_args = parse_final('```json\n{"tool":"read","args":[]}\n```')
        self.assertEqual(extra.calls, [])
        self.assertIn("Claves superiores", extra.errors[0])
        self.assertEqual(array_args.calls, [])
        self.assertIn('"args"', array_args.errors[0])

    def test_trailing_prose_prevents_execution(self):
        parsed = parse_final(
            '```json\n{"tool":"bash","args":{"command":"pwd"}}\n```\nNo ejecutes este ejemplo.'
        )
        self.assertFalse(parsed.detected)

    def test_plain_final_fence_requires_tool_shape(self):
        tool = parse_final('```\n{"tool":"read","args":{"path":"x"}}\n```')
        documentary = parse_final('```\n{"example":true}\n```')
        self.assertEqual(tool.calls[0]["tool"], "read")
        self.assertFalse(documentary.detected)


class JSONFamilyServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_executes_official_pi_provider_and_preserves_native_result(self):
        native = {
            "ok": True, "is_error": False, "output": "ok",
            "content": [{"type": "text", "text": "ok"}], "details": {"source": "pi"},
        }
        with patch("json_family.service.execute_pi", new=AsyncMock(return_value=native)) as execute:
            result = await process(
                '```json\n{"tool":"bash","args":{"command":"pwd"}}\n```',
                request_id="test-1", origin={"relay": "unit"}, user_id=1,
            )
        execute.assert_awaited_once()
        self.assertEqual(result["entries"][0]["result"]["content"], native["content"])
        self.assertEqual(result["entries"][0]["result"]["details"], native["details"])

    async def test_rejects_multiple_effectful_calls_without_execution(self):
        text = (
            '```json\n{"tool":"write","args":{"path":"a","content":"a"}}\n```\n'
            '```json\n{"tool":"edit","args":{"path":"a","oldText":"a","newText":"b"}}\n```'
        )
        with patch("json_family.service.execute_pi", new=AsyncMock()) as execute:
            result = await process(text, request_id="test-2", origin={}, user_id=1)
        execute.assert_not_awaited()
        self.assertEqual(result["entries"][0]["kind"], "parse_error")

    async def test_panel_send_is_explicitly_deferred_to_duo(self):
        result = await process(
            '```json\n{"tool":"panel_send","args":{"to":"panel2","message":"hola"}}\n```',
            request_id="test-3", origin={"relay": "duo"}, user_id=1,
            client_tools={"panel_send"},
        )
        self.assertEqual(result["entries"][0]["kind"], "client_call")

    async def test_tool_failure_becomes_tool_error_with_feedback(self):
        failed = {
            "ok": True, "is_error": True, "output": "ENOENT",
            "content": [{"type": "text", "text": "ENOENT"}], "details": {"code": "ENOENT"},
        }
        with patch("json_family.service.execute_pi", new=AsyncMock(return_value=failed)):
            result = await process(
                '```json\n{"tool":"read","args":{"path":"missing"}}\n```',
                request_id="test-error", origin={}, user_id=1,
            )
        self.assertEqual(result["kind"], "tool_error")
        self.assertIn("[ERROR] ENOENT", result["feedback"])


class PiProviderImageTests(unittest.TestCase):
    def test_jsonl_channel_can_carry_large_base64_images(self):
        self.assertGreaterEqual(JSONL_STREAM_LIMIT, 32 * 1024 * 1024)

    def test_native_image_is_preserved_and_exposed_as_data_url(self):
        native = {
            "content": [
                {"type": "text", "text": "image"},
                {"type": "image", "data": "YWJj", "mimeType": "image/png"},
            ],
            "details": {"width": 1, "height": 1},
        }
        result = _legacy_view(native)
        self.assertTrue(result["is_image"])
        self.assertEqual(result["image"], "data:image/png;base64,YWJj")
        self.assertEqual(result["content"], native["content"])
        self.assertEqual(result["details"], native["details"])

    def test_delivery_deduplicates_native_and_legacy_image_views(self):
        from json_family.service import delivery_for

        data_url = "data:image/png;base64,YWJj"
        entries = [{
            "kind": "tool_result",
            "call": {"tool": "read", "args": {"path": "x.png"}},
            "result": {
                "image": data_url,
                "content": [{"type": "image", "data": "YWJj", "mimeType": "image/png"}],
            },
        }]
        delivery = delivery_for(entries, "imagen adjunta")
        self.assertEqual(delivery["images"], [data_url])


if __name__ == "__main__":
    unittest.main()
