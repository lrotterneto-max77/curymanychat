import { Sidebar } from "@/components/Sidebar";
import { RequireAuth } from "@/components/RequireAuth";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex-1 px-8 py-7 max-w-6xl">{children}</main>
      </div>
    </RequireAuth>
  );
}
