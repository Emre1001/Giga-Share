# =========================================================
#  Giga-Share - Full Build Script
#  Builds: Setup EXE, Portable EXE, MSI, Android APK
#  Output: ./dist-apps/
# =========================================================
param(
    [switch]$SkipAndroid,
    [switch]$SkipWindows
)

$ErrorActionPreference = "Continue"
$Root  = $PSScriptRoot
$Dist  = Join-Path $Root "dist-apps"
$TauriBundle = Join-Path $Root "src-tauri\target\release\bundle"
$AppName = "Giga-Share"

function Write-Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Cyan
    Write-Host "---------------------------------------------------" -ForegroundColor DarkGray
}

function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  [ERR] $msg" -ForegroundColor Red }

function Copy-Artifact($src, $dest, $label) {
    if (Test-Path $src) {
        Copy-Item $src $dest -Force | Out-Null
        Write-Ok "$label -> $dest"
        return $true
    } else {
        Write-Warn "$label not found at: $src"
        return $false
    }
}

# -- Header ---------------------------------------------------
Write-Host ""
Write-Host "  Giga-Share -- Full Production Build" -ForegroundColor Magenta
Write-Host "  ====================================" -ForegroundColor Magenta
Write-Host ""

# -- Step 0: Ensure dist-apps exists -------------------------
New-Item -ItemType Directory -Force -Path $Dist | Out-Null
New-Item -ItemType Directory -Force -Path "$Dist\Giga-Share-Portable" | Out-Null

# -- Step 1: Frontend build ----------------------------------
Write-Step 1 4 "Building Frontend (Vite)..."
Push-Location $Root
$npmResult = & npm run build 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Frontend build failed! Output:"
    $npmResult | Write-Host
    Pop-Location
    Pause
    exit 1
}
Write-Ok "Frontend built successfully."
Pop-Location

# -- Step 2: Windows Build -----------------------------------
if (-not $SkipWindows) {
    Write-Step 2 4 "Building Windows App (Setup EXE + MSI + Portable EXE)..."

    Push-Location $Root

    # Set JAVA_HOME if local JDK is present
    $localJdk = Get-ChildItem -Path "$Root\jdk17" -Filter "jdk-*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($localJdk) {
        $env:JAVA_HOME = $localJdk.FullName
        $env:PATH = "$($localJdk.FullName)\bin;$($env:PATH)"
        Write-Host "  [i] Using local JDK: $($localJdk.FullName)" -ForegroundColor DarkGray
    }

    & npx tauri build 2>&1 | Write-Host

    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Tauri Windows build exited with error -- checking for partial output..."
    }

    # NSIS Setup EXE
    $nsisExe = Get-ChildItem -Path "$TauriBundle\nsis" -Filter "*-setup.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $nsisExe) {
        $nsisExe = Get-ChildItem -Path "$TauriBundle\nsis" -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($nsisExe) { Copy-Artifact $nsisExe.FullName "$Dist\$AppName-Setup.exe" "Setup EXE" }
    else { Write-Warn "Setup EXE not found (NSIS bundle missing)" }

    # MSI
    $msiFile = Get-ChildItem -Path "$TauriBundle\msi" -Filter "*.msi" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($msiFile) { Copy-Artifact $msiFile.FullName "$Dist\$AppName.msi" "MSI Installer" }
    else { Write-Warn "MSI not found" }

    # Portable EXE
    $portableExe = Get-ChildItem -Path "$Root\src-tauri\target\release" -Filter "$AppName.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $portableExe) {
        $portableExe = Get-ChildItem -Path "$Root\src-tauri\target\release" -Filter "giga-share.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if (-not $portableExe) {
        $portableExe = Get-ChildItem -Path "$Root\src-tauri\target\release" -Filter "*.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -notlike "*.d" -and $_.DirectoryName -notlike "*\deps*" -and $_.DirectoryName -notlike "*\build*" } |
            Select-Object -First 1
    }
    if ($portableExe) {
        Copy-Artifact $portableExe.FullName "$Dist\Giga-Share-Portable\$AppName.exe" "Portable EXE"
        "portable" | Set-Content "$Dist\Giga-Share-Portable\portable.marker" -Encoding ASCII
    } else {
        Write-Warn "Portable EXE not found in src-tauri\target\release"
    }

    Pop-Location
} else {
    Write-Step 2 4 "Skipping Windows build (-SkipWindows flag set)"
}

# -- Step 3: Android APK -------------------------------------
if (-not $SkipAndroid) {
    Write-Step 3 4 "Building Android APK..."

    Push-Location $Root

    $localJdk = Get-ChildItem -Path "$Root\jdk17" -Filter "jdk-*" -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($localJdk) {
        $env:JAVA_HOME = $localJdk.FullName
        $env:PATH = "$($localJdk.FullName)\bin;$($env:PATH)"
    }

    if (-not (Test-Path "$Root\src-tauri\gen\android")) {
        Write-Host "  [i] Initializing Android project..." -ForegroundColor DarkGray
        & npx tauri android init --ci 2>&1 | Write-Host
    }

    Write-Host "  [i] Building release APK..." -ForegroundColor DarkGray
    & npx tauri android build --apk 2>&1 | Write-Host

    $apkFound = $false

    $releaseApk = Get-ChildItem -Path "$Root\src-tauri\gen\android" -Filter "*release*.apk" -Recurse -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -notlike "*unsigned*" } | Select-Object -First 1
    if (-not $releaseApk) {
        # fallback: take any release APK incl. unsigned
        $releaseApk = Get-ChildItem -Path "$Root\src-tauri\gen\android" -Filter "*release*.apk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if ($releaseApk) {
        $apkFound = $true
        # Gradle already signs via signingConfig in build.gradle.kts — just copy
        Copy-Artifact $releaseApk.FullName "$Dist\$AppName.apk" "Android APK (signed by Gradle)"
    }

    if (-not $apkFound) {
        Write-Warn "Release APK not found, trying debug build..."
        & npx tauri android build --apk --debug 2>&1 | Write-Host
        $debugApk = Get-ChildItem -Path "$Root\src-tauri\gen\android" -Filter "app-debug*.apk" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($debugApk) {
            Copy-Artifact $debugApk.FullName "$Dist\$AppName-debug.apk" "Android APK (debug fallback)"
            $apkFound = $true
        }
    }

    if (-not $apkFound) {
        Write-Err "No APK found! Make sure Android SDK/NDK and Java 17 are installed."
    }

    Pop-Location
} else {
    Write-Step 3 4 "Skipping Android build (-SkipAndroid flag set)"
}

# -- Step 4: Summary -----------------------------------------
Write-Step 4 4 "Build Summary"

Write-Host ""
Write-Host "  Output folder: $Dist" -ForegroundColor White
Write-Host ""
Get-ChildItem -Path $Dist -Recurse -File | ForEach-Object {
    $size = "{0:N1} MB" -f ($_.Length / 1MB)
    $rel  = $_.FullName.Replace($Dist + "\", "")
    Write-Host "    $rel  ($size)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "  [DONE] All built files are in: dist-apps\" -ForegroundColor Green
Write-Host ""
Pause
