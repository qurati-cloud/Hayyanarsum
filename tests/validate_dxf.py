"""Verify DXF import and re-export with a drawing produced by ezdxf."""
from io import StringIO
from pathlib import Path
from subprocess import run

import ezdxf


def validate():
    doc = ezdxf.new("R2010")
    doc.units = ezdxf.units.MM
    model = doc.modelspace()
    model.add_line((2000, 3000), (5000, 7000), dxfattribs={"layer": "Source-Plan"})
    model.add_lwpolyline([(0, 0), (2000, 0), (2000, 2000)], close=True)
    model.add_lwpolyline([(0, 0, .5), (1000, 0, 0)], format="xyb")
    model.add_circle((1000, 1000), 300)
    doc.layouts.get("Layout1").add_line((0, 0), (1000, 0))
    stream = StringIO()
    doc.write(stream)
    code = """
        import { readFileSync } from 'node:fs';
        import { readDxf } from './dxf-import.js';
        import { dxf } from './engine.js';
        const result = readDxf(readFileSync(0, 'utf8'));
        if (result.lines.length !== 4 || result.skipped !== 3) throw Error(JSON.stringify(result));
        process.stdout.write(dxf(result.lines));
    """
    result = run(["node", "--input-type=module", "-e", code], cwd=Path(__file__).resolve().parents[1],
                 input=stream.getvalue(), capture_output=True, check=True, text=True)
    exported = ezdxf.read(StringIO(result.stdout))
    assert exported.units == ezdxf.units.M
    lines = exported.modelspace().query("LINE")
    assert len(lines) == 4
    assert lines[0].dxf.layer == "Source-Plan"
    assert tuple(lines[0].dxf.start) == (2, 3, 0)
    assert tuple(lines[0].dxf.end) == (5, 7, 0)
    print("Verified ezdxf input in millimetres and metric LINE round-trip.")


if __name__ == "__main__":
    validate()
