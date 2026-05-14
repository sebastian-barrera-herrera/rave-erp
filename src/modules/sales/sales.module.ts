import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { Sale } from './entities/sale.entity';
import { SaleItem } from './entities/sale-item.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Product } from '../products/entities/product.entity';
import { Debt } from '../debts/entities/debt.entity';
import { Payment } from '../payments/entities/payment.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { PdfModule } from '../pdf/pdf.module';
import { WarehousesModule } from '../warehouses/warehouses.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleItem, Customer, Product, Debt, Payment, InventoryMovement]),
    PdfModule,
    WarehousesModule,
  ],
  providers: [SalesService],
  controllers: [SalesController],
  exports: [SalesService],
})
export class SalesModule {}
