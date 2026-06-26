import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from '../users/user.entity';
import { Executive } from '../executives/executive.entity';
import { Client } from '../clients/client.entity';
import { Plan } from '../cobros/plan.entity';
import { Cobro } from '../cobros/cobro.entity';

async function run() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'gestion_ejecutivos',
    entities: [User, Executive, Client, Plan, Cobro],
    synchronize: true,
  });
  await dataSource.initialize();

  const planRepo = dataSource.getRepository(Plan);
  const defaultPlans = [
    { id: 1, name: 'Plan 1', price: 0 },
    { id: 2, name: 'Plan 2', price: 0 },
    { id: 3, name: 'Plan 3', price: 0 },
  ];
  for (const plan of defaultPlans) {
    const exists = await planRepo.findOneBy({ id: plan.id });
    if (!exists) await planRepo.save(planRepo.create(plan));
  }

  const userRepo = dataSource.getRepository(User);
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@empresa.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123';
  const existingAdmin = await userRepo.findOneBy({ email: adminEmail });
  if (!existingAdmin) {
    await userRepo.save(
      userRepo.create({
        name: 'Administrador',
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        role: UserRole.ADMIN,
        executiveId: null,
      }),
    );
    console.log(`Admin creado: ${adminEmail} / ${adminPassword}`);
  } else {
    console.log('Admin ya existe, no se modifica.');
  }

  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
