import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead } from './lead.entity';
import { Plan } from '../cobros/plan.entity';
import { Executive } from '../executives/executive.entity';
import { ClientsModule } from '../clients/clients.module';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { VbWebhookController } from './vb-webhook.controller';
import { VbSignatureGuard } from './vb-signature.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, Plan, Executive]), ClientsModule],
  providers: [LeadsService, VbSignatureGuard],
  controllers: [LeadsController, VbWebhookController],
})
export class LeadsModule {}
