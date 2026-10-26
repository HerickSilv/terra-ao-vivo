from datetime import UTC, datetime

import pytest

from terra_etl import inpe

NOW = datetime(2026, 10, 26, 18, 0, tzinfo=UTC)

CSV = """id,lat,lon,data_hora_gmt,satelite,municipio,estado,pais
a,-3.0186,-54.0479,2026-10-26 12:00:00,GOES-19,SANTAREM,PARÁ,Brasil
b,-3.0150,-54.0410,2026-10-26 12:10:00,NOAA-21,SANTAREM,PARÁ,Brasil
c,-20.5,-54.6,2026-10-25 20:00:00,AQUA,CAMPO GRANDE,MATO GROSSO DO SUL,Brasil
d,-10.0,-50.0,2026-10-24 19:00:00,AQUA,X,TOCANTINS,Brasil
e,abc,-50.0,2026-10-26 10:00:00,AQUA,X,TOCANTINS,Brasil
f,48.0,2.0,2026-10-26 10:00:00,AQUA,Paris,FR,Brasil
g,-12.0,-48.0,2026-10-26 99:99:99,AQUA,X,TOCANTINS,Brasil
"""


def test_title_pt_keeps_small_words_lowercase():
    assert inpe.title_pt("MATO GROSSO DO SUL") == "Mato Grosso do Sul"
    assert inpe.title_pt("PARÁ") == "Pará"
    assert inpe.title_pt("  rio grande do norte ") == "Rio Grande do Norte"


def test_parse_rows_drops_invalid_and_out_of_bounds():
    rows = list(inpe.parse_rows(CSV))
    assert [r.state for r in rows] == ["Pará", "Pará", "Mato Grosso do Sul", "Tocantins"]


def test_cell_center_is_stable_inside_cell():
    assert inpe.cell_center(-3.0186) == inpe.cell_center(-3.0150) == -3.05
    assert inpe.cell_center(-54.0479) == -54.05


def test_build_snapshot_windows_and_aggregation():
    snap = inpe.build_snapshot(inpe.parse_rows(CSV), now=NOW, files=["x.csv"])
    assert snap["total"] == 3  # a, b (hoje) + c (ontem 20h, dentro de 24 h)
    assert snap["previousTotal"] == 1  # d
    assert snap["byState"][0] == {"state": "Pará", "count": 2}
    # a e b caem na mesma célula de 0,1°
    assert [-3.05, -54.05, 2] in snap["cells"]
    assert sum(n for _, _, n in snap["cells"]) == snap["total"]
    assert snap["latestDetection"] == "2026-10-26T12:10:00Z"
    inpe.validate_snapshot(snap, now=NOW)


def test_build_snapshot_without_window_data_fails():
    with pytest.raises(inpe.EtlError):
        inpe.build_snapshot([], now=NOW, files=[])


def test_validate_rejects_stale_source():
    snap = inpe.build_snapshot(inpe.parse_rows(CSV), now=NOW, files=["x.csv"])
    later = datetime(2026, 10, 28, 0, 0, tzinfo=UTC)
    with pytest.raises(inpe.EtlError, match="parada"):
        inpe.validate_snapshot(snap, now=later)


def test_validate_rejects_inconsistent_totals():
    snap = inpe.build_snapshot(inpe.parse_rows(CSV), now=NOW, files=["x.csv"])
    snap["total"] += 1
    with pytest.raises(inpe.EtlError):
        inpe.validate_snapshot(snap, now=NOW)


def test_days_needed_covers_48_hours():
    days = inpe.days_needed(NOW)
    assert [d.isoformat() for d in days] == ["2026-10-24", "2026-10-25", "2026-10-26"]


def test_file_name_pattern():
    assert inpe.file_name(NOW.date()) == "focos_diario_br_20261026.csv"
    assert inpe.is_valid_file_name("focos_diario_br_20261026.csv")
    assert not inpe.is_valid_file_name("../etc/passwd")
