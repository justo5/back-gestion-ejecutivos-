import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Executive } from './executive.entity';
import { Client } from '../clients/client.entity';
import { ExecutivesService } from './executives.service';
import { ExecutivesController } from './executives.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Executive, Client])],
  providers: [ExecutivesService],
  controllers: [ExecutivesController],
  exports: [ExecutivesService],
})
export class ExecutivesModule {}
