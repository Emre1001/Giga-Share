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
# Desktop bundles are signed for the in-app updater (key from `npx tauri signer generate -w ~/.tauri/giga-share.key`).
if [[ -z ${TAURI_SIGNING_PRIVATE_KEY:-} && -f $HOME/.tauri/giga-share.key ]]; then
  export TAURI_SIGNING_PRIVATE_KEY=$HOME/.tauri/giga-share.key
  export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}
fi

if [[ $only == all || $only == linux ]]; then
  echo "── Linux"
  npx tauri build --bundles deb,rpm,appimage
  B=src-tauri/target/release/bundle
  cp "$B"/deb/Giga-Share_"$V"_amd64.deb "$OUT"/Giga-Share.deb
  cp "$B"/rpm/Giga-Share-"$V"-1.x86_64.rpm "$OUT"/Giga-Share.rpm
  cp "$B"/appimage/Giga-Share_"$V"_amd64.AppImage "$OUT"/Giga-Share.AppImage
  cp "$B"/appimage/Giga-Share_"$V"_amd64.AppImage.sig "$OUT"/Giga-Share.AppImage.sig
fi

if [[ $only == all || $only == windows ]]; then
  echo "── Windows (x86_64-pc-windows-gnu)"
  rm -rf src-tauri/target/x86_64-pc-windows-gnu/release/bundle
  npx tauri build --target x86_64-pc-windows-gnu --bundles nsis
  cp src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/Giga-Share_"$V"_x64-setup.exe "$OUT"/Giga-Share-Setup.exe
  cp src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/Giga-Share_"$V"_x64-setup.exe.sig "$OUT"/Giga-Share-Setup.exe.sig
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
  # versionCode = minutes since 2020: always rising, independent of the version name
  # (1.0.0 replaced the 2.0.x previews, which had versionCode 2000002).
  VC=$(( ($(date +%s) - 1577836800) / 60 ))
  npx tauri android build --apk --target aarch64 armv7 --config "{\"bundle\":{\"android\":{\"versionCode\":$VC}}}"
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
# Updater manifest: upload latest.json with the release (tag v$V) next to the installers.
V="$V" OUT="$OUT" node -e '
const fs = require("fs"), { V, OUT } = process.env;
const url = f => `https://github.com/Emre1001/Giga-Share/releases/download/v${V}/${f}`;
const platforms = {};
for (const [key, file] of [["windows-x86_64", "Giga-Share-Setup.exe"], ["linux-x86_64", "Giga-Share.AppImage"]]) {
  const sig = `${OUT}/${file}.sig`;
  if (fs.existsSync(sig) && fs.statSync(sig).mtimeMs >= fs.statSync(`${OUT}/${file}`).mtimeMs)
    platforms[key] = { signature: fs.readFileSync(sig, "utf8").trim(), url: url(file) };
}
if (Object.keys(platforms).length)
  fs.writeFileSync(`${OUT}/latest.json`, JSON.stringify({ version: V, notes: "", pub_date: new Date().toISOString(), platforms }, null, 2));
'
ls -la "$OUT"
