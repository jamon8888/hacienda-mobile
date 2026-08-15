#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(AudioDecoderModule, NSObject)

RCT_EXTERN_METHOD(decodeToPCM16:(NSString *)filePath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
