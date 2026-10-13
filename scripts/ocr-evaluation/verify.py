#!/usr/bin/env python3
"""Run the synthetic evaluator contract and retain reproducible local evidence."""
import argparse
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "evidence")
    args = parser.parse_args()
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    suite = unittest.defaultTestLoader.discover(str(ROOT / "tests"))
    with (output / "unit-tests.log").open("w", encoding="utf-8") as log:
        result = unittest.TextTestRunner(stream=log, verbosity=2).run(suite)
    tests = {"run": result.testsRun, "failures": len(result.failures),
             "errors": len(result.errors), "skipped": len(result.skipped)}
    passed = result.wasSuccessful() and result.testsRun > 0 and not result.skipped
    executions = []
    for name, expected_exit, expected_contract in (
        ("control", 0, "PASS"), ("negative", 1, "FAIL")
    ):
        command = [sys.executable, "-I", str(ROOT / "evaluator.py"),
                   str(ROOT / "fixtures/gold.json"), str(ROOT / f"fixtures/{name}_predictions.json")]
        first = subprocess.run(command, capture_output=True)
        second = subprocess.run(command, capture_output=True)
        (output / f"{name}-report.json").write_bytes(first.stdout)
        (output / f"{name}-stderr.log").write_bytes(first.stderr)
        try:
            report = json.loads(first.stdout)
        except (ValueError, UnicodeError):
            report = {}
        deterministic = first.stdout == second.stdout and first.stderr == second.stderr
        case_passed = (first.returncode == second.returncode == expected_exit and deterministic
                       and report.get("fixture_contract") == expected_contract
                       and report.get("scope") == "SYNTHETIC_EVALUATOR_CONTRACT_ONLY"
                       and report.get("engine_execution") == "NOT_RUN"
                       and report.get("business_auto_acceptance") is False)
        passed = passed and case_passed
        executions.append({"fixture": name, "command": command, "exit_code": first.returncode,
                           "repeat_exit_code": second.returncode, "expected_exit_code": expected_exit,
                           "fixture_contract": report.get("fixture_contract"),
                           "repeat_bytes_equal": deterministic, "check_passed": case_passed})
    files = [ROOT / "evaluator.py", ROOT / "verify.py", ROOT / "README.md",
             *sorted((ROOT / "fixtures").glob("*.json")), *sorted((ROOT / "tests").glob("*.py"))]
    manifest = {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
    (output / "source-sha256.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    summary = {"verification": "PASS" if passed else "FAIL", "scope": "SYNTHETIC_EVALUATOR_CONTRACT_ONLY",
               "python": sys.version.split()[0], "platform": platform.platform(),
               "tests": tests, "executions": executions, "engine_execution": "NOT_RUN",
               "real_image_accuracy": "NOT_RUN", "CPU_RAM_POS_benchmark": "NOT_RUN"}
    text = json.dumps(summary, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    (output / "verification-summary.json").write_text(text, encoding="utf-8")
    print(text, end="")
    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
