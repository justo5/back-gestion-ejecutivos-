import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './client.entity';
import { Cobro } from '../cobros/cobro.entity';
import { AuthUser } from '../auth/current-user.decorator';
import { UpdateCobroDto } from './dto/update-cobro.dto';
import { CreateClientDto } from './dto/create-client.dto';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Client) private clientsRepo: Repository<Client>,
    @InjectRepository(Cobro) private cobrosRepo: Repository<Cobro>,
  ) {}

  // Same rule as ExecutivesService: an ejecutivo can only ever see clients
  // tied to their own executiveId, regardless of what's requested.
  findAllForUser(user: AuthUser) {
    const where = user.role === 'admin' ? {} : { executiveId: user.executiveId ?? '__none__' };
    return this.clientsRepo.find({
      where,
      relations: ['executive', 'cobro', 'cobro.plan'],
    });
  }

  async updateClient(clientId: string, dto: import('./dto/update-client.dto').UpdateClientDto, user: AuthUser) {
    const client = await this.clientsRepo.findOne({ where: { id: clientId } });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    if (user.role !== 'admin' && user.executiveId !== client.executiveId) {
      throw new ForbiddenException('No tenés acceso a este cliente');
    }

    Object.assign(client, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.fanpage !== undefined && { fanpage: dto.fanpage }),
      ...(dto.adAccount !== undefined && { adAccount: dto.adAccount }),
      ...(dto.plan !== undefined && { plan: dto.plan }),
      ...(dto.country !== undefined && { country: dto.country }),
      ...(dto.usd !== undefined && { usd: dto.usd }),
      ...(dto.ars !== undefined && { ars: dto.ars }),
      ...(dto.collectedBy !== undefined && { collectedBy: dto.collectedBy }),
      ...(dto.active !== undefined && { active: dto.active }),
      ...(dto.contactDay !== undefined && { contactDay: dto.contactDay }),
    });

    return this.clientsRepo.save(client);
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
    if (dto.planId !== undefined) cobro.planId = dto.planId;
    if (dto.collectedByMonth !== undefined) cobro.collectedByMonth = dto.collectedByMonth;
    if (dto.paidMonths !== undefined) cobro.paidMonths = dto.paidMonths;
    cobro.updatedAt = new Date();
    return this.cobrosRepo.save(cobro);
  }

  // Ejecutivos can only ever create clients under their own executiveId.
  // Admins must pick a target executiveId, since they aren't tied to one
  // themselves.
  async createClient(dto: CreateClientDto, user: AuthUser) {
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

    const client = this.clientsRepo.create({
      executiveId,
      name: dto.name,
      fanpage: dto.fanpage ?? null,
      adAccount: dto.adAccount ?? null,
      plan: dto.plan ?? null,
      country: dto.country ?? null,
      usd: dto.usd ?? null,
      ars: dto.ars ?? null,
      collectedBy: dto.collectedBy ?? null,
      active: dto.active,
      contactDay: dto.contactDay ?? null,
      data: dto.data ?? {},
    });
    const saved = await this.clientsRepo.save(client);

    // Si el form eligió un plan del desplegable, se crea el cobro asociado
    // apuntando a ese plan de configuración.
    if (dto.planId != null) {
      await this.cobrosRepo.save(
        this.cobrosRepo.create({ clientId: saved.id, planId: dto.planId }),
      );
    }

    return saved;
  }
}
