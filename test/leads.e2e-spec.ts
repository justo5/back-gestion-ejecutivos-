import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createHmac, randomUUID } from 'crypto';
import { DataType, newDb } from 'pg-mem';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { ENTITIES } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { AuthModule } from '../src/auth/auth.module';
import { ClientsModule } from '../src/clients/clients.module';
import { LeadsModule } from '../src/leads/leads.module';
import { Lead } from '../src/leads/lead.entity';
import { Plan } from '../src/cobros/plan.entity';
import { Executive } from '../src/executives/executive.entity';
import { Client } from '../src/clients/client.entity';
import { Cobro } from '../src/cobros/cobro.entity';

const SECRET = 'test-secret-de-al-menos-32-caracteres-1234';
const WEBHOOK = '/api/webhooks/vb';

// Postgres en memoria (pg-mem): los tests no necesitan una base levantada.
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

function sign(rawBody: string, ts = Math.floor(Date.now() / 1000), secret = SECRET) {
  const sig = 'sha256=' + createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return { 'x-vb-timestamp': String(ts), 'x-vb-signature': sig };
}

function aplicacion(overrides: Record<string, unknown> = {}) {
  return {
    evento: 'aplicacion.creada',
    id: 42,
    createdAt: '2026-10-06T18:49:07.982Z',
    plan: 'Plan de Captación 30 días',
    nombre: 'Ana',
    apellido: 'Pérez',
    contacto: '@ana',
    whatsapp: '+598 99 123 456',
    rubro: 'estética',
    inversion: '300-700',
    consentimientoAt: '2026-10-06T18:49:07.982Z',
    utm: { source: 'instagram', medium: null, campaign: null, content: null, term: null },
    ...overrides,
  };
}

