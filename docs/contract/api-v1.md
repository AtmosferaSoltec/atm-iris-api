# Contrato de la API de Iris · v1

> **Fuente de verdad** de lo que la API expone y de lo que la web, el iPad y Windows consumen.
> El original vive en `atm-iris-api/docs/contract/api-v1.md`. Los otros tres repos tienen una
> **copia idéntica** en `docs/api-contract.md`.
>
> Los cuatro agentes trabajan **a la vez** contra este documento: la API lo implementa y los
> clientes lo consumen sin poder probarlo todavía. Por eso:
>
> - **Nadie cambia el contrato por su cuenta.** Si un agente encuentra un hueco o una
>   contradicción, sigue la interpretación más conservadora y lo anota en la sección
>   *Desviaciones* de su fase. El revisor final unifica.
> - Los nombres de campos, rutas, enums y códigos de error de aquí son **exactos**.
>   Mayúsculas, camelCase y plurales importan.

---

## 1. Convenciones generales

| Tema | Regla |
|---|---|
| Base | `http://<host>:3020/api/v1` en local. Todas las rutas de abajo cuelgan de ahí |
| Formato | JSON UTF-8. `Content-Type: application/json` en peticiones con cuerpo |
| Autenticación | `Authorization: Bearer <accessToken>`. Todo es privado salvo lo marcado como **Pública** |
| Fechas | ISO-8601 en UTC con milisegundos: `"2026-10-05T15:30:31.022Z"` |
| IDs | UUID en texto (`"01a10cb0-1d73-709f-b03e-c6c9c36a17f0"`). El servidor genera UUID v7; los clientes pueden mandar UUID v4 o v7 donde se indique `id?` |
| Enums | Viajan en **minúsculas** en inglés (`"ios"`, `"image"`, `"skipped"`) |
| Textos | Todo `message` está en español y se puede mostrar tal cual |
| Vacíos | Un campo opcional sin valor viaja como `null`, nunca se omite en respuestas |
| Request id | El API devuelve `X-Request-Id` en cada respuesta. Si el cliente manda uno, se respeta. Sirve para cruzar logs |
| IP del visitante | La web reenvía `X-Forwarded-For` (ver plan 01 de la API). Las apps nativas no lo mandan |

### 1.1 Respuestas exitosas

```jsonc
// Un objeto
{ "data": { ... } }
// Una lista sin paginar
{ "data": [ ... ] }
// Una lista paginada
{ "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 134, "totalPages": 7 } }
// Sin contenido
HTTP 204, sin cuerpo
```

Paginación: query `page` (≥ 1, por defecto 1) y `limit` (1–100, por defecto 20), salvo donde se indique otro máximo.

### 1.2 Errores

```json
{
  "statusCode": 409,
  "code": "PERSON_NAME_TAKEN",
  "message": "Ya existe una persona con ese nombre.",
  "errors": { "name": "Ya existe una persona con ese nombre." },
  "timestamp": "2026-10-05T15:30:31.022Z",
  "path": "/api/v1/people"
}
```

- `code` es estable y es lo que el cliente compara. `message` puede cambiar.
- `errors` solo aparece cuando hay errores por campo. Las claves usan notación de punto para lo anidado: `"blocks.2.name"`, `"client.platform"`.
- Un recurso de otra iglesia, o borrado, responde **404** (nunca 403: un 403 confirmaría que existe).

| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_FAILED` | 400 | El cuerpo o la query no cumplen el esquema. Trae `errors` |
| `UNAUTHORIZED` | 401 | Sin token, token inválido o vencido, sesión cerrada. **El cliente refresca una vez y reintenta** |
| `FORBIDDEN` | 403 | Reservado. La v1 no tiene permisos por rol (§3), así que hoy la API no lo devuelve |
| `NOT_FOUND` | 404 | No existe en esta iglesia |
| `CONFLICT` | 409 | Choque genérico de unicidad |
| `TOO_MANY_REQUESTS` | 429 | Límite de peticiones |
| `INTERNAL_ERROR` | 500 | Cualquier fallo no controlado (mensaje genérico) |
| `INVALID_CREDENTIALS` | 401 | Login con correo o contraseña incorrectos |
| `EMAIL_TAKEN` | 409 | Registro con un correo existente |
| `INVALID_REFRESH_TOKEN` | 401 | El refresh no sirve: vencido, revocado o reusado. **Volver a la pantalla de acceso** |
| `RESET_CODE_INVALID` | 400 | Código de recuperación incorrecto o vencido |
| `RESET_LIMIT_REACHED` | 400 | Código quemado por intentos |
| `INVALID_CURRENT_PASSWORD` | 400 | Cambio de contraseña con la actual incorrecta |
| `PERSON_NAME_TAKEN` | 409 | Persona duplicada (comparación por *nameKey*, §2) |
| `SERVICE_TYPE_NAME_TAKEN` | 409 | Tipo de servicio duplicado |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Tipo de archivo no permitido para ese `kind` |
| `FILE_TOO_LARGE` | 413 | El archivo supera el máximo del `kind` |
| `STORAGE_QUOTA_EXCEEDED` | 413 | La iglesia superaría su cuota de almacenamiento |
| `UPLOAD_NOT_FOUND` | 400 | Se confirma una subida que no existe, venció o cuyo archivo no llegó al almacenamiento |
| `ID_CONFLICT` | 409 | Un `id` enviado por el cliente ya pertenece a otro recurso |

---

## 2. Reglas compartidas

- **nameKey**: forma con la que se comparan nombres de personas, tipos de servicio y títulos de canciones. Es la cadena con espacios recortados, los espacios internos colapsados a uno, los diacríticos quitados (NFD sin marcas combinantes) y todo en minúsculas. `"  José   Pérez "` → `"jose perez"`. La API lo calcula y guarda; los clientes lo usan para validar antes de enviar.
- **Borrado suave**: personas, tipos de servicio, canciones, medios y registros de tiempos no se borran: se marcan con `deletedAt`. Las listas no los devuelven; la sincronización sí los informa como borrados (§12).
- **Último en escribir gana**: no hay bloqueo optimista en v1. `updatedAt` siempre refleja la última escritura.
- **Idempotencia de creación**: los endpoints de creación marcados con `id?` aceptan un UUID generado por el cliente. Si ese id ya existe **en la misma iglesia**, la API no crea otro: responde 200 con el recurso existente (y lo actualiza en los `PUT`). Si existe en otra iglesia: `409 ID_CONFLICT`. Las consolas lo usan para reintentar desde su cola sin duplicar.
- **Zona horaria**: cada iglesia tiene `timezone` (IANA, por defecto `"America/Lima"`). Todas las fechas viajan en UTC; "hoy", "este mes" y los horarios de los servicios se calculan en la zona de la iglesia.
- **Horario de un servicio**: `weekday` 1 = domingo … 7 = sábado; `hour` 0–23; `minute` 0–59; hora local de la iglesia.

---

## 3. Una cuenta por iglesia

La v1 **no tiene roles, permisos, equipo ni invitaciones**. Cada iglesia tiene una sola cuenta (correo y contraseña) y quien entra con ella puede hacer todo en esa iglesia. La misma cuenta sirve en el iPad, la web y Windows.

- Se crea al registrarse (`POST /auth/sign-up`): crea la iglesia y su cuenta a la vez.
- Una cuenta pertenece a una sola iglesia. No hay selector de iglesia.
- Los clientes **no ocultan ni deshabilitan acciones** según quién entra: todas están disponibles.

---

## 4. Tipos comunes

```ts
type Platform = "web" | "ios" | "windows";

