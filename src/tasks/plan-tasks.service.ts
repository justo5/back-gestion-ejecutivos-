import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { AuthUser } from '../auth/current-user.decorator';
import { Plan } from '../cobros/plan.entity';
import { PlanTaskDto } from './dto/save-plan-tasks.dto';
import { PlanTask } from './plan-task.entity';

// Tareas automáticas, editables desde Configuración (las de la agencia, solo
// admin) y desde Perfil (las propias de cada ejecutivo).
@Injectable()
export class PlanTasksService {
  constructor(
    @InjectRepository(PlanTask) private planTasksRepo: Repository<PlanTask>,
    @InjectRepository(Plan) private plansRepo: Repository<Plan>,
  ) {}

  // Admin: las de la agencia. Ejecutivo: las de la agencia que le llegan a
  // sus clientes (para saber qué le va a aparecer, sin poder editarlas; las
  // General de la agencia van a la General del admin, no a la suya) más las
  // suyas.
  findForUser(user: AuthUser): Promise<PlanTask[]> {
    const where =
      user.role === 'admin' || !user.executiveId
        ? { executiveId: IsNull() }
        : [{ executiveId: IsNull(), general: false }, { executiveId: user.executiveId }];
    return this.planTasksRepo.find({ where, order: { position: 'ASC' } });
  }

  // De quién son las tareas que edita este usuario: null = la agencia.
  ownerOf(user: AuthUser): string | null {
    if (user.role === 'admin') return null;
    if (!user.executiveId) throw new ForbiddenException('Tu usuario no está asociado a un ejecutivo');
    return user.executiveId;
  }

  // Reemplaza todas las tareas automáticas del dueño (agencia o ejecutivo)
  // por las recibidas. Las que no vienen se borran.
  async replace(dtos: PlanTaskDto[], user: AuthUser): Promise<PlanTask[]> {
    const owner = this.ownerOf(user);

    if (new Set(dtos.map((t) => t.id)).size !== dtos.length) {
      throw new BadRequestException('Hay tareas con el mismo id');
    }
    if (dtos.some((t) => t.repeat === 'weekly' && t.day > 7)) {
      throw new BadRequestException('Día de la semana inválido');
    }
    const planIds = [...new Set(dtos.map((t) => t.planId).filter((id): id is number => id != null))];
    if (planIds.length && (await this.plansRepo.countBy({ id: In(planIds) })) !== planIds.length) {
      throw new BadRequestException('Alguna tarea apunta a un plan que no existe');
    }

    const tasks = dtos.map((t, position) =>
      this.planTasksRepo.create({
        id: t.id,
        executiveId: owner,
        general: t.general,
        planId: t.general ? null : (t.planId ?? null),
        title: t.title.trim(),
        repeat: t.repeat,
        day: t.repeat === 'daily' ? 1 : t.day,
        position,
      }),
    );
    if (tasks.some((t) => !t.title)) throw new BadRequestException('Hay una tarea sin título');

    await this.planTasksRepo.manager.transaction(async (em) => {
      const ownerWhere = owner === null ? IsNull() : owner;
      // Un id que ya es de otro dueño no se puede "pisar" desde acá.
      const ids = tasks.map((t) => t.id);
      if (ids.length) {
        const foreign = await em.countBy(PlanTask, {
          id: In(ids),
          executiveId: owner === null ? Not(IsNull()) : Not(owner),
        });
        const foreignAgency = owner === null ? 0 : await em.countBy(PlanTask, { id: In(ids), executiveId: IsNull() });
        if (foreign || foreignAgency) throw new ForbiddenException('No podés editar esas tareas');
      }
      await em.delete(PlanTask, ids.length ? { executiveId: ownerWhere, id: Not(In(ids)) } : { executiveId: ownerWhere });
      if (tasks.length) await em.save(PlanTask, tasks);
    });

    return this.findForUser(user);
  }
}
