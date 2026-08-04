package com.anythingllm.voice;

import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.HashMap;
import java.util.Locale;
import java.util.Set;

public class TextToSpeechModule extends ReactContextBaseJavaModule implements TextToSpeech.OnInitListener {
    private static final String TAG = "TextToSpeechModule";
    
    private TextToSpeech tts;
    private Promise currentPromise;
    private boolean isInitialized = false;
    private String currentUtteranceId;

    public TextToSpeechModule(ReactApplicationContext reactContext) {
        super(reactContext);
        tts = new TextToSpeech(reactContext, this);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                currentUtteranceId = utteranceId;
                emitEvent("onTTSStart", Arguments.createMap().putString("utteranceId", utteranceId));
            }

            @Override
            public void onDone(String utteranceId) {
                if (currentPromise != null) {
                    currentPromise.resolve(true);
                    currentPromise = null;
                }
                emitEvent("onTTSFinish", Arguments.createMap().putString("utteranceId", utteranceId));
            }

            @Override
            public void onError(String utteranceId, int error) {
                if (currentPromise != null) {
                    currentPromise.reject("TTS_ERROR", "TTS error: " + error);
                    currentPromise = null;
                }
                emitEvent("onTTSError", Arguments.createMap()
                    .putString("utteranceId", utteranceId)
                    .putInt("error", error));
            }
        });
    }

    @Override
    public String getName() {
        return "TextToSpeechModule";
    }

    @Override
    public void onInit(int status) {
        isInitialized = (status == TextToSpeech.SUCCESS);
    }

    @ReactMethod
    public void speak(String text, ReadableMap options, Promise promise) {
        if (!isInitialized) {
            promise.reject("TTS_NOT_READY", "TTS not initialized");
            return;
        }
        
        if (text == null || text.isEmpty()) {
            promise.reject("EMPTY_TEXT", "Text cannot be empty");
            return;
        }

        // Stop any current speech
        tts.stop();
        
        currentPromise = promise;
        currentUtteranceId = "tts_" + System.currentTimeMillis();
        
        HashMap<String, String> params = new HashMap<>();
        params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, currentUtteranceId);
        
        float rate = options.hasKey("rate") ? (float) options.getDouble("rate") : 1.0f;
        float pitch = options.hasKey("pitch") ? (float) options.getDouble("pitch") : 1.0f;
        float volume = options.hasKey("volume") ? (float) options.getDouble("volume") : 1.0f;
        
        tts.setSpeechRate(rate);
        tts.setPitch(pitch);
        tts.setVolume(volume);
        
        String language = options.hasKey("language") ? options.getString("language") : "en-US";
        String[] langParts = language.split("-");
        Locale locale;
        if (langParts.length >= 2) {
            locale = new Locale(langParts[0], langParts[1]);
        } else {
            locale = new Locale(language);
        }
        
        String voice = options.hasKey("voice") ? options.getString("voice") : null;
        if (voice != null) {
            // Try to set specific voice
            Set<TextToSpeech.Voice> voices = tts.getVoices();
            for (TextToSpeech.Voice v : voices) {
                if (v.getName().equals(voice)) {
                    tts.setVoice(v);
                    break;
                }
            }
        }
        
        tts.setLanguage(locale);
        
        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, currentUtteranceId);
        if (result != TextToSpeech.SUCCESS) {
            promise.reject("TTS_SPEAK_ERROR", "Failed to speak: " + result);
            currentPromise = null;
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        tts.stop();
        if (currentPromise != null) {
            currentPromise.resolve(true);
            currentPromise = null;
        }
        promise.resolve(true);
    }

    @ReactMethod
    public void pause(Promise promise) {
        // Android TTS doesn't support pause directly, stop instead
        tts.stop();
        promise.resolve(true);
    }

    @ReactMethod
    public void getVoices(Promise promise) {
        if (!isInitialized) {
            promise.reject("TTS_NOT_READY", "TTS not initialized");
            return;
        }
        
        Set<TextToSpeech.Voice> voices = tts.getVoices();
        WritableArray result = Arguments.createArray();
        
        for (TextToSpeech.Voice voice : voices) {
            WritableMap voiceMap = Arguments.createMap();
            voiceMap.putString("identifier", voice.getName());
            voiceMap.putString("name", voice.getName());
            voiceMap.putString("language", voice.getLocale().toString());
            voiceMap.putInt("quality", voice.getQuality());
            result.pushMap(voiceMap);
        }
        
        promise.resolve(result);
    }

    @ReactMethod
    public void setVoice(String voiceId, Promise promise) {
        // Voice is set per utterance in speak method
        promise.resolve(true);
    }

    private void emitEvent(String eventName, WritableMap params) {
        getReactApplicationContext()
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
            .emit(eventName, params);
    }

    @Override
    public void onHostDestroy() {
        super.onHostDestroy();
        if (tts != null) {
            tts.shutdown();
        }
    }
}