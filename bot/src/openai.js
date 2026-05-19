const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const company = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../company.json'), 'utf8')
);

function buildSystemPrompt() {
  const faqText = company.faq
    .map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`)
    .join('\n\n');
  return `Você é um assistente virtual da ${company.nome}.
${company.descricao}
Horário de atendimento: ${company.horario}
Contato: ${company.contato}

Perguntas frequentes:
${faqText}

Responda apenas dúvidas relacionadas à ${company.nome}. Se a pergunta não for sobre a empresa, informe educadamente que somente pode ajudar com dúvidas sobre a ${company.nome}.

INSTRUÇÕES ESPECIAIS — responda APENAS com o token abaixo (sem texto adicional) quando detectar estas intenções:
- Cliente quer falar com humano/atendente → responda exatamente: __TRANSFER__
- Cliente quer ver produtos, serviços, cardápio ou catálogo → responda exatamente: __CATALOG__
- Cliente quer agendar, marcar horário ou fazer reserva → responda exatamente: __SCHEDULE__
- Cliente quer pagar, gerar Pix ou fazer pagamento (menciona valor) → responda exatamente: __PAYMENT__:{valor_numerico}:{descricao}
  Exemplo: cliente diz "quero pagar R$ 50 pelo corte" → __PAYMENT__:50.00:Corte de cabelo`;
}

async function chat(history, userMessage) {
  const messages = [
    { role: 'system', content: buildSystemPrompt() },
    ...history,
    { role: 'user', content: userMessage },
  ];
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages,
  });
  if (!response.choices?.length) {
    return 'Desculpe, não consegui processar sua mensagem no momento. Tente novamente.';
  }
  return response.choices[0].message.content;
}

module.exports = { chat, buildSystemPrompt };
