import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request } from 'express';
import { Readable } from 'stream';

/**
 * Envuelve la respuesta de los handlers JSON en `{ success, data, timestamp }`
 * para que el frontend tenga un contrato consistente.
 *
 * Excluye:
 *   - Rutas de Swagger (`/api/docs*`) — devuelven HTML/JS y se rompían al
 *     intentar envolverlas, dejando la UI de docs en blanco.
 *   - Respuestas tipo Buffer / Stream / null — endpoints de PDF y descargas
 *     binarias no deben verse alterados.
 *   - Respuestas que ya vienen con la forma `{ success, data }` (idempotencia).
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const path = req?.originalUrl ?? req?.url ?? '';

    // Swagger UI y su spec — se sirven como HTML/JS/JSON crudo. Envolverlas
    // rompe la UI ("data": "<html>...</html>") y la deja en blanco.
    const isSwagger = path.startsWith('/api/docs') || path.startsWith('/docs');

    return next.handle().pipe(
      map((data) => {
        if (isSwagger) return data;
        if (data === undefined || data === null) {
          return { success: true, data: null, timestamp: new Date().toISOString() };
        }
        // PDFs / descargas binarias — los endpoints que devuelven Buffer o
        // Stream NO deben envolverse, el cliente espera el binario crudo.
        if (Buffer.isBuffer(data)) return data;
        if (data instanceof Readable) return data;
        // Idempotencia: si por alguna razón un handler ya retornó la forma
        // envuelta, no la duplicamos.
        if (
          typeof data === 'object' &&
          'success' in data &&
          'data' in data &&
          'timestamp' in data
        ) {
          return data;
        }
        return {
          success: true,
          data,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
