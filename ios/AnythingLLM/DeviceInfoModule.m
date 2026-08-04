#import "DeviceInfoModule.h"
#import <React/RCTLog.h>

@implementation DeviceInfoModule

RCT_EXPORT_MODULE(DeviceInfoModule);

RCT_EXPORT_METHOD(getCPUInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    NSUInteger numberOfCPUCores = [[NSProcessInfo processInfo] activeProcessorCount];
    NSDictionary *result = @{@"cores": @(numberOfCPUCores)};
    resolve(result);
  } @catch (NSException *exception) {
    reject(@"error_getting_cpu_info", @"Could not retrieve CPU info", nil);
  }
}

// Stub: Returns mock RAM info (real implementation in Phase 2)
RCT_EXPORT_METHOD(getRAMInfo:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    // Mock data: 6GB total, 4GB available (typical for modern iOS devices)
    NSDictionary *result = @{
      @"totalRAM": @"6442450944",       // 6 GB in bytes
      @"availableRAM": @"4294967296",   // 4 GB in bytes
      @"threshold": @"1073741824",      // 1 GB threshold
      @"lowMemory": @(NO)
    };
    resolve(result);
  } @catch (NSException *exception) {
    reject(@"error_getting_ram_info", @"Could not retrieve RAM info", nil);
  }
}

// Stub: Returns mock NPU backend (real implementation in Phase 2)
RCT_EXPORT_METHOD(getNPUBackend:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    // iOS uses Apple Neural Engine (ANE) via CoreML
    // For now return CPU as placeholder - real implementation will detect ANE support
    resolve(@"CPU");
  } @catch (NSException *exception) {
    reject(@"error_getting_npu_backend", @"Could not detect NPU backend", nil);
  }
}

// Stub: Returns mock unified device capabilities (real implementation in Phase 2)
RCT_EXPORT_METHOD(getDeviceCapabilities:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  @try {
    NSUInteger numberOfCPUCores = [[NSProcessInfo processInfo] activeProcessorCount];
    
    NSDictionary *cpuInfo = @{
      @"cores": @(numberOfCPUCores),
      @"features": @[],
      @"hasFp16": @(YES),
      @"hasDotProd": @(YES),
      @"hasSve": @(NO),
      @"hasI8mm": @(NO)
    };
    
    NSDictionary *ramInfo = @{
      @"totalRAM": @"6442450944",
      @"availableRAM": @"4294967296",
      @"threshold": @"1073741824",
      @"lowMemory": @(NO)
    };
    
    NSDictionary *result = @{
      @"cpuInfo": cpuInfo,
      @"ramInfo": ramInfo,
      @"npuBackend": @"CPU",
      @"hasNNAPI": @(NO),
      @"gpuVendor": @"apple"
    };
    
    resolve(result);
  } @catch (NSException *exception) {
    reject(@"error_getting_device_caps", @"Could not retrieve device capabilities", nil);
  }
}

@end
