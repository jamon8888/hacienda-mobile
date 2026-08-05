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
        // onHostDestroy() is a LifecycleEventListener callback -- without registering here, the
        // framework never calls it and the pending-promise/tts.shutdown() cleanup below it is
        // dead code that never runs.
        reactContext.addLifecycleEventListener(this);
        tts = new TextToSpeech(reactContext, this);
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                currentUtteranceId = utteranceId;
                // WritableMap's put* methods return void, not a chainable builder -- each call
                // must be its own statement.
                WritableMap startEvent = Arguments.createMap();
                startEvent.putString("utteranceId", utteranceId);
                emitEvent("onTTSStart", startEvent);
            }

            @Override
            public void onDone(String utteranceId) {
                if (currentPromise != null) {
                    currentPromise.resolve(true);
                    currentPromise = null;
                }
                WritableMap finishEvent = Arguments.createMap();
                finishEvent.putString("utteranceId", utteranceId);
                emitEvent("onTTSFinish", finishEvent);
            }

            @Override
            public void onError(String utteranceId) {
                // Only the 1-arg overload is abstract on UtteranceProgressListener; the 2-arg
                // overload below (which carries the actual error code) has a no-op default
                // implementation and is never invoked unless explicitly overridden too.
                onError(utteranceId, -1);
            }

            @Override
            public void onError(String utteranceId, int error) {
                if (currentPromise != null) {
                    currentPromise.reject("TTS_ERROR", "TTS error: " + error);
                    currentPromise = null;
                }
                WritableMap errorEvent = Arguments.createMap();
                errorEvent.putString("utteranceId", utteranceId);
                errorEvent.putInt("error", error);
                emitEvent("onTTSError", errorEvent);
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

    /**
     * Settles and clears whatever promise is currently pending, if any. Called before replacing
     * currentPromise with a new one: tts.stop() does not reliably deliver onDone/onError for the
     * utterance it flushed, so without this a second speak() call (or stop()/onHostDestroy while
     * one is in flight) abandoned the earlier promise and left its JS `await` hanging forever.
     */
    private void settlePendingPromise(String code, String message) {
        if (currentPromise != null) {
            currentPromise.reject(code, message);
            currentPromise = null;
        }
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
        settlePendingPromise("TTS_INTERRUPTED", "Superseded by a new speak request");

        currentPromise = promise;
        currentUtteranceId = "tts_" + System.currentTimeMillis();

        // The 3-arg speak(text, queueMode, HashMap<String,String>) overload this used to call is
        // deprecated since API 21, and it has no volume parameter -- TextToSpeech never had a
        // setVolume(float) method at all, so that call was always a silent no-op. The modern
        // 4-arg overload takes a Bundle and carries volume through Engine.KEY_PARAM_VOLUME.
        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, currentUtteranceId);

        // `options` arrives non-null on every path this app itself calls (NativeTTS.speak always
        // fills every field with a default before crossing the bridge), but this is a public
        // native-module boundary, so guard it anyway rather than trust every future caller to.
        boolean hasOptions = options != null;
        float rate = hasOptions && options.hasKey("rate") ? (float) options.getDouble("rate") : 1.0f;
        float pitch = hasOptions && options.hasKey("pitch") ? (float) options.getDouble("pitch") : 1.0f;
        float volume = hasOptions && options.hasKey("volume") ? (float) options.getDouble("volume") : 1.0f;

        tts.setSpeechRate(rate);
        tts.setPitch(pitch);
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, volume);

        String language = hasOptions && options.hasKey("language") ? options.getString("language") : null;
        if (language == null) language = "en-US";
        String[] langParts = language.split("-");
        Locale locale;
        if (langParts.length >= 2) {
            locale = new Locale(langParts[0], langParts[1]);
        } else {
            locale = new Locale(language);
        }

        // setLanguage before setVoice: TextToSpeech.setLanguage() selects that locale's default
        // voice as a side effect, so calling it after setVoice silently discards whatever voice
        // was just requested.
        tts.setLanguage(locale);

        String voice = hasOptions && options.hasKey("voice") ? options.getString("voice") : null;
        if (voice != null) {
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

        int result = tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, currentUtteranceId);
        if (result != TextToSpeech.SUCCESS) {
            promise.reject("TTS_SPEAK_ERROR", "Failed to speak: " + result);
            currentPromise = null;
        }
    }

    @ReactMethod
    public void stop(Promise promise) {
        tts.stop();
        // Unlike settlePendingPromise (used where a new request supersedes an old one), an
        // explicit stop() resolves the interrupted speak's promise successfully on purpose --
        // this is user-initiated, not an error, and wasn't flagged as wrong. Keep that.
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

        for (Voice voice : voices) {
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
    public void onHostResume() {}

    @Override
    public void onHostPause() {}

    @Override
    public void onHostDestroy() {
        settlePendingPromise("TTS_HOST_DESTROYED", "Host was destroyed while speech was in progress");
        if (tts != null) {
            tts.shutdown();
        }
    }
}