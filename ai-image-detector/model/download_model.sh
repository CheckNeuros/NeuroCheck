#!/bin/bash
# Download and verify DejAIvu ResNet-50 model

set -e

# Get script directory to ensure relative paths work
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

MODEL_URL="https://raw.githubusercontent.com/Noodulz/dejAIvu/main/model/praisebe.onnx"
OUTPUT_FILE="$PROJECT_DIR/model/resnet50_fp32.onnx"
EXPECTED_SHA256="ed38ad51df7bf9e33ce95cd4303b373d380836454a8fbe07a2d3e1ff8f021e70"

# Create model directory if it doesn't exist
mkdir -p "$PROJECT_DIR/model"

echo "Downloading DejAIvu ResNet-50 model..."
if ! curl -L -o "$OUTPUT_FILE" "$MODEL_URL"; then
    echo "Error: Failed to download model" >&2
    exit 1
fi

echo "Verifying SHA256 checksum..."
if command -v sha256sum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(sha256sum "$OUTPUT_FILE" | cut -d' ' -f1)
elif command -v shasum >/dev/null 2>&1; then
    ACTUAL_SHA256=$(shasum -a 256 "$OUTPUT_FILE" | cut -d' ' -f1)
else
    echo "Error: No SHA256 tool found (sha256sum or shasum required)" >&2
    exit 1
fi

if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
    echo "Error: SHA256 mismatch!" >&2
    echo "Expected: $EXPECTED_SHA256" >&2
    echo "Actual:   $ACTUAL_SHA256" >&2
    rm -f "$OUTPUT_FILE"
    exit 1
fi

echo "SHA256 verified successfully"
echo "Done"