"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api-client";
import { StatusBadge } from "@/components/ui";

interface Campaign {
  id: string;
  name: string;
  development: string | null;
  status: string;
  createdAt: string;
  template: { name: string };
  _count?: { recipients: number };
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiRequest<Campaign[]>("/campaigns");
    setCampaigns(data);
  }

  useEffect(() => {
    load().catch(() => setCampaigns([]));
  }, []);

  async function handlePause(id: string) {
    setError(null);
    try {
      await apiRequest(`/campaigns/${id}/pause`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível pausar a campanha.");
    }
  }

  return (
    <div>
      <header className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl text-ink">Campanhas</h1>
          <p className="text-sm text-muted mt-1">Disparo de mensagens via template aprovado.</p>
        </div>
        <Link
          href="/campaigns/new"
          className="text-sm font-medium px-3.5 py-2 rounded bg-ink text-paper hover:bg-ink/90 transition-colors"
        >
          Nova campanha
        </Link>
      </header>

      {error && (
        <p className="text-sm text-rust mb-4 rounded border border-rust/30 bg-rust/5 px-4 py-2">{error}</p>
      )}

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
                <th className="px-5 py-2 font-normal">Template</th>
                <th className="px-5 py-2 font-normal">Empreendimento</th>
                <th className="px-5 py-2 font-normal">Destinatários</th>
                <th className="px-5 py-2 font-normal">Status</th>
                <th className="px-5 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-ink">{c.name}</td>
                  <td className="px-5 py-3 text-muted">{c.template?.name}</td>
                  <td className="px-5 py-3 text-muted">{c.development || "—"}</td>
                  <td className="px-5 py-3 text-ink">{c._count?.recipients ?? 0}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    {c.status === "RUNNING" && (
                      <button
                        onClick={() => handlePause(c.id)}
                        className="text-xs font-medium text-rust hover:underline"
                      >
                        Pausar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
