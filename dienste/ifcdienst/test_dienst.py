"""Test des IFC-Dienstes mit einer selbst erzeugten kleinen IFC-Datei (zwei Geschosse, Wände, Decke, Fenster, Tür, Raum)."""
import os
import sys
import tempfile

os.environ["DIENST_SCHLUESSEL"] = "test"
import ifcopenshell  # noqa: E402
import ifcopenshell.api  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import dienst  # noqa: E402

run = ifcopenshell.api.run


def testdatei(pfad: str, og_wand_laenge: float = 6.0, mit_tuer: bool = True) -> None:
    f = ifcopenshell.api.run("project.create_file", version="IFC4")
    projekt = run("root.create_entity", f, ifc_class="IfcProject", name="Test")
    run("unit.assign_unit", f)   # Millimeter, wie viele CAD-Programme
    modell = run("context.add_context", f, context_type="Model")
    koerper = run("context.add_context", f, context_type="Model", context_identifier="Body", target_view="MODEL_VIEW", parent=modell)
    gelaende = run("root.create_entity", f, ifc_class="IfcSite", name="Grundstück")
    haus = run("root.create_entity", f, ifc_class="IfcBuilding", name="Wohnhaus")
    run("aggregate.assign_object", f, products=[gelaende], relating_object=projekt)
    run("aggregate.assign_object", f, products=[haus], relating_object=gelaende)
    etagen = {}
    for name, hoehe in (("EG", 0.0), ("OG", 2850.0)):
        s = run("root.create_entity", f, ifc_class="IfcBuildingStorey", name=name)
        s.Elevation = hoehe
        run("aggregate.assign_object", f, products=[s], relating_object=haus)
        etagen[name] = s

    def bauteil(klasse, name, etage, **mehr):
        e = run("root.create_entity", f, ifc_class=klasse, name=name, **mehr)
        run("spatial.assign_container", f, products=[e], relating_structure=etagen[etage])
        return e

    def wand(name, etage, laenge, aussen, flaeche=None):
        w = bauteil("IfcWall", name, etage)
        rep = run("geometry.add_wall_representation", f, context=koerper, length=laenge, height=2.75, thickness=0.365)
        run("geometry.assign_representation", f, product=w, representation=rep)
        p = run("pset.add_pset", f, product=w, name="Pset_WallCommon")
        run("pset.edit_pset", f, pset=p, properties={"IsExternal": aussen, **({"LoadBearing": True} if aussen else {})})
        if flaeche:
            q = run("pset.add_qto", f, product=w, name="Qto_WallBaseQuantities")
            run("pset.edit_qto", f, qto=q, properties={"NetSideArea": flaeche})
        return w

    aw = wand("Außenwand Nord", "EG", 8.0, True, flaeche=22.0)
    schichten = run("material.add_material_set", f, name="AW 36,5", set_type="IfcMaterialLayerSet")
    for name, dicke in (("Außenputz", 20.0), ("Mauerwerk", 365.0), ("Innenputz", 15.0)):
        schicht = run("material.add_layer", f, layer_set=schichten, material=run("material.add_material", f, name=name))
        run("material.edit_layer", f, layer=schicht, attributes={"LayerThickness": dicke})
    run("material.assign_material", f, products=[aw], type="IfcMaterialLayerSetUsage", material=schichten)
    wand("Innenwand Flur", "EG", 4.0, False)                 # ohne Mengenangabe: Fläche aus der Geometrie
    wand("Außenwand OG", "OG", og_wand_laenge, True)
    decke = bauteil("IfcSlab", "Decke über EG", "EG", predefined_type="FLOOR")
    q = run("pset.add_qto", f, product=decke, name="Qto_SlabBaseQuantities")
    run("pset.edit_qto", f, qto=q, properties={"NetArea": 96.5})
    fenster = bauteil("IfcWindow", "Fenster 1,26 x 1,38", "EG")
    fenster.OverallWidth, fenster.OverallHeight = 1260.0, 1380.0
    oeffnung = run("root.create_entity", f, ifc_class="IfcOpeningElement", name="Öffnung Fenster")
    run("feature.add_feature", f, feature=oeffnung, element=aw)
    run("feature.add_filling", f, opening=oeffnung, element=fenster)   # das Fenster sitzt in der Außenwand Nord
    if mit_tuer:
        bauteil("IfcDoor", "Haustür", "EG")
    bauteil("IfcFurniture", "Sofa", "EG")
    raum = run("root.create_entity", f, ifc_class="IfcSpace", name="0.01")
    raum.LongName = "Wohnen"
    run("aggregate.assign_object", f, products=[raum], relating_object=etagen["EG"])
    q = run("pset.add_qto", f, product=raum, name="Qto_SpaceBaseQuantities")
    run("pset.edit_qto", f, qto=q, properties={"NetFloorArea": 28.4})
    f.write(pfad)


