import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Executive } from './executive.entity';
import { Client } from '../clients/client.entity';
import { AuthUser } from '../auth/current-user.decorator';
import { ImportExecutivesDto } from './dto/import-executives.dto';

@Injectable()
export class ExecutivesService {
  constructor(
    @InjectRepository(Executive) private executivesRepo: Repository<Executive>,
    @InjectRepository(Client) private clientsRepo: Repository<Client>,
  ) {}

  // Ejecutivos only ever see their own record; admins see everyone. Enforced
  // here (not just in the controller) so any future caller can't bypass it.
  async findAllForUser(user: AuthUser) {
    const where = user.role === 'admin' ? {} : { id: user.executiveId ?? '__none__' };
    const executives = await this.executivesRepo.find({
      where,
      relations: ['clients', 'clients.cobro'],
    });
    return executives.map((exec) => this.withCounts(exec));
  }

  async findOneForUser(id: string, user: AuthUser) {
    this.assertAccess(id, user);
    const executive = await this.executivesRepo.findOne({
      where: { id },
      relations: ['clients', 'clients.cobro'],
    });
    if (!executive) throw new NotFoundException('Ejecutivo no encontrado');
    return this.withCounts(executive);
  }

  assertAccess(executiveId: string, user: AuthUser) {
    if (user.role !== 'admin' && user.executiveId !== executiveId) {
      throw new ForbiddenException('No tenés acceso a la información de otro ejecutivo');
    }
  }

  private withCounts(executive: Executive) {
    const clients = executive.clients ?? [];
    return {
      id: executive.id,
      name: executive.name,
      imageUrl: executive.imageUrl,
      squad: executive.squad,
      clientCount: clients.length,
      activeCount: clients.filter((c) => c.active).length,
      clients,
    };
  }

  async importAll(dto: ImportExecutivesDto) {
    for (const execDto of dto.executives) {
      let executive = await this.executivesRepo.findOne({ where: { name: execDto.name } });
      if (!executive) {
        executive = this.executivesRepo.create({ name: execDto.name });
      }
      executive.imageUrl = execDto.imageUrl ?? executive.imageUrl;
      executive.squad = execDto.squad ?? executive.squad;
      executive = await this.executivesRepo.save(executive);

      await this.clientsRepo.delete({ executiveId: executive.id });
      const clients = execDto.clients.map((c) =>
        this.clientsRepo.create({
          executiveId: executive!.id,
          name: c.name,
          fanpage: c.fanpage ?? null,
          plan: c.plan ?? null,
          country: c.country ?? null,
          sexo: c.sexo ?? null,
          edad: c.edad ?? null,
          collectedBy: c.collectedBy ?? null,
          active: c.active,
          contactDay: c.contactDay ?? null,
          data: c.data,
        }),
      );
      if (clients.length) await this.clientsRepo.save(clients);
    }
    return { imported: dto.executives.length };
  }

  updateImage(id: string, imageUrl: string) {
    return this.executivesRepo.update(id, { imageUrl });
  }
}
