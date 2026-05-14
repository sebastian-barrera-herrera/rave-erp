// ─────────────────────────────────────────────────────────────────────────────
// MemoryCacheService — cache TTL en memoria, sin dependencias externas
// ─────────────────────────────────────────────────────────────────────────────
// Uso:
//   await cache.wrap('roles:list:' + companyId, 30_000, () => repo.find(...))
//   cache.invalidatePrefix('roles:list:' + companyId)
//
// Pensado para datos de lectura frecuente y baja volatilidad (roles, permisos,
// categorías). Si más adelante se mueve a Redis, esta API se puede mantener.
// ─────────────────────────────────────────────────────────────────────────────
import { Injectable } from '@nestjs/common';

interface Entry<T> {
  value: T;
  expiresAt: number;
}

@Injectable()
export class MemoryCacheService {
  private readonly store = new Map<string, Entry<any>>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  invalidatePrefix(prefix: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }

  async wrap<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;
    const value = await fetcher();
    this.set(key, value, ttlMs);
    return value;
  }
}
