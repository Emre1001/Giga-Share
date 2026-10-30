//! Android notifications and the background service, via JNI into `GigaNotify.kt`.
//! Rust posts JSON commands to `GigaNotify.post`; notification buttons call back into
//! `nativeRespond` / `nativeCancel` below. Works while the activity is gone, as long as
//! the foreground service keeps the process alive.

use jni::objects::{JClass, JObject, JString, JValue};
use jni::sys::jboolean;
use jni::JNIEnv;
use serde_json::json;
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

use crate::desktop::text;
use crate::state::AppState;

static APP: OnceLock<AppHandle> = OnceLock::new();

pub fn init(app: &AppHandle) {
    let _ = APP.set(app.clone());
    service(app);
}

fn post(cmd: serde_json::Value) {
    let res = (|| -> jni::errors::Result<()> {
        let ctx = ndk_context::android_context();
        let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }?;
        let mut env = vm.attach_current_thread()?;
        let context = unsafe { JObject::from_raw(ctx.context().cast()) };
        // FindClass from a non-Java thread only sees system classes: go through the app's class loader.
        let loader = env.call_method(&context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])?.l()?;
        let name = env.new_string("io.github.emre1001.gigashare.GigaNotify")?;
        let class: JClass = env
            .call_method(&loader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;", &[JValue::Object(&name)])?
            .l()?
            .into();
        let arg = env.new_string(cmd.to_string())?;
        let r = env.call_static_method(
            class,
            "post",
            "(Landroid/content/Context;Ljava/lang/String;)V",
            &[JValue::Object(&context), JValue::Object(&arg)],
        );
        if r.is_err() && env.exception_check()? {
            env.exception_describe()?;
            env.exception_clear()?;
        }
        r.map(|_| ())
    })();
    if let Err(e) = res {
        log::warn!("Android notification failed: {e}");
    }
}

/// Starts or stops the foreground service ("keep running in background" setting).
pub fn service(app: &AppHandle) {
    let on = app.state::<AppState>().settings().minimize_to_tray;
    post(json!({ "kind": "service", "on": on, "title": text(app, "bgTitle", ""), "text": text(app, "bgText", "") }));
}

pub fn request(app: &AppHandle, id: &str, title: &str, body: &str) {
    post(json!({
        "kind": "request", "id": id, "title": title, "text": body,
        "accept": text(app, "accept", ""), "decline": text(app, "decline", ""),
    }));
}

/// `percent` < 0 shows an indeterminate bar.
pub fn progress(app: &AppHandle, id: &str, title: &str, body: &str, percent: i32) {
    post(json!({ "kind": "progress", "id": id, "title": title, "text": body, "percent": percent, "cancel": text(app, "cancel", "") }));
}

pub fn finished(_app: &AppHandle, id: &str, title: &str, body: &str) {
    post(json!({ "kind": "done", "id": id, "title": title, "text": body }));
}

pub fn clear(id: &str) {
    post(json!({ "kind": "clear", "id": id }));
}

fn jstr(env: &mut JNIEnv, s: &JString) -> String {
    env.get_string(s).map(Into::into).unwrap_or_default()
}

#[no_mangle]
pub extern "system" fn Java_io_github_emre1001_gigashare_GigaNotify_nativeRespond(mut env: JNIEnv, _: JClass, id: JString, accept: jboolean) {
    let id = jstr(&mut env, &id);
    if let Some(app) = APP.get() {
        crate::desktop::respond(app, &id, accept != 0);
    }
}

/// A new activity was created while the process kept running in the background (the user had
/// swiped the app away): give it a webview again. No-op on first launch, where the config window exists.
#[no_mangle]
pub extern "system" fn Java_io_github_emre1001_gigashare_GigaNotify_nativeEnsureWindow(_: JNIEnv, _: JClass) {
    let Some(app) = APP.get() else { return };
    if app.get_webview_window("main").is_some() {
        return;
    }
    // Called on the Android main thread, which the event loop also runs on: build from elsewhere.
    let app = app.clone();
    std::thread::spawn(move || {
        if let Some(cfg) = app.config().app.windows.first() {
            if let Err(e) = tauri::WebviewWindowBuilder::from_config(&app, cfg).and_then(|b| b.build()) {
                log::error!("Cannot recreate window: {e}");
            }
        }
    });
}

#[no_mangle]
pub extern "system" fn Java_io_github_emre1001_gigashare_GigaNotify_nativeCancel(mut env: JNIEnv, _: JClass, id: JString) {
    let id = jstr(&mut env, &id);
    if let Some(app) = APP.get() {
        crate::desktop::cancel(app, &id);
    }
}
