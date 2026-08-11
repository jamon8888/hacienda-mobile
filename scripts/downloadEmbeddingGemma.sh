#!/bin/bash
# Download EmbeddingGemma-300M model for Android
# Requires HuggingFace CLI authentication

set -e

MODEL_DIR="android/app/src/main/assets"
MODEL_FILE="embeddinggemma_300m_q4_0.tflite"
MODEL_URL="https://huggingface.co/litert-community/embeddinggemma-300m/resolve/main/embeddinggemma_300m_q4_0.tflite"

echo "Downloading EmbeddingGemma-300M model..."
echo "Note: This model requires HuggingFace authentication."
echo "Run 'huggingface-cli login' first if not authenticated."
echo ""

# Create directory if it doesn't exist
mkdir -p "$MODEL_DIR"

# Download using HuggingFace CLI or curl with auth
if command -v huggingface-cli &> /dev/null; then
    huggingface-cli download litert-community/embeddinggemma-300m "$MODEL_FILE" --local-dir "$MODEL_DIR"
else
    echo "huggingface-cli not found. Using curl..."
    echo "You may need to provide your HuggingFace token."
    curl -L -o "$MODEL_DIR/$MODEL_FILE" "$MODEL_URL"
fi

echo ""
echo "Model downloaded to $MODEL_DIR/$MODEL_FILE"
echo "File size: $(du -h "$MODEL_DIR/$MODEL_FILE" | cut -f1)"
