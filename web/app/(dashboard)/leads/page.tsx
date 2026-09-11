"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { apiRequest, ApiError } from "@/lib/api-client";
import { StatusBadge } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

interface Lead {
  id: string;
  firstName: string;
  lastName: string | null;
  phoneE164: string;
  development: string | null;
  status: string;
  consent?: { optIn: boolean } | null;
  createdAt: string;
}

interface ImportSummary {
  totalRows: number;
  imported: number;
  duplicates: number;
  invalidPhones: number;
  missingRequiredFields: number;
}

export default function LeadsPage() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [showManualForm, setShowManualForm] = useState(false);
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canImport = user?.role === "ADMIN" || user?.role === "MANAGER";

  async function loadLeads() {
    const data = await apiRequest<Lead[]>("/leads");
    setLeads(data);
  }

  useEffect(() => {
    loadLeads().catch(() => setLeads([]));
  }, []);

  async function handleImportFile(e: FormEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportError(null);
    setImportSummary(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const summary = await apiRequest<ImportSummary>("/leads/import", { method: "POST", formData });
      setImportSummary(summary);
      await loadLeads();
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : "Falha ao importar arquivo.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div>
      <header className="mb-7 flex items-start justify-between">
        <div>
          <h1 className="font-serif text-2xl text-ink">Leads</h1>
          <p className="text-sm text-muted mt-1">
            {leads ? `${leads.length} leads cadastrados` : "Carregando..."}
          </p>
        </div>

        <div className="flex gap-2">
          {canImport && (
            <label className="text-sm font-medium px-3.5 py-2 rounded border border-border bg-white text-ink hover:border-amber cursor-pointer transition-colors">
              {importing ? "Importando..." : "Importar CSV/XLSX"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleImportFile}
                disabled={importing}
              />
            </label>
          )}
          <button
            onClick={() => setShowManualForm((v) => !v)}
            className="text-sm font-medium px-3.5 py-2 rounded bg-ink text-paper hover:bg-ink/90 transition-colors"
          >
            {showManualForm ? "Cancelar" : "Novo lead"}
          </button>
        </div>
      </header>

      {importError && (
        <p className="text-sm text-rust mb-4 rounded border border-rust/30 bg-rust/5 px-4 py-2">{importError}</p>
      )}

      {importSummary && (
        <div className="mb-6 rounded border border-border bg-white px-5 py-4">
          <p className="text-sm font-medium text-ink mb-2">Resultado da importação</p>
          <div className="grid grid-cols-5 gap-3 text-sm">
            <div>
              <p className="text-muted text-xs">Linhas no arquivo</p>
              <p className="text-ink">{importSummary.totalRows}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Importados</p>
              <p className="text-pine">{importSummary.imported}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Duplicados</p>
              <p className="text-ink">{importSummary.duplicates}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Telefones inválidos</p>
              <p className="text-rust">{importSummary.invalidPhones}</p>
            </div>
            <div>
              <p className="text-muted text-xs">Campos ausentes</p>
              <p className="text-rust">{importSummary.missingRequiredFields}</p>
            </div>
          </div>
        </div>
      )}

      {showManualForm && (
        <ManualLeadForm
          onCreated={() => {
            setShowManualForm(false);
            loadLeads();
          }}
        />
      )}

      <div className="rounded border border-border bg-white overflow-hidden">
        {!leads ? (
          <p className="px-5 py-4 text-sm text-muted">Carregando...</p>
        ) : leads.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">
            Nenhum lead cadastrado ainda. Importe um arquivo ou cadastre manualmente.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted border-b border-border">
                <th className="px-5 py-2 font-normal">Nome</th>
                <th className="px-5 py-2 font-normal">Telefone</th>
                <th className="px-5 py-2 font-normal">Empreendimento</th>
                <th className="px-5 py-2 font-normal">Opt-in</th>
                <th className="px-5 py-2 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-ink">
                    {lead.firstName} {lead.lastName || ""}
                  </td>
                  <td className="px-5 py-3 text-ink">{lead.phoneE164}</td>
                  <td className="px-5 py-3 text-muted">{lead.development || "—"}</td>
                  <td className="px-5 py-3">
                    {lead.consent?.optIn ? (
                      <span className="text-pine text-xs font-medium">sim</span>
                    ) : (
                      <span className="text-rust text-xs font-medium">não</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={lead.status} />
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

function ManualLeadForm({ onCreated }: { onCreated: () => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [development, setDevelopment] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiRequest("/leads", {
        method: "POST",
        body: { firstName, lastName, phone, development, optIn, optInSource: "manual" },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível cadastrar o lead.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 rounded border border-border bg-white p-5">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-ink/80 mb-1">Nome</label>
          <input
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber"
          />
        </div>
        <div>
          <label className="block text-sm text-ink/80 mb-1">Sobrenome</label>
          <input
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber"
          />
        </div>
        <div>
          <label className="block text-sm text-ink/80 mb-1">Telefone</label>
          <input
            required
            placeholder="(11) 99999-9999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber"
          />
        </div>
        <div>
          <label className="block text-sm text-ink/80 mb-1">Empreendimento</label>
          <input
            value={development}
            onChange={(e) => setDevelopment(e.target.value)}
            className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink mb-4">
        <input type="checkbox" checked={optIn} onChange={(e) => setOptIn(e.target.checked)} />
        Lead consentiu em receber mensagens via WhatsApp
      </label>

      {error && <p className="text-sm text-rust mb-3">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="text-sm font-medium px-4 py-2 rounded bg-ink text-paper hover:bg-ink/90 disabled:opacity-60 transition-colors"
      >
        {submitting ? "Salvando..." : "Cadastrar lead"}
      </button>
    </form>
  );
}
