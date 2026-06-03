# 本地水印相机 状态

- **当前目标**：根据真机 APK 测试反馈，修复相机页、导入页、定位、相册保存和拼图汇报闭环。
- **已完成**：创建项目目录、brief、project.json；实现工程、导入、相册 3 个底部功能；Android 目录已补齐标准 Gradle 工程入口（`settings.gradle`、根 `build.gradle`、`app/build.gradle`、`gradle.properties`），Android Studio 可同步后选择 `app` 直接 Run/Debug 到真机；工程页顶部输入栏保留能创建的逻辑：输入后点右侧 `+` 直接创建，未输入时右下浮动 `+` 使用系统原生输入框创建；创建栏样式已调成独立玻璃卡片并增加 `创建工程` 标签，避免看起来像搜索框；创建工程后会清空创建栏、切到“我创建的”、补齐最近打开时间并提示已创建；工程和照片 ID 已改用兼容 WebView 的 `createId()`，避免旧 WebView 不支持 `crypto.randomUUID()` 导致创建静默失败；工程卡片主体可直接进入当前工程水印下的拍照界面，右侧三个点菜单支持修改和删除工程；工程页标签栏右侧新增 `默认地点`，点击可手动设置全局水印地点，默认地点弹窗已改为常用地点下拉 + 新增/修改输入框，保存新地点后会进入地点列表，所有拍照、导入、预览和原生批量导入水印都使用当前选中的默认地点；获取本机定位现在只更新经纬度，不再把地点覆盖成“当前位置附近”；Android 真机相机入口已从外部系统相机 Intent 改成 App 内原生 Camera2 水印相机页：黑色上下栏、返回箭头、切换镜头、点按对焦、圆形快门按钮和实时水印 Overlay 保留在 App 内，拍照后由 Java 侧压水印并保存到 `DCIM/工程相册`，App 内只保存缩略图和系统相册 URI；浏览器预览仍保留 WebView/getUserMedia 相机兜底；相机页已锁定全屏，避免页面上下滚动覆盖返回按钮；导入页已去掉无意义摄像头请求框，只保留字段、水印预览、定位按钮、批量导入和保存，并在底部提供大号返回工程按钮；批量导入已新增 Android 原生链路：真机优先调系统相册多选，在 Java 侧逐张压水印并直接写入 `DCIM/工程相册`，App 内只保存缩略图和本机相册 URI，避免 WebView/localStorage 因照片太大或数量太多失败；批量保存会为每张照片随机写入时间；照片生成水印已按图 2 参考放大：水印面板宽度、标题栏高度、正文字号和行距同步提升，480px 宽照片不再出现过小水印；相册页支持按地点/时间查看、导出单张带水印图片、点击缩略图进入玻璃蓝照片详情页，可查看照片信息并修改新照片水印，底部有居中的工程相机入口；长按照片进入玻璃蓝批量选择模式，支持全选、按日期选、删除和拼图汇报；拼图汇报页已改成软件统一玻璃蓝色调，支持编辑汇报标题、说明、汇报人、汇报内容，底部提供 `+ 图片` 追加照片，保存会尝试写入手机系统相册；Android WebView 已接入系统文件选择器，`+ 图片` 可以弹出本机相册；汇报图片头部字段改为分行排版并限制长文本，避免文字重叠；汇报保存成功提示为“已保存到本地相册”，toast 层级已提升到汇报页之上；启动图标源码已从场记板表情改成更明确的相机主体，保留白底、彩色边缘光和黑色描边风格；新保存照片会记录原图和本机相册 URI，详情页可固定底部保存并覆盖本机相册；水印已移除备注行，最终写入图片的水印框高度按行数自动计算，避免裁掉时间；因真机反馈应用无法打开，已回滚 Android 壳隐藏系统状态栏逻辑。
- **水印样式**：本轮按用户参考图 2 重新调整 APK 水印标准样式：面板宽度从约 64% 收窄到约 59%，正文基准字号上调，标题栏高度下调，正文行距和留白重新平衡，黑底透明度略降；Android 原生批量导入、App 内 Camera2 实时水印/保存水印、WebView 导入预览三处绘制参数已统一。
- **下一步**：安装最新 debug APK 后真机确认：批量导入按设定时间段随机到秒，不再全部落在 `:00`；创建工程入口保持用户指定的弹窗版本；默认地点弹窗默认收起“新增或修改地点”；导入页选择工程后地点自动带出工程地点/默认地点。
- **验证证据**：`node --check projects/app/local-watermark-camera/app/app.js` 通过；`pnpm check` 通过；`pnpm review` 通过；`JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home" node projects/app/local-watermark-camera/android/build-apk.mjs` 已于 2026-06-03 12:34 重新构建 `projects/app/local-watermark-camera/dist/local-watermark-camera-debug.apk`；打包脚本内 `apksigner verify --verbose` 通过 v2/v3 签名校验；本轮同时重新生成微信传输用压缩包 `projects/app/local-watermark-camera/dist/无广水印-debug-apk.zip`；本轮修复批量导入时间随机精度：Web 兜底和 Android 原生批量导入均按秒级随机，结束时间分钟会覆盖到 `:59`；`pnpm preview:app -- --slug local-watermark-camera --port 4293` 已启动临时预览，URL 为 `http://127.0.0.1:4293/`；Chrome headless 已生成主界面截图 `projects/app/local-watermark-camera/evidence/mobile-fixes-project.png`；APK 已包含标准水印样式调整、App 内原生 Camera2 水印相机页、默认地点下拉折叠、导入页地点联动和创建工程弹窗版源码；Android Studio 调试入口已加入，需在 IDE 内 `File > Sync Project with Gradle Files` 后选择 `app` 运行；`aapt dump permissions` 确认 APK 包含 `CAMERA`、`INTERNET`、`ACCESS_FINE_LOCATION`、`ACCESS_COARSE_LOCATION`、`WRITE_EXTERNAL_STORAGE(maxSdkVersion=28)`；底部导航为 `工程 / 导入 / 相册`；工程页 `+` 会打开创建工程弹窗；默认地点支持常用地点下拉并保存新增地点；相机按钮会进入 App 内原生水印相机页；拍照后由 AndroidBridge 写入手机系统相册；导入页底部有大号返回工程按钮且不再显示摄像头权限框；相册页有底部居中工程拍照入口和悬浮照片预览。
- **阻塞项**：当前 APK 仍为 debug 签名，本轮暂停 release 签名；视频保存仍是 WebM 导出路径，尚未接 Android 系统视频相册写入。

## Android APK

- **产物**：`projects/app/local-watermark-camera/dist/local-watermark-camera-debug.apk`
- **包名**：`com.devworkbench.watermark`
- **版本**：`0.1.0` / versionCode `1`
- **签名**：debug keystore，本地测试安装用；上架或正式分发前需要 release keystore。
- **权限**：`CAMERA`、`INTERNET`、`ACCESS_FINE_LOCATION`、`ACCESS_COARSE_LOCATION`、`WRITE_EXTERNAL_STORAGE(maxSdkVersion=28)`
- **系统相册写入**：拍照和批量保存会尝试写入 Android 系统媒体库 `DCIM/工程相册`。
- **SHA256**：`d8b557c283b89879b3e423d2c0ba424ea01e83c38250bd0b90e6d9645ed5ce20`
- **微信传输包**：`projects/app/local-watermark-camera/dist/无广水印-debug-apk.zip`
- **微信传输包 SHA256**：`c484be28ad9d80a25f921a411e195e95d09fc902c0aaae3572fa5d74ff0625f2`
