import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

// About dialog
const aboutOverlay = document.getElementById("about-overlay");
const aboutClose = document.getElementById("about-close");

listen("show-about", () => {
  aboutOverlay.style.display = "flex";
});

aboutClose.addEventListener("click", () => {
  aboutOverlay.style.display = "none";
});

aboutOverlay.addEventListener("click", (e) => {
  if (e.target === aboutOverlay) {
    aboutOverlay.style.display = "none";
  }
});

// DOM elements
const chipType = document.getElementById("chip-type");
const serialPort = document.getElementById("serial-port");
const baudRate = document.getElementById("baud-rate");
const refreshPortsBtn = document.getElementById("refresh-ports");
const spiSpeed = document.getElementById("spi-speed");
const spiMode = document.getElementById("spi-mode");
const flashSize = document.getElementById("flash-size");
const spiEnabled = document.getElementById("spi-enabled");
const spiToggle = document.getElementById("spi-toggle");
const spiContent = document.getElementById("spi-content");
const btnReadInfo = document.getElementById("btn-read-info");
const btnErase = document.getElementById("btn-erase");
const btnFlash = document.getElementById("btn-flash");
const progressFill = document.getElementById("progress-fill");
const progressText = document.getElementById("progress-text");
const logOutput = document.getElementById("log-output");

// Detail panel elements
const deviceInfoSection = document.getElementById("device-info-section");
const statusSection = document.getElementById("status-section");
const infoChip = document.getElementById("info-chip");
const infoMac = document.getElementById("info-mac");
const infoFeatures = document.getElementById("info-features");
const infoCrystal = document.getElementById("info-crystal");
const infoFlashSize = document.getElementById("info-flash-size");
const infoFlashType = document.getElementById("info-flash-type");
const infoManufacturer = document.getElementById("info-manufacturer");
const statusConnect = document.getElementById("status-connect");
const statusStub = document.getElementById("status-stub");
const statusErase = document.getElementById("status-erase");
const statusWrite = document.getElementById("status-write");
const statusVerify = document.getElementById("status-verify");
const detailSize = document.getElementById("detail-size");
const detailCompressed = document.getElementById("detail-compressed");
const detailSpeed = document.getElementById("detail-speed");
const detailTime = document.getElementById("detail-time");

