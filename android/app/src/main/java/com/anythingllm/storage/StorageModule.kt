package com.anythingllm.storage

import android.content.ContentResolver
import android.content.ContentUris
import android.content.Context
import android.database.Cursor
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Log
import com.facebook.react.bridge.*
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream

class StorageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    companion object {
        private const val TAG = "StorageModule"
    }

    override fun getName(): String = "StorageModule"

    @ReactMethod
    fun getRealPathFromUri(uriString: String, promise: Promise) {
        Log.d(TAG, "getRealPathFromUri: $uriString")
        var realPath = ""
        try {
            val uri = Uri.parse(uriString)
            realPath = getPath(reactApplicationContext, uri) ?: ""
            if (realPath.isNotEmpty()) promise.resolve(realPath)
            else promise.reject("ERROR", "Could not get real path for URI: $uriString")
        } catch (e: Exception) {
            Log.e(TAG, "Error getting real path", e)
            promise.reject("ERROR", e.message)
        } finally {
            Log.d(TAG, "getRealPathFromUri result: $realPath")
        }
    }

    /**
     * Get a file path from a Uri. This will get the the path for Storage Access
     * Framework Documents, as well as the _data field for the MediaStore and
     * other file-based ContentProviders.
     */
    private fun getPath(context: Context, uri: Uri): String? {
        val isKitKat = Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT

        // Tree URI (react-native-document-picker's pickDirectory() returns one of these, e.g.
        // "content://.../tree/primary%3AMusic%2FMyFolder") -- isDocumentUri() below is false for
        // these (they identify a whole subtree, not one document), so without this branch every
        // folder import fell through to the generic ContentResolver query further down, which
        // can't resolve a tree to anything and returns null. Only the primary external storage
        // provider has a predictable tree-id -> real-path mapping (same "type:relativePath"
        // shape as its document IDs); other providers (SD cards, cloud-backed roots) have no
        // such mapping, so callers must keep treating a still-"content://" result as unresolvable.
        if (isKitKat && isExternalStorageDocument(uri) && uri.pathSegments.contains("tree") && !uri.pathSegments.contains("document")) {
            val treeDocId = DocumentsContract.getTreeDocumentId(uri)
            val split = treeDocId.split(":")
            val type = split.getOrNull(0)
            if ("primary".equals(type, ignoreCase = true) && split.size > 1) {
                return Environment.getExternalStorageDirectory().toString() + "/" + split[1]
            }
        }

        // DocumentProvider
        if (isKitKat && DocumentsContract.isDocumentUri(context, uri)) {
            // ExternalStorageProvider
            if (isExternalStorageDocument(uri)) {
                val docId = DocumentsContract.getDocumentId(uri)
                val split = docId.split(":")
                val type = split[0]
                if ("primary".equals(type, ignoreCase = true)) return Environment.getExternalStorageDirectory().toString() + "/" + split[1]
            }

            // DownloadsProvider
            else if (isDownloadsDocument(uri)) {
                val id = DocumentsContract.getDocumentId(uri)
                val contentUri = ContentUris.withAppendedId(Uri.parse("content://downloads/public_downloads"), id.toLong())
                return getDataColumn(context, contentUri, null, null)
            }
            
            // MediaProvider
            else if (isMediaDocument(uri)) {
                val docId = DocumentsContract.getDocumentId(uri)
                val decodedDocId = java.net.URLDecoder.decode(docId, "UTF-8")
                val split = decodedDocId.split(":")
                val type = split[0]
                val contentUri = when (type) {
                    "image" -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                    "video" -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
                    "audio" -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
                    "document" -> MediaStore.Files.getContentUri("external")
                    else -> null
                }
                
                val selection = "_id=?"
                val selectionArgs = arrayOf(split[1])

                // "document" (picked via Android's generic Documents root, e.g. a Music/Downloads
                // folder browsed through the system file picker) used to short-circuit here and
                // return "$contentUri/${split[1]}" directly -- a content:// URI, not a real
                // filesystem path. Every caller of getRealPathFromUri (Xberg extraction,
                // useAttachments' RNFS-based fallback read) needs an actual path, so that URI
                // failed downstream with "File not found: content://media/external/file/...".
                // Querying the _data column below, same as image/video/audio, returns the real
                // /storage/emulated/0/... path instead.
                Log.d(TAG, "Querying content URI: $contentUri")
                Log.d(TAG, "Selection: $selection")
                Log.d(TAG, "Selection args: ${selectionArgs.joinToString(", ")}")
                return contentUri?.let { nonNullUri ->
                    getDataColumn(context, nonNullUri, selection, selectionArgs)
                }
            }
        }

        // MediaStore (and general)
        else if ("content".equals(uri.scheme, ignoreCase = true)) {
            if (isGooglePhotosUri(uri)) return uri.lastPathSegment
            return getDataColumn(context, uri, null, null)
        }
        // Generic File
        else if ("file".equals(uri.scheme, ignoreCase = true)) return uri.path
        return null
    }

    /**
     * Get the value of the data column for this Uri. This is useful for
     * MediaStore Uris, and other file-based ContentProviders.
     */
    private fun getDataColumn(
        context: Context,
        uri: Uri,
        selection: String?,
        selectionArgs: Array<String>?
    ): String? {
        var cursor: Cursor? = null
        val column = "_data"
        val projection = arrayOf(column)

        try {
            Log.d(TAG, "getDataColumn: $uri")
            Log.d(TAG, "selection: $selection")
            Log.d(TAG, "selectionArgs: $selectionArgs")
            Log.d(TAG, "projection: ${projection.joinToString(", ")}")

            cursor = context.contentResolver.query(uri, projection, selection, selectionArgs, null)
            if (cursor?.moveToFirst() == true) {
                val index = cursor.getColumnIndexOrThrow(column)
                return cursor.getString(index)
            }
        } finally {
            cursor?.close()
        }
        return null
    }

    private fun isExternalStorageDocument(uri: Uri): Boolean {
        return "com.android.externalstorage.documents" == uri.authority
    }

    private fun isDownloadsDocument(uri: Uri): Boolean {
        return "com.android.providers.downloads.documents" == uri.authority
    }

    private fun isMediaDocument(uri: Uri): Boolean {
        return "com.android.providers.media.documents" == uri.authority
    }

    private fun isGooglePhotosUri(uri: Uri): Boolean {
        return "com.google.android.apps.photos.content" == uri.authority
    }
}