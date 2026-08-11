#import "VoiceAudioModule.h"
#import <React/RCTLog.h>
#import <AVFoundation/AVFoundation.h>
#import <Accelerate/Accelerate.h>

@implementation VoiceAudioModule

RCT_EXPORT_MODULE(VoiceAudioModule);

- (instancetype)init {
    self = [super init];
    if (self) {
        _sampleRate = 16000;
        _frameSize = 512; // 32ms at 16kHz
        _vadThreshold = 0.5f;
        _minSpeechFrames = 10; // ~300ms
        _maxSpeechFrames = 1000; // ~30s
        _silenceFrames = 25; // ~800ms
        _inSpeech = NO;
        _speechFrameCount = 0;
        _silenceFrameCount = 0;
        _speechBuffer = [NSMutableArray array];
        _audioEngine = [[AVAudioEngine alloc] init];
        _inputNode = _audioEngine.inputNode;
    }
    return self;
}

RCT_EXPORT_METHOD(startRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    if (_isRecording) {
        resolve(@YES); // no-op if already recording
        return;
    }
    
    NSError *error = nil;
    
    // Configure audio session
    AVAudioSession *session = [AVAudioSession sharedInstance];
    [session setCategory:AVAudioSessionCategoryPlayAndRecord
                 mode:AVAudioSessionModeMeasurement
              options:AVAudioSessionCategoryOptionAllowBluetooth | AVAudioSessionCategoryOptionAllowBluetoothA2DP
                error:&error];
    if (error) {
        reject(@"AUDIO_SESSION_ERROR", [error localizedDescription], nil);
        return;
    }
    
    [session setPreferredSampleRate:_sampleRate error:&error];
    [session setPreferredIOBufferDuration:_frameSize / (double)_sampleRate error:&error];
    [session setActive:YES error:&error];
    if (error) {
        reject(@"AUDIO_SESSION_ERROR", [error localizedDescription], nil);
        return;
    }
    
    // Remove existing tap
    [_inputNode removeTapOnBus:0];
    
    // Install tap
    AVAudioFormat *format = [_inputNode inputFormatForBus:0];
    [_inputNode installTapOnBus:0
                      bufferSize:_frameSize
                          format:format
                         block:^(AVAudioPCMBuffer * _Nonnull buffer, AVAudioTime * _Nonnull when) {
        [self processAudioBuffer:buffer];
    }];
    
    _isRecording = YES;
    [_speechBuffer removeAllObjects];
    _inSpeech = NO;
    _speechFrameCount = 0;
    _silenceFrameCount = 0;
    
    [self.audioEngine prepare];
    [_audioEngine startAndReturnError:&error];
    if (error) {
        reject(@"AUDIO_ENGINE_ERROR", [error localizedDescription], nil);
        return;
    }
    
    resolve(@YES);
}

RCT_EXPORT_METHOD(stopRecording:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    _isRecording = NO;
    
    _audioEngine.stop();
    [_inputNode removeTapOnBus:0];
    
    // Emit final speech segment if any
    if (_speechBuffer.count > 0) {
        [self emitSpeechSegment:YES];
    }
    
    resolve(@YES);
}

- (void)processAudioBuffer:(AVAudioPCMBuffer *)buffer {
    if (!_isRecording) return;
    
    // Get float channel data
    float *channelData = buffer.floatChannelData[0];
    int frameLength = buffer.frameLength;
    
    // Calculate volume (RMS)
    float sum = 0;
    vDSP_measqv(channelData, 1, &sum, frameLength);
    float rms = sqrtf(sum / frameLength);
    float volume = rms; // Already normalized for float audio
    
    // Emit volume
    [self emitVolume:volume];
    
    // Simple energy-based VAD (placeholder for Silero VAD)
    // In production, use ONNX Runtime with Silero VAD model
    float energy = rms * rms;
    float speechProb = energy > 0.001 ? 0.8f : 0.1f; // Simple threshold
    
    BOOL isSpeech = speechProb > _vadThreshold;
    
    if (isSpeech) {
        if (!_inSpeech) {
            _inSpeech = YES;
            _speechFrameCount = 0;
            _silenceFrameCount = 0;
        }
        _speechFrameCount++;
        _silenceFrameCount = 0;
        
        // Store frame
        float *frameCopy = malloc(frameLength * sizeof(float));
        memcpy(frameCopy, channelData, frameLength * sizeof(float));
        [_speechBuffer addObject:[NSData dataWithBytes:frameCopy length:frameLength * sizeof(float)]];
        free(frameCopy);
    } else {
        if (_inSpeech) {
            _silenceFrameCount++;
            // Store some silence for context
            float *frameCopy = malloc(frameLength * sizeof(float));
            memcpy(frameCopy, channelData, frameLength * sizeof(float));
            [_speechBuffer addObject:[NSData dataWithBytes:frameCopy length:frameLength * sizeof(float)]];
            free(frameCopy);
            
            // Check for end of speech
            if (_silenceFrameCount >= _silenceFrames || _speechFrameCount >= _maxSpeechFrames) {
                BOOL isFinal = _speechFrameCount >= _maxSpeechFrames;
                [self emitSpeechSegment:isFinal];
                
                // Reset for next segment
                [_speechBuffer removeAllObjects];
                _inSpeech = NO;
                _speechFrameCount = 0;
                _silenceFrameCount = 0;
            }
        }
    }
}

- (void)emitSpeechSegment:(BOOL)isFinal {
    if (_speechBuffer.count == 0) return;
    
    // Calculate total size
    size_t totalSamples = 0;
    for (NSData *frameData in _speechBuffer) {
        totalSamples += frameData.length / sizeof(float);
    }
    
    // Combine all frames
    size_t totalBytes = totalSamples * sizeof(float);
    NSMutableData *combinedData = [NSMutableData dataWithLength:totalBytes];
    float *dest = (float *)combinedData.mutableBytes;
    size_t offset = 0;
    
    for (NSData *frameData in _speechBuffer) {
        size_t frameSamples = frameData.length / sizeof(float);
        memcpy(dest + offset, frameData.bytes, frameData.length);
        offset += frameSamples;
    }
    
    // Convert to base64
    NSString *base64Audio = [combinedData base64EncodedStringWithOptions:0];
    
    // Emit event
    NSDictionary *eventData = @{
        @"audioBase64": base64Audio,
        @"isFinal": @(YES)
    };
    [[RCTDeviceEventEmitter sharedInstance] emit:@"onSpeechSegment" eventData];
}

- (void)emitVolume:(float)volume {
    NSDictionary *eventData = @{
        @"volume": @(volume)
    };
    [[RCTDeviceEventEmitter sharedInstance] emit:@"onVolumeChange" eventData];
}

RCT_EXPORT_METHOD(setVADThreshold:(float)threshold
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    _vadThreshold = MAX(0.0f, MIN(1.0f, threshold));
    resolve(@YES);
}

RCT_EXPORT_METHOD(setVADConfig:(int)minSpeechMs
                  maxSpeechMs:(int)maxSpeechMs
                  silenceMs:(int)silenceMs
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    _minSpeechFrames = minSpeechMs / 32; // 32ms per frame
    _maxSpeechFrames = maxSpeechMs / 32;
    _silenceFrames = silenceMs / 32;
    resolve(@YES);
}

@end