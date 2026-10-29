import { useEffect, useId } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, Sparkles, Check } from "lucide-react";
import ModalShell from "./ModalShell";

/**
 * Parses and formats text, wrapping requisition or reference codes (e.g. #RQ-04B7DBCB)
 * in highlighted badge chips.
 */
function FormattedNoticeMessage({ text }) {
  if (!text) return null;
  // Match patterns like #RQ-XXXXXX or RQ-XXXXXX or PO NO. XXXXXX
  const regex = /(#?RQ-[A-Za-z0-9_-]+|PO\s+NO\.\s*[A-Za-z0-9_-]+)/gi;
  const parts = text.split(regex);

  if (parts.length === 1) {
    return <span>{text}</span>;
  }

  return (
    <span>
      {parts.map((part, index) => {
        if (regex.test(part)) {
          return (
            <span
              key={index}
              className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded-md font-mono text-xs font-black tracking-wide bg-[#E8F5F1] text-[#2D7A5D] border border-[#4C9F80]/30"
            >
              {part}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}

const TYPE_CONFIG = {
  success: {
    accentGradient: "from-[#1F4E5A] via-[#286575] to-[#1F4E5A]",
    iconBg: "bg-[#E8F5F1] text-[#2D7A5D] ring-8 ring-[#E8F5F1]/70 border border-[#4C9F80]/30 shadow-[#4C9F80]/10",
    eyebrowColor: "bg-[#E8F5F1] text-[#2D7A5D] border-[#4C9F80]/30",
    buttonBg: "bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] hover:brightness-105 active:scale-[0.99] text-white shadow-xs",
    defaultEyebrow: "Success Notification",
    defaultTitle: "Action Completed",
    Icon: CheckCircle2,
  },
  info: {
    accentGradient: "from-[#1F4E5A] via-[#34769B] to-[#1F4E5A]",
    iconBg: "bg-[#E5EFF1] text-[#1F4E5A] ring-8 ring-[#E5EFF1]/70 border border-[#34769B]/30 shadow-[#1F4E5A]/10",
    eyebrowColor: "bg-[#E5EFF1] text-[#1F4E5A] border-[#34769B]/30",
    buttonBg: "bg-linear-to-r from-[#1F4E5A] to-[#286575] border border-[#1F4E5A] hover:brightness-105 active:scale-[0.99] text-white shadow-xs",
    defaultEyebrow: "Information",
    defaultTitle: "Notice",
    Icon: Info,
  },
  warning: {
    accentGradient: "from-[#D9826B] via-[#c2725d] to-[#D9826B]",
    iconBg: "bg-[#faedf0] text-[#D9826B] ring-8 ring-[#faedf0]/70 border border-[#D9826B]/30 shadow-[#D9826B]/10",
    eyebrowColor: "bg-[#faedf0] text-[#D9826B] border-[#D9826B]/30",
    buttonBg: "bg-[#D9826B] hover:brightness-105 active:scale-[0.99] text-white shadow-xs",
    defaultEyebrow: "Attention Required",
    defaultTitle: "Notice Update",
    Icon: AlertTriangle,
  },
  error: {
    accentGradient: "from-[#D9826B] via-[#c2725d] to-[#D9826B]",
    iconBg: "bg-[#faedf0] text-[#D9826B] ring-8 ring-[#faedf0]/70 border border-[#D9826B]/30 shadow-[#D9826B]/10",
    eyebrowColor: "bg-[#faedf0] text-[#D9826B] border-[#D9826B]/30",
    buttonBg: "bg-[#D9826B] hover:brightness-105 active:scale-[0.99] text-white shadow-xs",
    defaultEyebrow: "System Alert",
    defaultTitle: "Action Failed",
    Icon: AlertCircle,
  },
};

/**
 * Derives presentation config from a notice object or string.
 */
function resolveNoticeData(notice, customTitle, customType) {
  if (!notice) return null;

  if (typeof notice === "object") {
    const rawType = notice.type || customType || "success";
    const type = TYPE_CONFIG[rawType] ? rawType : "success";
    return {
      title: notice.title || customTitle || TYPE_CONFIG[type].defaultTitle,
      message: notice.message || "",
      detail: notice.detail || "",
      eyebrow: notice.eyebrow || TYPE_CONFIG[type].defaultEyebrow,
      actionLabel: notice.actionLabel || "Got it",
      type,
    };
  }

  const message = String(notice);
  let inferredType = customType || "success";
  let inferredTitle = customTitle || "";
  let inferredEyebrow = "";
  let inferredDetail = "";

  const lower = message.toLowerCase();
  if (lower.includes("approved and released")) {
    inferredType = "success";
    inferredTitle = inferredTitle || "Requisition Approved & Released";
    inferredEyebrow = "Distribution Update";
    inferredDetail = "Requisition status has updated to Ready to Pickup. Barangay health workers can now collect allocated supplies.";
  } else if (lower.includes("rejected")) {
    inferredType = "warning";
    inferredTitle = inferredTitle || "Requisition Rejected";
    inferredEyebrow = "Requisition Review";
  } else if (lower.includes("queued offline")) {
    inferredType = "info";
    inferredTitle = inferredTitle || "Queued Offline";
    inferredEyebrow = "Offline Storage";
    inferredDetail = "The action was safely recorded locally and will synchronize once internet connection is restored.";
  } else if (lower.includes("completed")) {
    inferredType = "success";
    inferredTitle = inferredTitle || "Requisition Completed";
    inferredEyebrow = "Supply Chain Receipt";
    inferredDetail = "The requisition was successfully acknowledged and marked as Completed.";
  } else if (lower.includes("failed") || lower.includes("error")) {
    inferredType = "error";
    inferredTitle = inferredTitle || "Operation Error";
    inferredEyebrow = "System Alert";
  } else {
    inferredType = customType || "success";
    inferredTitle = inferredTitle || TYPE_CONFIG[inferredType].defaultTitle;
    inferredEyebrow = TYPE_CONFIG[inferredType].defaultEyebrow;
  }

  return {
    title: inferredTitle,
    message,
    detail: inferredDetail,
    eyebrow: inferredEyebrow,
    actionLabel: "Got it",
    type: inferredType,
  };
}

/**
 * NotificationModal
 *
 * A modern, accessible, floating pop-up modal for success and notification
 * messages across the PRDS application, replacing static inline banners.
 */
export default function NotificationModal({
  notice,
  onClose,
  title,
  type,
  actionLabel,
  autoCloseMs = null,
}) {
  const titleId = useId();
  const descId = useId();

  const data = resolveNoticeData(notice, title, type);

  // Close on Enter or Space for swift keyboard confirmation
  useEffect(() => {
    if (!data) return;

    const handleKeyDown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [data, onClose]);

  // Optional auto-close timer if specified
  useEffect(() => {
    if (!data || !autoCloseMs || autoCloseMs <= 0) return;
    const timer = setTimeout(() => {
      onClose?.();
    }, autoCloseMs);
    return () => clearTimeout(timer);
  }, [data, autoCloseMs, onClose]);

  if (!data) return null;

  const config = TYPE_CONFIG[data.type] || TYPE_CONFIG.success;
  const IconComponent = config.Icon;

  return (
    <ModalShell
      labelledBy={titleId}
      onClose={onClose}
      overlayClassName="bg-slate-950/45 backdrop-blur-sm"
      panelClassName="w-full max-w-md px-4 sm:px-0"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="relative w-full overflow-hidden rounded-2xl bg-[#F9FBFB] shadow-2xl border border-[#CFDDE0] text-center transition-all animate-in fade-in zoom-in-95 duration-200"
      >
        <div className="px-6 pt-7 pb-6 sm:px-8">
          {/* Centered Hero Icon */}
          <div className="relative mx-auto mb-4 flex h-16 w-16 items-center justify-center">
            <div
              className={`flex h-16 w-16 items-center justify-center rounded-2xl ${config.iconBg} shadow-sm transition-transform duration-300 scale-100`}
            >
              <IconComponent className="h-8 w-8 stroke-[2.3]" />
            </div>
          </div>

          {/* Eyebrow badge */}
          {data.eyebrow && (
            <div className="mb-2 flex items-center justify-center">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-black uppercase tracking-wider border ${config.eyebrowColor}`}
              >
                {data.type === "success" && <Sparkles className="h-3 w-3 text-[#2D7A5D]" />}
                {data.eyebrow}
              </span>
            </div>
          )}

          {/* Title */}
          <h3
            id={titleId}
            className="text-lg sm:text-xl font-black text-[#1B2B30] tracking-tight leading-tight"
          >
            {data.title}
          </h3>

          {/* Main message */}
          <div
            id={descId}
            className="mt-2 text-sm font-semibold leading-relaxed text-neutral-600"
          >
            <FormattedNoticeMessage text={data.message} />
          </div>

          {/* Optional context subtext */}
          {data.detail && (
            <div className="mt-3.5 rounded-xl border border-neutral-200/70 bg-neutral-50/80 px-3.5 py-2.5 text-left text-xs font-medium text-neutral-600 leading-normal">
              {data.detail}
            </div>
          )}

          {/* Primary Action Button */}
          <div className="mt-6">
            <button
              type="button"
              onClick={onClose}
              autoFocus
              className={`w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold shadow-md transition-all active:scale-[0.99] cursor-pointer ${config.buttonBg}`}
            >
              <Check className="h-4 w-4 stroke-[2.5]" />
              <span>{actionLabel || data.actionLabel || "Got it"}</span>
            </button>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
