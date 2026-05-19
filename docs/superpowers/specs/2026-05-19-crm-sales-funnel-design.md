# CRM / Funil de Vendas — Design

**Data:** 2026-05-19
**Status:** Aprovado

---

## Objetivo

Adicionar um CRM com funil de vendas integrado ao bot de WhatsApp existente. Leads são criados automaticamente quando uma nova conversa chega no bot. Um dashboard Next.js permite visualizar, editar e mover leads pelo funil.

---

## Arquitetura

```
WhatsApp → Evolution API → bot (Node.js existente)
                                │
                                ├── Redis (estado de conversa — sem mudanças)
                                └── PostgreSQL (leads, interações, etapas)
                                        │
                                    crm/ (Next.js — novo serviço)
                                        │
                                    Browser (dashboard)
```

### Novos serviços no docker-compose

| Serviço    | Imagem              | Porta |
|------------|---------------------|-------|
| `postgres` | postgres:16-alpine  | 5432  |
| `crm`      | node:20-alpine (build local) | 3001 |

### Comunicação bot → PostgreSQL

O bot ganha um módulo `bot/src/crm.js` que escreve no PostgreSQL via `pg`. A integração é **write-only**: o bot nunca lê do CRM e não toma decisões com base em etapa. O CRM é totalmente independente do pipeline de conversas.

---

## Modelo de Dados

### Tabela `stages` (etapas configuráveis)

```sql
id       SERIAL PRIMARY KEY
name     VARCHAR(100) NOT NULL
color    VARCHAR(7)              -- hex, ex: "#22c55e"
position INTEGER NOT NULL        -- ordem no kanban
```

### Tabela `leads`

```sql
id               SERIAL PRIMARY KEY
phone            VARCHAR(20) UNIQUE NOT NULL
name             VARCHAR(255)
stage_id         INTEGER REFERENCES stages(id)
assigned_to      VARCHAR(255)
products         TEXT[]           -- array de produtos/serviços de interesse
estimated_value  DECIMAL(10,2)
tags             TEXT[]
follow_up_at     TIMESTAMPTZ
notes            TEXT
last_message     TEXT
last_seen_at     TIMESTAMPTZ
created_at       TIMESTAMPTZ DEFAULT NOW()
updated_at       TIMESTAMPTZ DEFAULT NOW()
```

### Tabela `interactions`

```sql
id         SERIAL PRIMARY KEY
lead_id    INTEGER REFERENCES leads(id) ON DELETE CASCADE
direction  VARCHAR(3) NOT NULL   -- 'in' | 'out'
content    TEXT NOT NULL
type       VARCHAR(10) NOT NULL  -- 'text' | 'audio' | 'image'
created_at TIMESTAMPTZ DEFAULT NOW()
```

### Tabela `users` (autenticação do dashboard)

```sql
id             SERIAL PRIMARY KEY
email          VARCHAR(255) UNIQUE NOT NULL
password_hash  VARCHAR(255) NOT NULL
name           VARCHAR(255)
created_at     TIMESTAMPTZ DEFAULT NOW()
```

---

## Módulo `bot/src/crm.js`

Funções exportadas:

```javascript
upsertLead(phone, name, lastMessage, type)
// Cria lead na primeira etapa se não existir.
// Se já existir, atualiza last_message e last_seen_at.

addInteraction(phone, content, direction, type)
// Registra mensagem no histórico do lead.
// Ignora silenciosamente se lead não existir.
```

**Pontos de integração em `webhook.js`:**
- Mensagem recebida (`direction: 'in'`): chama `upsertLead` + `addInteraction`
- Resposta enviada (`direction: 'out'`): chama `addInteraction`

Erros de escrita no CRM são capturados e logados sem interromper o pipeline de resposta do bot.

---

## Dashboard Next.js (`crm/`)

### Stack

- Next.js 14 (App Router)
- NextAuth.js (provider Credentials, sessão JWT)
- Tailwind CSS
- `@hello-pangea/dnd` para drag-and-drop no kanban
- `pg` para queries diretas ao PostgreSQL nas API Routes