type SessionView = {
  user: { id: string; email: string; fullName: string };
  church: { id: string; name: string; timezone: string };
  session: { id: string; platform: Platform; deviceName: string | null };
};

type AuthResult = SessionView & {
  accessToken: string;
  accessTokenExpiresAt: string;   // ~15 min
  refreshToken: string;
  refreshTokenExpiresAt: string;  // 60 días desde el último uso
};

type ClientInfo = { platform: Platform; deviceName?: string };  // deviceName ≤ 80
```

### 4.1 Ciclo de tokens que implementan todos los clientes

1. Login o registro → guardar `AuthResult` (refresh en almacenamiento seguro).
2. Cada petición lleva el access token. Si al access token le queda menos de 60 s, refrescar **antes** de la petición.
3. Si una petición responde `401 UNAUTHORIZED`: refrescar **una vez** y reintentar. Varias peticiones concurrentes comparten el **mismo** refresh en vuelo (*single flight*).
4. Si `POST /auth/refresh` responde `401` (`INVALID_REFRESH_TOKEN` o `UNAUTHORIZED`): borrar tokens y volver a la pantalla de acceso.
5. Un error de red o 5xx en el refresh **no** cierra la sesión: se reintenta más tarde. Las consolas siguen trabajando sin conexión (§12).

---

## 5. Autenticación — `/auth`

| Método | Ruta | Cuerpo | Respuesta | Acceso |
|---|---|---|---|---|
| POST | `/auth/sign-up` | `{ churchName, fullName, email, password, client: ClientInfo }` | 201 `AuthResult` | Pública |
| POST | `/auth/sign-in` | `{ email, password, client: ClientInfo }` | 200 `AuthResult` | Pública |
| POST | `/auth/refresh` | `{ refreshToken }` | 200 `AuthResult` | Pública |
| POST | `/auth/sign-out` | — | 204 | Sesión |
| POST | `/auth/sign-out-all` | — | 204 (cierra también la actual) | Sesión |
| GET | `/auth/me` | — | 200 `SessionView` | Sesión |
| PATCH | `/auth/me` | `{ fullName }` | 200 `SessionView` | Sesión |
| POST | `/auth/change-password` | `{ currentPassword, password, passwordConfirmation }` | 204. Cierra **las demás** sesiones | Sesión |
| GET | `/auth/sessions` | — | 200 `DeviceSession[]` | Sesión |
| DELETE | `/auth/sessions/:id` | — | 204 (solo sesiones propias; la actual equivale a sign-out) | Sesión |
| POST | `/auth/forgot-password` | `{ email }` | 200 `{ message }`, siempre igual | Pública |
| POST | `/auth/verify-reset-code` | `{ email, code }` | 200 `{ valid: true }` | Pública |
| POST | `/auth/reset-password` | `{ email, code, password, passwordConfirmation }` | 200 `{ message }`. Cierra **todas** las sesiones | Pública |

```ts
type DeviceSession = {
  id: string; platform: Platform; deviceName: string | null;
  createdAt: string; lastUsedAt: string; ipAddress: string | null;
  isCurrent: boolean;
};
```

Reglas:
- Correo: se recorta y se pasa a minúsculas. Contraseña: 8–128 caracteres. Código: exactamente 6 dígitos.
- `sign-in` entra a la iglesia de la cuenta.
- Recuperación: el código vence a los **15 min**, admite **5 intentos** y se envían como máximo **3 por día** por cuenta.
- Límites por IP: `sign-in` 5/min · `sign-up` 5/h · `forgot-password` 3/h · `verify-reset-code` y `reset-password` 10/15 min · general 300/min.

Ejemplo `AuthResult`:

```json
{
  "data": {
    "user": { "id": "01a1…", "email": "pastor@vidanueva.org", "fullName": "Daniel Ruiz" },
    "church": { "id": "01a2…", "name": "Iglesia Vida Nueva", "timezone": "America/Lima" },
    "session": { "id": "01a3…", "platform": "ios", "deviceName": "iPad de la sala" },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…",
    "accessTokenExpiresAt": "2026-10-05T15:45:31.022Z",
    "refreshToken": "01a3….0.tcH1uiV1FWRgmkBfseKFwYHjxV6UDU7qJuShu73pRIA",
    "refreshTokenExpiresAt": "2026-12-04T15:30:31.022Z"
  }
}
```

---

## 6. Iglesia — `/church`

| Método | Ruta | Cuerpo | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/church` | — | `Church` | Sesión |
| PATCH | `/church` | `{ name?, timezone? }` | `Church` | Sesión |
| PUT | `/church/projection` | `ProjectionSettingsInput` | `Church` | Sesión |

