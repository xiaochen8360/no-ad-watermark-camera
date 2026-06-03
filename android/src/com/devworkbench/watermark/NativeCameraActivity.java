package com.devworkbench.watermark;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.SurfaceTexture;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.HandlerThread;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONObject;

public class NativeCameraActivity extends Activity {
    public interface ResultCallback {
        void onPhotoSaved(String resultJson);
    }

    public static ResultCallback resultCallback;

    private TextureView textureView;
    private WatermarkOverlayView watermarkView;
    private HandlerThread backgroundThread;
    private Handler backgroundHandler;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private CaptureRequest.Builder previewBuilder;
    private ImageReader imageReader;
    private String cameraId;
    private int lensFacing = CameraCharacteristics.LENS_FACING_BACK;
    private JSONObject settings;
    private String capturedAt;
    private boolean isSaving = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            settings = new JSONObject(getIntent().getStringExtra("settings") == null ? "{}" : getIntent().getStringExtra("settings"));
        } catch (Exception ignored) {
            settings = new JSONObject();
        }
        capturedAt = toIsoTime(System.currentTimeMillis());
        buildLayout();
    }

    @Override
    protected void onResume() {
        super.onResume();
        startBackgroundThread();
        if (textureView.isAvailable()) openCamera();
        else textureView.setSurfaceTextureListener(textureListener);
    }

    @Override
    protected void onPause() {
        closeCamera();
        stopBackgroundThread();
        super.onPause();
    }

    private void buildLayout() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        textureView = new TextureView(this);
        FrameLayout.LayoutParams textureParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
        textureParams.topMargin = dp(110);
        textureParams.bottomMargin = dp(155);
        root.addView(textureView, textureParams);

        watermarkView = new WatermarkOverlayView(this);
        root.addView(watermarkView, textureParams);

        TextView back = controlText("←", 44);
        FrameLayout.LayoutParams backParams = new FrameLayout.LayoutParams(dp(92), dp(92));
        backParams.leftMargin = dp(16);
        backParams.topMargin = dp(34);
        root.addView(back, backParams);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                setResult(RESULT_CANCELED);
                finish();
            }
        });

        TextView switchCamera = controlText("⇄", 30);
        FrameLayout.LayoutParams switchParams = new FrameLayout.LayoutParams(dp(76), dp(76));
        switchParams.gravity = Gravity.TOP | Gravity.RIGHT;
        switchParams.topMargin = dp(42);
        switchParams.rightMargin = dp(28);
        root.addView(switchCamera, switchParams);
        switchCamera.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                lensFacing = lensFacing == CameraCharacteristics.LENS_FACING_BACK
                        ? CameraCharacteristics.LENS_FACING_FRONT
                        : CameraCharacteristics.LENS_FACING_BACK;
                closeCamera();
                openCamera();
            }
        });

        FrameLayout shutter = new FrameLayout(this);
        shutter.setBackground(ovalDrawable(Color.argb(150, 255, 255, 255), dp(4), Color.argb(170, 255, 255, 255)));
        View shutterCore = new View(this);
        shutterCore.setBackground(ovalDrawable(Color.WHITE, dp(2), Color.argb(120, 150, 150, 150)));
        FrameLayout.LayoutParams shutterCoreParams = new FrameLayout.LayoutParams(dp(62), dp(62));
        shutterCoreParams.gravity = Gravity.CENTER;
        shutter.addView(shutterCore, shutterCoreParams);
        FrameLayout.LayoutParams shutterParams = new FrameLayout.LayoutParams(dp(92), dp(92));
        shutterParams.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        shutterParams.bottomMargin = dp(32);
        root.addView(shutter, shutterParams);
        shutter.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                captureStillPhoto();
            }
        });

        TextView video = controlText("●", 36);
        video.setTextColor(Color.rgb(244, 73, 62));
        FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(dp(70), dp(70));
        videoParams.gravity = Gravity.BOTTOM | Gravity.RIGHT;
        videoParams.bottomMargin = dp(40);
        videoParams.rightMargin = dp(76);
        root.addView(video, videoParams);

        textureView.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent event) {
                if (event.getAction() == MotionEvent.ACTION_UP) {
                    triggerFocus();
                    Toast.makeText(NativeCameraActivity.this, "正在对焦", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });

        setContentView(root);
    }

    private TextView controlText(String text, int size) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextColor(Color.WHITE);
        view.setGravity(Gravity.CENTER);
        view.setTextSize(size);
        view.setTypeface(Typeface.DEFAULT_BOLD);
        return view;
    }

    private GradientDrawable ovalDrawable(int color, int strokeWidth, int strokeColor) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setShape(GradientDrawable.OVAL);
        drawable.setColor(color);
        if (strokeWidth > 0) drawable.setStroke(strokeWidth, strokeColor);
        return drawable;
    }

    private final TextureView.SurfaceTextureListener textureListener = new TextureView.SurfaceTextureListener() {
        @Override
        public void onSurfaceTextureAvailable(SurfaceTexture texture, int width, int height) {
            openCamera();
        }

        @Override
        public void onSurfaceTextureSizeChanged(SurfaceTexture texture, int width, int height) {
        }

        @Override
        public boolean onSurfaceTextureDestroyed(SurfaceTexture texture) {
            return true;
        }

        @Override
        public void onSurfaceTextureUpdated(SurfaceTexture texture) {
        }
    };

    private void startBackgroundThread() {
        backgroundThread = new HandlerThread("NativeCamera");
        backgroundThread.start();
        backgroundHandler = new Handler(backgroundThread.getLooper());
    }

    private void stopBackgroundThread() {
        if (backgroundThread == null) return;
        backgroundThread.quitSafely();
        try {
            backgroundThread.join();
        } catch (InterruptedException ignored) {
        }
        backgroundThread = null;
        backgroundHandler = null;
    }

    private void openCamera() {
        if (checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{android.Manifest.permission.CAMERA}, 100);
            return;
        }
        try {
            CameraManager manager = (CameraManager) getSystemService(CAMERA_SERVICE);
            cameraId = chooseCameraId(manager);
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(cameraId);
            Size jpegSize = chooseJpegSize(characteristics);
            imageReader = ImageReader.newInstance(jpegSize.getWidth(), jpegSize.getHeight(), ImageFormat.JPEG, 1);
            imageReader.setOnImageAvailableListener(imageListener, backgroundHandler);
            manager.openCamera(cameraId, stateCallback, backgroundHandler);
        } catch (Exception exception) {
            Toast.makeText(this, "原生相机打开失败", Toast.LENGTH_SHORT).show();
            setResult(RESULT_CANCELED);
            finish();
        }
    }

    private String chooseCameraId(CameraManager manager) throws CameraAccessException {
        String fallback = manager.getCameraIdList()[0];
        for (String id : manager.getCameraIdList()) {
            CameraCharacteristics characteristics = manager.getCameraCharacteristics(id);
            Integer facing = characteristics.get(CameraCharacteristics.LENS_FACING);
            if (facing != null && facing == lensFacing) return id;
            fallback = id;
        }
        return fallback;
    }

    private Size chooseJpegSize(CameraCharacteristics characteristics) {
        StreamConfigurationMap map = characteristics.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size[] sizes = map == null ? new Size[]{new Size(1280, 960)} : map.getOutputSizes(ImageFormat.JPEG);
        Arrays.sort(sizes, Collections.reverseOrder(new Comparator<Size>() {
            @Override
            public int compare(Size a, Size b) {
                return Long.compare((long) a.getWidth() * a.getHeight(), (long) b.getWidth() * b.getHeight());
            }
        }));
        for (Size size : sizes) {
            if (Math.max(size.getWidth(), size.getHeight()) <= 2560) return size;
        }
        return sizes[0];
    }

    private final CameraDevice.StateCallback stateCallback = new CameraDevice.StateCallback() {
        @Override
        public void onOpened(CameraDevice camera) {
            cameraDevice = camera;
            createPreviewSession();
        }

        @Override
        public void onDisconnected(CameraDevice camera) {
            camera.close();
            cameraDevice = null;
        }

        @Override
        public void onError(CameraDevice camera, int error) {
            camera.close();
            cameraDevice = null;
            finish();
        }
    };

    private void createPreviewSession() {
        try {
            SurfaceTexture texture = textureView.getSurfaceTexture();
            if (texture == null) return;
            texture.setDefaultBufferSize(textureView.getWidth(), textureView.getHeight());
            Surface surface = new Surface(texture);
            previewBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
            previewBuilder.addTarget(surface);
            previewBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            previewBuilder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            cameraDevice.createCaptureSession(Arrays.asList(surface, imageReader.getSurface()), new CameraCaptureSession.StateCallback() {
                @Override
                public void onConfigured(CameraCaptureSession session) {
                    captureSession = session;
                    try {
                        captureSession.setRepeatingRequest(previewBuilder.build(), null, backgroundHandler);
                    } catch (CameraAccessException ignored) {
                    }
                }

                @Override
                public void onConfigureFailed(CameraCaptureSession session) {
                    Toast.makeText(NativeCameraActivity.this, "取景失败", Toast.LENGTH_SHORT).show();
                }
            }, backgroundHandler);
        } catch (CameraAccessException ignored) {
        }
    }

    private void triggerFocus() {
        if (captureSession == null || previewBuilder == null) return;
        try {
            previewBuilder.set(CaptureRequest.CONTROL_AF_TRIGGER, CaptureRequest.CONTROL_AF_TRIGGER_START);
            captureSession.capture(previewBuilder.build(), null, backgroundHandler);
            previewBuilder.set(CaptureRequest.CONTROL_AF_TRIGGER, CaptureRequest.CONTROL_AF_TRIGGER_IDLE);
            captureSession.setRepeatingRequest(previewBuilder.build(), null, backgroundHandler);
        } catch (CameraAccessException ignored) {
        }
    }

    private void captureStillPhoto() {
        if (cameraDevice == null || captureSession == null || isSaving) return;
        try {
            isSaving = true;
            capturedAt = toIsoTime(System.currentTimeMillis());
            final CaptureRequest.Builder captureBuilder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
            captureBuilder.addTarget(imageReader.getSurface());
            captureBuilder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
            captureBuilder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            captureBuilder.set(CaptureRequest.JPEG_ORIENTATION, jpegOrientation());
            captureSession.capture(captureBuilder.build(), new CameraCaptureSession.CaptureCallback() {
                @Override
                public void onCaptureCompleted(CameraCaptureSession session, CaptureRequest request, TotalCaptureResult result) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            Toast.makeText(NativeCameraActivity.this, "正在保存水印照片", Toast.LENGTH_SHORT).show();
                        }
                    });
                }
            }, backgroundHandler);
        } catch (CameraAccessException ignored) {
            isSaving = false;
        }
    }

    private int jpegOrientation() {
        int rotation = getWindowManager().getDefaultDisplay().getRotation();
        if (rotation == Surface.ROTATION_90) return 0;
        if (rotation == Surface.ROTATION_180) return 270;
        if (rotation == Surface.ROTATION_270) return 180;
        return lensFacing == CameraCharacteristics.LENS_FACING_FRONT ? 270 : 90;
    }

    private final ImageReader.OnImageAvailableListener imageListener = new ImageReader.OnImageAvailableListener() {
        @Override
        public void onImageAvailable(ImageReader reader) {
            Image image = null;
            try {
                image = reader.acquireLatestImage();
                if (image == null) return;
                ByteBuffer buffer = image.getPlanes()[0].getBuffer();
                byte[] bytes = new byte[buffer.remaining()];
                buffer.get(bytes);
                Bitmap source = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (source == null) throw new IOException("decode failed");
                Bitmap watermarked = drawWatermarkedBitmap(source, capturedAt);
                source.recycle();
                byte[] fullBytes = bitmapToJpegBytes(watermarked, 88);
                String projectName = settings.optString("projectName", "工程");
                String fileName = sanitizeNativeFileName(projectName + "-" + capturedAt.replace(":", "-").replace("T", " ") + ".jpg");
                String uri = saveImageBytes(fullBytes, fileName);
                Bitmap thumb = createThumbnail(watermarked, 420);
                watermarked.recycle();
                String thumbDataUrl = "data:image/jpeg;base64," + Base64.encodeToString(bitmapToJpegBytes(thumb, 72), Base64.NO_WRAP);
                thumb.recycle();
                JSONObject photo = new JSONObject();
                photo.put("uri", uri);
                photo.put("thumbDataUrl", thumbDataUrl);
                photo.put("sourceName", fileName);
                photo.put("createdAt", capturedAt);
                photo.put("title", settings.optString("title", "施工记录"));
                photo.put("weather", settings.optString("weather", ""));
                photo.put("address", settings.optString("address", ""));
                photo.put("place", settings.optString("place", ""));
                photo.put("coord", settings.optString("coord", ""));
                JSONObject result = new JSONObject();
                result.put("ok", true);
                result.put("photo", photo);
                deliverPhotoResult(result.toString());
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(NativeCameraActivity.this, "已保存到本机相册", Toast.LENGTH_SHORT).show();
                    }
                });
            } catch (Exception exception) {
                deliverPhotoResult("{\"ok\":false,\"message\":\"原生水印相机保存失败\"}");
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        Toast.makeText(NativeCameraActivity.this, "保存失败", Toast.LENGTH_SHORT).show();
                    }
                });
            } finally {
                if (image != null) image.close();
                isSaving = false;
            }
        }
    };

    private void deliverPhotoResult(String resultJson) {
        ResultCallback callback = resultCallback;
        if (callback != null) callback.onPhotoSaved(resultJson);
    }

    private void closeCamera() {
        if (captureSession != null) {
            captureSession.close();
            captureSession = null;
        }
        if (cameraDevice != null) {
            cameraDevice.close();
            cameraDevice = null;
        }
        if (imageReader != null) {
            imageReader.close();
            imageReader = null;
        }
    }

    private Bitmap drawWatermarkedBitmap(Bitmap source, String capturedAt) {
        Bitmap output = source.copy(Bitmap.Config.ARGB_8888, true);
        Canvas canvas = new Canvas(output);
        drawWatermark(canvas, output.getWidth(), output.getHeight(), capturedAt);
        return output;
    }

    private void drawWatermark(Canvas canvas, int width, int height, String capturedAt) {
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

    private String saveImageBytes(byte[] imageBytes, String fileName) throws IOException {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) return saveImageWithMediaStore(imageBytes, fileName);
        File directory = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "工程相册");
        if (!directory.exists() && !directory.mkdirs()) throw new IOException("Gallery directory create failed");
        File imageFile = new File(directory, fileName);
        try (FileOutputStream output = new FileOutputStream(imageFile)) {
            output.write(imageBytes);
        }
        MediaScannerConnection.scanFile(this, new String[]{imageFile.getAbsolutePath()}, new String[]{"image/jpeg"}, null);
        return Uri.fromFile(imageFile).toString();
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

    private String sanitizeNativeFileName(String fileName) {
        String value = fileName == null || fileName.trim().isEmpty() ? "watermark-photo.jpg" : fileName.trim();
        value = value.replaceAll("[\\\\/:*?\"<>|]", "-");
        if (!value.toLowerCase(Locale.US).endsWith(".jpg") && !value.toLowerCase(Locale.US).endsWith(".jpeg")) value += ".jpg";
        return value;
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

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private class WatermarkOverlayView extends View {
        WatermarkOverlayView(Activity context) {
            super(context);
            setWillNotDraw(false);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            super.onDraw(canvas);
            drawWatermark(canvas, getWidth(), getHeight(), toIsoTime(System.currentTimeMillis()));
            postInvalidateDelayed(1000);
        }
    }
}
