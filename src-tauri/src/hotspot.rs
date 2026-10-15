//! "Direct" mode: this device opens its own Wi-Fi hotspot. Nearby devices join it
//! (Android: scan the WIFI: QR with the camera) and then transfer over plain LAN mode
//! at Wi-Fi speed — no shared router or internet needed.

use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

static RUNNING: AtomicBool = AtomicBool::new(false);

pub fn start_tracked() -> Result<HotspotInfo, String> {
    let info = start()?;
    RUNNING.store(true, Ordering::SeqCst);
    Ok(info)
}

pub fn stop_tracked() -> Result<(), String> {
    RUNNING.store(false, Ordering::SeqCst);
    stop()
}

/// Called on app exit so we never leave the user's Wi-Fi in hotspot mode.
pub fn stop_if_running() -> Result<(), String> {
    if RUNNING.swap(false, Ordering::SeqCst) { stop() } else { Ok(()) }
}

#[derive(Serialize, Clone)]
pub struct HotspotInfo {
    pub ssid: String,
    pub password: String,
}

fn credentials() -> HotspotInfo {
    let r = uuid::Uuid::new_v4().simple().to_string();
    HotspotInfo { ssid: format!("GigaShare-{}", r[..4].to_uppercase()), password: r[4..16].to_string() }
}

#[cfg(target_os = "linux")]
const CON_NAME: &str = "GigaShare";

#[cfg(target_os = "linux")]
fn nmcli(args: &[&str]) -> Result<String, String> {
    let out = std::process::Command::new("nmcli")
        .args(args)
        .output()
        .map_err(|e| format!("nmcli not available (NetworkManager required): {e}"))?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[cfg(target_os = "linux")]
pub fn start() -> Result<HotspotInfo, String> {
    let info = credentials();
    let _ = nmcli(&["connection", "delete", CON_NAME]);
    nmcli(&["device", "wifi", "hotspot", "con-name", CON_NAME, "ssid", &info.ssid, "password", &info.password])
        .map_err(|e| format!("Could not start hotspot: {e}"))?;
    Ok(info)
}

#[cfg(target_os = "linux")]
pub fn stop() -> Result<(), String> {
    let _ = nmcli(&["connection", "down", CON_NAME]);
    let _ = nmcli(&["connection", "delete", CON_NAME]);
    Ok(())
}

#[cfg(windows)]
fn tethering(script_body: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    // WinRT NetworkOperatorTetheringManager = Windows "Mobile hotspot".
    let script = format!(
        r#"$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$gen = ([System.WindowsRuntimeSystemExtensions].GetMethods() | ? {{ $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' }})[0]
Function Await($t, $type) {{ $n = $gen.MakeGenericMethod($type).Invoke($null, @($t)); $n.Wait(-1) | Out-Null; $n.Result }}
Function AwaitAction($a) {{ [System.WindowsRuntimeSystemExtensions]::AsTask($a).Wait(-1) | Out-Null }}
$p = [Windows.Networking.Connectivity.NetworkInformation,Windows.Networking.Connectivity,ContentType=WindowsRuntime]::GetInternetConnectionProfile()
if (-not $p) {{ throw 'Mobile hotspot needs an active network connection to share' }}
$tm = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringManager,Windows.Networking.NetworkOperators,ContentType=WindowsRuntime]::CreateFromConnectionProfile($p)
$R = [Windows.Networking.NetworkOperators.NetworkOperatorTetheringOperationResult]
{script_body}"#
    );
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("Mobile hotspot failed: {}", String::from_utf8_lossy(&out.stderr).lines().next().unwrap_or("")))
    }
}

#[cfg(windows)]
pub fn start() -> Result<HotspotInfo, String> {
    let info = credentials();
    tethering(&format!(
        "$c = $tm.GetCurrentAccessPointConfiguration(); $c.Ssid = '{}'; $c.Passphrase = '{}'\n\
         AwaitAction ($tm.ConfigureAccessPointAsync($c))\n\
         $r = Await ($tm.StartTetheringAsync()) $R\n\
         if ($r.Status -ne 'Success') {{ throw \"$($r.Status) $($r.AdditionalErrorMessage)\" }}",
        info.ssid, info.password
    ))?;
    Ok(info)
}

#[cfg(windows)]
pub fn stop() -> Result<(), String> {
    tethering("$r = Await ($tm.StopTetheringAsync()) $R")
}

#[cfg(not(any(target_os = "linux", windows)))]
pub fn start() -> Result<HotspotInfo, String> {
    Err("Start the direct link on your computer, then scan its QR code with this phone's camera.".into())
}

#[cfg(not(any(target_os = "linux", windows)))]
pub fn stop() -> Result<(), String> {
    Ok(())
}
