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

    wall, = model.by_type("IfcWall")
    assert wall.Name == "جدار 'أ' \\ اختبار"
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
        assert math.isclose(pose[2, 3], sill)
        assert (filling.OverallWidth, filling.OverallHeight) == (1, height)
        assert not opening.ContainedInStructure
        assert filling.ContainedInStructure[0].RelatingStructure.is_a("IfcBuildingStorey")
    assert not expected

    geometry = ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), wall).geometry
    volume = ifcopenshell.util.shape.get_volume(geometry)
    assert math.isclose(volume, 2.4, abs_tol=1e-8), volume
    print("Validated IFC4 schema, Arabic names, metric geometry, hosted fillings, and 2.4 m³ net wall volume.")


if __name__ == "__main__":
    validate_export()
