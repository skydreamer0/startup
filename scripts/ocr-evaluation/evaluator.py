#!/usr/bin/env python3
"""Offline synthetic field-evaluation contract; no OCR engine or business writes."""
import argparse
from datetime import date
import hashlib
import json
import math
from pathlib import Path
import re
import sys

FIELDS = ("nhi_code", "product_name", "lot", "expiry", "quantity", "unit")
SCHEMA = "pharmacy-ocr-synthetic-evaluation/v1"
PROVENANCE = {
    "source": "hand_authored_synthetic",
    "contains_personal_data": False,
    "engine_executed": False,
}


class InputError(ValueError):
    """Invalid inputs are errors, never silently converted into abstentions."""


def require(condition, message):
    if not condition:
        raise InputError(message)


def keys(value, required, optional=(), location="object"):
    require(isinstance(value, dict), f"{location}: expected object")
    require(set(required) <= value.keys(), f"{location}: missing required keys")
    require(value.keys() <= set(required) | set(optional), f"{location}: unknown keys")


def literal(value, location):
    require(isinstance(value, str) and bool(value.strip()),
            f"{location}: expected nonempty literal string")
    try:
        value.encode("utf-8")
    except UnicodeError as exc:
        raise InputError(f"{location}: invalid Unicode literal") from exc
    # Whitespace is only checked for emptiness, never stripped for comparison.
    return value


def unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, f"duplicate JSON key: {key}")
        result[key] = value
    return result


def invalid_constant(value):
    raise InputError(f"non-finite JSON constant: {value}")


def load_with_hash(path):
    raw = Path(path).read_bytes()
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_pairs,
                       parse_constant=invalid_constant)
    return value, hashlib.sha256(raw).hexdigest()


def load_json(path):
    return load_with_hash(path)[0]


def validate(document, *, prediction):
    keys(document, ("schema_version", "provenance", "rows"), location="document")
    require(document["schema_version"] == SCHEMA, "unsupported schema_version")
    keys(document["provenance"], PROVENANCE, location="provenance")
    for key, expected in PROVENANCE.items():
        value = document["provenance"][key]
        require(type(value) is type(expected) and value == expected,
                "only explicitly synthetic, non-engine fixtures are supported")
    rows = document["rows"]
    require(isinstance(rows, list), "rows: expected array")
    require(prediction or len(rows) > 0, "gold rows must not be empty")
    seen = set()
    for i, row in enumerate(rows):
        loc = f"rows[{i}]"
        required = ("row_id", "fields") if prediction else ("row_id", "source", "fields")
        keys(row, required, location=loc)
        row_id = literal(row["row_id"], loc + ".row_id")
        require(row_id not in seen, f"duplicate row_id: {row_id}")
        seen.add(row_id)
        if not prediction:
            source = row["source"]
            keys(source, ("document_id", "page", "region", "split"), location=loc + ".source")
            literal(source["document_id"], loc + ".document_id")
            literal(source["region"], loc + ".region")
            require(type(source["page"]) is int and source["page"] > 0, "page must be a positive integer")
            require(source["split"] == "synthetic_contract_only", "no calibration/holdout claim supported")
        fields = row["fields"]
        keys(fields, () if prediction else FIELDS, FIELDS, location=loc + ".fields")
        for name, field in fields.items():
            field_loc = f"{loc}.fields.{name}"
            required = ("state", "values", "review_required") if prediction else ("state", "values")
            keys(field, required, ("confidence",) if prediction else (), location=field_loc)
            allowed = ("candidate", "missing", "ambiguous") if prediction else ("known", "absent", "unreadable", "ambiguous")
            require(field["state"] in allowed, field_loc + ": unsupported state")
            values = field["values"]
            require(isinstance(values, list), field_loc + ": values must be an array")
            for value in values:
                literal(value, field_loc + ".values")
            require(len(set(values)) == len(values), field_loc + ": duplicate candidates")
            n = len(values)
            state = field["state"]
            valid = (n == 1 if state in ("known", "candidate") else
                     n >= 2 if state == "ambiguous" else n == 0)
            require(valid, field_loc + ": state/value cardinality mismatch")
            if prediction:
                require(type(field["review_required"]) is bool, field_loc + ": review_required must be boolean")
                if "confidence" in field:
                    value = field["confidence"]
                    require(type(value) in (int, float) and 0 <= value <= 1 and math.isfinite(value),
                            field_loc + ": confidence must be a finite number in [0,1]")


def rate(numerator, denominator):
    return {"numerator": numerator, "denominator": denominator,
            "value": numerator / denominator if denominator else None}


def expiry_literal_diagnostic(values):
    """Syntax diagnostic only. Does not infer date order, ROC years or month end."""
    output = []
    for value in values:
        status = "requires_human_date_interpretation"
        if re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
            try:
                date.fromisoformat(value)
                status = "valid_iso_calendar_literal_only"
            except ValueError:
                status = "invalid_iso_calendar_literal"
        output.append({"literal": value, "diagnostic": status})
    return output