```ts
type ProjectionFont =
  | "system" | "inter" | "montserrat" | "poppins" | "oswald"
  | "bebasNeue" | "playfairDisplay" | "lora" | "merriweather";
type ProjectionSettings = {
  fontFamily: ProjectionFont;
  fontSizePt: number;              // 40–200, referido a una pantalla de 1920 de ancho
  fontBold: boolean;               // negrita
  fontItalic: boolean;             // cursiva
  uppercase: boolean;              // todo en mayúsculas
  defaultBackgroundId: string | null;  // fondo cuando no hay ninguno elegido; null = negro
};
type ProjectionSettingsInput = ProjectionSettings;  // defaultBackgroundId: "" o null limpian; fontBold, fontItalic y uppercase omitidos = false
type Church = {
  id: string; name: string; timezone: string;
  projection: ProjectionSettings;   // cómo se ve la letra proyectada; igual en todas las consolas
  storage: StorageUsage;
  createdAt: string; updatedAt: string;
};
type StorageUsage = {
  usedBytes: number;                // suma de breakdown
  quotaBytes: number;               // 5 GiB (5368709120), el mismo para todas las iglesias
  breakdown: {
    musicBytes: number;             // audios: las pistas de las canciones (sección Canciones)
    backgroundBytes: number;        // imágenes y videos con isBackground (sección Fondos)
    mediaBytes: number;             // el resto de imágenes y videos (sección Multimedia)
  };
};
```

- `name` 1–120. `timezone` debe ser una zona IANA válida.
- **Sin módulos ni planes**: todas las iglesias tienen canciones, multimedia, fondos y control de tiempo, y el mismo
  espacio, **5 GiB**.
- **Almacenamiento** (`storage`): la cuota es una sola por iglesia y la comparten pistas, fondos y multimedia.
  `breakdown` dice cuánto ocupa cada sección (solo medios no borrados; las subidas en curso no cuentan aquí).
  En `/sync` la iglesia solo viaja cuando cambia, así que una consola que muestre el uso lo pide a `GET /church`.
- **Letra proyectada** (`projection`): tipografía, tamaño y fondo por defecto, iguales en todas las consolas de la
  iglesia. `fontFamily` es una clave, no un nombre de fuente. Salvo `system` (la fuente del aparato), son fuentes web
  libres (Google Fonts, OFL) que **cada cliente incluye consigo**, para que la letra se vea igual en la computadora,
  el televisor y el iPad: Inter, Montserrat, Poppins, Oswald, Bebas Neue, Playfair Display, Lora y Merriweather (ver
  `src/modules/church/projection-fonts.ts` en la API). Las claves anteriores (fuentes de Apple: `georgia`, `futura`…)
  se migraron a la más parecida y ya no se aceptan (400). `defaultBackgroundId` es el id de un fondo (uno de los degradados fijos o una imagen de la
  biblioteca) que se muestra cuando la consola no tiene ninguno elegido; un id que ya no existe (una imagen
  borrada) cae a negro sin avisar, los clientes no lo validan contra nada.
---

## 7. Reservado

Antes era el equipo (`/members`, `/invitations`). La v1 no tiene equipo, roles ni invitaciones (§3). El número se deja libre para no mover las referencias del resto del documento.

---

## 8. Personas — `/people`

| Método | Ruta | Cuerpo | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/people` | — | `Person[]` (por nombre, sin borrados) | Sesión |
| POST | `/people` | `{ id?, name }` | 201 `Person` (200 si el `id` ya existía) | Sesión |
| PATCH | `/people/:id` | `{ name }` | `Person` | Sesión |
| DELETE | `/people/:id` | — | 204 | Sesión |

```ts
type Person = {
  id: string; name: string;
  blockCount: number;             // bloques dirigidos en registros no borrados, sin contar omitidos ni pendientes
  createdAt: string; updatedAt: string;
};
```

- `name` 1–80. Único por *nameKey* entre las personas no borradas → `PERSON_NAME_TAKEN`.
- Borrar una persona no cambia las plantillas (no llevan responsable). Los registros conservan `personId` y `personName`.

---

## 9. Tipos de servicio — `/service-types`

| Método | Ruta | Cuerpo | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/service-types` | — | `ServiceType[]` (por nombre) | Sesión |
| GET | `/service-types/:id` | — | `ServiceType` | Sesión |
| POST | `/service-types` | `ServiceTypeInput & { id? }` | 201 `ServiceType` | Sesión |
| PUT | `/service-types/:id` | `ServiceTypeInput` | `ServiceType` (reemplazo completo; crea si no existe) | Sesión |
| DELETE | `/service-types/:id` | — | 204 | Sesión |

```ts
type Schedule = { weekday: number; hour: number; minute: number };
type ServiceTypeInput = {
  name: string;                   // 1–60, único por nameKey → SERVICE_TYPE_NAME_TAKEN
  schedule: Schedule | null;
  blocks: BlockTemplateInput[];   // 0–30, el orden del arreglo es el orden del servicio
};
type BlockTemplateInput = {
  id?: string; name: string;      // 1–60
  plannedMinutes: number;         // entero 1–240 (sin responsable: se registra en cada servicio)
};
type BlockTemplate = { id: string; name: string; plannedMinutes: number };
type ServiceType = {
  id: string; name: string; schedule: Schedule | null;
  blocks: BlockTemplate[];        // ya ordenados
  createdAt: string; updatedAt: string;
};
```

