#!/bin/bash
# Download ONNX Runtime Web library

set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

ORT_VERSION="1.16.3"
ORT_URL="https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.min.js"
OUTPUT_FILE="$PROJECT_DIR/model/ort.min.js"

echo "Downloading ONNX Runtime Web v${ORT_VERSION}..."
if ! curl -L -o "$OUTPUT_FILE" "$ORT_URL"; then
    echo "Error: Failed to download ONNX Runtime Web" >&2
    exit 1
fi

echo "Download complete!"
echo "File saved to: model/ort.min.js"

# Also download the WASM files that ONNX Runtime needs
echo "Downloading ONNX Runtime WASM files..."

WASM_FILES=(
    "ort-wasm.wasm"
    "ort-wasm-simd.wasm"
    "ort-wasm-threaded.wasm" 
    "ort-wasm-simd-threaded.wasm"
)

for wasm_file in "${WASM_FILES[@]}"; do
    WASM_URL="https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/${wasm_file}"
    WASM_OUTPUT="$PROJECT_DIR/model/${wasm_file}"
    
    echo "Downloading ${wasm_file}..."
    if curl -L -o "$WASM_OUTPUT" "$WASM_URL"; then
        echo "  ✓ ${wasm_file}"
    else
        echo "  ✗ Failed to download ${wasm_file}" >&2
    fi
done

echo "Done!"