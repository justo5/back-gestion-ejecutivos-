import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Client } from './client.entity';
import { ClientTodo } from './client-todo.entity';
import { Cobro } from '../cobros/cobro.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Client, ClientTodo, Cobro])],
  providers: [ClientsService],
  controllers: [ClientsController],
})
export class ClientsModule {}
