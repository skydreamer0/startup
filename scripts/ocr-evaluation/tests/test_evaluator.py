import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from evaluator import FIELDS, InputError, evaluate, load_json


class EvaluatorTests(unittest.TestCase):
    def setUp(self):
        self.gold = load_json(ROOT / "fixtures/gold.json")
        self.pred = load_json(ROOT / "fixtures/control_predictions.json")

    def run_eval(self):
        return evaluate(self.gold, self.pred)

    def field(self, name, row=0):
        return self.pred["rows"][row]["fields"][name]

    def test_control_counts_are_fixed_and_not_engine_accuracy(self):
        r = self.run_eval()
        self.assertEqual(r["fixture_contract"], "PASS")
        self.assertEqual(r["expected_fields"], 66)
        self.assertEqual(r["expected_rows"], 11)
        self.assertEqual(sum(c["known_total"] for c in r["field_metrics"].values()), 51)
        self.assertEqual(sum(c["unresolved_total"] for c in r["field_metrics"].values()), 15)
        self.assertEqual(r["quantity_unit_literal_joint_exact"]["denominator"], 8)
        self.assertEqual(r["engine_execution"], "NOT_RUN")
        self.assertFalse(r["business_auto_acceptance"])
        self.assertFalse(r["confidence_used_for_scoring_or_acceptance"])
        self.assertTrue(r["requires_human_confirmation"])
        self.assertTrue(all(f["requires_human_confirmation"] for row in r["rows"] for f in row["fields"].values()))

    def test_negative_fixture_has_independent_expected_counts(self):
        r = evaluate(self.gold, load_json(ROOT / "fixtures/negative_predictions.json"))
        self.assertEqual(r["fixture_contract"], "FAIL")
        self.assertEqual(r["field_contract_mismatches"], 24)
        self.assertEqual(r["expected_fields"], 66)
        self.assertEqual(r["missing_prediction_rows"], ["roc-year"])
        self.assertEqual(r["unexpected_prediction_rows"], ["unexpected-row"])
        self.assertEqual(r["unexpected_candidate_fields"], 6)
        self.assertEqual(r["quantity_unit_literal_joint_exact"]["numerator"], 5)
        expected = {"expiry": (4, 8), "lot": (5, 8), "nhi_code": (7, 9),
                    "product_name": (7, 9), "quantity": (7, 9), "unit": (6, 8)}
        for name, (correct, total) in expected.items():
            self.assertEqual(r["field_metrics"][name]["exact_known"], correct)
            self.assertEqual(r["field_metrics"][name]["known_total"], total)

    def test_empty_predictions_do_not_erase_denominators(self):
        self.pred["rows"] = []
        r = self.run_eval()
        self.assertEqual(r["fixture_contract"], "FAIL")
        self.assertEqual(r["field_contract_mismatches"], 66)
        self.assertEqual(sum(c["known_total"] for c in r["field_metrics"].values()), 51)
        self.assertEqual(sum(c["exact_known"] for c in r["field_metrics"].values()), 0)
        self.assertEqual(sum(c["correct_explicit_unresolved"] for c in r["field_metrics"].values()), 0)

    def test_each_omitted_field_is_counted(self):
        for name in FIELDS:
            with self.subTest(name=name):
                p = copy.deepcopy(self.pred)
                del p["rows"][0]["fields"][name]
                r = evaluate(self.gold, p)
                c = r["field_metrics"][name]
                self.assertEqual(c["omitted_fields"], 1)
                self.assertEqual(c["missing_known"], 1)
                self.assertEqual(c["exact_known"], c["known_total"] - 1)
                self.assertEqual(r["fixture_contract"], "FAIL")

    def test_wrong_single_candidate_has_full_denominator(self):
        self.field("lot")["values"] = ["wrong"]
        c = self.run_eval()["field_metrics"]["lot"]
        self.assertEqual(c["literal_exact_on_known"], {"numerator": 7, "denominator": 8, "value": 7 / 8})
        self.assertEqual(c["single_candidate_coverage_on_known"]["numerator"], 8)
        self.assertEqual(c["wrong_literal_among_single_candidates"], {"numerator": 1, "denominator": 8, "value": 1 / 8})

    def test_no_lossy_normalization(self):
        mutations = [("nhi_code", 2, "SYN003"), ("lot", 2, "ABC-001"),
                     ("lot", 0, "Lot-001"), ("lot", 0, "Lot0O1"),
                     ("nhi_code", 3, "SYN004"), ("quantity", 3, "10"),
                     ("quantity", 2, "1"), ("unit", 0, " 盒"),
                     ("product_name", 0, "合成測試品甲 20mg")]
        for name, i, wrong in mutations:
            with self.subTest(name=name, row=i, wrong=wrong):
                p = copy.deepcopy(self.pred)
                p["rows"][i]["fields"][name]["values"] = [wrong]
                r = evaluate(self.gold, p)
                self.assertFalse(r["rows"][i]["fields"][name]["literal_exact_known"])
                self.assertEqual(r["fixture_contract"], "FAIL")

    def test_literal_newline_and_unicode_are_not_normalized(self):
        self.field("lot")["values"] = ["Lot-0O1\n"]
        self.assertEqual(self.run_eval()["fixture_contract"], "FAIL")
        self.gold["rows"][0]["fields"]["product_name"]["values"] = ["é"]
        self.field("product_name")["values"] = ["e\u0301"]
        self.assertFalse(self.run_eval()["rows"][0]["fields"]["product_name"]["literal_exact_known"])

    def test_ambiguous_candidate_is_not_single_exact_or_coverage(self):
        f = self.field("lot")
        f.update(state="ambiguous", values=["Lot-0O1", "Lot-001"])
        c = self.run_eval()["field_metrics"]["lot"]
        self.assertEqual(c["exact_known"], 7)
        self.assertEqual(c["ambiguous_known"], 1)
        self.assertEqual(c["single_candidate_known"], 7)

    def test_forcing_ambiguous_truth_to_one_value_fails_even_at_high_confidence(self):
        f = self.field("nhi_code", 10)
        f.update(state="candidate", values=f["values"][:1], confidence=1.0)
        r = self.run_eval()
        self.assertEqual(r["field_metrics"]["nhi_code"]["collapsed_ambiguous"], 1)
        self.assertEqual(r["field_metrics"]["nhi_code"]["correct_explicit_unresolved"], 1)
        self.assertEqual(r["fixture_contract"], "FAIL")

    def test_ambiguity_order_does_not_select_first(self):
        self.field("lot", 10)["values"].reverse()
        self.assertEqual(self.run_eval()["fixture_contract"], "PASS")

    def test_missing_on_known_is_not_correct_extraction(self):
        self.field("lot").update(state="missing", values=[])
        c = self.run_eval()["field_metrics"]["lot"]
        self.assertEqual(c["exact_known"], 7)
        self.assertEqual(c["missing_known"], 1)
        self.assertEqual(c["known_total"], 8)

    def test_unreadable_abstention_is_not_extraction(self):
        c = self.run_eval()["field_metrics"]["lot"]
        self.assertEqual(c["known_total"], 8)
        self.assertEqual(c["unresolved_total"], 3)
        self.assertEqual(c["exact_known"], 8)
        self.assertEqual(c["correct_explicit_unresolved"], 3)

    def test_hallucination_on_absent_and_unreadable(self):
        for row in (8, 9):
            with self.subTest(row=row):
                p = copy.deepcopy(self.pred)
                p["rows"][row]["fields"]["lot"].update(state="candidate", values=["invented"])
                r = evaluate(self.gold, p)
                self.assertEqual(r["field_metrics"]["lot"]["hallucinated_on_absent_or_unreadable"], 1)
                self.assertEqual(r["fixture_contract"], "FAIL")

    def test_all_absent_returns_null_not_perfect_extraction_rate(self):
        self.gold["rows"] = [self.gold["rows"][9]]
        self.pred["rows"] = [self.pred["rows"][9]]
        r = self.run_eval()
        for c in r["field_metrics"].values():
            self.assertEqual(c["literal_exact_on_known"], {"numerator": 0, "denominator": 0, "value": None})
            self.assertEqual(c["explicit_unresolved_handling"]["numerator"], 1)
        self.assertEqual(r["quantity_unit_literal_joint_exact"]["value"], None)

    def test_missing_unresolved_row_is_not_successful_abstention(self):
        self.pred["rows"].pop(9)
        r = self.run_eval()
        self.assertEqual(r["fixture_contract"], "FAIL")
        self.assertEqual(r["field_metrics"]["nhi_code"]["correct_explicit_unresolved"], 1)

    def test_quantity_unit_joint_rejects_same_quantity_wrong_unit(self):
        self.field("unit")["values"] = ["粒"]
        r = self.run_eval()
        self.assertTrue(r["rows"][0]["fields"]["quantity"]["literal_exact_known"])
        self.assertEqual(r["quantity_unit_literal_joint_exact"]["numerator"], 7)
        self.assertFalse(r["business_auto_acceptance"])

    def test_quantity_unit_joint_rejects_inferred_box_conversion(self):
        self.field("quantity")["values"] = ["100"]
        self.field("unit")["values"] = ["粒"]
        r = self.run_eval()
        self.assertEqual(r["quantity_unit_literal_joint_exact"]["numerator"], 7)
        self.assertIn("package conversion joint correctness", r["not_evaluated"])

    def test_date_text_cannot_be_guessed(self):
        for row, guessed in ((4, "2027-04-30"), (5, "2027-03-04"), (7, "2027-04-30")):
            with self.subTest(row=row):
                p = copy.deepcopy(self.pred)
                p["rows"][row]["fields"]["expiry"]["values"] = [guessed]
                r = evaluate(self.gold, p)
                self.assertFalse(r["rows"][row]["fields"]["expiry"]["literal_exact_known"])

    def test_invalid_date_can_be_transcribed_but_never_semantically_accepted(self):
        r = self.run_eval()
        field = r["rows"][6]["fields"]["expiry"]
        self.assertTrue(field["literal_exact_known"])
        self.assertEqual(field["literal_diagnostics"][0]["diagnostic"], "invalid_iso_calendar_literal")
        self.assertEqual(field["expiry_business_semantics"], "NOT_EVALUATED")
        self.assertTrue(field["requires_human_confirmation"])
        for row in (4, 5, 7):
            self.assertEqual(r["rows"][row]["fields"]["expiry"]["literal_diagnostics"][0]["diagnostic"],
                             "requires_human_date_interpretation")

    def test_review_flag_false_fails_even_exact_at_confidence_one(self):
        self.field("nhi_code")["review_required"] = False
        r = self.run_eval()
        self.assertEqual(r["fixture_contract"], "FAIL")
        self.assertEqual(r["field_metrics"]["nhi_code"]["review_violations"], 1)
        self.assertEqual(r["field_metrics"]["nhi_code"]["exact_known"], 9)
        self.assertFalse(r["business_auto_acceptance"])

    def test_confidence_never_changes_metric(self):
        before = self.run_eval()
        for row in self.pred["rows"]:
            for f in row["fields"].values():
                f["confidence"] = 0
        self.assertEqual(before, self.run_eval())

    def test_row_order_is_irrelevant_but_wrong_row_assignment_fails(self):
        self.pred["rows"].reverse()
        self.assertEqual(self.run_eval()["fixture_contract"], "PASS")
        self.pred["rows"].reverse()
        a, b = self.pred["rows"][:2]
        a["fields"], b["fields"] = b["fields"], a["fields"]
        self.assertEqual(self.run_eval()["fixture_contract"], "FAIL")

    def test_extra_row_is_not_ignored(self):
        row = copy.deepcopy(self.pred["rows"][0])
        row["row_id"] = "unexpected"
        self.pred["rows"].append(row)
        r = self.run_eval()
        self.assertEqual(r["unexpected_candidate_fields"], 6)
        self.assertEqual(r["fixture_contract"], "FAIL")

    def test_invalid_predicted_fields_are_rejected_not_abstained(self):
        invalid = [None, {}, {"state": "missing", "values": ["x"], "review_required": True},
                   {"state": "candidate", "values": [], "review_required": True},
                   {"state": "candidate", "values": [10], "review_required": True},
                   {"state": "candidate", "values": [" "], "review_required": True},
                   {"state": "accepted", "values": ["x"], "review_required": False},
                   {"state": "ambiguous", "values": ["x", "x"], "review_required": True},
                   {"state": "missing", "values": [], "review_required": "true"}]
        for value in invalid:
            with self.subTest(value=value):
                p = copy.deepcopy(self.pred)
                p["rows"][0]["fields"]["lot"] = value
                with self.assertRaises(InputError):
                    evaluate(self.gold, p)

    def test_invalid_confidence_is_rejected(self):
        for value in (True, "0.9", -0.1, 1.1, float("nan"), float("inf"), 10 ** 400):
            with self.subTest(value=value):
                self.field("lot")["confidence"] = value
                with self.assertRaises(InputError):
                    self.run_eval()

    def test_invalid_unicode_literal_is_rejected(self):
        self.field("lot")["values"] = ["\ud800"]
        with self.assertRaises(InputError):
            self.run_eval()

    def test_cli_huge_integer_confidence_is_input_error(self):
        self.field("lot")["confidence"] = 10 ** 400
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "huge-integer.json"
            path.write_text(json.dumps(self.pred), encoding="utf-8")
            result = subprocess.run([sys.executable, str(ROOT / "evaluator.py"),
                                     str(ROOT / "fixtures/gold.json"), str(path)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
            self.assertEqual(json.loads(result.stderr)["input_status"], "ERROR")

    def test_missing_truth_field_is_rejected(self):
        del self.gold["rows"][0]["fields"]["lot"]
        with self.assertRaises(InputError):
            self.run_eval()

    def test_unknown_field_is_rejected(self):
        self.pred["rows"][0]["fields"]["lots"] = self.field("lot")
        with self.assertRaises(InputError):
            self.run_eval()

    def test_duplicate_row_ids_rejected_in_either_input(self):
        for which in ("gold", "prediction"):
            with self.subTest(which=which):
                g, p = copy.deepcopy(self.gold), copy.deepcopy(self.pred)
                doc = g if which == "gold" else p
                doc["rows"].append(copy.deepcopy(doc["rows"][0]))
                with self.assertRaises(InputError):
                    evaluate(g, p)

    def test_empty_gold_rejected(self):
        self.gold["rows"] = []
        with self.assertRaises(InputError):
            self.run_eval()

    def test_provenance_cannot_claim_actual_engine_run(self):
        for key, value in (("engine_executed", True), ("contains_personal_data", True),
                           ("source", "rapidocr"), ("engine_executed", 0)):
            with self.subTest(key=key, value=value):
                p = copy.deepcopy(self.pred)
                p["provenance"][key] = value
                with self.assertRaises(InputError):
                    evaluate(self.gold, p)

    def test_holdout_claim_is_rejected(self):
        self.gold["rows"][0]["source"]["split"] = "holdout"
        with self.assertRaises(InputError):
            self.run_eval()

    def test_duplicate_json_keys_and_nonfinite_numbers_rejected(self):
        for content in ('{"a":1,"a":2}', '{"a":NaN}', '{"a":Infinity}'):
            with self.subTest(content=content), tempfile.TemporaryDirectory() as d:
                path = Path(d) / "invalid.json"
                path.write_text(content, encoding="utf-8")
                with self.assertRaises(InputError):
                    load_json(path)

    def test_cli_exit_codes_and_repeatable_reports(self):
        command = [sys.executable, str(ROOT / "evaluator.py"), str(ROOT / "fixtures/gold.json")]
        for name, expected in (("control_predictions.json", 0), ("negative_predictions.json", 1)):
            a = subprocess.run(command + [str(ROOT / "fixtures" / name)], capture_output=True, text=True)
            b = subprocess.run(command + [str(ROOT / "fixtures" / name)], capture_output=True, text=True)
            self.assertEqual(a.returncode, expected, a.stderr)
            self.assertEqual(a.stdout, b.stdout)
            r = json.loads(a.stdout)
            self.assertEqual(len(r["evaluator_sha256"]), 64)
        bad = subprocess.run(command + [str(ROOT / "fixtures/missing-file.json")], capture_output=True, text=True)
        self.assertEqual(bad.returncode, 2)
        self.assertEqual(bad.stdout, "")
        self.assertEqual(json.loads(bad.stderr)["input_status"], "ERROR")


if __name__ == "__main__":
    unittest.main()
