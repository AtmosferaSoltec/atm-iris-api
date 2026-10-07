import { applyDecorators } from '@nestjs/common';
import { ApiResponse, type OpenAPIObject } from '@nestjs/swagger';

/**
 * Esquemas de respuesta del contrato (docs/contract/api-v1.md) para Swagger.
 *
 * El API no usa clases DTO (valida con Zod y responde tipos planos), asi que los
 * esquemas se escriben aqui una vez y `main.ts` los agrega a `components`. Si el
 * contrato cambia, cambia aqui.
 */
// Los tipos de OpenAPI no se exportan por la raiz del paquete: se derivan.
type Schema = NonNullable<
  NonNullable<OpenAPIObject['components']>['schemas']
>[string];
type ReferenceObject = Extract<Schema, { $ref: string }>;
type SchemaObject = Exclude<Schema, ReferenceObject>;

const ref = (name: string): ReferenceObject => ({
  $ref: `#/components/schemas/${name}`,
});
const str = (extra: SchemaObject = {}): SchemaObject => ({
  type: 'string',
  ...extra,
});
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const date = str({ format: 'date-time', example: '2026-10-05T15:30:31.022Z' });
const uuid = str({ format: 'uuid' });
const int = (extra: SchemaObject = {}): SchemaObject => ({
  type: 'integer',
  ...extra,
});
const bool: SchemaObject = { type: 'boolean' };
const array = (items: Schema): SchemaObject => ({ type: 'array', items });

function object(properties: Record<string, Schema>): SchemaObject {
  return { type: 'object', properties, required: Object.keys(properties) };
}

const sessionView = object({
  user: object({ id: uuid, email: str({ format: 'email' }), fullName: str() }),
  church: object({
    id: uuid,
    name: str(),
    timezone: str({ example: 'America/Lima' }),
  }),
  session: object({
    id: uuid,
    platform: str({ enum: ['web', 'ios', 'windows'] }),
    deviceName: nullable(str()),
  }),
});

const schedule = object({
  weekday: int({ minimum: 1, maximum: 7 }),
  hour: int({ minimum: 0, maximum: 23 }),
  minute: int({ minimum: 0, maximum: 59 }),
});

const church = object({
  id: uuid,
  name: str(),
  timezone: str(),
  modules: object({ bible: bool, multimedia: bool, timeControl: bool }),
  availableModules: object({ bible: bool, multimedia: bool, timeControl: bool }),
  projection: object({
    fontFamily: str(),
    fontSizePt: int(),
    defaultBackgroundId: nullable(str()),
  }),
  storage: object({
    usedBytes: int(),
    quotaBytes: int(),
    breakdown: object({
      musicBytes: int(),
      backgroundBytes: int(),
      mediaBytes: int(),
    }),
  }),
  createdAt: date,
  updatedAt: date,
});

const person = object({
  id: uuid,
  name: str(),
  blockCount: int(),
  createdAt: date,
  updatedAt: date,
});

const serviceType = object({
  id: uuid,
  name: str(),
  color: str({
    enum: ['#FFB547', '#FF7A59', '#F0508C', '#9B5CFF', '#4E5BFF', '#3DDC97'],
  }),
  schedule: { ...schedule, nullable: true },
  blocks: array(
    object({
      id: uuid,
      name: str(),
      plannedMinutes: int({ minimum: 1, maximum: 240 }),
    }),
  ),
  createdAt: date,
  updatedAt: date,
});

const song = object({
  id: uuid,
  title: str(),
  author: str(),
  sections: array(object({ id: uuid, label: nullable(str()), text: str() })),
  createdAt: date,
  updatedAt: date,
});

const songSummary = object({
  id: uuid,
  title: str(),
  author: str(),
  sectionCount: int(),
  firstLine: nullable(str()),
  updatedAt: date,
});

const mediaAsset = object({
  id: uuid,
  kind: str({ enum: ['image', 'video', 'audio'] }),
  title: str(),
  description: nullable(str()),
  fileName: str(),
  contentType: str(),
  sizeBytes: int(),
  durationSeconds: nullable(int()),
  width: nullable(int()),
  height: nullable(int()),
  isBackground: bool,
  createdAt: date,
  updatedAt: date,
});

const serviceRecord = object({
  id: uuid,
  date,
  serviceTypeId: uuid,
  serviceTypeName: str(),
  blocks: array(
    object({
      id: uuid,
      name: str(),
      plannedSeconds: int(),
      actualSeconds: int(),
      personId: nullable(uuid),
      personName: nullable(str()),
      status: str({ enum: ['completed', 'skipped', 'adjusted'] }),
    }),
  ),
  createdAt: date,
  updatedAt: date,
});

