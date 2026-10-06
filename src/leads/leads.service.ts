import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { Lead } from './lead.entity';
import { Plan } from '../cobros/plan.entity';
import { Executive } from '../executives/executive.entity';
import { AuthUser } from '../auth/current-user.decorator';
import { ClientsService } from '../clients/clients.service';
import { VbWebhookDto } from './dto/vb-webhook.dto';
import { ListLeadsQueryDto } from './dto/list-leads-query.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';

// Normaliza un nombre de plan para compararlo con los de configuración: la
// landing puede mandar otras mayúsculas o espacios de más.
const normalizePlanName = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    @InjectRepository(Lead) private leadsRepo: Repository<Lead>,
    @InjectRepository(Plan) private plansRepo: Repository<Plan>,
    @InjectRepository(Executive) private executivesRepo: Repository<Executive>,
    @InjectDataSource() private dataSource: DataSource,
    private clientsService: ClientsService,
  ) {}

  // --- Webhook de la landing ---

  // Insert idempotente: vb-api reintenta los envíos y dos reintentos pueden
  // llegar a la vez, así que no se hace "buscar y después insertar" (ambos
  // verían que no existe). ON CONFLICT DO NOTHING sobre externalId deja que
  // la base resuelva la carrera.
  async ingestFromLanding(dto: VbWebhookDto) {
    const planId = await this.resolvePlanId(dto.plan);
    const result = await this.leadsRepo
      .createQueryBuilder()
      .insert()
      .into(Lead)
      .values({
        externalId: dto.id,
        nombre: dto.nombre.trim(),
        apellido: dto.apellido.trim(),
        contacto: dto.contacto.trim(),
        whatsapp: dto.whatsapp.trim(),
        rubro: dto.rubro.trim(),
        inversion: dto.inversion as Lead['inversion'],
        planName: dto.plan.trim(),
        planId,
        consentimientoAt: new Date(dto.consentimientoAt),
        externalCreatedAt: new Date(dto.createdAt),
      })
      .orIgnore()
      .execute();

    // Solo el externalId: el resto son datos personales y no van al log.
    const inserted = (result.identifiers ?? []).some((i) => i?.id);
    this.logger.log(`Lead externalId=${dto.id} ${inserted ? 'recibido' : 'duplicado, ignorado'}`);
  }

  private async resolvePlanId(planName: string): Promise<number | null> {
    const target = normalizePlanName(planName);
    const plans = await this.plansRepo.find();
    return plans.find((p) => normalizePlanName(p.name) === target)?.id ?? null;
  }

  // --- Panel ---

  // Misma regla que clientes: un ejecutivo solo ve los leads asignados a él,
  // diga lo que diga el query. El admin puede filtrar por cualquier ejecutivo.
  async findAll(query: ListLeadsQueryDto, user: AuthUser) {
    let executiveId: string | undefined;
    if (user.role === 'admin') {
      executiveId = query.executiveId;
    } else {
      if (!user.executiveId) return [];
      executiveId = user.executiveId;
    }

    const qb = this.leadsRepo
      .createQueryBuilder('lead')
      // Del ejecutivo solo id y nombre: imageUrl puede ser un data URI pesado.
      .leftJoin('lead.executive', 'executive')
      .addSelect(['executive.id', 'executive.name'])
      .leftJoinAndSelect('lead.plan', 'plan')
      .orderBy('lead.createdAt', 'DESC');
    if (query.status) qb.andWhere('lead.status = :status', { status: query.status });
    if (executiveId) qb.andWhere('lead.executiveId = :executiveId', { executiveId });
    return qb.getMany();
  }

  async countNew(user: AuthUser) {
    if (user.role !== 'admin' && !user.executiveId) return { count: 0 };
    const where =
      user.role === 'admin'
        ? { status: 'nuevo' as const }
        : { status: 'nuevo' as const, executiveId: user.executiveId! };
    return { count: await this.leadsRepo.count({ where }) };
  }

  // Regla de acceso de los endpoints de :id, igual que findOwnedClient: el
  // ejecutivo solo toca leads asignados a él, el admin cualquiera.
  private async findOwnedLead(leadId: string, user: AuthUser): Promise<Lead> {
    const lead = await this.leadsRepo.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Solicitud no encontrada');
    if (user.role !== 'admin' && (!user.executiveId || user.executiveId !== lead.executiveId)) {
      throw new ForbiddenException('No tenés acceso a esta solicitud');
    }
    return lead;
  }

  async update(leadId: string, dto: UpdateLeadDto, user: AuthUser) {
    const lead = await this.findOwnedLead(leadId, user);

    const touchesAdminFields = dto.executiveId !== undefined || dto.planId !== undefined;
    if (touchesAdminFields && user.role !== 'admin') {
      throw new ForbiddenException('Solo el admin puede asignar ejecutivo o plan');
    }
    // Un lead convertido ya tiene su cliente: volverlo a "nuevo" o
    // "descartado" dejaría los dos estados inconsistentes.
    if (dto.status !== undefined && lead.status === 'convertido') {
      throw new ConflictException('La solicitud ya fue convertida en cliente');
    }

    if (dto.executiveId) await this.assertExecutiveExists(dto.executiveId);
    if (dto.planId != null) await this.assertPlanExists(dto.planId);

    if (dto.status !== undefined) lead.status = dto.status as Lead['status'];
    if (dto.notes !== undefined) lead.notes = dto.notes?.trim() || null;
    if (dto.executiveId !== undefined) lead.executiveId = dto.executiveId;
    if (dto.planId !== undefined) lead.planId = dto.planId;
    await this.leadsRepo.save(lead);
    return this.findOneForResponse(lead.id);
  }

  // Crea el cliente a partir del lead reutilizando ClientsService.createClient
  // (que también crea el Cobro si hay plan) y marca el lead como convertido,
  // todo en una transacción: o quedan las dos cosas o ninguna.
  async convert(leadId: string, dto: ConvertLeadDto, user: AuthUser) {
    const lead = await this.leadsRepo.findOne({ where: { id: leadId } });
    if (!lead) throw new NotFoundException('Solicitud no encontrada');
    if (lead.status === 'convertido') throw new ConflictException('La solicitud ya fue convertida en cliente');

    const executiveId = dto.executiveId ?? lead.executiveId;
    if (!executiveId) throw new BadRequestException('Tenés que elegir un ejecutivo para el cliente');
    const planId = dto.planId ?? lead.planId;
    await this.assertExecutiveExists(executiveId);
    if (planId != null) await this.assertPlanExists(planId);

    const client = await this.dataSource.transaction(async (manager) => {
      // Update condicional en vez de confiar en el chequeo de arriba: si dos
      // conversiones corren a la vez, la segunda espera el lock de la fila y
      // después no matchea, así que nunca se crean dos clientes.
      const claimed = await manager.update(
        Lead,
        { id: lead.id, status: Not('convertido') },
        { status: 'convertido', executiveId, planId },
      );
      if (!claimed.affected) throw new ConflictException('La solicitud ya fue convertida en cliente');

      const created = await this.clientsService.createClient(
        {
          executiveId,
          name: `${lead.nombre} ${lead.apellido}`,
          active: true,
          fanpage: lead.contacto,
          rubro: dto.rubro ?? lead.rubro,
          planId,
          data: {
            whatsapp: lead.whatsapp,
            inversion: lead.inversion,
            leadId: lead.id,
            externalId: lead.externalId,
            source: lead.source,
            consentimientoAt: lead.consentimientoAt.toISOString(),
          },
        },
        user,
        manager,
      );
      await manager.update(Lead, { id: lead.id }, { clientId: created.id });
      return created;
    });

    return { lead: await this.findOneForResponse(lead.id), client };
  }

  private async findOneForResponse(leadId: string) {
    return this.leadsRepo
      .createQueryBuilder('lead')
      .leftJoin('lead.executive', 'executive')
      .addSelect(['executive.id', 'executive.name'])
      .leftJoinAndSelect('lead.plan', 'plan')
      .where('lead.id = :leadId', { leadId })
      .getOneOrFail();
  }

  // Validan antes de escribir para responder 400 en vez de que la FK tire un 500.
  private async assertExecutiveExists(executiveId: string) {
    if (!(await this.executivesRepo.exists({ where: { id: executiveId } }))) {
      throw new BadRequestException('El ejecutivo no existe');
    }
  }

  private async assertPlanExists(planId: number) {
    if (!(await this.plansRepo.exists({ where: { id: planId } }))) {
      throw new BadRequestException('El plan no existe');
    }
  }
}
