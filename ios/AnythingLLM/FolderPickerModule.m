#import "FolderPickerModule.h"
#import <React/RCTUtils.h>
#import <UIKit/UIKit.h>
#import <UniformTypeIdentifiers/UniformTypeIdentifiers.h>

// react-native-document-picker's pickDirectory() unconditionally rejects on iOS — the library
// never wired UIDocumentPickerViewController's folder-picking mode (available since iOS 14) to
// its iOS side. This module implements that missing path directly: it presents the system
// document picker restricted to UTTypeFolder, then recursively copies the picked folder's
// contents out of its security-scoped location into the app's tmp directory so the JS side can
// walk it with a plain RNFS.readDir the same way it already does for the Android tree.
// Callers are responsible for deleting the returned tmp folder once the import finishes.

@interface FolderPickerModule () <UIDocumentPickerDelegate>
@end

@implementation FolderPickerModule {
    RCTPromiseResolveBlock _resolve;
    RCTPromiseRejectBlock _reject;
}

RCT_EXPORT_MODULE(FolderPickerModule);

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

RCT_EXPORT_METHOD(pickDirectory:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_main_queue(), ^{
        if (self->_resolve != nil) {
            reject(@"PICKER_BUSY", @"A folder picker is already active", nil);
            return;
        }
        self->_resolve = resolve;
        self->_reject = reject;

        if (@available(iOS 14.0, *)) {
            UIDocumentPickerViewController *picker =
                [[UIDocumentPickerViewController alloc] initForOpeningContentTypes:@[ UTTypeFolder ]];
            picker.delegate = self;
            picker.allowsMultipleSelection = NO;

            UIViewController *rootVC = RCTPresentedViewController();
            if (rootVC == nil) {
                [self finishWithPath:nil code:@"NO_ROOT_VC" message:@"Could not find a view controller to present the picker"];
                return;
            }
            [rootVC presentViewController:picker animated:YES completion:nil];
        } else {
            [self finishWithPath:nil code:@"UNSUPPORTED_OS" message:@"Folder import requires iOS 14 or later"];
        }
    });
}

#pragma mark - UIDocumentPickerDelegate

- (void)documentPicker:(UIDocumentPickerViewController *)controller didPickDocumentsAtURLs:(NSArray<NSURL *> *)urls
{
    NSURL *folderURL = urls.firstObject;
    if (folderURL == nil) {
        [self finishWithPath:nil code:@"NO_SELECTION" message:@"No folder selected"];
        return;
    }

    dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        BOOL didStartAccessing = [folderURL startAccessingSecurityScopedResource];
        NSError *copyError = nil;
        NSString *destPath = [self copyFolderContentsFromURL:folderURL error:&copyError];
        if (didStartAccessing) {
            [folderURL stopAccessingSecurityScopedResource];
        }
        dispatch_async(dispatch_get_main_queue(), ^{
            if (destPath != nil) {
                [self finishWithPath:destPath code:nil message:nil];
            } else {
                [self finishWithPath:nil code:@"COPY_FAILED" message:copyError.localizedDescription ?: @"Failed to copy folder contents"];
            }
        });
    });
}

- (void)documentPickerWasCancelled:(UIDocumentPickerViewController *)controller
{
    [self finishWithPath:nil code:@"CANCELLED" message:@"User cancelled the folder picker"];
}

#pragma mark - Internals

- (nullable NSString *)copyFolderContentsFromURL:(NSURL *)sourceURL error:(NSError **)error
{
    NSFileManager *fm = [NSFileManager defaultManager];
    NSString *destRoot = [NSTemporaryDirectory()
        stringByAppendingPathComponent:[@"folder-import-" stringByAppendingString:[[NSUUID UUID] UUIDString]]];
    if (![fm createDirectoryAtPath:destRoot withIntermediateDirectories:YES attributes:nil error:error]) {
        return nil;
    }

    NSDirectoryEnumerator<NSURL *> *enumerator =
        [fm enumeratorAtURL:sourceURL
 includingPropertiesForKeys:@[ NSURLIsRegularFileKey ]
                    options:NSDirectoryEnumerationSkipsHiddenFiles
               errorHandler:nil];

    NSUInteger sourcePathLength = sourceURL.path.length;
    for (NSURL *fileURL in enumerator) {
        NSNumber *isRegularFile = nil;
        [fileURL getResourceValue:&isRegularFile forKey:NSURLIsRegularFileKey error:nil];
        if (![isRegularFile boolValue]) {
            continue;
        }

        NSString *relativePath = [fileURL.path substringFromIndex:sourcePathLength];
        NSString *destFilePath = [destRoot stringByAppendingPathComponent:relativePath];
        NSString *destDir = [destFilePath stringByDeletingLastPathComponent];
        [fm createDirectoryAtPath:destDir withIntermediateDirectories:YES attributes:nil error:nil];
        // Best-effort per file: one unreadable/locked file shouldn't fail the whole import.
        [fm copyItemAtPath:fileURL.path toPath:destFilePath error:nil];
    }

    return destRoot;
}

- (void)finishWithPath:(nullable NSString *)path code:(nullable NSString *)code message:(nullable NSString *)message
{
    RCTPromiseResolveBlock resolve = self->_resolve;
    RCTPromiseRejectBlock reject = self->_reject;
    self->_resolve = nil;
    self->_reject = nil;
    if (path != nil) {
        if (resolve) {
            resolve(@{ @"path" : path });
        }
    } else if (reject) {
        reject(code ?: @"UNKNOWN_ERROR", message ?: @"Unknown error", nil);
    }
}

@end
