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

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class VoiceAudioModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
    private static final String TAG = "VoiceAudioModule";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private AudioRecord audioRecord;
    // Written from the bridge thread (stopRecording/onHostDestroy), read every loop iteration on
    // the recording thread -- must be volatile or the recording thread can spin on a stale
    // cached value and never observe the shutdown request.
    private volatile boolean isRecording = false;
    private int sampleRate = 16000;
    private int channelConfig = AudioFormat.CHANNEL_IN_MONO;
    private int audioFormat = AudioFormat.ENCODING_PCM_16BIT;
    private int bufferSize;
    private Thread recordingThread;

    // VAD state -- all of the fields in this block (through speechBuffer) are owned exclusively
    // by the recording thread once it starts; nothing else touches them. That is what makes
    // speechBuffer safe without a lock: it used to also be read from stopRecording() on the
    // bridge thread while the recording thread could still be appending to it, which could throw
    // ConcurrentModificationException or emit a half-written segment. Final-segment emission now
    // happens at the end of recordingLoop() itself instead.
    private float vadThreshold = 0.5f;
    private int minSpeechFrames = 10; // ~300ms at 16kHz/512 frames
    private int maxSpeechFrames = 1000; // ~30s max
    private int silenceFrames = 25; // ~800ms silence to end
    private boolean inSpeech = false;
    private int speechFrameCount = 0;
    private int silenceFrameCount = 0;
    private java.util.ArrayList<short[]> speechBuffer = new java.util.ArrayList<>();

    // Silero VAD (using ONNX Runtime). Written once off the executor thread during init, read
    // (as a boolean gate) on the recording thread -- volatile so that read sees the write.
    private ai.onnxruntime.OrtSession vadSession;
    private ai.onnxruntime.OrtEnvironment ortEnvironment;
    private volatile boolean vadInitialized = false;
    // Silero v5+ is stateful: the "state" output of each inference call must be fed back in as
    // the next call's "state" input. Recreated on every startRecording() so a previous session's
    // state never leaks into a new one. Shape per snakers4/silero-vad's v5 export: [2, 1, 128].
    private float[] vadState = new float[2 * 1 * 128];

    public VoiceAudioModule(ReactApplicationContext reactContext) {
        super(reactContext);
        // onHostDestroy() is a LifecycleEventListener callback -- without registering here, the
        // framework never calls it and the recording-thread shutdown below it never runs.
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
                // Without this, the native handle and its buffer stayed allocated and
                // audioRecord kept the dead reference -- every failed start leaked one.
                audioRecord.release();
                audioRecord = null;
                promise.reject("AUDIO_RECORD_ERROR", "Failed to initialize AudioRecord");
                return;
            }

            audioRecord.startRecording();
            isRecording = true;
            speechBuffer.clear();
            inSpeech = false;
            speechFrameCount = 0;
            silenceFrameCount = 0;
            java.util.Arrays.fill(vadState, 0f);

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
        // Only signal shutdown and wait here -- recordingLoop() itself owns releasing
        // audioRecord and emitting the final segment once it actually exits. The previous
        // version raced: it called audioRecord.release() and set audioRecord = null right after
        // a join(1000) that could time out while the loop was still running, so the loop could
        // then call read() on an already-released AudioRecord (native crash / ISE), and it read
        // speechBuffer here while the loop could still be appending to it
        // (ConcurrentModificationException or a half-written segment).
        isRecording = false;

        if (recordingThread != null) {
            try {
                // No timeout: the loop's read() calls return roughly every 32ms, so once
                // isRecording flips false the loop exits almost immediately in practice. A
                // bounded join here is exactly what let stop race ahead of real cleanup before.
                recordingThread.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            recordingThread = null;
        }

        promise.resolve(true);
    }

    private void recordingLoop() {
        short[] buffer = new short[512]; // 32ms frames at 16kHz

        while (isRecording && audioRecord != null) {
            int read = audioRecord.read(buffer, 0, buffer.length);

            if (read > 0) {
                float speechProb = vadInitialized ? runVAD(buffer, read) : -1f;
                // -1 means "no VAD model available" (see runVAD), not "the model said silence" --
                // treating it as speechProb 0.5f against a 0.5f default threshold meant
                // `0.5 > 0.5` was always false, so voice capture silently detected no speech at
                // all on any device where the model failed to load or wasn't bundled. Fall back
                // to a simple RMS-energy gate instead, which at least reacts to real audio.
                boolean isSpeech = speechProb >= 0f
                    ? speechProb > vadThreshold
                    : calculateVolume(buffer, read) > RMS_FALLBACK_SPEECH_THRESHOLD;

                if (isSpeech) {
                    if (!inSpeech) {
                        inSpeech = true;
                        speechFrameCount = 0;
                        silenceFrameCount = 0;
                    }
                    speechFrameCount++;
                    silenceFrameCount = 0;
                    short[] frameCopy = new short[read];
                    System.arraycopy(buffer, 0, frameCopy, 0, read);
                    speechBuffer.add(frameCopy);

                    // Enforce maxSpeechDurationMs here, not only in the silence branch below --
                    // continuous speech with no silence frame never reached this check before,
                    // so speechBuffer grew without bound for as long as the user kept talking.
                    if (speechFrameCount >= maxSpeechFrames) {
                        emitSpeechSegment(speechBuffer, false);
                        speechBuffer.clear();
                        inSpeech = false;
                        speechFrameCount = 0;
                        silenceFrameCount = 0;
                    }
                } else {
                    if (inSpeech) {
                        silenceFrameCount++;
                        short[] frameCopy = new short[read];
                        System.arraycopy(buffer, 0, frameCopy, 0, read);
                        speechBuffer.add(frameCopy);

                        if (silenceFrameCount >= silenceFrames) {
                            // minSpeechFrames was previously assigned by setVADConfig but never
                            // read anywhere, so a single-frame noise blip could still trigger a
                            // full transcription request. Discard segments shorter than the
                            // configured minimum instead of emitting them.
                            if (speechFrameCount >= minSpeechFrames) {
                                emitSpeechSegment(speechBuffer, true);
                            }
                            speechBuffer.clear();
                            inSpeech = false;
                            speechFrameCount = 0;
                            silenceFrameCount = 0;
                        }
                    }
                }

                emitVolumeThrottled(calculateVolume(buffer, read));
            }
        }

        // Loop has exited (isRecording flipped false, or audioRecord went away under us) --
        // this thread is the sole owner of the AudioRecord and speechBuffer past this point, so
        // both can be handled here without racing stopRecording()/onHostDestroy() on the bridge
        // thread.
        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
            } catch (Exception e) {
                Log.e(TAG, "Error stopping audio record: " + e.getMessage());
            }
            audioRecord = null;
        }
        if (!speechBuffer.isEmpty() && speechFrameCount >= minSpeechFrames) {
            emitSpeechSegment(speechBuffer, true);
        }
        speechBuffer.clear();
    }

    // Used only when vadInitialized is false (model missing/failed to load) -- see the fallback
    // comment in recordingLoop. Not a substitute for real VAD, just enough to avoid the voice
    // pipeline going completely silent-and-broken with no error surfaced.
    private static final float RMS_FALLBACK_SPEECH_THRESHOLD = 0.02f;

    /**
     * Runs Silero VAD (v5+ single-state export: inputs "input" [1, N], "state" [2,1,128],
     * "sr" [1] int64; outputs "output" [1,1], "stateN" [2,1,128]) on one frame. Returns the
     * speech probability in [0,1], or a negative value if VAD is unavailable or inference fails
     * -- callers must check for that rather than treating a negative return as "not speech".
     *
     * The exact input/output node names and state shape are asserted from Silero's own v5 ONNX
     * export docs, not verified against a bundled model file: this repo does not currently ship
     * a silero_vad.onnx asset (see initVAD/copyAssetToFile), so there is nothing to test this
     * against yet. If the model that eventually gets bundled is a v4 export instead, it uses
     * separate "h"/"c" state inputs rather than one "state" input -- check session.getInputInfo()
     * against the real file before assuming this is correct as shipped.
     */
    private float runVAD(short[] audioData, int length) {
        if (!vadInitialized || vadSession == null || ortEnvironment == null) return -1f;

        try {
            float[] input = new float[length];
            for (int i = 0; i < length; i++) {
                input[i] = audioData[i] / 32768.0f;
            }

            try (
                ai.onnxruntime.OnnxTensor inputTensor = ai.onnxruntime.OnnxTensor.createTensor(
                    ortEnvironment, java.nio.FloatBuffer.wrap(input), new long[]{1, length});
                ai.onnxruntime.OnnxTensor stateTensor = ai.onnxruntime.OnnxTensor.createTensor(
                    ortEnvironment, java.nio.FloatBuffer.wrap(vadState), new long[]{2, 1, 128});
                ai.onnxruntime.OnnxTensor srTensor = ai.onnxruntime.OnnxTensor.createTensor(
                    ortEnvironment, java.nio.LongBuffer.wrap(new long[]{sampleRate}), new long[]{1});
            ) {
                java.util.Map<String, ai.onnxruntime.OnnxTensor> inputs = new java.util.HashMap<>();
                inputs.put("input", inputTensor);
                inputs.put("state", stateTensor);
                inputs.put("sr", srTensor);

                try (ai.onnxruntime.OrtSession.Result result = vadSession.run(inputs)) {
                    java.util.Optional<ai.onnxruntime.OnnxValue> stateOut = result.get("stateN");
                    if (stateOut.isPresent()) {
                        Object stateValue = stateOut.get().getValue();
                        if (stateValue instanceof float[][][]) {
                            float[][][] s = (float[][][]) stateValue;
                            int idx = 0;
                            for (float[][] a : s) for (float[] b : a) for (float v : b) vadState[idx++] = v;
                        }
                    }

                    java.util.Optional<ai.onnxruntime.OnnxValue> speechOut = result.get("output");
                    if (speechOut.isPresent()) {
                        Object value = speechOut.get().getValue();
                        if (value instanceof float[][]) {
                            float[][] out = (float[][]) value;
                            if (out.length > 0 && out[0].length > 0) return out[0][0];
                        }
                    }
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "VAD inference error: " + e.getMessage());
        }
        return -1f;
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

        String base64Audio = android.util.Base64.encodeToString(audioBytes, android.util.Base64.NO_WRAP);

        // WritableMap's put* methods return void, not a chainable builder -- each call must be
        // its own statement.
        WritableMap event = Arguments.createMap();
        event.putString("audioBase64", base64Audio);
        // isFinal now reflects the caller's actual distinction (silence-ended vs max-duration
        // cut) instead of being hardcoded true, which reported every max-duration cut as a
        // complete utterance.
        event.putBoolean("isFinal", isFinal);

        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("onSpeechSegment", event);
    }

    // recordingLoop() calls this once per 32ms frame, i.e. ~31 times/sec for the whole recording
    // session -- emit every Nth frame instead of flooding the bridge with an event per frame.
    private int volumeFrameCounter = 0;
    private static final int VOLUME_EMIT_EVERY_N_FRAMES = 3; // ~10 updates/sec

    private void emitVolumeThrottled(float volume) {
        volumeFrameCounter++;
        if (volumeFrameCounter < VOLUME_EMIT_EVERY_N_FRAMES) return;
        volumeFrameCounter = 0;
        WritableMap event = Arguments.createMap();
        event.putDouble("volume", volume);
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit("onVolumeChange", event);
    }

    @ReactMethod
    public void setVADThreshold(float threshold, Promise promise) {
        vadThreshold = Math.max(0.0f, Math.min(1.0f, threshold));
        promise.resolve(true);
    }

    @ReactMethod
    public void setVADConfig(int minSpeechMs, int maxSpeechMs, int silenceMs, Promise promise) {
        // Clamp to a minimum of 1 frame: an *Ms value below 32 (one frame) previously produced 0,
        // which for silenceFrames meant a segment ended on the very first silence frame.
        minSpeechFrames = Math.max(1, minSpeechMs / 32);
        maxSpeechFrames = Math.max(1, maxSpeechMs / 32);
        silenceFrames = Math.max(1, silenceMs / 32);
        promise.resolve(true);
    }

    @Override
    public void onHostResume() {}

    @Override
    public void onHostPause() {}

    @Override
    public void onHostDestroy() {
        // Signal and wait the same way stopRecording() does -- recordingLoop() releases
        // audioRecord itself once it exits, so this must not also release it (see the comment on
        // stopRecording()).
        isRecording = false;
        if (recordingThread != null) {
            try {
                recordingThread.join();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            recordingThread = null;
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