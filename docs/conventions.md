# Convenciones · Iris

Las reglas generales son las de `../../forma-de-trabajo.md` (idioma, nomenclatura, capas, contrato HTTP). Aquí solo va lo propio de Iris.

## Glosario

El mismo nombre en la base, el API, la web y las apps.

| Español (pantalla) | Inglés (código) | Notas |
|---|---|---|
| Iglesia | `church` | El tenant. Todo cuelga de una iglesia |
| Cuenta | `user` | La cuenta de una iglesia (correo y contraseña). No hay roles ni equipo |
| Sesión | `session` | Una por dispositivo |
| Consola | `console` | La app de iPad o Windows que proyecta |
| Canción / letra | `song` | Se proyecta por secciones |
| Sección / diapositiva | `section` | Una pantalla del TV |
| Servicio (tipo) | `serviceType` | Culto general, Jóvenes… |
| Bloque | `block` | Parte con tiempo previsto de un servicio |
| Persona | `person` | Quien dirige un bloque. No es un usuario |
| Registro de tiempos | `serviceRecord` | Tiempos reales de un servicio ya hecho |
| Módulos | `modules` | Biblia, Multimedia, Control de tiempo |
| Multimedia / archivo | `media` | Imagen, video o audio (`image`, `video`, `audio`) |
| Fondo | `background` | Imagen marcada `isBackground` para la consola |
| Sincronización | `sync` | Feed `/sync/changes` con el que las consolas ponen al día su copia local |

## Iris en particular

- El tenant es `churchId` y sale del token, nunca de la URL ni del cuerpo. Los repositorios lo reciben como primer parámetro.
- Plataformas de cliente: `web`, `ios`, `windows`. En la base, `WEB`, `IOS` y `WINDOWS`.
- Puerto de desarrollo: **3020**. La web corre en el 3000.
