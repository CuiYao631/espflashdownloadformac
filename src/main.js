import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

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
  }
}

// Erase flash
async function eraseFlash() {
  const port = serialPort.value;
  if (!port) {
    log("请先选择串口!", "error");
    return;
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
  }
}

// Event listeners
refreshPortsBtn.addEventListener("click", refreshPorts);
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
  infoFeatures.textContent = "--";
  infoCrystal.textContent = "--";
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
  // Chip info: "Chip is ESP32-S3 (QFN56) (revision v0.2)"
  if (message.startsWith("Chip is ")) {

    infoChip.textContent = message.replace("Chip is ", "");
    statusConnect.textContent = "✅";
  }
  // MAC address
  else if (message.startsWith("MAC: ")) {
    infoMac.textContent = message.replace("MAC: ", "");
  }
  // Features
  else if (message.startsWith("Features: ")) {
    infoFeatures.textContent = message.replace("Features: ", "");
  }
  // Crystal
  else if (message.startsWith("Crystal is ")) {
    infoCrystal.textContent = message.replace("Crystal is ", "");
  }
  // Connecting
  else if (message.includes("Connecting")) {
    statusSection.style.display = "block";
    statusConnect.textContent = "🔄";
  }
  // Stub uploaded
  else if (message.includes("Stub running")) {
    statusStub.textContent = "✅";
  }
  else if (message.includes("Uploading stub")) {
    statusStub.textContent = "🔄";
  }
  // Flash erase
  else if (message.includes("Flash will be erased")) {
    statusErase.textContent = "🔄";
  }
  else if (message.includes("Compressed ")) {
    statusErase.textContent = "✅";
    statusWrite.textContent = "🔄";
    // "Compressed 16384752 bytes to 8203230..."
    const match = message.match(/Compressed (\d+) bytes to (\d+)/);
    if (match) {
      const original = parseInt(match[1]);
      const compressed = parseInt(match[2]);
      detailSize.textContent = formatBytes(original);
      detailCompressed.textContent = `${formatBytes(compressed)} (${Math.round(compressed/original*100)}%)`;
    }
  }
  // Write complete: "Wrote 16384752 bytes (8203230 compressed) at 0x00000000 in 95.7 seconds (effective 1370.4 kbit/s)..."
  else if (message.startsWith("Wrote ")) {
    statusWrite.textContent = "✅";
    const timeMatch = message.match(/in ([\d.]+) seconds/);
    const speedMatch = message.match(/effective ([\d.]+) kbit\/s/);
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
  else if (message.includes("Hash of data verified")) {
    statusVerify.textContent = "✅";
  }
  // Hard resetting
  else if (message.includes("Hard resetting")) {
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
  if (level === "info") {
    parseEsptoolOutput(msg);
  }
});

// Initial port refresh
refreshPorts();

// SPI toggle
spiToggle.addEventListener("click", (e) => {
  if (e.target === spiEnabled || e.target.closest('.toggle-switch')) return;
  spiEnabled.checked = !spiEnabled.checked;
  updateSpiVisibility();
});

spiEnabled.addEventListener("change", updateSpiVisibility);

function updateSpiVisibility() {
  spiContent.style.display = spiEnabled.checked ? "block" : "none";
}
