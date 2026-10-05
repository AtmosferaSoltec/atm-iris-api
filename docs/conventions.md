# Convenciones · Iris

Las reglas generales son las de `../../forma-de-trabajo.md` (idioma, nomenclatura, capas, contrato HTTP). Aquí solo va lo propio de Iris.

## Glosario

El mismo nombre en la base, el API, la web y las apps.

| Español (pantalla) | Inglés (código) | Notas |
|---|---|---|
| Iglesia | `church` | El tenant. Todo cuelga de una iglesia |
| Responsable / dueño | `owner` | Rol de quien crea la cuenta |
| Miembro | `member` | Rol de quien sea invitado (llega más adelante) |
| Sesión | `session` | Una por dispositivo |
| Consola | `console` | La app de iPad o Windows que proyecta |
| Canción / letra | `song` | Se proyecta por secciones |
| Sección / diapositiva | `section` | Una pantalla del TV |
| Servicio (tipo) | `serviceType` | Culto general, Jóvenes… |
| Bloque | `block` | Parte con tiempo previsto de un servicio |
| Persona | `person` | Quien dirige un bloque. No es un usuario |
| Registro de tiempos | `serviceRecord` | Tiempos reales de un servicio ya hecho |
| Módulos | `modules` | Biblia, Multimedia, Control de tiempo |

## Iris en particular

- El tenant es `churchId` y sale del token, nunca de la URL ni del cuerpo. Los repositorios lo reciben como primer parámetro.
- Plataformas de cliente: `web`, `ios`, `windows`. En la base, `WEB`, `IOS` y `WINDOWS`.
- Puerto de desarrollo: **3020**. La web corre en el 3000.
