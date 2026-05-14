// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap del servidor NestJS
// ─────────────────────────────────────────────────────────────────────────────
// - Crea la aplicación con soporte para "raw body" (lo necesita el webhook
//   de Stripe para validar la firma).
// - Aplica seguridad (Helmet), CORS, validación global y filtros de error.
// - Monta la documentación Swagger interactiva en /api/docs.
// ─────────────────────────────────────────────────────────────────────────────
import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, ClassSerializerInterceptor, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { types as pgTypes } from 'pg';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos `timestamp without time zone` de Postgres → siempre se interpretan
// como UTC. Sin esto, node-postgres convierte el valor a la zona horaria del
// servidor (por ej. America/Bogota en local, UTC en prod) y arrastraba 5 h
// de desfase a la UI. Con `+Z` el frontend lo recibe siempre como ISO UTC y
// aplica America/Bogota a la hora de mostrar.
// ─────────────────────────────────────────────────────────────────────────────
const PG_TIMESTAMP_OID = 1114;
pgTypes.setTypeParser(PG_TIMESTAMP_OID, (str: string | null) =>
  str === null ? null : new Date(str.includes('+') || str.endsWith('Z') ? str : `${str}Z`),
);
// Forzar TZ del proceso a UTC también — `new Date()` (creado por
// @CreateDateColumn) ya se serializa en ISO Z, pero esto evita sorpresas con
// strings sin Z generados manualmente en otros lugares.
process.env.TZ = 'UTC';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // Required for Stripe webhook signature validation
  });

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const prefix = config.get<string>('API_PREFIX', 'api');

  // ───────────────────────────────────────────────────────────────────────────
  // CORS allowlist tolerante
  // ───────────────────────────────────────────────────────────────────────────
  // El navegador envía `Origin` SIN trailing slash (ej. https://raverp.netlify.app).
  // Si `FRONTEND_URL` está configurada con `/` final, el match falla y CORS
  // bloquea silenciosamente — exactamente el síntoma típico de "el login no
  // funciona en producción" sin error visible en backend.
  // Normalizamos quitando la `/` final y permitimos lista separada por coma
  // para soportar previews de Netlify o dominios staging.
  // ───────────────────────────────────────────────────────────────────────────
  const stripSlash = (s: string) => s.replace(/\/+$/, '').trim();
  const corsRaw =
    config.get<string>('FRONTEND_URL') ?? 'https://raverp.netlify.app';
  const allowedOrigins = corsRaw
    .split(',')
    .map(stripSlash)
    .filter(Boolean);

  app.use(helmet({
    // Swagger UI usa scripts inline; permitirlos solo en /api/docs.
    contentSecurityPolicy: false,
  }));

  // El default de express es 100KB y eso revienta cuando el usuario sube su
  // foto de perfil o el logo de la empresa como base64 (los dataURLs típicos
  // de 200–400 KB ya rebotaban con "PayloadTooLargeError"). 5MB nos da margen
  // para fotos de cámara sin abusar.
  app.use(json({ limit: '5mb' }));
  app.use(urlencoded({ extended: true, limit: '5mb' }));

  app.enableCors({
    origin: (origin, cb) => {
      // Peticiones server-to-server o curl no traen Origin → permitir.
      if (!origin) return cb(null, true);
      const normalized = stripSlash(origin);
      if (allowedOrigins.includes(normalized)) return cb(null, true);
      // Si tu dominio principal va con `www`, también lo aceptamos sin él
      // y viceversa para evitar el clásico misconfig de "uno funciona y el
      // otro no" tras configurar el dominio en Netlify.
      const withWww = `https://www.${normalized.replace(/^https?:\/\//, '')}`;
      const withoutWww = normalized.replace(/^https?:\/\/www\./, 'https://');
      if (allowedOrigins.includes(withWww) || allowedOrigins.includes(withoutWww)) {
        return cb(null, true);
      }
      return cb(new Error(`Origin ${origin} no autorizado por CORS`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix(prefix);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  // ClassSerializerInterceptor (interno) aplica @Exclude/@Expose sobre las
  // entidades que retornen los handlers; TransformInterceptor (externo)
  // envuelve el resultado ya sanitizado en { success, data, timestamp }.
  app.useGlobalInterceptors(
    new TransformInterceptor(),
    new ClassSerializerInterceptor(app.get(Reflector), {
      excludeExtraneousValues: false,
      enableImplicitConversion: true,
    }),
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Swagger / OpenAPI
  // ───────────────────────────────────────────────────────────────────────────
  // Disponible en: http://localhost:{PORT}/{API_PREFIX}/docs
  // Permite probar todos los endpoints, incluido el flujo de Wompi y Stripe.
  // El JSON crudo de la spec queda en /{API_PREFIX}/docs-json
  // ───────────────────────────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ERP SaaS API')
    .setDescription(
      'API REST multi-tenant del ERP SaaS — incluye módulos de ventas, '
      + 'inventario, cotizaciones, deudas, soporte, reportes y pasarelas de pago '
      + '(Stripe internacional + Wompi Colombia).',
    )
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT obtenido en /api/auth/login',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Autenticación, registro e invitaciones')
    .addTag('Companies', 'Gestión de empresas (multi-tenant) — incluye catálogo de países LATAM + España')
    .addTag('Users', 'Gestión de usuarios e invitaciones (admin)')
    .addTag('Customers', 'Clientes')
    .addTag('Products', 'Productos')
    .addTag('Warehouses', 'Bodegas y stock por bodega (con privatización vía is_sellable)')
    .addTag('Inventory', 'Movimientos de inventario por bodega')
    .addTag('Sales', 'Ventas (contado y crédito, con anticipo y bodega de origen)')
    .addTag('Remissions', 'Órdenes de salida (remisiones) con numeración por empresa')
    .addTag('Quotations', 'Cotizaciones')
    .addTag('Debts', 'Deudas / cuentas por cobrar')
    .addTag('Payments', 'Pagos a deudas')
    .addTag('Reports', 'Reportes y estadísticas (incluye comparativa por vendedor)')
    .addTag('PDF', 'Generación de PDF')
    .addTag('Roles', 'Roles personalizados')
    .addTag('Planner', 'Planeador diario — pendientes y visitas a clientes')
    .addTag('Subscriptions (Stripe)', 'Suscripciones SaaS — Stripe')
    .addTag('Wompi (Pasarela de Pago Colombia)', 'Suscripciones SaaS — Wompi')
    .addTag('Support', 'Tickets de soporte')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'ERP SaaS — API Docs',
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Verificación explícita de la conexión a la DB y conteo de tablas
  // ───────────────────────────────────────────────────────────────────────────
  // TypeORM se inicializa "perezosamente" y los logs no dejan claro si las
  // migraciones corrieron ni cuántas tablas hay. Esto da feedback inmediato
  // en producción: si la DB está vacía o si la conexión falla, se ve aquí.
  // ───────────────────────────────────────────────────────────────────────────
  const logger = new Logger('Bootstrap');
  try {
    const dataSource = app.get(DataSource);
    const dbResult: Array<{ count: string }> = await dataSource.query(
      `SELECT COUNT(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const tableCount = Number(dbResult[0]?.count ?? 0);
    const migrationsExecuted = await dataSource
      .query(
        `SELECT COUNT(*)::int as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'migrations'`,
      )
      .then((r: Array<{ count: string }>) => Number(r[0]?.count ?? 0) > 0);

    if (tableCount === 0) {
      logger.error(
        'DB conectada pero VACÍA — ninguna tabla en el schema public. ' +
          'Las migraciones no corrieron. Revisa DB_MIGRATIONS_RUN y los logs de migración arriba.',
      );
    } else if (!migrationsExecuted) {
      logger.warn(
        `DB tiene ${tableCount} tabla(s) pero no la tabla \`migrations\` de TypeORM. ` +
          `Puede ser una DB poblada manualmente. Activa DB_MIGRATIONS_RUN=true si quieres versionar.`,
      );
    } else {
      const migRows: Array<{ name: string }> = await dataSource.query(
        `SELECT name FROM migrations ORDER BY id DESC LIMIT 5`,
      );
      logger.log(
        `✅ DB OK — ${tableCount} tabla(s) en public. Última migración: ${migRows[0]?.name ?? '(ninguna)'}.`,
      );
    }
  } catch (err: any) {
    logger.error(
      `❌ Falló la verificación de DB: ${err?.message ?? err}. La app arrancará pero los endpoints fallarán.`,
    );
  }

  await app.listen(port);
  console.log(`🚀 ERP SaaS API running on http://localhost:${port}/${prefix}`);
  console.log(`📘 Swagger docs: http://localhost:${port}/${prefix}/docs`);
}

bootstrap();
