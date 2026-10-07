> **Retirado (2026-10-06).** La v1 ya no tiene roles, equipo ni invitaciones: cada iglesia tiene una sola cuenta.
> Este plan queda como historial. Lo vigente está en `docs/contract/api-v1.md` §3 y en `docs/BACKEND_SPEC.md`.

# 02 · Cuenta y equipo

## Objetivo

Completar la sección **5 (Autenticación)** y **7 (Equipo)** del contrato: roles `owner/admin/operator`
con permisos en la sesión, varias iglesias por usuario, perfil, cambio de contraseña, lista de
dispositivos e invitaciones por correo.

## Dependencias

Fase 00 (permisos, paginación). Toca el módulo `auth` existente: **mantén** su comportamiento y
sus pruebas; amplíalo.

## Modelo

1. Migración `roles_and_invitations`:
   - Enum `MemberRole`: `OWNER`, `ADMIN`, `OPERATOR`. Los `MEMBER` existentes pasan a `OPERATOR` (SQL en la migración).
   - `users.last_church_id` (FK opcional a `churches`, `ON DELETE SET NULL`): la iglesia a la que entra `sign-in`.
   - `churches.timezone VarChar(64) default 'America/Lima'` (lo usa la fase 03; se agrega aquí porque `SessionView` lo expone).
   - Tabla `invitations`: `id`, `church_id`, `email VarChar(254)`, `role`, `token_hash VarChar(64)` (SHA-256 hex del token),
     `invited_by_user_id`, `expires_at`, `accepted_at?`, `revoked_at?`, `created_at`.
     Índices: `(church_id)`, único parcial `(church_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL`,
     único `(token_hash)`.
2. Actualiza `docs/database/schema.md`.

## Auth: cambios sobre lo existente

1. **`SessionView` y `AuthResult`** según el contrato §4: agrega `church.timezone`, `permissions`
   (de `ROLE_PERMISSIONS`) y `churches` (membresías activas, por nombre). Haz que `toView` lo arme en
   un solo lugar y que todos los endpoints lo usen.
2. `sign-in`: entra a `users.last_church_id` si sigue siendo una membresía activa; si no, a la más antigua.
   Actualiza `last_church_id` en cada login y cambio de iglesia.
3. **`POST /auth/switch-church`** `{ churchId }`: comprueba membresía activa (si no, 404), cambia
   `sessions.church_id` de la sesión actual, rota el refresh token (generación + 1) y devuelve `AuthResult`.
4. **`PATCH /auth/me`** `{ fullName }` (1–120) → `SessionView`.
5. **`POST /auth/change-password`** `{ currentPassword, password, passwordConfirmation }`: verifica la
   actual (`INVALID_CURRENT_PASSWORD`), guarda el hash, `password_changed_at`, revoca las **demás** sesiones
   (`revoked_reason = PASSWORD_RESET`), envía el correo "Tu contraseña cambió". 204.
6. **`GET /auth/sessions`**: sesiones activas del usuario (todas las iglesias), `isCurrent` para la del token,
   más recientes primero. **`DELETE /auth/sessions/:id`**: solo propias (404 si no), motivo `SIGN_OUT`.
7. `sign-out-all` revoca también la sesión actual (ya lo hace; verifica).
8. `JwtAuthGuard`: además de que la sesión esté viva, comprueba que la **membresía** de `churchId` siga
   activa (una consulta que puede unirse a la de la sesión). Quitar a alguien del equipo debe cortar su
   acceso al instante.

## Equipo

Módulo `src/modules/members/` (controller, service, repository, mapper, schema) con los endpoints del
contrato §7.

1. `GET /members`: membresías activas con usuario, por `fullName`, `isCurrentUser`.
2. `PATCH /members/:id { role }` y `DELETE /members/:id` con estas reglas:
   - Solo un `owner` asigna o quita `owner`; un `admin` que toque a un `owner` → 403.
   - Nunca puede quedar la iglesia sin `owner` activo → `409 LAST_OWNER` (incluido degradarse o quitarse a sí mismo).
   - `DELETE` desactiva la membresía y revoca las sesiones de esa persona **cuya `church_id` sea esta iglesia**.
