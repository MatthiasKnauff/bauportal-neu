"""IFC-Dienst des Bauportals.

Liest eine IFC-Datei (IFC2x3 oder IFC4) und gibt zurück, was das Gebäudemodell braucht:
Gebäude, Geschosse, Räume und Bauteile – jeweils mit der Kennung aus dem Plan (GlobalId), damit ein neuer
Planstand mit dem vorhandenen Modell verglichen werden kann. Mengen kommen aus den Mengenangaben der Datei;
fehlen sie, werden Wand- und Deckenflächen aus der Geometrie gerechnet.
"""
import os
import tempfile

import ifcopenshell
import ifcopenshell.util.element as el
import numpy as np
import ifcopenshell.util.unit as einheit
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse, Response

SCHLUESSEL = os.environ.get("DIENST_SCHLUESSEL", "")
app = FastAPI(title="Bauportal IFC-Dienst", docs_url=None, redoc_url=None)

# IFC-Klasse -> Bauteilart des Gebäudemodells (None = hängt von weiteren Angaben ab)
ARTEN = {
    "IfcWall": None, "IfcWallStandardCase": None, "IfcCurtainWall": "aussenwand",
    "IfcSlab": None, "IfcRoof": "dach",
    "IfcWindow": "fenster", "IfcDoor": "tuer",
    "IfcColumn": "stuetze", "IfcBeam": "stuetze", "IfcStair": "treppe", "IfcStairFlight": None,
    "IfcFooting": "fundament",
}
FLAECHE = ("NetSideArea", "GrossSideArea", "NetArea", "GrossArea", "NetFloorArea", "GrossFloorArea", "Area", "Fläche", "Flaeche")


def _menge(e, namen) -> float | None:
    for werte in el.get_psets(e, qtos_only=True).values():
        for n in namen:
            w = werte.get(n)
            if isinstance(w, (int, float)) and w > 0:
                return float(w)
    return None


def _aus_psets(e, namen):
    for werte in el.get_psets(e, psets_only=True).values():
        for n in namen:
            if werte.get(n) not in (None, ""):
                return werte[n]
    return None


def _schichten(e, laenge: float) -> list[dict]:
    """Schichten des Bauteils von außen nach innen: Material und Dicke in cm (None, wenn die Datei keine nennt).
    Fehlt der Materialname (Allplan), steht dort das Material oder Gewerk aus den Allplan-Attributen der Schicht."""
    m = el.get_material(e, should_skip_usage=True)
    if m is None:
        return []
    if m.is_a("IfcMaterialLayerSet"):
        angaben = [s.get("properties", {}) for k, s in sorted(el.get_psets(e).get("AllplanAttributes", {}).items()) if k.startswith("Object Layer Attributes") and isinstance(s, dict)]
        aus = []
        for i, s in enumerate(m.MaterialLayers):
            name = ((s.Material.Name if s.Material else None) or getattr(s, "Name", None) or "").strip()
            if not name and i < len(angaben):
                name = str(angaben[i].get("Material") or angaben[i].get("Gewerk") or "").strip()
            dicke = round((s.LayerThickness or 0) * laenge * 100, 1)
            aus.append({"material": name, "dicke": dicke or None})
        return aus
    if m.is_a("IfcMaterialConstituentSet"):
        return [{"material": c.Material.Name.strip(), "dicke": None} for c in (m.MaterialConstituents or []) if c.Material and c.Material.Name.strip()]
    if m.is_a("IfcMaterialList"):
        return [{"material": x.Name.strip(), "dicke": None} for x in m.Materials if x.Name.strip()]
    name = (getattr(m, "Name", "") or "").strip()
    return [{"material": name, "dicke": None}] if name else []


def _dreiecke(k) -> tuple:
    """Flächen und Normalen aller Dreiecke eines schon berechneten Körpers (Weltkoordinaten)."""
    _, _, v, d = k
    a, b, c = v[d[:, 0]], v[d[:, 1]], v[d[:, 2]]
    kreuz = np.cross(b - a, c - a)
    laenge = np.linalg.norm(kreuz, axis=1)
    gut = laenge > 1e-12
    return a[gut], b[gut], c[gut], laenge[gut] / 2, kreuz[gut] / laenge[gut][:, None]


