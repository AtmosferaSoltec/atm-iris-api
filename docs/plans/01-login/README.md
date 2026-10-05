# 01 · Login y sesiones — ✅ completada

## Objetivo

Que cada cliente (web, iPad, Windows) pueda crear una cuenta de iglesia, iniciar sesión y
**no volver a pedir la contraseña** mientras el dispositivo se siga usando. Si alguien
olvida su contraseña, la recupera con un código de 6 dígitos que llega a su correo.

## Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Access token | JWT HS256 de **15 min**: `{ sub, churchId, sid, role }` | Corto: es lo que viaja en cada petición |
| Refresh token | Opaco, **60 días deslizantes**: cada uso renueva el plazo | La consola se usa cada semana; 60 días aguantan un mes sin servicio (vacaciones) sin pedir contraseña un domingo |
| Caducidad absoluta | **No hay** | Un "vence al año" caería tarde o temprano justo antes de un servicio |
| Sesiones | Una fila por dispositivo (`sessions`) | Permite cerrar la sesión de un dispositivo y "cerrar sesión en todos" |
| Rotación | Cada refresh invalida el token anterior | Un token robado deja de servir en cuanto el dueño lo usa |
| Reuso | Presentar un token ya rotado **revoca la sesión** | Es la señal de que dos personas tienen el mismo token |
| Gracia | 30 s: si el token anterior llega dentro de esa ventana, se devuelve el par vigente sin revocar | Las apps disparan peticiones en paralelo y dos pueden refrescar a la vez |
| Revocación inmediata | `JwtAuthGuard` comprueba en cada petición que la sesión `sid` siga activa | Cerrar sesión corta el acceso al instante, no a los 15 min. Es una consulta por clave primaria |
| Contraseñas | argon2 (`@node-rs/argon2`), 8–128 caracteres | Convención de la casa |
| Recuperación | 3 pasos: correo → código de 6 dígitos → contraseña nueva y confirmación → login | Pedido del producto |
| Código | 15 min, un solo uso, hasheado, 5 intentos, 3 envíos por día por usuario | Igual que La Vendimia |
| Enumeración | `forgot-password` responde igual exista o no el correo | Lo contrario convierte el endpoint en un verificador de correos. La pantalla 2 siempre aparece |
| Tras restablecer | Se revocan **todas** las sesiones y se envía "Tu contraseña cambió" | Quien cambia su contraseña espera que nadie más siga dentro |
| Verificación de correo | **Fuera de la V1** | El producto no la pide; el código de recuperación ya demuestra que el correo es del usuario cuando importa |
| Correo | `MailPort` → Resend en producción, `ConsoleMailService` (log) sin credenciales | Convención de la casa |

## Desviaciones de `forma-de-trabajo.md`

| Convención | En Iris | Motivo |
|---|---|---|
| §2.7 JWT único de 12 h en cookie, sin refresh ni tabla de sesiones | Access 15 min + refresh 60 días + tabla `sessions` | Las consolas de iPad y Windows inician sesión una sola vez y no tienen cookies de navegador |
| §2.7 / §4.3 La sesión viaja en cookie `httpOnly` que pone el API | El API entrega los tokens en el cuerpo y los recibe en `Authorization: Bearer` | Un solo contrato para los tres clientes. La web los guarda en su propia cookie `httpOnly` cifrada (patrón BFF) y nunca los expone al navegador |
| §2.7 Permisos sembrados en tablas | Rol `owner` / `member` en la membresía, sin tabla de permisos todavía | Hoy no hay pantallas que dependan de permisos finos. Se agrega cuando haya invitaciones |
| §2.8 Auditoría | No en esta etapa | Llega con las primeras escrituras de negocio (etapa 02) |

## Modelo

```text
churches          id, name, created_at, updated_at
users             id, email (único), password_hash, full_name, is_active, last_login_at,
                  password_changed_at, created_at, updated_at
church_members    id, church_id, user_id, role (owner|member), is_active, created_at, updated_at
                  único (church_id, user_id)
sessions          id, user_id, church_id, platform (web|ios|windows), device_name,
                  refresh_generation, rotated_at, last_used_at, expires_at,
                  revoked_at, revoked_reason, ip_address, user_agent, created_at
password_reset_codes  id, user_id, code_hash, expires_at, verification_attempts, used_at, created_at
```

Un usuario puede pertenecer a varias iglesias (membresía), como en el resto de proyectos de
la casa. En la V1 el registro crea una iglesia con su dueño, y el login entra a la membresía
activa más antigua. Elegir o cambiar de iglesia llega con las invitaciones.

### Refresh token sin guardar el token

