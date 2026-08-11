#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(XbergModule, NSObject)

RCT_EXTERN_METHOD(extract:(NSString *)filePath
                  configJson:(NSString *)configJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(extractBatch:(NSArray *)filePaths
                  configJson:(NSString *)configJson
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSupportedFormats:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(transcribeAudio:(NSString *)filePath
                  model:(NSString *)model
                  language:(NSString *)language
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
