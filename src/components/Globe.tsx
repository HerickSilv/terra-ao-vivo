import Globe, { type GlobeInstance } from 'globe.gl';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import earthUrl from '../assets/earth-day.jpg';
import nightSkyUrl from '../assets/night-sky.png';
import { COUNTRY_SHAPES } from '../lib/geo';
import { esc } from '../lib/escape';
import { fmtInt } from '../lib/format';
import { subsolarPoint } from '../lib/sun';
import type { FireCell, FocusTarget, TrackPoint } from '../lib/types';

/** Ponto desenhado no globo: sismo ou evento EONET. Os campos são lidos pelo globe.gl. */
export interface Marker {
  id: string;
  lat: number;
  lng: number;
  /** Forma para marcas que não são círculo: triângulo (vulcão) ou losango (gelo). */
  shape?: 'triangle' | 'diamond';
  size: number;
  color: string;
  label: string;
  target: FocusTarget;
}

export interface Focus {
  key: number;
  lat: number;
  lng: number;
  altitude: number;
}

interface Props {
  markers: Marker[];
  tracks: TrackPoint[][];
  fires: FireCell[];
  showFires: boolean;
  focus: Focus | null;
  reducedMotion: boolean;
  onPlace: (lat: number, lng: number) => void;
  onTarget: (target: FocusTarget) => void;
  onView: (lat: number, lng: number) => void;
  summary: string;
}

/** Rampa de brasa: quanto mais focos no recorte, mais escuro-quente o hexágono. */
const EMBER = ['#7f2213', '#a82704', '#c83e00', '#ea6400', '#fc9417', '#fbc959'];
const LAND = '#253742';
const LAND_BR = '#21484c';
const GRID = '#284a6c';
const BR_ISO = '076';

const emberFor = (count: number): string => {
  const t = Math.min(1, Math.log10(1 + count) / 3.2);
  return EMBER[Math.min(EMBER.length - 1, Math.floor(t * EMBER.length))] ?? EMBER[0] ?? '#7f2213';
};

/** Vetor unitário do Sol, no mesmo sistema de coordenadas do three-globe (polar2Cartesian). */
function sunVector(date: Date): THREE.Vector3 {
  const { lat, lng } = subsolarPoint(date);
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((90 - lng) * Math.PI) / 180;
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );
}

const GLOBE_RADIUS = 100;

/** Marca em forma (triângulo ou losango) para vulcões e gelo: a forma é a codificação secundária. */
function shapeElement(m: Marker, onTarget: (t: FocusTarget) => void): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `mark mark-${m.shape ?? 'diamond'}`;
  el.tabIndex = -1;
  el.setAttribute('aria-hidden', 'true');
  el.title = m.label;
  el.style.setProperty('--mark', m.color);
  el.addEventListener('click', () => onTarget(m.target));
  return el;
}

