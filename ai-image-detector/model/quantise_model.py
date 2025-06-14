#!/usr/bin/env python3
"""
Static INT8 quantization for DejAIvu ResNet-50 model
Reduces model size from ~90MB to ~22MB while maintaining accuracy
"""

import sys
import os
import numpy as np
import onnx
from onnxruntime.quantization import quantize_static, CalibrationDataReader, QuantType, QuantFormat
import onnxruntime as ort


class ResNetCalibrationDataReader(CalibrationDataReader):
    """Calibration data reader for ResNet-50 quantization"""
    
    def __init__(self, num_samples=100):
        self.num_samples = num_samples
        self.current_sample = 0
        
    def get_next(self):
        if self.current_sample >= self.num_samples:
            return None
            
        # Generate random calibration data
        # This model expects [batch, 256, 256, 3] format (HWC)
        np.random.seed(self.current_sample)  # For reproducibility
        
        # Random image data (0-1 range, no normalization needed for calibration)
        data = np.random.rand(1, 256, 256, 3).astype(np.float32)
        
        self.current_sample += 1
        return {"input": data}


def softmax(x):
    """Compute softmax values for array x."""
    exp_x = np.exp(x - np.max(x))
    return exp_x / exp_x.sum()


def quantize_model(input_model_path, output_model_path):
    """Quantize ONNX model to INT8"""
    
    print(f"Loading model from {input_model_path}...")
    
    # Check input model
    if not os.path.exists(input_model_path):
        print(f"Error: Input model not found at {input_model_path}")
        sys.exit(1)
    
    input_size = os.path.getsize(input_model_path) / (1024 * 1024)
    print(f"Input model size: {input_size:.1f} MB")
    
    # Prepare calibration data reader
    print("Preparing calibration data...")
    calibration_reader = ResNetCalibrationDataReader(num_samples=100)
    
    # Quantization configuration
    print("Quantizing model to INT8...")
    quantize_static(
        model_input=input_model_path,
        model_output=output_model_path,
        calibration_data_reader=calibration_reader,
        quant_format=QuantFormat.QOperator,
        per_channel=True,
        activation_type=QuantType.QInt8,
        weight_type=QuantType.QInt8
    )
    
    # Check output model
    output_size = os.path.getsize(output_model_path) / (1024 * 1024)
    print(f"Output model size: {output_size:.1f} MB")
    print(f"Size reduction: {(1 - output_size/input_size)*100:.1f}%")
    
    # Sanity check: run inference
    print("\nRunning sanity check...")
    session = ort.InferenceSession(output_model_path)
    
    # Create test input in the correct format [1, 256, 256, 3]
    test_input = np.random.rand(1, 256, 256, 3).astype(np.float32)
    
    # Run inference
    outputs = session.run(None, {"input": test_input})
    output_data = outputs[0][0]  # Get first batch item
    
    print(f"Raw output: {output_data}")
    print(f"Output shape: {outputs[0].shape}")
    
    # Handle different output formats
    if isinstance(output_data, np.ndarray) and output_data.size > 1:
        # Multiple logits case
        probs = softmax(output_data)
        print(f"Softmax probabilities: {probs}")
        print(f"Softmax sum: {probs.sum():.6f} (should be ≈ 1.0)")
        print(f"Predicted: {'REAL' if probs[0] > probs[1] else 'AI'} (confidence: {max(probs)*100:.1f}%)")
    else:
        # Single output case - likely sigmoid probability
        if isinstance(output_data, np.ndarray):
            prob_ai = output_data.item()
        else:
            prob_ai = float(output_data)
        
        # Apply sigmoid if needed (if output is logit)
        if prob_ai < -10 or prob_ai > 10:
            # Likely a logit, apply sigmoid
            prob_ai = 1 / (1 + np.exp(-prob_ai))
        
        print(f"AI probability: {prob_ai:.3f}")
        print(f"Predicted: {'AI' if prob_ai > 0.5 else 'REAL'} (confidence: {abs(prob_ai - 0.5) * 200:.1f}%)")
    
    print("\nQuantization complete!")


def main():
    if len(sys.argv) != 3:
        print("Usage: python quantise_model.py <input_model.onnx> <output_model.onnx>")
        print("Example: python model/quantise_model.py model/resnet50_fp32.onnx model/model.onnx")
        sys.exit(1)
    
    input_model = sys.argv[1]
    output_model = sys.argv[2]
    
    quantize_model(input_model, output_model)


if __name__ == "__main__":
    main()