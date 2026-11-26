"""Validate the browser exporter with IfcOpenShell and its geometry engine."""

import math
import subprocess
from pathlib import Path

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.util.placement
import ifcopenshell.util.shape
import ifcopenshell.util.unit
import ifcopenshell.validate


def validate_export():
    root = Path(__file__).resolve().parent.parent
    source = subprocess.check_output(
        ["node", "tests/ifc-fixture.mjs"], cwd=root, text=True, encoding="ascii"
    )
    model = ifcopenshell.file.from_string(source)
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(model, logger, express_rules=True)
    assert not logger.statements, logger.statements
    assert model.schema == "IFC4"
    assert ifcopenshell.util.unit.calculate_unit_scale(model) == 1
    assert model.by_type("IfcProject")[0].Name == "مشروع الاختبار"

    lower, wall = model.by_type("IfcWall")
    levels = {level.Name: level.Elevation for level in model.by_type("IfcBuildingStorey")}
    assert levels == {"الطابق الأرضي": 0, "الطابق الأول": 3.25}
    assert lower.ContainedInStructure[0].RelatingStructure.Elevation == 0
    assert wall.ContainedInStructure[0].RelatingStructure.Elevation == 3.25
    assert ifcopenshell.util.placement.get_local_placement(wall.ObjectPlacement)[2, 3] == 3.25
    assert lower.Name == "جدار 'أ' \\ اختبار"
    assert wall.Name == "جدار علوي"
    assert len(wall.HasOpenings) == 2
    wall_solid = wall.Representation.Representations[0].Items[0]
    assert (wall_solid.SweptArea.XDim, wall_solid.SweptArea.YDim, wall_solid.Depth) == (5, 0.2, 3)
    expected = {"IfcDoor": (1, 0, 2), "IfcWindow": (3, 1, 1)}
    for void in wall.HasOpenings:
        opening = void.RelatedOpeningElement
        relation, = opening.HasFillings
        filling = relation.RelatedBuildingElement
        offset, sill, height = expected.pop(filling.is_a())
        pose = ifcopenshell.util.placement.get_local_placement(filling.ObjectPlacement)
        assert math.isclose(pose[0, 3], 1 + 0.6 * offset)
        assert math.isclose(pose[1, 3], -2 - 0.8 * offset)
        assert math.isclose(pose[2, 3], 3.25 + sill)
        assert (filling.OverallWidth, filling.OverallHeight) == (1, height)
        is_door = filling.is_a("IfcDoor")
        pset_name = "Pset_DoorCommon" if is_door else "Pset_WindowCommon"
        pset, = [rel.RelatingPropertyDefinition for rel in filling.IsDefinedBy if rel.RelatingPropertyDefinition.Name == pset_name]
        property_u, = pset.HasProperties
        assert property_u.Name == "ThermalTransmittance"
        assert property_u.Unit.UnitType == "THERMALTRANSMITTANCEUNIT"
        assert property_u.NominalValue.wrappedValue == (2 if is_door else 1.5)
        assert property_u.Description == ("نشرة الباب" if is_door else "نشرة النافذة")
        assert not opening.ContainedInStructure
        assert filling.ContainedInStructure[0].RelatingStructure == wall.ContainedInStructure[0].RelatingStructure
    assert not expected

    geometry = ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), wall).geometry
    volume = ifcopenshell.util.shape.get_volume(geometry)
    assert math.isclose(volume, 2.4, abs_tol=1e-8), volume
    slab, = model.by_type("IfcSlab")
    assert slab.Name == "بلاطة الدور الأول"
    assert slab.ContainedInStructure[0].RelatingStructure.Elevation == 3.25
    world = ifcopenshell.geom.settings()
    world.set("use-world-coords", True)
    slab_model = ifcopenshell.geom.create_shape(world, slab)
    solid = slab_model.geometry
    x_coords = solid.verts[0::3]
    y_coords = solid.verts[1::3]
    z_coords = solid.verts[2::3]
    assert math.isclose(min(x_coords), 1) and math.isclose(max(x_coords), 5)
    assert math.isclose(min(y_coords), -7) and math.isclose(max(y_coords), -2)
    assert math.isclose(min(z_coords), 3.05) and math.isclose(max(z_coords), 3.25)
    assert math.isclose(ifcopenshell.util.shape.get_volume(solid), 3.6)
    void, = slab.HasOpenings
    opening = void.RelatedOpeningElement
    assert opening.Name == "فتحة الدرج" and not opening.HasFillings
    cut_model = ifcopenshell.geom.create_shape(world, opening)
    cut = cut_model.geometry.verts
    assert math.isclose(min(cut[0::3]), 2) and math.isclose(max(cut[0::3]), 3)
    assert math.isclose(min(cut[1::3]), -5.5) and math.isclose(max(cut[1::3]), -3.5)
    for element, name, resistance in [(wall, "Pset_WallCommon", .67), (slab, "Pset_SlabCommon", 1.42)]:
        pset, = [relation.RelatingPropertyDefinition for relation in element.IsDefinedBy
                 if relation.RelatingPropertyDefinition.Name == name]
        prop, = pset.HasProperties
        assert prop.Name == "ThermalTransmittance"
        assert prop.Unit.UnitType == "THERMALTRANSMITTANCEUNIT"
        assert prop.NominalValue.is_a("IfcThermalTransmittanceMeasure")
        assert math.isclose(prop.NominalValue.wrappedValue, 1 / resistance)
    print("Validated IFC4 geometry, opening volumes, and thermal properties with their units.")


def validate_spaces():
    root = Path(__file__).resolve().parent.parent
    for flags in [[], ["--spaces-only"]]:
        source = subprocess.check_output(
            ["node", "tests/ifc-fixture.mjs", *flags], cwd=root, text=True, encoding="ascii"
        )
        model = ifcopenshell.file.from_string(source)
        logger = ifcopenshell.validate.json_logger()
        ifcopenshell.validate.validate(model, logger, express_rules=True)
        assert not logger.statements, logger.statements
        space, = model.by_type("IfcSpace")
        assert space.Name == "مجلس"
        assert ifcopenshell.guid.expand(space.GlobalId) == "2233445566774899aabbccddeeff0014"
        aggregate, = space.Decomposes
        storey = aggregate.RelatingObject
        assert storey.is_a("IfcBuildingStorey") and storey.Elevation == 3.25
        assert not any(space in rel.RelatedElements for rel in model.by_type("IfcRelContainedInSpatialStructure"))
        assert bool(model.by_type("IfcWall")) == (not flags)

        world = ifcopenshell.geom.settings()
        world.set("use-world-coords", True)
        geometry = ifcopenshell.geom.create_shape(world, space)
        vertices = geometry.geometry.verts
        for axis, (low, high) in enumerate([(1, 5), (-7, -2), (3.25, 6.05)]):
            values = vertices[axis::3]
            assert math.isclose(min(values), low) and math.isclose(max(values), high), values
        assert math.isclose(ifcopenshell.util.shape.get_volume(geometry.geometry), 56)
    print("Verified independent IfcSpace geometry, UUID, storey and spaces-only export.")


if __name__ == "__main__":
    from validate_bcf import validate as validate_bcf_export

    validate_export()
    validate_spaces()
    validate_bcf_export()
