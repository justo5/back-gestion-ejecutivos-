import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { FindOptionsWhere, In, IsNull, Not, Repository } from 'typeorm';
import { AuthUser } from '../auth/current-user.decorator';
import { Client } from '../clients/client.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { MoveTaskDto } from './dto/move-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { today } from './dates';
import { PlanTasksService } from './plan-tasks.service';
import { BoardColumn, Task, isPriority } from './task.entity';

// En la API, la carpeta de una tarea es 'general' o el id de un cliente: el
// front no necesita saber de quién es cada General, solo ve la suya.
export const GENERAL_ID = 'general';

// Cliente tal como lo necesita el tablero para listarlo como carpeta.
export interface TaskFolder {
  id: string;
  name: string;
  executiveName: string;
  planId: number | null;
  planName: string | null;
  // Inicio del ciclo de cobro (y de las tareas automáticas). null si el
  // cliente no está activo o no tiene día de inicio: igual que en Cobros, sin
  // eso no hay ciclo.
  cycleStart: string | null;
}

export type TaskView = Omit<Task, 'client' | 'clientId' | 'executive' | 'executiveId'> & {
  folderId: string;
};

// Nombre "público" del cliente, con la misma regla que clientDisplayName en el
// front: primero la fanpage (tipada o la columna cruda del import), si no el
// nombre.
function displayName(client: Client): string {
  if (client.fanpage?.trim()) return client.fanpage.trim();
  const entry = Object.entries(client.data ?? {}).find(([label]) => /fan\s*page/i.test(label));
  const fromData = entry ? String(entry[1] ?? '').trim() : '';
  return fromData || client.name;
}

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private tasksRepo: Repository<Task>,
    @InjectRepository(Client) private clientsRepo: Repository<Client>,
    private planTasks: PlanTasksService,
  ) {}

  // Todo lo que necesita el tablero en una sola llamada.
  async state(user: AuthUser) {
    const [clients, tasks, planTasks] = await Promise.all([
      this.clientsRepo.find({
        where: user.role === 'admin' ? { deletedAt: IsNull() } : { executiveId: this.ownExecutiveId(user), deletedAt: IsNull() },
        relations: ['executive', 'cobro', 'cobro.plan'],
      }),
      this.tasksRepo.find({ where: this.scope(user), order: { position: 'ASC', createdAt: 'DESC' } }),
      this.planTasks.findForUser(user),
    ]);

    const folders: TaskFolder[] = clients
      .map((c) => ({
        id: c.id,
        name: displayName(c),
        executiveName: c.executive?.name ?? '',
        planId: c.cobro?.planId ?? null,
        planName: c.cobro?.plan?.name ?? null,
        cycleStart: c.active ? c.contactDay : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    return { today: today(), folders, tasks: tasks.map((t) => this.toView(t)), planTasks };
  }

  // Crea la tarea arriba de todo en su columna (las automáticas las crea
  // RecurringService por su cuenta).
  async create(dto: CreateTaskDto, user: AuthUser): Promise<TaskView> {
    const owner = await this.resolveFolder(dto.folderId, user);
    if (await this.tasksRepo.existsBy({ id: dto.id })) {
      throw new BadRequestException('Ya existe una tarea con ese id');
    }
    const task = await this.tasksRepo.save(
      this.tasksRepo.create({
        id: dto.id,
        ...owner,
        column: dto.column,
        position: await this.topPosition(dto.column),
        title: dto.title.trim(),
        notes: dto.notes?.trim() ?? '',
        priority: isPriority(dto.column) ? dto.column : 'yellow',
        dueDate: dto.dueDate || null,
        recurrenceKey: null,
      }),
    );
    return this.toView(task);
  }

  async update(id: string, dto: UpdateTaskDto, user: AuthUser): Promise<TaskView> {
    const task = await this.findOwnedTask(id, user);
    if (dto.title !== undefined) task.title = dto.title.trim();
    if (dto.notes !== undefined) task.notes = dto.notes.trim();
    if (dto.dueDate !== undefined) task.dueDate = dto.dueDate || null;
    return this.toView(await this.tasksRepo.save(task));
  }

  async remove(id: string, user: AuthUser): Promise<void> {
    const task = await this.findOwnedTask(id, user);
    await this.tasksRepo.delete({ id: task.id });
  }

  // Cambia la tarea de columna y/o carpeta, y reordena la columna destino.
  // `order` puede tener tareas de varias carpetas (en General se ven todas),
  // pero solo se reordenan las que el usuario puede ver.
  async move(id: string, dto: MoveTaskDto, user: AuthUser): Promise<TaskView> {
    const task = await this.findOwnedTask(id, user);
    const owner = await this.resolveFolder(dto.folderId, user);

    const changedPlace =
      task.clientId !== owner.clientId || task.executiveId !== owner.executiveId || task.column !== dto.column;
    Object.assign(task, owner);
    task.column = dto.column;
    if (isPriority(dto.column)) task.priority = dto.column;

    const order = dto.order?.includes(id) ? dto.order.filter((o) => isUUID(o)) : undefined;
    if (!order && changedPlace) task.position = await this.topPosition(dto.column);

    // Sin la relación cargada en findOwnedTask: si viaja, save() la usa en vez
    // de clientId y la tarea no cambiaría de carpeta.
    const { client: _client, ...plain } = task;
    const saved = await this.tasksRepo.manager.transaction(async (em) => {
      const result = await em.save(Task, plain);
      if (order) {
        const siblings = await em.find(Task, {
          where: this.scope(user).map((where) => ({ ...where, id: In(order), column: dto.column })),
        });
        const byId = new Map(siblings.map((t) => [t.id, t]));
        for (const [index, taskId] of order.entries()) {
          const sibling = byId.get(taskId);
          if (sibling && sibling.position !== index) {
            await em.update(Task, { id: taskId }, { position: index });
          }
        }
        result.position = order.indexOf(id);
      }
      return result;
    });
    return this.toView(saved);
  }

  // Tareas que ve el usuario: las de sus clientes (todos, si es admin) que no
  // están dados de baja, más las de su General.
  scope(user: AuthUser): FindOptionsWhere<Task>[] {
    if (user.role === 'admin') {
      return [
        { clientId: Not(IsNull()), client: { deletedAt: IsNull() } },
        { clientId: IsNull(), executiveId: IsNull() },
      ];
    }
    const executiveId = this.ownExecutiveId(user);
    return [
      { client: { executiveId, deletedAt: IsNull() } },
      { clientId: IsNull(), executiveId },
    ];
  }

  // Carpeta 'general' o id de cliente -> dueño de la tarea, validando que el
  // usuario tenga acceso (misma regla que ClientsService#findOwnedClient).
  private async resolveFolder(
    folderId: string,
    user: AuthUser,
  ): Promise<{ clientId: string | null; executiveId: string | null }> {
    if (folderId === GENERAL_ID) {
      return { clientId: null, executiveId: user.role === 'admin' ? null : this.ownExecutiveId(user) };
    }
    const client = isUUID(folderId) ? await this.clientsRepo.findOneBy({ id: folderId }) : null;
    if (!client || client.deletedAt) throw new BadRequestException('No existe esa carpeta');
    if (user.role !== 'admin' && client.executiveId !== user.executiveId) {
      throw new ForbiddenException('No tenés acceso a este cliente');
    }
    return { clientId: client.id, executiveId: null };
  }

  private async findOwnedTask(id: string, user: AuthUser): Promise<Task> {
    const task = isUUID(id) ? await this.tasksRepo.findOne({ where: { id }, relations: ['client'] }) : null;
    if (!task) throw new NotFoundException('Tarea no encontrada');
    const allowed = task.clientId
      ? user.role === 'admin' || task.client?.executiveId === user.executiveId
      : task.executiveId === (user.role === 'admin' ? null : user.executiveId);
    if (!allowed) throw new ForbiddenException('No tenés acceso a esta tarea');
    return task;
  }

  private ownExecutiveId(user: AuthUser): string {
    if (!user.executiveId) throw new ForbiddenException('Tu usuario no está asociado a un ejecutivo');
    return user.executiveId;
  }

  // Arriba de todo en la columna, contando todas las carpetas (así también
  // queda arriba en General, que las muestra todas).
  async topPosition(column: BoardColumn): Promise<number> {
    const row = await this.tasksRepo
      .createQueryBuilder('t')
      .select('MIN(t.position)', 'min')
      .where('t.column = :column', { column })
      .getRawOne<{ min: number | null }>();
    return (row?.min ?? 1) - 1;
  }

  private toView(task: Task): TaskView {
    const { client, clientId, executive, executiveId, ...rest } = task;
    return { ...rest, folderId: clientId ?? GENERAL_ID };
  }
}
