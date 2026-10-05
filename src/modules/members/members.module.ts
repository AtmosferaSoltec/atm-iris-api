import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { InvitationsService } from './invitations.service.js';
import {
  InvitationsController,
  MembersController,
} from './members.controller.js';
import { MembersRepository } from './members.repository.js';
import { MembersService } from './members.service.js';

@Module({
  // Aceptar una invitacion abre sesion igual que un login.
  imports: [AuthModule],
  controllers: [MembersController, InvitationsController],
  providers: [MembersService, InvitationsService, MembersRepository],
})
export class MembersModule {}
