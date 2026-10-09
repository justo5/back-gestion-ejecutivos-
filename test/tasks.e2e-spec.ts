import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthModule } from '../src/auth/auth.module';
import { ClientsModule } from '../src/clients/clients.module';
import { Client } from '../src/clients/client.entity';
import { Cobro } from '../src/cobros/cobro.entity';
import { Plan } from '../src/cobros/plan.entity';
import { Executive } from '../src/executives/executive.entity';
import { ClientTodosMigration } from '../src/tasks/client-todos.migration';
import { addDays, today } from '../src/tasks/dates';
import { PlanTask } from '../src/tasks/plan-task.entity';
import { RecurringOccurrence } from '../src/tasks/recurring-occurrence.entity';
import { RecurringService } from '../src/tasks/recurring.service';
import { ScheduledTask, occurrences } from '../src/tasks/schedule';
import { Task } from '../src/tasks/task.entity';
import { TasksModule } from '../src/tasks/tasks.module';

// Postgres en memoria (pg-mem): los tests no necesitan una base levantada.
// pg-mem devuelve las columnas `date` como medianoche UTC y TypeORM las lee en
// la hora local: por eso `yarn test` corre con TZ=UTC (con Postgres real no
// hace falta).
async function createDataSource(): Promise<DataSource> {
  const db = newDb({ autoCreateForeignKeyIndices: true });
  db.public.registerFunction({ name: 'current_database', implementation: () => 'test' });
  db.public.registerFunction({ name: 'version', implementation: () => 'PostgreSQL 16' });
  db.registerExtension('uuid-ossp', (schema) =>
    schema.registerFunction({ name: 'uuid_generate_v4', returns: DataType.uuid, implementation: randomUUID, impure: true }),
  );
  const ds: DataSource = await db.adapters.createTypeormDataSource({ type: 'postgres', entities: ENTITIES });
  await ds.initialize();
  await ds.synchronize();
  return ds;
}

describe('occurrences', () => {
  const review: ScheduledTask = { id: 'review', title: 'Revisión ({mes})', repeat: 'monthly', day: 15 };
  const report: ScheduledTask = { id: 'report', title: 'Informe de {mes}', repeat: 'monthly', day: 31 };

  it('sigue el ciclo: el día 15 y al vencimiento', () => {
    expect(occurrences([review, report], '2026-09-10', '2026-09-10', '2026-11-10')).toEqual([
      { key: 'review@2026-09', title: 'Revisión (septiembre)', dueDate: '2026-09-24' },
      { key: 'report@2026-09', title: 'Informe de septiembre', dueDate: '2026-10-10' },
      { key: 'review@2026-10', title: 'Revisión (octubre)', dueDate: '2026-10-24' },
      { key: 'report@2026-10', title: 'Informe de octubre', dueDate: '2026-11-10' },
    ]);
  });

  it('no genera lo que vence antes de `from`', () => {
    const keys = occurrences([review, report], '2026-09-10', '2026-10-06', '2026-11-20').map((o) => o.key);
    expect(keys).toEqual(['report@2026-09', 'review@2026-10', 'report@2026-10']);
  });

  it('si el ciclo arranca un 31, los meses cortos usan su último día', () => {
    const dates = occurrences([report], '2027-12-31', '2027-12-31', '2028-03-31').map((o) => o.dueDate);
    expect(dates).toEqual(['2028-01-31', '2028-02-29', '2028-03-31']);
  });

  it('si el ciclo es más corto que el día, vence el día antes del vencimiento', () => {
    const day30: ScheduledTask = { id: 'd30', title: 'x', repeat: 'monthly', day: 30 };
    expect(occurrences([day30], '2027-02-01', '2027-02-01', '2027-03-01')[0].dueDate).toBe('2027-02-28');
  });

  it('las semanales caen siempre el mismo día y las diarias, solo una semana adelante', () => {
    const weekly: ScheduledTask = { id: 'weekly', title: 'Semanal ({mes})', repeat: 'weekly', day: 1 };
    const daily: ScheduledTask = { id: 'daily', title: 'Diaria', repeat: 'daily', day: 1 };
    const all = occurrences([weekly, daily], '2026-09-10', '2026-10-07', '2026-11-03');
    expect(all.filter((o) => o.key.startsWith('weekly')).map((o) => `${o.dueDate} ${o.title}`)).toEqual([
      '2026-10-12 Semanal (octubre)',
      '2026-10-19 Semanal (octubre)',
      '2026-10-26 Semanal (octubre)',
      '2026-11-02 Semanal (noviembre)',
    ]);
    expect(all.filter((o) => o.key.startsWith('daily')).map((o) => o.dueDate)).toEqual([
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
    ]);
  });
});

