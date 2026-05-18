import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Return } from './entities/return.entity';
import { ReturnItem } from './entities/return-item.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Product } from '../products/entities/product.entity';
import { Debt } from '../debts/entities/debt.entity';
import { InventoryMovement } from '../inventory/entities/inventory-movement.entity';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { WarehousesModule } from '../warehouses/warehouses.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Return, ReturnItem, Sale, Product, Debt, InventoryMovement,
    ]),
    WarehousesModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
