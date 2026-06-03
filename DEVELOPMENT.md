# 开发过程记录

这个项目从“先跑通一个本地水印相机”开始，没有一开始追求完整商业 App，而是围绕真机反馈一轮轮收敛。

## 1. 第一版闭环

最初只做 4 个核心页面/能力：

- 工程：创建工程、选择当前工程。
- 拍照：拍照或导入照片，压上水印。
- 批量导入：一次导入多张照片。
- 相册：查看已加水印照片。

MVP 的判断标准是：用户可以创建一个工程，拍照或导入照片，自动把时间、地点、工程名压成水印，并在本地归档，最后导出带水印照片。

## 2. 从浏览器预览到 APK

第一版先用本地 HTML/CSS/JS 跑通预览，再用 Android WebView 打成 debug APK。这样可以快速验证界面和水印逻辑，但也暴露了几个问题：

- 浏览器本地存储不适合塞大量原图。
- WebView 的相机能力不如手机原生相机。
- APK 内 `alert/prompt` 样式很难完全控制。

## 3. 真机反馈后的关键调整

真机测试后，功能逐步改成更接近真实 App：

- 拍照页改成 App 内 Camera2 原生相机，不再跳外部系统相机。
- 加入黑色上下栏、返回箭头、切换镜头、点按对焦和圆形快门。
- 拍照后由 Java 侧压水印，并写入 Android 系统相册 `DCIM/工程相册`。
- 批量导入改成 Android 原生选图，再逐张处理、逐张保存，避免 WebView 空间不够。
- App 内只保存缩略图、路径和相册 URI，不再把大图全塞进 localStorage。

## 4. 水印样式迭代

水印从“能显示”调到“像现场水印相机”：

- 放大水印面板和正文。
- 标题栏改成蓝色渐变。
- 去掉重复的备注行。
- 相机实时预览、水印保存、批量导入三处绘制参数统一。
- 批量导入时间从随机到分钟改成随机到秒，避免所有照片秒数都是 `00`。

## 5. 本地归档和汇报

后续补了两个现场常用能力：

- 相册支持按工程、地点、时间查看。
- 长按照片进入批量选择，支持删除和拼图汇报。
- 拼图汇报页可以编辑标题、说明、汇报人、汇报内容，保存到本地相册。

## 6. 当前版本验证

当前 APK：

- 路径：`release/no-ad-watermark-camera-debug.apk`
- SHA256：`d8b557c283b89879b3e423d2c0ba424ea01e83c38250bd0b90e6d9645ed5ce20`
- 包名：`com.devworkbench.watermark`
- 版本：`0.1.0`

在 Dev Workbench 母仓库中已验证：

```bash
node --check projects/app/local-watermark-camera/app/app.js
pnpm check
pnpm review
JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" node projects/app/local-watermark-camera/android/build-apk.mjs
```

其中 APK 构建脚本已通过 `apksigner verify --verbose` 签名校验。

## 7. 下一步

更适合继续做的方向：

- 改成正式 release 签名包。
- 接入真正的离线/联网地址反查方案。
- 视频水印保存到系统相册。
- 用 Flutter 或原生 Android 重构成更标准的跨端/商店版本。

