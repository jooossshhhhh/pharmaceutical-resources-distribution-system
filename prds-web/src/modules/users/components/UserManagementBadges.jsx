import { getRequestStatusLabel, getStatusLabel } from "../userManagementUtils";

export function UserStatusBadge({ status }) {
  const classes = {
    ACTIVE: "bg-emerald-100 text-emerald-700",
    DEACTIVATED: "bg-neutral-100 text-neutral-600",
    PENDING: "bg-amber-100 text-amber-700",
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${classes[status] || classes.PENDING}`}>
      {getStatusLabel(status)}
    </span>
  );
}

export function RequestStatusBadge({ status }) {
  const classes = {
    APPROVED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-neutral-100 text-neutral-600",
    PENDING: "bg-amber-100 text-amber-700",
    REJECTED: "bg-red-100 text-red-700",
  };

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${classes[status] || classes.PENDING}`}>
      {getRequestStatusLabel(status)}
    </span>
  );
}

export function RoleBadge({ children }) {
  return (
    <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-black text-blue-700">
      {children}
    </span>
  );
}
