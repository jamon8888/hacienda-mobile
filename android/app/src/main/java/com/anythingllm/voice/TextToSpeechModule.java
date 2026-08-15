package com.anythingllm.voice;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Log;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.util.Locale;
import java.util.Set;

public class TextToSpeechModule extends ReactContextBaseJavaModule
        implements TextToSpeech.OnInitListener, LifecycleEventListener {
    private static final String TAG = "TextToSpeechModule";

    private TextToSpeech tts;
    private Promise currentPromise;
    private boolean isInitialized = false;
    private String currentUtteranceId;

    public TextToSpeechModule(ReactApplicationContext reactContext) {
        super(reactContext);
        reactContext.addLifecycleEventListener(this);
        tts = new TextToSpeech(reactContext, this);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                currentUtteranceId = utteranceId;
                WritableMap params = Arguments.createMap();
                params.putString("utteranceId", utteranceId);
                emitEvent("onTTSStart", params);
            }

            @Override
            public void onDone(String utteranceId) {
                if (currentPromise != null) {
                    currentPromise.resolve(true);
                    currentPromise = null;
                }
                WritableMap params = Arguments.createMap();
                params.putString("utteranceId", utteranceId);
                emitEvent("onTTSFinish", params);
            }

            @Override
            public void onError(String utteranceId) {
                if (currentPromise != null) {
                    currentPromise.reject("TTS_ERROR", "TTS error");
                    currentPromise = null;
                }
                WritableMap params = Arguments.createMap();
                params.putString("utteranceId", utteranceId);
                emitEvent("onTTSError", params);
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

        float rate = options.hasKey("rate") ? (float) options.getDouble("rate") : 1.0f;
        float pitch = options.hasKey("pitch") ? (float) options.getDouble("pitch") : 1.0f;
        float volume = options.hasKey("volume") ? (float) options.getDouble("volume") : 1.0f;

        tts.setSpeechRate(rate);
        tts.setPitch(pitch);

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
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                for (Voice v : voices) {
                    if (v.getName().equals(voice)) {
                        tts.setVoice(v);
                        break;
                    }
                }
            }
        }

        tts.setLanguage(locale);

        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, currentUtteranceId);
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);

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

        Set<Voice> voices = tts.getVoices();
        WritableArray result = Arguments.createArray();

        if (voices != null) {
            for (Voice voice : voices) {
                WritableMap voiceMap = Arguments.createMap();
                voiceMap.putString("identifier", voice.getName());
                voiceMap.putString("name", voice.getName());
                voiceMap.putString("language", voice.getLocale().toString());
                voiceMap.putInt("quality", voice.getQuality());
                result.pushMap(voiceMap);
            }
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
    public void onHostResume() {
    }

    @Override
    public void onHostPause() {
    }

    @Override
    public void onHostDestroy() {
        if (tts != null) {
            tts.shutdown();
        }
    }
}