def _netto(e, menge: float | None, art: str, koerper: dict) -> float | None:
    """Fläche abzüglich der Öffnungen im Bauteil (Körper ohne ausgeschnittene Öffnungen): Wand – Breite × Höhe der Öffnung,
    Decke/Dach/Bodenplatte – ihre Grundfläche."""
    if not menge:
        return menge
    ab = 0.0
    for r in getattr(e, "HasOpenings", None) or []:
        o = r.RelatedOpeningElement
        if o.id() not in koerper:
            continue
        # nur der Teil der Öffnung, der im Bauteil liegt (Öffnungskörper ragen oft über die Wand hinaus)
        lo = np.maximum(koerper[o.id()][0], koerper[e.id()][0])
        hi = np.minimum(koerper[o.id()][1], koerper[e.id()][1])
        d = np.clip(hi - lo, 0, None)
        if art in ("aussenwand", "innenwand"):
            ab += float(max(d[0], d[1]) * d[2])
        else:   # Decke/Dach: die Grundfläche der Öffnung selbst (Treppenlöcher sind oft nicht rechteckig), höchstens ihr Rechteck im Bauteil
            flaechen, n = _dreiecke(koerper[o.id()])[3:]
            ab += min(float(flaechen[n[:, 2] > 0.5].sum()), float(d[0] * d[1]))
    return round(max(0.0, menge - ab), 2) or None


def _volumen_aus_koerper(k) -> float | None:
    a, b, c, _, _ = _dreiecke(k)
    if not len(a):
        return None
    v = abs(float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum()) / 6)
    return round(v, 2) if v > 0 else None


def _ohne_ausschnitt():
    import ifcopenshell.geom
    e = ifcopenshell.geom.settings()
    e.set("disable-opening-subtractions", True)   # Öffnungen zieht _netto ab – das Ausschneiden kostete ¾ der Zeit
    return e


_OHNE_AUSSCHNITT = _ohne_ausschnitt()


def _flaeche_aus_geometrie(e, art: str) -> float | None:
    """Fläche aus der Geometrie, wenn die Datei keine Mengen mitbringt. Wand: größte Seitenfläche, Decke/Dach: Grundfläche."""
    try:
        import ifcopenshell.geom
        import ifcopenshell.util.shape as form
        g = ifcopenshell.geom.create_shape(_OHNE_AUSSCHNITT, e).geometry
        f = form.get_side_area(g) if art in ("aussenwand", "innenwand") else form.get_footprint_area(g)
        return round(float(f), 2) if f and f > 0 else None
    except Exception:  # noqa: BLE001 – ohne brauchbare Geometrie bleibt die Menge leer
        return None


def _normalen_aller(k):
    """Normalen aller Dreiecke eines Körpers (auch entarteter: dort Null) – in derselben Reihenfolge wie die Dreiecke."""
    _, _, v, d = k
    kreuz = np.cross(v[d[:, 1]] - v[d[:, 0]], v[d[:, 2]] - v[d[:, 0]])
    laenge = np.linalg.norm(kreuz, axis=1)
    return np.divide(kreuz, laenge[:, None], out=np.zeros_like(kreuz), where=laenge[:, None] > 1e-12)


def _flaeche_aus_koerper(e, art: str, koerper: dict) -> float | None:
    """Wie _flaeche_aus_geometrie, aber aus dem schon berechneten Körper (Weltkoordinaten) – ohne die Geometrie ein zweites Mal
    zu rechnen (das kostete bei Plänen ohne Mengenangaben fast so viel wie das ganze Einlesen). Wand: Seitenfläche in Richtung
    ihrer eigenen Y-Achse (eine Seite), sonst die Grundfläche von oben gesehen."""
    k = koerper.get(e.id())
    if k is None:
        return _flaeche_aus_geometrie(e, art)
    _, _, _, flaechen, normalen = _dreiecke(k)
    if not len(flaechen):
        return None
    if art in ("aussenwand", "innenwand"):
        import ifcopenshell.util.placement as lage
        y = np.array(lage.get_local_placement(e.ObjectPlacement))[:3, 1] if e.ObjectPlacement else np.array([0.0, 1.0, 0.0])
        y = y / (np.linalg.norm(y) or 1)
        f = float(flaechen[normalen @ y > 0.01].sum())   # wie get_side_area: sichtbar aus Y (Winkel unter 90°)
    else:
        import shapely
        import shapely.ops
        _, _, v, d = k
        oben = d[[i for i, n in enumerate(_normalen_aller(k)) if n[2] > 0.01]]
        f = float(shapely.ops.unary_union([shapely.Polygon(v[t][:, :2]) for t in oben]).area) if len(oben) else 0.0   # wie get_footprint_area
    return round(f, 2) if f > 0 else None


