#import "EmbeddingGemmaModule.h"
#import <React/RCTLog.h>

@implementation EmbeddingGemmaModule

RCT_EXPORT_MODULE();

RCT_EXPORT_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES); // Will be implemented in Swift
}

RCT_EXPORT_METHOD(initModel:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@YES); // Will be implemented in Swift
}

RCT_EXPORT_METHOD(embed:(NSString *)text
                  dims:(NSInteger)dims
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@[]); // Will be implemented in Swift
}

RCT_EXPORT_METHOD(embedBatch:(NSArray *)texts
                  dims:(NSInteger)dims
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  resolve(@[]); // Will be implemented in Swift
}

@end
