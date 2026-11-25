import { elementLevel, length, wallFootprint } from './engine.js';
import { ifcElementGuid } from './ifc.js';
import { storedZip } from './zip.js';

const declaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
const escapeXml = value => String(value)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDFFF]/gu, '\uFFFD')
  .replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
const xml = (name, value) => '<' + name + '>' + escapeXml(value) + '</' + name + '>';
const vector = (name, x, y, z) => '<' + name + '>' + xml('X', x) + xml('Y', y) + xml('Z', z) + '</' + name + '>';

function viewpoint(guid, wall, slab, levels, components) {
  const footprint = wallFootprint(wall, 0, length(wall));
  const points = [...footprint, [slab.x, slab.y], [slab.x + slab.w, slab.y + slab.h]];
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => -y); // IFC uses upward Y, unlike the drawing canvas.
  const [left, right] = [Math.min(...xs), Math.max(...xs)];
  const [bottom, top] = [Math.min(...ys), Math.max(...ys)];
  const scale = Math.max(right - left, top - bottom, 1) * 1.15;
  const highest = Math.max(elementLevel(wall, levels).elevation + wall.z, elementLevel(slab, levels).elevation);
  const x = left + (right - left) / 2;
  const y = bottom + (top - bottom) / 2;
  if (![x, y, scale, highest + scale].every(Number.isFinite)) return null;
  return declaration + '<VisualizationInfo Guid="' + guid + '">' +
    '<Components><Selection>' + components.map(id => '<Component IfcGuid="' + id + '"/>').join('') +
    '</Selection><Visibility DefaultVisibility="true"/></Components><OrthogonalCamera>' +
    vector('CameraViewPoint', x, y, highest + scale) + vector('CameraDirection', 0, 0, -1) +
    vector('CameraUpVector', 0, 1, 0) + xml('ViewToWorldScale', scale) + xml('AspectRatio', 1) +
    '</OrthogonalCamera></VisualizationInfo>';
}

export function exportCoordinationBcf(report, levels, projectName, at = new Date()) {
  if (!report.pairs.length) throw new RangeError('The BCF export requires at least one issue');
  const files = [
    ['bcf.version', declaration + '<Version VersionId="3.0"/>'],
    ['extensions.xml', declaration + '<Extensions><TopicTypes><TopicType>Clash</TopicType></TopicTypes>' +
      '<TopicStatuses><TopicStatus>Open</TopicStatus></TopicStatuses></Extensions>'],
  ];
  let unlinked = 0;
  for (const { wall, slab, volume } of report.pairs) {
    const topicId = crypto.randomUUID();
    const viewId = crypto.randomUUID();
    const components = [ifcElementGuid(wall.id), ifcElementGuid(slab.id)];
    const view = components.every(Boolean) && components[0] !== components[1]
      ? viewpoint(viewId, wall, slab, levels, components) : null;
    const filename = viewId + '.bcfv';
    const describe = shape => shape.name + ' · ' + elementLevel(shape, levels).name + ' (' + shape.id + ')';
    const description = [
      'المشروع ' + (projectName || 'Hayyanarsum'),
      'الجدار ' + describe(wall),
      'البلاطة ' + describe(slab),
      'الحجم المشترك ' + Number(volume.toPrecision(10)) + ' م³ بعد استبعاد الفتحات.',
      'راجع ما إذا كان التداخل وصلة تصميمية مقصودة.',
      ...(report.complete ? [] : ['الفحص جزئي وبلغ حد الحساب أو العرض.']),
      ...(report.omitted ? ['العناصر المستبعدة من الفحص ' + report.omitted + '.'] : []),
      ...(view ? ['افتح ملف IFC4 المصدّر من نفس نسخة المشروع لعرض العنصرين.']
        : ['الملاحظة نصية. لم يتوفر ربط موثوق لكلا العنصرين في IFC.']),
    ].join('\n');
    const viewpoints = view ? '<Viewpoints><ViewPoint Guid="' + viewId + '">' +
      xml('Viewpoint', filename) + '</ViewPoint></Viewpoints>' : '';
    files.push([topicId + '/', ''], [topicId + '/markup.bcf', declaration + '<Markup>' +
      '<Topic Guid="' + topicId + '" TopicType="Clash" TopicStatus="Open">' +
      xml('Title', 'تداخل ' + wall.name + ' مع ' + slab.name) + xml('CreationDate', at.toISOString()) +
      xml('CreationAuthor', 'Hayyanarsum') + xml('Description', description) + viewpoints + '</Topic></Markup>']);
    if (view) files.push([topicId + '/' + filename, view]);
    else unlinked++;
  }
  return { archive: storedZip(files), unlinked };
}
