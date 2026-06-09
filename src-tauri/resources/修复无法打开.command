#!/bin/bash
# ESP Flash Download Tool - 解除 macOS 安全限制
# 双击此脚本即可解除 Gatekeeper 隔离

APP_NAME="ESP Flash Download Tool.app"

# 尝试常见安装位置
if [ -d "/Applications/$APP_NAME" ]; then
    APP_PATH="/Applications/$APP_NAME"
elif [ -d "$HOME/Applications/$APP_NAME" ]; then
    APP_PATH="$HOME/Applications/$APP_NAME"
else
    # 同目录
    SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
    if [ -d "$SCRIPT_DIR/$APP_NAME" ]; then
        APP_PATH="$SCRIPT_DIR/$APP_NAME"
    else
        echo "❌ 未找到 $APP_NAME"
        echo "请先将应用拖入 /Applications 文件夹，然后再运行此脚本。"
        echo ""
        read -p "按回车键退出..."
        exit 1
    fi
fi

echo "⚡ 正在解除安全限制..."
echo "   $APP_PATH"
echo ""

xattr -cr "$APP_PATH"

if [ $? -eq 0 ]; then
    echo "✅ 完成！现在可以正常打开应用了。"
else
    echo "❌ 操作失败，请尝试手动执行："
    echo "   sudo xattr -cr \"$APP_PATH\""
fi

echo ""
read -p "按回车键退出..."
