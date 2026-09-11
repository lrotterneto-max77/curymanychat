# CRM Imobiliário + WhatsApp Cloud API — Backend

Backend funcional (API + Workers) do sistema de disparo, gestão e atendimento de leads via **WhatsApp Business Platform (Meta Cloud API oficial)**.

⚠️ Este projeto usa **exclusivamente a API oficial da Meta**. Não há, e não deve haver, nenhuma integração via WhatsApp Web, Selenium, Puppeteer, Baileys, WPPConnect, Venom, QR Code ou qualquer mecanismo de bypass de rate limit/anti-spam.

## Pré-requisitos

- Node.js 20+
- Docker (para Postgres + Redis locais) ou instâncias já provisionadas
- Uma conta WhatsApp Business Platform configurada no Meta for Developers: App, WhatsApp Business Account (WABA), número verificado, token de acesso de sistema (long-lived) e o `WEBHOOK_VERIFY_TOKEN` de sua escolha configurado no painel da Meta

## Setup

```bash
cd apps/api
cp .env.example .env
# preencha DATABASE_URL, REDIS_URL e as credenciais META_* no .env

# na raiz do projeto:
docker compose up -d          # sobe Postgres + Redis

cd apps/api
npm install
npm run prisma:migrate        # cria as tabelas
npm run prisma:seed           # cria usuário admin (admin@imobiliaria.com / admin123)

npm run dev                   # inicia a API em http://localhost:3333
```

Em outro terminal, inicie os workers (envio, recepção de webhooks, sync de templates):

```bash
cd apps/api
npm run worker
```

## Configurando o Webhook na Meta

No painel do App (Meta for Developers → WhatsApp → Configuration):

- **Callback URL**: `https://SEU_DOMINIO/webhooks/whatsapp`
- **Verify Token**: o mesmo valor definido em `WEBHOOK_VERIFY_TOKEN`
- Assine os campos `messages` (necessário para receber status e mensagens)

Em desenvolvimento local, exponha a porta 3333 com uma ferramenta de tunelamento (ex. ngrok) para a Meta conseguir alcançar seu webhook.

## Endpoints principais implementados

| Método | Rota | Descrição |
|---|---|---|
| POST | `/auth/login` | Login, retorna JWT |
| POST | `/auth/users` | Cria usuário (ADMIN only) |
| GET | `/leads` | Lista leads (RBAC: corretor só vê os seus) |
| POST | `/leads` | Cadastro manual de lead |
| POST | `/leads/import` | Importação CSV/XLSX (ADMIN/MANAGER) |
| POST | `/leads/:id/opt-out` | Botão "Não enviar mais mensagens" |
| GET | `/templates` | Lista templates sincronizados |
| POST | `/templates/sync` | Sincroniza templates com a Meta |
| POST | `/campaigns` | Cria campanha (rascunho) |
| GET | `/campaigns/:id/preview` | Preview de elegibilidade antes de confirmar |
| POST | `/campaigns/:id/confirm` | Confirma e dispara a campanha |
| POST | `/campaigns/:id/pause` | Pausa campanha em andamento |
| GET/POST | `/webhooks/whatsapp` | Webhook oficial da Meta |

## O que já está implementado

- Schema completo (Prisma) com LGPD (opt-in/opt-out, `ConsentLog` append-only, `SuppressionList`, `AuditLog`)
- Auth com JWT + RBAC (ADMIN / MANAGER / BROKER)
- Importação de leads (CSV/XLSX/manual) com normalização E.164 e detecção de duplicados/inválidos
- Serviço isolado de comunicação com a Meta Cloud API (`meta-api.service.ts`)
- Compliance Engine (bloqueia envio sem opt-in, template não aprovado, opt-out, janela fechada)
- Filas BullMQ (`whatsapp:outbound`, `whatsapp:inbound`, `templates:sync`) com backoff exponencial, idempotência e pausa automática em HTTP 429
- Webhook com verificação de assinatura (`X-Hub-Signature-256`) e processamento assíncrono
- Opt-out automático por palavra-chave (SAIR/PARAR/STOP/CANCELAR/etc.) e botão manual
- Sincronização de templates com pausa automática de campanhas quando um template deixa de estar aprovado

## Próximos módulos (não incluídos nesta entrega)

- CRM/Pipeline (Kanban), Inbox visual, distribuição para corretores (round-robin), relatórios, painel "Saúde do WhatsApp", Meta Lead Ads webhook, e o frontend Next.js.

Peça para eu continuar com qualquer um desses módulos.
