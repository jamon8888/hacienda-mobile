import { NativeModules } from "react-native";
const { StorageModule } = NativeModules;

export default class Storage {
  static requireSearch = [
    "com.android.externalstorage.documents",
    "com.android.providers.downloads.documents",
    "com.android.providers.media.documents",
    "com.google.android.apps.photos.content",
  ];

  public static log(message: string) {
    console.log(`\x1b[33m[StorageNativeModule]\x1b[0m ${message}`);
  }

  public static needsStorageSearch(uri: string) {
    if (uri.startsWith("file://")) return false;
    Storage.log(`URI ${uri} requires storage search`);
    return Storage.requireSearch.some(authority => uri.includes(authority));
  }

  static async getRealPathFromUri(uri: string) {
    if (!Storage.needsStorageSearch(uri)) return uri;
    // Used to short-circuit here for any URI containing "%3A" (the URL-encoded ":" that
    // separates type from id in a SAF document ID, e.g. "document%3A1000017076") and return
    // a raw `content://media/external/file/${docId}` string instead of an actual filesystem
    // path. That's not a real path -- every caller here (Xberg extraction, the RNFS-based
    // fallback read in useAttachments) needs one, so it failed downstream with "File not
    // found: content://media/external/file/...". Since almost every real-world SAF URI
    // contains "%3A", this shortcut intercepted nearly every call before it ever reached the
    // native resolver below, which does the real work of querying the MediaStore's `_data`
    // column for an actual path.
    return await StorageModule.getRealPathFromUri(uri);
  }
}
