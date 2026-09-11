"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", implemented: true },
  { href: "/leads", label: "Leads", implemented: true },
  { href: "/conversas", label: "Conversas", implemented: false },
  { href: "/campaigns", label: "Campanhas", implemented: true },
  { href: "/templates", label: "Templates", implemented: true },
  { href: "/corretores", label: "Corretores", implemented: false },
  { href: "/pipeline", label: "Pipeline", implemented: false },
  { href: "/relatorios", label: "Relatórios", implemented: false },
  { href: "/compliance", label: "Compliance", implemented: false },
  { href: "/configuracoes", label: "Configurações", implemented: false },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-60 shrink-0 bg-ink min-h-screen flex flex-col">
      <div className="px-5 pt-6 pb-8">
        <p className="font-serif text-lg text-paper leading-tight">CRM Imobiliário</p>
        <p className="text-xs text-paper/50 mt-0.5">WhatsApp Business</p>
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const active = pathname?.startsWith(item.href);
          if (!item.implemented) {
            return (
              <div
                key={item.href}
                className="flex items-center justify-between px-3 py-2 rounded text-sm text-paper/30 cursor-not-allowed"
                title="Módulo ainda não implementado"
              >
                <span>{item.label}</span>
                <span className="text-[10px]">em breve</span>
              </div>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded text-sm transition-colors ${
                active ? "bg-paper text-ink font-medium" : "text-paper/75 hover:bg-paper/10 hover:text-paper"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-paper/10">
        <p className="text-sm text-paper">{user?.name}</p>
        <p className="text-xs text-paper/50 mb-3">{user?.role}</p>
        <button onClick={logout} className="text-xs text-paper/60 hover:text-paper transition-colors">
          Sair
        </button>
      </div>
    </aside>
  );
}
