"use client";

import { useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api-client";
import { StatusBadge } from "@/components/ui";

interface Template {
  id: string;
  name: string;
  category: string;
  language: string;
  status: string;
  body: string;
  lastSyncedAt: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await apiRequest<Template[]>("/templates");
    setTemplates(data);
  }

  useEffect(() => {
    load().catch(() => setTemplates([]));
  }, []);

  async function handleSync() {
    setSyncing(true);
    setError(null);
    try {
      await apiRequest("/templates/sync", { method: "POST" });
      await load();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Falha ao sincronizar com a Meta. Verifique as credenciais no backend."
      );
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <header className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl text-ink">Templates</h1>
          <p className="text-sm text-muted mt-1">
            Sincronizados diretamente da conta oficial do WhatsApp Business.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="text-sm font-medium px-3.5 py-2 rounded bg-ink text-paper hover:bg-ink/90 disabled:opacity-60 transition-colors"
        >
          {syncing ? "Sincronizando..." : "Sincronizar com a Meta"}
        </button>
      </header>

      {error && (
        <p className="text-sm text-rust mb-4 rounded border border-rust/30 bg-rust/5 px-4 py-2">{error}</p>
      )}

      <div className="rounded border border-border bg-white overflow-hidden">
        {!templates ? (
          <p className="px-5 py-4 text-sm text-muted">Carregando...</p>
        ) : templates.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            Nenhum template sincronizado ainda. Clique em "Sincronizar com a Meta".
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-5 py-2 font-normal">Nome</th>
                <th className="px-5 py-2 font-normal">Categoria</th>
                <th className="px-5 py-2 font-normal">Idioma</th>
                <th className="px-5 py-2 font-normal">Status</th>
                <th className="px-5 py-2 font-normal">Conteúdo</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-ink">{t.name}</td>
                  <td className="px-5 py-3 text-muted">{t.category}</td>
                  <td className="px-5 py-3 text-muted">{t.language}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="px-5 py-3 text-muted max-w-xs truncate">{t.body}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