describe('Leads (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let marcoToken: string;
  let lucia: Executive;
  let marco: Executive;
  let plan: Plan;

  // Manda exactamente el string firmado como body, sin que supertest lo re-serialice.
  const postWebhook = (rawBody: string, headers: Record<string, string> = sign(rawBody)) =>
    request(app.getHttpServer())
      .post(WEBHOOK)
      .set('content-type', 'application/json')
      .set(headers)
      .send(rawBody);

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    process.env.VB_WEBHOOK_SECRET = SECRET;
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
        LeadsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    configureApp(app);
    await app.init();

    lucia = await ds.getRepository(Executive).save({ name: 'Lucía' });
    marco = await ds.getRepository(Executive).save({ name: 'Marco' });
    // Nombre con otras mayúsculas y espacios de más: igual tiene que matchear.
    plan = await ds.getRepository(Plan).save({ name: '  plan de captación   30 DÍAS ', price: 350 });

    const jwt = app.get(JwtService);
    adminToken = await jwt.signAsync({ sub: randomUUID(), email: 'admin@x.com', role: 'admin', executiveId: null });
    marcoToken = await jwt.signAsync({ sub: randomUUID(), email: 'marco@x.com', role: 'ejecutivo', executiveId: marco.id });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    process.env.VB_WEBHOOK_SECRET = SECRET;
    await ds.getRepository(Lead).createQueryBuilder().delete().execute();
  });

  describe('POST /api/webhooks/vb', () => {
    it('con firma válida guarda el lead y resuelve el plan por nombre', async () => {
      const res = await postWebhook(JSON.stringify(aplicacion()));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });

      const leads = await ds.getRepository(Lead).find();
      expect(leads).toHaveLength(1);
      expect(leads[0]).toMatchObject({
        externalId: 42,
        source: 'landing-vb',
        nombre: 'Ana',
        apellido: 'Pérez',
        inversion: '300-700',
        planName: 'Plan de Captación 30 días',
        planId: plan.id,
        status: 'nuevo',
        executiveId: null,
      });
    });

    it('deja planId en null si el nombre no coincide con ningún plan', async () => {
      await postWebhook(JSON.stringify(aplicacion({ plan: 'Plan inexistente' }))).expect(200);
      const [lead] = await ds.getRepository(Lead).find();
      expect(lead.planId).toBeNull();
      expect(lead.planName).toBe('Plan inexistente');
    });

    it('firma inválida → 401', async () => {
      const raw = JSON.stringify(aplicacion());
      await postWebhook(raw, sign(raw, undefined, 'otro-secreto-de-al-menos-32-caracteres-xx')).expect(401);
      await postWebhook(raw, { 'x-vb-timestamp': '1', 'x-vb-signature': 'sha256=abc' }).expect(401);
      await postWebhook(raw, {}).expect(401);
      expect(await ds.getRepository(Lead).count()).toBe(0);
    });

    it('body distinto al firmado → 401', async () => {
      const raw = JSON.stringify(aplicacion());
      await postWebhook(JSON.stringify(aplicacion({ nombre: 'Otra' })), sign(raw)).expect(401);
    });

    it('timestamp viejo → 401', async () => {
      const raw = JSON.stringify(aplicacion());
      await postWebhook(raw, sign(raw, Math.floor(Date.now() / 1000) - 301)).expect(401);
    });

    it('sin secreto configurado → 503', async () => {
      delete process.env.VB_WEBHOOK_SECRET;
      const raw = JSON.stringify(aplicacion());
      await postWebhook(raw).expect(503);
    });

    it('inversion "cero" (opción "Nada") → 200 y se guarda', async () => {
      await postWebhook(JSON.stringify(aplicacion({ inversion: 'cero' }))).expect(200);
      const [lead] = await ds.getRepository(Lead).find();
      expect(lead.inversion).toBe('cero');
    });

    it('acepta utm con todos los campos en null o sin utm', async () => {
      const utmNull = { source: null, medium: null, campaign: null, content: null, term: null };
      await postWebhook(JSON.stringify(aplicacion({ id: 1, utm: utmNull }))).expect(200);
      const { utm, ...sinUtm } = aplicacion({ id: 2 });
      await postWebhook(JSON.stringify(sinUtm)).expect(200);
      expect(await ds.getRepository(Lead).count()).toBe(2);
    });

    it('el 400 dice qué campo falló y por qué, sin datos personales', async () => {
      const res = await postWebhook(JSON.stringify(aplicacion({ inversion: 'mucha', nombre: 'x'.repeat(81) }))).expect(400);
      const text = JSON.stringify(res.body);
      expect(text.slice(0, 300)).toContain('inversion');
      expect(text).toContain('nombre');
      expect(text).not.toContain('mucha');
      expect(text).not.toContain('xxxx');
      expect(text).not.toContain('+598');
    });

    it('body inválido → 400', async () => {
      await postWebhook(JSON.stringify(aplicacion({ inversion: 'mucha' }))).expect(400);
      const { nombre, ...sinNombre } = aplicacion();
      await postWebhook(JSON.stringify(sinNombre)).expect(400);
      await postWebhook(JSON.stringify(aplicacion({ id: -1 }))).expect(400);
      expect(await ds.getRepository(Lead).count()).toBe(0);
    });

    it('el mismo externalId dos veces → 200 y un solo lead', async () => {
      await postWebhook(JSON.stringify(aplicacion())).expect(200);
      await postWebhook(JSON.stringify(aplicacion({ nombre: 'Reintento' }))).expect(200);
      const leads = await ds.getRepository(Lead).find();
      expect(leads).toHaveLength(1);
      expect(leads[0].nombre).toBe('Ana');
    });

    it('evento desconocido → 200 sin guardar nada', async () => {
      await postWebhook(JSON.stringify(aplicacion({ evento: 'aplicacion.borrada' }))).expect(200);
      expect(await ds.getRepository(Lead).count()).toBe(0);
    });
  });

  describe('panel', () => {
    let leadDeLucia: Lead;
    let leadDeMarco: Lead;

    beforeEach(async () => {
      await postWebhook(JSON.stringify(aplicacion({ id: 1 }))).expect(200);
      await postWebhook(JSON.stringify(aplicacion({ id: 2, nombre: 'Beto' }))).expect(200);
      const repo = ds.getRepository(Lead);
      leadDeLucia = await repo.findOneByOrFail({ externalId: 1 });
      leadDeMarco = await repo.findOneByOrFail({ externalId: 2 });
      await repo.update(leadDeLucia.id, { executiveId: lucia.id });
      await repo.update(leadDeMarco.id, { executiveId: marco.id });
    });

    it('sin token → 401', async () => {
      await request(app.getHttpServer()).get('/api/leads').expect(401);
    });

    it('el admin ve todos, con nombre de ejecutivo y plan', async () => {
      const res = await request(app.getHttpServer()).get('/api/leads').set(auth(adminToken)).expect(200);
      expect(res.body).toHaveLength(2);
      const beto = res.body.find((l: any) => l.externalId === 2);
      expect(beto.executive).toEqual({ id: marco.id, name: 'Marco' });
      expect(beto.plan).toMatchObject({ id: plan.id });

      const filtrado = await request(app.getHttpServer())
        .get(`/api/leads?executiveId=${lucia.id}`)
        .set(auth(adminToken))
        .expect(200);
      expect(filtrado.body.map((l: any) => l.externalId)).toEqual([1]);
    });

    it('un ejecutivo solo ve los suyos aunque pida otro executiveId', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/leads?executiveId=${lucia.id}`)
        .set(auth(marcoToken))
        .expect(200);
      expect(res.body.map((l: any) => l.externalId)).toEqual([2]);
    });

    it('un ejecutivo no edita leads de otro ni campos de admin', async () => {
      await request(app.getHttpServer())
        .patch(`/api/leads/${leadDeLucia.id}`)
        .set(auth(marcoToken))
        .send({ status: 'contactado' })
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/api/leads/${leadDeMarco.id}`)
        .set(auth(marcoToken))
        .send({ executiveId: lucia.id })
        .expect(403);

      const res = await request(app.getHttpServer())
        .patch(`/api/leads/${leadDeMarco.id}`)
        .set(auth(marcoToken))
        .send({ status: 'contactado', notes: 'Le escribí' })
        .expect(200);
      expect(res.body).toMatchObject({ status: 'contactado', notes: 'Le escribí' });
    });

    it('PATCH no acepta status convertido', async () => {
      await request(app.getHttpServer())
        .patch(`/api/leads/${leadDeMarco.id}`)
        .set(auth(adminToken))
        .send({ status: 'convertido' })
        .expect(400);
    });

    it('convert solo admin', async () => {
      await request(app.getHttpServer())
        .post(`/api/leads/${leadDeMarco.id}/convert`)
        .set(auth(marcoToken))
        .send({})
        .expect(403);
    });

    it('convert sin ejecutivo → 400', async () => {
      await ds.getRepository(Lead).update(leadDeMarco.id, { executiveId: null });
      await request(app.getHttpServer())
        .post(`/api/leads/${leadDeMarco.id}/convert`)
        .set(auth(adminToken))
        .send({})
        .expect(400);
    });

    it('convert crea el cliente y el cobro, marca el lead y repetir → 409', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/leads/${leadDeMarco.id}/convert`)
        .set(auth(adminToken))
        .send({ rubro: 'Estética' })
        .expect(201);
      expect(res.body.lead).toMatchObject({ status: 'convertido', clientId: res.body.client.id });

      const client = await ds.getRepository(Client).findOneByOrFail({ id: res.body.client.id });
      expect(client).toMatchObject({
        executiveId: marco.id,
        name: 'Beto Pérez',
        active: true,
        fanpage: '@ana',
        rubro: 'Estética',
      });
      expect(client.data).toMatchObject({
        whatsapp: '+598 99 123 456',
        inversion: '300-700',
        leadId: leadDeMarco.id,
        externalId: 2,
        source: 'landing-vb',
      });
      const cobro = await ds.getRepository(Cobro).findOneByOrFail({ clientId: client.id });
      expect(cobro.planId).toBe(plan.id);

      await request(app.getHttpServer())
        .post(`/api/leads/${leadDeMarco.id}/convert`)
        .set(auth(adminToken))
        .send({})
        .expect(409);
      expect(await ds.getRepository(Client).countBy({ executiveId: marco.id })).toBe(1);
    });

    it('convert sin plan no crea cobro', async () => {
      await ds.getRepository(Lead).update(leadDeLucia.id, { planId: null });
      const res = await request(app.getHttpServer())
        .post(`/api/leads/${leadDeLucia.id}/convert`)
        .set(auth(adminToken))
        .send({})
        .expect(201);
      expect(await ds.getRepository(Cobro).countBy({ clientId: res.body.client.id })).toBe(0);
    });
  });
});
