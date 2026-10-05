# 99 · Revisión final e integración (los 4 repos)

> **Para el agente revisor.** Empiezas solo cuando el usuario confirme que los cuatro agentes
> entregaron su reporte final. Trabajas en la **Mac** (API, web, iPad) y le pides al usuario que
> ejecute lo necesario en la **PC con Windows** (o lo haces tú si tienes acceso a ella).
> A diferencia de los otros agentes, **puedes editar los cuatro repos**.

## Objetivo

Que la API, la web, el iPad y Windows funcionen **juntos** contra la API real, en local, con un
informe claro de lo que quedó y lo que falta. Revisar calidad y coherencia entre repos.

## 0. Lectura

1. `00-fundamentos/plataforma.md` y `docs/contract/api-v1.md`.
2. Los cuatro reportes finales (pídeselos al usuario si no los tienes) y las secciones *Desviaciones* de cada fase en
   los cuatro `docs/plans/`.
3. Lista todas las desviaciones en una tabla: repo, fase, qué, impacto en el contrato.

## 1. Unificar el contrato

- Para cada desviación que afecte al contrato, decide **una** forma (la más coherente con el resto del contrato) y
  corrige el código del lado que se apartó.
- Si de verdad hay que cambiar el contrato, edita `atm-iris-api/docs/contract/api-v1.md` y **copia** el archivo idéntico
  a `docs/api-contract.md` de la web, el iPad y Windows. Al final, los cuatro archivos deben ser iguales (`diff`).

## 2. Levantar todo

```bash
cd Atmosfera/atmosfera-postgres && docker compose up -d
cd ../atm-iris-api && docker compose -f docker-compose.dev.yml up -d   # MinIO
pnpm install && pnpm db:migrate && pnpm db:import-bible <archivo> && pnpm db:seed:dev && pnpm start:dev
cd ../atm-iris-web && pnpm install && pnpm dev                         # con AUTH_SOURCE=api y DATA_SOURCE=api
```

- iPad: esquema/configuración **Live** apuntando a `http://localhost:3020/api/v1`, simulador iPad.
- Windows: modo **Live** con `ApiBaseUrl = http://<IP-de-la-Mac>:3020/api/v1`. Comprueba que la PC llega a la Mac
  (`curl http://<IP>:3020/api/v1/health` desde Windows; si no, revisa el firewall de macOS). Si la web y MinIO
  generan URLs con `localhost`, Windows no podrá descargar archivos: configura `STORAGE_PUBLIC_ENDPOINT` (o el
  equivalente que haya quedado) con la IP de la Mac y anótalo.

## 3. Recorridos de punta a punta

Marca cada uno ✅/❌ en el informe. Con la cuenta `pastor@vidanueva.org` salvo que se indique otra.

| # | Recorrido | Clientes |
|---|---|---|
| 1 | Crear cuenta nueva, cerrar sesión, iniciar sesión, recuperar contraseña con el código del log de la API | Web, iPad, Windows |
| 2 | Iniciar sesión una vez en la consola, cerrar la app, abrirla: entra sin pedir contraseña | iPad, Windows |
| 3 | Invitar a `operador2@…` desde la web, aceptar en `/invitacion`, iniciar sesión con él en la consola: no ve "Guardar en la plantilla" ni puede ajustar tiempos | Web + consola |
| 4 | Cambiar de iglesia (Vida Nueva ↔ Monte Sion) | Web, iPad, Windows |
| 5 | Crear una canción en la web → aparece en la consola tras sincronizar → se proyecta | Web → consolas |
| 6 | Importar 3 `.txt` en la web → aparecen en las consolas | Web → consolas |
| 7 | Subir imagen de fondo, video y música en la web → se descargan en la consola → se proyectan y reproducen | Web → consolas |
| 8 | Biblia: descargar en la consola, abrir Juan 3:16 sin conexión | iPad, Windows |
| 9 | Apagar el módulo Multimedia en la web → la consola deja de ofrecerlo tras sincronizar | Web → consolas |
| 10 | Tipo de servicio con bloques creado en la web → iniciar servicio en la consola → cronómetro → terminar → "Guardar en la plantilla" → la web muestra el registro y la plantilla cambiada | Web ↔ consolas |
| 11 | **Sin conexión**: cortar la red de la consola, hacer un servicio completo con tiempos y agregar una persona; reconectar → la web ve el registro y la persona, sin duplicados | Consolas → Web |
| 12 | Cerrar sesión en todos los dispositivos desde la web → las consolas vuelven al acceso en su siguiente petición | Web → consolas |
| 13 | Salida al TV: iPad con pantalla externa (simulador: *I/O → External Displays*) y Windows con segundo monitor | iPad, Windows |

Cada fallo: arréglalo en el repo que corresponda, con el cambio mínimo, y anótalo.

## 4. Calidad entre repos

- Mismos textos visibles para lo mismo en los tres clientes (mensajes de error del API, nombres de pantallas).
- Mismas reglas: `nameKey`, formato de letras, cálculo de excesos y resúmenes (compara salidas de los tres con los
  mismos registros).
- Sin restos de la maqueta que ya no se usen; mocks solo para vistas previas, pruebas o el modo sin API.
- Secretos: ningún `.env` real versionado; `.env.example` completos.
- Corre en cada repo su verificación completa (API: lint, test, e2e, build · Web: `pnpm check`, `format:check`, build,
  e2e · iPad: build + pruebas · Windows: `dotnet build` + `dotnet test`) y deja el resultado en el informe.

## 5. Informe

Crea `Atmosfera/atm-iris-api/docs/plans/99-revision-final/informe.md` con:
- Tabla de recorridos con su estado.
- Cambios hechos por repo (archivo y motivo).
- Desviaciones que quedaron aceptadas.
- Pendientes y riesgos, ordenados por importancia.
- Cómo levantar todo (comandos exactos).

Luego avisa al usuario con un resumen corto y el enlace al informe.
