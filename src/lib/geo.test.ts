import { describe, expect, it } from 'vitest';
import { COUNTRY_SHAPES, countryAt } from './geo';

describe('countryAt', () => {
  it('acha o país pelo ponto, com nome em português', () => {
    expect(countryAt(-15.8, -47.9)?.name).toContain('Brasil');
    expect(countryAt(48.9, 2.35)?.name).toContain('França');
  });

  it('devolve null no oceano', () => {
    expect(countryAt(0, -150)).toBeNull();
  });

  it('todos os países têm id numérico e nome', () => {
    expect(COUNTRY_SHAPES.length).toBeGreaterThan(150);
    for (const c of COUNTRY_SHAPES) {
      expect(c.id).toMatch(/^\d{3}$/);
      expect(c.name.length).toBeGreaterThan(0);
    }
  });
});
