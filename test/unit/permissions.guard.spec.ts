// import { Reflector } from '@nestjs/core';
// import { ExecutionContext, ForbiddenException } from '@nestjs/common';
// import { PermissionsGuard } from '../../../src/common/guards/permissions.guard';
// import { Permission, UserRole } from '../../../src/common/types/enums';

// const mockReflector = { getAllAndOverride: jest.fn() };

// function makeContext(user: any): ExecutionContext {
//   return {
//     switchToHttp: () => ({ getRequest: () => ({ user }) }),
//     getHandler: () => ({}),
//     getClass: () => ({}),
//   } as any;
// }

// describe('PermissionsGuard', () => {
//   let guard: PermissionsGuard;

//   beforeEach(() => {
//     guard = new PermissionsGuard(mockReflector as any);
//   });

//   it('should allow when no permissions required', () => {
//     mockReflector.getAllAndOverride.mockReturnValue(undefined);
//     expect(guard.canActivate(makeContext({ role: UserRole.EMPLOYEE }))).toBe(true);
//   });

//   it('should allow ADMIN regardless of permissions', () => {
//     mockReflector.getAllAndOverride.mockReturnValue([Permission.REPORTS_VIEW]);
//     expect(guard.canActivate(makeContext({ role: UserRole.ADMIN, custom_permissions: [] }))).toBe(true);
//   });

//   it('should allow when user has required permission in custom_permissions', () => {
//     mockReflector.getAllAndOverride.mockReturnValue([Permission.SALES_CREATE]);
//     const user = { role: UserRole.SELLER, custom_permissions: [Permission.SALES_CREATE] };
//     expect(guard.canActivate(makeContext(user))).toBe(true);
//   });

//   it('should deny when user lacks required permission', () => {
//     mockReflector.getAllAndOverride.mockReturnValue([Permission.REPORTS_VIEW]);
//     const user = { role: UserRole.EMPLOYEE, custom_permissions: [Permission.PRODUCTS_VIEW] };
//     expect(() => guard.canActivate(makeContext(user))).toThrow(ForbiddenException);
//   });

//   it('should deny when user is not authenticated', () => {
//     mockReflector.getAllAndOverride.mockReturnValue([Permission.SALES_CREATE]);
//     expect(() => guard.canActivate(makeContext(undefined))).toThrow(ForbiddenException);
//   });

//   it('should use built-in role permissions when custom_permissions is empty', () => {
//     mockReflector.getAllAndOverride.mockReturnValue([Permission.PRODUCTS_VIEW]);
//     const user = { role: UserRole.SELLER, custom_permissions: [] };
//     // SELLER has PRODUCTS_VIEW in ROLE_PERMISSIONS
//     expect(guard.canActivate(makeContext(user))).toBe(true);
//   });
// });
