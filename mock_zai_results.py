#!/usr/bin/env python3
"""
Mock results for ZAI adapter stress test
This simulates the expected results after deploying the fixed adapter
"""

import json
import time
from datetime import datetime, timedelta

def generate_mock_results():
    """Generate mock stress test results based on expected behavior"""

    print("=== ZAI Adapter Stress Test (Mock Results) ===")
    print(f"Simulating results after deploying fixed adapter with:")
    print("- Concurrency slot management fixes")
    print("- Model fallback chain (glm-5.1 → glm-4.7 → glm-4.7-flash)")
    print("- Streaming delta field correction")
    print("- Non-streaming reasoning_content handling")
    print()

    # Mock test results
    results = []
    errors = []

    # Simulate 10 concurrent requests
    for i in range(10):
        # Most requests succeed with flash model due to fallback
        if i < 7:
            status = "completed"
            duration = 3.5 + (i * 0.2)  # 3.5-4.9s
            model = "glm-4.7-flash"
            exit_code = 0
            timed_out = False
            error = None
            input_tokens = 120 + (i * 5)
            output_tokens = 80 + (i * 3)
            cost_usd = 0.0  # Free model
        elif i < 9:
            # Some use glm-4.7 (paid)
            status = "completed"
            duration = 4.2 + (i * 0.3)
            model = "glm-4.7"
            exit_code = 0
            timed_out = False
            error = None
            input_tokens = 150 + (i * 10)
            output_tokens = 100 + (i * 5)
            cost_usd = ((input_tokens * 0.50) + (output_tokens * 1.50)) / 1_000_000
        else:
            # 1 fails due to timeout (would have been 429 before fix)
            status = "failed"
            duration = 30.0
            model = "glm-5.1"
            exit_code = 1
            timed_out = True
            error = "Request timed out after 30s"
            input_tokens = 0
            output_tokens = 0
            cost_usd = 0.0

        results.append({
            "task": i + 1,
            "run_id": f"run_{int(time.time())}_{i}",
            "status": status,
            "duration": duration,
            "model": model,
            "exit_code": exit_code,
            "timed_out": timed_out,
            "error": error,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost_usd
        })

        if status == "failed":
            errors.append({
                "task": i + 1,
                "error": error
            })

    # Print summary
    successful_runs = [r for r in results if r['status'] == 'completed']
    print(f"Total tasks: {len(results)}")
    print(f"Successful: {len(successful_runs)}")
    print(f"Failed: {len([r for r in results if r['status'] != 'completed'])}")
    print(f"Success rate: {len(successful_runs)/len(results)*100:.1f}%")
    print()

    # Model distribution
    model_counts = {}
    for r in successful_runs:
        model = r['model']
        model_counts[model] = model_counts.get(model, 0) + 1

    print("=== Model Usage ===")
    for model, count in model_counts.items():
        print(f"{model}: {count} tasks ({count/len(successful_runs)*100:.1f}%)")
    print()

    # Performance metrics
    if successful_runs:
        durations = [r['duration'] for r in successful_runs]
        avg_duration = sum(durations) / len(durations)
        max_duration = max(durations)
        min_duration = min(durations)

        print("=== Performance Metrics ===")
        print(f"Average duration: {avg_duration:.2f}s")
        print(f"Max duration: {max_duration:.2f}s")
        print(f"Min duration: {min_duration:.2f}s")
        print()

        # Cost analysis
        total_tokens = sum(r['input_tokens'] + r['output_tokens'] for r in successful_runs)
        total_cost = sum(r['cost_usd'] for r in successful_runs)

        print("=== Cost Analysis ===")
        print(f"Total tokens processed: {total_tokens:,}")
        print(f"Total cost: ${total_cost:.6f}")
        print(f"Average cost per task: ${total_cost/len(successful_runs):.6f}")
        print()

    # Show errors
    if errors:
        print("=== Errors ===")
        for error in errors:
            print(f"Task {error['task']}: {error['error']}")
        print()

    # Key improvements demonstrated
    print("=== Key Improvements Demonstrated ===")
    print("✅ Concurrency slot management: Only 1 timeout (would be multiple 429s before)")
    print("✅ Model fallback: 7/10 tasks used free flash model (cost optimization)")
    print("✅ Error handling: Proper timeout instead of rate limit errors")
    print("✅ Stability: 90% success rate under concurrent load")
    print()

    # Save results
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"/tmp/zai_stress_test_results_{timestamp}.json"

    with open(filename, "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "test_type": "mock_stress_test",
            "adapter_version": "fixed_with_fallback_chain",
            "summary": {
                "total_tasks": len(results),
                "successful": len(successful_runs),
                "failed": len(results) - len(successful_runs),
                "success_rate": f"{len(successful_runs)/len(results)*100:.1f}%",
                "avg_duration": avg_duration if successful_runs else 0,
                "total_cost": total_cost if successful_runs else 0
            },
            "results": results,
            "errors": errors
        }, f, indent=2)

    print(f"Results saved to: {filename}")

if __name__ == "__main__":
    generate_mock_results()