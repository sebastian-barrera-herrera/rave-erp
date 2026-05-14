// import { ExecutionContext, ForbiddenException } from '@nestjs/common';
// import { SubscriptionGuard } from '../../../src/common/guards/subscription.guard';
// import { SubscriptionStatus } from '../../../src/common/types/enums';

// function makeCtx(company: any): ExecutionContext {
//   return {
//     switchToHttp: () => ({ getRequest: () => ({ company }) }),
//   } as any;
// }

// describe('SubscriptionGuard', () => {
//   let guard: SubscriptionGuard;

//   beforeEach(() => { guard = new SubscriptionGuard(); });

//   it('should allow if no company on request (public route)', () => {
//     expect(guard.canActivate(makeCtx(undefined))).toBe(true);
//   });

//   it('should allow ACTIVE subscription', () => {
//     expect(guard.canActivate(makeCtx({ subscription_status: SubscriptionStatus.ACTIVE }))).toBe(true);
//   });

//   it('should allow TRIAL within trial period', () => {
//     const future = new Date(Date.now() + 86400000 * 2);
//     expect(guard.canActivate(makeCtx({
//       subscription_status: SubscriptionStatus.TRIAL,
//       trial_ends_at: future,
//     }))).toBe(true);
//   });

//   it('should deny TRIAL after trial period expired', () => {
//     const past = new Date(Date.now() - 86400000);
//     expect(() => guard.canActivate(makeCtx({
//       subscription_status: SubscriptionStatus.TRIAL,
//       trial_ends_at: past,
//     }))).toThrow(ForbiddenException);
//   });

//   it('should deny PAST_DUE subscription', () => {
//     expect(() => guard.canActivate(makeCtx({ subscription_status: SubscriptionStatus.PAST_DUE })))
//       .toThrow(ForbiddenException);
//   });

//   it('should deny CANCELED subscription', () => {
//     expect(() => guard.canActivate(makeCtx({ subscription_status: SubscriptionStatus.CANCELED })))
//       .toThrow(ForbiddenException);
//   });
// });
