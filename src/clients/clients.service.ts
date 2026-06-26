import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Client } from './client.entity';
import { Cobro } from '../cobros/cobro.entity';
import { AuthUser } from '../auth/current-user.decorator';
import { UpdateCobroDto } from './dto/update-cobro.dto';

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
    if (dto.collectedBy !== undefined) cobro.collectedBy = dto.collectedBy;
    if (dto.paid !== undefined) cobro.paid = dto.paid;
    cobro.updatedAt = new Date();
    return this.cobrosRepo.save(cobro);
  }
}
