# Iris API — Especificación del backend

> Extracto de `IRIS_SPEC.md` (maqueta de iPad) con **solo lo que necesita el backend**: dominio, reglas de negocio y contratos.
> Lo visual (tokens, pantallas, consola, proyección) queda fuera: eso lo resuelve cada cliente.
> Textos visibles en **español**; código, rutas y campos en **inglés**.
>
> **El contrato [`contract/api-v1.md`](contract/api-v1.md) manda** sobre este documento en rutas, campos, roles y
> errores. Este archivo describe el dominio; la fase 09 lo alinea con lo construido.

**Clientes de esta API**

| Cliente | Uso | Sesión |
|---|---|---|
| Web (`atm-iris-web`, Next.js) | Administración: canciones, servicios, personas, módulos | Cookie httpOnly en el servidor de Next (patrón BFF) |
| iPad (`atm-iris-ios`) | Consola en vivo | Inicia sesión una vez; tokens en el Keychain |
| Windows (WinUI 3) | Consola en vivo | Inicia sesión una vez; tokens en el Credential Locker |

---

## 1. Fases

| Fase | Alcance | Estado |
|---|---|---|
| **1. Auth** | Crear cuenta, iniciar sesión, refresh, cerrar sesión, recuperar contraseña con código, envío de correos | **En curso** (§3) |
| 2. Iglesia | Módulos, personas, tipos de servicio | Pendiente |
| 3. Canciones | Biblioteca de letras, importación en lote | Pendiente |
| 4. Tiempos | Registros de servicio y estadísticas | Pendiente |
| 5. Multimedia y Biblia | Archivos, traducciones | Pendiente |

---

## 2. Dominio

### 2.1 Cuentas

Una **iglesia** es el espacio de datos (tenant). Toda la información (canciones, personas, servicios, tiempos) pertenece a una iglesia. El usuario es global y entra a una iglesia por su **membresía**, igual que en los demás proyectos de la casa. Al crear una cuenta se crean juntos la iglesia, el usuario y su membresía `owner`.

```text
Church         { id, name }
User           { id, email (único, minúsculas), passwordHash, fullName, isActive, lastLoginAt? }
ChurchMember   { id, churchId, userId, role: owner|member, isActive }
Session        { id, userId, churchId, platform: web|ios|windows, deviceName?, refreshGeneration,
                 lastUsedAt, expiresAt, revokedAt?, revokedReason? }      // una por dispositivo
PasswordResetCode { id, userId, codeHash, expiresAt, verificationAttempts, usedAt? }
```

Detalle y razones en [`plans/01-login/README.md`](plans/01-login/README.md).

### 2.2 Iglesia (fases 2–4)

```text
ChurchModules   { bible, multimedia, timeControl }           // Letras siempre activo. Por defecto: los tres en true
Person          { id, churchId, name }
ServiceType     { id, churchId, name, color (hex), schedule?, blocks: [BlockTemplate] }
  Schedule = { weekday (1 = dom … 7 = sáb), hour (0–23), minute (0–59) }
  Paleta   = #FFB547 · #FF7A59 · #F0508C · #9B5CFF · #4E5BFF · #3DDC97
BlockTemplate   { id, name, plannedMinutes (1–240), defaultPersonId? }   // orden = posición en la lista
ServiceRecord   { id, churchId, date, serviceTypeId, blocks: [BlockRecord] }
BlockRecord     { id, name, plannedSeconds, actualSeconds, personId?, personName?,
                  status: completed|skipped|adjusted }
Song            { id, churchId, title, author, sections: [SongSection], updatedAt }
SongSection     { id, label?, text }                          // una sección = una pantalla del TV
```

### 2.3 Reglas de negocio que valida el servidor

- **Nombres sin duplicados** por iglesia, comparando sin acentos, mayúsculas ni espacios al borde (`" José "` = `"jose"`): personas, tipos de servicio.
- **Tipo de servicio**: nombre obligatorio; si controla tiempo, al menos un bloque; nombre de bloque obligatorio; minutos 1–240.
- **Eliminar una persona** no borra registros: `BlockRecord` guarda `personId` + `personName` (copia del nombre al guardar). Sí la quita como responsable sugerido (`defaultPersonId = null`) de las plantillas.
- **Eliminar un tipo de servicio** conserva sus registros de tiempos.
- **Registros**: solo se guardan tiempos, nunca el contenido proyectado. Exceso = real − previsto si > 0, **sin margen**. Los bloques omitidos no cuentan en ningún cálculo; los ajustados sí.
- **Módulo Control de tiempo apagado**: no se borra nada; los clientes ocultan bloques, personas y tiempos.
- **Canción**: título 1–120, autor ≤ 120, 1–80 secciones.

### 2.4 Datos de ejemplo (seed de desarrollo)

Iglesia Vida Nueva · Daniel Ruiz · pastor@vidanueva.org. Tipos: Culto general (dom 10:00, ámbar; Bienvenida 10 · Alabanzas 15 · Prédica 40 · Anuncios 5) · Jóvenes (sáb 19:00, rosa) · ABC (dom 9:00, violeta). Personas: Daniel Ruiz, Ana Torres, Carlos Pérez, Lucía Gómez, Marta Rivas, José Herrera, Sofía Méndez, Pablo Castro. Detalle completo en `IRIS_SPEC.md` §11.

---

## 3. Fase 1: Autenticación

Plan completo en [`plans/01-login/README.md`](plans/01-login/README.md). En resumen:

- **Access token** JWT de 15 min + **refresh token** con rotación y **60 días de inactividad**. iPad y Windows inician sesión una sola vez.
- Una **sesión por dispositivo**. Se puede cerrar una o todas, y restablecer la contraseña las cierra todas.
- **Recuperar contraseña en 3 pasos**: correo → código de 6 dígitos (15 min, 5 intentos) → contraseña nueva y confirmación → login.
- **Correos** con Resend detrás de `MailPort`: "Código de recuperación" y "Tu contraseña cambió". Sin credenciales, se escriben en el log.
- Los tres clientes usan el mismo contrato: tokens en el cuerpo y `Authorization: Bearer`.
