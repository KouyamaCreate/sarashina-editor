import { spawnSync } from 'node:child_process';
import { mkdir, cp, writeFile } from 'node:fs/promises';
const app = '../Sarashina Editor Setup.app';
await mkdir(`${app}/Contents/MacOS`, {recursive: true});
await mkdir(`${app}/Contents/Resources`, {recursive: true});
const result = spawnSync('xcrun', ['swiftc', '-module-cache-path', '/tmp/sarashina-swift-cache', '-target', 'arm64-apple-macos12.0', 'native/Setup.swift', '-o', `${app}/Contents/MacOS/SarashinaSetup`], {stdio: 'inherit'});
if (result.status !== 0) process.exit(result.status || 1);
await cp('plugins/sarashina-editor', `${app}/Contents/Resources/plugin`, {recursive: true});
await writeFile(`${app}/Contents/Info.plist`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>SarashinaSetup</string>
<key>CFBundleIdentifier</key><string>local.sarashina-editor.setup</string>
<key>CFBundleName</key><string>Sarashina Editor Setup</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>0.1.3</string>
<key>CFBundleShortVersionString</key><string>0.1.3</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>`);
const test = spawnSync(`${app}/Contents/MacOS/SarashinaSetup`, ['--self-test'], {stdio: 'inherit'});
if (test.status !== 0) process.exit(test.status || 1);
const sign = spawnSync('codesign', ['--force', '--deep', '--sign', '-', app], {stdio: 'inherit'});
if (sign.status !== 0) process.exit(sign.status || 1);
const zip = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, '../sarashina-editor-macos-setup-0.1.3.zip'], {stdio: 'inherit'});
if (zip.status !== 0) process.exit(zip.status || 1);
console.log('Apple Silicon用セットアップアプリをビルドしました（ad-hoc署名、公証なし）。');