Formato `"<sessionId>.<generation>.<firma>"`, donde la firma es `HMAC-SHA256(REFRESH_TOKEN_SECRET, "<sessionId>.<generation>")`.

- La base solo guarda `refresh_generation`. Una fuga de la tabla no entrega ningún token válido.
- Refrescar con la generación actual → `generation + 1`, y se renuevan `expires_at` y `last_used_at`.
- Con la generación anterior, dentro de los 30 s de gracia → se devuelve el token de la generación vigente, que el servidor puede volver a firmar. Las dos peticiones paralelas terminan con el mismo token.
- Con cualquier otra generación → reuso → sesión revocada (`token_reuse`).

## Endpoints (`/api/v1/auth`)

| Método | Ruta | Cuerpo | Respuesta (`{ data }`) |
|---|---|---|---|
| POST | `/sign-up` | `{ churchName, fullName, email, password, client }` | 201 `AuthResult` · 409 `EMAIL_TAKEN` |
| POST | `/sign-in` | `{ email, password, client }` | 200 `AuthResult` · 401 `INVALID_CREDENTIALS` |
| POST | `/refresh` | `{ refreshToken }` | 200 `AuthResult` · 401 `INVALID_REFRESH_TOKEN` |
| POST | `/sign-out` | — (Bearer) | 204 |
| POST | `/sign-out-all` | — (Bearer) | 204 |
| GET | `/me` | — (Bearer) | 200 `Session` |
| POST | `/forgot-password` | `{ email }` | 200 `{ message }`, siempre igual |
| POST | `/verify-reset-code` | `{ email, code }` | 200 `{ valid: true }` · 400 `RESET_CODE_INVALID` / `RESET_LIMIT_REACHED` |
| POST | `/reset-password` | `{ email, code, password, passwordConfirmation }` | 200 `{ message }` |

```text
client     = { platform: "web" | "ios" | "windows", deviceName?: string }
Session    = { user: { id, email, fullName }, church: { id, name }, role: "owner" | "member",
               session: { id, platform, deviceName } }
AuthResult = Session & { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt }
```

Límites: general 300/min por IP; `sign-in` 5/min; `sign-up` 5/h; `forgot-password` 3/h;
`verify-reset-code` y `reset-password` 10/15 min.

## Pasos

1. Plumbing de la casa: `config/`, `common/` (filtros, interceptor `{ data }`, pipe Zod, `@Public`, `@CurrentUser`, `JwtAuthGuard`), `database/`, `integrations/mail/`, `health`.
2. `prisma.config.ts`, `schema.prisma` con el modelo de arriba y migración `auth_and_sessions`.
3. Módulo `auth`: controller → service → repository, `TokenService`, `RefreshTokenService`, `ResetCodeService`.
4. Plantillas MJML: código de recuperación y contraseña cambiada.
5. Pruebas unitarias (servicios con repositorio doblado) y e2e contra la base real.
6. Web: `DATA_SOURCE=api`, tokens en cookie cifrada, refresh en `proxy.ts`, recuperación en 3 pantallas.

## Criterios de aceptación

- Crear cuenta deja una sesión abierta y `GET /me` devuelve la iglesia.
- Credenciales incorrectas responden 401 con el mismo mensaje exista o no el correo.
- Un refresh rota el token. Usar el viejo fuera de la gracia revoca la sesión.
- Cerrar sesión invalida el access token al instante.
- La recuperación funciona en 3 pasos; tras restablecer se revocan todas las sesiones y el login con la contraseña nueva funciona.
- Sin `RESEND_API_KEY` el código aparece en el log. En producción el API no arranca sin correo.
- `pnpm lint`, `pnpm test` y `pnpm test:e2e` en verde.

## Desviaciones durante la implementación

| Qué | Motivo |
|---|---|
| La base `iris` ya existía con tablas de un intento anterior sin código. Se vació el esquema y se le dio contraseña nueva a `iris_app` (con aprobación). Se agregó `atmosfera-postgres/initdb/04-iris.sh` para reproducirla | No había código que explicara esas tablas; empezar limpio evita arrastrar un modelo desconocido |
| Sin `seed.ts` de producción; solo `seed-dev.ts` | Iris aún no tiene catálogos ni permisos que sembrar en cada despliegue. Llega cuando los haya |
| La web separa `AUTH_SOURCE` y `DATA_SOURCE` | El auth es real desde esta etapa; el resto de datos llega en las etapas 02–04 |
| El refresh de la web vive en `proxy.ts` de Next | Los Server Components no pueden escribir cookies; el proxy corre antes de cada página y de cada Server Action |
| La web reenvía `X-Forwarded-For` al API | Sin eso, el límite de 5 logins por minuto contaría a todos los visitantes como una sola IP |
