import { describe, expect, it } from 'vitest';

import { byName, nameKey, searchText } from './text.js';

describe('nameKey', () => {
  it('es la regla del contrato §2', () => {
    expect(nameKey('  José   Pérez ')).toBe('jose perez');
  });

  it('quita diacriticos de cualquier tipo y la ñ se vuelve n', () => {
    expect(nameKey('ÁÉÍÓÚ Üñ Ç')).toBe('aeiou un c');
    expect(nameKey('Señor')).toBe('senor');
  });

  it('trata tabulaciones y saltos de linea como espacios', () => {
    expect(nameKey('Culto\t\ngeneral')).toBe('culto general');
  });

  it('dos escrituras del mismo nombre dan la misma clave', () => {
    expect(nameKey(' jose  perez ')).toBe(nameKey('José Pérez'));
  });
});

describe('searchText', () => {
  it('une las partes con espacio, sin vacios, y aplica nameKey', () => {
    expect(searchText('Sublime gracia', '', null, 'del Señor\nque a un')).toBe(
      'sublime gracia del senor que a un',
    );
  });
});

describe('byName', () => {
  it('ordena en espanol, sin importar acentos ni mayusculas', () => {
    const names = ['Zarza', 'Álamo', 'beto', 'Ana'];
    expect([...names].sort(byName((n) => n))).toEqual(['Álamo', 'Ana', 'beto', 'Zarza']);
  });
});
