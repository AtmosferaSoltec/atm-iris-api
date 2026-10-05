# Informe · Revisión final e integración

Fecha: 2026-10-05 · Revisor: agente de la fase 99, en la Mac. **No hubo acceso a la PC con Windows.**

## Resumen

| Repo | Fases | Avance | Verificación completa |
|---|---|---|---|
| atm-iris-api | 00–09 cerradas | **100 %** | ✅ lint · tipos · 112 unitarias · 33 e2e (+2 saltos esperados) · build · sin deriva Prisma |
| atm-iris-web | 00–08 cerradas | **100 %** | ✅ `pnpm check` (62 unitarias) · `format:check` · build · 15 e2e Playwright |
| atm-iris-ios | 00–10 cerradas | **100 %** del plan (faltan recorridos manuales en el simulador) | ✅ build sin warnings · 114 pruebas, incluidas las de integración contra la API real |
| atm-iris-win | 00–08 cerradas · 09 a medias · 10 sin hacer | **≈ 90 %** | ⚠️ No verificado: no hay `dotnet` en la Mac |

- El contrato (`api-v1.md` / `api-contract.md`) y `plataforma.md` son **idénticos** en los 4 repos (mismo MD5). No hizo falta cambiarlos.
- Ninguna desviación anotada rompe el contrato: todas son interpretaciones de lo que el contrato no fija (códigos 200/201 de un `PUT`, reintentos idempotentes, textos de error) o detalles internos.
- **No se cambió código en ningún repo** durante esta revisión.

## 1. Recorridos de punta a punta

Se probaron **a nivel de API**, simulando lo que envía cada cliente (web escribe con token `web`, la consola lee
`/sync/changes` y escribe por la cola con token `ios`). Los datos creados se borraron al terminar. Las pruebas por
interfaz en el simulador del iPad y en Windows **no se hicieron**.

| # | Recorrido | API (simulando clientes) | Interfaz |
|---|---|---|---|
| 1 | Cuenta nueva, login, recuperación | ✅ cubierto por las e2e de la API (`auth.e2e-spec.ts`) | ⏳ Web ✅ (agente web) · iPad ⏳ · Windows ⏳ |
| 2 | Sesión permanente en la consola | — | ⏳ iPad (probado en pruebas unitarias) · Windows ⏳ |
| 3 | Invitar operador, permisos en la consola | ✅ operator = `people.manage`, `records.write` (e2e `team`) | ⏳ |
| 4 | Cambiar de iglesia | ✅ e2e `team` (`switch-church` ida y vuelta) | ⏳ |
| 5 | Canción web → consola | ✅ llega completa con secciones por `/sync/changes` | ⏳ |
| 6 | Importar 3 `.txt` → consolas | ✅ 3 creadas, las 3 llegan por sync | ⏳ |
| 7 | Imagen/video/música web → consola | ✅ ticket → `PUT` a MinIO (CORS desde `localhost:3000` OK) → confirmar → sync → descarga con los mismos bytes | ⏳ |
| 8 | Biblia sin conexión, Juan 3:16 | ✅ descarga gzip, Juan 3:16 correcto · iPad ✅ en `LiveAPIIntegrationTests` | Windows ⏳ |
| 9 | Apagar Multimedia | ✅ la consola recibe `church.modules.multimedia=false` | ⏳ |
| 10 | Tipo con bloques → servicio → "Guardar en la plantilla" | ✅ registro 201, la web lo ve, plantilla cambiada visible en la web | ⏳ |
| 11 | Sin conexión: registro + persona, sin duplicados | ✅ reintentos 200, un solo registro y una sola persona | ⏳ |
| 12 | Cerrar sesión en todos los dispositivos | ✅ la consola recibe 401 y su refresh se rechaza | ⏳ |
| 13 | Salida al TV | — | ⏳ iPad (simulador *I/O › External Displays*) · Windows (segundo monitor) |

## 2. Cambios hechos por repo

Ninguno. Lo único que se tocó fuera de los repos: un simulador nuevo "Iris iPad Pro 11 (iOS 27)" (los iPad que había
eran iOS 26.5 y el proyecto pide 27.0).

## 3. Desviaciones aceptadas

Todas las de las secciones *Desviaciones* de cada fase quedan aceptadas. Las que tocan la frontera entre repos:

| Repo | Fase | Qué | Impacto en el contrato |
|---|---|---|---|
| API | 02 | Rol leído de la base en cada petición; tras `switch-church` el access token viejo da 401 | Ninguno: los clientes refrescan (ciclo §4.1) |
| API | 03/04/07 | `PUT` responde 201 al crear y 200 al reemplazar; `POST` con `id` existente → 200 tal cual | Ninguno: todos 2xx, consolas lo tratan igual |
| API | 05 | Código nuevo `STORAGE_UNAVAILABLE` (503) | Código extra, los clientes muestran el mensaje tal cual |
| API | 06 | `sizeBytes` de la Biblia = tamaño comprimido | iPad y Windows topan el porcentaje en 99 %: coherente |
| API | 04 | Búsqueda con `word_similarity` y título primero | Ninguno ("ordena por relevancia") |
| Web | 00 | `TeamRepository` sigue a `AUTH_SOURCE` | Interno |
| iPad / Windows | 02/04 | Personas cuenta bloques con los registros locales, no con `blockCount` | Mismo número; funciona sin conexión |
| iPad / Windows | 02/08 | La cola se envía también durante el servicio (solo se pausa la descarga) | Coherente con §12 |
| Windows | 01 | Gracia/reuso del refresh de la API falsa igual a la real (30 s) | Ninguno (verificado contra el plan 01 de la API) |

