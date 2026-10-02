import { openWithExport, reDownloadExport, viewExport } from "../../services/downloadManager";

export default function DownloadsPopover({
  isOpen,
  onClose,
  exports = [],
  isExporting = false,
  openingExport = null,
  downloadPath = "Downloads\\PRDS_Exports",
  onOpenSettings = null,
  onClear,
}) {
  if (!isOpen) return null;

  return (
    <>
      {/* Invisible backdrop to dismiss when clicking outside */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="absolute right-12 top-13 z-50 w-84 overflow-hidden rounded-2xl border border-[#d8dadc] bg-white shadow-2xl shadow-neutral-900/15 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#eef0f3] bg-[#f8f9fc] px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#e8fff7] text-[#007f5f]">
              <TrayIcon />
            </span>
            <span className="text-xs font-black tracking-wide text-[#0d1117]">
              Recent Exports
            </span>
            {exports.length > 0 && (
              <span className="rounded-full bg-[#007f5f]/10 px-2 py-0.5 text-[10px] font-black text-[#007f5f]">
                {exports.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {exports.length > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] font-bold text-[#5f6673] hover:text-red-600 transition cursor-pointer"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#5f6673] hover:bg-[#eef0f3] hover:text-[#0d1117] transition cursor-pointer"
              aria-label="Close exports popover"
            >
              <CloseMiniIcon />
            </button>
          </div>
        </div>

        {/* Content List */}
        <div className="prds-modal-scrollbar max-h-72 overflow-y-auto divide-y divide-[#f0f2f5]">
          {isExporting && (
            <div className="flex items-center gap-3 bg-[#e8fff7]/40 px-4 py-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#007f5f] border-t-transparent" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-black text-[#007f5f]">Exporting file...</p>
                <p className="text-[10px] text-[#5f6673]">Preparing workbook and formatting</p>
              </div>
            </div>
          )}

          {exports.length === 0 && !isExporting ? (
            <div className="px-4 py-8 text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f3f5] text-[#5f6673]">
                <FileEmptyIcon />
              </div>
              <p className="text-xs font-bold text-[#0d1117]">No exports yet</p>
              <p className="mt-0.5 text-[11px] text-[#5f6673]">
                Exporting to Excel will list your files here
              </p>
            </div>
          ) : (
            exports.map((item) => {
              const isOpeningThis = openingExport?.exportItem?.id === item.id;
              return (
                <div
                  key={item.id}
                  className="group flex items-center justify-between gap-3 px-4 py-2.5 transition hover:bg-[#f8f9fc]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <FormatBadge format={item.format} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[#0d1117]" title={item.filename}>
                        {item.filename}
                      </p>
                      <p className="text-[10px] text-[#5f6673]">
                        {item.timeLabel} {item.size ? `· ${item.size}` : ""}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={Boolean(isOpeningThis)}
                    onClick={() => viewExport(item)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openWithExport(item);
                    }}
                    title="Click to view in Excel or default app (right-click for Open with...)"
                    className={`shrink-0 flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-bold transition cursor-pointer ${
                      isOpeningThis
                        ? "border-[#007f5f]/30 bg-[#e8fff7] text-[#007f5f] cursor-wait opacity-100"
                        : "border-[#d8dadc] bg-white text-[#0d1117] opacity-90 hover:bg-[#eff4ff] hover:text-[#003b7a] group-hover:opacity-100"
                    }`}
                  >
                    {isOpeningThis ? (
                      <>
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#007f5f] border-t-transparent" />
                        Opening...
                      </>
                    ) : (
                      <>
                        <EyeMiniIcon />
                        View
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer with destination folder */}
        {downloadPath && (
          <div className="flex items-center justify-between border-t border-[#eef0f3] bg-[#f8f9fc] px-3.5 py-2 text-[10px] text-[#5f6673]">
            <div className="flex min-w-0 items-center gap-1.5" title={`Export directory: ${downloadPath}`}>
              <FolderMiniIcon className="h-3.5 w-3.5 shrink-0 text-[#8c95a6]" />
              <span className="truncate font-mono">{downloadPath}</span>
            </div>
            {onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="ml-2 shrink-0 font-bold text-[#007f5f] hover:underline cursor-pointer"
              >
                Change
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function FormatBadge({ format }) {
  if (format === "EXCEL") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-[10px] font-black text-emerald-800">
        XLS
      </span>
    );
  }
  if (format === "CSV") {
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-[10px] font-black text-sky-800">
        CSV
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-[10px] font-black text-neutral-700">
      DOC
    </span>
  );
}

function TrayIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24">
      <polyline points="21 15 21 19 3 19 3 15" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function EyeMiniIcon() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function FileEmptyIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

function CloseMiniIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function FolderMiniIcon({ className = "h-3.5 w-3.5" }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24">
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </svg>
  );
}

