#!/usr/bin/env bash
# Builds Linux (deb/rpm/AppImage), Windows (NSIS .exe, cross-compiled via MinGW)
# and Android (.apk) from a Linux host. Output: dist-apps/
#
# Needs: libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev patchelf rpm
#        mingw-w64 nsis openjdk-17-jdk, Android SDK + NDK (ANDROID_HOME / NDK_HOME)
# APK signing: GIGASHARE_KEYSTORE / GIGASHARE_KEY_ALIAS / GIGASHARE_KEY_PASS,
#              otherwise the Android debug keystore (~/.android/debug.keystore).
set -euo pipefail
cd "$(dirname "$0")"
OUT=dist-apps
mkdir -p "$OUT"
only="${1:-all}"
V=$(node -p "require('./src-tauri/tauri.conf.json').version")

if [[ $only == all || $only == linux ]]; then
  echo "── Linux"
  npx tauri build --bundles deb,rpm,appimage
  B=src-tauri/target/release/bundle
  cp "$B"/deb/Giga-Share_"$V"_amd64.deb "$OUT"/Giga-Share.deb
  cp "$B"/rpm/Giga-Share-"$V"-1.x86_64.rpm "$OUT"/Giga-Share.rpm
  cp "$B"/appimage/Giga-Share_"$V"_amd64.AppImage "$OUT"/Giga-Share.AppImage
fi

if [[ $only == all || $only == windows ]]; then
  echo "── Windows (x86_64-pc-windows-gnu)"
  rm -rf src-tauri/target/x86_64-pc-windows-gnu/release/bundle
  npx tauri build --target x86_64-pc-windows-gnu --bundles nsis
  cp src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/Giga-Share_"$V"_x64-setup.exe "$OUT"/Giga-Share-Setup.exe
  # Portable: exe + portable.marker keeps config next to the exe (needs the WebView2 runtime, built into Win 10/11).
  P=$(mktemp -d)/Giga-Share-Portable
  mkdir -p "$P"
  cp src-tauri/target/x86_64-pc-windows-gnu/release/giga-share.exe "$P"/Giga-Share.exe
  touch "$P"/portable.marker
  (cd "$(dirname "$P")" && rm -f "$OLDPWD/$OUT"/Giga-Share-Portable.zip && zip -qr "$OLDPWD/$OUT"/Giga-Share-Portable.zip Giga-Share-Portable)
fi

if [[ $only == all || $only == android ]]; then
  echo "── Android"
  export JAVA_HOME=${JAVA_HOME:-/usr/lib/jvm/java-17-openjdk-amd64}
  export ANDROID_HOME=${ANDROID_HOME:-$HOME/Android/Sdk}
  export NDK_HOME=${NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/* | sort -V | tail -1)}
  npx tauri android build --apk --target aarch64 armv7
  UNSIGNED=$(ls src-tauri/gen/android/app/build/outputs/apk/universal/release/*-unsigned.apk)
  BT=$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)
  KS=${GIGASHARE_KEYSTORE:-$HOME/.android/debug.keystore}
  ALIAS=${GIGASHARE_KEY_ALIAS:-androiddebugkey}
  PASS=${GIGASHARE_KEY_PASS:-android}
  if [[ ! -f $KS ]]; then
    mkdir -p "$(dirname "$KS")"
    keytool -genkeypair -keystore "$KS" -alias "$ALIAS" -storepass "$PASS" -keypass "$PASS" \
      -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US"
  fi
  "$BT"/zipalign -f -p 4 "$UNSIGNED" "$OUT"/aligned.apk
  "$BT"/apksigner sign --ks "$KS" --ks-key-alias "$ALIAS" --ks-pass "pass:$PASS" --key-pass "pass:$PASS" \
    --out "$OUT"/Giga-Share.apk "$OUT"/aligned.apk
  rm -f "$OUT"/aligned.apk "$OUT"/*.idsig
fi
ls -la "$OUT"
