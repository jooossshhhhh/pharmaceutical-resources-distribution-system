import prdsLogo from "../../assets/prds-logo-main.svg";
import { Link, useLocation } from "react-router-dom";

const navIcons = {
  Dashboard: (
    <path d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z" />
  ),
  Facilities: (
    <path d="M5 20V7l7-3 7 3v13h-5v-5h-4v5H5Zm4-9h2V9H9v2Zm4 0h2V9h-2v2Z" />
  ),
  Medicines: (
    <path d="M8.5 4.5a4 4 0 0 1 5.66 0l5.34 5.34a4 4 0 0 1-5.66 5.66L8.5 10.16a4 4 0 0 1 0-5.66Zm1.42 1.42a2 2 0 0 0 0 2.83l2.67 2.67 2.83-2.83-2.67-2.67a2 2 0 0 0-2.83 0Z" />
  ),
  Suppliers: (
    <path d="M3 7h11v10H3V7Zm11 3h3l4 4v3h-7v-7Zm-8 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm12 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
  ),
  Inventory: (
    <path d="M4 6 12 3l8 3v12l-8 3-8-3V6Zm8 3 5.4-2L12 5 6.6 7 12 9Zm-6 1.2v6.4l5 1.88v-6.4l-5-1.88Zm7 8.28 5-1.88v-6.4l-5 1.88v6.4Z" />
  ),
  Requests: (
    <path d="M6 3h9l3 3v15H6V3Zm8 1.5V7h2.5L14 4.5ZM8 10h8v2H8v-2Zm0 4h8v2H8v-2Z" />
  ),
  Transfers: (
    <path d="M7 7h11l-3-3 1.4-1.4L22 8l-5.6 5.4L15 12l3-3H7V7ZM17 17H6l3 3-1.4 1.4L2 16l5.6-5.4L9 12l-3 3h11v2Z" />
  ),
  Patients: (
    <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0H5Z" />
  ),
  Dispensing: (
    <path d="M7 4h10v6a5 5 0 0 1-4 4.9V19h4v2H7v-2h4v-4.1A5 5 0 0 1 7 10V4Zm2 2v4a3 3 0 0 0 6 0V6H9Z" />
  ),
  Programs: (
    <path d="M5 4h14v17l-7-3-7 3V4Zm3 4h8V6H8v2Zm0 4h8v-2H8v2Z" />
  ),
  Forecasting: (
    <path d="M4 19h16v2H4V3h2v12.6l4-4 3 3L19 8.6 20.4 10 13 17.4l-3-3-4 4V19Z" />
  ),
  Reports: (
    <path d="M5 3h14v18H5V3Zm3 4h8V5H8v2Zm0 4h8V9H8v2Zm0 4h5v-2H8v2Z" />
  ),
  "Activity Logs": (
    <path d="M12 3a9 9 0 1 1-8.49 12h2.18A7 7 0 1 0 5 12H2l4-4 4 4H7a5 5 0 1 1 1.46 3.54L10 14a3 3 0 1 0-.88-2.12H12V3Z" />
  ),
  Settings: (
    <path d="M19.4 13.5a7.8 7.8 0 0 0 0-3l2-1.5-2-3.4-2.4 1a7.2 7.2 0 0 0-2.6-1.5L14 2h-4l-.4 3.1A7.2 7.2 0 0 0 7 6.6l-2.4-1-2 3.4 2 1.5a7.8 7.8 0 0 0 0 3l-2 1.5 2 3.4 2.4-1a7.2 7.2 0 0 0 2.6 1.5L10 22h4l.4-3.1a7.2 7.2 0 0 0 2.6-1.5l2.4 1 2-3.4-2-1.5ZM12 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
  ),
};

const navSections = [
  {
    label: "Core",
    items: [
      { label: "Dashboard", path: "/dashboard" },
      { label: "Facilities", path: "/facilities" },
      { label: "Medicines", path: "/medicines" },
      { label: "Suppliers", path: "/suppliers" },
      { label: "Inventory", path: "/inventory" },
    ],
  },
  {
    label: "Logistics",
    items: [{ label: "Requests" }, { label: "Transfers" }],
  },
  {
    label: "Patient Care",
    items: [{ label: "Patients" }, { label: "Dispensing" }, { label: "Programs" }],
  },
  {
    label: "Analytics & System",
    items: [
      { label: "Forecasting" },
      { label: "Reports" },
      { label: "Activity Logs" },
      { label: "Settings" },
    ],
  },
];

const SidebarIcon = ({ item }) => (
  <svg
    aria-hidden="true"
    className="h-4 w-4 shrink-0"
    fill="currentColor"
    viewBox="0 0 24 24"
  >
    {navIcons[item]}
  </svg>
);

export default function AdminSidebar() {
  const location = useLocation();

  return (
    <aside className="border-r border-slate-200 bg-white px-4 py-5">
      <div className="mb-8 flex items-center gap-3">
        <img
          src={prdsLogo}
          alt="PRDS"
          className="h-11 w-11 shrink-0 rounded-md object-contain"
        />
        <div>
          <p className="text-xl font-black text-emerald-700">Pharma II</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
            Central Health Office
          </p>
        </div>
      </div>

      <nav className="space-y-5">
        {navSections.map((section) => (
          <div key={section.label}>
            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = item.path === location.pathname;
                const itemClass = `flex w-full items-center gap-3 rounded-sm px-3 py-2 text-left text-xs font-semibold transition ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`;

                return item.path ? (
                  <Link key={item.label} to={item.path} className={itemClass}>
                    <SidebarIcon item={item.label} />
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    className={`${itemClass} cursor-default opacity-80`}
                  >
                    <SidebarIcon item={item.label} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
