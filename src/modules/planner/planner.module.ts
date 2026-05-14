import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlannerService } from './planner.service';
import { PlannerController } from './planner.controller';
import { DailyPlan } from './entities/daily-plan.entity';
import { PlanTask } from './entities/plan-task.entity';
import { PlanVisit } from './entities/plan-visit.entity';
import { Customer } from '../customers/entities/customer.entity';
import { Company } from '../companies/entities/company.entity';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DailyPlan, PlanTask, PlanVisit, Customer, Company]),
    PdfModule,
  ],
  providers: [PlannerService],
  controllers: [PlannerController],
  exports: [PlannerService],
})
export class PlannerModule {}
