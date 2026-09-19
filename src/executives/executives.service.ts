import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Executive } from './executive.entity';
import { Client } from '../clients/client.entity';
import { User, UserRole } from '../users/user.entity';
import { AuthUser } from '../auth/current-user.decorator';
import { ImportExecutivesDto } from './dto/import-executives.dto';
import { CreateExecutiveDto } from './dto/create-executive.dto';
import { UpdateExecutiveDto } from './dto/update-executive.dto';
import { TransferClientsDto } from './dto/transfer-clients.dto';

@Injectable()
export class ExecutivesService {
  constructor(
    @InjectRepository(Executive) private executivesRepo: Repository<Executive>,
    @InjectRepository(Client) private clientsRepo: Repository<Client>,
    @InjectRepository(User) private usersRepo: Repository<User>,
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
    // Los clientes dados de baja (soft delete) siguen viajando en `clients`
    // porque Cobros los necesita para mostrar el historial de meses previos
    // a la baja, pero no cuentan como clientes "vigentes" del ejecutivo.
    const currentClients = clients.filter((c) => !c.deletedAt);
    return {
      id: executive.id,
      name: executive.name,
      imageUrl: executive.imageUrl,
      squad: executive.squad,
      clientCount: currentClients.length,
      activeCount: currentClients.filter((c) => c.active).length,
      clients,
    };
  }

  // --- CRUD de ejecutivos (solo admin, ver ExecutivesController) ---

  async create(dto: CreateExecutiveDto) {
    if (!!dto.email !== !!dto.password) {
      throw new BadRequestException('Para crear el acceso hacen falta email y contraseña juntos');
    }
    await this.assertNameAvailable(dto.name);
    if (dto.email && (await this.usersRepo.findOne({ where: { email: dto.email } }))) {
      throw new ConflictException('Ya existe un usuario con ese email');
    }

    // Ejecutivo y usuario se crean juntos o no se crea ninguno.
    const executive = await this.executivesRepo.manager.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(Executive, { name: dto.name, squad: dto.squad || null }),
      );
      if (dto.email && dto.password) {
        await manager.save(
          manager.create(User, {
            name: dto.name,
            email: dto.email,
            passwordHash: await bcrypt.hash(dto.password, 10),
            role: UserRole.EJECUTIVO,
            executiveId: created.id,
          }),
        );
      }
      return created;
    });
    return this.withCounts({ ...executive, clients: [] });
  }

  async update(id: string, dto: UpdateExecutiveDto) {
    const executive = await this.findOrFail(id);
    if (dto.name !== undefined && dto.name !== executive.name) {
      await this.assertNameAvailable(dto.name);
      executive.name = dto.name;
    }
    if (dto.squad !== undefined) executive.squad = dto.squad || null;
    await this.executivesRepo.save(executive);
    return this.findOneForUser(id, { role: 'admin' } as AuthUser);
  }

  // Borrar un ejecutivo arrastraría en cascada todos sus clientes (y con
  // ellos cobros y to do), así que no se permite mientras tenga alguno, dado
  // de baja o no: primero hay que traspasarlos. Los usuarios de login del
  // ejecutivo sí se borran con él (tienen FK a executives).
  async remove(id: string) {
    await this.findOrFail(id);
    const clientCount = await this.clientsRepo.count({ where: { executiveId: id } });
    if (clientCount > 0) {
      throw new ConflictException(
        `El ejecutivo todavía tiene ${clientCount} cliente${clientCount === 1 ? '' : 's'} (incluidas bajas). Traspasalos a otro ejecutivo antes de eliminarlo.`,
      );
    }
    await this.executivesRepo.manager.transaction(async (manager) => {
      await manager.delete(User, { executiveId: id });
      await manager.delete(Executive, { id });
    });
  }

  // Traspasa clientes de un ejecutivo a otro. El historial (cobros, to do,
  // notas) viaja con el cliente porque cuelga del clientId, no del ejecutivo.
  async transferClients(fromId: string, dto: TransferClientsDto) {
    if (fromId === dto.targetExecutiveId) {
      throw new BadRequestException('El ejecutivo de origen y el de destino son el mismo');
    }
    await this.findOrFail(fromId);
    await this.findOrFail(dto.targetExecutiveId);

    if (dto.clientIds) {
      const ids = [...new Set(dto.clientIds)];
      // Solo clientes que realmente son del ejecutivo de origen: evita mover
      // por error clientes de un tercero con un id mal armado.
      const owned = await this.clientsRepo.count({ where: { id: In(ids), executiveId: fromId } });
      if (owned !== ids.length) {
        throw new BadRequestException('Algunos clientes no pertenecen al ejecutivo de origen');
      }
      await this.clientsRepo.update({ id: In(ids) }, { executiveId: dto.targetExecutiveId });
      return { transferred: ids.length };
    }

    const result = await this.clientsRepo.update(
      { executiveId: fromId },
      { executiveId: dto.targetExecutiveId },
    );
    return { transferred: result.affected ?? 0 };
  }

  private async findOrFail(id: string): Promise<Executive> {
    const executive = await this.executivesRepo.findOne({ where: { id } });
    if (!executive) throw new NotFoundException('Ejecutivo no encontrado');
    return executive;
  }

  private async assertNameAvailable(name: string) {
    if (await this.executivesRepo.findOne({ where: { name } })) {
      throw new ConflictException('Ya existe un ejecutivo con ese nombre');
    }
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

  updateImage(id: string, imageUrl: string, user: AuthUser) {
    this.assertAccess(id, user);
    return this.executivesRepo.update(id, { imageUrl });
  }

  // Crecimiento acumulado de TODA la empresa (todos los ejecutivos sumados),
  // últimos 12 meses. A diferencia de findAllForUser, no se filtra por rol:
  // cualquier usuario autenticado lo puede ver (ver ExecutivesController),
  // porque es la única vista "de la empresa" que le corresponde a un
  // ejecutivo no admin (su propio findAllForUser solo trae su cartera).
  // Mismo criterio de "baseline" que el gráfico por ejecutivo del frontend
  // (ver DashboardPage#buildExecutiveGrowth): un contactDay anterior a la
  // ventana de 12 meses (o sin cargar) cuenta como "ya estaba".
  async getGeneralGrowth(): Promise<number[]> {
    const clients = await this.clientsRepo.find({ where: { deletedAt: IsNull() } });

    const now = new Date();
    const monthYms: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthYms.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const windowStartYm = monthYms[0];

    const baseline = clients.filter((c) => {
      const ym = (c.contactDay ?? '').slice(0, 7);
      return !ym || ym < windowStartYm;
    }).length;

    let running = baseline;
    return monthYms.map((ym) => {
      running += clients.filter((c) => (c.contactDay ?? '').slice(0, 7) === ym).length;
      return running;
    });
  }
}
