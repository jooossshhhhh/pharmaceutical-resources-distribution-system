import AdminHeader from "./AdminHeader";
import AdminSidebar from "./AdminSidebar";

export default function AdminShell({
  children,
  currentDateTime,
  profile,
  onSignOut,
}) {
  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="grid min-h-screen grid-cols-[220px_1fr]">
        <AdminSidebar />
        <div className="flex min-w-0 flex-col">
          <AdminHeader
            currentDateTime={currentDateTime}
            profile={profile}
            onSignOut={onSignOut}
          />
          <section className="min-w-0 flex-1 overflow-auto p-6">
            {children}
          </section>
        </div>
      </div>
    </main>
  );
}
