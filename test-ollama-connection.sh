#!/bin/bash

# Test script for Ollama GPU server connection
# Usage: ./test-ollama-connection.sh <username> <password>

if [ $# -lt 2 ]; then
    echo "Usage: $0 <username> <password>"
    echo "Example: $0 myuser mypassword"
    exit 1
fi

USERNAME="$1"
PASSWORD="$2"
SERVER_URL="https://gpu2.oginnovation.com:11434"

echo "🔍 Testing Ollama server connection..."
echo "Server: $SERVER_URL"
echo "User: $USERNAME"
echo ""

# Test 1: Root endpoint
echo "Test 1: Root endpoint"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -u "$USERNAME:$PASSWORD" "$SERVER_URL/")
if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Authentication successful"
else
    echo "❌ Authentication failed (HTTP $HTTP_CODE)"
    exit 1
fi
echo ""

# Test 2: List models
echo "Test 2: List available models"
curl -s -u "$USERNAME:$PASSWORD" "$SERVER_URL/api/tags" | python3 -m json.tool 2>/dev/null || echo "Failed to list models"
echo ""

# Test 3: Chat completion (OpenAI-compatible endpoint)
echo "Test 3: Test chat completion"
curl -s -u "$USERNAME:$PASSWORD" "$SERVER_URL/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mistral:7b",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 50
  }' | python3 -m json.tool 2>/dev/null || echo "Failed chat completion"
echo ""

echo "✅ All tests completed!"
echo ""
echo "To use in VSCode, set these environment variables:"
echo "export OLLAMA_USERNAME=\"$USERNAME\""
echo "export OLLAMA_PASSWORD=\"$PASSWORD\""
