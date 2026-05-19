jest.mock('fs', () => ({
  readFileSync: jest.fn(() =>
    JSON.stringify({
      businessHours: {
        timezone: 'America/Sao_Paulo',
        schedule: {
          mon: { open: '09:00', close: '18:00' },
          tue: { open: '09:00', close: '18:00' },
          wed: { open: '09:00', close: '18:00' },
          thu: { open: '09:00', close: '18:00' },
          fri: { open: '09:00', close: '18:00' },
          sat: null,
          sun: null,
        },
        closedMessage: 'Estamos fechados!',
      },
    })
  ),
}));

const { isOpen, getClosedMessage } = require('../src/businessHours');

test('getClosedMessage retorna a mensagem configurada', () => {
  expect(getClosedMessage()).toBe('Estamos fechados!');
});

test('isOpen retorna boolean', () => {
  expect(typeof isOpen()).toBe('boolean');
});

test('getClosedMessage é uma string não vazia', () => {
  const msg = getClosedMessage();
  expect(typeof msg).toBe('string');
  expect(msg.length).toBeGreaterThan(0);
});
