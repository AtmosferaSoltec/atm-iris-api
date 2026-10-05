import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { ApiData } from '../../common/swagger/api-schemas.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { originOf } from '../auth/auth.controller.js';
import type { AuthenticatedUser, AuthResult } from '../auth/auth.types.js';
import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationLookupSchema,
  updateMemberSchema,
  type AcceptInvitationInput,
  type CreateInvitationInput,
  type UpdateMemberInput,
} from './dto/members.schema.js';
import { InvitationsService } from './invitations.service.js';
import { INVITATION_ACCEPT_THROTTLE } from './members.constants.js';
import { MembersService } from './members.service.js';
import type {
  Invitation,
  InvitationPreview,
  Member,
} from './members.types.js';

@ApiTags('members')
@ApiBearerAuth()
@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'Equipo de la iglesia (miembros activos)' })
  @ApiData('Member', { isArray: true })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Member[]> {
    return this.members.list(user);
  }

  @Patch(':id')
  @RequirePermissions('members.manage')
  @ApiOperation({ summary: 'Cambiar el rol de un miembro' })
  @ApiData('Member')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateMemberSchema)) dto: UpdateMemberInput,
  ): Promise<Member> {
    return this.members.updateRole(user, id, dto.role);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('members.manage')
  @ApiOperation({
    summary: 'Quitar a alguien del equipo y cerrar sus sesiones en esta iglesia',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.members.remove(user, id);
  }
}

@ApiTags('invitations')
@Controller('invitations')
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Get()
  @ApiBearerAuth()
  @RequirePermissions('members.manage')
  @ApiOperation({ summary: 'Invitaciones pendientes' })
  @ApiData('Invitation', { isArray: true })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Invitation[]> {
    return this.invitations.list(user);
  }

  @Post()
  @ApiBearerAuth()
  @RequirePermissions('members.manage')
  @ApiOperation({ summary: 'Invitar por correo' })
  @ApiData('Invitation', { status: 201 })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createInvitationSchema))
    dto: CreateInvitationInput,
  ): Promise<Invitation> {
    return this.invitations.create(user, dto);
  }

  @Public()
  @Get('lookup')
  @ApiOperation({ summary: 'Ver una invitación por su token (pública)' })
  @ApiData('InvitationPreview')
  lookup(
    @Query(new ZodValidationPipe(invitationLookupSchema))
    query: { token: string },
  ): Promise<InvitationPreview> {
    return this.invitations.lookup(query.token);
  }

  @Public()
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: INVITATION_ACCEPT_THROTTLE })
  @ApiOperation({ summary: 'Aceptar una invitación y entrar (pública)' })
  @ApiData('AuthResult')
  accept(
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    dto: AcceptInvitationInput,
    @Req() request: Request,
  ): Promise<AuthResult> {
    return this.invitations.accept(dto, originOf(request));
  }

  @Post(':id/resend')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @RequirePermissions('members.manage')
  @ApiOperation({ summary: 'Reenviar con un enlace y un vencimiento nuevos' })
  @ApiData('Invitation')
  resend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<Invitation> {
    return this.invitations.resend(user, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @RequirePermissions('members.manage')
  @ApiOperation({ summary: 'Revocar una invitación pendiente' })
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.invitations.revoke(user, id);
  }
}
