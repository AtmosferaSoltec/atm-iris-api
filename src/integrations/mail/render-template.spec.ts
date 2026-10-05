import { describe, expect, it } from 'vitest';

import { renderTemplate } from './render-template.js';
import { PASSWORD_RESET_HTML } from './templates/password-reset.generated.js';

describe('renderTemplate', () => {
  it('reemplaza los marcadores por su valor', () => {
    expect(renderTemplate('Hola, {{nombre}}', { nombre: 'Ana' })).toBe(
      'Hola, Ana',
    );
  });

  it('acepta numeros', () => {
    expect(renderTemplate('Vence en {{min}} min', { min: 15 })).toBe(
      'Vence en 15 min',
    );
  });

  it('escapa el HTML del valor', () => {
    const html = renderTemplate('<p>{{nombre}}</p>', {
      nombre: '<script>alert(1)</script>',
    });

    expect(html).not.toContain('<script>');
    expect(html).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('escapa el & de nombres como "Perez & Hijos"', () => {
    expect(renderTemplate('{{n}}', { n: 'Perez & Hijos' })).toBe(
      'Perez &amp; Hijos',
    );
  });

  it('reemplaza todas las apariciones del mismo marcador', () => {
    expect(renderTemplate('{{a}} y {{a}}', { a: 'x' })).toBe('x y x');
  });

  it('falla si queda un marcador sin valor', () => {
    expect(() => renderTemplate('{{a}} {{b}}', { a: '1' })).toThrow('{{b}}');
  });
});

describe('plantilla password-reset', () => {
  const values = {
    fullName: 'Ana Perez',
    code: '482913',
    expiresInMinutes: 15,
  };

  it('se renderiza sin dejar marcadores', () => {
    const html = renderTemplate(PASSWORD_RESET_HTML, values);

    expect(html).not.toMatch(/\{\{\w+\}\}/);
    expect(html).toContain('482913');
    expect(html).toContain('Ana Perez');
  });

  // Si alguien renombra un marcador en el .mjml y olvida el servicio, esto
  // avisa aqui y no en la bandeja de un usuario.
  it('usa exactamente los marcadores que el servicio provee', () => {
    const enPlantilla = new Set(
      [...PASSWORD_RESET_HTML.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]),
    );

    expect([...enPlantilla].sort()).toEqual(Object.keys(values).sort());
  });
});