def main() -> None:
    with tempfile.TemporaryDirectory() as ordner:
        pfad = f"{ordner}/test.ifc"
        testdatei(pfad)
        if len(sys.argv) > 1:   # Testdatei(en) für andere Prüfungen ablegen
            testdatei(f"{sys.argv[1]}/haus.ifc")
            testdatei(f"{sys.argv[1]}/haus-neuer-stand.ifc", og_wand_laenge=7.5, mit_tuer=False)
        c = TestClient(dienst.app)
        assert c.post("/auswerten", content=open(pfad, "rb").read()).status_code == 403
        r = c.post("/auswerten", content=open(pfad, "rb").read(), headers={"X-Schluessel": "test"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["schema"] == "IFC4" and [g["name"] for g in d["gebaeude"]] == ["Wohnhaus"]
        assert [(g["name"], g["ebene"], g["hoehe"]) for g in d["geschosse"]] == [("EG", 0, 2.85), ("OG", 1, None)], d["geschosse"]
        assert d["geschosse"][0]["gebaeude"] == d["gebaeude"][0]["kennung"]
        assert [(x["nummer"], x["name"], x["flaeche"]) for x in d["raeume"]] == [("0.01", "Wohnen", 28.4)], d["raeume"]
        b = {x["name"]: x for x in d["bauteile"]}
        assert set(b) == {"Außenwand Nord", "Innenwand Flur", "Außenwand OG", "Decke über EG", "Fenster 1,26 x 1,38", "Haustür"}, set(b)
        aw = b["Außenwand Nord"]
        assert (aw["art"], aw["lage"], aw["menge"], aw["einheit"]) == ("aussenwand", "aussen", 22.0, "m2"), aw
        assert aw["schichten"] == [{"material": "Außenputz", "dicke": 2.0}, {"material": "Mauerwerk", "dicke": 36.5}, {"material": "Innenputz", "dicke": 1.5}], aw["schichten"]
        assert b["Fenster 1,26 x 1,38"]["wand"] == aw["kennung"] and b["Haustür"]["wand"] is None, "das Fenster kennt seine Wand"
        assert (aw["tragend"], b["Innenwand Flur"]["tragend"]) == (True, None)
        assert aw["geschoss"] == d["geschosse"][0]["kennung"]
        iw = b["Innenwand Flur"]
        assert iw["art"] == "innenwand" and abs(iw["menge"] - 11.0) < 0.2, iw     # 4,00 m × 2,75 m aus der Geometrie
        assert d["flaechen_aus_geometrie"] == 2
        assert (b["Decke über EG"]["art"], b["Decke über EG"]["menge"]) == ("decke", 96.5)
        assert (b["Fenster 1,26 x 1,38"]["art"], b["Fenster 1,26 x 1,38"]["abmessung"], b["Fenster 1,26 x 1,38"]["menge"]) == ("fenster", "1,26 × 1,38 m", 1)
        assert d["uebersprungen"] == {"IfcFurniture": 1}
        r = c.post("/auswerten", content=b"das ist keine IFC-Datei", headers={"X-Schluessel": "test"})
        assert r.status_code == 400 and "nicht als IFC lesen" in r.json()["fehler"]
        print("IFC-Dienst: alle Prüfungen bestanden")


if __name__ == "__main__":
    main()
