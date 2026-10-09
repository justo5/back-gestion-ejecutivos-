import { Client } from '../clients/client.entity';
import { Plan } from './plan.entity';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
}

// Mismo criterio que la página Cobros del front: el texto del cliente suele ser
// "<nombre del plan configurado> + sufijos" (precio, moneda, iva...), así que
// se matchea por prefijo y gana el nombre más largo ("Plan ejecución + Bot"
// antes que "Plan ejecución").
export function matchPlan(text: string | null | undefined, plans: Plan[]): Plan | null {
  const planText = normalize(text ?? '');
  if (!planText) return null;
  return (
    plans
      .filter((p) => planText.startsWith(normalize(p.name)))
      .sort((a, b) => b.name.length - a.name.length)[0] ?? null
  );
}

// El plan con el que se le cobra al cliente: el que matchea su texto, igual
// que en la página Cobros (que no mira el plan del cobro). El alta y la
// edición del cliente mantienen el cobro alineado con este plan.
export function clientPlan(client: Client, plans: Plan[]): Plan | null {
  return matchPlan(client.plan, plans);
}

export function clientPlanId(client: Client, plans: Plan[]): number | null {
  return clientPlan(client, plans)?.id ?? null;
}
