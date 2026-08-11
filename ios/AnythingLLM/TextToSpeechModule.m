#import "TextToSpeechModule.h"
#import <AVFoundation/AVFoundation.h>

@implementation TextToSpeechModule

RCT_EXPORT_MODULE(TextToSpeechModule);

- (instancetype)init {
    self = [super init];
    if (self) {
        _synthesizer = [[AVSpeechSynthesizer alloc] init];
        _synthesizer.delegate = self;
        _currentUtterance = nil;
    }
    return self;
}

RCT_EXPORT_METHOD(speak:(NSString *)text
                language:(NSString *)language
                rate:(float)rate
                pitch:(float)pitch
                volume:(float)volume
                voice:(NSString *)voiceIdentifier
                resolver:(RCTPromiseResolveBlock)resolve
                rejecter:(RCTPromiseRejectBlock)reject)
{
    if (!text || text.length == 0) {
        reject(@"EMPTY_TEXT", @"Text cannot be empty", nil);
        return;
    }
    
    // Stop any current speech
    [_synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    
    AVSpeechUtterance *utterance = [AVSpeechUtterance speechUtteranceWithString:text];
    utterance.rate = rate * AVSpeechUtteranceDefaultSpeechRate;
    utterance.pitchMultiplier = pitch;
    utterance.volume = volume;
    
    if (language && language.length > 0) {
        utterance.voice = [AVSpeechSynthesisVoice voiceWithLanguage:language];
    }
    
    if (voiceIdentifier && voiceIdentifier.length > 0) {
        AVSpeechSynthesisVoice *voice = [AVSpeechSynthesisVoice voiceWithIdentifier:voiceIdentifier];
        if (voice) {
            utterance.voice = voice;
        }
    }
    
    _currentUtterance = utterance;
    _resolveBlock = [resolve copy];
    _rejectBlock = [reject copy];
    
    [_synthesizer speakUtterance:utterance];
}

RCT_EXPORT_METHOD(stop:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [_synthesizer stopSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    _currentUtterance = nil;
    resolve(@YES);
}

RCT_EXPORT_METHOD(pause:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    [_synthesizer pauseSpeakingAtBoundary:AVSpeechBoundaryImmediate];
    resolve(@YES);
}

RCT_EXPORT_METHOD(getVoices:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    NSArray<AVSpeechSynthesisVoice *> *voices = [AVSpeechSynthesisVoice speechVoices];
    NSMutableArray *result = [NSMutableArray array];
    
    for (AVSpeechSynthesisVoice *voice in voices) {
        [result addObject:@{
            @"identifier": voice.identifier,
            @"name": voice.name,
            @"language": voice.language,
            @"quality": @(voice.quality)
        }];
    }
    
    resolve(result);
}

RCT_EXPORT_METHOD(setVoice:(NSString *)voiceIdentifier
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    // Voice is set per utterance in speak method
    resolve(@YES);
}

// AVSpeechSynthesizerDelegate
- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didStartSpeechUtterance:(AVSpeechUtterance *)utterance {
    [self sendEventWithName:@"onTTSStart" body:@{@"text": utterance.speechString}];
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didFinishSpeechUtterance:(AVSpeechUtterance *)utterance {
    if (_resolveBlock) {
        _resolveBlock(@YES);
        _resolveBlock = nil;
        _rejectBlock = nil;
    }
    [self sendEventWithName:@"onTTSFinish" body:@{@"text": utterance.speechString}];
}

- (void)speechSynthesizer:(AVSpeechSynthesizer *)synthesizer didCancelSpeechUtterance:(AVSpeechUtterance *)utterance {
    if (_rejectBlock) {
        _rejectBlock(@"TTS_CANCELLED", @"Speech cancelled", nil);
        _resolveBlock = nil;
        _rejectBlock = nil;
    }
    [self sendEventWithName:@"onTTSCancel" body:@{@"text": utterance.speechString}];
}

@end