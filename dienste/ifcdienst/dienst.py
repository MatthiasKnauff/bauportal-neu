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
import ifcopenshell.util.unit as einheit
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

SCHLUESSEL = os.environ.get("DIENST_SCHLUESSEL", "")
app = FastAPI(title="Bauportal IFC-Dienst", docs_url=None, redoc_url=None)

# IFC-Klasse -> Bauteilart des Gebäudemodells (None = hängt von weiteren Angaben ab)
ARTEN = {
    "IfcWall": None, "IfcWallStandardCase": None, "IfcCurtainWall": "aussenwand",
    "IfcSlab": None, "IfcRoof": "dach",
    "IfcWindow": "fenster", "IfcDoor": "tuer",
    "IfcColumn": "stuetze", "IfcBeam": "stuetze", "IfcStair": "treppe", "IfcStairFlight": None,
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


def _aufbau(e, laenge: float) -> str:
    m = el.get_material(e, should_skip_usage=True)
    if m is None:
        return ""
    if m.is_a("IfcMaterialLayerSet"):
        teile = []
        for s in m.MaterialLayers:
            name = s.Material.Name if s.Material else (getattr(s, "Name", None) or "Schicht")
            dicke = (s.LayerThickness or 0) * laenge * 100
            teile.append(f"{name} {dicke:.1f} cm".replace(".", ",").replace(",0 cm", " cm") if dicke else name)
        return " | ".join(teile)
    if m.is_a("IfcMaterialConstituentSet"):
        return " | ".join(c.Material.Name for c in (m.MaterialConstituents or []) if c.Material)
    if m.is_a("IfcMaterialList"):
        return " | ".join(x.Name for x in m.Materials)
    return getattr(m, "Name", "") or ""


def _flaeche_aus_geometrie(e, art: str) -> float | None:
    """Fläche aus der Geometrie, wenn die Datei keine Mengen mitbringt. Wand: größte Seitenfläche, Decke/Dach: Grundfläche."""
    try:
        import ifcopenshell.geom
        import ifcopenshell.util.shape as form
        s = ifcopenshell.geom.settings()
        g = ifcopenshell.geom.create_shape(s, e).geometry
        f = form.get_side_area(g) if art in ("aussenwand", "innenwand") else form.get_footprint_area(g)
        return round(float(f), 2) if f and f > 0 else None
    except Exception:  # noqa: BLE001 – ohne brauchbare Geometrie bleibt die Menge leer
        return None


def auswerten(pfad: str) -> dict:
    f = ifcopenshell.open(pfad)
    laenge = einheit.calculate_unit_scale(f)          # Längeneinheit der Datei -> Meter
    flaeche = laenge * laenge
    try:  # Flächeneinheit kann eigens angegeben sein
        fe = einheit.get_project_unit(f, "AREAUNIT")
        flaeche = einheit.get_unit_scale(fe) if hasattr(einheit, "get_unit_scale") else flaeche  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001
        pass

    gebaeude = [{"kennung": b.GlobalId, "name": b.LongName or b.Name or "Gebäude"} for b in f.by_type("IfcBuilding")]

    etagen = sorted(f.by_type("IfcBuildingStorey"), key=lambda s: s.Elevation or 0)
    hoehen = [(s.Elevation or 0) * laenge for s in etagen]
    unten = min(range(len(etagen)), key=lambda i: abs(hoehen[i])) if etagen else 0   # das Geschoss nächst ±0,00 ist Ebene 0
    geschosse = []
    for i, s in enumerate(etagen):
        eltern = el.get_aggregate(s)
        hoehe = round(hoehen[i + 1] - hoehen[i], 3) if i + 1 < len(etagen) else None
        geschosse.append({"kennung": s.GlobalId, "name": s.LongName or s.Name or f"Geschoss {i + 1}", "ebene": i - unten, "hoehe": hoehe,
                          "gebaeude": eltern.GlobalId if eltern is not None and eltern.is_a("IfcBuilding") else None})

    raeume = []
    for r in f.by_type("IfcSpace"):
        eltern = el.get_aggregate(r)
        fl = _menge(r, ("NetFloorArea", "GrossFloorArea", "Area", "Fläche"))
        h = _menge(r, ("FinishCeilingHeight", "Height", "NetHeight"))
        raeume.append({"kennung": r.GlobalId, "nummer": r.Name or "", "name": r.LongName or r.Name or "Raum",
                       "nutzung": str(_aus_psets(r, ("Reference", "OccupancyType", "Category")) or ""),
                       "flaeche": round(fl * flaeche, 2) if fl else None, "hoehe": round(h * laenge, 3) if h else None,
                       "geschoss": eltern.GlobalId if eltern is not None and eltern.is_a("IfcBuildingStorey") else None})

    bauteile, uebersprungen, gerechnet = [], {}, 0
    for e in f.by_type("IfcElement"):
        klasse = e.is_a()
        if klasse not in ARTEN:
            if not e.is_a("IfcOpeningElement") and not e.is_a("IfcVirtualElement"):
                uebersprungen[klasse] = uebersprungen.get(klasse, 0) + 1
            continue
        if klasse == "IfcStairFlight" and el.get_aggregate(e) is not None:
            continue   # Lauf einer Treppe: die Treppe selbst zählt
        aussen = _aus_psets(e, ("IsExternal",))
        typ = (getattr(e, "PredefinedType", None) or "").upper()
        art = ARTEN[klasse]
        if art is None:
            if "Wall" in klasse:
                art = "aussenwand" if aussen else "innenwand"
            elif klasse == "IfcSlab":
                art = "dach" if typ == "ROOF" else "bodenplatte" if typ == "BASESLAB" else "decke"
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
                menge = _flaeche_aus_geometrie(e, art)
                gerechnet += 1 if menge else 0
        elif art in ("fenster", "tuer"):
            menge = 1
            b, h = getattr(e, "OverallWidth", None), getattr(e, "OverallHeight", None)
            if b and h:
                abmessung = f"{b * laenge:.2f} × {h * laenge:.2f} m".replace(".", ",")
        elif art == "stuetze":
            mass = "m"
            m = _menge(e, ("Length", "Height", "Länge"))
            menge = round(m * laenge, 2) if m else None
        else:
            menge = 1
        bauteile.append({"kennung": e.GlobalId, "art": art, "name": e.Name or typname or klasse[3:], "geschoss": ort.GlobalId if ort is not None and ort.is_a("IfcBuildingStorey") else None,
                         "lage": "" if aussen is None else ("aussen" if aussen else "innen"), "menge": menge, "einheit": mass, "abmessung": abmessung, "aufbau": _aufbau(e, laenge)})

    return {"schema": f.schema, "gebaeude": gebaeude, "geschosse": geschosse, "raeume": raeume, "bauteile": bauteile,
            "uebersprungen": uebersprungen, "flaechen_aus_geometrie": gerechnet}


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
