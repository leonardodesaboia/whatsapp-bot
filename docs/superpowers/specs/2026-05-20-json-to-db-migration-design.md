# Design: Migração JSON → Banco de Dados

**Data:** 2026-05-20  
**Status:** Aprovado  
**Branch:** advanced

## Contexto

O bot atualmente lê configurações de três arquivos JSON (`company.json`, `catalog.json`, `contacts.json`) de forma síncrona no `require()`. Com o banco PostgreSQL já em uso pelo CRM e pelo módulo `crm.js` do bot, a fonte de verdade deve ser unificada no banco — eliminando a necessidade de restart para atualizar configurações e habilitando gerenciamento completo pelo dashboard.

## Decisões

- **Leitura no bot:** query direta ao banco a cada request (sem cache), garantindo dados sempre atuais com latência negligível (~1–5ms local)
- **business_hours NULL = 24h aberto:** toggle no CRM; quando ativo, zera o campo para NULL e o bot não aplica restrição de horário
- **FAQ como JSONB:** array de `{ pergunta, resposta }` em coluna JSONB — evita joins, mantém leitura em query única
- **JSONs removidos** do projeto após migração (sem seed automático — dados cadastrados pelo CRM)
- **Contatos:** tabela própria + importação de leads do funil via modal no CRM

## Schema — Novas Tabelas

Adicionadas ao `crm/db/migrate.js`:

```sql
CREATE TABLE IF NOT EXISTS company_settings (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL DEFAULT '',
  descricao TEXT DEFAULT '',
  horario VARCHAR(255) DEFAULT '',
  contato VARCHAR(255) DEFAULT '',
  faq JSONB NOT NULL DEFAULT '[]',
  timezone VARCHAR(100) NOT NULL DEFAULT 'America/Sao_Paulo',
  business_hours JSONB DEFAULT NULL,  -- NULL = atendimento 24h
  closed_message TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS catalog_categories (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS catalog_items (
  id SERIAL PRIMARY KEY,
  category_id INTEGER REFERENCES catalog_categories(id) ON DELETE CASCADE,
  slug VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT DEFAULT '',
  price DECIMAL(10,2) NOT NULL,
  duration INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(category_id, slug)
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  phone VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Bot — Módulo config.js

Novo arquivo `bot/src/config.js` centraliza todas as queries de configuração:

- `getCompanySettings()` → `{ nome, descricao, horario, contato, faq, timezone, business_hours, closed_message }`
- `getCatalogCategories()` → `[{ id, slug, title, items: [...] }]` (join com items)
- `getContacts()` → `[{ phone, name }]`

Usa o mesmo singleton `getPool()` já presente em `bot/src/crm.js`.

## Bot — Módulos Alterados

| Módulo | Mudança |
|--------|---------|
| `openai.js` | Remove `fs.readFileSync` no require; `buildSystemPrompt()` vira async, chama `getCompanySettings()` |
| `businessHours.js` | Remove `fs.readFileSync` no require; `isOpen()` e `getClosedMessage()` viram async, chamam `getCompanySettings()` |
| `catalog.js` | Remove `fs.readFileSync` no require; handlers chamam `getCatalogCategories()` |
| `broadcast.js` | `loadContacts()` vira async, chama `getContacts()` |
| `webhook.js` | Ajusta chamadas para aguardar async onde necessário |

Arquivos removidos: `company.json`, `catalog.json`, `contacts.json`.

## CRM — Novas Rotas de API

```
GET  /api/settings/company
PATCH /api/settings/company

GET    /api/catalog/categories
POST   /api/catalog/categories
PATCH  /api/catalog/categories/[id]
DELETE /api/catalog/categories/[id]

GET    /api/catalog/items?category_id=[id]   -- filtra itens por categoria
POST   /api/catalog/items
PATCH  /api/catalog/items/[id]
DELETE /api/catalog/items/[id]

GET    /api/contacts
POST   /api/contacts
DELETE /api/contacts/[id]
POST   /api/contacts/import  -- importa leads selecionados do funil
```

Todas seguem o padrão existente: `getServerSession` para auth, `getPool()` para banco.

## CRM — Dashboard `/settings`

A página de configurações existente é expandida com 4 novas seções além das etapas do funil:

1. **Empresa** — formulário: nome, descrição, horário (texto), contato
2. **Horário de Funcionamento** — toggle "24h"; quando off: seletor abertura/fechamento por dia, timezone, mensagem de fechado
3. **FAQ** — lista de pares Q&A com adicionar/editar/remover inline
4. **Catálogo** — duas colunas: categorias (esquerda, drag-and-drop) + itens da categoria selecionada (direita, CRUD + drag-and-drop)
5. **Contatos (Broadcast)** — tabela phone+nome, adicionar avulso, botão "Importar do funil" com modal de seleção por etapa/tag

## Testes

- Atualizar `bot/tests/openai.test.js`, `businessHours.test.js`, `catalog.test.js`, `broadcast.test.js` para mockar `config.js` em vez de `fs`
- Novos testes de integração para as rotas de API do CRM (seguindo padrão existente)

## Arquivos Não Alterados

`scheduling.js`, `payment.js`, `audio.js`, `image.js`, `notify.js`, `state.js`, `redis.js`, `evolutionApi.js` — nenhuma dependência de JSON.
