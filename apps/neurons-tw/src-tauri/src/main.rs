// Neurons desktop shell (Tauri 2) — add-neurons-tauri-shell.
//
// Boots the EXISTING neurons web app in a native window. The only desktop-specific
// surface is read-only access to the player's OWN folder of 陽明 source PDFs so the
// platform adapter can open a mapped question's PDF at its page in the same docked
// viewer the web build uses. Three commands, all read-only:
//   set_pdf_folder(path)   — record the user-granted folder root (session state)
//   list_pdf_files()       — *.pdf names directly in the root (for CJK/NFC matching in JS)
//   read_pdf_file(file)    — bytes of <root>/<file>, traversal-guarded, .pdf only
// No write/delete path exists. Distributes zero copyrighted bytes (user supplies PDFs).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::ipc::Response;
use tauri::State;

/// The single folder root the player granted this session (read-only). None until granted.
#[derive(Default)]
struct GrantedFolder(Mutex<Option<PathBuf>>);

#[tauri::command]
fn set_pdf_folder(path: String, state: State<GrantedFolder>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    *state.0.lock().map_err(|e| e.to_string())? = Some(p);
    Ok(())
}

#[tauri::command]
fn list_pdf_files(state: State<GrantedFolder>) -> Result<Vec<String>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let root = guard.as_ref().ok_or("no folder granted")?;
    let mut out = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.file_type().map(|t| t.is_file()).unwrap_or(false) {
            if let Some(name) = entry.file_name().to_str() {
                if name.to_lowercase().ends_with(".pdf") {
                    out.push(name.to_string());
                }
            }
        }
    }
    Ok(out)
}

/// Resolve `<root>/<file>` for a read, rejecting anything that could escape the granted
/// folder. The security boundary: no separators / `..`, `.pdf` only, and the canonicalized
/// path must stay within the canonicalized root.
fn safe_path(root: &Path, file: &str) -> Result<PathBuf, String> {
    if file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err("invalid filename".into());
    }
    if !file.to_lowercase().ends_with(".pdf") {
        return Err("not a pdf".into());
    }
    let canon = root.join(file).canonicalize().map_err(|e| e.to_string())?;
    let root_canon = root.canonicalize().map_err(|e| e.to_string())?;
    if !canon.starts_with(&root_canon) {
        return Err("outside granted folder".into());
    }
    Ok(canon)
}

#[tauri::command]
fn read_pdf_file(file: String, state: State<GrantedFolder>) -> Result<Response, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    let root = guard.as_ref().ok_or("no folder granted")?;
    let path = safe_path(root, &file)?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(Response::new(bytes))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(GrantedFolder::default())
        .invoke_handler(tauri::generate_handler![
            set_pdf_folder,
            list_pdf_files,
            read_pdf_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::safe_path;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let mut d = std::env::temp_dir();
        d.push(format!("neurons-tauri-test-{}-{}", std::process::id(), tag));
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn rejects_path_separator() {
        let root = temp_dir("sep");
        assert!(safe_path(&root, "sub/x.pdf").is_err());
        assert!(safe_path(&root, "sub\\x.pdf").is_err());
    }

    #[test]
    fn rejects_parent_traversal() {
        let root = temp_dir("trav");
        assert!(safe_path(&root, "../secret.pdf").is_err());
    }

    #[test]
    fn rejects_non_pdf() {
        let root = temp_dir("ext");
        assert!(safe_path(&root, "notes.txt").is_err());
    }

    #[test]
    fn accepts_real_pdf_in_root() {
        let root = temp_dir("ok");
        let f = root.join("詳解.pdf");
        fs::write(&f, b"%PDF-1.4\n").unwrap();
        let got = safe_path(&root, "詳解.pdf").unwrap();
        assert_eq!(got, f.canonicalize().unwrap());
    }
}
