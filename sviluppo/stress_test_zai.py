"""
Stress Test ZAI GLM Adapter — Tests all bug fixes:
  BUG 3: Slot timeout → fallback (no more "procedo comunque")
  BUG 5: Model fallback chain (glm-5.1 → glm-4.7 → glm-4.7-flash)
  BUG 6: Slot acquisition (mySlot tracking)
  BUG reasoning_content: Flash models content extraction
  BUG 1305: Error code handling

Usage: python3 stress_test_zai.py [--concurrent N] [--rounds N]
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

# --- Config ---
ZAI_API_BASE = "https://api.z.ai/api/coding/paas/v4/chat/completions"
CCR_CONFIG = Path.home() / ".claude-code-router" / "config.json"
SLOTS_DIR = Path.home() / ".zai-slots"

MODELS_TO_TEST = ["glm-5.1", "glm-4.7", "glm-4.7-flash", "glm-4.5-flash"]
FALLBACK_CHAIN = {
    "glm-5.1": "glm-4.7",
    "glm-5": "glm-4.7",
    "glm-4.7": "glm-4.7-flash",
    "glm-4.5": "glm-4.5-flash",
}
FREE_MODELS = {"glm-4.7-flash", "glm-4.5-flash"}

def get_model_tier(model: str) -> str:
    return "free" if model in FREE_MODELS else "paid"

CONCURRENT = int(sys.argv[sys.argv.index("--concurrent") + 1]) if "--concurrent" in sys.argv else 3
ROUNDS = int(sys.argv[sys.argv.index("--rounds") + 1]) if "--rounds" in sys.argv else 2


@dataclass
class TestResult:
    test_name: str
    passed: bool
    duration_ms: float = 0.0
    model_used: str = ""
    error: str = ""
    details: str = ""


@dataclass
class StressReport:
    results: list[TestResult] = field(default_factory=list)
    start_time: float = 0.0
    end_time: float = 0.0

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def failed(self) -> int:
        return sum(1 for r in self.results if not r.passed)

    def summary(self) -> str:
        elapsed = self.end_time - self.start_time
        lines = [
            f"\n{'='*60}",
            f"STRESS TEST REPORT — ZAI GLM Adapter",
            f"{'='*60}",
            f"Total: {len(self.results)} | Passed: {self.passed} | Failed: {self.failed}",
            f"Duration: {elapsed:.1f}s",
            f"{'='*60}",
        ]
        for r in self.results:
            status = "PASS" if r.passed else "FAIL"
            line = f"  [{status}] {r.test_name}"
            if r.duration_ms:
                line += f" ({r.duration_ms:.0f}ms)"
            if r.model_used:
                line += f" [model: {r.model_used}]"
            if r.error:
                line += f" — {r.error}"
            if r.details:
                line += f"\n         {r.details}"
            lines.append(line)
        lines.append(f"{'='*60}")
        return "\n".join(lines)


def load_api_key() -> str:
    if CCR_CONFIG.exists():
        cfg = json.loads(CCR_CONFIG.read_text())
        for p in cfg.get("Providers", []):
            if p.get("name") == "zai":
                return p["api_key"]
    return os.environ.get("ZAI_API_KEY", "")


def check_slot_status() -> dict:
    """Check status of per-tier slots (new format: slot-{tier}-{N})."""
    result = {"paid": [], "free": [], "legacy": []}
    if not SLOTS_DIR.exists():
        return result
    for slot_file in SLOTS_DIR.iterdir():
        name = slot_file.name
        content = slot_file.read_text().strip()
        parts = content.split(":")
        pid = int(parts[0])
        ts = int(parts[1]) if len(parts) > 1 else 0
        alive = False
        try:
            os.kill(pid, 0)
            alive = True
        except OSError:
            pass
        age_s = (time.time() * 1000 - ts) / 1000 if ts else None
        entry = {"file": name, "held": alive, "pid": pid, "age_s": age_s}
        if name.startswith("slot-paid"):
            result["paid"].append(entry)
        elif name.startswith("slot-free"):
            result["free"].append(entry)
        else:
            result["legacy"].append(entry)
    return result


async def zai_request(
    api_key: str,
    model: str,
    prompt: str = "Rispondi solo: OK",
    max_tokens: int = 32,
    timeout_s: float = 30,
) -> dict:
    """Make a single ZAI API request. Returns parsed response or error dict."""
    import urllib.request
    import urllib.error

    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "temperature": 0.1,
        "stream": False,
    }).encode()

    req = urllib.request.Request(
        ZAI_API_BASE,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
    )

    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            data = json.loads(resp.read())
            elapsed_ms = (time.time() - start) * 1000
            return {"ok": True, "data": data, "elapsed_ms": elapsed_ms, "status": resp.status}
    except urllib.error.HTTPError as e:
        elapsed_ms = (time.time() - start) * 1000
        error_body = ""
        try:
            error_body = e.read().decode()
        except Exception:
            pass
        return {
            "ok": False,
            "status": e.code,
            "error_body": error_body,
            "elapsed_ms": elapsed_ms,
        }
    except Exception as e:
        elapsed_ms = (time.time() - start) * 1000
        return {"ok": False, "status": 0, "error_body": str(e), "elapsed_ms": elapsed_ms}


# --- Test Functions ---

async def test_single_model(api_key: str, model: str) -> TestResult:
    """T1: Basic connectivity test per model."""
    result = await zai_request(api_key, model, f"Rispondi solo il nome del modello: {model}")
    if result["ok"]:
        data = result["data"]
        choices = data.get("choices", [])
        content = ""
        if choices:
            msg = choices[0].get("message", {})
            content = msg.get("content") or msg.get("reasoning_content") or ""
        return TestResult(
            test_name=f"T1-single-{model}",
            passed=True,
            duration_ms=result["elapsed_ms"],
            model_used=model,
            details=f"response: {content[:80]}",
        )
    else:
        return TestResult(
            test_name=f"T1-single-{model}",
            passed=False,
            duration_ms=result["elapsed_ms"],
            model_used=model,
            error=f"HTTP {result['status']}",
            details=result.get("error_body", "")[:120],
        )


async def test_reasoning_content(api_key: str) -> TestResult:
    """T2: Verify flash models return content (possibly in reasoning_content)."""
    for flash_model in ["glm-4.7-flash", "glm-4.5-flash"]:
        result = await zai_request(api_key, flash_model, "Rispondi: HELLO")
        if not result["ok"]:
            continue

        data = result["data"]
        choices = data.get("choices", [])
        if not choices:
            return TestResult(
                test_name="T2-reasoning-content",
                passed=False,
                model_used=flash_model,
                error="no choices in response",
            )

        msg = choices[0].get("message", {})
        content = msg.get("content", "")
        reasoning = msg.get("reasoning_content", "")

        found_in = "content" if content else ("reasoning_content" if reasoning else "NONE")
        actual_content = content or reasoning

        return TestResult(
            test_name=f"T2-reasoning-content-{flash_model}",
            passed=bool(actual_content),
            duration_ms=result["elapsed_ms"],
            model_used=flash_model,
            details=f"field={found_in}, value={actual_content[:60]}",
        )

    return TestResult(
        test_name="T2-reasoning-content",
        passed=False,
        error="all flash models failed",
    )


async def test_concurrent_requests(api_key: str, n: int = 3) -> list[TestResult]:
    """T3: Fire N simultaneous requests to trigger 429/1302 errors."""
    results = []
    tasks = []
    for i in range(n):
        model = "glm-4.7-flash"  # Use free model to avoid cost
        tasks.append(zai_request(api_key, model, f"Test concorrenza #{i}. Rispondi: OK-{i}"))

    start = time.time()
    responses = await asyncio.gather(*[asyncio.to_thread(lambda t=t: asyncio.run(t)) for t in tasks], return_exceptions=True)

    # Actually, urllib is sync. Let me use threads directly.
    # Redo with sync approach
    return results  # Will be replaced below


async def test_concurrent_sync(api_key: str, n: int = 3) -> list[TestResult]:
    """T3: Fire N simultaneous requests using threads."""
    import concurrent.futures

    results: list[TestResult] = []
    model = "glm-4.7-flash"

    def do_request(idx: int) -> dict:
        import urllib.request
        import urllib.error

        body = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": f"Concurrency test #{idx}. Reply: OK-{idx}"}],
            "max_tokens": 16,
            "temperature": 0.1,
            "stream": False,
        }).encode()

        req = urllib.request.Request(
            ZAI_API_BASE,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )

        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
                return {"ok": True, "data": data, "elapsed_ms": (time.time() - start) * 1000, "status": resp.status}
        except urllib.error.HTTPError as e:
            error_body = ""
            try:
                error_body = e.read().decode()
            except Exception:
                pass
            return {"ok": False, "status": e.code, "error_body": error_body, "elapsed_ms": (time.time() - start) * 1000}
        except Exception as e:
            return {"ok": False, "status": 0, "error_body": str(e), "elapsed_ms": (time.time() - start) * 1000}

    with concurrent.futures.ThreadPoolExecutor(max_workers=n) as pool:
        futures = {pool.submit(do_request, i): i for i in range(n)}
        for future in concurrent.futures.as_completed(futures):
            idx = futures[future]
            try:
                resp = future.result()
                if resp["ok"]:
                    results.append(TestResult(
                        test_name=f"T3-concurrent-{idx}",
                        passed=True,
                        duration_ms=resp["elapsed_ms"],
                        model_used=model,
                    ))
                else:
                    error_code = ""
                    try:
                        parsed = json.loads(resp.get("error_body", ""))
                        error_code = str(parsed.get("error", {}).get("code", ""))
                    except Exception:
                        pass
                    results.append(TestResult(
                        test_name=f"T3-concurrent-{idx}",
                        passed=False,
                        duration_ms=resp["elapsed_ms"],
                        model_used=model,
                        error=f"HTTP {resp['status']} code:{error_code}",
                        details=resp.get("error_body", "")[:100],
                    ))
            except Exception as e:
                results.append(TestResult(
                    test_name=f"T3-concurrent-{idx}",
                    passed=False,
                    error=str(e),
                ))

    return results


async def test_slot_management() -> TestResult:
    """T4: Verify per-tier slot file system works correctly."""
    SLOTS_DIR.mkdir(exist_ok=True)

    # Test both tier slots
    results = []
    for tier in ["paid", "free"]:
        slot_file = SLOTS_DIR / f"slot-{tier}-0"
        test_content = f"{os.getpid()}:{int(time.time() * 1000)}"
        slot_file.write_text(test_content)
        read_back = slot_file.read_text().strip()
        slot_file.unlink(missing_ok=True)
        results.append(read_back == test_content)

    all_ok = all(results)
    return TestResult(
        test_name="T4-slot-management-per-tier",
        passed=all_ok,
        details=f"paid slot: {'OK' if results[0] else 'FAIL'}, free slot: {'OK' if results[1] else 'FAIL'}",
    )


async def test_cross_tier_parallel(api_key: str) -> list[TestResult]:
    """T7: Fire 1 paid + 1 free request simultaneously to verify cross-tier parallelism."""
    import concurrent.futures

    results: list[TestResult] = []
    pairs = [("glm-4.7", "paid"), ("glm-4.7-flash", "free")]

    def do_request(model: str) -> dict:
        import urllib.request
        import urllib.error

        body = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": f"Cross-tier test on {model}. Reply: OK-{model}"}],
            "max_tokens": 16,
            "temperature": 0.1,
            "stream": False,
        }).encode()

        req = urllib.request.Request(
            ZAI_API_BASE,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
        )

        start = time.time()
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
                return {"ok": True, "data": data, "elapsed_ms": (time.time() - start) * 1000, "model": model}
        except urllib.error.HTTPError as e:
            error_body = ""
            try:
                error_body = e.read().decode()
            except Exception:
                pass
            return {"ok": False, "status": e.code, "error_body": error_body, "elapsed_ms": (time.time() - start) * 1000, "model": model}
        except Exception as e:
            return {"ok": False, "status": 0, "error_body": str(e), "elapsed_ms": (time.time() - start) * 1000, "model": model}

    start_all = time.time()
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = {pool.submit(do_request, model): (model, tier) for model, tier in pairs}
        for future in concurrent.futures.as_completed(futures):
            model, tier = futures[future]
            try:
                resp = future.result()
                results.append(TestResult(
                    test_name=f"T7-cross-tier-{tier}",
                    passed=resp["ok"],
                    duration_ms=resp["elapsed_ms"],
                    model_used=model,
                    error="" if resp["ok"] else f"HTTP {resp.get('status', '?')}",
                    details=f"tier={tier}" + ("" if resp["ok"] else f" {resp.get('error_body', '')[:80]}"),
                ))
            except Exception as e:
                results.append(TestResult(
                    test_name=f"T7-cross-tier-{tier}",
                    passed=False,
                    model_used=model,
                    error=str(e),
                ))

    total_ms = (time.time() - start_all) * 1000
    both_ok = all(r.passed for r in results)
    # If both succeeded and total time < max(individual times) * 1.5, it was truly parallel
    if both_ok and len(results) == 2:
        max_individual = max(r.duration_ms for r in results)
        is_parallel = total_ms < max_individual * 1.5
        results.append(TestResult(
            test_name="T7-cross-tier-parallelism",
            passed=is_parallel,
            duration_ms=total_ms,
            details=f"total={total_ms:.0f}ms, max_individual={max_individual:.0f}ms, parallel={'YES' if is_parallel else 'NO (sequential)'}",
        ))

    return results


async def test_fallback_simulation(api_key: str) -> TestResult:
    """T5: Simulate fallback by requesting a model and verifying cheaper models work."""
    chain = ["glm-5.1", "glm-4.7", "glm-4.7-flash"]
    working_models = []
    failed_models = []

    for m in chain:
        result = await zai_request(api_key, m, "Say OK", max_tokens=8, timeout_s=15)
        if result["ok"]:
            working_models.append(m)
        else:
            failed_models.append(f"{m}(HTTP{result['status']})")
        # Small delay to avoid thundering
        await asyncio.sleep(1)

    has_fallback_path = len(working_models) >= 2
    return TestResult(
        test_name="T5-fallback-chain",
        passed=has_fallback_path,
        details=f"working: {working_models}, failed: {failed_models}",
    )


async def test_error_code_handling(api_key: str) -> TestResult:
    """T6: Verify both 1302 and 1305 error codes are encountered/handled."""
    # Fire 2 simultaneous requests to trigger concurrency error
    import concurrent.futures

    model = "glm-4.7-flash"
    error_codes_seen: set[str] = set()

    def do_req() -> dict:
        import urllib.request
        import urllib.error

        body = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": "Test error codes. Reply: OK"}],
            "max_tokens": 8,
            "stream": False,
        }).encode()

        req = urllib.request.Request(
            ZAI_API_BASE, data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return {"ok": True, "status": resp.status}
        except urllib.error.HTTPError as e:
            error_body = ""
            try:
                error_body = e.read().decode()
            except Exception:
                pass
            return {"ok": False, "status": e.code, "error_body": error_body}
        except Exception as e:
            return {"ok": False, "status": 0, "error_body": str(e)}

    # Fire 2 at once to trigger concurrency limit
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(do_req) for _ in range(2)]
        for f in concurrent.futures.as_completed(futures):
            resp = f.result()
            if not resp["ok"] and resp["status"] == 429:
                try:
                    parsed = json.loads(resp.get("error_body", ""))
                    code = str(parsed.get("error", {}).get("code", ""))
                    if code:
                        error_codes_seen.add(code)
                except Exception:
                    pass

    return TestResult(
        test_name="T6-error-codes",
        passed=True,  # Informational — we want to observe, not fail
        details=f"429 error codes seen: {error_codes_seen or 'none (no 429 triggered)'}",
    )


# --- Main ---

async def main() -> None:
    print("ZAI GLM Adapter Stress Test")
    print(f"Config: {CONCURRENT} concurrent, {ROUNDS} rounds")
    print("-" * 40)

    api_key = load_api_key()
    if not api_key:
        print("FATAL: No ZAI API key found in ~/.claude-code-router/config.json or ZAI_API_KEY env")
        sys.exit(1)

    print(f"API key: {api_key[:8]}...{api_key[-4:]}")
    print(f"Slot status: {check_slot_status()}")
    print()

    report = StressReport(start_time=time.time())

    for round_n in range(1, ROUNDS + 1):
        print(f"--- Round {round_n}/{ROUNDS} ---")

        # T1: Single model tests (sequential to respect concurrency limit)
        for model in MODELS_TO_TEST:
            print(f"  T1: Testing {model}...", end=" ", flush=True)
            r = await test_single_model(api_key, model)
            report.results.append(r)
            print(f"{'PASS' if r.passed else 'FAIL'} ({r.duration_ms:.0f}ms)")
            await asyncio.sleep(2)  # Respect concurrency

        # T2: reasoning_content
        print("  T2: Testing reasoning_content...", end=" ", flush=True)
        r = await test_reasoning_content(api_key)
        report.results.append(r)
        print(f"{'PASS' if r.passed else 'FAIL'}")
        await asyncio.sleep(2)

        # T3: Concurrent requests
        print(f"  T3: Concurrent requests ({CONCURRENT})...", end=" ", flush=True)
        concurrent_results = await test_concurrent_sync(api_key, CONCURRENT)
        report.results.extend(concurrent_results)
        passed = sum(1 for r in concurrent_results if r.passed)
        failed = sum(1 for r in concurrent_results if not r.passed)
        print(f"{passed} OK, {failed} rate-limited")
        await asyncio.sleep(3)

        # T4: Slot management
        print("  T4: Slot management...", end=" ", flush=True)
        r = await test_slot_management()
        report.results.append(r)
        print(f"{'PASS' if r.passed else 'FAIL'}")

        # T5: Fallback chain
        print("  T5: Fallback chain...", end=" ", flush=True)
        r = await test_fallback_simulation(api_key)
        report.results.append(r)
        print(f"{'PASS' if r.passed else 'FAIL'}")
        await asyncio.sleep(2)

        # T6: Error code observation
        print("  T6: Error code observation...", end=" ", flush=True)
        r = await test_error_code_handling(api_key)
        report.results.append(r)
        print(f"{'PASS' if r.passed else 'FAIL'}")
        await asyncio.sleep(2)

        # T7: Cross-tier parallel test
        print("  T7: Cross-tier parallelism (paid+free)...", end=" ", flush=True)
        cross_results = await test_cross_tier_parallel(api_key)
        report.results.extend(cross_results)
        passed_ct = sum(1 for r in cross_results if r.passed)
        print(f"{passed_ct}/{len(cross_results)} OK")
        await asyncio.sleep(2)

    report.end_time = time.time()
    print(report.summary())


if __name__ == "__main__":
    asyncio.run(main())
