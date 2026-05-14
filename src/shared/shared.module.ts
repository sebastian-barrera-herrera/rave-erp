import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StripeService } from './services/stripe.service';
import { MailService } from './services/mail.service';
import { MemoryCacheService } from './services/cache.service';
import { Company } from '../modules/companies/entities/company.entity';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Company]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get('JWT_EXPIRES_IN', '15m') },
      }),
    }),
  ],
  providers: [StripeService, MailService, MemoryCacheService],
  exports: [StripeService, MailService, MemoryCacheService, JwtModule, TypeOrmModule],
})
export class SharedModule {}
