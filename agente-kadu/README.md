# Agente Kadu — SDR de IA via WhatsApp

Backend (Node.js + TypeScript) que implementa o agente de IA "Kadu", responsável por
recepcionar leads via WhatsApp, qualificá-los, fechar agendamentos e integrar com o
CRM da Kadosh Mini Caçambas (Supabase) e o Google Agenda.

A especificação completa está em [`docs/PRD-agente-kadu.txt`](docs/PRD-agente-kadu.txt).
O prompt de sistema usado pelo agente é versionado em [`prompts/system-prompt-v1.md`](prompts/system-prompt-v1.md) (RNF03.1).

## Status deste esqueleto

✅ Implementado:
- Webhook do WhatsApp (Evolution API) autenticado por segredo na URL (RNF01.3)
- Orquestração do agente com Claude (Anthropic SDK), incluindo as tools em [`src/agent/tools.ts`](src/agent/tools.ts)
- Integração com o Supabase existente (tabela `leads` + novas tabelas `mensagens`,
  `agendamentos`, `pix_solicitacoes` — ver [`../SUPABASE_PATCH_03.sql`](../SUPABASE_PATCH_03.sql)
  e [`../SUPABASE_PATCH_04.sql`](../SUPABASE_PATCH_04.sql))
- Sinal via PIX **desativado** (2026-07-23): não é mais cobrado adiantado, estava travando
  reservas — `create_appointment` é chamado direto ao cliente confirmar. Tools `send_pix_request`/
  `confirm_pix` seguem no código só pro caso raro do próprio cliente pedir pra adiantar.
- CEP é apenas dado de apoio pra localizar o endereço — nunca trava o fechamento (2026-07-23)
- Locação com 1 dia de permanência incluso + diária adicional configurável por dia extra
- Pausa automática de 24h do agente quando um humano responde manualmente pelo WhatsApp
- Rotina de follow-up automático (2026-07-23): se o cliente ficar 2min sem responder após
  uma mensagem do Kadu, o backend gera e envia UM follow-up cordial e não insistente pra
  tentar resgatar a venda (`src/services/followup.service.ts` + `src/queue/followupScheduler.ts`)
- Criação de evento no Google Agenda (Service Account, opcional)
- Geração de link de rota do Google Maps
- Briefing diário operacional (cron configurável, padrão 06h30 América/Cuiabá)
- Agente administrativo/financeiro ("Kadu Financeiro") no grupo operacional —
  consultas de agenda, financeiro e funil de leads (ver seção 8)
- Rate limiting por telefone, log de auditoria de mensagens, endpoint `/health`

⏳ Não implementado neste esqueleto (ver seção "Próximos passos"):
- Fila assíncrona (Redis/BullMQ) — RNF02.4
- Upload de comprovantes PIX para storage (S3/R2 ou Supabase Storage) — RF04.3
- Sentry / Grafana — RNF02.5
- Testes automatizados — RNF03.4

## 1. Pré-requisitos

- Node.js 20+
- Projeto Supabase já existente (mesmo do CRM)
- Servidor Evolution API (v2) com uma instância conectada ao número da Kadosh
- (Opcional) Service Account do Google com acesso ao Google Agenda
- (Opcional) Chave da OpenAI para transcrição de áudio (Whisper)

## 2. Instalação

```bash
cd agente-kadu
npm install
cp .env.example .env
```

Preencha o `.env` com os valores reais (veja a seção 4 — "Informações pendentes").

## 3. Rodando

```bash
npm run dev      # desenvolvimento (recarrega automaticamente)
npm run build    # compila para dist/
npm start        # roda a versão compilada
npm run typecheck
```

O servidor sobe em `http://localhost:3000`. Endpoints:

- `GET /health` — status das integrações
- `POST /webhook/whatsapp/:secret` — recebe eventos da Evolution API (`:secret` = `WEBHOOK_SECRET`)

