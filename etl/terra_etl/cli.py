from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from . import inpe


def run(out: Path, now: datetime) -> dict:
    detections: list[inpe.Detection] = []
    used: list[str] = []
    for day in inpe.days_needed(now):
        raw = inpe.fetch_bytes(inpe.file_url(day))
        if raw is None:
            print(f"  - {inpe.file_name(day)}: ainda não publicado (ok)")
            continue
        rows = list(inpe.parse_rows(raw.decode("utf-8", errors="replace")))
        print(f"  - {inpe.file_name(day)}: {len(raw) / 1e6:.1f} MB, {len(rows)} detecções válidas")
        detections.extend(rows)
        used.append(inpe.file_name(day))
    if not used:
        raise inpe.EtlError("nenhum arquivo do INPE disponível")
    snapshot = inpe.build_snapshot(detections, now=now, files=used)
    inpe.validate_snapshot(snapshot, now=now)
    out.parent.mkdir(parents=True, exist_ok=True)
    # escrita atômica: nunca deixa um JSON pela metade no lugar do anterior
    tmp = out.with_suffix(".tmp")
    payload = json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"))
    tmp.write_text(payload, encoding="utf-8")
    tmp.replace(out)
    return snapshot


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(description="ETL de focos de calor do INPE")
    parser.add_argument("--out", type=Path, required=True, help="caminho do focos.json")
    parser.add_argument("--now", help="ISO 8601 UTC (somente para testes)")
    args = parser.parse_args(argv)
    now = (
        datetime.fromisoformat(args.now.replace("Z", "+00:00"))
        if args.now
        else datetime.now(UTC).replace(microsecond=0)
    )
    print(f"INPE -> {args.out} (agora = {now.isoformat()})")
    try:
        snap = run(args.out, now)
    except inpe.EtlError as err:
        print(f"ERRO: {err}", file=sys.stderr)
        return 1
    print(
        f"ok: {snap['total']} focos em 24 h (anteriores: {snap['previousTotal']}), "
        f"{len(snap['cells'])} células, última detecção {snap['latestDetection']}"
    )
    return 0
