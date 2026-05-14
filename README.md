# ERP SaaS Backend

Sistema ERP SaaS multi-tenant para cualquier tipo de negocio: ferreterías, odontologías, carnicerías, zapaterías, tiendas, bodegas y más.

## Stack

- **Framework:** NestJS 10 + TypeScript
- **Base de datos:** PostgreSQL 15 + TypeORM
- **Autenticación:** JWT (access + refresh tokens)
- **Pagos:** Stripe (suscripciones mensuales, trimestrales y anuales)
- **PDF:** PDFKit
- **Email:** Nodemailer / SendGrid
- **Contenedor:** Docker + Docker Compose

---

## Inicio rápido

### 1. Clonar y configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus credenciales reales
```

### 2. Levantar con Docker

```bash
docker-compose up -d
```

### 3. Sin Docker (desarrollo local)

```bash
npm install
npm run migration:run   # Aplicar migraciones
npx ts-node database/seed.ts  # Cargar datos de prueba
npm run start:dev
```

La API estará disponible en: `http://localhost:3000/api`

---

## Credenciales de prueba (después del seed)

| Rol     | Email                        | Contraseña    |
|---------|------------------------------|---------------|
| ADMIN   | admin@ferreteria.com         | Admin1234!    |
| MANAGER | gerente@ferreteria.com       | Manager1234!  |
| SELLER  | vendedor@ferreteria.com      | Seller1234!   |

---

## Estructura del proyecto

```
src/
├── common/
│   ├── decorators/       # @CurrentUser, @CurrentCompany, @Permissions
│   ├── filters/          # HttpExceptionFilter
│   ├── guards/           # JwtAuthGuard, PermissionsGuard, SubscriptionGuard
│   ├── interceptors/     # TransformInterceptor
│   ├── middleware/        # TenantMiddleware
│   └── types/            # Enums, Pagination
├── modules/
│   ├── auth/             # Registro, login, refresh, JWT
│   ├── companies/        # Config de empresa
│   ├── users/            # CRUD de usuarios con roles
│   ├── roles/            # Roles personalizados por empresa
│   ├── customers/        # Clientes con historial
│   ├── products/         # Catálogo con control de stock
│   ├── inventory/        # Movimientos de inventario
│   ├── sales/            # Ventas contado/crédito
│   ├── debts/            # Control de deudas
│   ├── payments/         # Abonos a deudas
│   ├── reports/          # Dashboard y analítica
│   ├── pdf/              # Generación de documentos PDF
│   └── subscriptions/    # Stripe + webhooks + calendario
└── shared/
    ├── services/         # StripeService, MailService
    ├── tasks.service.ts  # Cron jobs
    └── shared.module.ts
database/
├── migrations/           # Migraciones TypeORM
├── seed.ts               # Datos de prueba
└── database.config.ts    # Config DataSource para CLI
```

---

## Endpoints principales

### Auth
```
POST /api/auth/register       # Crear empresa + admin
POST /api/auth/login          # Login → tokens JWT
POST /api/auth/refresh        # Renovar access token
POST /api/auth/logout         # Cerrar sesión
GET  /api/auth/me             # Perfil del usuario actual
PATCH /api/auth/change-password
```

### Empresa
```
GET   /api/company            # Datos de la empresa
GET   /api/company/stats      # Estadísticas + estado de suscripción
PATCH /api/company            # Actualizar configuración
```

### Usuarios y Roles
```
GET    /api/users
POST   /api/users
PATCH  /api/users/:id
DELETE /api/users/:id

GET    /api/roles
POST   /api/roles             # Crear rol personalizado
PATCH  /api/roles/:id
DELETE /api/roles/:id
GET    /api/roles/permissions # Listar todos los permisos disponibles
```

### Productos e Inventario
```
GET    /api/products
POST   /api/products
PATCH  /api/products/:id
DELETE /api/products/:id
GET    /api/products/low-stock
GET    /api/products/categories

GET    /api/inventory
POST   /api/inventory/adjust
GET    /api/inventory/product/:productId
```