const idLists = object({
  people: array(uuid),
  serviceTypes: array(uuid),
  songs: array(uuid),
  media: array(uuid),
  serviceRecords: array(uuid),
});

export const API_SCHEMAS: Record<string, SchemaObject> = {
  ApiError: {
    type: 'object',
    required: ['statusCode', 'code', 'message', 'timestamp', 'path'],
    properties: {
      statusCode: int({ example: 409 }),
      code: str({ example: 'PERSON_NAME_TAKEN' }),
      message: str({ example: 'Ya existe una persona con ese nombre.' }),
      errors: {
        type: 'object',
        additionalProperties: str(),
        example: { name: 'Ya existe una persona con ese nombre.' },
      },
      timestamp: date,
      path: str({ example: '/api/v1/people' }),
    },
  },
  Message: object({ message: str() }),
  ResetCodeValid: object({ valid: { type: 'boolean', enum: [true] } }),
  PaginationMeta: object({
    page: int(),
    limit: int(),
    total: int(),
    totalPages: int(),
  }),
  SessionView: sessionView,
  AuthResult: {
    allOf: [
      ref('SessionView'),
      object({
        accessToken: str(),
        accessTokenExpiresAt: date,
        refreshToken: str(),
        refreshTokenExpiresAt: date,
      }),
    ],
  },
  DeviceSession: object({
    id: uuid,
    platform: str({ enum: ['web', 'ios', 'windows'] }),
    deviceName: nullable(str()),
    createdAt: date,
    lastUsedAt: date,
    ipAddress: nullable(str()),
    isCurrent: bool,
  }),
  Church: church,
  Person: person,
  ServiceType: serviceType,
  Song: song,
  SongSummary: songSummary,
  UploadTicket: object({
    uploadId: uuid,
    uploadUrl: str({ format: 'uri' }),
    headers: {
      type: 'object',
      additionalProperties: str(),
      example: { 'Content-Type': 'image/png' },
    },
    expiresAt: date,
  }),
  MediaAsset: mediaAsset,
  DownloadUrl: object({ url: str({ format: 'uri' }), expiresAt: date }),
  ServiceRecord: serviceRecord,
  SyncPage: object({
    church: { ...ref('Church'), nullable: true } as Schema,
    changes: object({
      people: array(ref('Person')),
      serviceTypes: array(ref('ServiceType')),
      songs: array(ref('Song')),
      media: array(ref('MediaAsset')),
      serviceRecords: array(ref('ServiceRecord')),
    }),
    deleted: idLists,
    cursor: str({ example: '1532' }),
    hasMore: bool,
  }),
  BibleTranslation: object({
    code: str({ example: 'rvr1909' }),
    name: str({ example: 'Reina-Valera 1909' }),
    language: str({ enum: ['es'] }),
    version: int(),
    sizeBytes: int(),
  }),
  BibleBook: object({
    id: str({ example: 'JHN' }),
    name: str({ example: 'Juan' }),
    testament: str({ enum: ['old', 'new'] }),
    chapterCount: int(),
    position: int({ minimum: 1, maximum: 66 }),
  }),
  BibleChapter: object({
    bookId: str({ example: 'JHN' }),
    chapter: int(),
    verses: array(object({ number: int(), text: str() })),
  }),
  BibleDownload: object({
    code: str(),
    name: str(),
    version: int(),
    books: array({
      allOf: [ref('BibleBook'), object({ chapters: array(array(str())) })],
    }),
  }),
};

/** `{ data: T }` o `{ data: T[] }` con el codigo de exito indicado. */
export function ApiData(
  name: string,
  options: { status?: number; isArray?: boolean } = {},
) {
  const item = ref(name);
  return ApiResponse({
    status: options.status ?? 200,
    description: 'Éxito',
    schema: object({ data: options.isArray ? array(item) : item }),
  });
}

/** Lista paginada: `{ data: T[], meta }`. */
export function ApiPaginated(name: string) {
  return ApiResponse({
    status: 200,
    description: 'Éxito (paginado)',
    schema: object({ data: array(ref(name)), meta: ref('PaginationMeta') }),
  });
}

/** Errores comunes de un endpoint privado, con la forma del contrato. */
export function ApiErrors(...statuses: number[]) {
  return applyDecorators(
    ...statuses.map((status) =>
      ApiResponse({ status, description: 'Error', schema: ref('ApiError') }),
    ),
  );
}
