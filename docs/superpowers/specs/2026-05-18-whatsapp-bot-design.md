# WhatsApp Bot — Tirar Dúvidas sobre a Empresa

**Data:** 2026-05-18  
**Stack:** Node.js · Evolution API · OpenAI GPT · Redis · Docker Compose

---

## Objetivo

Template de bot para WhatsApp que responde dúvidas sobre uma empresa. O conteúdo da empresa é configurado via `company.json`, sem necessidade de alterar código. Implantado em uma VM via Docker Compose.

---

## Arquitetura

4 containers orquestrados pelo Docker Compose:

| Container      | Função                                                    |
|----------------|-----------------------------------------------------------|
| evolution-api  | Gerencia sessão WhatsApp; recebe e envia mensagens        |
| postgres       | Banco de dados interno da Evolution API                   |
| redis          | Armazena histórico de conversa por número de telefone     |
| bot            | Serviço Node.js com a lógica do bot                       |

```
┌──────────────────────────────────────────────────────┐
│                   Docker Compose                      │
│                                                       │
│  ┌──────────────┐    webhook     ┌───────────────┐   │
│  │ Evolution API│ ─────────────► │   Bot (Node)  │   │
│  │   :8080      │ ◄───────────── │   :3000       │   │
│  └──────────────┘   REST reply   └───────┬───────┘   │
│         │                               │  │         │
│  ┌──────┴───────┐          ┌────────────┘  │ OpenAI  │
│  │  PostgreSQL  │          │  Redis :6379  │         │
│  └──────────────┘          └───────────────┘         │
└──────────────────────────────────────────────────────┘
```

---

## Fluxo de Dados

1. Usuário envia mensagem no WhatsApp
2. Evolution API recebe e faz `POST /webhook` no bot (com `x-api-key` no header)
3. Bot extrai `phoneNumber` e `messageText` do payload
4. Bot busca histórico no Redis (chave: `history:{phoneNumber}`, TTL: 24h)
5. Bot monta prompt para OpenAI:
   - **System**: conteúdo do `company.json` + instrução para responder apenas sobre a empresa
   - **Messages**: histórico (últimas 10 trocas) + mensagem atual do usuário
6. OpenAI retorna resposta → bot salva no Redis e envia via Evolution API REST

---

## Regras de Negócio

- Responder apenas em chats privados (ignorar grupos)
- Ignorar mensagens enviadas pelo próprio número (evitar loop)
- Histórico limitado a 10 trocas por sessão (controle de tokens)
- Webhook autenticado via `WEBHOOK_TOKEN` no header `x-api-key`
- TTL do histórico: 24 horas (sessão expira após inatividade de 1 dia)

---

## Estrutura de Arquivos

```
whatsapp-bot/
├── docker-compose.yml
├── .env.example
├── .env                     # não comitar
├── company.json             # conteúdo da empresa (editável)
└── bot/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── index.js         # servidor Express + inicialização
        ├── webhook.js       # handler de mensagens recebidas
        ├── openai.js        # integração OpenAI (prompt + histórico)
        └── redis.js         # get/set histórico por número
```

---

## Configuração da Empresa (`company.json`)

```json
{
  "nome": "Empresa XYZ",
  "descricao": "Somos uma empresa de...",
  "horario": "Seg-Sex das 9h às 18h",
  "contato": "contato@empresa.com | (11) 99999-9999",
  "faq": [
    { "pergunta": "Qual o prazo de entrega?", "resposta": "3 a 5 dias úteis." },
    { "pergunta": "Aceitam cartão?", "resposta": "Sim, todos os cartões." }
  ]
}
```

---

## Variáveis de Ambiente

| Variável              | Descrição                              |
|-----------------------|----------------------------------------|
| EVOLUTION_API_URL     | URL interna da Evolution API           |
| EVOLUTION_API_KEY     | Chave de autenticação da Evolution API |
| EVOLUTION_INSTANCE    | Nome da instância WhatsApp             |
| OPENAI_API_KEY        | Chave da API OpenAI                    |
| OPENAI_MODEL          | Modelo GPT (ex: gpt-4o-mini)          |
| WEBHOOK_TOKEN         | Token secreto para autenticar webhook  |
| REDIS_URL             | URL de conexão com Redis               |
| MAX_HISTORY           | Máximo de trocas no histórico (padrão: 10) |

---

## Decisões de Design

- **Evolution API** em vez de Baileys direto: mais estável, suporte multi-instância, protocolo abstraído
- **Redis para histórico** em vez de in-memory: persiste entre restarts do bot
- **`company.json`** em vez de env vars: permite texto longo e estruturado, editável por não-desenvolvedores
- **Webhook** em vez de polling: mais eficiente, sem loop de requisições
- **Histórico limitado a 10 trocas**: equilíbrio entre contexto útil e custo de tokens