Para testar localmente, exponha a porta com [ngrok](https://ngrok.com/) ou similar e
configure essa URL como webhook da instância na Evolution API (painel `/manager` ou
`POST /webhook/set/{instance}`, evento `MESSAGES_UPSERT`).

## 4. Banco de dados (Supabase)

Execute no SQL Editor do Supabase, na ordem (caso ainda não tenha rodado):

1. `SUPABASE_MIGRATION.sql`
2. `SUPABASE_PATCH_01.sql`
3. `SUPABASE_PATCH_02.sql`
4. `SUPABASE_PATCH_03.sql`
5. `SUPABASE_PATCH_04.sql` ← novo, necessário para o agente

O Patch 03 adiciona:
- Colunas em `leads`: `tipo_residuo`, `bairro`, `quantidade_cacambas`, `prazo_data`, `classificacao`
- Tabela `mensagens` (log de auditoria das conversas — RNF01.5)
- Tabela `agendamentos` (locações propostas/confirmadas)
- Tabela `pix_solicitacoes` (controle do sinal de 50%)
- Novas etapas no Kanban (`Sinal Pendente`, `Escalado`)

O Patch 04 adiciona:
- Coluna `leads.atendimento_humano_em` (pausa de 24h do agente após atendimento humano manual)
- Coluna `agendamentos.dias_permanencia` (dias de permanência da caçamba, padrão 1)

## 5. Informações pendentes (preencher no `.env`)

Conforme a seção 8 do PRD, os itens abaixo precisam ser fornecidos pela Kadosh:

| Variável | O que é | Onde conseguir |
|---|---|---|
| `CHAVE_PIX` | Chave PIX (uso excepcional — cliente adiantando por conta própria, não é mais cobrado) | Conta bancária da empresa |
| `WHATSAPP_GRUPO_OPERACIONAL_ID` | ID do grupo do WhatsApp da equipe | Ver seção 6 abaixo |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave de serviço do Supabase (já existe o projeto) | Supabase > Settings > API |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` | Credenciais do Google Agenda | Google Cloud Console |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_INSTANCE` | Conexão com a Evolution API e instância do número da Kadosh | Painel `/manager` do servidor Evolution |
| `WEBHOOK_SECRET` | Segredo aleatório usado na URL do webhook (`/webhook/whatsapp/:secret`) | Gerar com `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"` |
| `HORARIO_COMERCIAL_INICIO` / `HORARIO_COMERCIAL_FIM` | Horário de funcionamento das entregas | Equipe operacional |
| `PRECO_LOCACAO` | Preço da diária padrão (R$ 250 confirmado no PRD), já inclui 1 dia de permanência | Já preenchido como padrão |
| `DIARIA_ADICIONAL` | Valor cobrado por dia extra de permanência da caçamba, por caçamba | Já preenchido como padrão (R$ 25) |

Até esses valores serem preenchidos, o servidor falha ao iniciar com uma mensagem
clara listando as variáveis obrigatórias ausentes (validação via `zod` em
`src/config/env.ts`).

## 6. Como obter o ID do grupo do WhatsApp

O ID de um grupo (`xxxxxxxxxx@g.us`) pode ser obtido de duas formas:

- Chamando `GET /group/fetchAllGroups/{instance}?getParticipants=false` na Evolution API
  (header `apikey`) — retorna a lista de grupos com seus respectivos `id` (JID).
- Ou adicionando o número da Kadosh ao grupo operacional, pedindo para alguém mandar
  qualquer mensagem no grupo, e inspecionando o payload recebido em
  `/webhook/whatsapp/:secret` (log do `pino` mostra o JSON completo em modo `development`).

## 7. Estrutura do projeto

```
agente-kadu/
├── prompts/
│   ├── system-prompt-v1.md      # prompt do agente SDR Kadu (RNF03.1)
│   └── admin-prompt-v1.md       # prompt do agente administrativo/financeiro (RNF03.1)
├── docs/
│   └── PRD-agente-kadu.txt       # especificação completa
└── src/
    ├── server.ts                 # entrypoint Express
    ├── config/env.ts             # validação de variáveis de ambiente (zod)
    ├── lib/                       # logger, cliente Supabase
    ├── routes/                    # /health, /webhook/whatsapp/:secret
    ├── middleware/                # segredo do webhook, rate limit
    ├── services/                  # WhatsApp (Evolution API), CRM (Supabase), Google Agenda, Maps, briefing, transcrição
    ├── agent/                     # orquestração do agente SDR Kadu (Claude, tools, system prompt)
    │   └── adminAgent/            # agente administrativo/financeiro (grupo operacional)
    └── queue/                     # agendador (cron) do briefing diário
```

## 8. Agente Administrativo/Financeiro (Kadu Financeiro)

Além do agente SDR (1:1 com leads), há um segundo agente que atua dentro do
**grupo operacional do WhatsApp** (`WHATSAPP_GRUPO_OPERACIONAL_ID` — o mesmo grupo
que recebe o briefing diário), respondendo perguntas internas da equipe.

**Como ativar**: escreva no grupo operacional uma mensagem contendo a palavra-gatilho
configurada em `AGENTE_ADMIN_TRIGGER` (padrão: `"kadu"`, busca por palavra,
case-insensitive). Exemplos:

- "Kadu, qual a agenda de hoje?"
- "Kadu, agenda da semana"
- "Kadu, como está o financeiro do mês?"
- "Kadu, manda o funil de leads"

Mensagens sem a palavra-gatilho são ignoradas.

**Funcionalidades v1 (somente leitura)**:
- **Agenda** (hoje/amanhã/semana) — entregas e retiradas confirmadas, com endereço,
  cliente, horário e link de rota.
- **Financeiro** (hoje/semana/mês) — faturamento confirmado e status dos sinais PIX
  (pendentes/confirmados).
- **Funil de leads** — contagem de leads por etapa do Kanban.

"Atualizar agendamentos" (criar/editar/cancelar) fica para uma v2 — por enquanto
essas alterações continuam sendo feitas manualmente no CRM.

A conversa é **stateless**: cada menção é tratada como uma pergunta independente,
sem histórico — as tools sempre buscam dados frescos do CRM.

**Proteção contra loop**: a Evolution API reemite como `fromMe: true` qualquer
mensagem enviada pelo próprio número conectado, inclusive as respostas deste agente
no grupo. Mensagens de grupo com `fromMe: true` são sempre ignoradas pelo backend.

Nome de exibição e palavra-gatilho são configuráveis via `AGENTE_ADMIN_NOME` e
`AGENTE_ADMIN_TRIGGER` no `.env` (ver [`.env.example`](.env.example)). O prompt
de sistema é versionado em [`prompts/admin-prompt-v1.md`](prompts/admin-prompt-v1.md) (RNF03.1).

## 9. Próximos passos sugeridos

1. Preencher as credenciais reais e rodar `npm run dev` + ngrok para o primeiro teste ponta a ponta.
2. Validar a [`SUPABASE_PATCH_03.sql`](../SUPABASE_PATCH_03.sql) num ambiente de teste antes de aplicar em produção.
3. Adicionar testes automatizados para qualificação, regra de PIX e agendamento (RNF03.4).
4. Avaliar a necessidade de fila (Redis/BullMQ) conforme o volume real de mensagens (RNF02.4).
5. Configurar Sentry para captura de erros em produção (RNF02.5/RNF03).
6. Definir política de retenção/criptografia de dados pessoais conforme LGPD (RNF01.6).
