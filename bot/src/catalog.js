const fs = require('fs');
const path = require('path');

const catalog = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../../catalog.json'), 'utf8')
);

function getCategories() {
  return catalog.categories;
}

function getCategory(id) {
  return catalog.categories.find((c) => c.id === id) || null;
}

function getItem(categoryId, itemId) {
  const cat = getCategory(categoryId);
  return cat ? cat.items.find((i) => i.id === itemId) || null : null;
}

function buildCategoryListMessage() {
  return {
    title: 'O que você procura?',
    buttonText: 'Ver opções',
    sections: [
      {
        title: 'Categorias',
        rows: catalog.categories.map((c) => ({
          rowId: c.id,
          title: c.title,
          description: `${c.items.length} opção(ões) disponível(eis)`,
        })),
      },
    ],
  };
}

function buildItemListMessage(categoryId) {
  const category = getCategory(categoryId);
  if (!category) return null;
  return {
    title: category.title,
    buttonText: 'Selecionar',
    sections: [
      {
        title: category.title,
        rows: category.items.map((i) => ({
          rowId: `${categoryId}:${i.id}`,
          title: i.title,
          description: `R$ ${i.price.toFixed(2)}${i.duration ? ` • ${i.duration} min` : ''}`,
        })),
      },
    ],
  };
}

async function handleCatalogFlow(phone, state, text) {
  const { sendText, sendList } = require('./evolutionApi');
  const { setState, clearState } = require('./state');

  if (text?.toLowerCase() === 'cancelar') {
    await clearState(phone);
    await sendText(phone, 'Tudo bem! Como posso ajudar?');
    return;
  }

  if (state.step === 0) {
    await setState(phone, { flow: 'catalog', step: 1, data: {} });
    await sendList(phone, buildCategoryListMessage());
    return;
  }

  if (state.step === 1) {
    const category = getCategory(text);
    if (!category) {
      await sendText(phone, 'Categoria não encontrada. Escolha uma opção válida ou digite "cancelar".');
      return;
    }
    await setState(phone, { flow: 'catalog', step: 2, data: { categoryId: text } });
    await sendList(phone, buildItemListMessage(text));
    return;
  }

  if (state.step === 2) {
    const [categoryId, itemId] = (text || '').split(':');
    const item = getItem(categoryId, itemId);
    if (!item) {
      await sendText(phone, 'Item não encontrado. Escolha uma opção válida ou digite "cancelar".');
      return;
    }
    await setState(phone, { flow: 'catalog', step: 3, data: { categoryId, itemId, item } });
    await sendText(
      phone,
      `*${item.title}*\n${item.description}\nPreço: R$ ${item.price.toFixed(2)}${item.duration ? `\nDuração: ${item.duration} min` : ''}\n\nDigite:\n• "agendar" para marcar um horário\n• "pagar" para gerar Pix\n• "cancelar" para voltar`
    );
    return;
  }

  if (state.step === 3) {
    const { item } = state.data;
    if (text?.toLowerCase() === 'agendar') {
      const newState = { flow: 'scheduling', step: 0, data: { service: item.title, duration: item.duration, price: item.price } };
      await setState(phone, newState);
      const { handleSchedulingFlow } = require('./scheduling');
      await handleSchedulingFlow(phone, newState, text);
    } else if (text?.toLowerCase() === 'pagar') {
      const newState = { flow: 'payment', step: 0, data: { amount: item.price, description: item.title } };
      await setState(phone, newState);
      const { handlePaymentFlow } = require('./payment');
      await handlePaymentFlow(phone, newState, text);
    } else {
      await clearState(phone);
      await sendText(phone, 'Tudo bem! Como posso ajudar?');
    }
  }
}

module.exports = {
  getCategories,
  getCategory,
  getItem,
  buildCategoryListMessage,
  buildItemListMessage,
  handleCatalogFlow,
};
