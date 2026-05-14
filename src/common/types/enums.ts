export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  SELLER = 'SELLER',
  CASHIER = 'CASHIER',
  EMPLOYEE = 'EMPLOYEE',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
}

export enum SubscriptionPlan {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  YEARLY = 'YEARLY',
}

export enum SaleType {
  CASH = 'CASH',
  CREDIT = 'CREDIT',
}

export enum SaleStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  CANCELED = 'CANCELED',
}

export enum DebtStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  CHECK = 'CHECK',
  OTHER = 'OTHER',
}

export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

export enum RemissionStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  CANCELED = 'CANCELED',
}

export enum PlanTaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum PlanVisitStatus {
  PENDING = 'PENDING',
  VISITED = 'VISITED',
  SKIPPED = 'SKIPPED',
}

export enum QuotationStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum TicketType {
  CLAIM = 'CLAIM',
  COMPLAINT = 'COMPLAINT',
  SUGGESTION = 'SUGGESTION',
  QUESTION = 'QUESTION',
  OTHER = 'OTHER',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

// Permission keys — used in custom role permissions JSON
export enum Permission {
  // Products
  PRODUCTS_VIEW = 'products:view',
  PRODUCTS_CREATE = 'products:create',
  PRODUCTS_EDIT = 'products:edit',
  PRODUCTS_DELETE = 'products:delete',
  // Inventory
  INVENTORY_VIEW = 'inventory:view',
  INVENTORY_ADJUST = 'inventory:adjust',
  // Warehouses
  WAREHOUSES_VIEW = 'warehouses:view',
  WAREHOUSES_MANAGE = 'warehouses:manage',
  // Remissions (órdenes de salida)
  REMISSIONS_VIEW = 'remissions:view',
  REMISSIONS_CREATE = 'remissions:create',
  REMISSIONS_CANCEL = 'remissions:cancel',
  // Customers
  CUSTOMERS_VIEW = 'customers:view',
  CUSTOMERS_CREATE = 'customers:create',
  CUSTOMERS_EDIT = 'customers:edit',
  CUSTOMERS_DELETE = 'customers:delete',
  // Sales
  SALES_VIEW = 'sales:view',
  SALES_CREATE = 'sales:create',
  SALES_CANCEL = 'sales:cancel',
  SALES_SEND = 'sales:send',
  // Debts
  DEBTS_VIEW = 'debts:view',
  DEBTS_MANAGE = 'debts:manage',
  // Payments
  PAYMENTS_VIEW = 'payments:view',
  PAYMENTS_CREATE = 'payments:create',
  // Reports
  REPORTS_VIEW = 'reports:view',
  REPORTS_EXPORT = 'reports:export',
  // Users
  USERS_VIEW = 'users:view',
  USERS_MANAGE = 'users:manage',
  // Company
  COMPANY_SETTINGS = 'company:settings',
  // Subscriptions
  SUBSCRIPTION_MANAGE = 'subscription:manage',
  // Quotations
  QUOTATIONS_VIEW = 'quotations:view',
  QUOTATIONS_CREATE = 'quotations:create',
  QUOTATIONS_EDIT = 'quotations:edit',
  QUOTATIONS_DELETE = 'quotations:delete',
  QUOTATIONS_SEND = 'quotations:send',
  // Support
  SUPPORT_VIEW = 'support:view',
  SUPPORT_MANAGE = 'support:manage',
  // Planner (planeador diario)
  PLANNER_USE = 'planner:use',           // gestionar mis propios planes
  PLANNER_VIEW_ALL = 'planner:view_all', // ver planes de otros usuarios
}

// Default permissions per built-in role
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: Object.values(Permission),
  [UserRole.MANAGER]: [
    Permission.PRODUCTS_VIEW, Permission.PRODUCTS_CREATE, Permission.PRODUCTS_EDIT,
    Permission.INVENTORY_VIEW, Permission.INVENTORY_ADJUST,
    Permission.WAREHOUSES_VIEW, Permission.WAREHOUSES_MANAGE,
    Permission.CUSTOMERS_VIEW, Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_EDIT,
    Permission.SALES_VIEW, Permission.SALES_CREATE, Permission.SALES_CANCEL,
    Permission.SALES_SEND,
    Permission.REMISSIONS_VIEW, Permission.REMISSIONS_CREATE, Permission.REMISSIONS_CANCEL,
    Permission.DEBTS_VIEW, Permission.DEBTS_MANAGE,
    Permission.PAYMENTS_VIEW, Permission.PAYMENTS_CREATE,
    Permission.REPORTS_VIEW, Permission.REPORTS_EXPORT,
    Permission.USERS_VIEW,
    Permission.QUOTATIONS_VIEW, Permission.QUOTATIONS_CREATE, Permission.QUOTATIONS_EDIT,
    Permission.QUOTATIONS_DELETE, Permission.QUOTATIONS_SEND,
    Permission.SUPPORT_VIEW, Permission.SUPPORT_MANAGE,
    Permission.PLANNER_USE, Permission.PLANNER_VIEW_ALL,
  ],
  [UserRole.SELLER]: [
    Permission.PRODUCTS_VIEW,
    Permission.WAREHOUSES_VIEW,
    Permission.CUSTOMERS_VIEW, Permission.CUSTOMERS_CREATE, Permission.CUSTOMERS_EDIT,
    Permission.SALES_VIEW, Permission.SALES_CREATE, Permission.SALES_SEND,
    Permission.REMISSIONS_VIEW, Permission.REMISSIONS_CREATE,
    Permission.DEBTS_VIEW,
    Permission.PAYMENTS_VIEW, Permission.PAYMENTS_CREATE,
    Permission.PLANNER_USE,
  ],
  [UserRole.CASHIER]: [
    Permission.PRODUCTS_VIEW,
    Permission.WAREHOUSES_VIEW,
    Permission.CUSTOMERS_VIEW,
    Permission.SALES_VIEW, Permission.SALES_CREATE, Permission.SALES_SEND,
    Permission.REMISSIONS_VIEW, Permission.REMISSIONS_CREATE,
    Permission.PAYMENTS_VIEW, Permission.PAYMENTS_CREATE,
    Permission.DEBTS_VIEW,
    Permission.QUOTATIONS_VIEW, Permission.QUOTATIONS_CREATE, Permission.QUOTATIONS_SEND,
    Permission.SUPPORT_VIEW,
    Permission.PLANNER_USE,
  ],
  [UserRole.EMPLOYEE]: [
    Permission.PRODUCTS_VIEW,
    Permission.WAREHOUSES_VIEW,
    Permission.CUSTOMERS_VIEW,
    Permission.SALES_VIEW,
    Permission.REMISSIONS_VIEW,
    Permission.INVENTORY_VIEW,
    Permission.SUPPORT_VIEW,
    Permission.PLANNER_USE,
  ],
};
