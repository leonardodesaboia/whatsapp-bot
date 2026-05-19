const fs = require('fs');
const path = require('path');

const company = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../company.json'), 'utf8')
);

const DAY_MAP = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function isOpen() {
  const { timezone, schedule } = company.businessHours;
  const localDate = new Date(new Date().toLocaleString('en-US', { timeZone: timezone }));
  const dayKey = DAY_MAP[localDate.getDay()];
  const daySchedule = schedule[dayKey];
  if (!daySchedule) return false;
  const h = localDate.getHours().toString().padStart(2, '0');
  const m = localDate.getMinutes().toString().padStart(2, '0');
  const current = `${h}:${m}`;
  return current >= daySchedule.open && current < daySchedule.close;
}

function getClosedMessage() {
  return company.businessHours.closedMessage;
}

module.exports = { isOpen, getClosedMessage };
