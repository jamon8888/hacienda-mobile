#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VectorBox, NSObject)

RCT_EXTERN_METHOD(insert:(NSArray *)embedding
                  metadata:(NSString *)metadata
                  workspaceSlug:(NSString *)workspaceSlug
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(bulkInsert:(NSArray *)embeddings
                  metadatas:(NSArray *)metadatas
                  workspaceSlug:(NSString *)workspaceSlug
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(search:(NSArray *)embedding
                  workspaceSlug:(NSString *)workspaceSlug
                  limit:(NSInteger)limit
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(delete:(NSInteger)id
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deleteByWorkspace:(NSString *)workspaceSlug
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
