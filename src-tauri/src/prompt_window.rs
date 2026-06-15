use tauri::{AppHandle, Emitter, Manager, WebviewWindow};

const PROMPT_MARGIN: i32 = 16;
const PROMPT_BOTTOM_MARGIN: i32 = 24;
const PROMPT_WIDTH: u32 = 360;
const PROMPT_HEIGHT: u32 = 300;

pub fn position_prompt_bottom_right(window: &WebviewWindow) {
    #[cfg(target_os = "macos")]
    {
        if position_prompt_bottom_right_macos(window) {
            return;
        }
    }

    position_prompt_bottom_right_fallback(window);
}

#[cfg(target_os = "macos")]
fn position_prompt_bottom_right_macos(window: &WebviewWindow) -> bool {
    use objc2_app_kit::{NSScreen, NSWindow};
    use objc2_foundation::{MainThreadMarker, NSPoint};

    let Ok(raw) = window.ns_window() else {
        return false;
    };

    unsafe {
        let ns_window: &NSWindow = &*raw.cast();
        let Some(mtm) = MainThreadMarker::new() else {
            return false;
        };
        let Some(screen) = NSScreen::mainScreen(mtm) else {
            return false;
        };

        let visible = screen.visibleFrame();
        let frame = ns_window.frame();
        let x = visible.origin.x + visible.size.width - frame.size.width - PROMPT_MARGIN as f64;
        let y = visible.origin.y + PROMPT_BOTTOM_MARGIN as f64;

        ns_window.setFrameOrigin(NSPoint::new(x, y));
    }

    true
}

fn position_prompt_bottom_right_fallback(window: &WebviewWindow) {
    use tauri::{PhysicalPosition, PhysicalSize};

    let window_size = window
        .outer_size()
        .unwrap_or(PhysicalSize::new(PROMPT_WIDTH, PROMPT_HEIGHT));

    let monitor = window
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| window.primary_monitor().ok().flatten());

    if let Some(monitor) = monitor {
        let monitor_size = monitor.size();
        let monitor_pos = monitor.position();
        let bottom_margin = PROMPT_MARGIN + 72;

        let x = monitor_pos.x + monitor_size.width as i32 - window_size.width as i32 - PROMPT_MARGIN;
        let y = monitor_pos.y + monitor_size.height as i32
            - window_size.height as i32
            - bottom_margin;

        let _ = window.set_position(PhysicalPosition::new(
            x.max(monitor_pos.x),
            y.max(monitor_pos.y),
        ));
    }
}

#[cfg(target_os = "macos")]
pub fn configure_macos_prompt_window(window: &WebviewWindow) {
    use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

    if let Ok(raw) = window.ns_window() {
        unsafe {
            let ns_window: &NSWindow = &*raw.cast();
            ns_window.setLevel(3);
            ns_window.setCollectionBehavior(
                NSWindowCollectionBehavior::CanJoinAllSpaces
                    | NSWindowCollectionBehavior::Stationary
                    | NSWindowCollectionBehavior::FullScreenAuxiliary,
            );
            ns_window.setOpaque(false);
            ns_window.setHasShadow(true);
            ns_window.setHidesOnDeactivate(false);
            ns_window.setMovableByWindowBackground(true);
        }
    }
}

#[cfg(not(target_os = "macos"))]
pub fn configure_macos_prompt_window(_window: &WebviewWindow) {}

#[cfg(target_os = "macos")]
fn activate_application() {
    use objc2_app_kit::NSApplication;
    use objc2_foundation::MainThreadMarker;

    if let Some(mtm) = MainThreadMarker::new() {
        let app = NSApplication::sharedApplication(mtm);
        #[allow(deprecated)]
        app.activateIgnoringOtherApps(true);
    }
}

#[cfg(not(target_os = "macos"))]
fn activate_application() {}

#[cfg(target_os = "macos")]
fn order_prompt_front(window: &WebviewWindow) {
    use objc2_app_kit::NSWindow;

    if let Ok(raw) = window.ns_window() {
        unsafe {
            let ns_window: &NSWindow = &*raw.cast();
            ns_window.orderFrontRegardless();
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn order_prompt_front(_window: &WebviewWindow) {}

pub fn show_prompt_window(app: &AppHandle) {
    activate_application();

    let Some(window) = app.get_webview_window("prompt") else {
        eprintln!("[work-pulse] prompt window with label 'prompt' was not found");
        return;
    };

    configure_macos_prompt_window(&window);
    let _ = window.set_always_on_top(true);
    if let Err(error) = window.show() {
        eprintln!("[work-pulse] failed to show prompt window: {error}");
    }
    let _ = window.unminimize();
    position_prompt_bottom_right(&window);
    order_prompt_front(&window);
    let _ = window.set_always_on_top(true);
    if let Err(error) = window.set_focus() {
        eprintln!("[work-pulse] failed to focus prompt window: {error}");
    }
    if let Err(error) = app.emit("prompt:open", ()) {
        eprintln!("[work-pulse] failed to emit prompt:open: {error}");
    } else {
        eprintln!("[work-pulse] prompt window shown");
    }
}

pub fn request_show_prompt_window(app: &AppHandle) {
    let app_handle = app.clone();
    if let Err(error) = app_handle.clone().run_on_main_thread(move || {
        show_prompt_window(&app_handle);
    }) {
        eprintln!("[work-pulse] failed to schedule prompt window on main thread: {error}");
    }
}

pub fn hide_prompt_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("prompt") {
        let _ = window.hide();
    }
}
