@echo off
setlocal enabledelayedexpansion

echo 🌌 Nebula Share - One-Click Build
echo ---------------------------------
echo.

echo [0/3] Checking for Java...
set "JAVA_HOME="
if exist "%~dp0jdk17" (
    for /d %%i in ("%~dp0jdk17\jdk-*") do (
        set "JAVA_HOME=%%i"
        set "PATH=%%i\bin;!PATH!"
        echo ℹ️ Using local JDK: %%i
    )
)

if not defined JAVA_HOME (
    java -version >nul 2>&1
    if !errorlevel! neq 0 (
        echo ❌ Java not found! Please run the Java installer first.
        pause
        exit /b 1
    )
)

echo [1/3] Building Frontend...
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ❌ Frontend build failed!
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Building Windows App (.exe)...
call npx tauri build
if %errorlevel% neq 0 (
    echo.
    echo ⚠️ Windows build failed. (Make sure Rust is installed)
) else (
    echo ✅ Windows App ready in: src-tauri\target\release\bundle\msi\
)

echo.
echo [3/3] Building Android App (.apk)...

if not exist "src-tauri\gen\android" (
    echo ℹ️ Android project not initialized. Running init...
    call npx tauri android init --ci
    if %errorlevel% neq 0 (
        echo.
        echo ❌ Android initialization failed! 
        echo    Make sure Java 17 and Android Studio are installed.
    )
)

if exist "src-tauri\gen\android" (
    echo ℹ️ Erstelle Debug-APK (einfacher zu installieren für Tests)...
    call npx tauri android build --apk --debug
    if %errorlevel% neq 0 (
        echo.
        echo ⚠️ Android build failed. 
        echo    (Note: You need Android Studio, Java 17 and SDK/NDK installed)
    ) else (
        echo.
        echo ✅ Android App(s) ready! Suche Dateien...
        dir /s /b "src-tauri\gen\android\*.apk"
    )
) else (
    echo ⚠️ Skipping Android build as initialization failed.
)

echo.
echo ---------------------------------
echo 🎉 All tasks finished!
echo ---------------------------------
pause
