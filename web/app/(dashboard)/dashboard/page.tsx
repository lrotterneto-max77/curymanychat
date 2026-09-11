"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api-client";
import { StatCard, StatusBadge } from "@/components/ui";

interface Lead {
  id: string;
  status: string;
  consent?: { optIn: boolean } | null;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  createdAt: string;
  _count?: { recipients: number };
}

export default function DashboardPage() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([apiRequest<Lead[]>("/leads"), apiRequest<Campaign[]>("/campaigns")])
      .then(([l, c]) => {
        setLeads(l);
        setCampaigns(c);
      })
      .catch(() => setError("Não foi possível carregar os dados do dashboard."));
  }, []);

  const totalLeads = leads?.length ?? 0;
  const withOptIn = leads?.filter((l) => l.consent?.optIn).length ?? 0;
  const novos = leads?.filter((l) => l.status === "NOVO").length ?? 0;
  const qualificados = leads?.filter((l) => l.status === "QUALIFICADO").length ?? 0;
  const running = campaigns?.filter((c) => c.status === "RUNNING").length ?? 0;

  return (
    <div>
      <header className="mb-7">
        <h1 className="font-serif text-2xl text-ink">Dashboard</h1>
        <p className="text-sm text-muted mt-1">Visão geral da operação de leads e WhatsApp.</p>
      </header>

      {error && <p className="text-sm text-rust mb-4">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <StatCard label="Leads cadastrados" value={leads ? totalLeads : "—"} />
        <StatCard label="Leads novos" value={leads ? novos : "—"} />
        <StatCard label="Com opt-in válido" value={leads ? withOptIn : "—"} tone="pine" />
        <StatCard label="Qualificados" value={leads ? qualificados : "—"} tone="amber" />
        <StatCard label="Campanhas em andamento" value={campaigns ? running : "—"} />
      </div>

      <section>
        <h2 className="font-serif text-lg text-ink mb-3">Campanhas recentes</h2>
        <div className="rounded border border-border bg-white overflow-hidden">
          {!campaigns ? (
            <p className="px-5 py-4 text-sm text-muted">Carregando...</p>
          ) : campaigns.length === 0 ? (
            <p className="px-5 py-4 text-sm text-muted">Nenhuma campanha criada ainda.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted border-b border-border">
                  <th className="px-5 py-2 font-normal">Campanha</th>
                  <th className="px-5 py-2 font-normal">Status</th>
                  <th className="px-5 py-2 font-normal">Destinatários</th>
                  <th className="px-5 py-2 font-normal">Criada em</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.slice(0, 8).map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-5 py-3 text-ink">{c.name}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="px-5 py-3 text-ink">{c._count?.recipients ?? 0}</td>
                    <td className="px-5 py-3 text-muted">{new Date(c.createdAt).toLocaleDateString("pt-BR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
