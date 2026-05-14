// import { Test, TestingModule } from '@nestjs/testing';
// import { getRepositoryToken } from '@nestjs/typeorm';
// import { BadRequestException, NotFoundException } from '@nestjs/common';
// import { SalesService } from '../../../src/modules/sales/sales.service';
// import { Sale } from '../../../src/modules/sales/entities/sale.entity';
// import { SaleItem } from '../../../src/modules/sales/entities/sale-item.entity';
// import { PdfService } from '../../../src/modules/pdf/pdf.service';
// import { SaleType } from '../../../src/common/types/enums';

// const mockSaleRepo = {
//   find: jest.fn(),
//   findOne: jest.fn(),
//   createQueryBuilder: jest.fn(() => ({
//     leftJoinAndSelect: jest.fn().mockReturnThis(),
//     where: jest.fn().mockReturnThis(),
//     andWhere: jest.fn().mockReturnThis(),
//     skip: jest.fn().mockReturnThis(),
//     take: jest.fn().mockReturnThis(),
//     orderBy: jest.fn().mockReturnThis(),
//     getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
//   })),
// };

// const mockManagerFns = {
//   findOne: jest.fn(),
//   create: jest.fn((Entity, data) => ({ ...data })),
//   save: jest.fn((entity) => ({ ...entity, id: 'new-id' })),
//   count: jest.fn().mockResolvedValue(5),
//   decrement: jest.fn(),
// };

// const mockDataSource = {
//   transaction: jest.fn((cb) => cb(mockManagerFns)),
//   getRepository: jest.fn(() => ({
//     findOne: jest.fn().mockResolvedValue({ id: 'co-1', name: 'Test Co', tax_rate: 0.19 }),
//   })),
// };

// const mockPdfService = { generateInvoice: jest.fn().mockResolvedValue(Buffer.from('pdf')) };

// describe('SalesService', () => {
//   let service: SalesService;

//   beforeEach(async () => {
//     const module: TestingModule = await Test.createTestingModule({
//       providers: [
//         SalesService,
//         { provide: getRepositoryToken(Sale), useValue: mockSaleRepo },
//         { provide: 'DataSource', useValue: mockDataSource },
//         { provide: PdfService, useValue: mockPdfService },
//       ],
//     }).compile();

//     service = module.get<SalesService>(SalesService);
//   });

//   afterEach(() => jest.clearAllMocks());

//   describe('create', () => {
//     it('should throw BadRequestException for CREDIT sale without due_date', async () => {
//       await expect(
//         service.create(
//           { customer_id: 'c1', type: SaleType.CREDIT, items: [] },
//           'co-1', 'u-1',
//         ),
//       ).rejects.toThrow(BadRequestException);
//     });

//     it('should throw BadRequestException when stock is insufficient', async () => {
//       mockManagerFns.findOne
//         .mockResolvedValueOnce({ id: 'co-1', tax_rate: 0.19 }) // company
//         .mockResolvedValueOnce({ id: 'c1', name: 'Customer' }) // customer
//         .mockResolvedValueOnce({                                // product
//           id: 'p1', name: 'Tornillo', stock: 2,
//           track_stock: true, is_active: true, price: 1000,
//         });

//       await expect(
//         service.create(
//           { customer_id: 'c1', type: SaleType.CASH, items: [{ product_id: 'p1', quantity: 10 }] },
//           'co-1', 'u-1',
//         ),
//       ).rejects.toThrow(BadRequestException);
//     });

//     it('should throw NotFoundException when customer not found', async () => {
//       mockManagerFns.findOne
//         .mockResolvedValueOnce({ id: 'co-1', tax_rate: 0.19 }) // company
//         .mockResolvedValueOnce(null);                           // customer not found

//       await expect(
//         service.create(
//           { customer_id: 'bad-id', type: SaleType.CASH, items: [{ product_id: 'p1', quantity: 1 }] },
//           'co-1', 'u-1',
//         ),
//       ).rejects.toThrow(NotFoundException);
//     });
//   });

//   describe('findAll', () => {
//     it('should return paginated results', async () => {
//       const result = await service.findAll('co-1', { page: 1, limit: 10 });
//       expect(result).toHaveProperty('data');
//       expect(result).toHaveProperty('meta');
//       expect(result.meta.page).toBe(1);
//     });
//   });
// });