def _volumen_aus_geometrie(e) -> float | None:
    try:
        import ifcopenshell.geom
        import ifcopenshell.util.shape as form
        v = form.get_volume(ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), e).geometry)
        return round(float(v), 2) if v and v > 0 else None
    except Exception:  # noqa: BLE001 – ohne brauchbare Geometrie bleibt die Menge leer
        return None


def _koerper(f) -> dict:
    """Alle Bauteile einmal als Körper in Weltkoordinaten: id -> (kleinste Ecke, größte Ecke, Punkte, Dreiecke)."""
    import multiprocessing

    import ifcopenshell.geom
    einst = ifcopenshell.geom.settings()
    einst.set("use-world-coords", True)
    # Öffnungen nicht ausschneiden: das Ausschneiden (Boolesche Geometrie) kostete bei echten Plänen ¾ der Zeit.
    # Die Flächen der Öffnungen zieht _netto ab; für die Grundrisse (Außenwände) sind ungeteilte Wände sogar besser.
    einst.set("disable-opening-subtractions", True)
    aus = {}
    lauf = ifcopenshell.geom.iterator(einst, f, max(1, min(4, multiprocessing.cpu_count())), include=f.by_type("IfcElement") + f.by_type("IfcSpace"))
    if lauf.initialize():
        while True:
            k = lauf.get()
            v = np.array(k.geometry.verts).reshape(-1, 3)
            if len(v):
                aus[k.id] = (v.min(0), v.max(0), v, np.array(k.geometry.faces).reshape(-1, 3))
            if not lauf.next():
                break
    return aus


def _aussenwaende(waende: list, koerper: dict, zelle: float = 0.1) -> set:
    """Welche Wände eines Geschosses liegen außen? Die Wände werden als Grundriss auf ein Raster gelegt;
    von außen wird „geflutet“ – eine Wand, an die das Wasser kommt, ist eine Außenwand."""
    da = [w for w in waende if w.id() in koerper]
    if not da:
        return set()
    lo = np.min([koerper[w.id()][0][:2] for w in da], axis=0) - 1.0
    hi = np.max([koerper[w.id()][1][:2] for w in da], axis=0) + 1.0
    nx, ny = (np.ceil((hi - lo) / zelle).astype(int) + 1).tolist()
    if nx * ny > 4_000_000:
        return set()   # sehr großes Gelände: lieber keine Aussage als eine falsche
    wand = np.zeros((nx, ny), dtype=np.int32)   # 0 = frei, sonst Nummer der Wand + 1
    for nr, w in enumerate(da):
        _, _, v, dreiecke = koerper[w.id()]
        p = (v[:, :2] - lo) / zelle
        for a, b, c in p[dreiecke]:
            x0, y0 = np.floor(np.minimum(np.minimum(a, b), c)).astype(int)
            x1, y1 = np.ceil(np.maximum(np.maximum(a, b), c)).astype(int)
            if x1 - x0 > 4000 or y1 - y0 > 4000:
                continue
            gx, gy = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5, indexing="ij")
            d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
            if abs(d) < 1e-9:
                continue   # Dreieck steht senkrecht: im Grundriss nur eine Linie
            l1 = ((b[1] - c[1]) * (gx - c[0]) + (c[0] - b[0]) * (gy - c[1])) / d
            l2 = ((c[1] - a[1]) * (gx - c[0]) + (a[0] - c[0]) * (gy - c[1])) / d
            drin = (l1 >= -0.02) & (l2 >= -0.02) & (l1 + l2 <= 1.02)
            teil = wand[x0:x1 + 1, y0:y1 + 1]
            teil[drin[: teil.shape[0], : teil.shape[1]] & (teil == 0)] = nr + 1
    # kleine Fugen zwischen Wänden schließen, dann von der Ecke aus fluten
    dicht = wand > 0
    for _ in range(2):
        d2 = dicht.copy()
        d2[1:, :] |= dicht[:-1, :]; d2[:-1, :] |= dicht[1:, :]; d2[:, 1:] |= dicht[:, :-1]; d2[:, :-1] |= dicht[:, 1:]
        dicht = d2
    # Fluten in einem Zug: zusammenhängende freie Flächen bestimmen; außen ist, was den Rand berührt.
    # (Vorher wuchs das Wasser Zelle für Zelle – bei großen Grundrissen tausende Durchgänge über Millionen Zellen.)
    from scipy import ndimage
    teile, _ = ndimage.label(~dicht)
    rand = np.unique(np.concatenate([teile[0, :], teile[-1, :], teile[:, 0], teile[:, -1]]))
    aussen = np.isin(teile, rand[rand > 0])
    nah = aussen.copy()
    for _ in range(4):   # die geschlossenen Fugen wieder überbrücken
        n = nah.copy()
        n[1:, :] |= nah[:-1, :]; n[:-1, :] |= nah[1:, :]; n[:, 1:] |= nah[:, :-1]; n[:, :-1] |= nah[:, 1:]
        nah = n
    return {da[nr - 1].id() for nr in np.unique(wand[nah & (wand > 0)])}


