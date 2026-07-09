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

  // Planes de configuración: son las opciones del desplegable de cobros.
  // Se toman de los planes reales que figuran en la planilla de gestión.
  const planRepo = dataSource.getRepository(Plan);
  const defaultPlans = [
    { id: 1, name: 'Plan ejecución', price: 350 },
    { id: 2, name: 'Plan ejecución + creatividades', price: 490 },
    { id: 3, name: 'Plan ejecución + Bot', price: 550 },
  ];
  for (const plan of defaultPlans) {
    await planRepo.upsert(plan, ['id']);
  }

  // Mapea el monto USD pactado del cliente al plan de configuración
  // correspondiente. Los montos vienen como texto ("350", "350 + iva"),
  // así que se extrae el primer número y se busca el plan por precio.
  const planIdForUsd = (usd: string | null): number | null => {
    if (!usd) return null;
    const amount = Number((usd.match(/\d+/) ?? [])[0]);
    const match = defaultPlans.find((p) => p.price === amount);
    return match ? match.id : null;
  };

  // La planilla original sólo traía el día del mes de contacto (sin mes/año),
  // así que se arma una fecha concreta usando el mes y año actuales como base.
  // Es un valor provisorio hasta que se cargue la fecha real de cada cliente.
  const seedToday = new Date();
  const contactDateForDay = (day: number | null): string | null => {
    if (day == null) return null;
    const daysInMonth = new Date(seedToday.getFullYear(), seedToday.getMonth() + 1, 0).getDate();
    const safeDay = Math.min(day, daysInMonth);
    const mm = String(seedToday.getMonth() + 1).padStart(2, '0');
    const dd = String(safeDay).padStart(2, '0');
    return `${seedToday.getFullYear()}-${mm}-${dd}`;
  };

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

  // Clientes importados desde el sheet de gestión.
  // Cada fila trae: fan page y el plan contratado (tomado de la columna
  // "Observación"). El resto de columnas del sheet (país, quién cobra,
  // montos por mes) se guardan en `data`.
  const executiveRepo = dataSource.getRepository(Executive);
  const clientRepo = dataSource.getRepository(Client);
  const cobroRepo = dataSource.getRepository(Cobro);

  type SeedClient = {
    name: string;
    executive: string;
    fanpage: string | null;
    plan: string | null;
    contactDay: number | null;
    country: string;
    usd: string | null;
    collectedBy: string;
    months: Record<string, string>;
  };

  const sheetClients: SeedClient[] = [
    { name: 'Santiago Morales', executive: 'Fran Dávalos', fanpage: 'Ffon AR', plan: null, contactDay: 1, country: 'Argentina', usd: null, collectedBy: 'Fran Dávalos', months: {} },
    { name: 'Sebastian Behetti', executive: 'Fran Dávalos', fanpage: 'NutriBel - Centro de Nutrición Especializado', plan: 'Plan ejecucion + creatividades 490usd', contactDay: 3, country: 'Uruguay', usd: '490', collectedBy: 'VB', months: {} },
    { name: 'Mauricio Miguez', executive: 'Juanpi Alvarez', fanpage: 'Mh clean limpieza', plan: 'Plan ejecución 350usd', contactDay: 4, country: 'Argentina', usd: '350', collectedBy: 'Juanpi Alvarez', months: { Junio: '502.500' } },
    { name: 'Martin', executive: 'Donato Spadari', fanpage: 'Clippers Argentina', plan: 'Plan ejecución + creatividades 490 usd', contactDay: 4, country: 'Argentina', usd: '490', collectedBy: 'Donato Spadari', months: {} },
    { name: 'Geraldine', executive: 'Marco Calandra', fanpage: 'Mare Arquitectura', plan: 'Plan ejecución 350usd', contactDay: 4, country: 'Argentina', usd: '350', collectedBy: 'Marco Calandra', months: {} },
    { name: 'Eber Sendoya', executive: 'Cristian Ocampo', fanpage: 'Nexorprime. uy', plan: 'Plan ejecución 350usd', contactDay: 5, country: 'Uruguay', usd: '350', collectedBy: 'VB', months: {} },
    { name: 'Aba Bock', executive: 'Marco Calandra', fanpage: 'Autocrédito Expansión', plan: 'Plan ejecución 350usd + iva', contactDay: 9, country: 'Argentina', usd: '350 + iva', collectedBy: 'VB', months: { Junio: '572.595', Julio: '584.880' } },
    { name: 'Andrea Gonzalez', executive: 'Gonzalo De Andrade', fanpage: 'Alquimóvil', plan: 'Plan ejecución 350usd+ iva', contactDay: 9, country: 'Uruguay', usd: '350 + iva', collectedBy: 'VB', months: { Junio: '427 usd', Julio: '427 usd' } },
    { name: 'Ariana Di Gotti', executive: 'Bautista Torres', fanpage: 'Sea Muse', plan: 'Plan ejecución 350usd', contactDay: 11, country: 'Argentina', usd: '350', collectedBy: 'Bautista Torres', months: {} },
    { name: 'Barbara Guerrero', executive: 'Gonzalo De Andrade', fanpage: 'Engloba', plan: 'Plan ejecución 350usd', contactDay: 12, country: 'Argentina', usd: '350', collectedBy: 'Gonzalo De Andrade', months: { Junio: '498.750' } },
    { name: 'Nilda Cristaldo', executive: 'Fran Dávalos', fanpage: 'Rossvestidos21', plan: 'Plan ejecución + creatividades 490 usd', contactDay: 14, country: 'Argentina', usd: '490', collectedBy: 'Fran Dávalos', months: { Junio: '698.250' } },
    { name: 'Viviana', executive: 'Bautista Torres', fanpage: 'Lectura de compostaje', plan: 'Plan ejecución 350usd', contactDay: 15, country: 'Argentina', usd: '350', collectedBy: 'VB', months: {} },
    { name: 'Cristian Bolado', executive: 'Gonzalo De Andrade', fanpage: 'Estudiante Practico', plan: 'Plan ejecucion + creatividades 490usd', contactDay: 15, country: 'Argentina', usd: '490', collectedBy: 'VB', months: {} },
    { name: 'Dorcas Sanabria', executive: 'Cristian Ocampo', fanpage: 'Morpheus Sleep Clinic', plan: 'Plan ejecución 350usd', contactDay: 16, country: 'Paraguay', usd: '350', collectedBy: 'VB', months: { Junio: '350 usd', Julio: '350 usd' } },
    { name: 'Rodrigo Martinez', executive: 'Luciano Lopez', fanpage: 'Automotora_gm', plan: 'Plan ejecución 350usd', contactDay: 16, country: 'Uruguay', usd: '350', collectedBy: 'VB', months: { Junio: '350 usd', Julio: '350 usd' } },
    { name: 'Josefina Witkin Figueroa', executive: 'Justo Almeida', fanpage: 'El Ranquel', plan: 'Plan ejecución + Bot 550usd+ iva', contactDay: 19, country: 'Argentina', usd: '550', collectedBy: 'VB', months: { Junio: '616.192' } },
    { name: 'Anabela Medina', executive: 'Justo Almeida', fanpage: 'Lively Sublimados', plan: 'Plan ejecución 350usd', contactDay: 20, country: 'Argentina', usd: '350', collectedBy: 'Justo Almeida', months: {} },
    { name: 'Florencia Cabanillas', executive: 'Luciano Lopez', fanpage: 'Sweetflowersdecoparty', plan: 'Plan ejecución 350usd', contactDay: 21, country: 'Argentina', usd: '350', collectedBy: 'Luciano Lopez', months: { Junio: '512.750' } },
    { name: 'Ivan Jovanovich', executive: 'Justo Almeida', fanpage: 'Mas Color', plan: 'Plan ejecución 350usd', contactDay: 22, country: 'Argentina', usd: '350', collectedBy: 'VB', months: { Junio: '512.750' } },
    { name: 'Federico Guri', executive: 'Cristian Ocampo', fanpage: 'Real Haus', plan: 'Plan ejecución + creatividades 490 usd', contactDay: 23, country: 'Argentina', usd: '490', collectedBy: 'Cristian Ocampo', months: {} },
    { name: 'Florencia Osuna', executive: 'Cristian Ocampo', fanpage: 'El tenaz materiales', plan: 'Plan ejecucion 350usd', contactDay: 25, country: 'Argentina', usd: '350', collectedBy: 'Cristian Ocampo', months: { Abril: '493.500', Mayo: '493.500', Junio: '514.500' } },
    { name: 'Gonzalo Peloche', executive: 'Marco Calandra', fanpage: 'Vivir mejor Uruguay', plan: 'Plan ejecución 350usd + iva', contactDay: 26, country: 'Uruguay', usd: '350', collectedBy: 'VB', months: { Junio: '427 usd' } },
    { name: 'Federico', executive: 'Donato Spadari', fanpage: 'Sport Polis', plan: 'Plan ejecución 350usd', contactDay: 27, country: 'Uruguay', usd: '350', collectedBy: 'VB', months: {} },
    { name: 'Yanina Quinteros', executive: 'Marco Calandra', fanpage: 'Yap.personalizados', plan: 'Plan ejecución 350usd', contactDay: 29, country: 'Argentina', usd: '350', collectedBy: 'Marco Calandra', months: { Mayo: '493.500', Junio: '514.500' } },
    { name: 'Santiago Fiorito', executive: 'Gonzalo De Andrade', fanpage: 'Nutramani', plan: 'Plan ejecución + creatividades 490 usd', contactDay: 29, country: 'Argentina', usd: '490', collectedBy: 'Gonzalo De Andrade', months: {} },
    { name: 'Virginia Rivero', executive: 'Donato Spadari', fanpage: 'CasaCapsula', plan: 'Plan ejecución 350usd', contactDay: 29, country: 'Uruguay', usd: '350', collectedBy: 'Donato Spadari', months: {} },
  ];

  for (const row of sheetClients) {
    let executive = await executiveRepo.findOne({ where: { name: row.executive } });
    if (!executive) {
      executive = await executiveRepo.save(executiveRepo.create({ name: row.executive }));
      console.log(`Ejecutivo creado: ${executive.name}`);
    }

    // País y quién cobra ahora son columnas propias. En `data` sólo
    // queda el desglose de cobros por mes, que no es un dato estático del cliente.
    const data: Record<string, unknown> = {
      meses: row.months,
    };

    const existing = await clientRepo.findOne({
      where: { name: row.name, executiveId: executive.id },
    });
    let client: Client;
    if (existing) {
      existing.fanpage = row.fanpage;
      existing.plan = row.plan;
      existing.country = row.country;
      existing.collectedBy = row.collectedBy;
      existing.contactDay = contactDateForDay(row.contactDay);
      existing.data = data;
      client = await clientRepo.save(existing);
      console.log(`Cliente actualizado: ${row.name} (${row.executive})`);
    } else {
      client = await clientRepo.save(
        clientRepo.create({
          executiveId: executive.id,
          name: row.name,
          fanpage: row.fanpage,
          plan: row.plan,
          country: row.country,
          collectedBy: row.collectedBy,
          active: true,
          contactDay: contactDateForDay(row.contactDay),
          data,
        }),
      );
      console.log(`Cliente creado: ${row.name} (${row.executive})`);
    }

    // El cobro de cada cliente apunta al plan de configuración según su monto,
    // así el desplegable ya queda con la opción correcta seleccionada.
    const planId = planIdForUsd(row.usd);
    let cobro = await cobroRepo.findOne({ where: { clientId: client.id } });
    if (!cobro) cobro = cobroRepo.create({ clientId: client.id });
    cobro.planId = planId;
    await cobroRepo.save(cobro);
  }

  // Un perfil de login por cada ejecutivo.
  // Convención: email/contraseña basados en el primer nombre (sin acentos),
  // contraseña = <primerNombre>123. Ej: "María González" -> maria@empresa.com / maria123.
  const executives = await executiveRepo.find();

  // Slug del primer nombre: minúsculas, sin acentos, solo letras/números.
  const firstNameSlug = (fullName: string): string =>
    (fullName.trim().split(/\s+/)[0] ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  // Emails ya en uso (incluye el admin) para evitar colisiones.
  const usedEmails = new Set((await userRepo.find()).map((u) => u.email.toLowerCase()));

  for (const exec of executives) {
    const existing = await userRepo.findOneBy({ executiveId: exec.id });
    if (existing) {
      console.log(`Ejecutivo "${exec.name}" ya tiene perfil (${existing.email}), no se modifica.`);
      continue;
    }

    const slug = firstNameSlug(exec.name);
    if (!slug) {
      console.warn(`Ejecutivo "${exec.name}" sin nombre válido, se omite.`);
      continue;
    }

    // El nombre define la contraseña; el email se desambigua si colisiona.
    const password = `${slug}123`;
    let email = `${slug}@empresa.com`;
    let suffix = 2;
    while (usedEmails.has(email.toLowerCase())) {
      email = `${slug}${suffix}@empresa.com`;
      suffix += 1;
    }
    usedEmails.add(email.toLowerCase());

    await userRepo.save(
      userRepo.create({
        name: exec.name,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: UserRole.EJECUTIVO,
        executiveId: exec.id,
      }),
    );
    console.log(`Ejecutivo creado: ${exec.name} -> ${email} / ${password}`);
  }

  await dataSource.destroy();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
