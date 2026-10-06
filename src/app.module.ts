import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ExecutivesModule } from './executives/executives.module';
import { ClientsModule } from './clients/clients.module';
import { CobrosModule } from './cobros/cobros.module';
import { RubrosModule } from './rubros/rubros.module';
import { GoalsModule } from './goals/goals.module';
import { LeadsModule } from './leads/leads.module';
import { User } from './users/user.entity';
import { Executive } from './executives/executive.entity';
import { Client } from './clients/client.entity';
import { ClientTodo } from './clients/client-todo.entity';
import { Plan } from './cobros/plan.entity';
import { Cobro } from './cobros/cobro.entity';
import { Rubro } from './rubros/rubro.entity';
import { DashboardGoal } from './goals/dashboard-goal.entity';
import { Lead } from './leads/lead.entity';

// Exportado para que los tests e2e levanten la misma lista de entidades
// contra su base en memoria.
export const ENTITIES = [User, Executive, Client, ClientTodo, Plan, Cobro, Rubro, DashboardGoal, Lead];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USER', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_NAME', 'gestion_ejecutivos'),
        entities: ENTITIES,
        synchronize: config.get('DB_SYNC', 'true') === 'true',
      }),
    }),
    AuthModule,
    UsersModule,
    ExecutivesModule,
    ClientsModule,
    CobrosModule,
    RubrosModule,
    GoalsModule,
    LeadsModule,
  ],
})
export class AppModule {}
