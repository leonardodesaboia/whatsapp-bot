# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All bot commands run from the `bot/` directory:

```bash
# Instalar dependências
npm install

# Rodar todos os testes
npm test

# Rodar um único arquivo de teste
npx jest tests/redis.test.js --no-coverage

# Rodar um teste específico pelo nome
npx jest --testNamePattern="getHistory retorna array vazio" --no-coverage

# Iniciar o servidor localmente
npm start
```

Docker (rodar da raiz do projeto):

```bash
docker compose up -d          # subir todos os serviços
docker compose logs -f bot    # acompanhar logs do bot
docker compose restart bot    # reiniciar após mudanças em company.json
```

## Arquitetura

O bot recebe mensagens via webhook HTTP e responde usando a OpenAI API. Fluxo completo:

```
WhatsApp → Evolution API → POST /webhook → webhook.js → openai.js + redis.js → evolutionApi.js → WhatsApp
```

**`src/webhook.js`** é o orquestrador central. Ao receber uma requisição:
1. Valida o header `x-api-key` contra `WEBHOOK_TOKEN`
2. Filtra: apenas evento `messages.upsert`, apenas chats privados (`@s.whatsapp.net`), ignora `fromMe`
3. Responde 200 imediatamente (para não dar timeout na Evolution API)
4. Processa de forma assíncrona num IIFE: `getHistory → chat → appendHistory → sendText`

**`src/openai.js`** carrega `company.json` uma única vez no momento do `require()` (não a cada chamada). O system prompt é gerado com `buildSystemPrompt()` e inclui nome, descrição, horário, contato e FAQ da empresa. O modelo padrão é `gpt-4o-mini`, configurável via `OPENAI_MODEL`.

**`src/redis.js`** usa uma conexão singleton. Histórico armazenado em `history:{phone}` como JSON array de `{role, content}`. TTL de 24h (86400s) renovado a cada mensagem. Truncado a `MAX_HISTORY` pares (default 10), mantendo os mais recentes.

**`src/evolutionApi.js`** lê todas as variáveis de ambiente (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`, `WEBHOOK_TOKEN`) no momento do `require()`. O webhook é registrado automaticamente na startup do servidor em `src/index.js` — falha silenciosa (warn, não crash).

## Personalização da empresa

Editar apenas `company.json` na raiz. Campos: `nome`, `descricao`, `horario`, `contato`, `faq[]`. Após editar: `docker compose restart bot` (sem rebuild da imagem).

## Variáveis de ambiente obrigatórias

Ver `.env.example`. As críticas para o bot funcionar:
- `EVOLUTION_API_KEY` — chave de acesso à Evolution API
- `EVOLUTION_INSTANCE` — nome da instância WhatsApp criada na Evolution API
- `OPENAI_API_KEY` — chave da OpenAI
- `WEBHOOK_TOKEN` — segredo compartilhado entre Evolution API e bot (header `x-api-key`)

## Testes

Cada módulo (`redis`, `openai`, `evolutionApi`, `webhook`) tem seu arquivo de teste em `bot/tests/`. Todos os módulos externos são mockados via `jest.mock()`. O webhook usa `supertest` para testar o Express end-to-end.

Padrão importante: variáveis de ambiente nos testes devem ser configuradas **antes** do `require()` do módulo, pois `evolutionApi.js` e `openai.js` leem `process.env` no momento do require.
