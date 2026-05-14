import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './modules/auth/auth.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ProductsModule } from './modules/products/products.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SalesModule } from './modules/sales/sales.module';
import { DebtsModule } from './modules/debts/debts.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ReportsModule } from './modules/reports/reports.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { RolesModule } from './modules/roles/roles.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { SupportModule } from './modules/support/support.module';
import { WompiModule } from './modules/wompi/wompi.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { RemissionsModule } from './modules/remissions/remissions.module';
import { PlannerModule } from './modules/planner/planner.module';
import { SharedModule } from './shared/shared.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'postgres',
        url: process.env.DB_URL,
        autoLoadEntities: true,
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
        // ConfigService devuelve strings ("false" es truthy), así que
        // comparamos explícitamente contra 'true' para evitar que
        // synchronize quede activo y choque con las migraciones.
        synchronize: cfg.get<string>('DB_SYNC') === 'true',
        // Ejecuta migraciones pendientes al arrancar. Sin esto el usuario
        // tendría que correr `npm run migration:run` a mano y un constraint
        // pendiente como el de `sales.invoice_number` lo seguiría bloqueando.
        migrationsRun: cfg.get<string>('DB_MIGRATIONS_RUN', 'true') !== 'false',
        logging: cfg.get<string>('DB_LOGGING') === 'true',
        ssl: { rejectUnauthorized: false },
        // Fija la sesión de Postgres a UTC para que los `timestamp without
        // time zone` se devuelvan como ISO con offset Z. Antes la ausencia
        // de esto hacía que TypeORM interpretara el timestamp en la zona
        // local del servidor → en el frontend la hora salía corrida.
        extra: { options: '-c timezone=UTC' },
      }),
    }),

    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    SharedModule,
    AuthModule,
    CompaniesModule,
    UsersModule,
    RolesModule,
    CustomersModule,
    ProductsModule,
    WarehousesModule,
    InventoryModule,
    SalesModule,
    RemissionsModule,
    PlannerModule,
    DebtsModule,
    PaymentsModule,
    ReportsModule,
    PdfModule,
    SubscriptionsModule,
    QuotationsModule,
    SupportModule,
    WompiModule,
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'api/auth/login', method: RequestMethod.POST },
        { path: 'api/auth/register', method: RequestMethod.POST },
        { path: 'api/auth/refresh', method: RequestMethod.POST },
        { path: 'api/auth/invitation/(.*)', method: RequestMethod.GET },
        { path: 'api/auth/accept-invitation', method: RequestMethod.POST },
        { path: 'api/subscriptions/webhook', method: RequestMethod.POST },
        { path: 'api/wompi/webhook', method: RequestMethod.POST },
        { path: 'api/docs', method: RequestMethod.GET },
        { path: 'api/docs/(.*)', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