- Un tipo "controla tiempo" si tiene al menos un bloque. Sin bloques es "Solo proyección".
- Los bloques sin `id` reciben uno nuevo; los que traen `id` lo conservan. Los que no vienen en el arreglo se eliminan.

---

## 10. Canciones — `/songs`

Una canción es la letra que se proyecta **y** la pista que suena en el salón, juntas: al elegirla en la consola ya
están las dos. Puede tener solo letra, solo pista o ambas, nunca ninguna. La pista es **un audio subido** (uno a uno
con la canción) **o un video de YouTube** (también YouTube Music), nunca los dos.

| Método | Ruta | Cuerpo / query | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/songs` | `?search=&page=&limit=&sort=title\|-updatedAt` | paginado `SongSummary[]` | Sesión |
| GET | `/songs/:id` | — | `Song` | Sesión |
| POST | `/songs` | `SongInput & { id? }` | 201 `Song` | Sesión |
| PUT | `/songs/:id` | `SongInput` | `Song` (crea si no existe) | Sesión |
| DELETE | `/songs/:id` | — | 204 | Sesión |

```ts
type SongSectionInput = { label: string | null; text: string };   // label ≤ 40 (opcional; la web lo escribe como `#Coro` en la letra), text 1–2000
type SongInput = {
  title: string;                  // 1–120
  author: string;                 // 0–120 ("" si no hay)
  sections: SongSectionInput[];   // 0–80, en orden ([] si es solo pista)
  audioId?: string | null;        // la pista: id de un MediaAsset de audio (§11). Omitido = null
  youtubeId?: string | null;      // o la pista en YouTube: id del video, 11 caracteres [A-Za-z0-9_-]. Omitido = null
  youtubeMusic?: boolean;         // el enlace era de YouTube Music (solo música). Omitido = false; sin youtubeId se guarda false
};
type SongSection = { id: string; label: string | null; text: string };
type Song = {
  id: string; title: string; author: string;
  sections: SongSection[];        // [] si es solo pista
  audio: MediaAsset | null;       // la pista (§11); null si es solo letra o si está en YouTube
  youtubeId: string | null;       // la pista en YouTube
  youtubeMusic: boolean;          // de YouTube Music (solo música) o de YouTube (con video): cambia solo cómo se muestra
  createdAt: string; updatedAt: string;
};
type SongSummary = {
  id: string; title: string; author: string;
  sectionCount: number; firstLine: string | null;
  audio: MediaAsset | null;
  youtubeId: string | null;
  youtubeMusic: boolean;
  updatedAt: string;
};
```

- `search` busca sin acentos ni mayúsculas en título, autor y texto de las secciones; ordena por relevancia cuando hay búsqueda. `limit` máximo 100. Sin `sort`, se ordena por título.
- Los títulos **no** son únicos (dos iglesias pueden cantar dos versiones). Dos canciones con el mismo título son dos letras distintas.
- **Letra o pista**: sin secciones, sin `audioId` y sin `youtubeId` → 400 `VALIDATION_FAILED` (`errors.sections`:
  "Agrega la letra o una pista."). `audioId` y `youtubeId` juntos → 400 (`errors.youtubeId`: "La pista es un audio o un
  video de YouTube, no los dos."). Un `youtubeId` mal formado → 400 (`errors.youtubeId`: "Ese no es un video de
  YouTube.").
- **La pista en YouTube** no se descarga ni ocupa cuota: la consola la reproduce con el reproductor de YouTube (IFrame
  Player API), **visible en la consola**, y las pantallas muestran la letra. Necesita internet. El cliente saca el id
  del enlace (`youtube.com/watch?v=`, `youtu.be/`, `music.youtube.com/watch?v=`, `shorts/`; `youtubeMusic: true` si
  era de `music.youtube.com`) y, antes de guardarlo,
  conviene que revise con oEmbed (`https://www.youtube.com/oembed?format=json&url=…`) que el video existe y se puede
  reproducir fuera de YouTube (401/403 = no se puede). La API solo valida el formato. Pasar de audio a YouTube con
  `PUT` borra el audio anterior, como cualquier cambio de `audioId`.
- **La pista** se sube como cualquier audio (§11: ticket, `PUT`, confirmar) y luego se asigna con `audioId`. Tiene que
  ser un audio vivo de la iglesia (`errors.audioId`: "Esa pista no existe.") y no ser ya de otra canción
  (`errors.audioId`: "Esa pista ya es de otra canción.").
  Un audio que ninguna canción usa 24 h después de subirlo (una pista que nunca se guardó) se borra solo.
- `PUT` es reemplazo completo: si `audioId` cambia o viaja `null`, la pista anterior **se borra** y libera la cuota.
  Borrar la canción borra también su pista. Borrar el audio directo (`DELETE /media/:id`) deja la canción con su letra
  y `audio: null`, o borra la canción (y su lugar en el plan) si era solo pista.
- El texto llega ya dividido en secciones: el formato de texto plano (`[Coro]`, línea en blanco entre diapositivas) lo resuelve cada cliente. Regla de referencia: `atm-iris-web/src/lib/lyrics.ts`.

---

## 11. Multimedia — `/media`

La subida va **directo al almacenamiento** (S3 compatible: Cloudflare R2 en producción, MinIO en local) con una URL firmada. La API nunca recibe los bytes.

