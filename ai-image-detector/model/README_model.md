# Model Setup Instructions

This guide explains how to download and quantize the DejAIvu ResNet-50 model for use in the NeuroCheck Chrome extension.

## Prerequisites

1. Python 3.9 or higher
2. Bash shell (for download script)
3. curl (for downloading)

## Step-by-Step Instructions

### Step 1: Install Python Dependencies

```bash
pip install onnx onnxruntime onnxruntime-tools numpy
```

### Step 2: Download ONNX Runtime Web

```bash
cd neurocheck
./model/download_ort.sh
```

This will download:
- ONNX Runtime Web JavaScript library
- Required WASM files for different CPU capabilities

### Step 3: Download the Model

```bash
./model/download_model.sh
```

This will:
- Download the DejAIvu ResNet-50 model (~90 MB)
- Save it as `model/resnet50_fp32.onnx`
- Verify the SHA256 checksum

### Step 4: Quantize the Model

Run the quantization script to convert the model to INT8 (from the project directory):

```bash
cd neurocheck
python model/quantise_model.py model/resnet50_fp32.onnx model/model.onnx
```

This will:
- Apply static INT8 quantization with per-channel weights
- Reduce the model size from ~90 MB to ~22 MB
- Perform a sanity check to ensure the model works correctly
- Save the quantized model as `model/model.onnx`

### Step 5: Verify the Output

The script will display:
- Input and output model sizes
- Size reduction percentage (should be ~75%)
- Sanity check results showing softmax probabilities sum to 1.0

### Step 6: Model is Ready

The quantized `model/model.onnx` file is now ready for use by the Chrome extension. The extension will automatically load this model when activated.

## Model Details

- **Source**: DejAIvu ResNet-50 (2025)
- **License**: GPL-3.0
- **Accuracy**: ~97% on 270k mixed AI/real images
- **Input**: `input` tensor, shape [1, 256, 256, 3], values in range [0, 1]
- **Output**: `output` tensor, shape [1, 1], single value (logit or probability for AI detection)

## Troubleshooting

- **SHA256 mismatch**: The model file may have been updated. Check the GitHub repository for the latest version.
- **Quantization fails**: Ensure you have the latest versions of onnxruntime and onnxruntime-tools.
- **Out of memory**: The quantization process requires ~2GB RAM. Close other applications if needed.