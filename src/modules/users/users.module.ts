import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { UserDocument } from './entities/user-document.entity';
import { UserDocumentsService } from './user-documents.service';
import { CustomRole } from '../roles/entities/custom-role.entity';
import { Invitation } from '../auth/entities/invitation.entity';
import { Company } from '../companies/entities/company.entity';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserDocument, CustomRole, Invitation, Company]),
    PdfModule,
  ],
  providers: [UsersService, UserDocumentsService],
  controllers: [UsersController],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
