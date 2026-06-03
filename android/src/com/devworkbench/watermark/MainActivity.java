package com.devworkbench.watermark;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ContentValues;
import android.content.DialogInterface;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.text.InputType;
import android.view.ViewGroup;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int CAMERA_PERMISSION_REQUEST = 41;
    private static final int LOCATION_PERMISSION_REQUEST = 42;
    private static final int FILE_CHOOSER_REQUEST = 43;
    private static final int NATIVE_IMPORT_REQUEST = 44;
    private static final int NATIVE_CAMERA_REQUEST = 45;
    private static final int LOCAL_PORT = 41931;

    private WebView webView;
    private PermissionRequest pendingPermissionRequest;
    private String pendingGeoOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;
    private ValueCallback<Uri[]> filePathCallback;
    private String pendingNativeImportSettings = "{}";
    private String pendingNativeCameraSettings = "{}";
    private Uri pendingNativeCameraUri;
    private LocalAssetServer server;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        server = new LocalAssetServer();
        server.start();

        webView = new WebView(this);
        setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        ));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setGeolocationEnabled(true);

        webView.setWebViewClient(new WebViewClient());
        webView.addJavascriptInterface(new AndroidBridge(), "AndroidBridge");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    request.grant(request.getResources());
                    return;
                }
                pendingPermissionRequest = request;
                requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA_PERMISSION_REQUEST);
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }
                pendingGeoOrigin = origin;
                pendingGeoCallback = callback;
                requestPermissions(
                        new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                        LOCATION_PERMISSION_REQUEST
                );
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception exception) {
                    Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                    fallback.addCategory(Intent.CATEGORY_OPENABLE);
                    fallback.setType("image/*");
                    fallback.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    startActivityForResult(Intent.createChooser(fallback, "选择图片"), FILE_CHOOSER_REQUEST);
                }
                return true;
            }
        });

        webView.loadUrl("http://127.0.0.1:" + LOCAL_PORT + "/index.html");
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == NATIVE_IMPORT_REQUEST) {
            List<Uri> uris = collectImageUris(resultCode, data);
            if (uris.isEmpty()) {
                deliverNativeBatchResult("{\"ok\":false,\"message\":\"未选择照片\"}");
                return;
            }
            processNativeBatchImport(uris, pendingNativeImportSettings);
            return;
        }
        if (requestCode == NATIVE_CAMERA_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getStringExtra("result") != null) {
                deliverNativeCameraResult(data.getStringExtra("result"));
            }
            pendingNativeCameraUri = null;
            NativeCameraActivity.resultCallback = null;
            return;
        }
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] results = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                results = new Uri[count];
                for (int index = 0; index < count; index += 1) {
                    results[index] = data.getClipData().getItemAt(index).getUri();
                }
            } else if (data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
        }
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST && pendingPermissionRequest != null) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermissionRequest.grant(pendingPermissionRequest.getResources());
            } else {
                pendingPermissionRequest.deny();
            }
            pendingPermissionRequest = null;
            return;
        }
        if (requestCode == LOCATION_PERMISSION_REQUEST && pendingGeoCallback != null) {
            pendingGeoCallback.invoke(pendingGeoOrigin, anyPermissionGranted(grantResults), false);
            pendingGeoOrigin = null;
            pendingGeoCallback = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
        }
        if (server != null) {
            server.close();
        }
        super.onDestroy();
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean anyPermissionGranted(int[] grantResults) {
        for (int result : grantResults) {
            if (result == PackageManager.PERMISSION_GRANTED) return true;
        }
        return false;
    }

    private String jsString(String value) {
        StringBuilder output = new StringBuilder("\"");
        for (int index = 0; index < value.length(); index += 1) {
            char ch = value.charAt(index);
            switch (ch) {
                case '\\':
                    output.append("\\\\");
                    break;
                case '"':
                    output.append("\\\"");
                    break;
                case '\n':
                    output.append("\\n");
                    break;
                case '\r':
                    output.append("\\r");
                    break;
                case '\t':
                    output.append("\\t");
                    break;
                default:
                    output.append(ch);
                    break;
            }
        }
        output.append('"');
        return output.toString();
    }

    private List<Uri> collectImageUris(int resultCode, Intent data) {
        List<Uri> uris = new ArrayList<>();
        if (resultCode != RESULT_OK || data == null) return uris;
        if (data.getClipData() != null) {
            int count = data.getClipData().getItemCount();
            for (int index = 0; index < count; index += 1) {
                Uri uri = data.getClipData().getItemAt(index).getUri();
                if (uri != null) uris.add(uri);
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }
        return uris;
    }

    private void processNativeBatchImport(final List<Uri> sourceUris, final String settingsJson) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject settings = new JSONObject(settingsJson == null ? "{}" : settingsJson);
                    JSONArray photos = new JSONArray();
                    for (int index = 0; index < sourceUris.size(); index += 1) {
                        JSONObject saved = processSingleNativePhoto(sourceUris.get(index), settings, index, sourceUris.size());
                        photos.put(saved);
                    }
                    JSONObject result = new JSONObject();
                    result.put("ok", true);
                    result.put("photos", photos);
                    deliverNativeBatchResult(result.toString());
                } catch (Exception exception) {
                    JSONObject result = new JSONObject();
                    try {
                        result.put("ok", false);
                        result.put("message", "原生导入失败，请少选几张重试");
                    } catch (Exception ignored) {
                    }
                    deliverNativeBatchResult(result.toString());
                }
            }
        }).start();
    }

    private void processNativeCameraPhoto(final Uri sourceUri, final String settingsJson) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    JSONObject settings = new JSONObject(settingsJson == null ? "{}" : settingsJson);
                    settings.put("capturedAt", toIsoTime(System.currentTimeMillis()));
                    JSONObject photo = processSingleNativePhoto(sourceUri, settings, 0, 1);
                    deleteQuietly(sourceUri);
                    JSONObject result = new JSONObject();
                    result.put("ok", true);
                    result.put("photo", photo);
                    deliverNativeCameraResult(result.toString());
                } catch (Exception exception) {
                    deleteQuietly(sourceUri);
                    JSONObject result = new JSONObject();
                    try {
                        result.put("ok", false);
                        result.put("message", "本机相机照片处理失败");
                    } catch (Exception ignored) {
                    }
                    deliverNativeCameraResult(result.toString());
                }
            }
        }).start();
    }

    private JSONObject processSingleNativePhoto(Uri sourceUri, JSONObject settings, int index, int total) throws Exception {
        Bitmap source = decodeBitmapFromUri(sourceUri, 1800);
        String capturedAt = settings.optString("capturedAt", "");
        if (capturedAt.isEmpty()) capturedAt = timestampForIndex(settings, index, total);
        Bitmap watermarked = drawWatermarkedBitmap(source, settings, capturedAt);
        source.recycle();

        byte[] fullBytes = bitmapToJpegBytes(watermarked, 86);
        String projectName = settings.optString("projectName", "工程");
        String fileName = sanitizeNativeFileName(projectName + "-" + capturedAt.replace(":", "-").replace("T", " ") + ".jpg");
        String galleryUri = saveImageBytes(fullBytes, fileName);

        Bitmap thumb = createThumbnail(watermarked, 420);
        watermarked.recycle();
        String thumbDataUrl = "data:image/jpeg;base64," + Base64.encodeToString(bitmapToJpegBytes(thumb, 72), Base64.NO_WRAP);
        thumb.recycle();

        JSONObject photo = new JSONObject();
        photo.put("uri", galleryUri);
        photo.put("thumbDataUrl", thumbDataUrl);
        photo.put("sourceName", fileName);
        photo.put("createdAt", capturedAt);
        photo.put("title", settings.optString("title", "施工记录"));
        photo.put("weather", settings.optString("weather", ""));
        photo.put("address", settings.optString("address", ""));
        photo.put("place", settings.optString("place", ""));
        photo.put("coord", settings.optString("coord", ""));
        return photo;
    }

    private Bitmap decodeBitmapFromUri(Uri uri, int maxSide) throws IOException {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(stream, null, bounds);
        }

        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = 1;
        int largest = Math.max(bounds.outWidth, bounds.outHeight);
        while (largest / options.inSampleSize > maxSide) {
            options.inSampleSize *= 2;
        }
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            Bitmap bitmap = BitmapFactory.decodeStream(stream, null, options);
            if (bitmap == null) throw new IOException("Image decode failed");
            return bitmap;
        }
    }

    private Bitmap drawWatermarkedBitmap(Bitmap source, JSONObject settings, String capturedAt) {
        Bitmap output = source.copy(Bitmap.Config.ARGB_8888, true);
        Canvas canvas = new Canvas(output);
        int width = output.getWidth();
        int height = output.getHeight();
        float unit = Math.max(14f, width / 40f);
        float panelWidth = width * 0.59f;
        float barHeight = unit * 2.75f;
        float bodyTopGap = unit * 0.95f;
        float lineHeight = unit * 1.34f;
        String[] lines = new String[]{
                "天    气：" + settings.optString("weather", ""),
                "经    纬：" + settings.optString("coord", ""),
                "地    点：" + settings.optString("address", ""),
                "工程名称：" + settings.optString("projectName", ""),
                "时    间：" + formatNativeTime(capturedAt)
        };
        float panelHeight = barHeight + bodyTopGap + lines.length * lineHeight + unit * 0.35f;
        float top = height - panelHeight;

        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        paint.setStyle(Paint.Style.FILL);
        paint.setColor(Color.argb(118, 0, 0, 0));
        canvas.drawRect(new RectF(0, top, panelWidth, height), paint);
        paint.setColor(parseColor(settings.optString("accent", "#2259f2"), Color.rgb(34, 89, 242)));
        canvas.drawRect(new RectF(0, top, panelWidth, top + barHeight), paint);

        paint.setColor(Color.WHITE);
        paint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        paint.setTextAlign(Paint.Align.CENTER);
        paint.setTextSize(unit * 1.20f);
        Paint.FontMetrics titleMetrics = paint.getFontMetrics();
        float titleY = top + (barHeight - titleMetrics.ascent - titleMetrics.descent) / 2f;
        canvas.drawText(settings.optString("title", "施工记录"), panelWidth / 2f, titleY, paint);

        paint.setTextAlign(Paint.Align.LEFT);
        paint.setTextSize(unit * 1.02f);
        paint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
        float lineY = top + barHeight + bodyTopGap;
        float textMaxWidth = panelWidth - unit * 1.2f;
        for (String line : lines) {
            canvas.drawText(ellipsize(paint, line, textMaxWidth), unit * 0.45f, lineY, paint);
            lineY += lineHeight;
        }
        return output;
    }

    private String ellipsize(Paint paint, String text, float maxWidth) {
        if (paint.measureText(text) <= maxWidth) return text;
        String value = text;
        while (value.length() > 1 && paint.measureText(value + "...") > maxWidth) {
            value = value.substring(0, value.length() - 1);
        }
        return value + "...";
    }

    private Bitmap createThumbnail(Bitmap source, int maxSide) {
        int width = source.getWidth();
        int height = source.getHeight();
        float scale = Math.min(1f, maxSide / (float) Math.max(width, height));
        int targetWidth = Math.max(1, Math.round(width * scale));
        int targetHeight = Math.max(1, Math.round(height * scale));
        return Bitmap.createScaledBitmap(source, targetWidth, targetHeight, true);
    }

    private byte[] bitmapToJpegBytes(Bitmap bitmap, int quality) {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output);
        return output.toByteArray();
    }

    private String timestampForIndex(JSONObject settings, int index, int total) {
        long start = parseTime(settings.optString("timeStart", ""), false);
        long end = parseTime(settings.optString("timeEnd", ""), true);
        if (start <= 0) start = System.currentTimeMillis() - 45L * 60L * 1000L;
        if (end <= 0) end = System.currentTimeMillis();
        long min = Math.min(start, end);
        long max = Math.max(start, end);
        long minSecond = min / 1000L;
        long maxSecond = max / 1000L;
        long second = minSecond;
        if (maxSecond > minSecond) {
            second = minSecond + (long) Math.floor(Math.random() * (maxSecond - minSecond + 1));
        }
        return toIsoTime(second * 1000L);
    }

    private long parseTime(String value, boolean endOfMinute) {
        if (value == null || value.isEmpty()) return 0;
        try {
            return java.time.Instant.parse(value).toEpochMilli();
        } catch (Exception ignored) {
        }
        try {
            long time = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm", Locale.US).parse(value).getTime();
            return endOfMinute ? time + 59999L : time;
        } catch (Exception ignored) {
        }
        return 0;
    }

    private String formatNativeTime(String isoTime) {
        try {
            java.text.SimpleDateFormat parser = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            parser.setTimeZone(TimeZone.getTimeZone("UTC"));
            java.util.Date date = parser.parse(isoTime);
            return new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(date);
        } catch (Exception ignored) {
            return isoTime.replace("T", " ").replace("Z", "");
        }
    }

    private String toIsoTime(long time) {
        java.text.SimpleDateFormat formatter = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new java.util.Date(time));
    }

    private int parseColor(String value, int fallback) {
        try {
            return Color.parseColor(value);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private String sanitizeNativeFileName(String fileName) {
        String value = fileName == null || fileName.trim().isEmpty() ? "watermark-photo.jpg" : fileName.trim();
        value = value.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (!value.toLowerCase(Locale.US).endsWith(".jpg") && !value.toLowerCase(Locale.US).endsWith(".jpeg")) {
            value = value + ".jpg";
        }
        return value;
    }

    private String saveImageBytes(byte[] imageBytes, String fileName) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return saveImageWithMediaStore(imageBytes, fileName);
        }
        return saveImageLegacy(imageBytes, fileName);
    }

    private String saveImageWithMediaStore(byte[] imageBytes, String fileName) throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_DCIM + "/工程相册");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);

        Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("MediaStore insert failed");
        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IOException("MediaStore output failed");
            output.write(imageBytes);
        }

        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        getContentResolver().update(uri, values, null, null);
        return uri.toString();
    }

    private String saveImageLegacy(byte[] imageBytes, String fileName) throws IOException {
        File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "工程相册");
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IOException("Gallery directory create failed");
        }
        File imageFile = new File(directory, fileName);
        try (FileOutputStream output = new FileOutputStream(imageFile)) {
            output.write(imageBytes);
        }
        MediaScannerConnection.scanFile(MainActivity.this, new String[]{imageFile.getAbsolutePath()}, new String[]{"image/jpeg"}, null);
        return Uri.fromFile(imageFile).toString();
    }

    private Uri createNativeCameraOutputUri() throws IOException {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, "native-camera-" + System.currentTimeMillis() + ".jpg");
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_DCIM + "/工程相册");
            values.put(MediaStore.Images.Media.IS_PENDING, 1);
        }
        Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) throw new IOException("Camera output uri create failed");
        return uri;
    }

    private void deleteQuietly(Uri uri) {
        if (uri == null) return;
        try {
            getContentResolver().delete(uri, null, null);
        } catch (Exception ignored) {
        }
    }

    private void deliverNativeBatchResult(final String resultJson) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript("window.receiveNativeBatchImport(" + jsString(resultJson) + ")", null);
            }
        });
    }

    private void deliverNativeCameraResult(final String resultJson) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript("window.receiveNativeCameraPhoto(" + jsString(resultJson) + ")", null);
            }
        });
    }

    private class AndroidBridge {
        @JavascriptInterface
        public void startNativeCamera(String settingsJson) {
            pendingNativeCameraSettings = settingsJson == null ? "{}" : settingsJson;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent intent = new Intent(MainActivity.this, NativeCameraActivity.class);
                        intent.putExtra("settings", pendingNativeCameraSettings);
                        NativeCameraActivity.resultCallback = new NativeCameraActivity.ResultCallback() {
                            @Override
                            public void onPhotoSaved(String resultJson) {
                                deliverNativeCameraResult(resultJson);
                            }
                        };
                        startActivityForResult(intent, NATIVE_CAMERA_REQUEST);
                    } catch (Exception exception) {
                        NativeCameraActivity.resultCallback = null;
                        deliverNativeCameraResult("{\"ok\":false,\"message\":\"无法打开原生水印相机\"}");
                    }
                }
            });
        }

        @JavascriptInterface
        public void startNativeBatchImport(String settingsJson) {
            pendingNativeImportSettings = settingsJson == null ? "{}" : settingsJson;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType("image/*");
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    try {
                        startActivityForResult(Intent.createChooser(intent, "选择照片"), NATIVE_IMPORT_REQUEST);
                    } catch (Exception exception) {
                        Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                        fallback.addCategory(Intent.CATEGORY_OPENABLE);
                        fallback.setType("image/*");
                        fallback.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                        startActivityForResult(Intent.createChooser(fallback, "选择照片"), NATIVE_IMPORT_REQUEST);
                    }
                }
            });
        }

        @JavascriptInterface
        public void promptProjectName() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    final EditText input = new EditText(MainActivity.this);
                    input.setHint("输入工程名称");
                    input.setSingleLine(true);
                    input.setInputType(InputType.TYPE_CLASS_TEXT);
                    int padding = Math.round(22 * getResources().getDisplayMetrics().density);
                    input.setPadding(padding, 0, padding, 0);

                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle("创建工程")
                            .setView(input)
                            .setNegativeButton("取消", null)
                            .setPositiveButton("确定", new DialogInterface.OnClickListener() {
                                @Override
                                public void onClick(DialogInterface dialog, int which) {
                                    String name = input.getText().toString().trim();
                                    if (name.isEmpty()) {
                                        showNativeToast("请输入工程名称");
                                        return;
                                    }
                                    webView.evaluateJavascript("window.createProjectFromNative(" + jsString(name) + ")", null);
                                }
                            })
                            .show();
                }
            });
        }

        @JavascriptInterface
        public String saveImage(String dataUrl, String fileName) {
            try {
                byte[] imageBytes = decodeDataUrl(dataUrl);
                String safeName = sanitizeFileName(fileName);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    return saveImageWithMediaStore(imageBytes, safeName);
                }
                return saveImageLegacy(imageBytes, safeName);
            } catch (Exception exception) {
                showNativeToast("写入手机相册失败");
                return "";
            }
        }

        @JavascriptInterface
        public boolean overwriteImage(String uriString, String dataUrl) {
            try {
                byte[] imageBytes = decodeDataUrl(dataUrl);
                Uri uri = Uri.parse(uriString);
                if ("file".equals(uri.getScheme())) {
                    File imageFile = new File(uri.getPath());
                    try (FileOutputStream output = new FileOutputStream(imageFile, false)) {
                        output.write(imageBytes);
                    }
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{imageFile.getAbsolutePath()}, new String[]{"image/jpeg"}, null);
                    return true;
                }
                try (OutputStream output = getContentResolver().openOutputStream(uri, "wt")) {
                    if (output == null) throw new IOException("MediaStore overwrite failed");
                    output.write(imageBytes);
                }
                return true;
            } catch (Exception exception) {
                showNativeToast("覆盖本机相册失败");
                return false;
            }
        }

        private byte[] decodeDataUrl(String dataUrl) {
            int commaIndex = dataUrl.indexOf(",");
            String payload = commaIndex >= 0 ? dataUrl.substring(commaIndex + 1) : dataUrl;
            return Base64.decode(payload, Base64.DEFAULT);
        }

        private String sanitizeFileName(String fileName) {
            String value = fileName == null || fileName.trim().isEmpty() ? "watermark-photo.jpg" : fileName.trim();
            value = value.replaceAll("[\\\\/:*?\"<>|]", "-");
            if (!value.toLowerCase(Locale.US).endsWith(".jpg") && !value.toLowerCase(Locale.US).endsWith(".jpeg")) {
                value = value + ".jpg";
            }
            return value;
        }

        private String saveImageWithMediaStore(byte[] imageBytes, String fileName) throws IOException {
            return MainActivity.this.saveImageWithMediaStore(imageBytes, fileName);
        }

        private String saveImageLegacy(byte[] imageBytes, String fileName) throws IOException {
            return MainActivity.this.saveImageLegacy(imageBytes, fileName);
        }
    }

    private void showNativeToast(final String message) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show();
            }
        });
    }

    private class LocalAssetServer extends Thread {
        private volatile boolean running = true;
        private ServerSocket serverSocket;

        @Override
        public void run() {
            try {
                serverSocket = new ServerSocket(LOCAL_PORT);
                while (running) {
                    Socket socket = serverSocket.accept();
                    handle(socket);
                }
            } catch (IOException ignored) {
            }
        }

        void close() {
            running = false;
            try {
                if (serverSocket != null) serverSocket.close();
            } catch (IOException ignored) {
            }
        }

        private void handle(Socket socket) {
            try (Socket client = socket;
                 InputStream input = client.getInputStream();
                 OutputStream output = client.getOutputStream()) {
                byte[] buffer = new byte[2048];
                int read = input.read(buffer);
                if (read <= 0) return;
                String request = new String(buffer, 0, read, StandardCharsets.UTF_8);
                String path = parsePath(request);
                byte[] body = readAsset(path);
                if (body == null) {
                    writeResponse(output, "404 Not Found", "text/plain; charset=utf-8", "Not found".getBytes(StandardCharsets.UTF_8));
                    return;
                }
                writeResponse(output, "200 OK", mimeType(path), body);
            } catch (IOException ignored) {
            }
        }

        private String parsePath(String request) {
            String[] parts = request.split(" ");
            if (parts.length < 2 || "/".equals(parts[1])) return "index.html";
            String path = parts[1].split("\\?")[0];
            while (path.startsWith("/")) path = path.substring(1);
            if (path.contains("..")) return "index.html";
            return path;
        }

        private byte[] readAsset(String path) {
            try (InputStream stream = getAssets().open(path);
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = stream.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                }
                return output.toByteArray();
            } catch (IOException ignored) {
                return null;
            }
        }

        private void writeResponse(OutputStream output, String status, String mimeType, byte[] body) throws IOException {
            String header = String.format(Locale.US,
                    "HTTP/1.1 %s\r\nContent-Type: %s\r\nContent-Length: %d\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
                    status,
                    mimeType,
                    body.length
            );
            output.write(header.getBytes(StandardCharsets.UTF_8));
            output.write(body);
            output.flush();
        }

        private String mimeType(String path) {
            if (path.endsWith(".html")) return "text/html; charset=utf-8";
            if (path.endsWith(".css")) return "text/css; charset=utf-8";
            if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
            if (path.endsWith(".png")) return "image/png";
            if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
            return "application/octet-stream";
        }
    }
}
