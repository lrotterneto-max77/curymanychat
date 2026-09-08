# CRM Imobiliário + WhatsApp Cloud API — Arquitetura

> Sistema de disparo, gestão e atendimento de leads via WhatsApp Business Platform (API oficial Meta), 100% compliance-first. Nenhum componente descrito aqui simula comportamento humano, roda por sessão não-oficial ou contorna rate limits/anti-spam da Meta.

---

## 1. Arquitetura Geral

```
┌─────────────────┐      ┌──────────────────────────────────────────┐
│   Frontend       │      │              Backend (API)                │
│   Next.js/React  │◄────►│  Auth · Leads · Campanhas · CRM · Reports │
│   (Vercel)       │ REST │  (Node.js/TS, Express ou Fastify)         │
└─────────────────┘  JWT  └──────────┬─────────────────┬──────────────┘
                                      │                 │
                        ┌─────────────▼───────┐  ┌──────▼───────────┐
                        │   PostgreSQL         │  │   Redis           │
                        │   (Prisma ORM)       │  │   (BullMQ filas)  │
                        └───────────────────────┘  └──────┬───────────┘
                                                            │
                                                   ┌────────▼─────────┐
                                                   │  Workers          │
                                                   │  - sendMessage    │
                                                   │  - syncTemplates  │
                                                   │  - complianceScan │
                                                   └────────┬──────────┘
                                                            │
                        ┌───────────────────────────────────▼───────────┐
                        │        Meta API Service (camada isolada)       │
                        │  - Cloud API (envio de templates/mensagens)    │
                        │  - Webhooks (status, mensagens recebidas)      │
                        │  - Template Sync                               │
                        └───────────────────────────────────┬───────────┘
                                                              │
                                                   ┌──────────▼──────────┐
                                                   │  Meta / WhatsApp     │
                                                   │  Cloud API (oficial) │
                                                   └───────────────────────┘
```

**Serviços isolados por responsabilidade** (facilita escalar horizontalmente depois):
- `api` — HTTP REST, autenticação, CRUD, regras de negócio síncronas
- `worker-sender` — consome fila `whatsapp:outbound`, chama Cloud API
- `worker-webhooks` — processa eventos recebidos da Meta (fila `whatsapp:inbound`)
- `worker-sync` — sincroniza templates e status da conta periodicamente
- `compliance-engine` — módulo (não microserviço separado no MVP) chamado de forma síncrona antes de qualquer enfileiramento de envio

No MVP tudo pode rodar em um único repo (monorepo com `apps/web`, `apps/api`, `apps/workers`, `packages/shared`), evoluindo para serviços separados quando o volume justificar.

---

## 2. Estrutura de Pastas

```
crm-imobiliario/
├── apps/
│   ├── web/                      # Next.js
│   │   ├── app/
│   │   │   ├── (auth)/login
│   │   │   ├── dashboard/
│   │   │   ├── leads/
│   │   │   ├── conversas/        # Inbox
│   │   │   ├── campanhas/
│   │   │   ├── templates/
│   │   │   ├── corretores/
│   │   │   ├── pipeline/
│   │   │   ├── relatorios/
│   │   │   ├── compliance/       # Saúde do WhatsApp
│   │   │   └── configuracoes/
│   │   ├── components/
│   │   └── lib/api-client.ts
│   │
│   ├── api/                      # Node.js + TypeScript (Fastify)
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── leads/
│   │   │   │   ├── campaigns/
│   │   │   │   ├── templates/
│   │   │   │   ├── conversations/
│   │   │   │   ├── pipeline/
│   │   │   │   ├── brokers/
│   │   │   │   ├── reports/
│   │   │   │   └── compliance/
│   │   │   ├── services/
│   │   │   │   ├── meta-api.service.ts     # única camada que fala com a Meta
│   │   │   │   ├── compliance-engine.ts
│   │   │   │   ├── phone-normalizer.ts     # E.164
│   │   │   │   └── audit-log.service.ts
│   │   │   ├── webhooks/
│   │   │   │   └── whatsapp.webhook.ts
│   │   │   ├── middlewares/ (auth, rbac, rate-limit, error-handler)
│   │   │   └── server.ts
│   │   └── prisma/schema.prisma
│   │
│   └── workers/
│       ├── src/
│       │   ├── queues/            # definição das filas BullMQ
│       │   ├── processors/
│       │   │   ├── send-message.processor.ts
│       │   │   ├── sync-templates.processor.ts
│       │   │   └── inbound-event.processor.ts
│       │   └── index.ts
│
├── packages/
│   └── shared/                    # tipos, validações (zod), constantes
│
├── docker-compose.yml             # postgres + redis (dev)
└── .env.example
```

---

## 3. Modelo de Banco de Dados (visão principal)

Tabelas centrais (Prisma):

