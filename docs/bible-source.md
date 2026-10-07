# Fuente del texto bíblico

| | |
|---|---|
| Traducción | Santa Biblia — Reina Valera 1909 (`rvr1909` en la API) |
| Editor | eBible.org, identificador `spaRV1909` (también `SPNR09`) |
| Página | https://ebible.org/find/details.php?id=spaRV1909 |
| Licencia | **Dominio público** ("Public Domain · Dominio Público", verificado en la página el 2026-10-05) |
| Archivo | https://ebible.org/Scriptures/spaRV1909_vpl.zip (formato VPL: una línea por versículo, `GEN 1:1 texto`) |
| Descargado | 2026-10-05 |
| Contenido | 66 libros · 1189 capítulos · 31 102 versículos (18 vacíos: en esta versificación vienen unidos al anterior, p. ej. Números 12:16) |

## Otras traducciones

El script también carga `rvr1960`, `nvi` y `ntv` (catálogo en `src/modules/bible/bible.translations.ts`).
**El repositorio no incluye ni descarga sus textos**: tienen derechos de autor (Sociedades Bíblicas Unidas,
Biblica y Tyndale House, respectivamente), así que cada archivo VPL lo aporta quien despliega, con la licencia o
autorización que corresponda. Hasta que se importe uno, esa traducción no existe en la base ni aparece en la API.

```bash
pnpm db:import-bible data/bible/rvr1960.txt --translation=rvr1960   # o nvi / ntv
```

Cada archivo debe traer los 66 libros en el mismo formato VPL (`GEN 1:1 texto`); si falta alguno, el script
aborta sin cambiar nada.

## Cómo cargar la RVR 1909

El archivo no se versiona (`/data/bible` está en `.gitignore`):

```bash
mkdir -p data/bible && cd data/bible
curl -LO https://ebible.org/Scriptures/spaRV1909_vpl.zip && unzip -o spaRV1909_vpl.zip
cd ../..
pnpm db:import-bible data/bible/spaRV1909_vpl.txt            # idempotente
pnpm db:import-bible data/bible/spaRV1909_vpl.txt --force    # reemplaza y sube la versión
```

El VPL usa códigos propios para algunos libros (`JOH`, `SOL`, `EZE`, `MAR`, `PHI`, `JAM`, `1JO`…); el script los
traduce a USFM (`JHN`, `SNG`, `EZK`, `MRK`, `PHP`, `JAS`, `1JN`…) con la tabla de `src/modules/bible/bible.books.ts`,
que también da los nombres en español.
