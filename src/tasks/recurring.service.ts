import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Like, MoreThan, Repository } from 'typeorm';
import { Client } from '../clients/client.entity';
import { Executive } from '../executives/executive.entity';
import { TIMEZONE, addDays, addMonths, maxDate, today } from './dates';
import { PlanTask } from './plan-task.entity';
import { RecurringOccurrence } from './recurring-occurrence.entity';
import { HORIZON_DAYS, occurrences } from './schedule';
import { Task } from './task.entity';
import { TasksService } from './tasks.service';

// Dónde se generan las tareas: la carpeta de un cliente o una General.
interface Target {
  // Clave de la carpeta en recurring_occurrences y en Task.recurrenceKey.
  key: string;
  clientId: string | null;
  executiveId: string | null;
  // Inicio del ciclo. null = no se genera nada (pero `resetFuture` igual
  // borra lo que ya se había generado a futuro).
  startDate: string | null;
  templates: PlanTask[];
}

function generalKey(executiveId: string | null): string {
  return `general:${executiveId ?? 'agencia'}`;
}

// Genera las tareas automáticas (PlanTask) en el tablero:
// - En cada cliente, siguiendo su ciclo de cobro: arranca en contactDay y se
//   renueva todos los meses ese día. Igual que en Cobros, solo para clientes
//   activos, con día de inicio y sin baja; y solo si tienen plan en el cobro.
// - En cada General, siguiendo el mes calendario (del 1 al 1).
// Se generan con HORIZON_DAYS de anticipación (quedan en "Próximas" hasta su
// fecha) al arrancar la API, todos los días a las 00:05 y cuando cambia algo
// que las afecta (plan, día de inicio, baja, traspaso o las tareas configuradas).
@Injectable()
export class RecurringService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecurringService.name);

  constructor(
    @InjectRepository(Task) private tasksRepo: Repository<Task>,
    @InjectRepository(PlanTask) private planTasksRepo: Repository<PlanTask>,
    @InjectRepository(RecurringOccurrence) private occurrencesRepo: Repository<RecurringOccurrence>,
    @InjectRepository(Client) private clientsRepo: Repository<Client>,
    @InjectRepository(Executive) private executivesRepo: Repository<Executive>,
    private tasks: TasksService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // Que falle la generación no tiene que impedir que levante la API.
    await this.syncAll().catch((err) => this.logger.error('No se pudieron generar las tareas automáticas', err));
  }

  // Con `resetFuture` (cuando cambian las tareas de la agencia) primero borra
  // las generadas que todavía no llegaron a su fecha, para recalcularlas.
  @Cron('5 0 * * *', { timeZone: TIMEZONE })
  async syncAll({ resetFuture = false } = {}): Promise<void> {
    const planTasks = await this.planTasksRepo.find();
    const [clients, executives] = await Promise.all([
      this.clientsRepo.find({ relations: ['cobro'] }),
      this.executivesRepo.find({ select: { id: true } }),
    ]);
    let created = await this.sync(this.generalTarget(null, planTasks), resetFuture);
    for (const executive of executives) {
      created += await this.sync(this.generalTarget(executive.id, planTasks), resetFuture);
    }
    for (const client of clients) {
      created += await this.sync(this.clientTarget(client, planTasks), resetFuture);
    }
    if (created) this.logger.log(`Se generaron ${created} tareas automáticas`);
  }

  // Después de cambiar algo de uno o más clientes (plan, día de inicio, baja,
  // traspaso): recalcula lo que todavía no llegó a su fecha.
  async syncClients(clientIds: string[], { resetFuture = true } = {}): Promise<void> {
    if (!clientIds.length) return;
    const planTasks = await this.planTasksRepo.find();
    const clients = await this.clientsRepo.find({ where: { id: In(clientIds) }, relations: ['cobro'] });
    for (const client of clients) {
      await this.sync(this.clientTarget(client, planTasks), resetFuture);
    }
  }

  // Después de que un ejecutivo cambia sus tareas automáticas: su General y
  // su cartera.
  async syncExecutive(executiveId: string, { resetFuture = true } = {}): Promise<void> {
    const planTasks = await this.planTasksRepo.find();
    await this.sync(this.generalTarget(executiveId, planTasks), resetFuture);
    const clients = await this.clientsRepo.find({ where: { executiveId }, relations: ['cobro'] });
    for (const client of clients) {
      await this.sync(this.clientTarget(client, planTasks), resetFuture);
    }
  }

  private clientTarget(client: Client, planTasks: PlanTask[]): Target {
    const planId = client.cobro?.planId ?? null;
    const eligible = client.active && !!client.contactDay && !client.deletedAt && planId !== null;
    return {
      key: client.id,
      clientId: client.id,
      executiveId: null,
      startDate: eligible ? client.contactDay : null,
      templates: eligible
        ? planTasks.filter(
            (t) =>
              !t.general &&
              (t.executiveId === null || t.executiveId === client.executiveId) &&
              (t.planId === null || t.planId === planId),
          )
        : [],
    };
  }

  // General no tiene fecha de inicio: sus ciclos mensuales son los del
  // calendario. Arranca el mes anterior para no perder el vencimiento (el 1
  // del mes que viene) del ciclo en curso.
  private generalTarget(executiveId: string | null, planTasks: PlanTask[]): Target {
    return {
      key: generalKey(executiveId),
      clientId: null,
      executiveId,
      startDate: addMonths(`${today().slice(0, 7)}-01`, -1),
      templates: planTasks.filter((t) => t.general && t.executiveId === executiveId),
    };
  }

  // Crea las ocurrencias que vencen entre hoy y HORIZON_DAYS y todavía no se
  // generaron nunca (aunque después se hayan borrado del tablero).
  private async sync(target: Target, resetFuture: boolean): Promise<number> {
    const now = today();

    if (resetFuture) {
      await this.tasksRepo.delete({ recurrenceKey: Like(`${target.key}/%`), dueDate: MoreThan(now) });
      await this.occurrencesRepo.delete({ target: target.key, dueDate: MoreThan(now) });
    }
    if (!target.startDate || !target.templates.length) return 0;

    const pending = occurrences(
      target.templates,
      target.startDate,
      maxDate(target.startDate, now),
      addDays(now, HORIZON_DAYS),
    );
    if (!pending.length) return 0;

    const done = new Set((await this.occurrencesRepo.findBy({ target: target.key })).map((o) => o.key));
    let created = 0;
    for (const occurrence of pending) {
      if (done.has(occurrence.key)) continue;
      await this.tasksRepo.insert({
        id: randomUUID(),
        clientId: target.clientId,
        executiveId: target.executiveId,
        column: 'yellow',
        position: await this.tasks.topPosition('yellow'),
        title: occurrence.title,
        notes: '',
        priority: 'yellow',
        dueDate: occurrence.dueDate,
        recurrenceKey: `${target.key}/${occurrence.key}`,
      });
      await this.occurrencesRepo.insert({ target: target.key, key: occurrence.key, dueDate: occurrence.dueDate });
      created++;
    }
    return created;
  }
}
