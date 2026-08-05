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

@interface FolderPickerModule () <UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate>
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
            // documentPicker:didPickDocumentsAtURLs:/documentPickerWasCancelled: only fire for
            // the picker's own Cancel/select actions. If it gets dismissed some other way --
            // the presenting view controller torn down by navigation, a swipe-to-dismiss -- and
            // neither ever fires, _resolve stays set forever and every later pickDirectory call
            // rejects with PICKER_BUSY until the app restarts. This delegate is the fallback for
            // that case.
            picker.presentationController.delegate = self;

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

#pragma mark - UIAdaptivePresentationControllerDelegate

- (void)presentationControllerDidDismiss:(UIPresentationController *)presentationController
{
    // No-op if didPickDocumentsAtURLs:/documentPickerWasCancelled: already settled the promise
    // (finishWithPath: clears _resolve/_reject, so this becomes a harmless no-op in that case).
    [self finishWithPath:nil code:@"CANCELLED" message:@"Folder picker was dismissed"];
}

#pragma mark - Internals

// Mirrors SUPPORTED_FILE_TYPES in src/utils/Xberg/types.ts -- keep in sync. Filtering here
// (rather than only in JS's collectSupportedFiles, which ran on the full unfiltered copy)
// means a folder containing large unsupported files (videos, photo libraries) doesn't get
// every one of those bytes duplicated onto the device before being discarded.
static NSSet<NSString *> *ImportableExtensions(void) {
    static NSSet<NSString *> *set;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        set = [NSSet setWithArray:@[
            @"pdf", @"docx", @"doc", @"pptx", @"ppt", @"xlsx", @"xls", @"odt", @"ods", @"odp",
            @"txt", @"md", @"markdown", @"rst", @"org", @"rtf",
            @"csv", @"tsv", @"json", @"yaml", @"xml",
            @"html", @"htm",
            @"eml", @"msg",
            @"mp3", @"m4a", @"wav", @"webm", @"mpga",
            @"mp4", @"mpeg",
            @"png", @"jpg", @"jpeg", @"gif", @"webp", @"bmp", @"tiff",
            @"js", @"ts", @"py", @"java", @"c", @"cpp", @"go", @"rs",
        ]];
    });
    return set;
}

// Matches MAX_IMPORT_FILE_SIZE in Files/index.tsx.
static const unsigned long long kMaxImportFileSize = 50ULL * 1024 * 1024;

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
 includingPropertiesForKeys:@[ NSURLIsRegularFileKey, NSURLFileSizeKey ]
                    options:NSDirectoryEnumerationSkipsHiddenFiles
               errorHandler:nil];

    NSUInteger sourcePathLength = sourceURL.path.length;
    NSSet<NSString *> *extensions = ImportableExtensions();
    for (NSURL *fileURL in enumerator) {
        NSNumber *isRegularFile = nil;
        [fileURL getResourceValue:&isRegularFile forKey:NSURLIsRegularFileKey error:nil];
        if (![isRegularFile boolValue]) {
            continue;
        }
        if (![extensions containsObject:fileURL.pathExtension.lowercaseString]) {
            continue;
        }
        NSNumber *fileSize = nil;
        [fileURL getResourceValue:&fileSize forKey:NSURLFileSizeKey error:nil];
        if (fileSize.unsignedLongLongValue > kMaxImportFileSize) {
            continue;
        }
        // sourcePathLength can exceed the child path length for a symlink or a resolved
        // enumerator entry outside sourceURL's own subtree; substringFromIndex: would raise
        // NSRangeException in that case, so just skip rather than crash the whole import.
        if (fileURL.path.length <= sourcePathLength) {
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