def evaluate(gold, predictions):
    validate(gold, prediction=False)
    validate(predictions, prediction=True)
    expected = {row["row_id"]: row for row in gold["rows"]}
    predicted = {row["row_id"]: row for row in predictions["rows"]}
    missing_rows = sorted(expected.keys() - predicted.keys())
    extra_rows = sorted(predicted.keys() - expected.keys())
    counters = {name: dict.fromkeys((
        "expected_fields", "known_total", "exact_known", "single_candidate_known",
        "wrong_single_candidate_known", "missing_known", "ambiguous_known",
        "unresolved_total", "correct_explicit_unresolved", "hallucinated_on_absent_or_unreadable",
        "collapsed_ambiguous", "omitted_fields", "review_violations", "contract_mismatches"), 0)
        for name in FIELDS}
    details = []
    pair_total = pair_exact = complete_rows = 0
    for row_id, row in expected.items():
        fields = predicted.get(row_id, {}).get("fields", {})
        row_details = {}
        known_exact = {}
        for name in FIELDS:
            truth, guess, count = row["fields"][name], fields.get(name), counters[name]
            count["expected_fields"] += 1
            explicit = guess is not None
            state = guess["state"] if explicit else "omitted"
            values = guess["values"] if explicit else []
            review = guess["review_required"] if explicit else None
            errors = []
            if not explicit:
                count["omitted_fields"] += 1
                errors.append("prediction_omitted")
            if review is False:
                count["review_violations"] += 1
                errors.append("manual_confirmation_required")
            is_known = truth["state"] == "known"
            exact = is_known and state == "candidate" and values == truth["values"]
            known_exact[name] = exact
            if is_known:
                count["known_total"] += 1
                count["exact_known"] += int(exact)
                count["single_candidate_known"] += int(state == "candidate")
                count["wrong_single_candidate_known"] += int(state == "candidate" and not exact)
                count["missing_known"] += int(state in ("missing", "omitted"))
                count["ambiguous_known"] += int(state == "ambiguous")
                if not exact:
                    errors.append("known_literal_not_exact")
            else:
                count["unresolved_total"] += 1
                if truth["state"] == "ambiguous":
                    handled = state == "ambiguous" and set(values) == set(truth["values"])
                    count["collapsed_ambiguous"] += int(state == "candidate")
                else:
                    handled = state == "missing"
                    count["hallucinated_on_absent_or_unreadable"] += int(bool(values))
                count["correct_explicit_unresolved"] += int(handled and review is True)
                if not handled:
                    errors.append("unresolved_not_preserved")
            count["contract_mismatches"] += int(bool(errors))
            row_details[name] = {
                "gold_state": truth["state"], "gold_literals": truth["values"],
                "prediction_state": state, "predicted_literals": values,
                "literal_exact_known": exact, "prediction_review_required": review,
                "requires_human_confirmation": True, "errors": errors,
            }
            if name == "expiry":
                row_details[name]["literal_diagnostics"] = expiry_literal_diagnostic(values)
                row_details[name]["expiry_business_semantics"] = "NOT_EVALUATED"
        eligible = all(row["fields"][name]["state"] == "known" for name in ("quantity", "unit"))
        pair_total += int(eligible)
        pair_exact += int(eligible and known_exact["quantity"] and known_exact["unit"])
        all_known = all(row["fields"][name]["state"] == "known" for name in FIELDS)
        complete_rows += int(all_known and all(known_exact.values()))
        details.append({"row_id": row_id, "synthetic_source": row["source"], "fields": row_details})
    for count in counters.values():
        count["literal_exact_on_known"] = rate(count["exact_known"], count["known_total"])
        count["single_candidate_coverage_on_known"] = rate(count["single_candidate_known"], count["known_total"])
        count["wrong_literal_among_single_candidates"] = rate(count["wrong_single_candidate_known"], count["single_candidate_known"])
        count["explicit_unresolved_handling"] = rate(count["correct_explicit_unresolved"], count["unresolved_total"])
    total_mismatches = sum(c["contract_mismatches"] for c in counters.values())
    return {
        "schema_version": SCHEMA,
        "scope": "SYNTHETIC_EVALUATOR_CONTRACT_ONLY",
        "fixture_contract": "PASS" if not (total_mismatches or extra_rows or missing_rows) else "FAIL",
        "provenance": dict(PROVENANCE),
        "expected_rows": len(expected), "predicted_rows": len(predicted),
        "expected_fields": len(expected) * len(FIELDS),
        "missing_prediction_rows": missing_rows, "unexpected_prediction_rows": extra_rows,
        "unexpected_candidate_fields": sum(bool(f["values"]) for row_id in extra_rows
                                           for f in predicted[row_id]["fields"].values()),
        "field_contract_mismatches": total_mismatches,
        "field_metrics": counters,
        "quantity_unit_literal_joint_exact": rate(pair_exact, pair_total),
        "all_six_literals_known_and_exact_rows": rate(complete_rows, len(expected)),
        "business_auto_acceptance": False,
        "requires_human_confirmation": True,
        "confidence_used_for_scoring_or_acceptance": False,
        "not_evaluated": ["OCR engine accuracy", "real image/source evidence", "automatic row alignment",
                          "product/package identity false matches", "package conversion joint correctness",
                          "expiry business semantics", "real CPU/RAM/P50/P95", "POS concurrent performance",
                          "human correction time", "calibration/holdout generalization", "G0-G7 release gates"],
        "engine_execution": "NOT_RUN",
        "rows": details,
    }


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("gold", type=Path)
    parser.add_argument("predictions", type=Path)
    args = parser.parse_args(argv)
    try:
        gold, gold_hash = load_with_hash(args.gold)
        predictions, predictions_hash = load_with_hash(args.predictions)
        report = evaluate(gold, predictions)
        report["input_sha256"] = {"gold": gold_hash, "predictions": predictions_hash}
        report["evaluator_sha256"] = sha256(__file__)
    except (OSError, UnicodeError, ValueError) as exc:
        print(json.dumps({"input_status": "ERROR", "message": str(exc)}, ensure_ascii=False), file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False))
    return 0 if report["fixture_contract"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
