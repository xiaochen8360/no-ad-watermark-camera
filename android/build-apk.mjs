import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(root);
const sdkRoot = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.HOME, "Library/Android/sdk");
const javaHome = process.env.JAVA_HOME || "/Applications/Android Studio.app/Contents/jbr/Contents/Home";
const javaBin = path.join(javaHome, "bin");
const buildTools = path.join(sdkRoot, "build-tools/35.0.1");
const platformJar = path.join(sdkRoot, "platforms/android-35/android.jar");
const buildDir = path.join(root, "build");
const distDir = path.join(projectRoot, "dist");
const assetsDir = path.join(root, "assets");

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function copyDir(source, target) {
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(sourcePath, targetPath);
    else fs.copyFileSync(sourcePath, targetPath);
  }
}

function listFiles(dir, predicate) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listFiles(fullPath, predicate));
    else if (predicate(fullPath)) found.push(fullPath);
  }
  return found;
}

fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(distDir, { recursive: true });
copyDir(path.join(projectRoot, "app"), assetsDir);

const compiledResources = path.join(buildDir, "resources.zip");
run(path.join(buildTools, "aapt2"), ["compile", "--dir", path.join(root, "res"), "-o", compiledResources]);

const linkedApk = path.join(buildDir, "linked.apk");
run(path.join(buildTools, "aapt2"), [
  "link",
  "-o", linkedApk,
  "-I", platformJar,
  "--manifest", path.join(root, "AndroidManifest.xml"),
  "--java", path.join(buildDir, "gen"),
  "--min-sdk-version", "26",
  "--target-sdk-version", "35",
  "-A", assetsDir,
  compiledResources
]);

const classDir = path.join(buildDir, "classes");
fs.mkdirSync(classDir, { recursive: true });
const sources = [
  ...fs.readdirSync(path.join(root, "src/com/devworkbench/watermark")).map((file) => path.join(root, "src/com/devworkbench/watermark", file)),
  path.join(buildDir, "gen/com/devworkbench/watermark/R.java")
];
run(path.join(javaBin, "javac"), [
  "-source", "8",
  "-target", "8",
  "-bootclasspath", platformJar,
  "-d", classDir,
  ...sources
]);

const dexDir = path.join(buildDir, "dex");
fs.mkdirSync(dexDir, { recursive: true });
run(path.join(buildTools, "d8"), [
  "--lib", platformJar,
  "--output", dexDir,
  ...listFiles(classDir, (file) => file.endsWith(".class"))
]);

const unsignedApk = path.join(buildDir, "unsigned.apk");
fs.copyFileSync(linkedApk, unsignedApk);
run("zip", ["-q", "-j", unsignedApk, path.join(dexDir, "classes.dex")]);

const debugKeystore = path.join(root, "debug.keystore");
if (!fs.existsSync(debugKeystore)) {
  run(path.join(javaBin, "keytool"), [
    "-genkeypair",
    "-v",
    "-keystore", debugKeystore,
    "-storepass", "android",
    "-alias", "androiddebugkey",
    "-keypass", "android",
    "-keyalg", "RSA",
    "-keysize", "2048",
    "-validity", "10000",
    "-dname", "CN=Android Debug,O=Android,C=US"
  ]);
}

const alignedApk = path.join(buildDir, "local-watermark-camera-aligned.apk");
run(path.join(buildTools, "zipalign"), ["-f", "4", unsignedApk, alignedApk]);

const outputApk = path.join(distDir, "local-watermark-camera-debug.apk");
run(path.join(buildTools, "apksigner"), [
  "sign",
  "--ks", debugKeystore,
  "--ks-pass", "pass:android",
  "--key-pass", "pass:android",
  "--out", outputApk,
  alignedApk
]);
run(path.join(buildTools, "apksigner"), ["verify", "--verbose", outputApk]);

console.log(`APK built: ${outputApk}`);