// Log helper
function log(message, type = "info") {
  const line = document.createElement("div");
  line.className = `log-${type}`;
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${message}`;
  logOutput.appendChild(line);
  logOutput.scrollTop = logOutput.scrollHeight;
}

// Update progress
function setProgress(percent) {
  progressFill.style.width = `${percent}%`;
  if (percent <= 0) {
    progressText.textContent = "就绪";
  } else if (percent >= 100) {
    progressText.textContent = "完成";
  } else {
    progressText.textContent = `${Math.round(percent)}%`;
  }
}

// Refresh serial ports
async function refreshPorts() {
  try {
    const ports = await invoke("list_serial_ports");
    serialPort.innerHTML = '<option value="">选择串口...</option>';
    ports.forEach((port) => {
      const opt = document.createElement("option");
      opt.value = port;
      opt.textContent = port;
      serialPort.appendChild(opt);
    });
    log(`发现 ${ports.length} 个串口`, "info");
  } catch (e) {
    log(`获取串口失败: ${e}`, "error");
  }
}

// Browse for file
async function browseFile(index) {
  try {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Bin Files", extensions: ["bin"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });
    if (selected) {
      const row = document.querySelector(`.firmware-row[data-index="${index}"]`);
      row.querySelector(".file-path").value = selected;
      row.querySelector('input[type="checkbox"]').checked = true;
      log(`已选择文件: ${selected}`, "info");
    }
  } catch (e) {
    log(`选择文件失败: ${e}`, "error");
  }
}

// Get firmware entries
function getFirmwareEntries() {
  const entries = [];
  document.querySelectorAll(".firmware-row").forEach((row) => {
    const checked = row.querySelector('input[type="checkbox"]').checked;
    const filePath = row.querySelector(".file-path").value;
    const addr = row.querySelector(".flash-addr").value;
    if (checked && filePath) {
      entries.push({ file_path: filePath, address: addr });
    }
  });
  return entries;
}

// Flash firmware
async function flashFirmware() {
  const port = serialPort.value;
  if (!port) {
    log("请先选择串口!", "error");
    return;
  }

  const entries = getFirmwareEntries();
  if (entries.length === 0) {
    log("请至少选择一个固件文件!", "error");
    return;
  }

  // Release serial if occupied
  const wasSerialOpen = serialConnected;
  if (serialConnected) {
    await closeSerial();
    switchToLogTab();
  }

  btnFlash.disabled = true;
  btnErase.disabled = true;
  setProgress(0);
  resetStatusPanel();
  statusSection.style.display = "block";
  log("开始烧录...", "info");

  try {
    await invoke("flash_firmware", {
      port: port,
      chip: chipType.value,
      baudRate: parseInt(baudRate.value),
      flashMode: spiEnabled.checked ? spiMode.value : "",
      flashSize: spiEnabled.checked ? flashSize.value : "",
      flashFreq: spiEnabled.checked ? spiSpeed.value : "",
      firmwareEntries: entries,
    });
    setProgress(100);
    log("烧录完成!", "success");
  } catch (e) {
    log(`烧录失败: ${e}`, "error");
  } finally {
    btnFlash.disabled = false;
    btnErase.disabled = false;
    if (wasSerialOpen) {
      switchToSerialTab();
      await openSerial();
    }
  }
}

// Erase flash
async function eraseFlash() {
  const port = serialPort.value;
  if (!port) {
    log("请先选择串口!", "error");
    return;
  }

  // Release serial if occupied
  const wasSerialOpen = serialConnected;
  if (serialConnected) {
    await closeSerial();
    switchToLogTab();
  }

  btnFlash.disabled = true;
  btnErase.disabled = true;
  resetStatusPanel();
  statusSection.style.display = "block";
  log("正在擦除 Flash...", "warn");

  try {
    await invoke("erase_flash", {
      port: port,
      chip: chipType.value,
      baudRate: parseInt(baudRate.value),
    });
    log("Flash 擦除完成!", "success");
  } catch (e) {
    log(`擦除失败: ${e}`, "error");
  } finally {
    btnFlash.disabled = false;
    btnErase.disabled = false;
    if (wasSerialOpen) {
      switchToSerialTab();
      await openSerial();
    }
  }
}

// Read device info
async function readDeviceInfo() {
  const port = serialPort.value;
  if (!port) {
    log("请先选择串口!", "error");
    return;
  }

  // Release serial if occupied
  const wasSerialOpen = serialConnected;
  if (serialConnected) {
    await closeSerial();
    switchToLogTab();
  }

  btnReadInfo.disabled = true;
  btnFlash.disabled = true;
  btnErase.disabled = true;
  resetStatusPanel();
  deviceInfoSection.style.display = "block";
  log("正在读取设备信息...", "info");

  try {
    await invoke("read_device_info", {
      port: port,
      chip: chipType.value,
      baudRate: parseInt(baudRate.value),
    });
    log("设备信息读取完成!", "success");
  } catch (e) {
    log(`读取设备信息失败: ${e}`, "error");
  } finally {
    btnReadInfo.disabled = false;
    btnFlash.disabled = false;
    btnErase.disabled = false;
    if (wasSerialOpen) {
      switchToSerialTab();
      await openSerial();
    }
  }
}

// Event listeners
refreshPortsBtn.addEventListener("click", refreshPorts);
btnReadInfo.addEventListener("click", readDeviceInfo);
btnFlash.addEventListener("click", flashFirmware);
btnErase.addEventListener("click", eraseFlash);

// Browse buttons
document.querySelectorAll(".btn-browse").forEach((btn) => {
  btn.addEventListener("click", () => {
    const row = btn.closest(".firmware-row");
    const index = parseInt(row.dataset.index);
    browseFile(index);
  });
});

// Listen for progress events from backend
listen("flash-progress", (event) => {
  setProgress(event.payload.percent);
  if (event.payload.message) {
    log(event.payload.message, "info");
  }
});

// Reset status panel
function resetStatusPanel() {
  statusSection.style.display = "none";
  infoChip.textContent = "--";
  infoMac.textContent = "--";
  infoFeatures.innerHTML = "";
  infoCrystal.textContent = "--";
  infoFlashSize.textContent = "--";
  infoFlashType.textContent = "--";
  infoManufacturer.textContent = "--";
  statusConnect.textContent = "○";
  statusStub.textContent = "○";
  statusErase.textContent = "○";
  statusWrite.textContent = "○";
  statusVerify.textContent = "○";
  detailSize.textContent = "--";
  detailCompressed.textContent = "--";
  detailSpeed.textContent = "--";
  detailTime.textContent = "--";
}

// Parse esptool output line and update detail panel
function parseEsptoolOutput(message) {
  // Strip ANSI escape codes
  const msg = message.replace(/\x1b\[[0-9;]*[a-zA-Z]|\[[0-9;]*[A-Za-z]/g, "").trim();
  if (!msg) return;

  // Chip info: "Chip type:          ESP32-S3 (QFN56) (revision v0.2)"
  if (msg.startsWith("Chip type:")) {
    infoChip.textContent = msg.replace(/^Chip type:\s*/, "");
    statusConnect.textContent = "✅";
  }
  // Legacy format: "Chip is ESP32-S3..."
  else if (msg.startsWith("Chip is ")) {
    infoChip.textContent = msg.replace("Chip is ", "");
    statusConnect.textContent = "✅";
  }
  // Connected to
  else if (msg.startsWith("Connected to ")) {
    statusConnect.textContent = "✅";
  }
  // MAC address: "MAC:                3c:84:27:c7:4b:20"
  else if (msg.startsWith("MAC:")) {
    infoMac.textContent = msg.replace(/^MAC:\s*/, "");
  }
  // Features: "Features:           Wi-Fi, BT 5 (LE)..."
  else if (msg.startsWith("Features:")) {
    const features = msg.replace(/^Features:\s*/, "").split(",").map(s => s.trim()).filter(Boolean);
    infoFeatures.innerHTML = "";
    features.forEach(f => {
      const tag = document.createElement("span");
      tag.className = "info-tag";
      tag.textContent = f;
      infoFeatures.appendChild(tag);
    });
  }
  // Crystal: "Crystal frequency:  40MHz"
  else if (msg.startsWith("Crystal frequency:")) {
    const crystal = msg.replace(/^Crystal frequency:\s*/, "");
    infoCrystal.textContent = crystal;
    const freq = parseInt(crystal);
    if (freq === 40) {
      spiSpeed.value = "40m";
    } else if (freq === 26) {
      spiSpeed.value = "26m";
    } else if (freq === 20) {
      spiSpeed.value = "20m";
    }
  }
  // Legacy: "Crystal is 40MHz"
  else if (msg.startsWith("Crystal is ")) {
    const crystal = msg.replace("Crystal is ", "");
    infoCrystal.textContent = crystal;
    const freq = parseInt(crystal);
    if (freq === 40) {
      spiSpeed.value = "40m";
    } else if (freq === 26) {
      spiSpeed.value = "26m";
    } else if (freq === 20) {
      spiSpeed.value = "20m";
    }
  }
  // Flash size: "Detected flash size: 8MB"
  else if (msg.startsWith("Detected flash size:")) {
    const size = msg.replace(/^Detected flash size:\s*/, "");
    infoFlashSize.textContent = size;
    const sizeLower = size.toLowerCase().replace(/\s/g, "");
    const option = Array.from(flashSize.options).find(o => o.value === sizeLower);
    if (option) {
      flashSize.value = sizeLower;
    }
  }
  // Flash type: "Flash type set in eFuse: quad (4 data lines)"
  else if (msg.startsWith("Flash type set in eFuse:")) {
    const type = msg.replace(/^Flash type set in eFuse:\s*/, "");
    infoFlashType.textContent = type;
    if (type.includes("quad")) {
      spiMode.value = "qio";
    } else if (type.includes("dual")) {
      spiMode.value = "dio";
    }
  }
  // Manufacturer: "Manufacturer: 68"
  else if (msg.startsWith("Manufacturer:")) {
    const mfr = msg.replace(/^Manufacturer:\s*/, "");
    infoManufacturer.textContent = mfr;
  }
  // Device ID: "Device: 4017"
  else if (msg.startsWith("Device:")) {
    const dev = msg.replace(/^Device:\s*/, "");
    infoManufacturer.textContent = infoManufacturer.textContent + " / " + dev;
  }
  // Connecting
  else if (msg.includes("Connecting")) {
    statusSection.style.display = "block";
    statusConnect.textContent = "🔄";
  }
  // Stub uploaded: "Stub flasher running." or "Stub running"
  else if (msg.includes("Stub") && msg.includes("running")) {
    statusStub.textContent = "✅";
  }
  else if (msg.includes("Uploading stub")) {
    statusStub.textContent = "🔄";
  }
  // Flash erase
  else if (msg.includes("Flash will be erased")) {
    statusErase.textContent = "🔄";
  }
  else if (msg.includes("Compressed ")) {
    statusErase.textContent = "✅";
    statusWrite.textContent = "🔄";
    const match = msg.match(/Compressed (\d+) bytes to (\d+)/);
    if (match) {
      const original = parseInt(match[1]);
      const compressed = parseInt(match[2]);
      detailSize.textContent = formatBytes(original);
      detailCompressed.textContent = `${formatBytes(compressed)} (${Math.round(compressed/original*100)}%)`;
    }
  }
  // Write complete: "Wrote 8388608 bytes (1027262 compressed) at 0x00000000 in 38.0 seconds..."
  else if (msg.startsWith("Wrote ")) {
    statusWrite.textContent = "✅";
    const timeMatch = msg.match(/in ([\d.]+) seconds/);
    const speedMatch = msg.match(/effective ([\d.]+) kbit\/s/);
    if (timeMatch) {
      detailTime.textContent = `${timeMatch[1]} 秒`;
    }
    if (speedMatch) {
      const kbits = parseFloat(speedMatch[1]);
      detailSpeed.textContent = kbits > 1000 
        ? `${(kbits/1000).toFixed(1)} Mbit/s` 
        : `${kbits.toFixed(1)} kbit/s`;
    }
  }
  // Hash verified
  else if (msg.includes("Hash of data verified")) {
    statusVerify.textContent = "✅";
  }
  // Hard resetting
  else if (msg.includes("Hard resetting")) {
    statusConnect.textContent = "✅";
  }
}

function formatBytes(bytes) {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

// Listen for log events from backend
listen("flash-log", (event) => {
  const msg = event.payload.message;
  const level = event.payload.level || "info";
  log(msg, level);
  parseEsptoolOutput(msg);
});

// Initial port refresh
refreshPorts();

// SPI toggle
spiToggle.addEventListener("click", (e) => {
  // Prevent double-toggle when clicking the checkbox itself
  if (e.target === spiEnabled) return;
  spiEnabled.checked = !spiEnabled.checked;
  updateSpiVisibility();
});

spiEnabled.addEventListener("change", updateSpiVisibility);

function updateSpiVisibility() {
  spiContent.style.display = spiEnabled.checked ? "block" : "none";
}

// ====== Serial Debug ======
const tabLog = document.getElementById("tab-log");
const tabSerial = document.getElementById("tab-serial");
const serialPanel = document.getElementById("serial-panel");
const serialOutput = document.getElementById("serial-output");
const serialBaud = document.getElementById("serial-baud");
const btnSerialToggle = document.getElementById("btn-serial-toggle");
const btnSerialClear = document.getElementById("btn-serial-clear");
const btnSerialSend = document.getElementById("btn-serial-send");
const serialInput = document.getElementById("serial-input");
const serialNewline = document.getElementById("serial-newline");

let serialConnected = false;

// Tab switch helpers
function switchToLogTab() {
  tabLog.classList.add("active");
  tabSerial.classList.remove("active");
  logOutput.style.display = "block";
  serialPanel.style.display = "none";
}

function switchToSerialTab() {
  tabSerial.classList.add("active");
  tabLog.classList.remove("active");
  logOutput.style.display = "none";
  serialPanel.style.display = "flex";
}

// Tab switching
tabLog.addEventListener("click", async () => {
  tabLog.classList.add("active");
  tabSerial.classList.remove("active");
  logOutput.style.display = "block";
  serialPanel.style.display = "none";
  if (serialConnected) {
    await closeSerial();
  }
});

tabSerial.addEventListener("click", async () => {
  tabSerial.classList.add("active");
  tabLog.classList.remove("active");
  logOutput.style.display = "none";
  serialPanel.style.display = "flex";
  if (!serialConnected) {
    await openSerial();
  }
});

// Serial connect/disconnect
btnSerialToggle.addEventListener("click", async () => {
  if (serialConnected) {
    await closeSerial();
  } else {
    await openSerial();
  }
});

async function openSerial() {
  const port = serialPort.value;
  if (!port) {
    log("请先选择串口!", "error");
    return;
  }
  try {
    await invoke("serial_open", {
      port: port,
      baudRate: parseInt(serialBaud.value),
    });
    serialConnected = true;
    btnSerialToggle.textContent = "关闭串口";
    btnSerialToggle.classList.add("btn-primary");
    appendSerialText(`[已连接 ${port} @ ${serialBaud.value}]\n`, "serial-status");
  } catch (e) {
    log(`打开串口失败: ${e}`, "error");
  }
}

async function closeSerial() {
  try {
    await invoke("serial_close");
  } catch (e) {
    // ignore
  }
  serialConnected = false;
  btnSerialToggle.textContent = "打开串口";
  btnSerialToggle.classList.remove("btn-primary");
  appendSerialText("[已断开]\n", "serial-status");
}

// Serial send
btnSerialSend.addEventListener("click", sendSerialData);
serialInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") sendSerialData();
});

async function sendSerialData() {
  const data = serialInput.value;
  if (!data) return;
  if (!serialConnected) {
    log("请先打开串口!", "error");
    return;
  }
  try {
    await invoke("serial_send", {
      data: data,
      newline: serialNewline.checked,
    });
    appendSerialText(`← ${data}\n`, "serial-tx");
    serialInput.value = "";
  } catch (e) {
    appendSerialText(`[发送失败: ${e}]\n`, "serial-error");
  }
}

// Serial clear
btnSerialClear.addEventListener("click", () => {
  serialOutput.innerHTML = "";
});

// Listen for serial data from backend
listen("serial-data", (event) => {
  appendSerialText(event.payload.data, "serial-rx");
});

function appendSerialText(text, className) {
  const span = document.createElement("span");
  span.className = className || "";
  span.textContent = text;
  serialOutput.appendChild(span);
  serialOutput.scrollTop = serialOutput.scrollHeight;
}
