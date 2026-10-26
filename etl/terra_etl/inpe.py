"""Leitura e agregação dos CSVs diários de focos de calor do INPE (Programa Queimadas).

Por que existe: o CSV de um dia completo tem ~4-5 MB sem compressão (~30 mil linhas). Em vez de
empurrar isso para o navegador, o ETL agrega numa grade de 0,1° e publica um JSON compacto.
"""

from __future__ import annotations

import csv
import io
import re
import time
import urllib.error
import urllib.request
from collections import Counter
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta

BASE_URL = "https://dataserver-coids.inpe.br/queimadas/queimadas/focos/csv/diario/Brasil/"
USER_AGENT = "terra-ao-vivo-etl/1.0 (projeto de portfolio; dados abertos INPE)"
CELL_DEG = 0.1
WINDOW_HOURS = 24
SMALL_WORDS = {"de", "do", "da", "dos", "das", "e"}
# Caixa aproximada do território brasileiro (inclui ilhas oceânicas): descarta coordenadas absurdas.
BBOX = (-34.5, 6.0, -75.0, -28.0)  # lat_min, lat_max, lng_min, lng_max


class EtlError(RuntimeError):
    """Falha que deve interromper a publicação (o site mantém a versão anterior)."""


@dataclass(frozen=True, slots=True)
class Detection:
    lat: float
    lng: float
    time: datetime  # UTC
    state: str


def file_name(day: date) -> str:
    return f"focos_diario_br_{day:%Y%m%d}.csv"


def file_url(day: date) -> str:
    return BASE_URL + file_name(day)


def fetch_bytes(url: str, *, retries: int = 3, timeout: float = 90.0) -> bytes | None:
    """GET com retry/backoff. Retorna None em 404 (arquivo do dia ainda não publicado)."""
    last: Exception | None = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (URL https fixa)
                return resp.read()
        except urllib.error.HTTPError as err:
            if err.code == 404:
                return None
            last = err
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            last = err
        time.sleep(2**attempt)
    raise EtlError(f"falha ao baixar {url}: {last}")


def title_pt(name: str) -> str:
    """'MATO GROSSO DO SUL' -> 'Mato Grosso do Sul'."""
    words = name.strip().lower().split()
    return " ".join(w if (i and w in SMALL_WORDS) else w.capitalize() for i, w in enumerate(words))


def parse_rows(text: str) -> Iterator[Detection]:
    """Converte o CSV em Detection; linhas inválidas são descartadas silenciosamente."""
    for row in csv.DictReader(io.StringIO(text)):
        try:
            lat = float(row["lat"])
            lng = float(row["lon"])
            when = datetime.strptime(row["data_hora_gmt"].strip(), "%Y-%m-%d %H:%M:%S").replace(
                tzinfo=UTC
            )
        except (KeyError, ValueError, AttributeError):
            continue
        if not (BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lng <= BBOX[3]):
            continue
        yield Detection(lat, lng, when, title_pt(row.get("estado") or "Desconhecido"))


def cell_center(value: float) -> float:
    return round((int(value // CELL_DEG) + 0.5) * CELL_DEG, 2)


def _iso(moment: datetime) -> str:
    return moment.isoformat().replace("+00:00", "Z")


def build_snapshot(
    detections: Iterable[Detection],
    *,
    now: datetime,
    files: list[str],
) -> dict:
    """Agrega as detecções das últimas 24 h (e conta as 24 h anteriores para comparação)."""
    start = now - timedelta(hours=WINDOW_HOURS)
    prev_start = start - timedelta(hours=WINDOW_HOURS)
    cells: Counter[tuple[float, float]] = Counter()
    states: Counter[str] = Counter()
    total = previous = 0
    latest: datetime | None = None
    for d in detections:
        if start <= d.time <= now:
            total += 1
            cells[(cell_center(d.lat), cell_center(d.lng))] += 1
            states[d.state] += 1
            if latest is None or d.time > latest:
                latest = d.time
        elif prev_start <= d.time < start:
            previous += 1
    if latest is None:
        raise EtlError("nenhuma detecção na janela de 24 h")
    return {
        "schemaVersion": 1,
        "generatedAt": _iso(now),
        "source": {
            "name": "INPE - Programa Queimadas",
            "url": "https://terrabrasilis.dpi.inpe.br/queimadas/portal/",
            "files": files,
        },
        "window": {"from": _iso(start), "to": _iso(now), "hours": WINDOW_HOURS},
        "latestDetection": _iso(latest),
        "total": total,
        "previousTotal": previous,
        "byState": [{"state": s, "count": c} for s, c in states.most_common(12)],
        "cells": [[lat, lng, n] for (lat, lng), n in sorted(cells.items())],
    }


def validate_snapshot(snapshot: dict, *, now: datetime, max_age_hours: float = 24.0) -> None:
    """Sanidade antes de publicar: um dado quebrado não pode substituir o anterior."""
    if sum(n for _, _, n in snapshot["cells"]) != snapshot["total"]:
        raise EtlError("soma das células difere do total")
    if snapshot["total"] < 1:
        raise EtlError("total de focos inválido")
    latest = datetime.fromisoformat(snapshot["latestDetection"].replace("Z", "+00:00"))
    age = (now - latest).total_seconds() / 3600
    if age > max_age_hours:
        raise EtlError(f"última detecção tem {age:.1f} h: fonte parece parada")
    for lat, lng, n in snapshot["cells"]:
        if not (BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lng <= BBOX[3]) or n < 1:
            raise EtlError(f"célula inválida: {(lat, lng, n)}")


def days_needed(now: datetime) -> list[date]:
    """Dias UTC que cobrem as últimas 48 h (janela atual + anterior)."""
    first = (now - timedelta(hours=2 * WINDOW_HOURS)).date()
    return [first + timedelta(days=i) for i in range((now.date() - first).days + 1)]


_FILE_RE = re.compile(r"focos_diario_br_\d{8}\.csv")


def is_valid_file_name(name: str) -> bool:
    return bool(_FILE_RE.fullmatch(name))
