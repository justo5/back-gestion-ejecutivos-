import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ExecutivesModule } from './executives/executives.module';
import { ClientsModule } from './clients/clients.module';
import { CobrosModule } from './cobros/cobros.module';
import { User } from './users/user.entity';
import { Executive } from './executives/executive.entity';
import { Client } from './clients/client.entity';
import { Plan } from './cobros/plan.entity';
import { Cobro } from './cobros/cobro.entity';

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
        entities: [User, Executive, Client, Plan, Cobro],
        synchronize: config.get('DB_SYNC', 'true') === 'true',
      }),
    }),
    AuthModule,
    UsersModule,
    ExecutivesModule,
    ClientsModule,
    CobrosModule,
  ],
})
export class AppModule {}