| Método | Ruta | Cuerpo / query | Respuesta | Acceso |
|---|---|---|---|---|
| POST | `/media/uploads` | `{ kind, fileName, contentType, sizeBytes }` | 201 `UploadTicket` | Sesión |
| POST | `/media` | `{ uploadId, title, description?, durationSeconds?, width?, height?, isBackground? }` | 201 `MediaAsset` | Sesión |
| GET | `/media` | `?kind=&search=&isBackground=&page=&limit=` (`kind` acepta varios separados por coma: `image,video`) | paginado `MediaAsset[]` (más reciente primero) | Sesión |
| GET | `/media/:id` | — | `MediaAsset` | Sesión |
| GET | `/media/:id/download-url` | — | `{ url, expiresAt }` (GET firmado, 1 h) | Sesión |
| PATCH | `/media/:id` | `{ title?, description?, isBackground? }` | `MediaAsset` | Sesión |
| DELETE | `/media/:id` | — | 204 (libera la cuota; el archivo se borra del almacenamiento después) | Sesión |

```ts
type MediaKind = "image" | "video" | "audio";
type UploadTicket = {
  uploadId: string;
  uploadUrl: string;              // PUT firmado
  headers: Record<string, string>;// el cliente los manda tal cual en el PUT (incluye Content-Type)
  expiresAt: string;              // 1 h
};
type MediaAsset = {
  id: string; kind: MediaKind; title: string; description: string | null;
  fileName: string; contentType: string; sizeBytes: number;
  durationSeconds: number | null; // audio y video
  width: number | null; height: number | null;   // imagen y video
  isBackground: boolean;          // fondo de las letras (imagen o video); ver "Fondos" abajo
  createdAt: string; updatedAt: string;
};
```

| `kind` | Tipos permitidos | Máximo |
|---|---|---|
| `image` | `image/jpeg`, `image/png`, `image/webp` | 20 MB |
| `video` | `video/mp4`, `video/quicktime` | 2 GB |
| `audio` | `audio/mpeg`, `audio/mp4`, `audio/aac`, `audio/wav`, `audio/x-wav` | 200 MB |

**Fondos** (`isBackground: true`): imágenes o videos que las consolas muestran detrás de la letra. Al confirmar (`POST /media`) o al marcarlo (`PATCH`) la API valida, con los metadatos del medio, y responde 400 `VALIDATION_FAILED` (`errors.isBackground`) con el motivo:

| | Imagen | Video |
|---|---|---|
| Formato | JPG, PNG, WebP | MP4 o MOV |
| Tamaño y proporción | cualquiera | cualquiera |
| Duración | — | hasta **30 s** (con 0,5 s de margen); las consolas lo repiten en bucle y sin sonido. Sin `durationSeconds` → "No pudimos medir el video." |
| Peso | hasta 15 MB | hasta 200 MB |

**El fondo siempre llena la pantalla**: las consolas lo muestran recortando lo que sobra (como `object-fit: cover`,
centrado). Un archivo vertical o pequeño se acepta igual; solo se verá recortado o menos nítido. Un audio no puede ser
fondo. Los fondos cuentan para la cuota como cualquier medio.

Flujo:
1. `POST /media/uploads` valida tipo, tamaño y cuota (`UNSUPPORTED_MEDIA_TYPE`, `FILE_TOO_LARGE`, `STORAGE_QUOTA_EXCEEDED`).
2. El cliente hace `PUT uploadUrl` con los `headers` y los bytes.
3. `POST /media` confirma: la API comprueba que el objeto existe y que su tamaño coincide (`UPLOAD_NOT_FOUND` si no) y crea el `MediaAsset`. Los metadatos (`durationSeconds`, `width`, `height`) los mide el cliente que sube.
4. Las consolas descargan con `GET /media/:id/download-url` y guardan el archivo en caché por `id` + `updatedAt`.

**Secciones de la web**: **Canciones** (§10: la letra y su pista, un audio de aquí), **Fondos**
(`isBackground=true`) y **Multimedia** (`kind=image,video&isBackground=false`, material para una ocasión). Las pistas,
los fondos y la multimedia son el mismo `MediaAsset` y comparten la cuota; la letra no ocupa almacenamiento. Un audio
siempre es la pista de una canción: no hay audios sueltos.

**Qué descarga una consola y cuándo** (los archivos no viven en una carpeta del equipo: salen de aquí):
- **Imágenes y fondos** (también los videos de fondo): todos, apenas llegan por `/sync`. Son livianos y se
  necesitan al instante.
- **Pistas y videos**: solo los que se usan. La descarga empieza apenas están en el plan (§15), lo haya armado la web
  u otra consola, al llegar por `/sync`; también al agregarlos al servicio en la consola (o al reproducirlos, si
  todavía no estaban). La pista de una canción se descarga cuando la canción está en el plan o en el servicio. El
  archivo se queda en el equipo para la próxima vez.
- Lo borrado (`deleted.media` en `/sync`, o un `updatedAt` nuevo) se elimina del equipo en la siguiente
  sincronización. El archivo sigue en el almacenamiento 24 h después del borrado, así una consola atrasada no se
  queda a medias.

Las subidas sin confirmar vencen a la hora y se limpian solas.

---

## 11b. Videos de YouTube — `/youtube-videos`

Los videos de YouTube (y de YouTube Music) que la iglesia guarda en Multimedia, pestaña YouTube. Solo se guarda el
enlace: el video se reproduce en el reproductor de YouTube y nada se descarga ni ocupa espacio del almacenamiento (§6).
No entra en `/sync` por ahora (solo la web los usa).

