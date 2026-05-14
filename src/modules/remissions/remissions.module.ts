import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemissionsService } from './remissions.service';
import { RemissionsController } from './remissions.controller';
import { Remission } from './entities/remission.entity';
import { RemissionItem } from './entities/remission-item.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { WarehousesModule } from '../warehouses/warehouses.module';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Remission, RemissionItem, Customer, Product, InventoryMovement]),
    WarehousesModule,
    PdfModule,
  ],
  providers: [RemissionsService],
  controllers: [RemissionsController],
  exports: [RemissionsService],
})
export class RemissionsModule {}
