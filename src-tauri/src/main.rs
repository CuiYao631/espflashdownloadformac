#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::io::{BufReader, Read};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

/// Read from a stream splitting on both \r and \n (esptool uses \r for progress)
fn read_lines_cr_lf<R: Read>(reader: R, mut callback: impl FnMut(&str)) {
    let mut buf_reader = BufReader::new(reader);
    let mut line = String::new();
    let mut byte = [0u8; 1];
    loop {
        match buf_reader.read(&mut byte) {
            Ok(0) => break,
            Ok(_) => {
                let ch = byte[0] as char;
                if ch == '\r' || ch == '\n' {
                    let trimmed = line.trim().to_string();
                    if !trimmed.is_empty() {
                        callback(&trimmed);
                    }
                    line.clear();
                } else {
                    line.push(ch);
                }
            }
            Err(_) => break,
        }
    }
    let trimmed = line.trim().to_string();
    if !trimmed.is_empty() {
        callback(&trimmed);
    }
}

#[derive(Debug, Serialize, Deserialize)]
struct FirmwareEntry {
    file_path: String,
    address: String,
}

#[derive(Clone, Serialize)]
struct ProgressPayload {
    percent: f64,
    message: String,
}

#[derive(Clone, Serialize)]
struct LogPayload {
    message: String,
    level: String,
}

fn emit_log(app: &AppHandle, message: &str, level: &str) {
    let _ = app.emit(
        "flash-log",
        LogPayload {
            message: message.to_string(),
            level: level.to_string(),
        },
    );
}

fn emit_progress(app: &AppHandle, percent: f64, message: &str) {
    let _ = app.emit(
        "flash-progress",
        ProgressPayload {
            percent,
            message: message.to_string(),
        },
    );
}

/// Find esptool.py in system PATH or common locations
fn find_esptool() -> Result<String, String> {
    // Try esptool.py directly
    if let Ok(output) = Command::new("esptool.py").arg("version").output() {
        if output.status.success() {
            return Ok("esptool.py".to_string());
        }
    }

    // Try python3 -m esptool
    if let Ok(output) = Command::new("python3")
        .args(["-m", "esptool", "version"])
        .output()
    {
        if output.status.success() {
            return Ok("python3 -m esptool".to_string());
        }
    }

    // Try common homebrew paths
    let common_paths = [
        "/opt/homebrew/bin/esptool.py",
        "/usr/local/bin/esptool.py",
    ];

    for path in &common_paths {
        if std::path::Path::new(path).exists() {
            return Ok(path.to_string());
        }
    }

    Err("未找到 esptool.py，请先安装: pip3 install esptool".to_string())
}

/// Build esptool command with proper arguments
fn build_esptool_cmd(esptool: &str) -> Command {
    if esptool.contains("python3 -m") {
        let mut cmd = Command::new("python3");
        cmd.args(["-m", "esptool"]);
        cmd
    } else {
        Command::new(esptool)
    }
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<String>, String> {
    let ports = serialport::available_ports().map_err(|e| format!("获取串口列表失败: {}", e))?;
    Ok(ports
        .into_iter()
        .map(|p| p.port_name)
        .filter(|name| name.contains("tty."))
        .collect())
}

#[tauri::command]
async fn flash_firmware(
    app: AppHandle,
    port: String,
    chip: String,
    baud_rate: u32,
    flash_mode: String,
    flash_size: String,
    flash_freq: String,
    firmware_entries: Vec<FirmwareEntry>,
) -> Result<(), String> {
    let esptool = find_esptool()?;

    emit_log(&app, &format!("使用 esptool: {}", esptool), "info");
    emit_log(
        &app,
        &format!("芯片: {}, 串口: {}, 波特率: {}", chip, port, baud_rate),
        "info",
    );
    emit_progress(&app, 5.0, "正在连接设备...");

    let mut cmd = build_esptool_cmd(&esptool);

    cmd.args(["--chip", &chip]);
    cmd.args(["--port", &port]);
    cmd.args(["--baud", &baud_rate.to_string()]);

    cmd.arg("write_flash");

    // Only add SPI params if explicitly set (non-empty)
    if !flash_mode.is_empty() {
        cmd.args(["--flash_mode", &flash_mode]);
    }
    if !flash_size.is_empty() {
        let size_upper = flash_size.to_uppercase();
        cmd.args(["--flash_size", &size_upper]);
    }
    if !flash_freq.is_empty() {
        cmd.args(["--flash_freq", &flash_freq]);
    }

    for entry in &firmware_entries {
        cmd.arg(&entry.address);
        cmd.arg(&entry.file_path);
    }

    emit_progress(&app, 10.0, "正在烧录固件...");
    emit_log(&app, &format!("执行命令: {:?}", cmd), "info");

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("执行 esptool 失败: {}", e))?;

    // Read stdout in real-time
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_clone = app.clone();
    let stdout_handle = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            read_lines_cr_lf(stdout, |line| {
                emit_log(&app_clone, line, "info");
                if line.contains('%') {
                    if let Some(pct) = parse_progress(line) {
                        emit_progress(&app_clone, 10.0 + pct * 90.0, "");
                    }
                }
            });
        }
    });

    let app_clone2 = app.clone();
    let stderr_handle = std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            read_lines_cr_lf(stderr, |line| {
                emit_log(&app_clone2, line, "warn");
            });
        }
    });

    let _ = stdout_handle.join();
    let _ = stderr_handle.join();

    let status = child.wait().map_err(|e| format!("等待进程结束失败: {}", e))?;

    if status.success() {
        emit_progress(&app, 100.0, "烧录完成!");
        Ok(())
    } else {
        Err(format!("esptool 退出码: {}", status))
    }
}

#[tauri::command]
async fn erase_flash(
    app: AppHandle,
    port: String,
    chip: String,
    baud_rate: u32,
) -> Result<(), String> {
    let esptool = find_esptool()?;

    emit_log(&app, "正在擦除 Flash...", "warn");
    emit_progress(&app, 10.0, "正在擦除...");

    let mut cmd = build_esptool_cmd(&esptool);
    cmd.args(["--chip", &chip]);
    cmd.args(["--port", &port]);
    cmd.args(["--baud", &baud_rate.to_string()]);
    cmd.arg("erase_flash");

    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("执行 esptool 失败: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_clone = app.clone();
    let stdout_handle = std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            read_lines_cr_lf(stdout, |line| {
                emit_log(&app_clone, line, "info");
            });
        }
    });

    let app_clone2 = app.clone();
    let stderr_handle = std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            read_lines_cr_lf(stderr, |line| {
                emit_log(&app_clone2, line, "warn");
            });
        }
    });

    let _ = stdout_handle.join();
    let _ = stderr_handle.join();

    let status = child.wait().map_err(|e| format!("等待进程结束失败: {}", e))?;

    if status.success() {
        emit_progress(&app, 100.0, "擦除完成!");
        emit_log(&app, "Flash 擦除完成!", "success");
        Ok(())
    } else {
        Err(format!("esptool 擦除失败，退出码: {}", status))
    }
}

fn parse_progress(line: &str) -> Option<f64> {
    if let Some(pct_pos) = line.find('%') {
        let before = &line[..pct_pos];
        let num_start = before
            .rfind(|c: char| !c.is_ascii_digit() && c != '.')
            .map(|i| i + 1)
            .unwrap_or(0);
        if let Ok(pct) = before[num_start..].trim().parse::<f64>() {
            return Some(pct / 100.0);
        }
    }
    None
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            flash_firmware,
            erase_flash,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