| Método | Ruta | Cuerpo | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/youtube-videos` | — | `YoutubeVideo[]` (el más nuevo primero) | Sesión |
| GET | `/youtube-videos/:id` | — | `YoutubeVideo` (404 si no existe) | Sesión |
| POST | `/youtube-videos` | `{ id?, videoId, title, author? }` | 201 `YoutubeVideo` (200 si el `id` o el video ya estaban en la iglesia) | Sesión |
| DELETE | `/youtube-videos/:id` | — | 204 (también lo quita del plan, §15) | Sesión |

```ts
type YoutubeVideo = {
  id: string;
  videoId: string;       // los 11 caracteres del video: [A-Za-z0-9_-]{11}
  title: string;         // 1–200
  author: string;        // 0–200
  createdAt: string; updatedAt: string;
};
```

- La web lee el título y el autor de YouTube (oEmbed) y los manda; la API no sale a internet.
- Un mismo video no se guarda dos veces en la iglesia: guardarlo de nuevo devuelve el que ya estaba.

---

## 12. Sincronización de las consolas — `/sync`

Las consolas (iPad y Windows) trabajan **sin conexión**: guardan una copia local de la iglesia y la ponen al día con este feed. La web no lo usa.

| Método | Ruta | Query | Respuesta |
|---|---|---|---|
| GET | `/sync/changes` | `since` (cursor, `"0"` la primera vez) · `limit` (1–500, por defecto 200) | `SyncPage` |

```ts
type SyncPage = {
  church: Church | null;          // presente si la iglesia (nombre, zona, proyección) cambió después de `since`
  changes: {
    people: Person[];
    serviceTypes: ServiceType[];
    songs: Song[];                // completas, con secciones y pista
    media: MediaAsset[];
    serviceRecords: ServiceRecord[];
    servicePlan: ServicePlanItem[]; // §15
  };
  deleted: {                      // ids borrados (suave) después de `since`
    people: string[]; serviceTypes: string[]; songs: string[]; media: string[]; serviceRecords: string[];
    servicePlan: string[];
  };
  cursor: string;                 // guardar y mandar como `since` la próxima vez
  hasMore: boolean;               // si es true, pedir otra página de inmediato con el cursor nuevo
};
```

Reglas:
- Cada fila sincronizable lleva un número de versión global y creciente. El cursor es la versión más alta entregada; el cliente lo trata como **texto opaco**.
- `limit` cuenta entidades (cambios + borrados) en total. Dentro de una página, todo viene ordenado por versión.
- Un recurso que cambió y luego se borró aparece **solo** en `deleted`.
- Primera sincronización: `since=0` y repetir mientras `hasMore` sea `true`. Eso es la copia completa.
- Cuándo sincronizar (clientes): al abrir la app con sesión, al volver al Inicio, cada 5 min mientras el Inicio está visible, al recuperar la conexión, y con el botón "Actualizar". **Nunca** durante un servicio en curso en la consola: la consola trabaja con la copia que tenía al iniciarlo.
- Escrituras sin conexión: las consolas encolan (*outbox*) las creaciones con `id` propio (`POST /people`, `PUT /service-records/:id`, `PUT /service-types/:id`) y las reenvían en orden al volver la conexión. Gracias a la idempotencia (§2) un reintento nunca duplica.

---

## 13. Biblia — `/bible`

Texto: **Reina-Valera 1909** (dominio público), código `rvr1909`. Es la misma para todas las iglesias, sin selector:
el texto es global (no tiene `churchId`). Las rutas ya aceptan un `:code`, así que otra traducción (cuando haya
licencia) se suma importando su archivo, sin cambiar el contrato.

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/bible/translations` | `BibleTranslation[]` |
| GET | `/bible/translations/:code/books` | `BibleBook[]` (canónico, Génesis → Apocalipsis) |
| GET | `/bible/translations/:code/books/:bookId/chapters/:chapter` | `{ bookId, chapter, verses: { number: number; text: string }[] }` |
| GET | `/bible/translations/:code/download` | `BibleDownload` (gzip; `ETag` = versión) |

```ts
type BibleTranslation = { code: string; name: string; language: "es"; version: number; sizeBytes: number };
type BibleBook = {
  id: string;                     // código USFM: "GEN", "PSA", "JHN", "REV"
  name: string;                   // "Génesis", "Salmos", "Juan", "Apocalipsis"
  testament: "old" | "new";
  chapterCount: number;
  position: number;               // 1–66
};
type BibleDownload = {
  code: string; name: string; version: number;
  books: (BibleBook & { chapters: string[][] })[];   // chapters[c][v] = texto del versículo c+1:v+1
};
```

- Las consolas descargan `download` una vez (y de nuevo si cambia `version`) y buscan sin conexión. La web pide solo
  el capítulo que se va a proyectar.
- Un capítulo que no existe → 404. Algunos versículos vienen con texto vacío: en esta edición están unidos al
  anterior (p. ej. Números 12:16).
- Requieren sesión.

---

## 14. Tiempos — `/service-records`

