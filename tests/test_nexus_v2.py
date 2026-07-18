import unittest
from unittest.mock import AsyncMock, patch

from nexus_v2.parser import parse_final
from nexus_v2.service import NEXUS_V2_CONTINUATION, error_feedback, process


class NexusV2ParserTests(unittest.TestCase):
    def test_simple_call_compiles_to_json_family(self):
        parsed = parse_final('⬡ read path="/tmp/x" ⬡')
        self.assertEqual(parsed.calls, [{"tool": "read", "args": {"path": "/tmp/x"}}])
        self.assertIn('```json', parsed.canonical_text)

    def test_multiline_payload_is_lossless(self):
        payload = '# título\n"comilla sin cerrar\nC:\\Users\\deml\\Aurora\n```json\n{"x":"roto}\n```'
        parsed = parse_final(
            '⬡ write path="/tmp/x.md" ⬡\n◆◆◆ content\n' + payload + '\n◆◆◆'
        )
        self.assertEqual(parsed.calls[0]["args"]["content"], payload)

    def test_header_preserves_windows_backslashes(self):
        parsed = parse_final('⬡ read path="C:\\Users\\deml\\Aurora\\file.txt" ⬡')
        self.assertEqual(parsed.calls[0]["args"]["path"], 'C:\\Users\\deml\\Aurora\\file.txt')

    def test_nested_array_paths_build_real_edit_schema(self):
        parsed = parse_final(
            '⬡ edit path="/tmp/x" ⬡\n'
            '◆◆◆ edits[0].oldText\na\nb\n◆◆◆\n'
            '◆◆◆ edits[0].newText\nc\nd\n◆◆◆'
        )
        self.assertEqual(parsed.calls[0]["args"]["edits"], [{"oldText": "a\nb", "newText": "c\nd"}])

    def test_scalar_types_are_deterministic(self):
        parsed = parse_final('⬡ bash timeout=30 enabled=true ratio=1.5 empty=null command="true" ⬡')
        self.assertEqual(parsed.calls[0]["args"], {
            "timeout": 30, "enabled": True, "ratio": 1.5, "empty": None, "command": "true",
        })

    def test_exact_fence_and_terminal_rules_fail_closed(self):
        wrong = parse_final('⬡ write path="x" ⬡\n◆◆◆◆ content\na\n◆◆◆')
        trailing = parse_final('⬡ read path="x" ⬡\ntexto posterior')
        duplicate = parse_final('⬡ write path="x" ⬡\n◆◆◆ content\na\n◆◆◆\n◆◆◆ content\nb\n◆◆◆')
        self.assertTrue(wrong.errors)
        self.assertTrue(trailing.errors)
        self.assertTrue(duplicate.errors)
        self.assertFalse(wrong.calls or trailing.calls or duplicate.calls)

    def test_documentary_markdown_is_ignored(self):
        parsed = parse_final('```text\n⬡ read path="/tmp/no" ⬡\n```')
        self.assertFalse(parsed.detected)

    def test_only_one_terminal_nexus_frame_is_allowed(self):
        multiple = parse_final(
            '⬡ read path="/tmp/a" ⬡\n'
            '⬡ read path="/tmp/b" ⬡'
        )
        malformed_then_valid = parse_final(
            '⬡ write path="sin-cierre ⬡\n'
            '⬡ read path="/tmp/b" ⬡'
        )
        prose_then_valid = parse_final(
            'Texto normal\n'
            '⬡ read path="/tmp/b" ⬡'
        )

        self.assertTrue(multiple.detected)
        self.assertTrue(multiple.errors)
        self.assertFalse(multiple.calls)
        self.assertTrue(malformed_then_valid.detected)
        self.assertTrue(malformed_then_valid.errors)
        self.assertFalse(malformed_then_valid.calls)
        self.assertEqual(
            prose_then_valid.calls,
            [{"tool": "read", "args": {"path": "/tmp/b"}}],
        )

    def test_hostile_paths_fail_closed_without_large_allocations(self):
        huge_index = parse_final(
            '⬡ edit path="/tmp/x" ⬡\n'
            '◆◆◆ edits[999999999].oldText\na\n◆◆◆'
        )
        deep_path = ".".join(["root"] + [f"level{i}" for i in range(40)])
        excessive_depth = parse_final(
            f'⬡ write path="/tmp/x" ⬡\n◆◆◆ {deep_path}\na\n◆◆◆'
        )

        self.assertTrue(huge_index.detected)
        self.assertTrue(huge_index.errors)
        self.assertIn("Índice de array fuera de límite", huge_index.errors[0])
        self.assertFalse(huge_index.calls)
        self.assertTrue(excessive_depth.errors)
        self.assertIn("demasiado profunda", excessive_depth.errors[0])
        self.assertFalse(excessive_depth.calls)

    def test_malformed_header_with_blocks_is_detected(self):
        parsed = parse_final(
            '⬡ write path="/tmp/unclosed path.md ⬡\n'
            '◆◆◆ content\ntexto\n◆◆◆'
        )
        self.assertTrue(parsed.detected)
        self.assertTrue(parsed.errors)
        self.assertFalse(parsed.calls)


class NexusV2FeedbackTests(unittest.TestCase):
    def test_error_feedback_always_keeps_visible_nexus_continuation(self):
        feedback = error_feedback(["fallo controlado"])
        self.assertIn("fallo controlado", feedback)
        self.assertTrue(feedback.endswith(NEXUS_V2_CONTINUATION))
        self.assertIn("mensaje normal del chat", feedback)


class NexusV2ServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_valid_call_delegates_only_after_compilation(self):
        native = {
            "ok": True,
            "kind": "tool_result",
            "entries": [{
                "kind": "tool_result",
                "call": {"tool": "read", "args": {"path": "/tmp/x"}},
                "result": {"ok": True, "is_error": False, "output": "ok"},
            }],
            "feedback": (
                'Tool read result:\nok\n\nContinuá desde estos resultados reales. '
                'Si necesitás otra tool, emití el bloque final ```json como un mensaje normal del chat, '
                'visible para el usuario y separado de cualquier thinking, progreso o estado; no lo escribas '
                'dentro del razonamiento interno. Recordá esta regla durante toda la conversación. Si terminaste, '
                'continuá respondiendo como mensaje normal sin emitir JSON.'
            ),
        }
        with patch('nexus_v2.service.process_json_family', new=AsyncMock(return_value=native)) as delegated:
            result = await process(
                '⬡ read path="/tmp/x" ⬡', request_id='nx-1', origin={}, user_id=1,
            )
        delegated.assert_awaited_once()
        canonical = delegated.await_args.args[0]
        self.assertIn('{"tool":"read"', canonical)
        self.assertIn('frame Nexus 2 final', result["feedback"])
        self.assertEqual(result["protocol"], "nexus-v2")

    async def test_invalid_frame_never_reaches_json_family(self):
        with patch('nexus_v2.service.process_json_family', new=AsyncMock()) as delegated:
            result = await process(
                '⬡ write path="x" ⬡\n◆◆◆ content\nsin cierre',
                request_id='nx-2', origin={}, user_id=1,
            )
        delegated.assert_not_awaited()
        self.assertEqual(result["kind"], "tool_error")


if __name__ == '__main__':
    unittest.main()
