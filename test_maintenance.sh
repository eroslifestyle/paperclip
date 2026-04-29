#!/bin/bash

# Test script for automatic maintenance system
# This script creates some test files and verifies they get cleaned up

echo "=== Testing Paperclip Automatic Maintenance System ==="
echo

# Create some test temporary files
echo "Creating test files..."
mkdir -p /tmp/paperclip-test

# Create some old test files (simulate 25 hours old)
touch -d "25 hours ago" /tmp/paperclip-test/old-file-1.tmp
touch -d "25 hours ago" /tmp/paperclip-test/old-file-2.log
touch -d "25 hours ago" /tmp/paperclip-test/zai-slot-old

# Create some recent test files (should be preserved)
touch /tmp/paperclip-test/recent-file-1.tmp
touch /tmp/paperclip-test/recent-file-2.log
touch /tmp/paperclip-test/zai-slot-recent

echo "Test files created:"
ls -la /tmp/paperclip-test/
echo

# Check maintenance service status
echo "Checking maintenance service status..."
curl -s http://localhost:3100/api/maintenance/status | jq .
echo

# Trigger immediate maintenance run
echo "Triggering immediate maintenance run..."
curl -s -X POST http://localhost:3100/api/maintenance/run | jq .
echo

# Wait a moment for maintenance to complete
echo "Waiting for maintenance to complete..."
sleep 5

# Check which files remain
echo "Files remaining after maintenance:"
ls -la /tmp/paperclip-test/ 2>/dev/null || echo "Directory removed"
echo

# Verify the maintenance endpoint still works
echo "Verifying maintenance endpoint..."
curl -s http://localhost:3100/api/maintenance/status | jq '.enabled' | grep -q "true" && echo "✅ Maintenance service is enabled" || echo "❌ Maintenance service is not enabled"

# Clean up test directory
rm -rf /tmp/paperclip-test

echo "=== Test completed ==="