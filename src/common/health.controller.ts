// ─────────────────────────────────────────────────────────────────────────────
// Health check público — sin auth
// ─────────────────────────────────────────────────────────────────────────────
// Útil para:
//   - Render / Netlify health checks automatizados
//   - Diagnóstico manual: abrir en navegador para ver si la DB responde
//   - Distinguir entre "el servidor está vivo pero la DB no responde" y
//     "el servidor no responde" (que antes daban el mismo mensaje 502 desde
//     el proxy de Render).
//
// Endpoint excluido del TenantMiddleware y SubscriptionGuard.
// ─────────────────────────────────────────────────────────────────────────────
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiExcludeController()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check() {
    const startedAt = Date.now();
    let db: 'ok' | 'error' = 'error';
    let dbError: string | null = null;
    let tableCount = 0;
    let lastMigration: string | null = null;

    try {
      // SELECT 1 — la prueba mínima de que la conexión funciona.
      await this.dataSource.query('SELECT 1');
      db = 'ok';

      const tables: Array<{ count: string }> = await this.dataSource.query(
        `SELECT COUNT(*)::int as count FROM information_schema.tables WHERE table_schema = 'public'`,
      );
      tableCount = Number(tables[0]?.count ?? 0);

      // Si existe la tabla `migrations` de TypeORM, devolvemos la última.
      const hasMigrationsTable: Array<{ count: string }> = await this.dataSource.query(
        `SELECT COUNT(*)::int as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'migrations'`,
      );
      if (Number(hasMigrationsTable[0]?.count ?? 0) > 0) {
        const last: Array<{ name: string }> = await this.dataSource.query(
          `SELECT name FROM migrations ORDER BY id DESC LIMIT 1`,
        );
        lastMigration = last[0]?.name ?? null;
      }
    } catch (err: any) {
      dbError = err?.message ?? String(err);
    }

    return {
      status: db === 'ok' ? 'ok' : 'degraded',
      db,
      db_error: dbError,
      tables: tableCount,
      last_migration: lastMigration,
      uptime_seconds: Math.round(process.uptime()),
      response_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    };
  }
}
