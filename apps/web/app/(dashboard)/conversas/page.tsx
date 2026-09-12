"use client";

import { useCallback, useEffect, useRef, useState, FormEvent } from "react";
import { apiRequest, ApiError } from "@/lib/api-client";

interface ConversationListItem {
  leadId: string;
  leadName: string;
  phone: string;
  brokerName: string | null;
  status: string;
  lastMessage: string | null;
  lastMessageDirection: "INBOUND" | "OUTBOUND" | null;
  lastMessageAt: string | null;
  windowOpen: boolean;
}

interface ListResponse {
  items: ConversationListItem[];
  total: number;
  page: number;
  pageSize: number;
}

interface Message {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  body: string | null;
  status: string;
  createdAt: string;
}

interface ConversationDetail {
  leadId: string;
  status: string;
  windowOpen: boolean;
  lastCustomerMessageAt: string | null;
  lead: {
    firstName: string;
    lastName: string | null;
    phoneE164: string;
    broker: { name: string } | null;
  };
  messages: Message[];
}

const PAGE_SIZE = 20;
const LIST_POLL_MS = 5000;
const DETAIL_POLL_MS = 4000;

function formatTimestamp(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function ConversasPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [listData, setListData] = useState<ListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // debounce da busca
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchList = useCallback(async (): Promise<ListResponse | null> => {
    const qs = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
    if (search) qs.set("q", search);
    return apiRequest<ListResponse>(`/conversations?${qs.toString()}`);
  }, [page, search]);

  // polling da lista
  useEffect(() => {
    let cancelled = false;

    async function load(showSpinner: boolean) {
      if (showSpinner) setListLoading(true);
      try {
        const data = await fetchList();
        if (!cancelled) {
          setListData(data);
          setListError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setListError(err instanceof ApiError ? err.message : "Não foi possível carregar as conversas.");
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    }

    load(true);
    const interval = setInterval(() => load(false), LIST_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchList]);

  const fetchDetail = useCallback(async (leadId: string): Promise<ConversationDetail> => {
    return apiRequest<ConversationDetail>(`/conversations/${leadId}`);
  }, []);

  // polling do detalhe da conversa selecionada
  useEffect(() => {
    if (!selectedLeadId) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    async function load(showSpinner: boolean) {
      if (showSpinner) setDetailLoading(true);
      try {
        const data = await fetchDetail(selectedLeadId as string);
        if (!cancelled) {
          setDetail(data);
          setDetailError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setDetailError(
            err instanceof ApiError ? err.message : "Não foi possível carregar esta conversa."
          );
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    load(true);
    const interval = setInterval(() => load(false), DETAIL_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [selectedLeadId, fetchDetail]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!selectedLeadId || !draft.trim() || !detail?.windowOpen) return;

    setSending(true);
    setSendError(null);
    try {
      await apiRequest(`/conversations/${selectedLeadId}/messages`, {
        method: "POST",
        body: { body: draft.trim() },
      });
      setDraft("");
      const updated = await fetchDetail(selectedLeadId);
      setDetail(updated);
      fetchList().then(setListData).catch(() => {});
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : "Não foi possível enviar a mensagem.");
    } finally {
      setSending(false);
    }
  }

  const totalPages = listData ? Math.max(1, Math.ceil(listData.total / PAGE_SIZE)) : 1;

  return (
    <div className="h-[calc(100vh-56px)] md:h-[calc(100vh-112px)] flex flex-col">
      <header className="mb-5 shrink-0">
        <h1 className="font-serif text-2xl text-ink">Conversas</h1>
        <p className="text-sm text-muted mt-1">Atendimento via WhatsApp, em tempo quase real.</p>
      </header>

      <div className="flex-1 min-h-0 rounded border border-border bg-white flex overflow-hidden">
        {/* Lista de conversas */}
        <div
          className={`w-full md:w-80 shrink-0 border-r border-border flex flex-col ${
            selectedLeadId ? "hidden md:flex" : "flex"
          }`}
        >
          <div className="p-3 border-b border-border">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por nome ou telefone"
              className="w-full rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber"
            />
          </div>

          <div className="flex-1 overflow-y-auto">
            {listLoading && !listData ? (
              <p className="px-4 py-4 text-sm text-muted">Carregando conversas...</p>
            ) : listError ? (
              <p className="px-4 py-4 text-sm text-rust">{listError}</p>
            ) : listData && listData.items.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">
                {search ? "Nenhuma conversa encontrada para essa busca." : "Nenhuma conversa ainda."}
              </p>
            ) : (
              listData?.items.map((c) => (
                <button
                  key={c.leadId}
                  onClick={() => setSelectedLeadId(c.leadId)}
                  className={`w-full text-left px-4 py-3 border-b border-border last:border-0 hover:bg-paper transition-colors ${
                    selectedLeadId === c.leadId ? "bg-paper" : "bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink truncate">{c.leadName || c.phone}</p>
                    <span className="text-[11px] text-muted shrink-0">{formatTimestamp(c.lastMessageAt)}</span>
                  </div>
                  <p className="text-xs text-muted truncate mt-0.5">{c.phone}</p>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <p className="text-xs text-muted truncate">
                      {c.lastMessageDirection === "OUTBOUND" && <span className="text-ink/50">Você: </span>}
                      {c.lastMessage || "—"}
                    </p>
                    <span
                      className={`text-[10px] shrink-0 rounded px-1.5 py-0.5 font-medium ${
                        c.windowOpen ? "bg-pine/15 text-pine" : "bg-rust/15 text-rust"
                      }`}
                    >
                      {c.windowOpen ? "aberta" : "fechada"}
                    </span>
                  </div>
                </button>
              ))
            )}
          </div>

          {listData && listData.total > PAGE_SIZE && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border text-xs text-muted">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="disabled:opacity-40 hover:text-ink"
              >
                Anterior
              </button>
              <span>
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="disabled:opacity-40 hover:text-ink"
              >
                Próxima
              </button>
            </div>
          )}
        </div>

        {/* Painel da conversa selecionada */}
        <div className={`flex-1 min-w-0 flex-col ${selectedLeadId ? "flex" : "hidden md:flex"}`}>
          {!selectedLeadId ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted">Selecione uma conversa para visualizar o histórico.</p>
            </div>
          ) : detailLoading && !detail ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted">Carregando conversa...</p>
            </div>
          ) : detailError ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-rust">{detailError}</p>
            </div>
          ) : detail ? (
            <>
              <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setSelectedLeadId(null)}
                    className="md:hidden text-sm text-muted hover:text-ink shrink-0"
                  >
                    Voltar
                  </button>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {[detail.lead.firstName, detail.lead.lastName].filter(Boolean).join(" ") ||
                        detail.lead.phoneE164}
                    </p>
                    <p className="text-xs text-muted truncate">
                      {detail.lead.phoneE164}
                      {detail.lead.broker?.name ? ` · corretor: ${detail.lead.broker.name}` : ""}
                    </p>
                  </div>
                </div>
                <span
                  className={`text-xs shrink-0 rounded px-2 py-1 font-medium ${
                    detail.windowOpen ? "bg-pine/15 text-pine" : "bg-rust/15 text-rust"
                  }`}
                >
                  Janela {detail.windowOpen ? "Aberta" : "Fechada"}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-paper/40">
                {detail.messages.length === 0 ? (
                  <p className="text-sm text-muted text-center mt-8">Nenhuma mensagem ainda nesta conversa.</p>
                ) : (
                  detail.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.direction === "OUTBOUND" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[75%] rounded px-3 py-2 text-sm ${
                          m.direction === "OUTBOUND"
                            ? "bg-ink text-paper"
                            : "bg-white text-ink border border-border"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{m.body || "(sem conteúdo de texto)"}</p>
                        <p
                          className={`text-[10px] mt-1 ${
                            m.direction === "OUTBOUND" ? "text-paper/60" : "text-muted"
                          }`}
                        >
                          {new Date(m.createdAt).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-border p-3">
                {!detail.windowOpen ? (
                  <p className="text-xs text-muted bg-rust/5 border border-rust/20 rounded px-3 py-2">
                    Janela de atendimento fechada. Para reiniciar a conversa é necessário disparar um template
                    aprovado (via Campanhas) — o cliente precisa responder para reabrir a janela de 24h.
                  </p>
                ) : (
                  <form onSubmit={handleSend} className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend(e as unknown as FormEvent);
                        }
                      }}
                      rows={1}
                      placeholder="Escreva uma mensagem..."
                      className="flex-1 resize-none rounded border border-border px-3 py-2 text-sm outline-none focus:border-amber"
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      className="text-sm font-medium px-4 py-2 rounded bg-ink text-paper hover:bg-ink/90 disabled:opacity-60 transition-colors shrink-0"
                    >
                      {sending ? "Enviando..." : "Enviar"}
                    </button>
                  </form>
                )}
                {sendError && <p className="text-xs text-rust mt-2">{sendError}</p>}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
