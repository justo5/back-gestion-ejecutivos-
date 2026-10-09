import { addDays, addMonths, maxDate, minDate } from './dates';

// Hasta cuántos días hacia adelante se generan las tareas automáticas.
export const HORIZON_DAYS = 45;

// Las diarias, solo una semana hacia adelante (si no, llenan "Próximas").
export const DAILY_HORIZON_DAYS = 7;

// En el título de una tarea automática se reemplaza por el nombre del mes.
export const MONTH_PLACEHOLDER = '{mes}';

export const REPEATS = ['monthly', 'weekly', 'daily'] as const;
export type Repeat = (typeof REPEATS)[number];

// Valor de `day` (en las mensuales) que significa "el vencimiento del ciclo":
// el día en que termina y arranca el siguiente.
export const LAST_DAY = 31;

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

// Lo mínimo de una tarea automática que hace falta para calcular sus fechas.
export interface ScheduledTask {
  // Forma parte de la clave de cada ocurrencia: si cambia, se considera otra tarea.
  id: string;
  title: string;
  repeat: Repeat;
  // Mensual: día del ciclo en que vence (1 = el día que arranca; LAST_DAY = el
  // vencimiento; si el ciclo es más corto que el día elegido, el día anterior
  // al vencimiento). Semanal: día de la semana (1 = lunes, 7 = domingo).
  // Diaria: no se usa.
  day: number;
}

export interface Occurrence {
  // Identifica la ocurrencia dentro de su carpeta: tarea y mes en que arranca
  // el ciclo (`<id>@2026-09`); en las semanales y diarias, tarea y fecha
  // (`<id>@2026-10-07`).
  key: string;
  title: string;
  dueDate: string;
}

// Ocurrencias de `templates` para un ciclo que arrancó el `startDate` y cuya
// fecha cae entre `from` y `to` (inclusive); las diarias, solo hasta
// DAILY_HORIZON_DAYS después de `from`. Los ciclos son mensuales: si arrancó
// el 10/9, van del 10/9 al 10/10, del 10/10 al 10/11, etc. `{mes}` es el mes
// en que arranca el ciclo (en las semanales y diarias, el mes de la fecha).
export function occurrences(
  templates: ScheduledTask[],
  startDate: string,
  from: string,
  to: string,
): Occurrence[] {
  const monthly = templates.filter((t) => t.repeat === 'monthly');
  const result = everyDay(
    templates.filter((t) => t.repeat !== 'monthly'),
    maxDate(startDate, from),
    to,
  );
  if (!monthly.length) return sortOccurrences(result);

  for (let cycle = 0; ; cycle++) {
    const start = addMonths(startDate, cycle);
    if (start > to) break;
    const end = addMonths(startDate, cycle + 1);
    if (end < from) continue;

    const month = MONTHS[Number(start.slice(5, 7)) - 1];
    for (const template of monthly) {
      const dueDate =
        template.day >= LAST_DAY ? end : minDate(addDays(start, template.day - 1), addDays(end, -1));
      if (dueDate >= from && dueDate <= to) {
        result.push({
          key: `${template.id}@${start.slice(0, 7)}`,
          title: template.title.replaceAll(MONTH_PLACEHOLDER, month),
          dueDate,
        });
      }
    }
  }

  return sortOccurrences(result);
}

// Las semanales y diarias, día por día entre `from` y `to`.
function everyDay(templates: ScheduledTask[], from: string, to: string): Occurrence[] {
  const result: Occurrence[] = [];
  if (!templates.length) return result;
  const dailyTo = minDate(to, addDays(from, DAILY_HORIZON_DAYS));
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const month = MONTHS[Number(date.slice(5, 7)) - 1];
    for (const template of templates) {
      const due = template.repeat === 'daily' ? date <= dailyTo : weekday(date) === template.day;
      if (due) {
        result.push({
          key: `${template.id}@${date}`,
          title: template.title.replaceAll(MONTH_PLACEHOLDER, month),
          dueDate: date,
        });
      }
    }
  }
  return result;
}

// 1 = lunes, 7 = domingo.
function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
}

function sortOccurrences(result: Occurrence[]): Occurrence[] {
  return result.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.key.localeCompare(b.key));
}
