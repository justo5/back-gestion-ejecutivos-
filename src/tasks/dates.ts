// Las fechas del tablero de tareas se manejan como texto 'YYYY-MM-DD' (sin
// hora), en la zona horaria de la agencia: "hoy" tiene que ser el mismo día
// para el cron de las 00:05 y para quien mira el tablero.
export const TIMEZONE = process.env.APP_TIMEZONE ?? 'America/Argentina/Buenos_Aires';

export function today(timeZone = TIMEZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Mismo día `months` meses después; si ese mes es más corto, su último día
// (31/1 + 1 mes = 28/2).
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const total = year * 12 + month - 1 + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return isoDate(y, m, Math.min(day, daysInMonth(y, m)));
}

// `month` va de 1 a 12.
export function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// `month` va de 1 a 12.
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function maxDate(a: string, b: string): string {
  return a > b ? a : b;
}

export function minDate(a: string, b: string): string {
  return a < b ? a : b;
}
