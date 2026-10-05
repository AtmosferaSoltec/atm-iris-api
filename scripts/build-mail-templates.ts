/**
 * Compila las plantillas `.mjml` a modulos TypeScript.
 *
 * El HTML termina dentro de un `.ts` y no en un `.html` suelto a proposito:
 * `nest build` solo mueve a `dist/` lo que compila, asi que un `.html` obligaria
 * a configurar `assets` en `nest-cli.json` y a acordarse de ello en cada deploy.
 * Un modulo se importa y viaja solo.
 *
 * El resultado se commitea. Asi produccion nunca necesita `mjml` instalado
 * —es una dependencia de desarrollo— y un cambio de diseno se revisa en el
 * diff del HTML, que es donde de verdad se ve si algo se rompio.
 *
 * Uso: `pnpm mail:build`
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import mjml2html from 'mjml';

const TEMPLATES_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/integrations/mail/templates',
);

/** `password-reset` -> `PASSWORD_RESET_HTML` */
const constantName = (file: string): string =>
  `${file.replace(/\.mjml$/, '').replace(/-/g, '_').toUpperCase()}_HTML`;

const sources = readdirSync(TEMPLATES_DIR).filter((file) =>
  file.endsWith('.mjml'),
);

if (sources.length === 0) {
  throw new Error(`No hay plantillas .mjml en ${TEMPLATES_DIR}`);
}

for (const file of sources) {
  const source = readFileSync(join(TEMPLATES_DIR, file), 'utf8');

  // El `await` no sobra aunque `@types/mjml@5` declare la funcion sincrona:
  // los tipos se quedaron en la v4 y mjml 5 devuelve una promesa. Sin el,
  // `errors` llega `undefined` y la validacion de abajo no comprueba nada.
  //
  // `validationLevel: strict` corta el build ante un atributo invalido. Un
  // aviso en consola se pasa por alto y el correo roto se descubre en la
  // bandeja de un usuario.
  const { html, errors } = await mjml2html(source, {
    filePath: join(TEMPLATES_DIR, file),
    validationLevel: 'strict',
    minify: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `${file}:\n${errors.map((e) => `  ${e.formattedMessage}`).join('\n')}`,
    );
  }

  const target = file.replace(/\.mjml$/, '.generated.ts');

  writeFileSync(
    join(TEMPLATES_DIR, target),
    [
      '/* eslint-disable */',
      `// Generado desde ${file} por scripts/build-mail-templates.ts.`,
      '// No editar a mano: el proximo `pnpm mail:build` lo sobrescribe.',
      '',
      `export const ${constantName(file)} = ${JSON.stringify(html)};`,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`${file} -> ${target} (${(html.length / 1024).toFixed(1)} KB)`);
}
