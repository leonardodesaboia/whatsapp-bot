const TAG_SANITIZE_REGEX = /[^a-z0-9-]/g;

function toValidDate(value: unknown) {
  if (!value) return null;

  const date =
    value instanceof Date ? value : new Date(typeof value === 'string' ? value : '');

  return Number.isNaN(date.getTime()) ? null : date;
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

export function normalizeTag(tag: string) {
  return tag
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(TAG_SANITIZE_REGEX, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => normalizeTag(tag.trim()))
        .filter(Boolean)
    )
  );
}

export function normalizeTagsInput(value: string) {
  return normalizeTags(value).join(', ');
}

export function toDateTimeLocalValue(value: unknown) {
  const date = toValidDate(value);
  if (!date) return '';

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function toIsoStringFromLocal(value: string | null) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function getDateInputValue(value: unknown) {
  const date = toValidDate(value);
  if (!date) return '';

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
}

export function getTimeInputValue(value: unknown) {
  const date = toValidDate(value);
  if (!date) return '';

  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function combineDateAndTime(dateValue: string, timeValue: string) {
  if (!dateValue) return null;

  const normalizedTime = timeValue || '00:00';
  const date = new Date(`${dateValue}T${normalizedTime}`);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatDateInputPtBr(value: unknown) {
  const date = toValidDate(value);
  if (!date) return '';

  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function normalizeDateInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function normalizeTimeInput(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 4);

  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

export function isValidPtBrDate(value: string) {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return false;

  const [, day, month, year] = match;
  const date = new Date(`${year}-${month}-${day}T00:00`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.getDate() === Number(day) &&
    date.getMonth() + 1 === Number(month) &&
    date.getFullYear() === Number(year)
  );
}

export function isValid24HourTime(value: string) {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

export function combinePtBrDateAndTime(dateValue: string, timeValue: string) {
  if (!dateValue) return null;
  if (!isValidPtBrDate(dateValue)) return null;

  const normalizedTime = timeValue ? normalizeTimeInput(timeValue) : '00:00';
  if (!isValid24HourTime(normalizedTime)) return null;

  const [day, month, year] = dateValue.split('/');
  const date = new Date(`${year}-${month}-${day}T${normalizedTime}`);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatDateTime24h(value: unknown) {
  const date = toValidDate(value);
  if (!date) return '';

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