- **User** (id, name, email, passwordHash, role[ADMIN|MANAGER|BROKER], createdAt)
- **Lead** (id, firstName, lastName, phoneE164, email, source, campaignName, development, entryDate, brokerId→User, status, tags[], notes, createdAt, updatedAt)
- **LeadConsent** (id, leadId, optIn:boolean, optInDate, optInSource, optInText, optOutDate, optOutReason) — 1:1 com Lead, histórico separado em **ConsentLog** (append-only)
- **SuppressionList** (id, phoneE164 único, reason, createdAt) — checado antes de qualquer envio
- **WhatsappTemplate** (id, metaTemplateId, name, category, language, status[APPROVED|PENDING|REJECTED|PAUSED], body, lastSyncedAt)
- **Campaign** (id, name, development, templateId→WhatsappTemplate, audienceFilter(json), scheduledAt, status[DRAFT|CONFIRMED|RUNNING|PAUSED|DONE], createdBy)
- **CampaignRecipient** (id, campaignId, leadId, status[PENDING|QUEUED|SENT|DELIVERED|READ|REPLIED|FAILED|SKIPPED], skipReason, messageId)
- **Message** (id, leadId, conversationId, direction[INBOUND|OUTBOUND], metaMessageId, templateId?, body, status, sentAt, deliveredAt, readAt, failReason)
- **Conversation** (id, leadId, brokerId, lastCustomerMessageAt, windowOpen:boolean-derivado, status)
- **PipelineStage** enum + **Lead.pipelineStage**
- **AuditLog** (id, userId, action, entityType, entityId, metadata(json), createdAt) — nunca deletado
- **ComplianceEvent** (id, type[BLOCKED_SEND|RATE_LIMIT|QUALITY_DROP|OPT_OUT_SPIKE], severity, message, createdAt)
- **WebhookEvent** (id, rawPayload(json), processedAt, type) — log bruto de tudo que chega da Meta, para auditoria/replay

**Índices críticos:** `phoneE164` (único em Lead e SuppressionList), `CampaignRecipient(campaignId, status)`, `Message(leadId, sentAt)`.

---

## 4. Fluxo WhatsApp / Meta Cloud API

1. **Configuração** — `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `META_ACCESS_TOKEN` (token de sistema, long-lived) vivem só no backend/worker; nunca no bundle do frontend.
2. **Envio de template** (fora da janela de 24h ou início ativo): worker chama `POST /{PHONE_NUMBER_ID}/messages` com `type: template`. Resposta traz `messages[0].id` → gravado em `Message.metaMessageId`.
3. **Mensagem de sessão** (dentro da janela de 24h, corretor respondendo pelo Inbox): mesmo endpoint, `type: text`.
4. **Webhook** (`GET` para verificação com `WEBHOOK_VERIFY_TOKEN`, `POST` para eventos): recebe `statuses` (sent/delivered/read/failed) e `messages` (inbound). Cada evento é gravado cru em `WebhookEvent` e depois processado por um worker idempotente (dedup por `metaMessageId`/`event id`).
5. **Sincronização de templates**: job periódico chama o endpoint de templates da WABA e faz upsert em `WhatsappTemplate`, atualizando status. Se um template aprovado virar `REJECTED`/`PAUSED`, qualquer campanha associada é automaticamente pausada.
6. Toda a integração passa por **um único serviço** (`meta-api.service.ts`) — nenhum outro módulo chama a Meta diretamente. Isso centraliza tratamento de erro, rate limit (HTTP 429) e logging.

---

## 5. Fluxo de Opt-in / Opt-out

**Entrada de opt-in:**
- Importação CSV/XLSX: campos `whatsapp_opt_in`, `opt_in_date`, `opt_in_source`, `opt_in_text` são obrigatórios para habilitar campanha ativa; se ausentes, o lead entra como `optIn: false` (pode existir no CRM, mas fica bloqueado para disparo ativo).
- Meta Lead Ads: o lead é criado automaticamente, mas o opt-in **não é presumido** — fica `pending` até confirmação/registro explícito do texto de consentimento apresentado no formulário do anúncio.
- Formulário próprio/landing page: grava o texto exato exibido no momento do consentimento.

**Opt-out:**
- Automático: worker de inbound detecta palavras-chave (SAIR, PARAR, STOP, CANCELAR, NÃO QUERO, REMOVER) → `LeadConsent.optIn=false`, insere em `SuppressionList`, loga em `ConsentLog`.
- Manual: botão "Não enviar mais mensagens" no Inbox chama a mesma rotina.
- Efeito: `SuppressionList` é checada em toda pré-validação de envio (compliance engine), independente do que estiver em `Lead`/`LeadConsent` — é a fonte de verdade final e mais rápida de consultar (índice único).

---

## 6. Fluxo de Campanhas

```
Criar campanha (rascunho)
   → Selecionar público (filtros: tag, empreendimento, origem, status)
   → Selecionar template aprovado
   → Pré-visualização de elegibilidade:
        total selecionado / com opt-in / sem opt-in / duplicados / inválidos / opt-out / elegíveis
   → Tela de CONFIRMAÇÃO explícita (mostra números acima novamente)
   → Ao confirmar: cria 1 CampaignRecipient por lead elegível, status PENDING
   → Job enfileira cada recipient em `whatsapp:outbound` (respeitando concorrência configurada)
   → Worker processa item a item → compliance engine → envio → atualiza status