## 4. Calidad entre repos

- `nameKey`: misma regla en los 4 (recortar, colapsar espacios, quitar diacríticos, minúsculas).
- Secretos: ningún `.env` versionado; `.env` / `.env.local` ignorados; `.env.example` de API y web completos.
- Estadísticas: la web reproduce las cifras de la iglesia de ejemplo del iPad (10 servicios, exceso promedio +7:36); Windows tiene `TimeStatisticsTests` pero no se pudo correr.
- iPad: `.live` ya no usa mocks. Web: mocks solo con `DATA_SOURCE=mock` y para las e2e.

## 5. Pendientes y riesgos (por importancia)

1. **Casi todo el trabajo de API, web e iPad está sin commit** (86, 133 y 98 archivos cambiados o nuevos en el árbol de trabajo; solo hay los commits iniciales). Un `git checkout`/`clean` lo perdería. Hay que hacer commit y push en los tres.
2. **Windows sin terminar**:
   - Fase 09 a medias: ya están el `DisplayAreaWatcher` (monitor en caliente), "Elegir pantalla", cursor oculto en el TV, `LiveMediaPlaybackService` con `MediaPlayer` y el video compartido en `ProjectionCanvas`. Faltan `SystemMediaTransportControls` y que `LiveConsoleViewModel.RunPlaybackClock` lea el avance real del servicio (todavía lo simula), además de las *Desviaciones* y la casilla.
   - Fase 10 sin hacer: no hay `README.md`, faltan pruebas de decodificación del contrato y de la API falsa, la build Release (recorte), actualizar `CLAUDE.md` y el reporte final. Ya existen ~82 pruebas xUnit de fases anteriores.
   - Commits "j" y "l" sin descripción; la fase 00 anotó un `stash@{0}` con trabajo en proceso en la PC.
3. **Recorridos por interfaz pendientes** (iPad en simulador y Windows en modo Live): todos los marcados ⏳. Sobre todo el 13 (TV) y el 2 (sesión permanente), que no se pueden probar por API.
4. **Windows → archivos de la Mac**: con `STORAGE_PUBLIC_ENDPOINT=` vacío las URLs firmadas salen con `localhost:9000` y Windows no podrá descargar. Para la prueba hay que poner `STORAGE_PUBLIC_ENDPOINT=http://<IP-de-la-Mac>:9000` en el `.env` de la API.
5. La cuenta `pastor@vidanueva.org` entra hoy a **Monte Sion** (última iglesia usada en pruebas anteriores, regla del contrato). Para los recorridos con Vida Nueva, cambiar de iglesia primero.
6. iPad por línea de comandos: un `DerivedData` viejo con `Iris.app` (mayúscula) rompe `xcodebuild test` con "no such module 'iris'". Se arregla borrando ese `DerivedData` o usando `-derivedDataPath`. No es un error del repo.
7. `sign-in` permite 5 por minuto por IP: correr seguidas las pruebas de integración del iPad y los recorridos da 429.

## 6. Cómo levantar todo

```bash
cd ~/Documents/Atmosfera/atmosfera-postgres && docker compose up -d
cd ../atm-iris-api && docker compose -f docker-compose.dev.yml up -d        # MinIO :9000 (CORS para localhost:3000)
pnpm install && pnpm db:migrate && pnpm db:import-bible data/bible/spaRV1909_vpl.txt && pnpm db:seed:dev
pnpm start:dev                                                               # http://localhost:3020/api/v1
cd ../atm-iris-web && pnpm install && pnpm dev                               # .env.local: AUTH_SOURCE=api, DATA_SOURCE=api
```

- iPad: esquema `iris` (Debug usa `http://localhost:3020/api/v1`). Pruebas:
  `xcodebuild test -project iris.xcodeproj -scheme iris -destination 'platform=iOS Simulator,name=Iris iPad Pro 11 (iOS 27)' -derivedDataPath /tmp/dd-iris`
- Windows: en la API, `STORAGE_PUBLIC_ENDPOINT=http://<IP-Mac>:9000` y `MINIO_API_CORS_ALLOW_ORIGIN` sin cambios; abrir el
  firewall de macOS para 3020 y 9000. En la app: `Ctrl+Shift+F12` → modo Live, `ApiBaseUrl = http://<IP-Mac>:3020/api/v1`
  → "Probar". Desde la PC: `curl http://<IP-Mac>:3020/api/v1/health`.
- Verificación: API `pnpm lint && npx tsc --noEmit -p tsconfig.json && pnpm test && pnpm test:e2e && pnpm build` ·
  Web `pnpm check && pnpm format:check && pnpm build && pnpm test:e2e` · Windows `dotnet build Iris.csproj -p:Platform=x64 && dotnet test Tests/Iris.Tests.csproj`.
