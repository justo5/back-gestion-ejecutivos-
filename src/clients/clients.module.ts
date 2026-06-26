import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './client.entity';
import { Cobro } from '../cobros/cobro.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Client, Cobro])],
  providers: [ClientsService],
  controllers: [ClientsController],
})
export class ClientsModule {}
