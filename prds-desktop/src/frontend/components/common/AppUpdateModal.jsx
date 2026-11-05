import { useEffect, useState } from "react";
import {
  Download,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  RefreshCw,
  X,
  ExternalLink,
  ShieldCheck,
  Package,
} from "lucide-react";
import {
  checkForUpdates,
  downloadAndInstallUpdate,
  restartApp,
  formatBytes,
  formatReleaseDate,
  getAppVersion,
} from "../../../backend/services/updaterService";

export default function AppUpdateModal({ isOpen, onClose, initialCheck = true }) {
  const [status, setStatus] = useState("checking"); // 'checking' | 'up_to_date' | 'update_available' | 'downloading' | 'ready_to_restart' | 'error'
  const [currentVersion, setCurrentVersion] = useState("1.0.0");
  const [newVersion, setNewVersion] = useState(null);
  const [releaseDate, setReleaseDate] = useState("");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [rawUpdate, setRawUpdate] = useState(null);
  const [progress, setProgress] = useState({
    percent: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    formattedProgress: "",
  });
  const [errorMessage, setErrorMessage] = useState("");

  const runUpdateCheck = async () => {
    setStatus("checking");
    setErrorMessage("");
    setProgress({ percent: 0, downloadedBytes: 0, totalBytes: 0, formattedProgress: "" });

    try {
      const current = await getAppVersion();
      setCurrentVersion(current);

      const result = await checkForUpdates();

      if (result.error) {
        setErrorMessage(result.error);
        setStatus("error");
        return;
      }

      if (result.available && result.rawUpdate) {
        setNewVersion(result.newVersion);
        setReleaseDate(result.releaseDate || "");
        setReleaseNotes(result.releaseNotes || "");
        setRawUpdate(result.rawUpdate);
        setStatus("update_available");
      } else {
        setStatus("up_to_date");
      }
    } catch (err) {
      setErrorMessage(err?.message || "Failed to check for updates.");
      setStatus("error");
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialCheck) {
        runUpdateCheck();
      }
    } else {
      // Reset non-critical states on close if not currently downloading
      if (status !== "downloading") {
        setErrorMessage("");
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartUpdate = async () => {
    if (!rawUpdate) {
      runUpdateCheck();
      return;
    }

    setStatus("downloading");
    setErrorMessage("");

    try {
      await downloadAndInstallUpdate(rawUpdate, (prog) => {
        setProgress({
          percent: prog.percent || 0,
          downloadedBytes: prog.downloadedBytes || 0,
          totalBytes: prog.totalBytes || 0,
          formattedProgress: prog.formattedProgress || "",
        });

        if (prog.status === "ready_to_restart") {
          setStatus("ready_to_restart");
        } else if (prog.status === "error") {
          setErrorMessage(prog.error || "Download was interrupted.");
          setStatus("error");
        }
      });
    } catch (err) {
      console.error("Installation failed:", err);
      setErrorMessage(err?.message || "Failed to download and install update.");
      setStatus("error");
    }
  };

  const handleRestartNow = async () => {
    try {
      await restartApp();
    } catch (err) {
      console.error("Restart failed:", err);
      setErrorMessage("Could not restart automatically. Please close and re-open PRDS Naga.");
    }
  };

  const isDownloading = status === "downloading";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-title"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-[540px] rounded-3xl border border-[#d8dadc] bg-white shadow-2xl shadow-neutral-900/25 overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header Ribbon */}
        <div className="flex items-center justify-between border-b border-[#e2e4e8] bg-[#f8f9fc] px-6 py-4.5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-[#007f5f] border border-emerald-100 shadow-2xs">
              <Package className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="app-update-title" className="text-base font-black text-[#0d1117]">
                  Software Updates
                </h2>
                <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                  PRDS Naga
                </span>
              </div>
              <p className="text-xs font-medium text-[#5f6673]">
                Current release: <strong className="font-bold text-[#0d1117]">v{currentVersion}</strong>
              </p>
            </div>
          </div>

          {!isDownloading && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-xl text-[#5f6673] hover:bg-[#eef1f5] hover:text-[#0d1117] transition cursor-pointer"
              aria-label="Close update window"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6">
          {/* State 1: Checking */}
          {status === "checking" && (
            <div className="flex flex-col items-center justify-center py-8 text-center space-y-4">
              <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-[#e8fff7] text-[#007f5f]">
                <RefreshCw className="h-7 w-7 animate-spin" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-black text-[#0d1117]">Checking for updates...</h3>
                <p className="text-xs text-[#5f6673] max-w-xs mx-auto">
                  Connecting to GitHub releases to verify integrity and version compatibility.
                </p>
              </div>
            </div>
          )}

          {/* State 2: Up to Date */}
          {status === "up_to_date" && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-xs">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-[#0d1117]">
                  You're Up to Date!
                </h3>
                <p className="text-xs text-[#5f6673] max-w-sm mx-auto">
                  PRDS Naga is running the latest official release (<strong className="text-[#0d1117]">v{currentVersion}</strong>). No new updates are available at this time.
                </p>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-[#e2e4e8] bg-[#f8f9fc] px-4 py-2.5 text-xs text-[#5f6673]">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Cryptographic signatures & channel verification active</span>
              </div>
            </div>
          )}

          {/* State 3: Update Available */}
          {status === "update_available" && (
            <div className="space-y-4">
              {/* Highlight Card */}
              <div className="relative overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-[#f0fdf9] to-white p-4.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#007f5f] text-white shadow-md shadow-emerald-700/20">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#007f5f] uppercase tracking-wider">
                          New Release Ready
                        </span>
                        {releaseDate && (
                          <span className="text-[11px] text-[#5f6673]">
                            • {formatReleaseDate(releaseDate)}
                          </span>
                        )}
                      </div>
                      <h3 className="text-lg font-black text-[#0d1117]">
                        PRDS Naga v{newVersion}
                      </h3>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-white px-2.5 py-1 text-xs font-black text-[#007f5f] shadow-2xs">
                    v{currentVersion} <ArrowRight className="h-3 w-3" /> v{newVersion}
                  </span>
                </div>
              </div>

              {/* Release Notes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-black uppercase tracking-wider text-[#0d1117]">
                    Release Notes & Changes
                  </span>
                  <span className="text-[11px] text-[#5f6673]">
                    Verified Build
                  </span>
                </div>
                <div className="max-h-48 overflow-y-auto rounded-xl border border-[#d8dadc] bg-[#f8f9fc] p-3.5 text-xs text-[#333a44] leading-relaxed prds-modal-scrollbar whitespace-pre-line font-medium">
                  {releaseNotes || "Performance enhancements, bug fixes, and security patches."}
                </div>
              </div>
            </div>
          )}

          {/* State 4: Downloading & Installing */}
          {status === "downloading" && (
            <div className="py-4 space-y-5">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#007f5f] border border-emerald-100">
                  <Download className="h-6 w-6 animate-bounce" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black text-[#0d1117]">
                    Downloading Update...
                  </h3>
                  <p className="text-xs text-[#5f6673]">
                    {progress.formattedProgress || "Preparing update download..."}
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-2">
                <div className="h-3 w-full overflow-hidden rounded-full bg-[#eef1f5] border border-[#d8dadc]/60 p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#007f5f] to-emerald-400 transition-all duration-300 ease-out"
                    style={{ width: `${Math.max(5, progress.percent)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] font-bold text-[#5f6673]">
                  <span>{progress.percent}% Completed</span>
                  {progress.totalBytes > 0 && (
                    <span>
                      {formatBytes(progress.downloadedBytes)} of {formatBytes(progress.totalBytes)}
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs text-amber-800">
                Please do not close PRDS Naga while the update package is downloading and being verified.
              </div>
            </div>
          )}

          {/* State 5: Ready to Restart */}
          {status === "ready_to_restart" && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-100 text-[#007f5f] shadow-md">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-[#0d1117]">
                  Update Ready to Apply!
                </h3>
                <p className="text-xs text-[#5f6673] max-w-sm mx-auto">
                  Version <strong className="text-[#0d1117]">v{newVersion}</strong> has been downloaded and cryptographically verified. Restart the application now to finalize the upgrade.
                </p>
              </div>
            </div>
          )}

          {/* State 6: Error */}
          {status === "error" && (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-600 border border-amber-200 shadow-xs">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-black text-[#0d1117]">
                  Update Check Notice
                </h3>
                <p className="text-xs text-[#5f6673] max-w-sm mx-auto leading-relaxed">
                  {errorMessage || "Unable to complete the update check."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#e2e4e8] bg-[#f8f9fc] px-6 py-4">
          <div className="text-[11px] font-medium text-[#5f6673]">
            {status === "update_available" ? "Seamless in-place update" : "Official PRDS Naga Build"}
          </div>

          <div className="flex items-center gap-2.5">
            {status === "checking" && (
              <button
                type="button"
                onClick={onClose}
                className="h-9 rounded-xl border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#42474e] hover:bg-[#f1f3f5] transition cursor-pointer"
              >
                Cancel
              </button>
            )}

            {status === "up_to_date" && (
              <>
                <button
                  type="button"
                  onClick={runUpdateCheck}
                  className="flex h-9 items-center gap-1.5 rounded-xl border border-[#d8dadc] bg-white px-3.5 text-xs font-bold text-[#42474e] hover:bg-[#f1f3f5] transition cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Check Again
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-xl bg-[#007f5f] px-5 text-xs font-bold text-white hover:bg-[#00694e] shadow-2xs transition cursor-pointer"
                >
                  Done
                </button>
              </>
            )}

            {status === "update_available" && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-xl border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#42474e] hover:bg-[#f1f3f5] transition cursor-pointer"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={handleStartUpdate}
                  className="flex h-9 items-center gap-2 rounded-xl bg-[#007f5f] px-5 text-xs font-black text-white hover:bg-[#00694e] shadow-md shadow-emerald-700/20 transition cursor-pointer"
                >
                  <Download className="h-4 w-4" />
                  Download & Install
                </button>
              </>
            )}

            {status === "ready_to_restart" && (
              <button
                type="button"
                onClick={handleRestartNow}
                className="flex h-9 items-center gap-2 rounded-xl bg-[#007f5f] px-6 text-xs font-black text-white hover:bg-[#00694e] shadow-md shadow-emerald-700/20 transition cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                Restart Application
              </button>
            )}

            {status === "error" && (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="h-9 rounded-xl border border-[#d8dadc] bg-white px-4 text-xs font-bold text-[#42474e] hover:bg-[#f1f3f5] transition cursor-pointer"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={runUpdateCheck}
                  className="flex h-9 items-center gap-1.5 rounded-xl bg-[#007f5f] px-4 text-xs font-bold text-white hover:bg-[#00694e] shadow-2xs transition cursor-pointer"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Check
                </button>
              </>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
