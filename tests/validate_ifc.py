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
    solid = ifcopenshell.geom.create_shape(world, slab).geometry
    x_coords = solid.verts[0::3]
    y_coords = solid.verts[1::3]
    z_coords = solid.verts[2::3]
    assert math.isclose(min(x_coords), 1) and math.isclose(max(x_coords), 5)
    assert math.isclose(min(y_coords), -7) and math.isclose(max(y_coords), -2)
    assert math.isclose(min(z_coords), 3.05) and math.isclose(max(z_coords), 3.25)
    assert math.isclose(ifcopenshell.util.shape.get_volume(solid), 4)
    print("Validated IFC4 storeys, hosted openings, and 4 m³ slab at the correct XY position and elevation.")


if __name__ == "__main__":
    validate_export()
