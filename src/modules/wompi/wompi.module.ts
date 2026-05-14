// ─────────────────────────────────────────────────────────────────────────────
// WompiModule
// ─────────────────────────────────────────────────────────────────────────────
// Módulo NestJS que agrupa todo lo relacionado con la pasarela Wompi:
//   - WompiService:    lógica de negocio (HTTP a Wompi, validación de firma,
//                      activación de suscripción al recibir APPROVED)
//   - WompiController: rutas REST `/api/wompi/*`
//   - WompiTransaction: entidad TypeORM persistida en `wompi_transactions`
//
// Dependencias:
//   - TypeOrmModule.forFeature([WompiTransaction, Company])
//     necesarias para que el repositorio inyectado funcione.
//   - SharedModule (Global): provee MailService.
// ─────────────────────────────────────────────────────────────────────────────
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WompiService } from './wompi.service';
import { WompiController } from './wompi.controller';
import { WompiTransaction } from './entities/wompi-transaction.entity';
import { Company } from '../companies/entities/company.entity';

@Module({
  imports: [TypeOrmModule.forFeature([WompiTransaction, Company])],
  providers: [WompiService],
  controllers: [WompiController],
  exports: [WompiService],
})
export class WompiModule {}