/** Terminador: escurece o lado noturno com um gradiente suave; é o único "efeito" de tempo real. */
function makeTerminator(): { mesh: THREE.Mesh; material: THREE.ShaderMaterial } {
  const material = new THREE.ShaderMaterial({
    uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
    transparent: true,
    depthWrite: false,
    vertexShader: `
      varying vec3 vN;
      void main() {
        vN = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 sunDir;
      varying vec3 vN;
      void main() {
        float d = dot(normalize(vN), sunDir);
        float a = smoothstep(0.06, -0.22, d) * 0.62;
        gl_FragColor = vec4(vec3(0.008, 0.024, 0.07), a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(GLOBE_RADIUS * 1.002, 128, 96), material);
  mesh.name = 'terminator';
  return { mesh, material };
}

export default function GlobeView({
  markers,
  tracks,
  fires,
  showFires,
  focus,
  reducedMotion,
  onPlace,
  onTarget,
  onView,
  summary,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const handlers = useRef({ onPlace, onTarget, onView });
  const reduced = useRef(reducedMotion);

  useEffect(() => {
    handlers.current = { onPlace, onTarget, onView };
    reduced.current = reducedMotion;
  });

  // Criação única: o globo, a textura, os países e o terminador.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const globe = new Globe(el, { animateIn: !reduced.current })
      .globeImageUrl(earthUrl)
      .backgroundImageUrl(nightSkyUrl)
      .atmosphereColor('#3080bc')
      .atmosphereAltitude(0.16)
      .polygonsData(
        COUNTRY_SHAPES.map((c) => ({
          type: 'Feature' as const,
          id: c.id,
          properties: { name: c.name },
          geometry: c.geometry,
        })),
      )
      .polygonCapColor((f: object) => ((f as { id: string }).id === BR_ISO ? LAND_BR : LAND))
      .polygonSideColor(() => 'rgba(0,0,0,0)')
      .polygonStrokeColor(() => GRID)
      .polygonAltitude(0.003)
      .polygonLabel((f: object) => {
        const name = (f as { properties: { name: string } }).properties.name;
        return `<span class="tip">${esc(name)}</span>`;
      })
      .onGlobeClick((c) => handlers.current.onPlace(c.lat, c.lng))
      .onPolygonClick((_p, _e, c) => handlers.current.onPlace(c.lat, c.lng))
      .onHexClick((_h, _e, c) => handlers.current.onPlace(c.lat, c.lng))
      .onPointClick((obj) => handlers.current.onTarget((obj as Marker).target))
      .htmlElement((d: object) => shapeElement(d as Marker, (t) => handlers.current.onTarget(t)))
      .htmlAltitude(0.012)
      .pointAltitude(0.012)
      .pointResolution(12)
      .pointRadius((d: object) => (d as Marker).size)
      .pointColor((d: object) => (d as Marker).color)
      .pointLabel((d: object) => `<span class="tip">${esc((d as Marker).label)}</span>`)
      .pathColor(() => '#70d5ed')
      .pathStroke(1.4)
      .pathPointLat((p: object) => (p as TrackPoint).lat)
      .pathPointLng((p: object) => (p as TrackPoint).lng)
      .pathTransitionDuration(0)
      .hexBinPointWeight('count')
      .hexBinResolution(3)
      .hexMargin(0.22)
      .hexAltitude((h: { sumWeight: number }) => 0.006 + 0.028 * Math.min(1, Math.log10(1 + h.sumWeight) / 3.2))
      .hexTopColor((h: { sumWeight: number }) => emberFor(h.sumWeight))
      .hexSideColor((h: { sumWeight: number }) => emberFor(h.sumWeight))
      .hexLabel((h: { sumWeight: number }) => `<span class="tip">${fmtInt(h.sumWeight)} focos neste recorte</span>`);

    // Textura de dia tingida em tinta de oceano: a noite real vem do terminador, não da textura.
    const material = globe.globeMaterial() as THREE.MeshPhongMaterial;
    material.color.set('#3f5d78');
    material.shininess = 6;

    globe.pointOfView({ lat: -14, lng: -52, altitude: 1.95 }, 0);

    const controls = globe.controls();
    controls.minDistance = 120;
    controls.maxDistance = 420;
    controls.autoRotate = !reduced.current;
    controls.autoRotateSpeed = 0.28;
    // Qualquer gesto do visitante devolve o controle: nada de giro roubando o clique.
    const stopRotate = () => {
      controls.autoRotate = false;
    };
    controls.addEventListener('start', stopRotate);
    // Centro da vista, limitado a ~5 atualizações por segundo para não re-renderizar a cada quadro.
    let lastView = 0;
    const reportView = () => {
      const now = performance.now();
      if (now - lastView < 200) return;
      lastView = now;
      const pov = globe.pointOfView();
      handlers.current.onView(pov.lat, pov.lng);
    };
    controls.addEventListener('change', reportView);

    const terminator = makeTerminator();
    globe.scene().add(terminator.mesh);
    const updateSun = () => {
      const sunDir = terminator.material.uniforms.sunDir;
      if (sunDir) (sunDir.value as THREE.Vector3).copy(sunVector(new Date()));
    };
    updateSun();
    const sunTimer = window.setInterval(updateSun, 60_000);

    const resize = () => {
      globe.width(el.clientWidth).height(el.clientHeight);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    globeRef.current = globe;
    return () => {
      window.clearInterval(sunTimer);
      ro.disconnect();
      controls.removeEventListener('start', stopRotate);
      controls.removeEventListener('change', reportView);
      globeRef.current = null;
      globe._destructor();
      el.replaceChildren();
    };
  }, []);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    globe.pointsData(markers.filter((m) => !m.shape));
    globe.htmlElementsData(markers.filter((m) => m.shape));
  }, [markers]);

  useEffect(() => {
    globeRef.current?.pathsData(tracks);
  }, [tracks]);

  useEffect(() => {
    globeRef.current?.hexBinPointsData(showFires ? fires : []);
  }, [fires, showFires]);

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe) return;
    const controls = globe.controls();
    controls.autoRotate = !reducedMotion && controls.autoRotate;
  }, [reducedMotion]);

  useEffect(() => {
    if (!focus) return;
    globeRef.current?.pointOfView(
      { lat: focus.lat, lng: focus.lng, altitude: focus.altitude },
      reduced.current ? 0 : 1100,
    );
  }, [focus]);

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={summary}
      aria-describedby="globe-list"
      className="globe-canvas"
    />
  );
}
