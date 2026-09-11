"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api-client";

interface Template {
  id: string;
  name: string;
  status: string;
  category: string;
}

interface Preview {
  totalSelected: number;
  withOptIn: number;
  withoutOptIn: number;
  duplicates: number;
  invalid: number;
  optedOut: number;
  eligible: number;
}

const LEAD_STATUSES = [
  "NOVO",
  "PRIMEIRO_CONTATO",
  "RESPONDEU",
  "QUALIFICADO",
  "SIMULACAO",
  "VISITA_AGENDADA",
  "VISITOU",
  "PROPOSTA",
  "VENDA",
  "PERDIDO",
  "SEM_INTERESSE",
];

export default function NewCampaignPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [templates, setTemplates] = useState<Template[]>([]);
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [development, setDevelopment] = useState("");
  const [status, setStatus] = useState("");
  const [tags, setTags] = useState("");

  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiRequest<Template[]>("/templates")
      .then((all) => setTemplates(all.filter((t) => t.status === "APPROVED")))
      .catch(() => setTemplates([]));
  }, []);

  async function handleCreateDraft() {
    setError(null);
    setLoading(true);
    try {
      const audienceFilter: Record<string, unknown> = {};
      if (development) audienceFilter.development = development;
      if (status) audienceFilter.status = status;
      if (tags) audienceFilter.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);

      const campaign = await apiRequest<{ id: string }>("/campaigns", {
        method: "POST",
        body: { name, templateId, development: development || undefined, audienceFilter },
      });
      setCampaignId(campaign.id);

      const previewResult = await apiRequest<Preview>(`/campaigns/${campaign.id}/preview`);
      setPreview(previewResult);
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível criar a campanha.");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    if (!campaignId) return;
    setError(null);
    setLoading(true);
    try {
      await apiRequest(`/campaigns/${campaignId}/confirm`, { method: "POST" });
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível confirmar o disparo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <header className="mb-7">
        <h1 className="font-serif text-2xl text-ink">Nova campanha</h1>
        <p className="text-sm text-muted mt-1">
          {step === 1 && "Defina o público e o template a ser utilizado."}
          {step === 2 && "Confira a elegibilidade antes de confirmar o disparo."}
          {step === 3 && "Campanha confirmada."}
        </p>
      </header>

      {error && (
        <p className="text-sm text-rust mb-4 rounded border border-rust/30 bg-rust/5 px-4 py-2">{error}</p>
      )}

      {step === 1 && (
        <div className="rounded border border-border bg-white p-5 space-y-4">
          <div>
            <label className="block text-sm text-ink/80 mb-1">Nome da campanha</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber"
              placeholder="Ex: Reengajamento — Residencial Aurora"
            />
          </div>

          <div>
            <label className="block text-sm text-ink/80 mb-1">Template (apenas aprovados)</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber bg-white"
            >
              <option value="">Selecione um template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.category})
                </option>
              ))}
            </select>
            {templates.length === 0 && (
              <p className="text-xs text-muted mt-1">
                Nenhum template aprovado disponível. Sincronize na página Templates.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-ink/80 mb-1">Empreendimento (opcional)</label>
              <input
                value={development}
                onChange={(e) => setDevelopment(e.target.value)}
                className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber"
              />
            </div>
            <div>
              <label className="block text-sm text-ink/80 mb-1">Status do lead (opcional)</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber bg-white"
              >
                <option value="">Qualquer status</option>
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm text-ink/80 mb-1">Tags (separadas por vírgula, opcional)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber"
              placeholder="ex: interesse-alto, financiamento"
            />
          </div>

          <button
            onClick={handleCreateDraft}
            disabled={loading || !name || !templateId}
            className="text-sm font-medium px-4 py-2 rounded bg-ink text-paper hover:bg-ink/90 disabled:opacity-60 transition-colors"
          >
            {loading ? "Calculando elegibilidade..." : "Avançar para revisão"}
          </button>
        </div>
      )}

      {step === 2 && preview && (
        <div className="rounded border border-border bg-white p-5">
          <p className="text-sm font-medium text-ink mb-4">Elegibilidade do público selecionado</p>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <PreviewStat label="Total selecionado" value={preview.totalSelected} />
            <PreviewStat label="Com opt-in" value={preview.withOptIn} tone="pine" />
            <PreviewStat label="Sem opt-in" value={preview.withoutOptIn} tone="rust" />
            <PreviewStat label="Duplicados" value={preview.duplicates} />
            <PreviewStat label="Telefones inválidos" value={preview.invalid} tone="rust" />
            <PreviewStat label="Opt-out (suppression list)" value={preview.optedOut} tone="rust" />
          </div>

          <div className="rounded bg-amber/10 border border-amber/30 px-4 py-3 mb-5">
            <p className="text-sm text-ink">
              <span className="font-medium text-amber">{preview.eligible} leads elegíveis</span> receberão a
              mensagem. Os demais serão automaticamente ignorados e não contam para nenhum limite.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={loading || preview.eligible === 0}
              className="text-sm font-medium px-4 py-2 rounded bg-ink text-paper hover:bg-ink/90 disabled:opacity-60 transition-colors"
            >
              {loading ? "Confirmando..." : `Confirmar e disparar para ${preview.eligible} leads`}
            </button>
            <button
              onClick={() => setStep(1)}
              className="text-sm font-medium px-4 py-2 rounded border border-border text-ink hover:border-amber transition-colors"
            >
              Voltar
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="rounded border border-border bg-white p-5">
          <p className="text-sm text-ink mb-4">
            Campanha confirmada. As mensagens foram enfileiradas e serão enviadas respeitando os limites da
            Meta Cloud API.
          </p>
          <button
            onClick={() => router.push("/campaigns")}
            className="text-sm font-medium px-4 py-2 rounded bg-ink text-paper hover:bg-ink/90 transition-colors"
          >
            Ver campanhas
          </button>
        </div>
      )}
    </div>
  );
}

function PreviewStat({ label, value, tone }: { label: string; value: number; tone?: "pine" | "rust" }) {
  const toneClass = tone === "pine" ? "text-pine" : tone === "rust" ? "text-rust" : "text-ink";
  return (
    <div>
      <p className="text-xs text-muted mb-0.5">{label}</p>
      <p className={`font-serif text-xl ${toneClass}`}>{value}</p>
    </div>
  );
}
