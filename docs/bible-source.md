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

No se usa la Reina-Valera 1960 ni ninguna otra traducción con derechos.

## Cómo cargarla

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
