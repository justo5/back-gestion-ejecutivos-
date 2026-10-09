import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Client } from './client.entity';
import { Cobro } from '../cobros/cobro.entity';
import { AuthUser } from '../auth/current-user.decorator';
import { UpdateCobroDto } from './dto/update-cobro.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientExtrasDto } from './dto/update-client-extras.dto';
import { UpdateBajaDto } from './dto/update-baja.dto';
import { RecurringService } from '../tasks/recurring.service';
import { Plan } from '../cobros/plan.entity';
import { matchPlan } from '../cobros/plan-match';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client) private clientsRepo: Repository<Client>,
    @InjectRepository(Cobro) private cobrosRepo: Repository<Cobro>,
    private recurring: RecurringService,
  ) {}

  // Same rule as ExecutivesService: an ejecutivo can only ever see clients
  // tied to their own executiveId, regardless of what's requested.
  async findAllForUser(user: AuthUser) {
    const where = user.role === 'admin' ? {} : { executiveId: user.executiveId ?? '__none__' };
    return this.clientsRepo.find({
      where,
      relations: ['executive', 'cobro', 'cobro.plan'],
    });
  }

  // Centraliza la regla de acceso usada por todos los endpoints de :id: un
  // ejecutivo solo puede tocar clientes de su propio executiveId, un admin
  // puede tocar cualquiera. La reutilizan tanto los endpoints existentes
  // como cualquier función nueva que se agregue sobre un cliente puntual.
  private async findOwnedClient(clientId: string, user: AuthUser): Promise<Client> {
    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (user.role !== 'admin' && user.executiveId !== client.executiveId) {
      throw new ForbiddenException('No tenés acceso a este cliente');
    }
    return client;
  }

  async updateClient(clientId: string, dto: import('./dto/update-client.dto').UpdateClientDto, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    // Las tareas automáticas dependen del ciclo de cobro y del plan de Cobros.
    const cycleChanged =
      (dto.contactDay !== undefined && dto.contactDay !== client.contactDay) ||
      (dto.active !== undefined && dto.active !== client.active) ||
      (dto.plan !== undefined && dto.plan !== client.plan);

    Object.assign(client, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.fanpage !== undefined && { fanpage: dto.fanpage }),
      ...(dto.plan !== undefined && { plan: dto.plan }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.sexo !== undefined && { sexo: dto.sexo }),
      ...(dto.edad !== undefined && { edad: dto.edad }),
      ...(dto.collectedBy !== undefined && { collectedBy: dto.collectedBy }),
      ...(dto.rubro !== undefined && { rubro: dto.rubro }),
      ...(dto.iva !== undefined && { iva: dto.iva }),
      ...(dto.active !== undefined && { active: dto.active }),
      ...(dto.contactDay !== undefined && { contactDay: dto.contactDay }),
    });

    const saved = await this.clientsRepo.save(client);
    if (dto.plan !== undefined) await this.syncCobroPlan(client.id, client.plan);
    if (cycleChanged) await this.recurring.syncClients([client.id]);
    return saved;
  }

  // El plan del cliente es el de su texto (el que usa Cobros): el cobro se
  // alinea para que no quede apuntando a otro plan.
  private async syncCobroPlan(clientId: string, planText: string | null) {
    const plan = matchPlan(planText, await this.clientsRepo.manager.find(Plan));
    const planId = plan?.id ?? null;
    const cobro = await this.cobrosRepo.findOne({ where: { clientId } });
    if (cobro) {
      if (cobro.planId !== planId) await this.cobrosRepo.update({ id: cobro.id }, { planId });
    } else if (planId !== null) {
      await this.cobrosRepo.save(this.cobrosRepo.create({ clientId, planId }));
    }
  }

  async updateCobro(clientId: string, dto: UpdateCobroDto, user: AuthUser) {
    const client = await this.clientsRepo.findOne({ where: { id: clientId }, relations: ['cobro'] });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (user.role !== 'admin' && user.executiveId !== client.executiveId) {
      throw new ForbiddenException('No tenés acceso a este cliente');
    }

    let cobro = client.cobro;
    if (!cobro) {
      cobro = this.cobrosRepo.create({ clientId });
    }
    // El plan decide qué tareas automáticas le tocan al cliente.
    const planChanged = dto.planId !== undefined && dto.planId !== (cobro.planId ?? null);
    if (dto.planId !== undefined) cobro.planId = dto.planId;
    if (dto.collectedByMonth !== undefined) cobro.collectedByMonth = dto.collectedByMonth;
    if (dto.paidMonths !== undefined) cobro.paidMonths = dto.paidMonths;
    if (dto.collectedInMonth !== undefined) cobro.collectedInMonth = dto.collectedInMonth;
    if (dto.gastosByMonth !== undefined) cobro.gastosByMonth = dto.gastosByMonth;
    if (dto.ivaByMonth !== undefined) cobro.ivaByMonth = dto.ivaByMonth;
    cobro.updatedAt = new Date();
    const saved = await this.cobrosRepo.save(cobro);
    if (planChanged) {
      // El plan que cuenta es el texto del cliente (Cobros, Tareas): se alinea.
      const plan = cobro.planId === null ? null : await this.clientsRepo.manager.findOneBy(Plan, { id: cobro.planId });
      await this.clientsRepo.update({ id: clientId }, { plan: plan?.name ?? null });
      await this.recurring.syncClients([clientId]);
    }
    return saved;
  }

  // Foto del cliente, igual que ExecutivesService#updateImage pero acá
  // cualquier ejecutivo dueño del cliente puede cambiarla, no solo el admin.
  async updateImage(clientId: string, imageUrl: string, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    client.imageUrl = imageUrl || null;
    return this.clientsRepo.save(client);
  }

  // Soft delete: no se borra la fila (eso arrastraría en cascada el Cobro y
  // con él todo el historial de pagos ya cobrados). Se marca deletedAt y listo:
  // el cliente deja de contar como activo/futuro en todos lados, pero su
  // historial sigue disponible para los meses anteriores a la baja.
  async deleteClient(clientId: string, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (client.deletedAt) return;
    client.deletedAt = new Date();
    await this.clientsRepo.save(client);
    // Las automáticas que todavía no llegaron a su fecha ya no corresponden.
    await this.recurring.syncClients([client.id]);
  }

  // --- Bajas: editar fecha/motivo y eliminar la baja ---

  // Solo aplica a clientes que ya están dados de baja. La fecha llega como
  // 'YYYY-MM-DD' desde un input date: se guarda a mediodía UTC para que en
  // cualquier huso horario razonable (Argentina incluida) siga cayendo en el
  // mismo día calendario, en vez de correrse al día anterior con las 00:00 UTC.
  async updateBaja(clientId: string, dto: UpdateBajaDto, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (!client.deletedAt) throw new BadRequestException('El cliente no está dado de baja');

    if (dto.deletedAt !== undefined) {
      const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(dto.deletedAt);
      const date = new Date(isDateOnly ? `${dto.deletedAt}T12:00:00Z` : dto.deletedAt);
      if (isNaN(date.getTime())) throw new BadRequestException('Fecha de baja inválida');
      client.deletedAt = date;
    }
    if (dto.deletedReason !== undefined) {
      client.deletedReason = dto.deletedReason?.trim() || null;
    }
    return this.clientsRepo.save(client);
  }

  // "Eliminar una baja" = deshacerla: el cliente vuelve a estar vigente. No
  // borra nada (ni el cliente ni su historial de cobros), solo limpia la marca
  // de soft delete y el motivo.
  async removeBaja(clientId: string, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (!client.deletedAt) return;
    client.deletedAt = null;
    client.deletedReason = null;
    await this.clientsRepo.save(client);
    await this.recurring.syncClients([client.id]);
  }

  // Borrado definitivo, para clientes mal cargados o que nunca terminaron
  // entrando. A diferencia del soft delete, esto sí borra la fila y arrastra
  // en cascada (a nivel base) su Cobro con todo el historial de pagos y sus
  // tareas, sin vuelta atrás. Por eso solo se permite sobre clientes que ya
  // están dados de baja: nunca se salta directo de "cliente vigente" a borrado.
  async deleteClientPermanently(clientId: string, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (!client.deletedAt) {
      throw new BadRequestException('Solo se puede eliminar definitivamente un cliente dado de baja');
    }
    await this.clientsRepo.delete({ id: client.id });
  }

  // --- Ficha extendida: notas / estado / link (antes en localStorage) ---

  async updateExtras(clientId: string, dto: UpdateClientExtrasDto, user: AuthUser) {
    const client = await this.findOwnedClient(clientId, user);
    if (dto.notes !== undefined) client.notes = dto.notes;
    if (dto.statusOverride !== undefined) client.statusOverride = dto.statusOverride;
    if (dto.linkOverride !== undefined) client.linkOverride = dto.linkOverride;
    return this.clientsRepo.save(client);
  }

  // Ejecutivos can only ever create clients under their own executiveId.
  // Admins must pick a target executiveId, since they aren't tied to one
  // themselves.
  // `manager` es opcional: permite correr el alta dentro de una transacción
  // de quien llama (ej. la conversión de un lead, que además actualiza el lead).
  // En ese caso no se generan las tareas automáticas: antes del commit el
  // cliente no existe para el resto de la app. Hoy no hace falta (un lead
  // convertido no tiene día de inicio, así que todavía no tiene ciclo); si
  // algún día lo tiene, quien llama debe usar RecurringService.syncClients.
  async createClient(dto: CreateClientDto, user: AuthUser, manager?: EntityManager) {
    const clientsRepo = manager ? manager.getRepository(Client) : this.clientsRepo;
    const cobrosRepo = manager ? manager.getRepository(Cobro) : this.cobrosRepo;

    let executiveId: string;
    if (user.role === 'admin') {
      if (!dto.executiveId) {
        throw new ForbiddenException('Tenés que elegir un ejecutivo para el cliente');
      }
      executiveId = dto.executiveId;
    } else {
      if (!user.executiveId) {
        throw new ForbiddenException('Tu usuario no está asociado a un ejecutivo');
      }
      executiveId = user.executiveId;
    }

    // Cliente y cobro quedan con el mismo plan: el elegido en el desplegable
    // (planId) se guarda también como texto, que es lo que muestra Cobros, y
    // un texto que matchea un plan deja el cobro apuntando a ese plan.
    const plans = await clientsRepo.manager.find(Plan);
    const chosen = dto.planId != null ? plans.find((p) => p.id === dto.planId) : undefined;
    const planText = dto.plan?.trim() || chosen?.name || null;
    const planId = dto.planId ?? matchPlan(planText, plans)?.id ?? null;

    const client = clientsRepo.create({
      executiveId,
      name: dto.name,
      fanpage: dto.fanpage ?? null,
      plan: planText,
      country: dto.country ?? null,
      sexo: dto.sexo ?? null,
      edad: dto.edad ?? null,
      collectedBy: dto.collectedBy ?? null,
      rubro: dto.rubro ?? null,
      iva: dto.iva ?? null,
      active: dto.active,
      contactDay: dto.contactDay ?? null,
      data: dto.data ?? {},
    });
    const saved = await clientsRepo.save(client);

    if (planId !== null) {
      await cobrosRepo.save(cobrosRepo.create({ clientId: saved.id, planId }));
    }

    if (!manager) await this.recurring.syncClients([saved.id]);
    return saved;
  }
}
