import { describe, expect, it } from 'vitest';
import { esc, safeHttpsUrl } from './escape';
import { fmtCoords, fmtDec, fmtInt, fmtRelative, placePt, shortPlace, wrapLng } from './format';
import { subsolarPoint } from './sun';

describe('escape', () => {
  it('escapa HTML vindo de APIs', () => {
    expect(esc('<img src=x onerror="alert(1)">&\'')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;',
    );
  });

  it('aceita apenas links https', () => {
    expect(safeHttpsUrl('https://earthquake.usgs.gov/x')).toBe('https://earthquake.usgs.gov/x');
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('http://exemplo.com')).toBeNull();
    expect(safeHttpsUrl('data:text/html,<b>')).toBeNull();
    expect(safeHttpsUrl('não é url')).toBeNull();
    expect(safeHttpsUrl(null)).toBeNull();
  });
});

describe('format', () => {
  it('formata números em pt-BR', () => {
    expect(fmtInt(14532)).toBe('14.532');
    expect(fmtDec(5.2)).toBe('5,2');
    expect(fmtDec(4.5, 1)).toBe('4,5');
  });

  it('formata tempo relativo', () => {
    const now = 1_000_000_000_000;
    expect(fmtRelative(now - 10_000, now)).toBe('agora');
    expect(fmtRelative(now - 12 * 60_000, now)).toBe('há 12 min');
    expect(fmtRelative(now - 3 * 3_600_000, now)).toBe('há 3 h');
    expect(fmtRelative(now - 3 * 86_400_000, now)).toBe('há 3 d');
    expect(fmtRelative(now + 5_000, now)).toBe('agora');
  });

  it('formata coordenadas com hemisférios em português', () => {
    expect(fmtCoords(-12.5, -47.1667)).toBe('12°30′S 047°10′O');
    expect(fmtCoords(35.68, 139.69)).toBe('35°41′N 139°41′L');
    expect(fmtCoords(0, 0)).toBe('00°00′N 000°00′L');
  });

  it('arredonda 59,6 minutos sem gerar 60′', () => {
    expect(fmtCoords(10.9999, 0)).toBe('11°00′N 000°00′L');
  });

  it('normaliza longitude', () => {
    expect(wrapLng(190)).toBe(-170);
    expect(wrapLng(-190)).toBe(170);
    expect(wrapLng(45)).toBe(45);
  });

  it('traduz a distância do USGS', () => {
    expect(placePt('205 km NW of Port-Olry, Vanuatu')).toBe('205 km a NO de Port-Olry, Vanuatu');
    expect(placePt('9 km E of Pahala, Hawaii')).toBe('9 km a L de Pahala, Hawaii');
    expect(placePt('northern Mid-Atlantic Ridge')).toBe('northern Mid-Atlantic Ridge');
  });

  it('extrai o trecho final do local', () => {
    expect(shortPlace('283 km E of Levuka, Fiji')).toBe('Fiji');
    expect(shortPlace('Bonin Islands')).toBe('Bonin Islands');
  });
});

describe('subsolarPoint', () => {
  it('declinação ~0 no equinoque de março de 2026', () => {
    const p = subsolarPoint(new Date('2026-03-20T14:46:00Z'));
    expect(Math.abs(p.lat)).toBeLessThan(0.15);
    expect(p.lng).toBeGreaterThan(-43);
    expect(p.lng).toBeLessThan(-37);
  });

  it('declinação ±23,4° nos solstícios', () => {
    expect(subsolarPoint(new Date('2026-06-21T08:24:00Z')).lat).toBeCloseTo(23.44, 1);
    expect(subsolarPoint(new Date('2026-12-21T20:50:00Z')).lat).toBeCloseTo(-23.44, 1);
  });

  it('26/10/2026 ao meio-dia UTC: sol no hemisfério sul, longitude levemente a oeste', () => {
    const p = subsolarPoint(new Date('2026-10-26T12:00:00Z'));
    expect(p.lat).toBeGreaterThan(-13);
    expect(p.lat).toBeLessThan(-12.2);
    expect(p.lng).toBeGreaterThan(-5);
    expect(p.lng).toBeLessThan(-3.5);
  });

  it('a longitude desloca 15° por hora para oeste', () => {
    const a = subsolarPoint(new Date('2026-10-26T12:00:00Z')).lng;
    const b = subsolarPoint(new Date('2026-10-26T13:00:00Z')).lng;
    expect(a - b).toBeCloseTo(15, 0);
  });
});
