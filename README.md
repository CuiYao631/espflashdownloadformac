# ESP Flash Download Tool for macOS

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="ESP Flash Download Tool">
</p>

<p align="center">
  ⚡ 基于 Tauri 框架的 ESP 系列芯片固件烧录工具，macOS 原生应用。
</p>

## 功能特性

- **多芯片支持** — ESP32、ESP32-S2、ESP32-S3、ESP32-C3、ESP32-C6、ESP8266
- **串口管理** — 自动检测可用串口，支持多波特率（115200 ~ 1500000）
- **固件烧录** — 支持多固件文件同时烧录，可自定义烧录地址
- **设备信息读取** — 一键获取芯片型号、MAC 地址、Flash 大小、特性等
- **SPI 参数配置** — Flash Mode / Size / Speed，支持从设备自动识别并填充
- **Flash 擦除** — 完整擦除 Flash 存储
- **串口调试** — 内置串口终端，支持数据收发，自动与烧录操作互斥
- **实时反馈** — 烧录进度条、状态流水线、详细日志输出

## 前置要求

1. **Rust** — [安装 Rust](https://rustup.rs/)
2. **Node.js** — v18+（[下载](https://nodejs.org/)）
3. **esptool** — ESP 官方烧录工具
   ```bash
   pip3 install esptool
   ```

## 开发

```bash
# 安装前端依赖
npm install

# 开发模式（热重载）
npm run tauri dev

# 构建发布版本
npm run tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`。

## 使用方法

1. 将 ESP 设备通过 USB 连接到 Mac
2. 选择正确的芯片类型和串口
3. 点击"读取设备信息"确认连接正常（可选）
4. 添加需要烧录的 .bin 文件并设置对应的烧录地址
5. 开启"高级参数"调整 SPI 配置（若已读取设备信息会自动填充）
6. 点击"开始烧录"

### 串口调试

日志面板切换到"串口调试"标签即可打开内置终端，支持：
- 自定义波特率
- 发送文本数据（可选附加换行）
- 烧录时自动释放串口，完成后自动恢复

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | HTML / CSS / JavaScript + Vite |
| 后端 | Rust + Tauri 2 |
| 串口 | serialport-rs |
| 烧录 | esptool.py（系统调用） |

## 项目结构

```
├── index.html          # 主页面
├── src/
│   ├── main.js         # 前端逻辑
│   └── style.css       # 样式
├── src-tauri/
│   ├── src/main.rs     # Rust 后端
│   ├── Cargo.toml      # Rust 依赖
│   └── tauri.conf.json # Tauri 配置
└── package.json
```

## License

MIT
