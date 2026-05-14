import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WarehousesService } from './warehouses.service';
import { WarehousesController } from './warehouses.controller';
import { Warehouse } from './entities/warehouse.entity';
import { WarehouseStock } from './entities/warehouse-stock.entity';
import { Product } from '../products/entities/product.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Warehouse, WarehouseStock, Product, InventoryMovement]),
  ],
  providers: [WarehousesService],
  controllers: [WarehousesController],
  exports: [WarehousesService, TypeOrmModule],
})
export class WarehousesModule {}