3. Invitaciones:
   - `POST /invitations { email, role }`: `ALREADY_MEMBER` si ya es miembro activo; si hay una pendiente para ese
     correo, se revoca y se crea otra. Token: 32 bytes aleatorios en base64url; se guarda su SHA-256.
     Vence a los 7 días. Envía el correo (abajo) con el enlace `<WEB_URL>/invitacion?token=<token>`.
     Si el envío falla, la invitación queda creada y se registra el error (se puede reenviar).
   - `POST /invitations/:id/resend`: token y vencimiento nuevos, reenvía.
   - `DELETE /invitations/:id`: `revoked_at`.
   - `GET /invitations/lookup?token=` (**pública**): `InvitationPreview` o `INVITATION_INVALID`.
   - `POST /invitations/accept` (**pública**, límite 10/15 min): valida el token; si existe usuario con ese correo,
     exige su contraseña (`INVALID_CREDENTIALS` si no coincide); si no existe, exige `fullName` y crea el usuario.
     Crea o reactiva la membresía con el rol de la invitación, marca `accepted_at`, abre sesión en esa iglesia y
     devuelve `AuthResult`. Todo en una transacción.
4. Variable nueva `WEB_URL` (por defecto `http://localhost:3000`) en `env.schema.ts` y `.env.example`.

## Correos

- Plantilla `invitation.mjml` (mismo estilo que `password-reset.mjml`): "Hola, {{invitedByName}} te invitó a
  {{churchName}} en Iris como {{roleLabel}}." + botón "Aceptar invitación" ({{acceptUrl}}) + "La invitación vence
  el {{expiresOn}}." + versión texto plano. `roleLabel`: Dueño / Administrador / Operador. Fechas en español
  y en la zona de la iglesia.
- `MailPort.sendInvitation(...)` en las tres implementaciones (Resend, consola, captura de pruebas).
- `pnpm mail:build`.

## Criterios de aceptación

- `sign-up` devuelve `role: "owner"`, los 9 permisos y `churches` con una iglesia.
- Un `operator` recibe 403 en `POST /invitations`.
- Aceptar una invitación con cuenta nueva y con cuenta existente funciona; la segunda deja al usuario con dos
  iglesias y `switch-church` alterna entre ellas.
- Quitar a un miembro corta sus peticiones en curso con 401.
- Compila, lint limpio, build. (Pruebas: fase 09.)

## Desviaciones

| Qué | Motivo |
|---|---|
| `JwtAuthGuard` toma el **rol de la base** (una consulta que une sesión, usuario y membresía) en lugar del rol del token, y exige que `sessions.church_id` coincida con el `churchId` del token | Un cambio de rol o una baja se aplican en el acto, no a los 15 min. Tras `switch-church`, el access token anterior responde 401 y el cliente refresca (ciclo normal del contrato §4.1) |
| Valor nuevo `MEMBER_REMOVED` en `session_revoked_reason` | Distinguir en la tabla las sesiones cerradas por quitar a alguien del equipo |
| `GET /invitations` devuelve las no aceptadas ni revocadas **aunque estén vencidas** (`expiresAt` en la respuesta), las más nuevas primero | Si se ocultaran las vencidas no habría forma de reenviarlas desde la web; el cliente puede marcarlas como vencidas |
| Un `admin` recibe 403 al reenviar o revocar una invitación con rol `owner` | Misma regla que asignar `owner` (contrato §3) |
| `POST /invitations/accept`: con cuenta existente que ya es miembro activo → `409 ALREADY_MEMBER`; con cuenta nueva sin `fullName` o con contraseña < 8 → `400 VALIDATION_FAILED` con `errors.fullName` / `errors.password` | Interpretación conservadora; el contrato no lo detalla |
| `change-password` también invalida los códigos de recuperación pendientes | Igual que `reset-password`: un código pedido antes del cambio no debe seguir sirviendo |
| `InvitationsService` usa `AuthService.openSession` (exportado por `AuthModule`) | Aceptar termina igual que un login; una sola forma de abrir sesión |
| Verificado con `curl` (script de 37 comprobaciones): permisos y `churches` en `sign-up`, operator → 403 en `POST /invitations`, aceptar con cuenta nueva y existente, `switch-church` ida y vuelta, `sign-in` a la última iglesia, `LAST_OWNER`, admin vs owner, quitar a un miembro corta su acceso con 401, perfil, contraseña, dispositivos | — |
