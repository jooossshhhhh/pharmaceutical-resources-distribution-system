import ModalShell from "../ModalShell";

export default function OpeningFileProgressModal({
  openingState,
  onClose,
  onRetry,
}) {
  if (!openingState || !openingState.exportItem) {
    return null;
  }

  const {
    exportItem,
    status = "preparing",
    progress = 20,
    message = "Preparing export file...",
    forceOpenWith = false,
    error = null,
  } = openingState;

  const isSuccess = status === "success";
  const isError = status === "error";
  const isLaunching = status === "launching" || status === "preparing";

  const targetAppText = forceOpenWith
    ? "Windows 'Open with' application selector"
    : "Microsoft Excel or compatible spreadsheet application";

  return (
    <ModalShell
      labelledBy="opening-file-modal-title"
      onClose={onClose}
      overlayClassName="bg-slate-950/45 backdrop-blur-sm"
      panelClassName="max-w-md"
    >
      <div className="w-full overflow-hidden rounded-2xl border border-[#d8dadc] bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Top emerald accent bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#007f5f] via-[#2ec4b6] to-[#007f5f]" />

        <div className="p-6">
          {/* Header Row */}
          <div className="flex items-start gap-4">
            {/* Status Icon Badge */}
            <div className="relative shrink-0">
              {isSuccess ? (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm animate-in zoom-in-75 duration-200">
                  <CheckMarkIcon />
                </div>
              ) : isError ? (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 shadow-sm animate-in zoom-in-75 duration-200">
                  <AlertCircleIcon />
                </div>
              ) : (
                <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8fff7] text-[#007f5f] shadow-sm">
                  <span className="absolute -inset-1 rounded-2xl bg-[#007f5f]/15 animate-ping" />
                  <FileSpreadsheetIcon className="relative z-10 h-6 w-6" />
                </div>
              )}
            </div>

            {/* Title & Target Context */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-[#007f5f]">
                  {isSuccess
                    ? "Application Ready"
                    : isError
                    ? "Action Needed"
                    : "Opening File"}
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1 text-[#5f6673] hover:bg-[#f1f3f5] hover:text-[#0d1117] transition cursor-pointer"
                  aria-label="Close modal"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              <h2
                id="opening-file-modal-title"
                className="mt-0.5 text-base font-black text-[#0d1117]"
              >
                {isSuccess
                  ? "Application Launched"
                  : isError
                  ? "Unable to Open File"
                  : "Launching Desktop App..."}
              </h2>

              <p className="mt-0.5 text-xs text-[#5f6673]">
                {isSuccess
                  ? `File dispatched to ${targetAppText}.`
                  : isError
                  ? "Failed to launch external application."
                  : `Connecting to ${targetAppText}...`}
              </p>
            </div>
          </div>

          {/* File Information Card */}
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-[#eef0f3] bg-[#f8f9fc] p-3.5">
            <FormatBadge format={exportItem.format} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p
                  className="truncate font-mono text-xs font-bold text-[#0d1117]"
                  title={exportItem.filename}
                >
                  {exportItem.filename}
                </p>
                {exportItem.size && (
                  <span className="shrink-0 rounded bg-[#eef0f3] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#5f6673]">
                    {exportItem.size}
                  </span>
                )}
              </div>
              <div
                className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[#5f6673]"
                title={exportItem.filePath || "Downloads\\PRDS_Exports"}
              >
                <FolderIcon className="h-3.5 w-3.5 shrink-0 text-[#8c95a6]" />
                <span className="truncate font-mono text-[10px] text-[#5f6673]">
                  {exportItem.filePath ? exportItem.filePath : "Downloads\\PRDS_Exports"}
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bar & Status Text */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-bold text-[#0d1117]">
                {isLaunching && (
                  <span className="h-2 w-2 rounded-full bg-[#007f5f] animate-pulse" />
                )}
                {message}
              </span>
              <span className="font-mono text-[11px] font-bold text-[#5f6673]">
                {Math.min(100, Math.max(0, Math.round(progress)))}%
              </span>
            </div>

            <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#eef0f3]">
              <div
                className={`h-full rounded-full transition-all duration-300 ease-out ${
                  isError
                    ? "bg-rose-500"
                    : isSuccess
                    ? "bg-emerald-600"
                    : "bg-gradient-to-r from-[#007f5f] via-[#00b074] to-[#007f5f]"
                }`}
                style={{ width: `${Math.min(100, Math.max(5, progress))}%` }}
              />
            </div>
          </div>

          {/* Waiting Context Notice */}
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-[#d0e1fd] bg-[#eff4ff]/60 px-3.5 py-2.5 text-xs text-[#003b7a]">
            <InfoIcon className="h-4 w-4 shrink-0 mt-0.5 text-[#003b7a]" />
            <p className="leading-relaxed">
              {isSuccess
                ? "The application has been triggered. If Excel or the selected viewer does not appear in front immediately, check your Windows taskbar."
                : isError
                ? (error ||
                  "Ensure Microsoft Excel or a compatible spreadsheet application is installed on your computer, or choose 'Open with' to pick an installed app.")
                : "Desktop applications may take a few seconds to start up. PRDS is preparing the file and passing it to the native operating system."}
            </p>
          </div>

          {/* Footer Action Buttons */}
          <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-[#eef0f3] pt-4">
            {isError ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[#d8dadc] px-4 py-2 text-xs font-bold text-[#5f6673] hover:bg-[#f8f9fc] transition cursor-pointer"
                >
                  Close
                </button>
                {onRetry && (
                  <button
                    type="button"
                    onClick={onRetry}
                    className="rounded-xl bg-[#007f5f] px-4 py-2 text-xs font-bold text-white hover:bg-[#00664c] transition shadow-sm cursor-pointer"
                  >
                    Try Again
                  </button>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[#d8dadc] bg-white px-4 py-2 text-xs font-bold text-[#0d1117] hover:bg-[#f8f9fc] transition cursor-pointer"
              >
                {isSuccess ? "Done" : "Dismiss (Open in background)"}
              </button>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function FormatBadge({ format }) {
  if (format === "EXCEL") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-[10px] font-black text-emerald-800">
        XLS
      </span>
    );
  }
  if (format === "CSV") {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-[10px] font-black text-sky-800">
        CSV
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[10px] font-black text-neutral-700">
      DOC
    </span>
  );
}

function FileSpreadsheetIcon({ className = "h-5 w-5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M8 13h2" />
      <path d="M8 17h2" />
      <path d="M14 13h2" />
      <path d="M14 17h2" />
    </svg>
  );
}

function CheckMarkIcon() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" viewBox="0 0 24 24">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function InfoIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

function CloseIcon({ className = "h-4 w-4" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function FolderIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

