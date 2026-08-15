package com.anythingllm.voice;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OnnxValue;
import ai.onnxruntime.OrtSession;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.Optional;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class VoiceAudioModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    private static final String TAG = "VoiceAudioModule";
    
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private AudioRecord audioRecord;
    private boolean isRecording = false;
    private int sampleRate = 16000;
    private int channelConfig = AudioFormat.CHANNEL_IN_MONO;
    private int audioFormat = AudioFormat.ENCODING_PCM_16BIT;
    private int bufferSize;
    private Thread recordingThread;
    
    // VAD state
    private float vadThreshold = 0.5f;
    private int minSpeechFrames = 10; // ~300ms at 16kHz/512 frames
    private int maxSpeechFrames = 1000; // ~30s max
    private int silenceFrames = 25; // ~800ms silence to end
    private boolean inSpeech = false;
    private int speechFrameCount = 0;
    private int silenceFrameCount = 0;
    private java.util.ArrayList<short[]> speechBuffer = new java.util.ArrayList<>();
    
    // Silero VAD (using ONNX Runtime)
    private ai.onnxruntime.OrtSession vadSession;
    private ai.onnxruntime.OrtEnvironment ortEnvironment;
    private boolean vadInitialized = false;

    public VoiceAudioModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addLifecycleEventListener(this);
        bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat);
        if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            bufferSize = sampleRate * 2; // fallback: 1 second buffer
        }
        initVAD();
    }

    @Override
    public String getName() {
        return "VoiceAudioModule";
    }

    private void initVAD() {
        executor.execute(() -> {
            try {
                ortEnvironment = ai.onnxruntime.OrtEnvironment.getEnvironment();
                
                // Load Silero VAD model from assets
                File modelFile = new File(getReactApplicationContext().getFilesDir(), "silero_vad.onnx");
                if (!modelFile.exists()) {
                    // Copy from assets
                    copyAssetToFile("silero_vad.onnx", modelFile);
                }
                
                if (modelFile.exists()) {
                    vadSession = ortEnvironment.createSession(modelFile.getAbsolutePath(), new ai.onnxruntime.OrtSession.SessionOptions());
                    vadInitialized = true;
                    Log.d(TAG, "Silero VAD initialized successfully");
                } else {
                    Log.w(TAG, "Silero VAD model not found, VAD disabled");
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize VAD: " + e.getMessage());
            }
        });
    }

    private void copyAssetToFile(String assetName, File destFile) {
        try {
            java.io.InputStream inputStream = getReactApplicationContext().getAssets().open(assetName);
            java.io.FileOutputStream outputStream = new java.io.FileOutputStream(destFile);
            byte[] buffer = new byte[1024];
            int length;
            while ((length = inputStream.read(buffer)) > 0) {
                outputStream.write(buffer, 0, length);
            }
            outputStream.close();
            inputStream.close();
        } catch (IOException e) {
            Log.e(TAG, "Failed to copy asset: " + e.getMessage());
        }
    }

    @ReactMethod
    public void startRecording(Promise promise) {
        if (isRecording) {
            promise.reject("ALREADY_RECORDING", "Already recording");
            return;
        }

        try {
            audioRecord = new AudioRecord(
                MediaRecorder.AudioSource.MIC,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            );
            
            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                promise.reject("AUDIO_RECORD_ERROR", "Failed to initialize AudioRecord");
                return;
            }

            audioRecord.startRecording();
            isRecording = true;
            speechBuffer.clear();
            inSpeech = false;
            speechFrameCount = 0;
            silenceFrameCount = 0;

            recordingThread = new Thread(this::recordingLoop);
            recordingThread.start();

            promise.resolve(true);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start recording: " + e.getMessage());
            promise.reject("START_RECORDING_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void stopRecording(Promise promise) {
        isRecording = false;
        
        if (recordingThread != null) {
            try {
                recordingThread.join(1000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        
        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping audio record: " + e.getMessage());
            }
            audioRecord = null;
        }

        // Emit final speech segment if any
        if (!speechBuffer.isEmpty()) {
            emitSpeechSegment(speechBuffer, true);
        }

        promise.resolve(true);
    }

    private void recordingLoop() {
        short[] buffer = new short[512]; // 32ms frames at 16kHz
        
        while (isRecording && audioRecord != null) {
            int read = audioRecord.read(buffer, 0, buffer.length);
            
            if (read > 0) {
                // Process frame for VAD
                float speechProb = vadInitialized ? runVAD(buffer, read) : 0.5f;
                
                boolean isSpeech = speechProb > vadThreshold;
                
                if (isSpeech) {
                    if (!inSpeech) {
                        inSpeech = true;
                        speechFrameCount = 0;
                        silenceFrameCount = 0;
                    }
                    speechFrameCount++;
                    silenceFrameCount = 0;
                    // Store frame
                    short[] frameCopy = new short[read];
                    System.arraycopy(buffer, 0, frameCopy, 0, read);
                    speechBuffer.add(frameCopy);
                } else {
                    if (inSpeech) {
                        silenceFrameCount++;
                        // Still store some silence frames for context
                        short[] frameCopy = new short[read];
                        System.arraycopy(buffer, 0, frameCopy, 0, read);
                        speechBuffer.add(frameCopy);
                        
                        // Check for end of speech
                        if (silenceFrameCount >= silenceFrames || speechFrameCount >= maxSpeechFrames) {
                            // End of speech segment
                            boolean isFinal = speechFrameCount >= maxSpeechFrames;
                            emitSpeechSegment(speechBuffer, isFinal);
                            
                            // Reset for next segment
                            speechBuffer.clear();
                            inSpeech = false;
                            speechFrameCount = 0;
                            silenceFrameCount = 0;
                        }
                    }
                }
                
                // Emit volume level
                float volume = calculateVolume(buffer, read);
                emitVolume(volume);
            }
        }
    }

    private float runVAD(short[] audioData, int length) {
        if (!vadInitialized || vadSession == null) return 0.5f;
        
        try {
            // Convert to float array (normalized to [-1, 1])
            float[] input = new float[length];
            for (int i = 0; i < length; i++) {
                input[i] = audioData[i] / 32768.0f;
            }
            
            // Silero VAD expects: [1, 1, 512] for 512 samples
            // Pad or truncate to 512
            int vadInputSize = 512;
            float[] vadInput = new float[vadInputSize];
            System.arraycopy(input, 0, vadInput, 0, Math.min(length, vadInputSize));
            
            // Create input tensor
            long[] shape = new long[]{1, 1, vadInputSize};
            try (OnnxTensor inputTensor = OnnxTensor.createTensor(
                    ortEnvironment, FloatBuffer.wrap(vadInput), shape)) {

                // Run inference
                try (OrtSession.Result results =
                        vadSession.run(Collections.singletonMap("input", inputTensor))) {
                    Optional<OnnxValue> outputTensor = results.get("output");
                    if (outputTensor.isPresent()) {
                        Object output = outputTensor.get().getValue();
                        Float prob = extractFirstFloat(output);
                        if (prob != null) {
                            return prob;
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "VAD inference error: " + e.getMessage());
        }
        return 0.5f;
    }

    // Silero VAD's output tensor shape can vary by export; handle the common cases.
    private Float extractFirstFloat(Object output) {
        if (output instanceof float[]) {
            float[] arr = (float[]) output;
            return arr.length > 0 ? arr[0] : null;
        }
        if (output instanceof float[][]) {
            float[][] arr = (float[][]) output;
            return (arr.length > 0 && arr[0].length > 0) ? arr[0][0] : null;
        }
        if (output instanceof Float) {
            return (Float) output;
        }
        return null;
    }

    private float calculateVolume(short[] buffer, int length) {
        long sum = 0;
        for (int i = 0; i < length; i++) {
            sum += (long) buffer[i] * buffer[i];
        }
        double rms = Math.sqrt((double) sum / length);
        return (float) (rms / 32768.0);
    }

    private void emitSpeechSegment(java.util.List<short[]> frames, boolean isFinal) {
        // Combine all frames into single byte array
        int totalSamples = 0;
        for (short[] frame : frames) {
            totalSamples += frame.length;
        }
        
        byte[] audioBytes = new byte[totalSamples * 2];
        ByteBuffer byteBuffer = ByteBuffer.wrap(audioBytes).order(ByteOrder.LITTLE_ENDIAN);
        for (short[] frame : frames) {
            for (short sample : frame) {
                byteBuffer.putShort(sample);
            }
        }
        
        // Convert to base64 for React Native
        String base64Audio = android.util.Base64.encodeToString(audioBytes, android.util.Base64.NO_WRAP);
        
        WritableMap params = Arguments.createMap();
        params.putString("audioBase64", base64Audio);
        params.putBoolean("isFinal", isFinal);
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("onSpeechSegment", params);
    }

    private void emitVolume(float volume) {
        WritableMap params = Arguments.createMap();
        params.putDouble("volume", volume);
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("onVolumeChange", params);
    }

    @ReactMethod
    public void setVADThreshold(float threshold, Promise promise) {
        vadThreshold = Math.max(0.0f, Math.min(1.0f, threshold));
        promise.resolve(true);
    }

    @ReactMethod
    public void setVADConfig(int minSpeechMs, int maxSpeechMs, int silenceMs, Promise promise) {
        minSpeechFrames = minSpeechMs / 32; // 32ms per frame
        maxSpeechFrames = maxSpeechMs / 32;
        silenceFrames = silenceMs / 32;
        promise.resolve(true);
    }

    @Override
    public void onHostResume() {
    }

    @Override
    public void onHostPause() {
    }

    @Override
    public void onHostDestroy() {
        isRecording = false;
        if (audioRecord != null) {
            audioRecord.stop();
            audioRecord.release();
            audioRecord = null;
        }
        if (vadSession != null) {
            try {
                vadSession.close();
            } catch (Exception e) {
                Log.e(TAG, "Error closing VAD session: " + e.getMessage());
            }
        }
        if (ortEnvironment != null) {
            ortEnvironment.close();
        }
        executor.shutdown();
    }
}