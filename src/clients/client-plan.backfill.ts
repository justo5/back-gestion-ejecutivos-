import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { Client } from './client.entity';
import { RecurringService } from '../tasks/recurring.service';

// Antes, convertir una solicitud en cliente guardaba el plan solo en el cobro
// y dejaba vacío el texto del plan del cliente, que es lo que usan Cobros y
// Tareas: esos clientes figuraban sin plan. Completa el texto con el nombre
// del plan elegido. Solo toca clientes que vienen de una solicitud y no tienen
// texto, así que después de la primera vez no encuentra nada.
@Injectable()
export class ClientPlanBackfill implements OnApplicationBootstrap {
  private readonly logger = new Logger(ClientPlanBackfill.name);

  constructor(
    private dataSource: DataSource,
    private recurring: RecurringService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const clients = await this.dataSource.getRepository(Client).find({
        where: [{ plan: IsNull() }, { plan: '' }],
        relations: ['cobro', 'cobro.plan'],
      });
      const pending = clients.filter((c) => c.data?.leadId && c.cobro?.plan);
      if (!pending.length) return;
      for (const client of pending) {
        await this.dataSource.getRepository(Client).update({ id: client.id }, { plan: client.cobro.plan!.name });
      }
      await this.recurring.syncClients(pending.map((c) => c.id));
      this.logger.log(`Se completó el plan de ${pending.length} clientes convertidos de solicitudes`);
    } catch (err) {
      this.logger.error('No se pudo completar el plan de los clientes convertidos', err);
    }
  }
}
