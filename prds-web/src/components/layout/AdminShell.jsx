import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";

export default function AdminShell({
  children,
  currentDateTime,
  profile,
  onSignOut,
}) {
  return (
    <main className="min-h-screen bg-[#f7f6f3] text-slate-950">
      <div className="grid min-h-screen grid-cols-[228px_1fr]">
        <AdminSidebar profile={profile} />
        <div className="flex min-w-0 flex-col">
          <AdminHeader
            currentDateTime={currentDateTime}
            profile={profile}
            onSignOut={onSignOut}
          />
          <section className="min-w-0 flex-1 overflow-auto px-6 py-5">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
