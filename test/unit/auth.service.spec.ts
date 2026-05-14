// import { Test, TestingModule } from '@nestjs/testing';
// import { jest } from '@jest/globals';
// import { getRepositoryToken } from '@nestjs/typeorm';
// import { JwtService } from '@nestjs/jwt';
// import { ConfigService } from '@nestjs/config';
// import { ConflictException, UnauthorizedException } from '@nestjs/common';
// import { AuthService } from '../../../src/modules/auth/auth.service';
// import { Company } from '../../../src/modules/companies/entities/company.entity';
// import { User } from '../../../src/modules/users/entities/user.entity';
// import { StripeService } from '../../../src/shared/services/stripe.service';
// import * as bcrypt from 'bcrypt';

// const mockCompanyRepo = {
//   findOne: jest.fn(),
//   create: jest.fn(),
//   save: jest.fn(),
// };
// const mockUserRepo = {
//   findOne: jest.fn(),
//   create: jest.fn(),
//   save: jest.fn(),
//   update: jest.fn(),
// };
// const mockDataSource = {
//   transaction: jest.fn((cb) => cb({
//     findOne: jest.fn(),
//     create: jest.fn((Entity, data) => data),
//     save: jest.fn((entity: any) => ({ ...entity, id: 'test-uuid' })),
//     count: jest.fn().mockResolvedValue(0),
//   })),
// };
// const mockStripeService = { createCustomer: jest.fn().mockResolvedValue({ id: 'cus_test' }) };
// const mockMailService = { sendWelcome: jest.fn().mockResolvedValue(undefined) };
// const mockJwtService = {
//   signAsync: jest.fn().mockResolvedValue('mock-token'),
//   verify: jest.fn(),
// };
// const mockConfigService = { get: jest.fn((key: string, def?: any) => def ?? 'test-value') };

// describe('AuthService', () => {
//   let service: AuthService;

//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         AuthService,
//         { provide: getRepositoryToken(Company), useValue: mockCompanyRepo },
//         { provide: getRepositoryToken(User), useValue: mockUserRepo },
//         { provide: 'DataSource', useValue: mockDataSource },
//         { provide: StripeService, useValue: mockStripeService },
//         { provide: MailService, useValue: mockMailService },
//         { provide: JwtService, useValue: mockJwtService },
//         { provide: ConfigService, useValue: mockConfigService },
//       ],
//     }).compile();

//     service = module.get<AuthService>(AuthService);
//   });

//   afterEach(() => jest.clearAllMocks());

//   describe('register', () => {
//     it('should throw ConflictException if email already exists', async () => {
//       mockUserRepo.findOne.mockResolvedValueOnce({ id: 'existing' });
//       await expect(
//         service.register({
//           company_name: 'Test Co', company_email: 'co@test.com',
//           admin_name: 'Admin', admin_email: 'admin@test.com', admin_password: 'password123',
//         }),
//       ).rejects.toThrow(ConflictException);
//     });

//     it('should throw ConflictException if company email already exists', async () => {
//       mockUserRepo.findOne.mockResolvedValueOnce(null);
//       mockCompanyRepo.findOne.mockResolvedValueOnce({ id: 'existing-company' });
//       await expect(
//         service.register({
//           company_name: 'Test Co', company_email: 'co@test.com',
//           admin_name: 'Admin', admin_email: 'admin@test.com', admin_password: 'password123',
//         }),
//       ).rejects.toThrow(ConflictException);
//     });
//   });

//   describe('login', () => {
//     it('should throw UnauthorizedException for non-existent user', async () => {
//       mockUserRepo.findOne.mockResolvedValueOnce(null);
//       await expect(
//         service.login({ email: 'nobody@test.com', password: 'pass' }),
//       ).rejects.toThrow(UnauthorizedException);
//     });

//     it('should throw UnauthorizedException for wrong password', async () => {
//       mockUserRepo.findOne.mockResolvedValueOnce({
//         id: 'user-1', is_active: true,
//         password_hash: await bcrypt.hash('correct-pass', 10),
//         role: 'ADMIN', custom_role: null,
//         company: { id: 'co-1' },
//         custom_permissions: [],
//       });
//       await expect(
//         service.login({ email: 'user@test.com', password: 'wrong-pass' }),
//       ).rejects.toThrow(UnauthorizedException);
//     });

//     it('should throw UnauthorizedException for inactive user', async () => {
//       mockUserRepo.findOne.mockResolvedValueOnce({
//         id: 'user-1', is_active: false, password_hash: await bcrypt.hash('pass', 10),
//       });
//       await expect(
//         service.login({ email: 'user@test.com', password: 'pass' }),
//       ).rejects.toThrow(UnauthorizedException);
//     });
//   });
// });