| Método | Ruta | Cuerpo / query | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/service-records` | `?from=&to=&serviceTypeId=&status=&page=&limit=` (limit ≤ 500) | paginado `ServiceRecord[]` (más reciente primero) | Sesión |
| GET | `/service-records/:id` | — | `ServiceRecord` | Sesión |
| PUT | `/service-records/:id` | `ServiceRecordInput` | 201 si lo crea · 200 si ya existía | Sesión |
| PATCH | `/service-records/:id/blocks/:blockId` | `{ actualSeconds?, personId? }` | `ServiceRecord` | Sesión |
| DELETE | `/service-records/:id` | — | 204 | Sesión |

```ts
type RecordStatus = "inProgress" | "finished";
type BlockStatus = "pending" | "running" | "completed" | "skipped" | "adjusted";
type BlockRecordInput = {
  id: string;                     // generado por la consola
  name: string;                   // 1–60
  plannedSeconds: number;         // entero ≥ 0
  actualSeconds: number;          // entero ≥ 0 (0 si skipped o pending)
  personId: string | null;
  personName: string | null;      // nombre en ese momento
  status: "pending" | "running" | "completed" | "skipped";
  startedAt?: string | null;      // UTC; reloj de la consola, para retomar
  endedAt?: string | null;        // UTC
};
type ServiceRecordInput = {
  status?: RecordStatus;          // por defecto "finished"
  date: string;                   // inicio del primer bloque, UTC
  serviceTypeId: string;
  serviceTypeName: string;        // copia, para mostrar si el tipo se borra
  blocks: BlockRecordInput[];     // 1–60, en orden
};
type BlockRecord = BlockRecordInput & {
  status: BlockStatus; startedAt: string | null; endedAt: string | null;
};
type ServiceRecord = ServiceRecordInput & {
  id: string; status: RecordStatus; blocks: BlockRecord[];
  createdAt: string; updatedAt: string;
};
```

- `from` y `to` son instantes UTC (inclusivo / exclusivo) sobre `date`.
- **Servicio en curso.** La consola guarda el registro con `status: "inProgress"` en cuanto empieza el primer
  bloque y lo reenvía con el mismo `id` en cada cambio (siguiente bloque, responsable, omitir, editar pendientes);
  al terminar lo manda `finished`. Así, si la app se cierra, ella misma u otra consola lo retoma desde la copia
  local o `/sync` (el bloque `running` sigue contando desde su `startedAt`). En curso hay a lo sumo un bloque
  `running`; terminado solo hay `completed`, `skipped` o `adjusted`.
- Un registro terminado no vuelve a estar en curso: ese `PUT` responde 409 `RECORD_FINISHED` (una consola
  atrasada no reabre lo que otra terminó). El `PATCH … { actualSeconds }` de un registro en curso responde 400.
- Sin `status` el registro llega terminado: así guardan las consolas anteriores, que solo envían al final.
- Los clientes muestran un registro en curso como "En curso" y lo dejan fuera de promedios, excesos y
  resúmenes hasta que termine; `Person.blockCount` (§8) no cuenta sus bloques `pending`.
- `PATCH … { actualSeconds }` marca el bloque `adjusted`. `{ personId }` actualiza también `personName` con el nombre actual (o `null`).
- **Solo tiempos**, nunca contenido proyectado. Las estadísticas (promedios, excesos, por persona, por bloque) las calcula cada cliente con las reglas de `IRIS_SPEC.md` §7.10: exceso = real − previsto si > 0, sin margen; los omitidos no cuentan.

---

## 15. Plan de servicio — `/service-plan`

Lo que la web adelanta para el próximo servicio, sin importar el tipo (General, Escuela Dominical, Jóvenes...):
cuando una consola abre, ya está cargado. No guarda historial por servicio, solo el estado actual; se agrega y se
quita desde cualquier cliente (web, iPad, Windows) y el cambio se ve en los demás por `/sync` (§12, es la 6.ª
entidad del feed).

| Método | Ruta | Cuerpo | Respuesta | Acceso |
|---|---|---|---|---|
| GET | `/service-plan` | — | `ServicePlanItem[]` (en orden) | Sesión |
| POST | `/service-plan` | `{ id?, kind, refId }` | 201 `ServicePlanItem` (200 si el `id` ya existía) | Sesión |
| PUT | `/service-plan/:id/position` | `{ position }` | 204 | Sesión |
| DELETE | `/service-plan/:id` | — | 204 | Sesión |
| DELETE | `/service-plan` | — | 204 (vacía todo el plan) | Sesión |

```ts
type ServicePlanItem = {
  id: string; kind: "song" | "media" | "bible" | "youtube"; refId: string; position: number;   // media = imagen o video
  createdAt: string; updatedAt: string;
};
```

- `refId` es el id de una canción (§10, con su pista si tiene) o de una imagen o video (§11); la API responde 400
  `VALIDATION_FAILED` (`errors.refId`) si no existe.
- **Video de YouTube** (`kind: "youtube"`): `refId` es el `id` de un `YoutubeVideo` (§11b); 400 (`errors.refId`:
  "Ese video no existe.") si no está en la biblioteca.
- **Pasaje** (`kind: "bible"`): `refId` es `<traducción>:<libro USFM>.<capítulo>.<desde>[-<hasta>]`, dentro de un
  capítulo: `rvr1909:JHN.3.16` (un versículo), `rvr1909:PSA.23.1-6` (seis). Lleva la traducción para que el plan
  siga diciendo cuál era si algún día hay otra. Si algún versículo del rango no existe → 400 (`errors.refId`: "Ese
  pasaje no existe."). El texto no se copia al plan: el cliente lo lee de §13. Una pista no se agrega suelta: `kind: "media"` con un audio
  responde "Las pistas se agregan con su canción.".
- Si la canción, el medio o el video referenciado se borra, su elemento del plan se borra (suave) con él: nunca queda una
  referencia colgando (mismo principio que `projectionDefaultBackground`, §6, pero aquí sí se limpia porque el
  plan no tiene sentido con una referencia que ya no existe).
- `position` ordena la lista desde 0; `PUT .../position` reubica un elemento y recorre los demás para no dejar
  huecos ni choques.

---

## 16. Salud

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/health` | **Pública**. `{ data: { status: "ok", info: { database: { status: "up" }, storage: { status: "up" } } } }` |

---

## 17. Versión de las apps — `/app-version`

Las apps de escritorio y de iPad preguntan al abrir si su versión sigue vigente. Si es anterior a la publicada, muestran
un aviso que **obliga a actualizar** antes de continuar. La versión publicada de cada plataforma se cambia a mano en la
base (tabla `app_versions`, o `pnpm db:set-app-version`) **cuando la versión nueva ya se puede descargar**.