```

Nenhum lead sem opt-in válido ou em suppression list chega a ser enfileirado — é filtrado já na consulta que gera os `CampaignRecipient`.

---

## 7. Estratégia de Filas (BullMQ + Redis)

- **Fila `whatsapp:outbound`**: um job por mensagem a enviar. Concorrência do worker configurável (ex.: começa conservador, ex. 5–10 simultâneos) e ajustável via painel de compliance.
- **Rate limiting da fila**: usar o rate limiter nativo do BullMQ (`limiter: { max, duration }`) calibrado abaixo dos limites informados pela documentação oficial da Meta para a conta/tier atual — nunca definido para "testar o limite".
- **Backoff exponencial automático** do BullMQ em falhas transitórias (timeout, 5xx). Em **HTTP 429**, o worker pausa a fila inteira (`queue.pause()`) pelo tempo indicado no header/documentação, em vez de apenas re-tentar o job individual.
- **Idempotência**: cada job carrega `campaignRecipientId`; antes de chamar a Meta, o worker confirma que o status ainda é `QUEUED` (evita duplo envio em caso de reprocessamento).
- **Fila `whatsapp:inbound`**: processa webhooks de forma assíncrona e idempotente (dedup por id do evento).
- **Fila `templates:sync`**: job agendado (cron, ex. a cada X horas) que atualiza status dos templates.
- Todas as filas têm **dead-letter** (jobs que falham definitivamente vão para uma fila de revisão manual, nunca são descartados silenciosamente).

---

## 8. Estratégia de Webhooks

- Endpoint único `POST /webhooks/whatsapp`, validado por assinatura (`X-Hub-Signature-256`) usando `META_APP_SECRET`.
- Handler grava o payload cru em `WebhookEvent` **antes** de qualquer processamento (garante nunca perder dado mesmo se o parsing falhar).
- Resposta `200` imediata para a Meta (processamento pesado é delegado à fila `whatsapp:inbound`, evitando timeout/retentativas desnecessárias da Meta).
- Verificação inicial (`GET`) valida `hub.verify_token` contra `WEBHOOK_VERIFY_TOKEN`.

---

## 9. Compliance Engine

Módulo síncrono chamado **imediatamente antes** de qualquer job de envio ser criado (na criação da campanha) e **novamente** pelo worker (defesa em profundidade). Verifica, nesta ordem:

1. Telefone válido (E.164)?
2. Está na `SuppressionList`? → bloqueia
3. `LeadConsent.optIn == true`? → senão bloqueia (quando exigido pela política vigente)
4. Duplicado dentro da mesma campanha? → deduplicar
5. Template está `APPROVED`? → senão bloqueia
6. Se mensagem de sessão (não-template): janela de atendimento aberta (`lastCustomerMessageAt` dentro do período vigente)? → senão exige template
7. Status da conta/qualidade do número (consultado/cacheado do painel de compliance) está saudável? → se degradado, alerta e pode pausar campanhas automaticamente
8. Limite de taxa vigente não estourado (contador local sincronizado com respostas da API)?

Qualquer falha → `status = SKIPPED`, grava `skipReason`, gera `ComplianceEvent` quando relevante (ex. pico de opt-out), **nunca envia**.

O painel "Saúde do WhatsApp" lê os `ComplianceEvent` e métricas agregadas para mostrar alertas e permitir "Pausar campanha" manualmente.

---

## 10. Variáveis de Ambiente

```
# Meta / WhatsApp Cloud API
META_APP_ID=
META_APP_SECRET=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
META_ACCESS_TOKEN=
WEBHOOK_VERIFY_TOKEN=

# Banco de dados
DATABASE_URL=postgresql://user:pass@host:5432/crm_imobiliario

# Redis / Filas
REDIS_URL=redis://host:6379

# Auth
JWT_SECRET=
JWT_EXPIRES_IN=7d

# App
NODE_ENV=production
API_BASE_URL=
WEB_BASE_URL=
LOG_LEVEL=info

# Compliance / Filas
OUTBOUND_QUEUE_CONCURRENCY=8
OUTBOUND_RATE_LIMIT_MAX=
OUTBOUND_RATE_LIMIT_DURATION_MS=
```

---

## Próximos passos

Com essa arquitetura validada, a implementação segue módulo por módulo, na ordem sugerida por você (item 25): **schema Prisma → auth/RBAC → importação de leads + normalização/opt-in → serviço Meta API + webhooks → templates → compliance engine → filas/workers → campanhas → inbox/CRM/pipeline → relatórios → painel de compliance**.

Antes de eu escrever a primeira linha de código, confirme:
1. Você já tem uma conta WhatsApp Business Platform configurada na Meta (WABA + número + App no Meta for Developers), ou isso também precisa ser guiado?
2. Prefere que eu comece pelo **schema Prisma completo** (fundação de tudo) ou por um **módulo vertical fatiado** (ex.: importação de leads → dashboard, funcionando ponta a ponta primeiro)?
