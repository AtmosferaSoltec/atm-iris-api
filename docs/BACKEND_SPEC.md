# Iris API — Especificación del backend

> Extracto de `IRIS_SPEC.md` (maqueta de iPad) con **solo lo que necesita el backend**: dominio y reglas de negocio,
> alineado con lo construido (fases 00–09). Lo visual (tokens, pantallas, consola, proyección) lo resuelve cada cliente.
> Textos visibles en **español**; código, rutas y campos en **inglés**.
>
> **El contrato [`contract/api-v1.md`](contract/api-v1.md) manda** sobre este documento en rutas, campos, roles y
> errores. Las decisiones de implementación y sus desviaciones están en [`plans/`](plans/README.md); el modelo, en
> [`database/schema.md`](database/schema.md).

**Clientes de esta API**

| Cliente | Uso | Sesión |
|---|---|---|
| Web (`atm-iris-web`, Next.js) | Administración: canciones, multimedia, servicios, personas, equipo, tiempos. No proyecta | Tokens en cookie `httpOnly` cifrada en el servidor de Next (patrón BFF) |
| iPad (`atm-iris-ios`) | Consola en vivo, sin conexión | Inicia sesión una vez; tokens en el Keychain |
| Windows (`atm-iris-win`, WinUI 3) | Consola en vivo, sin conexión | Inicia sesión una vez; tokens en el Credential Locker |

---

## 1. Fases

| Fase | Alcance | Estado |
|---|---|---|
| 00 | Request id, paginación, `nameKey`, versión de sincronización, borrado suave | ✅ |
| 01 | Crear cuenta, login, refresh con rotación, cerrar sesión, recuperar contraseña, correos | ✅ |
| 02 | Perfil, contraseña y dispositivos (sin roles ni equipo) | ✅ |
| 03 | Ajustes y módulos de la iglesia, personas, tipos de servicio | ✅ |
| 04 | Canciones: CRUD, búsqueda sin acentos, importación | ✅ |
| 05 | Multimedia en S3 compatible con URLs firmadas y cuota | ✅ |
| 06 | Biblia RVR1909 completa, descarga para usar sin conexión | ✅ |
| 07 | Registros de tiempos | ✅ |
| 08 | Feed `/sync/changes` para las consolas | ✅ |
| 09 | Pruebas, datos de ejemplo, documentación | ✅ |

---

## 2. Dominio

### 2.1 Cuentas

Una **iglesia** es el espacio de datos (tenant) y tiene **una sola cuenta**: quien entra con ella lo puede todo en
esa iglesia. No hay roles, equipo ni invitaciones. El `churchId` sale siempre del token, nunca de la URL ni del cuerpo.

```text
Church        { id, name, timezone, modules, storageQuota }
User          { id, churchId, email (único, minúsculas), passwordHash, fullName, isActive }
Session       { id, userId, churchId, platform: web|ios|windows, deviceName?, refreshGeneration,
                lastUsedAt, expiresAt, revokedAt?, revokedReason? }       // una por dispositivo
PasswordResetCode { id, userId, codeHash, expiresAt, verificationAttempts, usedAt? }
```

- Sin roles ni permisos (contrato §3): cualquier sesión válida puede leer y escribir todo lo de su iglesia.
- `sign-up` crea la iglesia y su cuenta a la vez; `sign-in` entra a la iglesia de la cuenta.
- El guard comprueba en cada petición que la sesión siga viva y la cuenta activa: cerrar sesión o restablecer la
  contraseña corta el acceso al instante.

### 2.2 Contenido de la iglesia

```text
ChurchModules   { bible, multimedia, timeControl }      // Letras siempre activo. Por defecto: los tres en true
Person          { id, churchId, name }
ServiceType     { id, churchId, name, color, schedule?, blocks: [BlockTemplate] }
  Schedule = { weekday (1 = dom … 7 = sáb), hour (0–23), minute (0–59) }   // hora local de la iglesia
  Paleta   = #FFB547 · #FF7A59 · #F0508C · #9B5CFF · #4E5BFF · #3DDC97
BlockTemplate   { id, name, plannedMinutes (1–240), defaultPersonId? }    // orden = posición en la lista
Song            { id, churchId, title, author, copyright?, sections: [SongSection] }
SongSection     { id, label?, text }                                       // una sección = una pantalla del TV
MediaAsset      { id, churchId, kind: image|video|audio, title, description?, fileName, contentType,
                  sizeBytes, durationSeconds?, width?, height?, isBackground }
ServiceRecord   { id, churchId, date, serviceTypeId, serviceTypeName, blocks: [BlockRecord] }
BlockRecord     { id, name, plannedSeconds, actualSeconds, personId?, personName?,
                  status: completed|skipped|adjusted }
Bible           { translation (rvr1909), books (USFM), verses }            // global, sin churchId
```

