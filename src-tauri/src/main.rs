#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::io::{BufReader, Read, Write};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager};

// Global serial port handle
struct SerialState {
    port: Option<Box<dyn serialport::SerialPort>>,
    reading: bool,
}

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

#[tauri::command]
async fn read_device_info(
    app: AppHandle,
    port: String,
    chip: String,
    baud_rate: u32,
) -> Result<(), String> {
    let esptool = find_esptool()?;

    emit_log(&app, "正在读取设备信息...", "info");

    let mut cmd = build_esptool_cmd(&esptool);
    cmd.args(["--chip", &chip]);
    cmd.args(["--port", &port]);
    cmd.args(["--baud", &baud_rate.to_string()]);
    cmd.arg("flash_id");

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
        emit_log(&app, "设备信息读取完成!", "success");
        Ok(())
    } else {
        Err(format!("读取设备信息失败，退出码: {}", status))
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

#[derive(Clone, Serialize)]
struct SerialDataPayload {
    data: String,
}

#[tauri::command]
async fn serial_open(
    app: AppHandle,
    port: String,
    baud_rate: u32,
) -> Result<(), String> {
    let state = app.state::<Arc<Mutex<SerialState>>>();

    // Close existing connection first
    {
        let mut s = state.lock().unwrap();
        s.reading = false;
        s.port = None;
    }

    // Small delay to let read thread stop
    std::thread::sleep(std::time::Duration::from_millis(100));

    let port_handle = serialport::new(&port, baud_rate)
        .timeout(std::time::Duration::from_millis(100))
        .open()
        .map_err(|e| format!("打开串口失败: {}", e))?;

    let read_port = port_handle
        .try_clone()
        .map_err(|e| format!("克隆串口失败: {}", e))?;

    {
        let mut s = state.lock().unwrap();
        s.port = Some(port_handle);
        s.reading = true;
    }

    // Start reading thread
    let state_clone = Arc::clone(&state);
    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut read_port = read_port;
        let mut buf = [0u8; 1024];
        loop {
            {
                let s = state_clone.lock().unwrap();
                if !s.reading {
                    break;
                }
            }
            match read_port.read(&mut buf) {
                Ok(n) if n > 0 => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit("serial-data", SerialDataPayload { data });
                }
                Ok(_) => {}
                Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn serial_close(app: AppHandle) -> Result<(), String> {
    let state = app.state::<Arc<Mutex<SerialState>>>();
    let mut s = state.lock().unwrap();
    s.reading = false;
    s.port = None;
    Ok(())
}

#[tauri::command]
async fn serial_send(app: AppHandle, data: String, newline: bool) -> Result<(), String> {
    let state = app.state::<Arc<Mutex<SerialState>>>();
    let mut s = state.lock().unwrap();
    if let Some(ref mut port) = s.port {
        let send_data = if newline {
            format!("{}\r\n", data)
        } else {
            data
        };
        port.write_all(send_data.as_bytes())
            .map_err(|e| format!("发送数据失败: {}", e))?;
        Ok(())
    } else {
        Err("串口未打开".to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_menu = SubmenuBuilder::new(app, "ESP Flash Tool")
                .text("about", "关于 ESP Flash Tool")
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let edit_menu = SubmenuBuilder::new(app, "编辑")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let window_menu = SubmenuBuilder::new(app, "窗口")
                .minimize()
                .maximize()
                .separator()
                .close_window()
                .build()?;

            let help_menu = SubmenuBuilder::new(app, "帮助")
                .text("docs", "使用文档")
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_menu)
                .item(&edit_menu)
                .item(&window_menu)
                .item(&help_menu)
                .build()?;

            app.set_menu(menu)?;
            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id().as_ref() == "about" {
                let _ = app.emit("show-about", ());
            }
        })
        .manage(Arc::new(Mutex::new(SerialState {
            port: None,
            reading: false,
        })))
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            flash_firmware,
            erase_flash,
            read_device_info,
            serial_open,
            serial_close,
            serial_send,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
