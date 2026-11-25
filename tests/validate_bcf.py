"""Check a BCF 3.0 example with zipfile, XML, and the matching IFC via IfcOpenShell."""
import io
import subprocess
import sys
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

import ifcopenshell

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = """
import { exportCoordinationBcf } from './bcf.js';
import { wallSlabClashes } from './coordination.js';
import { exportIfc } from './ifc.js';
import { groundLevel } from './engine.js';
const levels = [groundLevel, { id: 'upper', name: 'الطابق الأول', elevation: 3 }];
const wall = { id: '71fed1eb-9894-4dd3-aece-ce97b77ca351', type: 'wall', name: 'جدار <مراجعة>',
  x: 0, y: 1, x2: 4, y2: 1, z: 3, thickness: .2, openings: [] };
const slab = { id: '49b2052b-2032-4e04-aaf0-88003c674bd7', type: 'slab', name: 'بلاطة & مراجعة',
  x: 1, y: 0, w: 2, h: 2, z: .25, levelId: 'upper' };
const shapes = [wall, slab, { ...wall, id: 'old-id', name: 'جدار قديم' }];
const project = 'اختبار هندسي';
const report = { ...wallSlabClashes(shapes, levels), complete: false };
if (process.argv[1] === 'ifc') process.stdout.write(exportIfc(shapes, project, levels));
else {
  const { archive, unlinked } = exportCoordinationBcf(report, levels, project, new Date('2026-01-01T00:00:00Z'));
  if (unlinked !== 1) throw Error('Expected one text-only topic');
  process.stdout.write(Buffer.from(await archive.arrayBuffer()));
}
"""


def artifact(kind):
    return subprocess.check_output(
        ["node", "--input-type=module", "-e", FIXTURE, kind], cwd=ROOT,
    )


def validate(schemas=None):
    model = ifcopenshell.file.from_string(artifact("ifc").decode("utf-8"))
    expected = {
        model.by_type("IfcWall")[0].GlobalId, model.by_type("IfcSlab")[0].GlobalId,
    }
    with ZipFile(io.BytesIO(artifact("bcf"))) as archive:
        assert archive.testzip() is None
        assert ElementTree.fromstring(archive.read("bcf.version")).get("VersionId") == "3.0"
        paths = archive.namelist()
        assert len(paths) == len(set(paths))
        markups = [path for path in paths if path.endswith("/markup.bcf")]
        assert len(markups) == 2
        linked = 0
        for path in markups:
            folder = path.removesuffix("markup.bcf")
            assert folder in paths and archive.getinfo(folder).is_dir()
            topic = ElementTree.fromstring(archive.read(path)).find("Topic")
            assert topic.get("Guid") == folder.rstrip("/")
            assert "0.1 م³" in topic.findtext("Description")
            assert "الفحص جزئي" in topic.findtext("Description")
            view = topic.find("Viewpoints/ViewPoint")
            if view is None:
                assert "جدار قديم" in topic.findtext("Title")
                assert "لم يتوفر ربط موثوق" in topic.findtext("Description")
                continue
            linked += 1
            assert "جدار <مراجعة> مع بلاطة & مراجعة" == topic.findtext("Title").removeprefix("تداخل ")
            saved_view = ElementTree.fromstring(archive.read(folder + view.findtext("Viewpoint")))
            assert view.get("Guid") == saved_view.get("Guid")
            assert {c.get("IfcGuid") for c in saved_view.findall("Components/Selection/Component")} == expected
            assert saved_view.findtext("OrthogonalCamera/CameraViewPoint/Y") == "-1"
        assert linked == 1
        if schemas:
            from lxml import etree

            def xsd(name):
                return etree.XMLSchema(etree.parse(str(Path(schemas) / name)))

            checks = {
                "bcf.version": xsd("version.xsd"),
                "extensions.xml": xsd("extensions.xsd"),
                "markup.bcf": xsd("markup.xsd"),
                ".bcfv": xsd("visinfo.xsd"),
            }
            for path in paths:
                for suffix, schema in checks.items():
                    if path.endswith(suffix):
                        schema.assertValid(etree.fromstring(archive.read(path)))
    print("Verified BCF ZIP integrity, XML, and component IDs against the IFC model." +
          (" buildingSMART 3.0 schemas validated." if schemas else ""))


if __name__ == "__main__":
    validate(*sys.argv[1:])