def _zahl(x: float) -> str:
    return f"{x:.2f}".replace(".", ",")


def auswerten(pfad: str) -> dict:
    f = ifcopenshell.open(pfad)
    laenge = einheit.calculate_unit_scale(f)          # Längeneinheit der Datei -> Meter
    flaeche = einheit.calculate_unit_scale(f, "AREAUNIT")   # Flächen haben oft eine eigene Einheit (m², auch wenn in mm gezeichnet wird)
    koerper = _koerper(f)                              # Weltkoordinaten in Metern
    ebenen = lambda e: [x.Name for x in el.get_layers(f, e) if x.Name]   # CAD-Layer, z. B. „Wand Mauerwerk tragend“  # noqa: E731
    allplan = lambda e: el.get_psets(e).get("AllplanAttributes", {})     # noqa: E731

    def name(e, sonst: str) -> str:
        """Bezeichnung: der Name aus dem Plan; fehlt er (Allplan lässt ihn oft leer), der Layer, sonst der Objektname."""
        return (e.Name or "").strip() or next((n for n in ebenen(e) if n.lower() not in ("undefiniert", "standard", "0")), "") or str(allplan(e).get("Objektname") or "") or sonst

    def gewerk(e) -> str:
        a = allplan(e)
        return str(a.get("Gewerk") or next((s["properties"]["Gewerk"] for s in a.values() if isinstance(s, dict) and s.get("properties", {}).get("Gewerk")), ""))

    projekt = f.by_type("IfcProject")[0]
    gebaeude = [{"kennung": b.GlobalId, "name": b.LongName or b.Name or "Gebäude"} for b in f.by_type("IfcBuilding")]
    if not gebaeude:   # Datei ohne Gebäude (Geschosse hängen direkt am Projekt): das Projekt steht für das Gebäude
        gebaeude = [{"kennung": projekt.GlobalId, "name": (projekt.LongName or projekt.Name or "Gebäude").strip()}]

    # Geschosse: Höhenlage aus den Wänden des Geschosses, wenn es welche gibt – die Angabe in der Datei stimmt nicht immer
    etagen = f.by_type("IfcBuildingStorey")
    inhalt = {s.id(): [] for s in etagen}
    for e in f.by_type("IfcElement"):
        ort = el.get_container(e)
        if ort is not None and ort.id() in inhalt:
            inhalt[ort.id()].append(e)
    lage_z = {s.id(): round((s.Elevation or 0) * laenge, 3) for s in etagen}
    # Höhenlage aus den Wänden: verlässlicher als die Angabe am Geschoss (die bei Allplan teils fehlt oder für mehrere
    # Geschosse gleich ist). Genommen wird sie, wenn sie die Geschosse eindeutig trennt.
    aus_waenden = {}
    for s in etagen:
        zs = sorted(koerper[e.id()][0][2] for e in inhalt[s.id()] if e.is_a("IfcWall") and e.id() in koerper)
        if zs:
            aus_waenden[s.id()] = round(float(zs[len(zs) // 4]), 2)   # unteres Viertel: einzelne tiefer reichende Wände zählen nicht
    if len(aus_waenden) > 1 and len({round(z, 1) for z in aus_waenden.values()}) == len(aus_waenden):
        lage_z.update(aus_waenden)
    # Reihenfolge: belegte Geschosse nach ihrer Höhenlage. Ein leeres Geschoss (z. B. ein noch ungezeichnetes Dachgeschoss)
    # hat oft keine brauchbare Höhe – es bleibt dort, wo es in der Datei steht, also hinter seinem Vorgänger.
    datei = list(etagen)
    belegt = sorted((s for s in datei if inhalt[s.id()]), key=lambda s: lage_z[s.id()])
    etagen = list(belegt) if belegt else sorted(datei, key=lambda s: lage_z[s.id()])
    if belegt:
        for i, s in enumerate(datei):
            if s not in etagen:
                davor = next((v for v in reversed(datei[:i]) if v in etagen), None)
                etagen.insert(etagen.index(davor) + 1 if davor is not None else 0, s)
    leer = {s.id() for s in etagen if belegt and not inhalt[s.id()]}
    unten = min((i for i in range(len(etagen)) if etagen[i].id() not in leer), key=lambda i: abs(lage_z[etagen[i].id()]), default=0)   # das Geschoss nächst ±0,00 ist Ebene 0
    geschosse = []
    for i, s in enumerate(etagen):
        eltern = el.get_aggregate(s)
        hoehe = round(lage_z[etagen[i + 1].id()] - lage_z[s.id()], 3) if i + 1 < len(etagen) and s.id() not in leer and etagen[i + 1].id() not in leer else None
        geschosse.append({"kennung": s.GlobalId, "name": s.LongName or s.Name or f"Geschoss {i + 1}", "ebene": i - unten, "hoehe": hoehe if hoehe and hoehe > 0 else None,
                          "gebaeude": eltern.GlobalId if eltern is not None and eltern.is_a("IfcBuilding") else None})

    raeume, raum_gerechnet = [], 0
    for r in f.by_type("IfcSpace"):
        eltern = el.get_aggregate(r)
        fl = _menge(r, ("NetFloorArea", "GrossFloorArea", "Area", "Fläche"))
        if not fl:   # keine Menge in der Datei: Grundfläche des Raumkörpers (schon in m²)
            fl = (_flaeche_aus_koerper(r, "raum", koerper) or 0) / flaeche or None
            raum_gerechnet += 1 if fl else 0
        h = _menge(r, ("FinishCeilingHeight", "Height", "NetHeight"))
        raeume.append({"kennung": r.GlobalId, "nummer": r.Name or "", "name": r.LongName or r.Name or "Raum",
                       "nutzung": str(_aus_psets(r, ("Reference", "OccupancyType", "Category")) or ""),
                       "flaeche": round(fl * flaeche, 2) if fl else None, "hoehe": round(h * laenge, 3) if h else None,
                       "geschoss": eltern.GlobalId if eltern is not None and eltern.is_a("IfcBuildingStorey") else None})

    # Außen oder innen: steht es nicht in der Datei, wird es je Geschoss aus dem Grundriss ermittelt
    waende = [e for e in f.by_type("IfcWall")]
    angabe = {w.id(): _aus_psets(w, ("IsExternal",)) for w in waende}
    aussen_geo: set = set()
    if any(v is None for v in angabe.values()):
        for s in etagen:
            aussen_geo |= _aussenwaende([w for w in inhalt[s.id()] if w.is_a("IfcWall")], koerper)

    bauteile, uebersprungen, gerechnet, lage_gerechnet = [], {}, 0, 0
    lage_von = {}   # Wand -> Lage, für Fenster und Türen in dieser Wand
    lose = []       # Bauteile ohne eigene Klasse (bei Allplan z. B. die Einzelteile von Fenstern und Türen)
    for e in f.by_type("IfcElement"):
        klasse = e.is_a()
        if klasse not in ARTEN:
            if e.is_a("IfcOpeningElement") or e.is_a("IfcVirtualElement"):
                continue
            lose.append(e)
            continue
        if klasse == "IfcStairFlight" and el.get_aggregate(e) is not None:
            continue   # Lauf einer Treppe: die Treppe selbst zählt
        if klasse == "IfcRoof" and any(t.is_a("IfcSlab") for t in el.get_parts(e)):
            continue   # Dach aus einzelnen Dachflächen: die Flächen zählen, nicht die Klammer darum
        dachteil = klasse == "IfcSlab" and el.get_aggregate(e) is not None and el.get_aggregate(e).is_a("IfcRoof")
        aussen = _aus_psets(e, ("IsExternal",))
        if aussen is None and "Wall" in klasse and koerper.get(e.id()) is not None and aussen_geo is not None and any(v is None for v in angabe.values()):
            aussen = e.id() in aussen_geo
            lage_gerechnet += 1
        typ = (getattr(e, "PredefinedType", None) or "").upper()
        art = ARTEN[klasse]
        if art is None:
            if "Wall" in klasse:
                art = "aussenwand" if aussen else "innenwand"
            elif klasse == "IfcSlab":
                art = "dach" if typ == "ROOF" or dachteil else "bodenplatte" if typ == "BASESLAB" else "decke"
            else:
                art = "treppe"
        ort = el.get_container(e)
        typname = getattr(el.get_type(e), "Name", None)
        menge, mass, abmessung = None, "stk", ""
        if art in ("aussenwand", "innenwand", "decke", "dach", "bodenplatte"):
            mass = "m2"
            m = _menge(e, FLAECHE)
            if m:
                menge = round(m * flaeche, 2)
            else:
                menge = _netto(e, _flaeche_aus_koerper(e, art, koerper), art, koerper)
                gerechnet += 1 if menge else 0
        elif art in ("fenster", "tuer"):
            menge = 1
            b, h = getattr(e, "OverallWidth", None), getattr(e, "OverallHeight", None)
            if b and h:
                abmessung = f"{_zahl(b * laenge)} × {_zahl(h * laenge)} m"
        elif art == "fundament":
            mass = "m3"
            m = _menge(e, ("NetVolume", "GrossVolume", "Volumen"))
            if m:
                menge = round(m * einheit.calculate_unit_scale(f, "VOLUMEUNIT"), 2)
            else:
                menge = _volumen_aus_koerper(koerper[e.id()]) if e.id() in koerper else _volumen_aus_geometrie(e)
                gerechnet += 1 if menge else 0
        elif art == "stuetze":
            mass = "m"
            m = _menge(e, ("Length", "Height", "Länge"))
            if m:
                menge = round(m * laenge, 2)
            elif e.id() in koerper:   # Länge aus dem Körper: die größte Ausdehnung
                menge = round(float((koerper[e.id()][1] - koerper[e.id()][0]).max()), 2)
        else:
            menge = 1
        lage = "" if aussen is None else ("aussen" if aussen else "innen")
        lage_von[e.id()] = lage
        bauteile.append({"kennung": e.GlobalId, "art": art, "name": name(e, typname or klasse[3:]), "geschoss": ort.GlobalId if ort is not None and ort.is_a("IfcBuildingStorey") else None,
                         "lage": lage, "menge": menge, "einheit": mass, "abmessung": abmessung, "schichten": _schichten(e, laenge), "gewerk": gewerk(e),
                         "tragend": _aus_psets(e, ("LoadBearing",)), "wand": None})

    # Fenster und Türen ohne eigene Klasse: Manche Programme (Allplan) schreiben nur die Öffnung in der Wand und die
    # Einzelteile (Rahmen, Flügel, Glas …) als lose Körper. Dann zählt die Öffnung als ein Fenster oder eine Tür;
    # was davon, sagt der Layer der Teile, die in ihr liegen – sonst die Brüstungshöhe.
    in_oeffnung: set = set()
    lose_k = [(e, *koerper[e.id()][:2]) for e in lose if e.id() in koerper]
    for o in f.by_type("IfcOpeningElement"):
        if o.HasFillings or not o.VoidsElements or o.id() not in koerper:
            continue
        wirt = o.VoidsElements[0].RelatingBuildingElement
        if not wirt.is_a("IfcWall"):
            continue
        lo, hi = koerper[o.id()][:2]
        teile = [e for e, a, b in lose_k if (a >= lo - 0.15).all() and (b <= hi + 0.15).all()]
        in_oeffnung.update(e.id() for e in teile)
        ausdehnung = hi - lo
        hoehe = float(ausdehnung[2])
        # Breite: die waagerechte Ausdehnung, die nicht die Wanddicke ist
        dicke = sum((s.LayerThickness or 0) for s in getattr(el.get_material(wirt, should_skip_usage=True), "MaterialLayers", []) or []) * laenge
        waag = sorted((float(ausdehnung[0]), float(ausdehnung[1])), key=lambda x: abs(x - dicke) if dicke else -x)
        breite = waag[-1] if dicke else waag[0]
        bruestung = float(lo[2] - koerper[wirt.id()][0][2]) if wirt.id() in koerper else 0.0
        stimmen = [n.lower() for e in teile for n in ebenen(e)]
        tuer = sum(1 for n in stimmen if "tür" in n or "tuer" in n or "tor" in n)
        fenster = sum(1 for n in stimmen if "fenster" in n)
        art = "tuer" if tuer > fenster else "fenster" if fenster > tuer else ("tuer" if bruestung < 0.15 else "fenster")
        if breite < 0.2 or hoehe < 0.2:
            continue   # Schlitz, Durchbruch: kein Fenster und keine Tür
        ort = el.get_container(wirt)
        mass = f"{_zahl(breite)} × {_zahl(hoehe)} m"
        bauteile.append({"kennung": o.GlobalId, "art": art, "name": f"{'Tür' if art == 'tuer' else 'Fenster'} {mass}", "geschoss": ort.GlobalId if ort is not None and ort.is_a("IfcBuildingStorey") else None,
                         "lage": lage_von.get(wirt.id(), ""), "menge": 1, "einheit": "stk", "abmessung": mass + (f", Brüstung {_zahl(bruestung)} m" if art == "fenster" and bruestung >= 0.15 else ""),
                         "schichten": [], "gewerk": next((gewerk(e) for e in teile if gewerk(e)), ""), "tragend": None, "wand": wirt.GlobalId})
    # Fenster und Türen mit eigener Klasse liegen so außen oder innen wie ihre Wand
    kennung_wand = {}
    for o in f.by_type("IfcOpeningElement"):
        for fuellung in o.HasFillings or []:
            if o.VoidsElements:
                kennung_wand[fuellung.RelatedBuildingElement.GlobalId] = o.VoidsElements[0].RelatingBuildingElement
    for b in bauteile:
        if b["art"] in ("fenster", "tuer") and b["kennung"] in kennung_wand:
            wirt = kennung_wand[b["kennung"]]
            b["wand"] = wirt.GlobalId   # die Wand, in der das Fenster oder die Tür sitzt
            if not b["lage"]:
                b["lage"] = lage_von.get(wirt.id(), "")
    for e in lose:
        if e.id() not in in_oeffnung:
            uebersprungen[e.is_a()] = uebersprungen.get(e.is_a(), 0) + 1

    return {"schema": f.schema, "gebaeude": gebaeude, "geschosse": geschosse, "raeume": raeume, "bauteile": bauteile,
            "uebersprungen": uebersprungen, "flaechen_aus_geometrie": gerechnet + raum_gerechnet, "lage_aus_geometrie": lage_gerechnet, "teile_in_oeffnungen": len(in_oeffnung)}


# Art je Klasse für die 3D-Darstellung: w Wand, f Fenster, d Tür, s Decke/Platte, r Dach, x Sonstiges
_NETZART = {"IfcWall": "w", "IfcWallStandardCase": "w", "IfcCurtainWall": "w", "IfcWindow": "f", "IfcDoor": "d", "IfcSlab": "s", "IfcRoof": "r",
            "IfcPlate": "f", "IfcMember": "x", "IfcColumn": "x", "IfcBeam": "x", "IfcStair": "x", "IfcStairFlight": "x", "IfcRailing": "x", "IfcCovering": "x"}


def netz(pfad: str) -> dict:
    """Das Gebäude als Dreiecke für die 3D-Ansicht: je Bauteil Kennung (GlobalId), Art, Geschoss, Punkte in cm und Dreiecke.
    Hier mit ausgeschnittenen Öffnungen (Fenster sitzen sichtbar in der Wand) – das kostet Zeit, läuft aber nach dem Einlesen
    für sich allein, die Übernahme wartet nicht darauf."""
    import multiprocessing

    import ifcopenshell.geom
    f = ifcopenshell.open(pfad)
    einst = ifcopenshell.geom.settings()
    einst.set("use-world-coords", True)
    teile = [e for e in f.by_type("IfcElement") if not e.is_a("IfcOpeningElement") and not e.is_a("IfcVirtualElement") and not e.is_a("IfcFurnishingElement")]
    geschosse = {}

    def geschoss(e):
        c = el.get_container(e)
        while c is None and (a := el.get_aggregate(e)) is not None:
            e, c = a, el.get_container(a)
        return c.GlobalId if c is not None and c.is_a("IfcBuildingStorey") else ""

    aus = []
    lauf = ifcopenshell.geom.iterator(einst, f, max(1, min(4, multiprocessing.cpu_count())), include=teile) if teile else None
    if lauf and lauf.initialize():
        while True:
            k = lauf.get()
            v = np.array(k.geometry.verts).reshape(-1, 3)
            if len(v):
                e = f.by_id(k.id)
                art = next((a for kl, a in _NETZART.items() if e.is_a(kl)), "x")
                if art == "s" and getattr(e, "PredefinedType", None) == "ROOF":
                    art = "r"
                aus.append({"k": e.GlobalId, "t": art, "g": geschoss(e), "v": np.round(v * 100).astype(int).ravel().tolist(), "i": list(k.geometry.faces)})
            if not lauf.next():
                break
    masz = einheit.calculate_unit_scale(f)   # Höhen der Geschosse stehen in der Einheit der Datei (oft mm)
    for s in f.by_type("IfcBuildingStorey"):
        geschosse[s.GlobalId] = {"k": s.GlobalId, "name": (s.Name or "").strip() or "Geschoss", "ebene": round(float(s.Elevation or 0) * masz, 2)}
    return {"elemente": aus, "geschosse": sorted(geschosse.values(), key=lambda g: g["ebene"])}


@app.get("/health")
def health():
    return {"status": "ok", "version": os.environ.get("APP_VERSION", "dev"), "ifcopenshell": ifcopenshell.version}


@app.post("/auswerten")
async def route_auswerten(req: Request, x_schluessel: str | None = Header(default=None)):
    if not SCHLUESSEL or x_schluessel != SCHLUESSEL:
        raise HTTPException(status_code=403)
    with tempfile.NamedTemporaryFile(suffix=".ifc") as t:
        async for teil in req.stream():
            t.write(teil)
        t.flush()
        if t.tell() == 0:
            return JSONResponse({"fehler": "Die Datei ist leer"}, status_code=400)
        try:
            return auswerten(t.name)
        except Exception as e:  # noqa: BLE001
            return JSONResponse({"fehler": f"Die Datei lässt sich nicht als IFC lesen ({str(e)[:160]})"}, status_code=400)


@app.post("/netz")
async def route_netz(req: Request, x_schluessel: str | None = Header(default=None)):
    """Die Dreiecke für die 3D-Ansicht, gepackt (gzip) – kann bei großen Plänen eine Weile dauern."""
    import gzip
    import json
    if not SCHLUESSEL or x_schluessel != SCHLUESSEL:
        raise HTTPException(status_code=403)
    with tempfile.NamedTemporaryFile(suffix=".ifc") as t:
        async for teil in req.stream():
            t.write(teil)
        t.flush()
        if t.tell() == 0:
            return JSONResponse({"fehler": "Die Datei ist leer"}, status_code=400)
        try:
            d = netz(t.name)
        except Exception as e:  # noqa: BLE001
            return JSONResponse({"fehler": f"Die Datei lässt sich nicht als IFC lesen ({str(e)[:160]})"}, status_code=400)
    return Response(gzip.compress(json.dumps(d, separators=(",", ":")).encode(), 6), media_type="application/gzip")
