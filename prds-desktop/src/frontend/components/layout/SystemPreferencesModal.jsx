import { useEffect, useState } from "react";
import {
  getDownloadPreferences,
  saveDownloadPreferences,
  pickDownloadFolder,
} from "../../services/downloadManager";

export default function SystemPreferencesModal({ isOpen, onClose }) {
  const [downloadPath, setDownloadPath] = useState("");
  const [defaultFormat, setDefaultFormat] = useState("xlsx");
  const [notifyOnExport, setNotifyOnExport] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const prefs = getDownloadPreferences();
      setDownloadPath(prefs.downloadPath || "Downloads\\PRDS_Exports");
      setDefaultFormat(prefs.defaultFormat || "xlsx");
      setNotifyOnExport(prefs.notifyOnExport ?? true);
      setIsSaved(false);
      setIsPickingFolder(false);
      setShowFolderModal(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    setIsPickingFolder(true);
    try {
      const result = await pickDownloadFolder();
      if (!result) {
        return;
      }
      if (typeof result === "string") {
        setDownloadPath(result);
        return;
      }
      if (result.path) {
        setDownloadPath(result.path);
        return;
      }
      if (result.needsModal || result.error === "RESTRICTED") {
        setShowFolderModal(true);
        return;
      }
    } catch (err) {
      console.warn("Folder picker fallback:", err);
      setShowFolderModal(true);
    } finally {
      setIsPickingFolder(false);
    }
  };

  const handleSave = (e) => {
    e?.preventDefault();
    const cleanPath = downloadPath.trim() || "Downloads\\PRDS_Exports";
    saveDownloadPreferences({
      downloadPath: cleanPath,
      defaultFormat,
      notifyOnExport,
    });
    setDownloadPath(cleanPath);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 600);
  };

  const handleResetDefault = () => {
    setDownloadPath("Downloads\\PRDS_Exports");
  };

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="system-preferences-title"
        className="fixed inset-0 z-[9990] flex items-center justify-center bg-black/45 p-4 backdrop-blur-xs transition-opacity"
      >
        <div className="relative w-full max-w-[530px] rounded-2xl border border-[#d8dadc] bg-white shadow-2xl shadow-neutral-900/20 animate-in fade-in zoom-in-95 duration-200">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#e2e4e8] px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eff4ff] text-[#003b7a]">
                <SettingsGearIcon />
              </span>
              <div>
                <h2 id="system-preferences-title" className="text-base font-black text-[#0d1117]">
                  System Preferences
                </h2>
                <p className="text-xs font-medium text-[#5f6673]">
                  Desktop download path & export configuration
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5f6673] hover:bg-[#f1f3f5] hover:text-[#0d1117] transition cursor-pointer"
              aria-label="Close preferences"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Form Body */}
          <form onSubmit={handleSave} className="p-6 space-y-5">
            {/* Download Path Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label htmlFor="pref-download-path" className="text-xs font-black uppercase tracking-wider text-[#0d1117]">
                  Default Download Path
                </label>
                <button
                  type="button"
                  onClick={handleResetDefault}
                  className="text-xs font-bold text-[#007f5f] hover:underline cursor-pointer"
                >
                  Reset to Default
                </button>
              </div>

              {/* Editable Input + Browse Button */}
              <div className="relative flex items-center">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[#5f6673]">
                  <FolderIcon />
                </div>
                <input
                  id="pref-download-path"
                  type="text"
                  value={downloadPath}
                  onChange={(e) => setDownloadPath(e.target.value)}
                  placeholder="Downloads\PRDS_Exports"
                  className="h-11 w-full rounded-xl border border-[#d8dadc] bg-white pl-10 pr-24 text-xs font-bold text-[#0d1117] outline-none transition focus:border-[#007f5f] focus:ring-1 focus:ring-[#007f5f]/30"
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  disabled={isPickingFolder}
                  className="absolute inset-y-1.5 right-1.5 flex items-center gap-1.5 rounded-lg border border-[#c2e7da] bg-[#f0fdf9] px-3 text-xs font-bold text-[#007f5f] shadow-2xs hover:bg-[#e8fff7] hover:border-[#007f5f] transition cursor-pointer disabled:opacity-50"
                >
                  <FolderOpenMiniIcon />
                  {isPickingFolder ? "Opening..." : "Browse"}
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-[#5f6673] uppercase tracking-wider">Presets:</span>
                {[
                  { label: "Downloads\\PRDS_Exports", badge: "Default" },
                  { label: "Documents\\PRDS_Exports", badge: null },
                  { label: "Desktop\\PRDS_Exports", badge: null },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setDownloadPath(item.label)}
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition cursor-pointer ${
                      downloadPath === item.label
                        ? "border-[#007f5f] bg-[#e8fff7] text-[#007f5f] font-bold"
                        : "border-[#e2e4e8] bg-[#f8f9fc] text-[#42474e] hover:bg-[#f1f3f5]"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.badge && (
                      <span className="rounded bg-[#007f5f]/15 px-1 text-[9px] font-black text-[#007f5f]">
                        {item.badge}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between text-[11px] font-medium text-[#5f6673]">
                <span>Type any path or click <strong className="text-[#007f5f]">Browse</strong> to select a folder.</span>
                <button
                  type="button"
                  onClick={() => setShowFolderModal(true)}
                  className="text-[#007f5f] hover:underline cursor-pointer font-bold inline-flex items-center gap-1"
                >
                  <InfoIcon />
                  Folder Guide
                </button>
              </div>
            </div>

            {/* Default Export Format */}
            <div className="space-y-2 pt-2 border-t border-[#f0f2f5]">
              <label className="text-xs font-black uppercase tracking-wider text-[#0d1117]">
                Default Export Format
              </label>
              <div className="flex items-center gap-3 rounded-xl border border-[#007f5f] bg-[#e8fff7] p-3 ring-1 ring-[#007f5f]/30">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-xs font-black text-emerald-800">
                  XLS
                </span>
                <div>
                  <p className="text-xs font-black text-[#0d1117]">Microsoft Excel</p>
                  <p className="text-[10px] font-medium text-[#5f6673]">.xlsx workbook</p>
                </div>
              </div>
            </div>

            {/* Export Notifications */}
            <div className="pt-2 border-t border-[#f0f2f5]">
              <label className="flex cursor-pointer items-center justify-between rounded-xl p-2 hover:bg-[#f8f9fc] transition">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-[#0d1117]">Notification on Export</p>
                  <p className="text-[11px] font-medium text-[#5f6673]">
                    Show the Downloads indicator and alert when a file finishes exporting
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyOnExport}
                  onChange={(e) => setNotifyOnExport(e.target.checked)}
                  className="h-4 w-4 rounded border-[#d8dadc] text-[#007f5f] focus:ring-[#007f5f]"
                />
              </label>
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#e2e4e8]">
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-xl border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#42474e] hover:bg-[#f8f9fc] transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex h-9 items-center gap-2 rounded-xl bg-[#007f5f] px-5 text-xs font-black text-white hover:bg-[#00694e] shadow-sm transition cursor-pointer"
              >
                {isSaved ? (
                  <>
                    <CheckIcon />
                    Saved!
                  </>
                ) : (
                  "Save Preferences"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* System Popup Modal for Restricted System Folders */}
      {showFolderModal && (
        <FolderRestrictedSystemModal
          currentPath={downloadPath}
          onSelectPath={(path) => {
            setDownloadPath(path);
            setShowFolderModal(false);
          }}
          onClose={() => setShowFolderModal(false)}
        />
      )}
    </>
  );
}

/**
 * System Popup Modal: Replaces raw Chromium native desktop error
 * with a polished, readable PRDS system dialog.
 */
function FolderRestrictedSystemModal({ currentPath, onSelectPath, onClose }) {
  const [customPath, setCustomPath] = useState(currentPath || "Downloads\\PRDS_Exports");

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="folder-notice-title"
      className="fixed inset-0 z-[9995] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
    >
      <div className="relative w-full max-w-[500px] rounded-2xl border border-[#e2e4e8] bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
        {/* Header Badge */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <ShieldAlertIcon />
            </span>
            <div>
              <h3 id="folder-notice-title" className="text-base font-black text-[#0d1117]">
                Can't open this folder directly
              </h3>
              <p className="text-xs font-medium text-[#5f6673]">
                Windows & Web Security Restriction
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5f6673] hover:bg-[#f1f3f5] hover:text-[#0d1117] transition cursor-pointer"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Message Box mirroring the exact error */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-900 space-y-2">
          <p className="font-bold text-[#b45309] flex items-center gap-1.5">
            <InfoIcon />
            <span>Root Downloads folder contains protected system files</span>
          </p>
          <p className="text-[11px] leading-relaxed text-amber-800">
            Windows and web runtime security restrict direct selection of the root <strong>Downloads</strong> directory. To ensure safe file exports without OS permission errors, PRDS saves files inside an organized subfolder.
          </p>
          <p className="text-[11px] leading-relaxed text-amber-800 font-medium">
            <strong>Choose a designated subfolder below</strong> or type your desired folder path:
          </p>
        </div>

        {/* Recommended 1-Click Subfolders */}
        <div className="space-y-2">
          <label className="text-[11px] font-black uppercase tracking-wider text-[#0d1117]">
            Select Recommended Folder:
          </label>
          <div className="space-y-1.5">
            {[
              {
                path: "Downloads\\PRDS_Exports",
                title: "Downloads\\PRDS_Exports",
                desc: "Recommended — automatically keeps all PRDS exports safe in your Downloads",
                recommended: true,
              },
              {
                path: "Documents\\PRDS_Exports",
                title: "Documents\\PRDS_Exports",
                desc: "Stores exports inside your personal Documents folder",
                recommended: false,
              },
              {
                path: "Desktop\\PRDS_Exports",
                title: "Desktop\\PRDS_Exports",
                desc: "Saves files directly to your Desktop",
                recommended: false,
              },
            ].map((option) => (
              <button
                key={option.path}
                type="button"
                onClick={() => setCustomPath(option.path)}
                className={`w-full flex items-center justify-between rounded-xl border p-2.5 text-left transition cursor-pointer ${
                  customPath === option.path
                    ? "border-[#007f5f] bg-[#e8fff7] text-[#007f5f] ring-1 ring-[#007f5f]/30"
                    : "border-[#d8dadc] bg-white hover:bg-[#f8f9fc] hover:border-[#007f5f]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FolderIcon />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#0d1117]">{option.title}</span>
                      {option.recommended && (
                        <span className="rounded bg-[#007f5f] px-1.5 py-0.2 text-[9px] font-black text-white">
                          Recommended
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-[#5f6673]">{option.desc}</p>
                  </div>
                </div>
                <span className={`text-xs font-bold ${customPath === option.path ? "text-[#007f5f]" : "text-[#5f6673]"}`}>
                  {customPath === option.path ? "Selected" : "Select"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Or Type Custom Path */}
        <div className="space-y-1.5 pt-1">
          <label htmlFor="custom-folder-input" className="text-[11px] font-black uppercase tracking-wider text-[#0d1117]">
            Or enter custom folder path:
          </label>
          <div className="flex items-center gap-2">
            <input
              id="custom-folder-input"
              type="text"
              value={customPath}
              onChange={(e) => setCustomPath(e.target.value)}
              placeholder="e.g. D:\PRDS_Exports"
              className="h-9 flex-1 rounded-lg border border-[#d8dadc] bg-white px-3 text-xs font-bold text-[#0d1117] outline-none focus:border-[#007f5f]"
            />
          </div>
        </div>

        {/* Footer Actions matching the prompt's intent */}
        <div className="flex items-center justify-between pt-3 border-t border-[#e2e4e8]">
          <button
            type="button"
            onClick={onClose}
            className="h-9 rounded-xl border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#42474e] hover:bg-[#f1f3f5] transition cursor-pointer"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSelectPath("Downloads\\PRDS_Exports")}
              className="h-9 rounded-xl border border-[#007f5f] bg-[#e8fff7] px-3.5 text-xs font-bold text-[#007f5f] hover:bg-[#d1fae5] transition cursor-pointer"
            >
              Use Default
            </button>
            <button
              type="button"
              onClick={() => onSelectPath(customPath)}
              className="h-9 rounded-xl bg-[#007f5f] px-4 text-xs font-bold text-white hover:bg-[#00694e] shadow-sm transition cursor-pointer"
            >
              Apply Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsGearIcon() {
  return (
    <svg className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 8 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function FolderOpenMiniIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

function ShieldAlertIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}
