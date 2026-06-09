#!/bin/bash
# 构建并重新打包 DMG（包含修复脚本）
set -e

echo "⚡ 构建 Tauri 应用..."
npm run tauri build

echo "📦 重新打包 DMG..."

APP_PATH=$(find src-tauri/target/release/bundle/macos -name "*.app" -maxdepth 1 | head -1)
if [ -z "$APP_PATH" ]; then
    echo "❌ 未找到 .app 文件"
    exit 1
fi

DMG_NAME="ESP Flash Download Tool.dmg"
DMG_DIR="src-tauri/target/release/bundle/dmg"
STAGING_DIR="${TMPDIR:-/tmp}/dmg-staging"

# 清理并准备临时目录
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"

# 复制 .app 和修复脚本
cp -R "$APP_PATH" "$STAGING_DIR/"
cp "src-tauri/resources/修复无法打开.command" "$STAGING_DIR/"
chmod +x "$STAGING_DIR/修复无法打开.command"

# 创建 Applications 快捷方式
ln -s /Applications "$STAGING_DIR/Applications"

# 删除旧 DMG 并创建新的
rm -f "$DMG_DIR"/*.dmg
mkdir -p "$DMG_DIR"

hdiutil create -volname "ESP Flash Download Tool" \
    -srcfolder "$STAGING_DIR" \
    -ov -format UDZO \
    "$DMG_DIR/$DMG_NAME"

# 清理
rm -rf "$STAGING_DIR"

echo "✅ DMG 已生成: $DMG_DIR/$DMG_NAME"
