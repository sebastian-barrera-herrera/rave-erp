// ─────────────────────────────────────────────────────────────────────────────
// AuthController — Registro, login, refresh y gestión de sesión
// ─────────────────────────────────────────────────────────────────────────────
// Las rutas /register y /login NO requieren autenticación.
// Las demás requieren un Bearer token JWT en `Authorization`.
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Post, Get, Body, Param, UseGuards, HttpCode, HttpStatus, Patch,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiBody, ApiResponse, ApiParam,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto, LoginDto, RefreshTokenDto, ChangePasswordDto } from './dto/auth.dto';
import { AcceptInvitationDto } from './dto/invitation.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/user.decorator';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary: 'Registrar empresa + usuario administrador',
    description:
      'Crea una **empresa** y su **usuario admin** en la misma transacción y devuelve los tokens JWT '
      + 'para iniciar sesión inmediatamente. Arranca un trial automático.\n\n'
      + '**No requiere autenticación.**',
  })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({
    status: 201,
    description: 'Empresa y usuario creados',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIs...',
        refresh_token: 'eyJhbGciOiJIUzI1NiIs...',
        user: { id: 'uuid', email: 'admin@empresa.com', name: 'Sebastián López', role: 'ADMIN' },
        company: { id: 'uuid', name: 'Distribuidora El Sol', slug: 'distribuidora-el-sol' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validación fallida (email ya existe, password corta, etc.)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
    description: 'Devuelve `access_token` (15m) y `refresh_token` (7d).',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Login exitoso',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIs...',
        refresh_token: 'eyJhbGciOiJIUzI1NiIs...',
        user: { id: 'uuid', email: 'admin@empresa.com', name: 'Sebastián López', role: 'ADMIN' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refrescar access token',
    description: 'Usa el `refresh_token` para emitir un nuevo `access_token` sin pedir credenciales.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'Tokens nuevos emitidos' })
  @ApiResponse({ status: 401, description: 'Refresh token inválido o revocado' })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cerrar sesión',
    description: 'Invalida el refresh token actual del usuario.',
  })
  @ApiResponse({ status: 200, description: 'Sesión cerrada' })
  logout(@CurrentUser() user: any) {
    return this.authService.logout(user.id);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Datos del usuario autenticado' })
  @ApiResponse({
    status: 200,
    description: 'Datos del usuario + permisos',
    schema: {
      example: {
        id: 'uuid', name: 'Sebastián López', email: 'admin@empresa.com',
        role: 'ADMIN',
        permissions: ['products:view', 'products:create', 'sales:create'],
        company: { id: 'uuid', name: 'Distribuidora El Sol' },
      },
    },
  })
  me(@CurrentUser() user: any) {
    return this.authService.me(user.id);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Flujo de invitaciones (rutas públicas — no requieren JWT)
  // ───────────────────────────────────────────────────────────────────────────

  @Get('invitation/:token')
  @ApiOperation({
    summary: 'Validar token de invitación y obtener datos del invitado',
    description:
      'Endpoint público. El frontend lo llama al cargar la página /accept-invitation '
      + 'con el token del query string. Devuelve email (read-only), rol y empresa '
      + 'para que el invitado solo necesite poner nombre y contraseña.',
  })
  @ApiParam({ name: 'token', description: 'Token plano recibido en el correo' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        email: 'maria@distribuidora.com',
        role: 'SELLER',
        company: { id: 'uuid', name: 'Distribuidora El Sol' },
        expires_at: '2026-05-14T00:00:00Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invitación expirada, revocada o ya aceptada' })
  @ApiResponse({ status: 404, description: 'Token no encontrado' })
  getInvitation(@Param('token') token: string) {
    return this.authService.getInvitationByToken(token);
  }

  @Post('accept-invitation')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aceptar invitación y fijar contraseña',
    description:
      'Endpoint público. Crea el usuario con la contraseña proporcionada y devuelve '
      + 'tokens de sesión (mismo shape que /login), de modo que el invitado queda '
      + 'autenticado de inmediato.',
  })
  @ApiBody({ type: AcceptInvitationDto })
  @ApiResponse({ status: 200, description: 'Usuario creado y autenticado' })
  @ApiResponse({ status: 400, description: 'Token inválido, expirado o ya aceptado' })
  @ApiResponse({ status: 409, description: 'El email ya pertenece a un usuario existente' })
  acceptInvitation(@Body() dto: AcceptInvitationDto) {
    return this.authService.acceptInvitation(dto);
  }

  @Patch('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cambiar contraseña del usuario autenticado' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Contraseña actualizada' })
  @ApiResponse({ status: 400, description: 'La contraseña actual no coincide' })
  changePassword(@CurrentUser() user: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(user.id, dto);
  }
}
