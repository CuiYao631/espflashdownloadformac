# ESP Flash Download Tool for macOS

基于 Tauri 框架的 ESP8266/ESP32 固件烧录工具，macOS 原生应用。

## 功能

- 支持 ESP32、ESP32-S2、ESP32-S3、ESP32-C3、ESP8266 芯片
- 串口自动检测
- 多固件文件烧录（支持设置不同烧录地址）
- SPI 参数配置（速度、模式、Flash 大小）
- 可调节波特率（115200 ~ 1500000）
- Flash 擦除功能
- 实时进度显示和日志输出

## 前置要求

1. 安装 [Rust](https://rustup.rs/)
2. 安装 [Node.js](https://nodejs.org/) (v18+)
3. 安装 esptool:
   ```bash
   pip3 install esptool
   ```

## 开发

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri dev

# 构建发布版本
npm run tauri build
```

## 使用方法

1. 将 ESP 设备通过 USB 连接到 Mac
2. 选择正确的芯片类型
3. 选择串口（点击刷新按钮）
4. 添加需要烧录的 bin 文件并设置对应的烧录地址
5. 配置 SPI 参数
6. 点击"开始烧录"

## 技术栈

- **前端**: HTML/CSS/JavaScript + Vite
- **后端**: Rust + Tauri 2
- **烧录工具**: esptool.py
