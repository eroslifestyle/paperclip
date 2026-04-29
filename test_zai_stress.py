#!/usr/bin/env python3
"""
Simple stress test for ZAI adapter
Tests basic functionality and checks for rate limiting
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime
from typing import List, Dict, Any

import aiohttp
import httpx

# Configuration
PAPERCLIP_URL = "http://localhost:3100"
API_URL = f"{PAPERCLIP_URL}/api"
CONCURRENT_REQUESTS = 3
MAX_RETRIES = 3
RETRY_DELAY = 2

class StressTest:
    def __init__(self):
        self.results = []
        self.errors = []

    async def create_test_company(self) -> str:
        """Create a test company for the stress test"""
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{API_URL}/companies", json={
                "name": f"ZAI Stress Test {datetime.now().strftime('%Y%m%d_%H%M%S')}",
                "slug": f"zai-stress-test-{int(time.time())}"
            })
            response.raise_for_status()
            return response.json()["id"]

    async def create_test_agent(self, company_id: str) -> str:
        """Create a test agent with ZAI adapter"""
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{API_URL}/agents", json={
                "companyId": company_id,
                "name": "ZAI Stress Test Agent",
                "adapterType": "zai_local",
                "adapterConfig": {
                    "model": "glm-4.7-flash",  # Use free model for testing
                    "enableHierarchy": True,
                    "thinking": False,
                    "maxTokens": 1000,
                    "temperature": 0.6,
                    "stream": True,
                    "timeoutSec": 30,
                    "systemPrompt": "You are a helpful assistant.",
                    "env": {
                        "ZAI_API_KEY": os.getenv("ZAI_API_KEY", "")
                    }
                }
            })
            response.raise_for_status()
            return response.json()["id"]

    async def execute_agent_task(self, agent_id: str, task_num: int) -> Dict[str, Any]:
        """Execute a simple task with the agent"""
        async with httpx.AsyncClient() as client:
            response = await client.post(f"{API_URL}/agent-runs", json={
                "agentId": agent_id,
                "source": "api",
                "context": {
                    "paperclipWake": {
                        "prompt": f"Task {task_num}: What is 2+2? Please answer briefly.",
                        "heartbeat": {
                            "wakeTime": datetime.now().isoformat(),
                            "heartbeatNumber": task_num
                        }
                    }
                }
            })
            response.raise_for_status()
            return response.json()

    async def wait_for_completion(self, run_id: str) -> Dict[str, Any]:
        """Wait for agent run to complete"""
        async with httpx.AsyncClient() as client:
            for attempt in range(MAX_RETRIES):
                response = await client.get(f"{API_URL}/agent-runs/{run_id}")
                response.raise_for_status()
                data = response.json()

                if data["status"] == "completed":
                    return data
                elif data["status"] == "failed":
                    return data
                elif data["status"] == "running":
                    await asyncio.sleep(RETRY_DELAY)
                else:
                    await asyncio.sleep(RETRY_DELAY)

            return {"status": "timeout"}

    async def run_test_task(self, agent_id: str, task_num: int):
        """Run a single test task"""
        start_time = time.time()

        try:
            # Start the task
            run_data = await self.execute_agent_task(agent_id, task_num)
            run_id = run_data["id"]

            # Wait for completion
            result = await self.wait_for_completion(run_id)

            duration = time.time() - start_time

            self.results.append({
                "task": task_num,
                "run_id": run_id,
                "status": result["status"],
                "duration": duration,
                "exit_code": result.get("exitCode", -1),
                "timed_out": result.get("timedOut", False),
                "error": result.get("errorMessage", None),
                "output_tokens": result.get("outputTokens", 0),
                "input_tokens": result.get("inputTokens", 0),
                "cost_usd": result.get("costUsd", 0)
            })

            if result["status"] == "failed":
                self.errors.append({
                    "task": task_num,
                    "error": result.get("errorMessage", "Unknown error")
                })

        except Exception as e:
            duration = time.time() - start_time
            self.results.append({
                "task": task_num,
                "run_id": None,
                "status": "error",
                "duration": duration,
                "error": str(e)
            })
            self.errors.append({
                "task": task_num,
                "error": str(e)
            })

    async def run_stress_test(self):
        """Run the stress test"""
        print("=== ZAI Adapter Stress Test ===")
        print(f"Starting at: {datetime.now()}")
        print(f"Concurrent requests: {CONCURRENT_REQUESTS}")
        print()

        # Check if ZAI API key is set
        if not os.getenv("ZAI_API_KEY"):
            print("ERROR: ZAI_API_KEY environment variable is not set")
            print("Please set it with: export ZAI_API_KEY=your_key_here")
            return

        try:
            # Create test company and agent
            print("Creating test company and agent...")
            company_id = await self.create_test_company()
            agent_id = await self.create_test_agent(company_id)
            print(f"Created agent: {agent_id}")
            print()

            # Run concurrent tasks
            print(f"Running {CONCURRENT_REQUESTS} concurrent tasks...")
            tasks = []
            for i in range(CONCURRENT_REQUESTS):
                task = asyncio.create_task(self.run_test_task(agent_id, i + 1))
                tasks.append(task)

            # Wait for all tasks to complete
            await asyncio.gather(*tasks)

            # Print results
            print("\n=== Results ===")
            print(f"Total tasks: {len(self.results)}")
            print(f"Successful: {len([r for r in self.results if r['status'] == 'completed'])}")
            print(f"Failed: {len([r for r in self.results if r['status'] != 'completed'])}")
            print(f"Errors: {len(self.errors)}")

            if self.errors:
                print("\n=== Errors ===")
                for error in self.errors[:5]:  # Show first 5 errors
                    print(f"Task {error['task']}: {error['error']}")
                if len(self.errors) > 5:
                    print(f"... and {len(self.errors) - 5} more errors")

            # Calculate metrics
            successful_runs = [r for r in self.results if r['status'] == 'completed']
            if successful_runs:
                avg_duration = sum(r['duration'] for r in successful_runs) / len(successful_runs)
                max_duration = max(r['duration'] for r in successful_runs)
                min_duration = min(r['duration'] for r in successful_runs)
                total_tokens = sum(r.get('input_tokens', 0) + r.get('output_tokens', 0) for r in successful_runs)
                total_cost = sum(r.get('cost_usd', 0) for r in successful_runs)

                print(f"\n=== Metrics (Successful Runs) ===")
                print(f"Average duration: {avg_duration:.2f}s")
                print(f"Max duration: {max_duration:.2f}s")
                print(f"Min duration: {min_duration:.2f}s")
                print(f"Total tokens: {total_tokens}")
                print(f"Total cost: ${total_cost:.6f}")

            # Save results to file
            with open(f"/tmp/zai_stress_test_{int(time.time())}.json", "w") as f:
                json.dump({
                    "timestamp": datetime.now().isoformat(),
                    "results": self.results,
                    "errors": self.errors
                }, f, indent=2)
                print(f"\nResults saved to: {f.name}")

        except Exception as e:
            print(f"ERROR: {str(e)}")
            import traceback
            traceback.print_exc()

async def main():
    test = StressTest()
    await test.run_stress_test()

if __name__ == "__main__":
    asyncio.run(main())