### Telas

**`/login`**
Formulário email + senha. NextAuth com provider Credentials. Sem cadastro público — usuários criados via seed.

**`/` (Kanban)**
Tela principal. Colunas = etapas do funil. Cards exibem: nome, telefone, último contato, tags e valor estimado. Drag-and-drop move o lead de etapa. Barra de filtros por responsável, tag, produto e intervalo de follow-up.

**`/leads/[id]`**
Todos os campos do lead editáveis via formulário (nome, responsável, produtos, valor, tags, follow-up, notas). Abaixo: timeline de interações (mensagem, direção, tipo, timestamp).

**`/settings`**
CRUD de etapas: criar, renomear, reordenar (drag), escolher cor e deletar. Ao deletar etapa com leads, esses leads são movidos para a primeira etapa.

### API Routes

| Método | Path | Descrição |
|--------|------|-----------|
| GET | `/api/leads` | Lista leads com filtros opcionais |
| GET | `/api/leads/[id]` | Detalhes + interações de um lead |
| PATCH | `/api/leads/[id]` | Atualiza campos do lead |
| PATCH | `/api/leads/[id]/stage` | Move lead de etapa |
| GET | `/api/stages` | Lista etapas ordenadas |
| POST | `/api/stages` | Cria nova etapa |
| PATCH | `/api/stages/[id]` | Atualiza nome/cor/posição |
| DELETE | `/api/stages/[id]` | Deleta etapa |

Todas as rotas exigem sessão NextAuth válida (middleware).

---

## Migrations e Seed

**`crm/db/migrate.js`** — executa SQL de criação das tabelas no startup do container `crm`.

**`crm/db/seed.js`** — cria etapas padrão (`Lead`, `Qualificado`, `Proposta`, `Fechado`, `Perdido`) e um usuário admin com senha configurável via env.

---

## Variáveis de Ambiente

### Bot (adicionadas ao `.env.example`)

```bash
DATABASE_URL=postgresql://crm:secret@postgres:5432/crm
```

### CRM (arquivo `.env.local` ou env no docker-compose)

```bash
DATABASE_URL=postgresql://crm:secret@postgres:5432/crm
NEXTAUTH_SECRET=sua-chave-secreta-aqui
NEXTAUTH_URL=http://localhost:3001
ADMIN_EMAIL=admin@empresa.com
ADMIN_PASSWORD=senha-inicial
```

---

## docker-compose.yml — mudanças

Adicionar serviços `postgres` e `crm`. O serviço `bot` recebe `DATABASE_URL` e depende de `postgres`.

```yaml
postgres:
  image: postgres:16-alpine
  environment:
    POSTGRES_DB: crm
    POSTGRES_USER: crm
    POSTGRES_PASSWORD: secret
  volumes:
    - postgres_data:/var/lib/postgresql/data

crm:
  build: ./crm
  ports:
    - "3001:3001"
  environment:
    DATABASE_URL: postgresql://crm:secret@postgres:5432/crm
    NEXTAUTH_SECRET: ${NEXTAUTH_SECRET}
    NEXTAUTH_URL: http://localhost:3001
    ADMIN_EMAIL: ${ADMIN_EMAIL}
    ADMIN_PASSWORD: ${ADMIN_PASSWORD}
  depends_on:
    - postgres
```

---

## Testes

- `crm.js` do bot: testes Jest mockando `pg`
- API Routes do Next.js: testes de integração com `jest` + banco de dados de teste isolado
- Componentes React: testes com `@testing-library/react`

---

## Fora do escopo

- Notificações automáticas de follow-up (pode ser adicionado depois com um cron no CRM)
- Relatórios/métricas avançadas (gráficos de conversão, tempo médio por etapa)
- Multi-tenant (um usuário por instância é suficiente por agora)
- Importação/exportação de leads (CSV etc.)
