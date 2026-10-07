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
  Res,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ApiData } from '../../common/swagger/api-schemas.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  createPersonSchema,
  updatePersonSchema,
  type CreatePersonInput,
  type UpdatePersonInput,
} from './dto/people.schema.js';
import { PeopleService } from './people.service.js';
import type { Person } from './people.types.js';

@ApiTags('people')
@ApiBearerAuth()
@Controller('people')
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  @Get()
  @ApiOperation({ summary: 'Personas de la iglesia, por nombre' })
  @ApiData('Person', { isArray: true })
  list(@CurrentUser() user: AuthenticatedUser): Promise<Person[]> {
    return this.people.list(user.churchId);
  }

  @Post()
  @ApiOperation({
    summary: 'Crear una persona (201; 200 si el id ya existía en la iglesia)',
  })
  @ApiData('Person', { status: 201 })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPersonSchema)) dto: CreatePersonInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Person> {
    const { person, isNew } = await this.people.create(user.churchId, dto);
    response.status(isNew ? HttpStatus.CREATED : HttpStatus.OK);
    return person;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Renombrar una persona' })
  @ApiData('Person')
  rename(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePersonSchema)) dto: UpdatePersonInput,
  ): Promise<Person> {
    return this.people.rename(user.churchId, id, dto.name);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Borrar una persona (la quita como responsable de las plantillas)',
  })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<void> {
    return this.people.remove(user.churchId, id);
  }
}