### Clientes
```
GET    /api/customers
POST   /api/customers
GET    /api/customers/:id
GET    /api/customers/:id/history
PATCH  /api/customers/:id
DELETE /api/customers/:id
```

### Ventas
```
GET    /api/sales
POST   /api/sales
GET    /api/sales/:id
POST   /api/sales/:id/cancel
GET    /api/sales/:id/pdf      # Descargar factura PDF
```

### Deudas y Pagos
```
GET    /api/debts
GET    /api/debts/summary
GET    /api/debts/:id

GET    /api/payments
POST   /api/payments/debt/:debtId
```

### Reportes
```
GET    /api/reports/dashboard
GET    /api/reports/sales-summary?date_from=&date_to=&group_by=day|month|year
GET    /api/reports/top-products?date_from=&date_to=&limit=10
GET    /api/reports/top-customers
GET    /api/reports/debts
GET    /api/reports/inventory
GET    /api/reports/inventory/pdf
GET    /api/reports/sales/pdf
```

### Suscripciones (Stripe)
```
GET    /api/subscriptions/status
GET    /api/subscriptions/plans
POST   /api/subscriptions/checkout     { plan: "MONTHLY"|"QUARTERLY"|"YEARLY" }
POST   /api/subscriptions/portal
POST   /api/subscriptions/cancel
POST   /api/subscriptions/webhook      # Solo Stripe (verificación HMAC)
```

---

## Planes de suscripción

| Plan        | Duración | Stripe Price ID env var       |
|-------------|----------|-------------------------------|
| MONTHLY     | 1 mes    | `STRIPE_PRICE_MONTHLY`        |
| QUARTERLY   | 3 meses  | `STRIPE_PRICE_QUARTERLY`      |
| YEARLY      | 12 meses | `STRIPE_PRICE_YEARLY`         |

### Estados de suscripción

| Estado     | Acceso              |
|------------|---------------------|
| TRIAL      | Completo (3 días)   |
| ACTIVE     | Completo            |
| PAST_DUE   | Bloqueado           |
| CANCELED   | Bloqueado           |

---

## Sistema de permisos

Cada usuario puede tener:
1. **Rol base** (ADMIN, MANAGER, SELLER, CASHIER, EMPLOYEE) con permisos predefinidos.
2. **Rol personalizado** (custom_role) creado por el ADMIN con los permisos exactos que necesita.

Los permisos disponibles son:

```
products:view      products:create    products:edit      products:delete
inventory:view     inventory:adjust
customers:view     customers:create   customers:edit     customers:delete
sales:view         sales:create       sales:cancel
debts:view         debts:manage
payments:view      payments:create
reports:view       reports:export
users:view         users:manage
company:settings
subscription:manage
```

---

## Configurar Stripe

1. Crear productos y precios en el [Dashboard de Stripe](https://dashboard.stripe.com)
2. Copiar los Price IDs a `.env`
3. Configurar el webhook en Stripe → `https://tu-dominio.com/api/subscriptions/webhook`
4. Copiar el `STRIPE_WEBHOOK_SECRET` al `.env`

**Eventos a suscribirse:**
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

---

## Comandos útiles

```bash
# Desarrollo
npm run start:dev

# Migraciones
npm run migration:run
npm run migration:revert
npm run migration:generate -- database/migrations/NombreMigracion

# Seed
npx ts-node database/seed.ts

# Tests
npm test
npm run test:e2e

# Build producción
npm run build
npm run start
```

---

## Despliegue en producción

### Variables críticas a cambiar en .env:
```
JWT_SECRET=<string aleatoria de 64+ caracteres>
JWT_REFRESH_SECRET=<string aleatoria diferente>
DB_SYNC=false
NODE_ENV=production
```

### Con Docker Compose:
```bash
docker-compose up -d --build
```

---

## Multi-tenancy

- Cada empresa tiene datos completamente aislados via `company_id`
- El `TenantMiddleware` inyecta el objeto `company` en cada request desde el JWT
- Nunca se acepta `company_id` desde el body del cliente
- Soft delete en todas las entidades críticas (ventas, deudas, pagos, productos)