### 2.3 Reglas de negocio que valida el servidor

- **Nombres sin duplicados** por iglesia, comparados por *nameKey* (sin acentos, minúsculas, espacios colapsados):
  personas y tipos de servicio. Los títulos de canciones no son únicos; solo la importación salta los repetidos.
- **Borrado suave** en personas, tipos de servicio, canciones, medios y registros: no aparecen en las listas, responden
  404 y la sincronización los informa como borrados.
- **Idempotencia**: las creaciones con `id` del cliente (`POST /people`, `/service-types`, `/songs`,
  `PUT /service-types/:id`, `/songs/:id`, `/service-records/:id`) no duplican al reintentar; un id de otra iglesia
  responde `409 ID_CONFLICT`.
- **Eliminar una persona** no toca los registros (`BlockRecord` guarda `personId` y `personName`). Sí la quita como
  responsable sugerido de las plantillas.
- **Eliminar un tipo de servicio** conserva sus registros; la consola puede guardar un registro de un tipo borrado.
- **Registros**: solo tiempos, nunca contenido proyectado. Reenviar el mismo registro es un reintento (200);
  reemplazarlo con otro contenido o ajustar un bloque pide `records.manage`. Ajustar la duración marca `adjusted`.
  Las estadísticas las calcula cada cliente: exceso = real − previsto si > 0, sin margen; los omitidos no cuentan.
- **Módulo Control de tiempo apagado**: no se borra nada; la API guarda bloques igual y los clientes los ocultan.
- **Multimedia**: tipos y tamaños por `kind` (contrato §11) y cuota por iglesia (5 GiB por defecto), contando lo
  reservado por subidas en curso. Los bytes nunca pasan por la API: subidas y descargas con URL firmada.
- **Zona horaria**: todo viaja en UTC; "hoy", los horarios y los resúmenes se calculan en la zona de la iglesia.

### 2.4 Sincronización de las consolas

Cada tabla sincronizable lleva una versión global (`sync_version`, secuencia + trigger). `GET /sync/changes` entrega
lo que cambió después del cursor, paginado, con los borrados aparte. Toda escritura de una iglesia pasa por un
candado transaccional por iglesia, así las versiones se confirman en orden y el cursor nunca se salta filas. Las
consolas encolan sus escrituras sin conexión y las reenvían; la idempotencia evita duplicados.

### 2.5 Datos de ejemplo

`pnpm db:seed:dev`: Iglesia Vida Nueva (pastor, admin y operador) e Iglesia Monte Sion, 8 personas, Culto general
(dom 10:00; Bienvenida 10 · Alabanzas 15 · Prédica 40 · Anuncios 5) · Jóvenes (sáb 19:00) · ABC (dom 9:00), 6 himnos
de dominio público, 10 registros de domingos y 2 fondos. Detalle en el README.

---

## 3. Autenticación

Plan completo en [`plans/01-login/README.md`](plans/01-login/README.md) y [`plans/02-cuenta-y-equipo/README.md`](plans/02-cuenta-y-equipo/README.md).

- **Access token** JWT de 15 min + **refresh token** con rotación y **60 días de inactividad**. iPad y Windows
  inician sesión una sola vez.
- Una **sesión por dispositivo**. Se puede cerrar una, todas, o ver la lista de dispositivos. Cambiar la contraseña
  cierra las demás; restablecerla las cierra todas.
- **Recuperar contraseña en 3 pasos**: correo → código de 6 dígitos (15 min, 5 intentos, 3 por día) → contraseña nueva.
- **Correos** con Resend detrás de `MailPort`: código de recuperación y contraseña cambiada. Sin
  credenciales, en desarrollo se escriben en el log.