describe('Tareas (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let marcoToken: string;
  let luciaToken: string;
  let marco: Executive;
  let lucia: Executive;
  let ejecucion: Plan;
  let creatividades: Plan;
  let marcoClient: Client;
  let luciaClient: Client;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const api = () => request(app.getHttpServer());
  const state = async (token: string) => (await api().get('/api/tasks/state').set(auth(token)).expect(200)).body;
  const newTask = (token: string, body: Record<string, unknown>) =>
    api().post('/api/tasks').set(auth(token)).send({ id: randomUUID(), column: 'yellow', title: 'Tarea', ...body });
  const planTask = (overrides: Partial<PlanTask> = {}) => ({
    id: randomUUID(),
    general: false,
    planId: null,
    title: 'Revisión de {mes}',
    repeat: 'monthly',
    day: 15,
    ...overrides,
  });
  const generated = (clientId: string | null) =>
    ds.getRepository(Task).find({ where: clientId ? { clientId } : {}, order: { dueDate: 'ASC' } });

  // Cliente activo, con plan y día de inicio: tiene ciclo de cobro.
  async function clientWithCycle(executive: Executive, plan: Plan, name: string, contactDay = addDays(today(), -5)) {
    const client = await ds.getRepository(Client).save({ executiveId: executive.id, name, plan: plan.name, active: true, contactDay });
    await ds.getRepository(Cobro).save({ clientId: client.id, planId: plan.id });
    return client;
  }

  beforeAll(async () => {
    process.env.JWT_SECRET = 'jwt-test-secret';
    ds = await createDataSource();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRootAsync({
          useFactory: () => ({ type: 'postgres', entities: ENTITIES }),
          dataSourceFactory: async () => ds,
        }),
        AuthModule,
        ClientsModule,
        TasksModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    marco = await ds.getRepository(Executive).save({ name: 'Marco' });
    lucia = await ds.getRepository(Executive).save({ name: 'Lucía' });
    ejecucion = await ds.getRepository(Plan).save({ name: 'Plan ejecución', price: 350 });
    creatividades = await ds.getRepository(Plan).save({ name: 'Plan ejecución + creatividades', price: 490 });

    const jwt = app.get(JwtService);
    adminToken = await jwt.signAsync({ sub: randomUUID(), email: 'admin@x.com', role: 'admin', executiveId: null });
    marcoToken = await jwt.signAsync({ sub: randomUUID(), email: 'marco@x.com', role: 'ejecutivo', executiveId: marco.id });
    luciaToken = await jwt.signAsync({ sub: randomUUID(), email: 'lucia@x.com', role: 'ejecutivo', executiveId: lucia.id });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    for (const entity of [Task, RecurringOccurrence, PlanTask, Cobro, Client]) {
      await ds.getRepository(entity).createQueryBuilder().delete().execute();
    }
    marcoClient = await clientWithCycle(marco, ejecucion, 'Panadería');
    luciaClient = await clientWithCycle(lucia, creatividades, 'Gimnasio');
  });

  describe('tablero', () => {
    it('cada ejecutivo ve solo su cartera y su General; el admin, todos los clientes y la General de la agencia', async () => {
      await newTask(marcoToken, { folderId: marcoClient.id, title: 'De Panadería' }).expect(201);
      await newTask(marcoToken, { folderId: 'general', title: 'General de Marco' }).expect(201);
      await newTask(luciaToken, { folderId: luciaClient.id, title: 'De Gimnasio' }).expect(201);
      await newTask(adminToken, { folderId: 'general', title: 'De la agencia' }).expect(201);

      const marcoState = await state(marcoToken);
      expect(marcoState.folders.map((f: { name: string }) => f.name)).toEqual(['Panadería']);
      expect(marcoState.tasks.map((t: { title: string }) => t.title).sort()).toEqual(['De Panadería', 'General de Marco']);

      const adminState = await state(adminToken);
      expect(adminState.folders.map((f: { name: string }) => f.name)).toEqual(['Gimnasio', 'Panadería']);
      expect(adminState.tasks.map((t: { title: string }) => t.title).sort()).toEqual([
        'De Gimnasio',
        'De Panadería',
        'De la agencia',
      ]);
      expect(adminState.folders.find((f: { name: string }) => f.name === 'Gimnasio')).toMatchObject({
        executiveName: 'Lucía',
        planName: 'Plan ejecución + creatividades',
        cycleStart: luciaClient.contactDay,
      });
    });

    it('un ejecutivo no puede tocar tareas ni carpetas de otro', async () => {
      await newTask(marcoToken, { folderId: luciaClient.id }).expect(403);

      const { body: task } = await newTask(luciaToken, { folderId: luciaClient.id }).expect(201);
      await api().patch(`/api/tasks/${task.id}`).set(auth(marcoToken)).send({ title: 'x' }).expect(403);
      await api().delete(`/api/tasks/${task.id}`).set(auth(marcoToken)).expect(403);
      await api()
        .post(`/api/tasks/${task.id}/move`)
        .set(auth(luciaToken))
        .send({ folderId: marcoClient.id, column: 'red' })
        .expect(403);

      // El admin no ve (ni toca) la General de un ejecutivo.
      const { body: general } = await newTask(luciaToken, { folderId: 'general' }).expect(201);
      await api().patch(`/api/tasks/${general.id}`).set(auth(adminToken)).send({ title: 'x' }).expect(403);
    });

    it('mover cambia columna, color y orden, y pasar a Hecho conserva el último color', async () => {
      const a = (await newTask(marcoToken, { folderId: marcoClient.id, title: 'A' }).expect(201)).body;
      const b = (await newTask(marcoToken, { folderId: marcoClient.id, title: 'B', column: 'red' }).expect(201)).body;

      const moved = await api()
        .post(`/api/tasks/${a.id}/move`)
        .set(auth(marcoToken))
        .send({ folderId: 'general', column: 'red', order: [b.id, a.id] })
        .expect(201);
      expect(moved.body).toMatchObject({ folderId: 'general', column: 'red', priority: 'red', position: 1 });

      const done = await api()
        .post(`/api/tasks/${a.id}/move`)
        .set(auth(marcoToken))
        .send({ folderId: 'general', column: 'done' })
        .expect(201);
      expect(done.body).toMatchObject({ column: 'done', priority: 'red' });

      const tasks = (await state(marcoToken)).tasks;
      expect(tasks.find((t: { id: string }) => t.id === b.id).position).toBe(0);
    });

    it('editar y quitar la fecha', async () => {
      const { body: task } = await newTask(marcoToken, { folderId: marcoClient.id, dueDate: '2030-01-15' }).expect(201);
      expect(task.dueDate).toBe('2030-01-15');
      const { body: updated } = await api()
        .patch(`/api/tasks/${task.id}`)
        .set(auth(marcoToken))
        .send({ title: 'Nuevo', notes: 'nota', dueDate: null })
        .expect(200);
      expect(updated).toMatchObject({ title: 'Nuevo', notes: 'nota', dueDate: null });
    });

    it('los clientes dados de baja desaparecen del tablero', async () => {
      await newTask(marcoToken, { folderId: marcoClient.id }).expect(201);
      await api().delete(`/api/clients/${marcoClient.id}`).set(auth(marcoToken)).expect(204);
      const s = await state(marcoToken);
      expect(s.folders).toEqual([]);
      expect(s.tasks).toEqual([]);
      await newTask(marcoToken, { folderId: marcoClient.id }).expect(400);
    });
  });

  describe('tareas automáticas', () => {
    it('las de la agencia se generan según el plan y el ciclo de cobro de cada cliente', async () => {
      const forAll = planTask({ title: 'Revisión de {mes}', day: 15 });
      const onlyCreatives = planTask({ planId: creatividades.id, title: 'Creatividades', day: 1 });
      await api().put('/api/plan-tasks').set(auth(adminToken)).send({ tasks: [forAll, onlyCreatives] }).expect(200);

      // El ciclo arrancó hace 5 días: el día 15 cae dentro de 9 días y el
      // próximo "Día 1" es el arranque del ciclo siguiente.
      const marcoTasks = await generated(marcoClient.id);
      expect(marcoTasks.map((t) => t.dueDate)).toContain(addDays(today(), 9));
      expect(marcoTasks.every((t) => t.title.startsWith('Revisión de '))).toBe(true);
      expect(marcoTasks.every((t) => t.column === 'yellow' && t.recurrenceKey?.startsWith(`${marcoClient.id}/`))).toBe(true);

      const luciaTitles = (await generated(luciaClient.id)).map((t) => t.title);
      expect(luciaTitles).toContain('Creatividades');
    });

    it('no se genera nada para clientes sin plan, inactivos o sin día de inicio', async () => {
      const sinPlan = await ds.getRepository(Client).save({ executiveId: marco.id, name: 'Sin plan', active: true, contactDay: today() });
      const inactivo = await clientWithCycle(marco, ejecucion, 'Inactivo');
      await ds.getRepository(Client).update(inactivo.id, { active: false });
      const sinDia = await ds.getRepository(Client).save({ executiveId: marco.id, name: 'Sin día', active: true, contactDay: null });
      await ds.getRepository(Cobro).save({ clientId: sinDia.id, planId: ejecucion.id });

      await api().put('/api/plan-tasks').set(auth(adminToken)).send({ tasks: [planTask({ repeat: 'daily', day: 1 })] }).expect(200);

      for (const client of [sinPlan, inactivo, sinDia]) expect(await generated(client.id)).toEqual([]);
      expect((await generated(marcoClient.id)).length).toBeGreaterThan(0);
    });

    it('las de un ejecutivo aplican solo a su cartera y a su General', async () => {
      const mine = planTask({ title: 'Llamar a {mes}', repeat: 'weekly', day: 1 });
      const myGeneral = planTask({ general: true, title: 'Reunión de equipo', repeat: 'weekly', day: 3 });
      await api().put('/api/plan-tasks').set(auth(marcoToken)).send({ tasks: [mine, myGeneral] }).expect(200);

      expect((await generated(marcoClient.id)).length).toBeGreaterThan(0);
      expect(await generated(luciaClient.id)).toEqual([]);
      const generalTasks = await ds.getRepository(Task).findBy({ clientId: null as unknown as string, executiveId: marco.id });
      expect(generalTasks.length).toBeGreaterThan(0);
      expect(generalTasks.every((t) => t.title === 'Reunión de equipo')).toBe(true);

      // Lucía ve las de la agencia pero no las de Marco.
      const { body: luciaPlanTasks } = await api().get('/api/plan-tasks').set(auth(luciaToken)).expect(200);
      expect(luciaPlanTasks).toEqual([]);
    });

    it('un ejecutivo no puede pisar las de la agencia', async () => {
      const agency = planTask();
      await api().put('/api/plan-tasks').set(auth(adminToken)).send({ tasks: [agency] }).expect(200);
      await api()
        .put('/api/plan-tasks')
        .set(auth(marcoToken))
        .send({ tasks: [{ ...agency, title: 'Hackeada' }] })
        .expect(403);
      // Y guardar las suyas no borra las de la agencia.
      await api().put('/api/plan-tasks').set(auth(marcoToken)).send({ tasks: [] }).expect(200);
      const { body } = await api().get('/api/plan-tasks').set(auth(marcoToken)).expect(200);
      expect(body.map((t: PlanTask) => t.title)).toEqual(['Revisión de {mes}']);
    });

    it('una tarea borrada no vuelve a aparecer, y al cambiar el plan se recalculan las futuras', async () => {
      const agency = planTask({ planId: ejecucion.id, repeat: 'weekly', day: 1 });
      await api().put('/api/plan-tasks').set(auth(adminToken)).send({ tasks: [agency] }).expect(200);
      const [first] = await generated(marcoClient.id);
      await api().delete(`/api/tasks/${first.id}`).set(auth(marcoToken)).expect(204);

      // La sincronización diaria no la vuelve a crear.
      await app.get(RecurringService).syncAll();
      expect((await generated(marcoClient.id)).map((t) => t.dueDate)).not.toContain(first.dueDate);

      // Pasa a otro plan: las futuras del plan anterior se van.
      await api().patch(`/api/clients/${marcoClient.id}/cobro`).set(auth(marcoToken)).send({ planId: creatividades.id }).expect(200);
      const future = (await generated(marcoClient.id)).filter((t) => t.dueDate! > today());
      expect(future).toEqual([]);
    });

    it('al dar de baja un cliente se borran sus automáticas futuras', async () => {
      await api().put('/api/plan-tasks').set(auth(adminToken)).send({ tasks: [planTask({ repeat: 'weekly', day: 1 })] }).expect(200);
      expect((await generated(marcoClient.id)).length).toBeGreaterThan(0);
      await api().delete(`/api/clients/${marcoClient.id}`).set(auth(marcoToken)).expect(204);
      expect((await generated(marcoClient.id)).filter((t) => t.dueDate! > today())).toEqual([]);
    });

    it('rechaza planes inexistentes y días de semana inválidos', async () => {
      await api().put('/api/plan-tasks').set(auth(adminToken)).send({ tasks: [planTask({ planId: 9999 })] }).expect(400);
      await api().put('/api/plan-tasks').set(auth(adminToken)).send({ tasks: [planTask({ repeat: 'weekly', day: 9 })] }).expect(400);
    });
  });

  describe('migración del To Do viejo', () => {
    it('pasa client_todos al tablero y renombra la tabla', async () => {
      await ds.query(
        `CREATE TABLE client_todos (id uuid PRIMARY KEY, "clientId" uuid NOT NULL, text varchar NOT NULL, done boolean NOT NULL DEFAULT false, "createdAt" timestamptz NOT NULL DEFAULT now())`,
      );
      const pending = randomUUID();
      const done = randomUUID();
      await ds.query(`INSERT INTO client_todos (id, "clientId", text, done) VALUES ($1, $2, 'Pendiente', false), ($3, $2, 'Hecha', true)`, [
        pending,
        marcoClient.id,
        done,
      ]);

      await app.get(ClientTodosMigration).onApplicationBootstrap();

      const tasks = await generated(marcoClient.id);
      expect(tasks.find((t) => t.id === pending)).toMatchObject({ title: 'Pendiente', column: 'yellow' });
      expect(tasks.find((t) => t.id === done)).toMatchObject({ title: 'Hecha', column: 'done' });
      // Ya no hay nada que migrar: correrla de nuevo no hace nada.
      await app.get(ClientTodosMigration).onApplicationBootstrap();
      expect((await generated(marcoClient.id)).length).toBe(2);
    });
  });
});