| Método | Ruta | Respuesta | Acceso |
|---|---|---|---|
| GET | `/app-version?platform=ios\|windows&version=1.0.0` | `AppVersionCheck` | **Pública** (se consulta antes de iniciar sesión) |

```ts
type AppVersionCheck = {
  platform: "ios" | "windows";
  latestVersion: string;          // la versión publicada hoy
  updateRequired: boolean;        // true si `version` es anterior a `latestVersion`
  downloadUrl: string | null;     // a dónde lleva "Actualizar" (iPad: TestFlight o App Store)
  notes: string | null;           // qué trae, en una línea
};
```

- Las versiones son números separados por punto (`1.0`, `1.0.1`, `2.3.4.5`) y se comparan por número: `1.10.0` es mayor
  que `1.9.0`; las partes que faltan valen 0 (`1.0` = `1.0.0`). Cualquier otro formato responde 400 `VALIDATION_FAILED`.
- **Un fallo nunca bloquea a nadie.** Sin conexión, con la API caída o con cualquier error (incluido 400), la app abre
  normal: solo `updateRequired: true` obliga a actualizar. Nunca se muestra con un servicio en curso.
- Sin fila para la plataforma, `updateRequired` es `false`.

---

## 18. Pantallas (televisores) — `/displays`

Un televisor con navegador (o cualquier pantalla con internet) muestra lo que manda la consola, sin cables. Se
vincula a la iglesia **una vez**, con un código como el de Netflix, y queda vinculado hasta que se lo desvincule.

| Método | Ruta | Cuerpo / cabecera | Respuesta | Acceso |
|---|---|---|---|---|
| POST | `/displays/pairings` | — | 201 `DisplayPairing` | **Pública** (20/min por IP) |
| GET | `/displays/pairings/:id` | cabecera `X-Pairing-Secret: <secret>` | `PairingStatus` | **Pública** |
| POST | `/displays` | `{ code, name }` | 201 `Display` | Sesión |
| GET | `/displays` | — | `Display[]` (por fecha de vinculación) | Sesión |
| DELETE | `/displays/:id` | — | 204 | Sesión |
| PUT | `/displays/state` | `{ frame?, preload?, clock, displayId? }` | 204 | Sesión |
| GET | `/displays/stream` | `Authorization: Bearer <token del televisor>` | canal SSE (`text/event-stream`) | Token del televisor |

```ts
type DisplayPairing = { id: string; code: string; secret: string; expiresAt: string };  // code: 6 de A–Z sin I/L/O y 2–9
type PairingStatus =
  | { status: "pending" }
  | { status: "paired"; token: string; display: { id: string; name: string } };          // sale UNA vez
type Display = { id: string; name: string; online: boolean; lastSeenAt: string | null; createdAt: string };
```

**Vincular**
1. El televisor pide un código (`POST /displays/pairings`) y lo muestra en grande. Vence a los 10 minutos.
2. Pregunta cada 2 s (`GET /displays/pairings/:id` con su `secret`) hasta recibir `paired`. Un código vencido, ya
   recogido o con otro `secret` → 404 (pide uno nuevo).
3. En la consola alguien escribe el código y un nombre (`POST /displays`; mayúsculas o minúsculas da igual).
   Código inexistente, vencido o ya usado → 400 `VALIDATION_FAILED` (`errors.code`: "Ese código no existe o ya venció.").
   `name` 1–60.
4. El televisor recibe su `token` (una sola vez) y lo guarda. Con él abre el canal cada vez que se enciende.

**El canal** (`GET /displays/stream`, Server-Sent Events). Eventos:
- `state` `{ frame, preload, clock, receivedAt, now }` — al conectarse: lo último que mandó la consola (`frame: null`,
  `preload: []` y horas `null` si todavía nada).
- `frame` `{ frame, clock, receivedAt, now }` y `preload` `{ preload, clock, receivedAt, now }` — cada vez que la consola
  manda algo.
- Las horas (epoch ms): `clock` es el reloj de la consola al mandarlo, `receivedAt` el del API al recibirlo y `now` el
  del API al enviar el evento. El televisor pasa una hora de la consola a la suya sumándole
  `(receivedAt − clock) + (Date.now() − now)`; así los videos quedan en sincronía aunque los relojes difieran.
- `bye` `{}` — lo desvincularon: borra su token y vuelve a pedir un código.
- Cada 20 s llega un comentario (`: ok`) para mantenerlo abierto. Si se corta, el navegador se reconecta solo
  (`retry: 2000`). Un token desvinculado o inválido → 401: el televisor vuelve a pedir un código.

**Lo que manda la consola** (`PUT /displays/state`): el cuadro (`frame`) y/o la lista de archivos a precargar
(`preload`), con `clock` = `Date.now()` de la consola al mandarlo. Con `displayId` solo ese televisor lo recibe (el que
proyecta); los demás no hacen nada: si ya estaban conectados quedan en blanco y los que se conecten después reciben el
estado vacío. Sin `displayId` llega a todos los de la iglesia. Al cambiar de televisor, la consola vuelve a mandar el
cuadro y la lista completos al nuevo. **El API no interpreta ni guarda en la base el cuadro
ni la lista**: los reenvía a los televisores de la iglesia y recuerda el último (en memoria) para el que se conecte
después. Su forma la definen los clientes (referencia: `ProjectionFrame` y `PreloadFile` en
`atm-iris-web/src/features/projection/`). Las horas dentro del cuadro (`at` de un video) vienen en el reloj de la
consola: el televisor las corrige como se explica arriba.

- `online` es `true` mientras el televisor tiene el canal abierto. Desvincular (`DELETE`) cierra su canal en el acto.
- El canal y las vinculaciones pendientes viven en memoria: un reinicio del API corta los canales (se reconectan
  solos) y anula los códigos sin usar.
