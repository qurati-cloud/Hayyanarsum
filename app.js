import { bedroomBlockPlan, customRoomBlockPlan, briefPreviewDxf, briefRoomEdges, briefRoomSchedule, briefRoomConflict, briefFields, cleanBrief, cleanBriefRooms, cleanSetbacks, setbackSides, extractBrief, extractBriefRooms, extractBriefSetbacks, missingBriefFields } from './project-brief.js';
import { dxfUnitLabels, maximumDxfBytes, readDxf } from './dxf-import.js';
import { exportCoordinationBcf } from './bcf.js';
import { roomWallFootprintReview, roomWallReviewRows, wallSlabClashes } from './coordination.js';
import { exportBriefIfc, exportIfc, isIfcSlab, isIfcSpace, isIfcWall } from './ifc.js';
import { cleanAssembly, cleanThermalAssemblies, compareAssembly, elementThermalKind, evaluateAssembly,
  evaluateEnvelopeElement, evaluateEnvelopeOpening, cleanTransmissionScenario, evaluateTransmission, thermalKinds } from './thermal.js';
import { slabVolumeSummary, wallVolumeSummary } from './wall-volume.js';
import { cleanSaudiInputs, residentialRoomMetadata, residentialSpaceRules, saudiModelReview, saudiEdgeKinds, saudiNumberFields, saudiProjectReview, saudiSources, saudiTextFields } from './engine.js';
import{normalizeNumericInput,snap,nearestCadEndpoint,cleanMeasurements,measureSegment,measurementLimit,planView,area,isLinear,wallFromCadLine,isRoomEdge,wallsFromRoomEdges,slabNetArea,slabOpeningArea,slabVolume,length,totalArea,valid,validHeight,wallFootprint,wallSpans,wallQuantities,roomProjection,groundLevel,validateLevels,elementLevel,compliance,dxf}from'./engine.js';const $=x=>document.getElementById(x),NS='http://www.w3.org/2000/svg',PX=40,C={'CAD-REF':'#47677b','A-WALL':'#0e5a40','S-COLS':'#a8792a','S-SLAB':'#91754a','E-POWR':'#d8831d','M-HVAC':'#3486a7','P-WATR':'#326ad1'};let S={schema:2,levels:[groundLevel],activeLevel:'ground',project:{},shapes:[],measurements:[],prices:{},selected:null,tool:'select'},past=[],next=[],start=null;
let fitDrawing = false;
let snapCadEndpoints = false;
const esc=x=>String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])),el=(n,a={})=>{const e=document.createElementNS(NS,n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));return e},commit=()=>{past.push(JSON.stringify(S));if(past.length>60)past.shift();next=[];clearCoordination()};
function dimension(s){const g=$('dims'),t=el('text',{x:(!isLinear(s)?s.x+s.w/2:(s.x+s.x2)/2)*PX,y:(!isLinear(s)?s.y:(s.y+s.y2)/2)*PX-8,'text-anchor':'middle',class:'dim'});t.textContent=(!isLinear(s)?s.w:length(s)).toFixed(2)+' m';g.append(t)}
function render(){const visibleShapes = S.shapes.filter(shape => elementLevel(shape, S.levels)?.id === S.activeLevel);const g=$('shapes');g.replaceChildren();$('dims').replaceChildren();for(const s of visibleShapes){if(s.type==='slab'){drawSlab(g,s);dimension(s);continue}if(s.type==='wall'&&s.thickness!=null){drawWall(g,s);dimension(s);continue}const e=!isLinear(s)?el('rect',{x:s.x*PX,y:s.y*PX,width:s.w*PX,height:s.h*PX,fill:C[s.layer]+'18',stroke:C[s.layer],'stroke-width':2,class:'shape'+(s.id===S.selected?' selected':'')}):el('line',{x1:s.x*PX,y1:s.y*PX,x2:s.x2*PX,y2:s.y2*PX,stroke:C[s.layer],'stroke-width':s.type==='cadLine'?2:6,'vector-effect':s.type==='cadLine'?'non-scaling-stroke':'none',class:'shape'+(s.id===S.selected?' selected':'')});e.dataset.id=s.id;g.append(e);dimension(s)}$('count').childNodes[0].nodeValue=S.shapes.length;$('area').childNodes[0].nodeValue=totalArea(S.shapes).toFixed(2);$('selected').textContent=S.selected?'عنصر محدد':'لا يوجد تحديد';$('objects').innerHTML=visibleShapes.map(s=>`<div class="object ${s.id===S.selected?'active':''}" data-id="${s.id}"><b>${esc(s.name)}</b><br>${quantityFor(s).toFixed(2)+' '+(isLinear(s)?'م':'م²')}</div>`).join('')||'<p>لا توجد عناصر.</p>';$('layers').innerHTML=Object.keys(C).map(l=>`<div class="layer"><i style="background:${C[l]}"></i>${l} · ${visibleShapes.filter(s=>s.layer===l).length}</div>`).join('');$('editRoom').disabled = !S.shapes.some(shape => shape.id === S.selected && !isLinear(shape)); syncRectangleEditor(); boq(); render3d(); renderWallEditor(); renderRoomEdgeConverter(visibleShapes); updateIfcExport();renderLevels(); renderSlabEditor();renderThermalAssignment(); renderEnvelope(); updateDrawingExtent(); renderMeasurements()}
const levelShapes = () => S.shapes.filter(shape => elementLevel(shape, S.levels)?.id === S.activeLevel);
const itemLabel = shape => S.levels.length === 1 ? shape.name : shape.name + ' · ' + elementLevel(shape, S.levels)?.name;
const quantityFor = shape => isLinear(shape) ? length(shape) : shape.type === 'slab' ? slabNetArea(shape) : area(shape);
function boq(){const items=S.shapes.filter(shape=>shape.type!=='cadLine');$('boq').innerHTML=items.map(s=>{const q=quantityFor(s),r=Number(S.prices[s.id]||0);return`<tr><td>${esc(itemLabel(s))}</td><td>${s.layer}</td><td>${q.toFixed(2)}</td><td>${s.type==='wall'?'م ط':(s.type==='slab'?'م² · '+slabVolume(s).toFixed(3)+' م³':'م²')}</td><td><input class="rate" data-id="${s.id}" type="text" data-number inputmode="decimal" data-min="0" data-max="1000000000000" data-step="any" value="${r}"></td><td>${(q*r).toLocaleString('ar-SA')}</td></tr>`}).join('')||'<tr><td colspan="6">أضف عناصر ليظهر الحصر.</td></tr>';$('total').textContent=items.reduce((n,s)=>n+quantityFor(s)*Number(S.prices[s.id]||0),0).toLocaleString('ar-SA')+' ر.س'}
function addRectangle(type, x, y, w = numberField('shapeW'), h = numberField('shapeH'), name = $('shapeName').value, manual = true) {
  const heightInput = $(type === 'slab' ? 'slabThickness' : 'roomZ').value;
  const z = heightInput === '' ? null : numberField(type === 'slab' ? 'slabThickness' : 'roomZ');
  const shape = { id: crypto.randomUUID(), type, name: name.trim().slice(0, 160) || (type === 'slab' ? 'بلاطة' : 'مساحة'),
    x, y, w, h, z, levelId: S.activeLevel, layer: type === 'slab' ? 'S-SLAB' : $('layer').value };
  if (type === 'room' && manual) Object.assign(shape, roomReviewFields());
  if (!valid(shape)) {
    $('mode').textContent = type === 'slab' ? 'أدخل سماكة وأبعادًا صالحة للبلاطة.' : 'أدخل أبعادًا موجبة وصالحة.';
    return false;
  }
  commit();
  S.shapes.push(shape);
  selectShape(shape.id);
  return true;
}
function pt(event) {
  const matrix = $('svg').getScreenCTM();
  const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  const point = { x: local.x / PX, y: local.y / PX };
  const pixelsPerMetre = Math.hypot(matrix.a, matrix.b) * PX;
  const target = snapCadEndpoints && S.tool !== 'select' && pixelsPerMetre > 0
    ? nearestCadEndpoint(point, levelShapes(), (event.pointerType === 'touch' ? 18 : 12) / pixelsPerMetre)
    : null;
  $('drawingSnapStatus').textContent = target ? 'التقاط طرف خط DXF' : 'التقاط الشبكة · ٠٫٥ م';
  return target ?? { x: snap(point.x), y: snap(point.y) };
}
$('snapCadEndpoints').onclick = () => {
  snapCadEndpoints = !snapCadEndpoints;
  $('snapCadEndpoints').setAttribute('aria-pressed', String(snapCadEndpoints));
  $('drawingSnapStatus').textContent = snapCadEndpoints ? 'اقترب من طرف خط DXF' : 'التقاط الشبكة · ٠٫٥ م';
};
$('svg').onpointerleave = () => {
  $('drawingSnapStatus').textContent = snapCadEndpoints ? 'اقترب من طرف خط DXF' : 'التقاط الشبكة · ٠٫٥ م';
};
$('svg').onpointercancel = () => {
  start = null;
  $('preview').replaceChildren();
};
const levelMeasurements = () => S.measurements.filter(item => item.levelId === S.activeLevel);
function setDrawingExtent(svg, view) {
  svg.setAttribute('viewBox', view.join(' '));
  const grid = svg.querySelector('#gridRect');
  if (grid) ['x', 'y', 'width', 'height'].forEach((key, index) => grid.setAttribute(key, view[index]));
}
function updateDrawingExtent() {
  setDrawingExtent($('svg'), fitDrawing ? planView(levelShapes(), levelMeasurements(), PX) : [0, 0, 1200, 700]);
  $('fitDrawing').setAttribute('aria-pressed', String(fitDrawing));
  $('fitDrawing').classList.toggle('active', fitDrawing);
}
$('fitDrawing').onclick = () => { fitDrawing = !fitDrawing; updateDrawingExtent(); };
$('svg').onpointerdown=e=>{if(S.tool==='select'){selectShape(e.target.dataset.id || null)}else{if(S.tool==='room')$('roomClear').checked=false;start=pt(e)}};$('svg').onpointermove=e=>{const p=pt(e);$('cursor').textContent=`X ${p.x.toFixed(2)} · Y ${p.y.toFixed(2)}`;if(!start)return;const q=$('preview');q.replaceChildren();q.append(['room','slab'].includes(S.tool)?el('rect',{x:Math.min(start.x,p.x)*PX,y:Math.min(start.y,p.y)*PX,width:Math.abs(p.x-start.x)*PX,height:Math.abs(p.y-start.y)*PX,fill:'#c39a4a22',stroke:'#c39a4a'}):el('line',{x1:start.x*PX,y1:start.y*PX,x2:p.x*PX,y2:p.y*PX,stroke:'#c39a4a','stroke-width':3}))};$('svg').onpointerup=e=>{if(!start)return;const a=start,p=pt(e);start=null;$('preview').replaceChildren();if(['room','slab'].includes(S.tool)&&a.x!==p.x&&a.y!==p.y)addRoom(Math.min(a.x,p.x),Math.min(a.y,p.y),Math.abs(a.x-p.x),Math.abs(a.y-p.y));else if(S.tool==='wall'&&(a.x!==p.x||a.y!==p.y)){commit();const wall={id:crypto.randomUUID(),type:'wall',levelId:S.activeLevel,name:'جدار',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:$('layer').value};S.shapes.push(wall);selectShape(wall.id)}else if(S.tool==='measure') addMeasurement({ x: a.x, y: a.y, x2: p.x, y2: p.y })};
document.onclick=e=>{const t=e.target.closest('[data-tool]');if(t){S.tool=t.dataset.tool;document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x===t));syncRectangleEditor();$('mode').textContent='وضع '+t.textContent.trim()}const o=e.target.closest('.object');if(o){selectShape(o.dataset.id)}const v=e.target.closest('[data-view]');if(v){document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===v));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===v.dataset.view));if(v.dataset.view==='compliance')runChecks()}};
function selectShape(id) {
  if (S.selected !== id) {
    $('cadToWallPanel').open = false;
    $('cadToWallForm').reset();
  }
  S.selected = id;
  const shape = S.shapes.find(item => item.id === id);
  if (shape) {
    $('shapeName').value = shape.name;
    if (shape.type !== 'cadLine') $('layer').value = shape.layer;
    if (!isLinear(shape)) {
      $('shapeW').value = shape.w;
      $('shapeH').value = shape.h;
      if (shape.type === 'slab') {
        $('slabX').value = shape.x;
        $('slabY').value = shape.y;
        $('slabThickness').value = shape.z;
      } else {
        $('roomZ').value = shape.z ?? '';
        $('roomUse').value = shape.roomUse ?? '';
        $('roomClear').checked = shape.clearRoom === true;
      }
    }
  }
  render();
}

function syncRectangleEditor() {
  const selected = S.shapes.find(shape => shape.id === S.selected);
  $('slabFields').hidden = S.tool !== 'slab' && selected?.type !== 'slab';
  const reference = selected?.type === 'cadLine';
  $('shapeSize').hidden = reference;
  $('roomHeightGroup').hidden = reference;
  $('shapeLayerGroup').hidden = reference;
  $('insert').hidden = reference;
  $('editRoom').hidden = reference;
  $('roomReviewFields').hidden = reference || S.tool === 'slab' || (selected?.type !== 'room' && (selected?.type === 'slab' || S.tool === 'wall'));
  $('roomClear').disabled = !$('roomUse').value;
  $('editRoom').textContent = selected?.type === 'slab' ? 'تحديث البلاطة المحددة' : 'تحديث المساحة المحددة';
  $('insert').textContent = S.tool === 'slab' ? 'إدراج البلاطة بالأبعاد' : 'إدراج المساحة بالأبعاد';
}
for (const [use, rule] of Object.entries(residentialSpaceRules)) $('roomUse').add(new Option(rule.label, use));
for (const id of ['roomUse', 'shapeW', 'shapeH']) $(id).oninput = () => {
  $('roomClear').checked = false;
  $('roomClear').disabled = !$('roomUse').value;
};
function roomReviewFields() {
  return residentialRoomMetadata($('roomUse').value, $('roomClear').checked);
}

function drawSlab(group, slab) {
  const outline = (x, y, w, h) => 'M' + x * PX + ',' + y * PX + ' h' + w * PX + ' v' + h * PX + ' h-' + w * PX + ' z';
  const cutouts = slab.cutouts ?? [];
  const path = el('path', {
    d: [outline(slab.x, slab.y, slab.w, slab.h),
      ...cutouts.map(cut => outline(slab.x + cut.x, slab.y + cut.y, cut.w, cut.h))].join(' '),
    'fill-rule': 'evenodd', fill: C[slab.layer] + '35', stroke: C[slab.layer], 'stroke-width': 2,
    class: 'shape' + (slab.id === S.selected ? ' selected' : ''),
  });
  path.dataset.id = slab.id;
  group.append(path);
  for (const cut of cutouts) {
    const label = el('text', { x: (slab.x + cut.x + cut.w / 2) * PX, y: (slab.y + cut.y + cut.h / 2) * PX,
      'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'dim' });
    label.textContent = cut.name;
    label.dataset.id = slab.id;
    group.append(label);
  }
}

const slabCutFields = { x: 'slabCutX', y: 'slabCutY', w: 'slabCutWidth', h: 'slabCutHeight' };
const selectedSlab = () => S.shapes.find(shape => shape.id === S.selected && shape.type === 'slab');

function loadSlabCut() {
  const cut = selectedSlab()?.cutouts?.[$('slabCutIndex').value];
  $('slabCutName').value = cut?.name ?? '';
  for (const [key, id] of Object.entries(slabCutFields)) $(id).value = cut?.[key] ?? '';
  $('slabCutDelete').disabled = !cut;
}

function renderSlabEditor() {
  const slab = selectedSlab();
  $('slabCutPanel').hidden = !slab;
  if (slab) {
    $('slabCutIndex').replaceChildren(new Option('فتحة جديدة', ''));
    slab.cutouts?.forEach((cut, index) => $('slabCutIndex').add(new Option(cut.name + ' · ' + (index + 1), index)));
    loadSlabCut();
  }
  $('slabReport').hidden = !S.shapes.some(isIfcSlab);
  if ($('slabReport').open) updateSlabSummary();
}

function updateSlabSummary() {
  const { separateVolume, netVolume, overlap } = slabVolumeSummary(S.shapes, S.levels);
  const format = value => value.toLocaleString('ar-SA', { maximumFractionDigits: 4 });
  $('slabVolumeSummary').textContent = netVolume === null
    ? 'تعذّر حساب التداخل لهذا النموذج. مجموع الأحجام الفردية: ' + format(separateVolume) + ' م³.'
    : 'صافي حجم البلاطات بعد خصم الفتحات والتداخلات: ' + format(netVolume) +
      ' م³. حجم التداخل المخصوم: ' + format(overlap) + ' م³.';
}

function saveSlabCutouts(slab, cutouts, message) {
  const updated = { ...slab, cutouts };
  if (!valid(updated)) {
    $('slabCutStatus').textContent = 'أدخل إزاحة وأبعادًا صالحة. ينبغي أن تقع الفتحة داخل حدود البلاطة وألا تتداخل مع فتحة أخرى.';
    return false;
  }
  commit();
  S.shapes = S.shapes.map(shape => shape.id === updated.id ? updated : shape);
  render();
  $('slabCutStatus').textContent = message;
  return true;
}

$('slabCutIndex').onchange = loadSlabCut;
$('slabReport').ontoggle = () => { if ($('slabReport').open) updateSlabSummary(); };
$('slabCutSave').onclick = () => {
  const slab = selectedSlab();
  if (!slab) return;
  const cutouts = [...(slab.cutouts ?? [])];
  const current = $('slabCutIndex').value;
  const index = current === '' ? cutouts.length : Number(current);
  const fields = Object.fromEntries(Object.entries(slabCutFields).map(([key, id]) => [key, numberField(id)]));
  cutouts[index] = { ...fields, name: $('slabCutName').value.trim().slice(0, 120) || 'فتحة' };
  if (saveSlabCutouts(slab, cutouts, 'حُفظت فتحة البلاطة.')) {
    $('slabCutIndex').value = String(index);
    loadSlabCut();
  }
};
$('slabCutDelete').onclick = () => {
  const slab = selectedSlab();
  const index = $('slabCutIndex').value;
  if (!slab || index === '') return;
  saveSlabCutouts(slab, slab.cutouts.filter((_, item) => item !== Number(index)), 'حُذفت فتحة البلاطة.');
};
function activateLevel(id) {
  S.activeLevel = id;
  S.selected = null;
  start = null;
  $('preview').replaceChildren();
  render();
}

function renderLevels() {
  const active = S.levels.find(level => level.id === S.activeLevel);
  const ordered = [...S.levels].sort((a, b) => a.elevation - b.elevation);
  const levelOption = level => new Option(level.name + ' · ' + level.elevation + ' م', level.id);
  $('activeLevel').replaceChildren(...ordered.map(levelOption));
  $('activeLevel').value = active.id;
  $('levelName').value = active.name;
  $('levelElevation').value = active.elevation;
  $('moveLevel').replaceChildren(new Option('اختر طابقًا', ''),
    ...ordered.filter(level => level.id !== active.id).map(levelOption));
  $('moveLevel').disabled = S.levels.length < 2 || !S.selected;
  $('levelRemove').disabled = S.levels.length < 2 || levelShapes().length > 0 || S.measurements.some(item => item.levelId === S.activeLevel);
}

function updateLevels(add) {
  const id = add ? crypto.randomUUID() : S.activeLevel;
  const level = { id, name: $('levelName').value, elevation: numberField('levelElevation') };
  let levels;
  try {
    levels = validateLevels(add ? [...S.levels, level] : S.levels.map(item => item.id === id ? level : item));
  } catch {
    $('levelStatus').textContent = 'أدخل اسمًا ومنسوبًا صالحين. الحد الأقصى ١٠٠ طابق.';
    return;
  }
  commit();
  S.levels = levels;
  activateLevel(id);
  $('levelStatus').textContent = add ? 'أُضيف الطابق وأصبح طابق الرسم.' : 'حُدّث الطابق.';
}

$('activeLevel').onchange = event => activateLevel(event.target.value);
$('levelAdd').onclick = () => updateLevels(true);
$('levelUpdate').onclick = () => updateLevels(false);
$('levelRemove').onclick = () => {
  if (S.levels.length < 2 || levelShapes().length || S.measurements.some(item => item.levelId === S.activeLevel)) return;
  commit();
  S.levels = S.levels.filter(level => level.id !== S.activeLevel);
  activateLevel(S.levels[0].id);
  $('levelStatus').textContent = 'حُذف الطابق الفارغ.';
};
$('moveLevel').onchange = event => {
  const id = event.target.value;
  if (!S.selected || !S.levels.some(level => level.id === id)) return;
  commit();
  S.shapes = S.shapes.map(shape => shape.id === S.selected ? { ...shape, levelId: id } : shape);
  activateLevel(id);
};
const wallFields = { x: 'wallX', y: 'wallY', x2: 'wallX2', y2: 'wallY2', thickness: 'wallT', z: 'wallZ' };
const openingFields = { offset: 'openingOffset', width: 'openingWidth', sill: 'openingSill', height: 'openingHeight' };
const numericValidator = document.createElement('input');
numericValidator.type = 'number';
function numericValue(field) {
  for (const name of ['min', 'max', 'step', 'value']) {
    const value = field.getAttribute(name === 'value' ? name : 'data-' + name);
    if (value === null) numericValidator.removeAttribute(name);
    else numericValidator.setAttribute(name, value);
  }
  numericValidator.value = normalizeNumericInput(field.value);
  return numericValidator.validity.valid ? numericValidator.valueAsNumber : NaN;
}
const numberField = id => numericValue($(id));

function validateNumericFields(form) {
  for (const field of form.querySelectorAll('[data-number]')) {
    if (field.matches(':disabled') || field.value === '' || Number.isFinite(numericValue(field))) continue;
    field.setCustomValidity('أدخل رقمًا صالحًا ضمن الحدود المحددة للخانة.');
    field.reportValidity();
    field.setCustomValidity('');
    return false;
  }
  return true;
}
document.addEventListener('submit', event => {
  if (!validateNumericFields(event.target)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
const selectedLinear = () => S.shapes.find(shape => shape.id === S.selected && isLinear(shape));
const selectedWall = () => S.shapes.find(shape => shape.id === S.selected && shape.type === 'wall');
const openingLabel = kind => kind === 'door' ? 'باب' : 'نافذة';

function wallPolygonPoints(wall, start, end) {
  return wallFootprint(wall, start, end).map(point => point.map(value => value * PX).join(',')).join(' ');
}

function drawWall(group, wall) {
  for (const { start, end, opening } of wallSpans(wall)) {
    const points = wallPolygonPoints(wall, start, end);
    const polygon = el('polygon', { points, class: 'shape' + (wall.id === S.selected ? ' selected' : ''),
      stroke: C[wall.layer], fill: opening ? '#fff' : C[wall.layer],
      'stroke-dasharray': opening ? (opening.kind === 'door' ? '3 2' : '8 2') : 'none' });
    polygon.dataset.id = wall.id;
    if (opening) {
      const title = el('title');
      title.textContent = openingLabel(opening.kind) + ' · ' + opening.width + ' م';
      polygon.append(title);
    }
    group.append(polygon);
  }
}

function loadOpeningFields() {
  const opening = selectedWall()?.openings?.[$('openingIndex').value];
  $('openingKind').value = opening?.kind ?? 'door';
  for (const [key, id] of Object.entries(openingFields)) $(id).value = opening?.[key] ?? '';
  $('openingThermalU').value = opening?.thermalU ?? '';
  $('openingThermalRef').value = opening?.thermalRef ?? '';
  $('openingRemove').disabled = !opening;
  configureOpeningSill();
}

function configureOpeningSill() {
  const isDoor = $('openingKind').value === 'door';
  $('openingSill').disabled = isDoor;
  if (isDoor) $('openingSill').value = 0;
}

function renderWallEditor() {
  const wall = selectedLinear();
  $('wallEditor').hidden = !wall;
  if (wall) {
    const reference = wall.type === 'cadLine';
    $('linearTitle').textContent = reference ? 'خط DXF المحدد' : 'الجدار المحدد';
    $('wallSize').hidden = reference;
    $('cadToWallPanel').hidden = !reference;
    $('wallApply').textContent = reference ? 'تحديث الخط' : 'تحديث الجدار';
    $('cadSourceLayer').hidden = !reference;
    $('cadSourceLayer').textContent = reference ? 'طبقة المصدر ' + wall.cadLayer : '';
    for (const [key, id] of Object.entries(wallFields)) $(id).value = wall[key] ?? '';
    $('openingPanel').hidden = reference || wall.thickness == null;
    $('openingIndex').replaceChildren(new Option('فتحة جديدة', ''));
    wall.openings?.forEach((opening, index) => {
      $('openingIndex').add(new Option(openingLabel(opening.kind) + ' · ' + opening.offset + ' م', index));
    });
    loadOpeningFields();
  }
  const modeledWalls = S.shapes.filter(shape => shape.type === 'wall' && shape.thickness != null);
  $('wallReport').hidden = modeledWalls.length === 0;
  $('wallBoq').replaceChildren();
  for (const wall of modeledWalls) {
    const { openingArea, netArea, netVolume } = wallQuantities(wall);
    const row = $('wallBoq').insertRow();
    for (const value of [itemLabel(wall), openingArea.toFixed(3), netArea.toFixed(3), netVolume.toFixed(3)]) {
      row.insertCell().textContent = value;
    }
  }
  if ($('wallReport').open) updateWallVolume();
}

function updateWallVolume() {
  const { separateVolume, netVolume, overlap, omitted } = wallVolumeSummary(S.shapes, S.levels);
  const display = value => value.toLocaleString('ar-SA', { maximumFractionDigits: 4 });
  const omittedNote = omitted ? ' جدران دون أبعاد مجسّمة: ' + omitted + '.' : '';
  $('wallVolumeSummary').textContent = netVolume === null
    ? 'تعذّر حساب التقاطعات لهذا النموذج. مجموع الأحجام لكل جدار: ' + display(separateVolume) + ' م³.' + omittedNote
    : 'صافي حجم الجدران بعد خصم الفتحات والتقاطعات: ' + display(netVolume) +
      ' م³. حجم التكرار المخصوم: ' + display(overlap) + ' م³.' + omittedNote;
}
$('wallReport').ontoggle = () => {
  if ($('wallReport').open) updateWallVolume();
};

function saveWall(wall, message) {
  if (!valid(wall)) {
    $('wallStatus').textContent = 'تحقق من الأبعاد. ينبغي أن تقع الفتحات بالكامل ضمن الجدار وألا تتداخل أفقيًا.';
    return false;
  }
  commit();
  S.shapes = S.shapes.map(shape => shape.id === wall.id ? wall : shape);
  render();
  $('wallStatus').textContent = message;
  return true;
}

$('wallApply').onclick = () => {
  const wall = selectedLinear();
  if (!wall) return;
  const name = $('shapeName').value.trim().slice(0, 160);
  const values = Object.fromEntries(Object.entries(wallFields).map(([key, id]) => [key, numberField(id)]));
  if (wall.type === 'cadLine') {
    const { x, y, x2, y2 } = values;
    const line = { ...wall, x, y, x2, y2, name: name || wall.name };
    if (!valid(line)) {
      $('wallStatus').textContent = 'أدخل إحداثيات صالحة ونقطتين مختلفتين.';
      return;
    }
    commit();
    S.shapes = S.shapes.map(shape => shape.id === line.id ? line : shape);
    render();
    $('wallStatus').textContent = 'حُدّث الخط.';
    return;
  }
  saveWall({ ...wall, ...values, name: name || 'جدار',
    layer: $('layer').value, openings: wall.openings ?? [] }, 'حُدّث الجدار.');
};
$('cadToWallForm').onsubmit = event => {
  event.preventDefault();
  const line = selectedLinear();
  if (line?.type !== 'cadLine') return;
  const wall = wallFromCadLine({
    ...line, x: numberField('wallX'), y: numberField('wallY'),
    x2: numberField('wallX2'), y2: numberField('wallY2'),
  }, {
    name: $('shapeName').value.trim().slice(0, 160) || 'جدار',
    thickness: numberField('cadWallThickness'),
    z: numberField('cadWallHeight'),
  });
  if (!wall) {
    $('wallStatus').textContent = 'تحقق من السماكة والارتفاع وإحداثيات طرفي المحور.';
    return;
  }
  if (saveWall(wall, 'تحوّل الخط إلى جدار على الطابق نفسه.')) {
    $('layer').value = wall.layer;
    $('cadToWallPanel').open = false;
    event.target.reset();
  }
};
function roomEdgeConversion() {
  const thickness = numberField('roomEdgeThickness');
  const z = numberField('roomEdgeHeight');
  if (!validHeight(thickness) || !validHeight(z)) return null;
  return wallsFromRoomEdges(S.shapes, S.levels, S.activeLevel, { thickness, z });
}

function renderRoomEdgePreview() {
  const panel = $('roomEdgeConverter');
  const preview = $('roomEdgePreview');
  preview.replaceChildren();
  const walls = panel.open && !panel.hidden ? roomEdgeConversion()?.walls ?? [] : [];
  $('roomEdgeApply').disabled = walls.length === 0;
  $('roomEdgePreviewNote').hidden = walls.length === 0;
  if (!walls.length) return;
  const polygons = walls.map(wall => el('polygon', { points: wallPolygonPoints(wall, 0, length(wall)) }));
  preview.replaceChildren(...polygons);
}

function renderRoomEdgeConverter(visibleShapes) {
  const count = visibleShapes.filter(isRoomEdge).length;
  $('roomEdgeConverter').hidden = count === 0;
  $('roomEdgeCount').textContent = count.toLocaleString('ar-SA');
  $('roomEdgeStatus').textContent = '';
  renderRoomEdgePreview();
}

$('roomEdgeConverter').ontoggle = renderRoomEdgePreview;
$('roomEdgeForm').oninput = renderRoomEdgePreview;
$('roomEdgeForm').onsubmit = event => {
  event.preventDefault();
  const result = roomEdgeConversion();
  if (!result) {
    $('roomEdgeStatus').textContent = 'تحقق من السماكة والارتفاع وإحداثيات الخطوط المرجعية.';
    return;
  }
  if (!result.count) return;
  commit();
  S.shapes = result.shapes;
  event.target.reset();
  $('roomEdgeConverter').open = false;
  render();
  $('roomEdgeStatus').textContent = 'تم تحويل الخطوط إلى جدران. يمكنك التراجع عن الدفعة بزر التراجع.';
};

$('openingIndex').onchange = loadOpeningFields;
$('openingKind').onchange = configureOpeningSill;
$('openingApply').onclick = () => {
  const wall = selectedWall();
  if (!wall?.openings) return;
  const value = $('openingIndex').value;
  const openings = [...wall.openings];
  const index = value === '' ? openings.length : Number(value);
  const values = Object.fromEntries(Object.entries(openingFields).map(([key, id]) => [key, numberField(id)]));
  const opening = { ...values, kind: $('openingKind').value };
  const thermalU = numberField('openingThermalU');
  const thermalRef = $('openingThermalRef').value.trim().slice(0, 180);
  if ($('openingThermalU').value !== '' || thermalRef) {
    Object.assign(opening, { thermalU, thermalRef });
    if (!evaluateEnvelopeOpening(opening)) {
      $('wallStatus').textContent = 'أدخل معامل U موجبًا ومرجع المنتج مع أبعاد الفتحة، أو اترك بيانات العزل فارغة.';
      return;
    }
  }
  openings[index] = opening;
  if (saveWall({ ...wall, openings }, 'حُفظت الفتحة.')) {
    $('openingIndex').value = String(index);
    loadOpeningFields();
  }
};
$('openingRemove').onclick = () => {
  const wall = selectedWall();
  const index = $('openingIndex').value;
  if (!wall?.openings || index === '') return;
  saveWall({ ...wall, openings: wall.openings.filter((_, item) => item !== Number(index)) }, 'حُذفت الفتحة.');
};
$('editRoom').onclick = () => {
  const current = S.shapes.find(shape => shape.id === S.selected && !isLinear(shape));
  if (!current) return;
  const updated = { ...current, name: $('shapeName').value.slice(0, 160) || 'مساحة',
    w: numberField('shapeW'), h: numberField('shapeH'),
    z: $('roomZ').value === '' ? null : numberField('roomZ'), layer: $('layer').value };
  if (current.type === 'slab') {
    Object.assign(updated, { x: numberField('slabX'), y: numberField('slabY'), z: numberField('slabThickness'),
      layer: 'S-SLAB', name: $('shapeName').value.trim().slice(0, 160) || 'بلاطة' });
  } else {
    Object.assign(updated, roomReviewFields());
  }
  if (!valid(updated)) {
    $('mode').textContent = 'أدخل أبعادًا موجبة وصالحة.';
    return;
  }
  commit();
  S.shapes = S.shapes.map(shape => shape.id === updated.id ? updated : shape);
  $('mode').textContent = current.type === 'slab' ? 'حُدّثت البلاطة المحددة.' : 'حُدّثت المساحة المحددة.';
  render();
};
$('insert').onclick=()=>S.tool==='slab'?addRectangle('slab',numberField('slabX'),numberField('slabY')):addRectangle('room',2,2);$('remove').onclick=()=>{if(!S.selected)return;commit();S.shapes=S.shapes.filter(x=>x.id!==S.selected);S.selected=null;render()};$('undo').onclick=()=>{if(past.length){next.push(JSON.stringify(S));S=JSON.parse(past.pop());clearCoordination();loadTransmissionForm();loadBriefForm();render()}};$('redo').onclick=()=>{if(next.length){past.push(JSON.stringify(S));S=JSON.parse(next.pop());clearCoordination();loadTransmissionForm();loadBriefForm();render()}};$('gridBtn').onclick=()=>{$('gridRect').hidden=!$('gridRect').hidden;$('gridBtn').classList.toggle('active',!$('gridRect').hidden)};
function dl(n,t,m){const a=document.createElement('a');a.href=URL.createObjectURL(t instanceof Blob ? t : new Blob([t],{type:m}));a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}$('save').onclick=()=>{localStorage.setItem('hayyanarsum-v2',JSON.stringify(S));$('mode').textContent='تم الحفظ على هذا الجهاز'};$('exportJSON').onclick=()=>dl('hayyanarsum-project.json',JSON.stringify(S,null,2),'application/json');$('exportDXF').onclick=()=>dl('hayyanarsum.dxf',dxf(levelShapes()),'application/dxf');$('importJSON').onchange=async e=>{try{const x=JSON.parse(await e.target.files[0].text());const project = readProject(x); commit(); S = project; loadProjectFields(); render()}catch{alert('ملف غير صالح')}finally{e.target.value=''}};$('boq').onchange=e=>{if(e.target.classList.contains('rate')){const rate=numericValue(e.target); if(Number.isFinite(rate)&&rate>=0&&rate<=1e12){commit();S.prices[e.target.dataset.id]=rate}boq()}};
$('importDXF').onchange = async event => {
  const file = event.target.files[0];
  const status = $('dxfImportStatus');
  if (!file) return;
  const project = S;
  const level = S.activeLevel;
  try {
    if (file.size > maximumDxfBytes) throw new Error('size');
    const text = await file.text();
    if (S !== project || S.activeLevel !== level) throw new Error('project-changed');
    const { lines, skipped, unit } = readDxf(text, $('dxfFallbackUnit').value, 5000 - S.shapes.length);
    if (lines.length) {
      const additions = lines.map(line => ({ ...line, id: crypto.randomUUID(), levelId: level }));
      commit();
      S.shapes = [...S.shapes, ...additions];
      fitDrawing = true;
      selectShape(null);
    }
    status.textContent = (lines.length ? 'أُضيف ' + lines.length + ' خط إلى الطابق النشط. الوحدة في المصدر ' +
      dxfUnitLabels[unit] + '.' : 'لا توجد خطوط مدعومة في الملف.') +
      (skipped ? ' الكيانات المستبعدة: ' + skipped + '.' : '');
  } catch (error) {
    const messages = {
      size: 'يتجاوز الملف ٥ ميغابايت.',
      'unit-required': 'اختر وحدة المصدر ثم أعد اختيار الملف.',
      'unit-unsupported': 'وحدة الملف غير مدعومة في الاستيراد الحالي.',
      limit: 'يتجاوز الاستيراد حدّ ٥٠٠٠ عنصر للمشروع.',
      'project-changed': 'تغيّر المشروع أو الطابق. اختر الملف مجددًا.',
    };
    status.textContent = messages[error.message] ?? 'تعذّر قراءة الملف. اختر ملف DXF نصيًا صالحًا.';
  } finally {
    event.target.value = '';
  }
};

const csvCell = value => {
  const raw = String(value);
  const safeValue = typeof value === 'string' && /^[\s\uFEFF]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safeValue.replaceAll('"', '""') + '"';
};
const measurementFormat = new Intl.NumberFormat('ar-SA', { maximumSignificantDigits: 8 });
function addMeasurement(points) {
  const result = measureSegment(points);
  if (!result || S.measurements.length >= measurementLimit) {
    $('measurementStatus').textContent = result ? 'بلغ المشروع حدّ ٥٠٠ قياس.' : 'أدخل نقطتين مختلفتين بإحداثيات صالحة.';
    $('mode').textContent = $('measurementStatus').textContent;
    return false;
  }
  commit();
  S.measurements.push({ ...points, levelId: S.activeLevel });
  $('measurementStatus').textContent = 'أُضيف قياس بطول ' + measurementFormat.format(result.distance) + ' م.';
  $('mode').textContent = $('measurementStatus').textContent;
  render();
  return true;
}

function renderMeasurements() {
  const group = $('measurementMarks');
  const rows = $('measurementRows');
  group.replaceChildren();
  rows.replaceChildren();
  for (const [index, item] of S.measurements.entries()) {
    if (item.levelId !== S.activeLevel) continue;
    const { x, y, x2, y2 } = item;
    const { dx, dy, distance } = measureSegment(item);
    group.append(el('line', { x1: x * PX, y1: y * PX, x2: x2 * PX, y2: y2 * PX }));
    const label = el('text', {
      x: (x + x2) / 2 * PX, y: (y + y2) / 2 * PX, 'text-anchor': 'middle', dy: '-.35em',
    });
    label.textContent = measurementFormat.format(distance) + ' م';
    group.append(label);
    const row = rows.insertRow();
    for (const value of [dx, dy, distance]) row.insertCell().textContent = measurementFormat.format(value);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'حذف';
    button.setAttribute('aria-label', 'حذف القياس ' + rows.rows.length);
    button.onclick = () => {
      commit();
      S.measurements.splice(index, 1);
      $('measurementStatus').textContent = 'حُذف القياس.';
      render();
    };
    row.insertCell().append(button);
  }
  $('emptyMeasurements').hidden = rows.rows.length > 0;
  $('measurementTable').hidden = rows.rows.length === 0;
  $('exportMeasurements').disabled = S.measurements.length === 0;
}

function annotatedPlan() {
  const svg = $('svg').cloneNode(true);
  svg.removeAttribute('id');
  svg.classList.add('annotated-plan');
  svg.querySelector('#preview').remove();
  svg.querySelector('#roomEdgePreview').remove();
  if ($('gridRect').hidden) svg.querySelector('#gridRect').remove();
  for (const shape of svg.querySelectorAll('.selected')) shape.classList.remove('selected');
  const view = planView(levelShapes(), levelMeasurements(), PX);
  setDrawingExtent(svg, view);
  const labelSize = Math.max(2, view[2] * .014);
  svg.setAttribute('width', 1200);
  svg.setAttribute('height', 700);
  const style = el('style');
  style.textContent = [
    '.annotated-plan #minor path{fill:none;stroke:#dfe7e3}',
    '.annotated-plan #grid > path{fill:none;stroke:#b9cac3;stroke-width:1.4}',
    '.annotated-plan #dims text,.annotated-plan #shapes .dim{font:' + labelSize + 'px Tahoma,Arial,sans-serif;fill:#405b52}',
    '.annotated-plan #measurementMarks line{stroke:#855a17;stroke-width:2;stroke-dasharray:5 3;vector-effect:non-scaling-stroke}',
    '.annotated-plan #measurementMarks text{font:' + labelSize + 'px Tahoma,Arial,sans-serif;fill:#694407;stroke:white;stroke-width:' +
      labelSize * .22 + ';paint-order:stroke;stroke-linejoin:round}',
  ].join('\n');
  const title = el('title');
  title.textContent = planTitle();
  svg.prepend(title, style);
  return svg;
}

function planTitle() {
  const level = S.levels.find(item => item.id === S.activeLevel);
  return (S.project.name || 'هيا نرسم') + ' · ' + level.name + ' · ' + level.elevation + ' م';
}

$('exportSVG').onclick = () =>
  dl('hayyanarsum-plan.svg', new XMLSerializer().serializeToString(annotatedPlan()), 'image/svg+xml');
$('printPlan').onclick = () => {
  const heading = document.createElement('h1');
  heading.textContent = planTitle();
  const note = document.createElement('p');
  note.textContent = 'مخطط الطابق للمراجعة. القيم بالمتر، ومقياس الطباعة يتبع حجم الورق.';
  $('printSheet').replaceChildren(heading, note, annotatedPlan());
  window.print();
};
window.addEventListener('afterprint', () => $('printSheet').replaceChildren());

$('measurementForm').onsubmit = event => {
  event.preventDefault();
  const ids = { x: 'measureX1', y: 'measureY1', x2: 'measureX2', y2: 'measureY2' };
  const points = Object.fromEntries(Object.entries(ids).map(([key, id]) => [key, numberField(id)]));
  if (addMeasurement(points)) event.target.reset();
};
$('exportMeasurements').onclick = () => {
  const rows = [['الطابق', 'X البداية (م)', 'Y البداية (م)', 'X النهاية (م)', 'Y النهاية (م)', 'فرق X (م)', 'فرق Y (م)', 'المسافة (م)']];
  for (const item of S.measurements) {
    const { dx, dy, distance } = measureSegment(item);
    rows.push([elementLevel(item, S.levels).name, item.x, item.y, item.x2, item.y2, dx, dy, distance]);
  }
  dl('hayyanarsum-measurements.csv', '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
};

let coordination;
function clearCoordination() {
  if (!coordination) return;
  coordination = undefined;
  $('coordinationRows').replaceChildren();
  $('coordinationTable').hidden = true;
  $('exportCoordination').disabled = true;
  $('exportCoordinationBcf').disabled = true;
  $('coordinationExportStatus').textContent = '';
  $('coordinationStatus').textContent = 'تغيّرت بيانات المشروع. أعد الفحص لتحديث النتائج.';
}

function selectDrawingShape(shape) {
  S.activeLevel = elementLevel(shape, S.levels).id;
  document.querySelector('[data-tool="select"]').click();
  selectShape(shape.id);
}

function coordinationSelection(cell, shape) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = itemLabel(shape);
  button.onclick = () => {
    selectDrawingShape(shape);
    $('activeLevel').focus();
  };
  cell.append(button);
}

$('runCoordination').onclick = () => {
  coordination = wallSlabClashes(S.shapes, S.levels);
  const { pairs, omitted, walls, slabs, complete } = coordination;
  const rows = $('coordinationRows');
  rows.replaceChildren();
  for (const { wall, slab, volume } of pairs) {
    const row = rows.insertRow();
    coordinationSelection(row.insertCell(), wall);
    coordinationSelection(row.insertCell(), slab);
    row.insertCell().textContent = thermalLabel(volume);
  }
  $('coordinationTable').hidden = pairs.length === 0;
  const checked = walls && slabs;
  $('exportCoordination').disabled = !checked;
  $('exportCoordinationBcf').disabled = pairs.length === 0;
  $('coordinationExportStatus').textContent = '';
  const outcome = !checked ? 'أضف جدارًا وبلاطة بأبعاد مجسّمة لبدء المقارنة.'
    : complete ? 'حالات التداخل: ' + pairs.length + '.' : 'الفحص جزئي. الحالات المعروضة: ' + pairs.length + '.';
  $('coordinationStatus').textContent = outcome + ' الجدران المؤهلة: ' + walls + ' · البلاطات المؤهلة: ' + slabs +
    (omitted ? ' · عناصر مستبعدة لنقص بياناتها: ' + omitted : '');
};

$('exportCoordination').onclick = () => {
  if (!coordination) return;
  const rows = [
    ['تقرير تداخل الجدران والبلاطات', S.project.name ?? ''],
    ['حالة الفحص', $('coordinationStatus').textContent], ['النطاق', $('coordinationScope').textContent], [],
    ['معرّف الجدار', 'الجدار', 'معرّف البلاطة', 'البلاطة', 'الحجم المشترك (م³)'],
  ];
  for (const { wall, slab, volume } of coordination.pairs) {
    rows.push([wall.id, itemLabel(wall), slab.id, itemLabel(slab), volume]);
  }
  dl('hayyanarsum-coordination.csv', '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'),
    'text/csv;charset=utf-8');
};

$('exportCoordinationBcf').onclick = () => {
  if (!coordination?.pairs.length) return;
  try {
    const { archive, unlinked } = exportCoordinationBcf(coordination, S.levels, S.project.name);
    dl('hayyanarsum-coordination.bcf', archive);
    $('coordinationExportStatus').textContent = unlinked
      ? 'جُهّز ملف BCF. ملاحظات نصية بلا ربط IFC: ' + unlinked + '.'
      : 'جُهّز ملف BCF. استخدم معه ملف IFC4 من نسخة المشروع نفسها.';
  } catch {
    $('coordinationExportStatus').textContent = 'تعذّر تجهيز ملف BCF. يمكنك تنزيل التقرير بصيغة CSV.';
  }
};

$('csv').onclick = () => {
  const rows = [['العنصر','الطبقة','الكمية','الوحدة','سعر الوحدة','الإجمالي']];
  for (const shape of S.shapes) {
    if (shape.type === 'cadLine') continue;
    const quantity = quantityFor(shape);
    const rate = S.prices[shape.id] ?? 0;
    const label = itemLabel(shape);
    rows.push([label,shape.layer,quantity,shape.type === 'wall' ? 'م' : 'م²',rate,quantity * rate]);
    if (shape.type === 'slab') rows.push([label + ' · مساحة الفتحات', shape.layer, slabOpeningArea(shape), 'م²', '', ''],
      [label + ' · الحجم الصافي', shape.layer, slabVolume(shape), 'م³', '', '']);
    if (shape.type === 'wall' && shape.thickness != null) {
      const { openingArea, netArea, netVolume } = wallQuantities(shape);
      rows.push([label + ' · مساحة الفتحات', shape.layer, openingArea, 'م²', '', ''],
        [label + ' · صافي المساحة', shape.layer, netArea, 'م²', '', ''],
        [label + ' · صافي الحجم', shape.layer, netVolume, 'م³', '', '']);
    }
  }
  const summary = wallVolumeSummary(S.shapes, S.levels);
  if (summary.walls) {
    rows.push(['مجموع الأحجام الفردية', '', summary.separateVolume, 'م³', '', '']);
    if (summary.netVolume === null) {
      rows.push(['تعذّر حساب التقاطعات لهذا النموذج', '', '', '', '', '']);
    } else {
      rows.push(['حجم التكرار المخصوم عند التقاطعات', '', summary.overlap, 'م³', '', ''],
        ['إجمالي صافي حجم الجدران', '', summary.netVolume, 'م³', '', '']);
    }
  }
  if (summary.omitted) rows.push(['جدران دون أبعاد مجسّمة', '', summary.omitted, 'عدد', '', '']);
  const slabs = slabVolumeSummary(S.shapes, S.levels);
  if (slabs.slabs) {
    rows.push(['مجموع أحجام البلاطات الفردية', '', slabs.separateVolume, 'م³', '', '']);
    if (slabs.netVolume === null) {
      rows.push(['تعذّر حساب تداخل البلاطات لهذا النموذج', '', '', '', '', '']);
    } else {
      rows.push(['حجم تداخل البلاطات المخصوم', '', slabs.overlap, 'م³', '', ''],
        ['إجمالي صافي حجم البلاطات', '', slabs.netVolume, 'م³', '', '']);
    }
  }
  dl('hayyanarsum-boq.csv','\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8');
};
$('run').onclick = () => {
  const input = $('command').value.trim()
    .replace(/[٠-٩]/g, char => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
    .replaceAll('٫', '.');
  const match = /^(?:أضف\s+)?(?:غرفة|room)\s*(نوم)?\s+(\d+(?:\.\d+)?)\s*(?:في|×|x)\s*(\d+(?:\.\d+)?)\s*(?:متر|م|m)?$/iu.exec(input);
  if (!match) {
    $('commandResult').textContent = 'جرّب: أضف غرفة 4.25 في 5 متر.';
    return;
  }
  const [, name, width, height] = match;
  const origin = 2 + S.shapes.length / 2;
  $('commandResult').textContent = addRectangle('room', origin, origin, Number(width), Number(height), name ? 'غرفة نوم' : 'مساحة', false)
    ? 'أُضيفت مساحة بأبعاد ' + width + ' × ' + height + ' م.'
    : 'أدخل أبعادًا موجبة وصالحة.';
};
const reviewLabels = { draft: 'استرشادي', pending: 'بيانات ناقصة', review: 'تتطلب مراجعة' };

function readReviewInputs() {
  const text = Object.fromEntries(saudiTextFields.map(id => [id, $(id).value]));
  const numbers = Object.fromEntries(saudiNumberFields.map(id => [id, numberField(id)]));
  const edges = [...$('siteEdges').querySelectorAll('fieldset')].map(row => {
    const field = key => row.querySelector('[data-key="' + key + '"]');
    const value = key => field(key).value;
    const number = key => value(key) === '' ? null : numericValue(field(key));
    return { name: value('name'), kind: value('kind'), streetWidth: number('streetWidth'), setback: number('setback') };
  });
  return cleanSaudiInputs({ ...text, ...numbers, edges });
}

function addSiteEdge(edge = {}) {
  const list = $('siteEdges');
  if (list.childElementCount >= 24) return;
  const row = document.createElement('fieldset');
  row.className = 'review-fields';
  const legend = document.createElement('legend');
  legend.textContent = 'حد إضافي';
  row.append(legend);
  function field(key, caption, type) {
    const label = document.createElement('label');
    label.textContent = caption;
    const input = document.createElement(type === 'select' ? 'select' : 'input');
    input.dataset.key = key;
    if (type === 'select') {
      for (const [kind, display] of Object.entries(saudiEdgeKinds)) input.add(new Option(display, kind));
    } else {
      if (type === 'number') {
        input.dataset.number = '';
        input.inputMode = 'decimal';
        input.dataset.min = '0';
        input.dataset.step = 'any';
      } else {
        input.maxLength = 100;
      }
    }
    input.value = edge[key] ?? (key === 'kind' ? 'street' : '');
    label.append(input);
    row.append(label);
    return input;
  }
  field('name', 'اسم الحد', 'text');
  const kind = field('kind', 'نوع الحد', 'select');
  const width = field('streetWidth', 'عرض الشارع لهذا الحد (م)', 'number');
  field('setback', 'الارتداد الأرضي المقاس (م)', 'number');
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'إزالة هذا الحد';
  remove.onclick = () => {
    row.remove();
    updateReviewInputs();
  };
  kind.onchange = updateReviewInputs;
  row.append(remove);
  list.append(row);
  updateReviewInputs();
}

function runChecks() {
  const input = readReviewInputs();
  const results = reviewResults(input, $('siteCity').value);
  const drafts = results.filter(result => result.status === 'draft').length;
  $('checks').childNodes[0].nodeValue = drafts;
  $('summary').textContent = drafts ? 'مقارنات استرشادية: ' + drafts : 'مسار المراجعة حسب البيانات المدخلة';
  $('results').replaceChildren();
  for (const result of results) {
    const card = document.createElement('article');
    card.className = 'result';
    const heading = document.createElement('h3');
    heading.textContent = result.title + ' · ' + reviewLabels[result.status];
    const body = document.createElement('p');
    body.textContent = result.message;
    card.append(heading, body);
    if (result.url) {
      const link = document.createElement('a');
      link.href = result.url;
      link.textContent = result.source;
      card.append(link);
    }
    $('results').append(card);
  }
}
function reviewResults(input, city) {
  return [...saudiProjectReview(input, city), ...saudiModelReview(input, city, S.shapes, S.levels)];
}

const thermalFields = {
  name: 'thermalName', kind: 'thermalKind', inside: 'thermalInside', outside: 'thermalOutside',
  target: 'thermalTarget', city: 'thermalCity', reference: 'thermalReference',
};
const thermalLabel = value => value.toLocaleString('ar-SA', { maximumSignificantDigits: 5 });
const thermalList = () => S.project.thermal ?? [];
const selectedThermalElement = () => S.shapes.find(shape => shape.id === S.selected && elementThermalKind(shape));
function envelopeResults() {
  const assemblies = new Map(thermalList().map(assembly => [assembly.id, assembly]));
  return S.shapes.flatMap(shape => {
    const result = evaluateEnvelopeElement(shape, assemblies);
    const name = itemLabel(shape);
    const rows = result ? [{ ...result, name, reference: result.assembly.name, kind: 'opaque' }] : [];
    if (shape.type === 'wall') {
      for (const [index, opening] of (shape.openings ?? []).entries()) {
        const thermal = evaluateEnvelopeOpening(opening);
        if (thermal) rows.push({ ...thermal, name: name + ' · ' + openingLabel(opening.kind) + ' ' + (index + 1), kind: 'opening' });
      }
    }
    return rows;
  });
}
const conductanceSum = (rows, kind) => rows.reduce((sum, row) => sum + (row.kind === kind ? row.conductance : 0), 0);

function renderThermalAssignment() {
  const shape = selectedThermalElement();
  $('elementThermalPanel').hidden = !shape;
  if (!shape) return;
  const compatible = thermalList().filter(assembly => assembly.kind === elementThermalKind(shape));
  const selector = $('elementThermal');
  selector.replaceChildren(new Option('غير مرتبط', ''), ...compatible.map(assembly => new Option(assembly.name, assembly.id)));
  selector.value = compatible.some(assembly => assembly.id === shape.thermalId) ? shape.thermalId : '';
  selector.disabled = !compatible.length;
  $('elementThermalNote').textContent = compatible.length
    ? 'اربط العنصر فقط إذا كان جزءًا مصمتًا من الغلاف الخارجي، ثم احفظ المشروع.'
    : 'احفظ تجميعة من النوع المناسب في حاسبة العزل لإتاحتها هنا.';
}
$('elementThermal').onchange = event => {
  const shape = selectedThermalElement();
  const thermalId = event.target.value;
  if (!shape || (thermalId && !thermalList().some(assembly => assembly.id === thermalId &&
      assembly.kind === elementThermalKind(shape)))) return;
  commit();
  S.shapes = S.shapes.map(element => element.id === shape.id ? { ...element, thermalId } : element);
  renderThermalAssignment();
  renderEnvelope();
};
const transmissionFor = (rows, design = S.project.transmission) =>
  evaluateTransmission(design, rows.map(row => row.conductance));
const transmissionDirection = deltaK => deltaK > 0 ? 'فقد إلى الخارج' : deltaK < 0 ? 'اكتساب من الخارج' : 'درجتان متساويتان';

function loadTransmissionForm() {
  const design = S.project.transmission;
  $('indoorC').value = design?.indoorC ?? '';
  $('outdoorC').value = design?.outdoorC ?? '';
  $('temperatureReference').value = design?.reference ?? '';
  $('transmissionStatus').textContent = '';
}

function saveTransmission(design) {
  commit();
  S.project.transmission = design;
  loadTransmissionForm();
  renderEnvelope();
  try {
    localStorage.setItem('hayyanarsum-v2', JSON.stringify(S));
    $('transmissionStatus').textContent = design ? 'حُفظت درجات التصميم.' : 'حُذفت درجات التصميم.';
  } catch {
    $('transmissionStatus').textContent = 'تعذّر الحفظ المحلي. يمكنك حفظ التغييرات بتصدير ملف المشروع.';
  }
}

$('transmissionForm').onsubmit = event => {
  event.preventDefault();
  const design = cleanTransmissionScenario({
    indoorC: numberField('indoorC'), outdoorC: numberField('outdoorC'),
    reference: $('temperatureReference').value,
  });
  if (!design || !transmissionFor(envelopeResults(), design)) {
    $('transmissionStatus').textContent = 'تحقق من درجات التصميم ومرجعها وتوافر نتائج للعناصر.';
    return;
  }
  saveTransmission(design);
};
$('clearTransmission').onclick = () => saveTransmission(null);

function renderEnvelope() {
  const results = envelopeResults();
  $('envelopePanel').hidden = !results.length;
  const rows = $('envelopeRows');
  rows.replaceChildren();
  const transmission = transmissionFor(results);
  $('transmissionColumn').hidden = !transmission;
  $('clearTransmission').disabled = !S.project.transmission;
  $('transmissionResult').textContent = transmission
    ? transmissionDirection(transmission.deltaK) + ' · فرق الحرارة: ' + thermalLabel(Math.abs(transmission.deltaK)) +
      ' K · مجموع العناصر المعروضة: ' + thermalLabel(Math.abs(transmission.totalW)) + ' W'
    : '';
  for (const [index, entry] of results.entries()) {
    const row = rows.insertRow();
    for (const value of [entry.name, entry.reference, thermalLabel(entry.area),
      thermalLabel(entry.transmittance), thermalLabel(entry.conductance)]) row.insertCell().textContent = value;
    if (transmission) row.insertCell().textContent = thermalLabel(Math.abs(transmission.watts[index]));
  }
  const solid = conductanceSum(results, 'opaque');
  const openings = conductanceSum(results, 'opening');
  $('envelopeTotal').textContent = 'الأجزاء المصمتة: ' + thermalLabel(solid) + ' W/K · الأبواب والنوافذ ذات البيانات: ' +
    thermalLabel(openings) + ' W/K · مجموع العناصر المحسوبة: ' + thermalLabel(solid + openings) +
    ' W/K. تُخصم الفتحات من مساحة الجدار. يتطلب حمل المبنى بيانات الغلاف الكاملة والتهوية والمناخ.';
}
function thermalComparisonText(assembly, city) {
  const comparison = compareAssembly(assembly, city);
  if (comparison.status === 'pending') return 'أكّد مرجع الحد وطابق مدينته مع المدينة المحفوظة للمشروع.';
  if (comparison.status === 'none') return 'أضف الحد المرجعي الخاص بالمشروع لإجراء المقارنة.';
  return 'مقارنة استرشادية بالحد المدخل (' + thermalLabel(assembly.target) + ' W/m²·K). ' +
    (comparison.within ? 'القيمة المحسوبة ضمن الحد.' : 'القيمة المحسوبة تتجاوز الحد.') + ' المرجع: ' + comparison.reference;
}

function addThermalLayer(layer = {}) {
  const list = $('thermalLayers');
  if (list.childElementCount >= 30) return;
  const row = document.createElement('fieldset');
  row.className = 'review-fields thermal-layer';
  const legend = document.createElement('legend');
  legend.textContent = 'طبقة مادة';
  row.append(legend);
  for (const [key, labelText] of [['name','المادة'], ['mm','السماكة (ملم)'], ['conductivity','الموصلية λ (W/m·K)']]) {
    const label = document.createElement('label');
    label.textContent = labelText;
    const field = document.createElement('input');
    field.dataset.key = key;
    if (key !== 'name') {
      field.dataset.number = '';
      field.inputMode = 'decimal';
      field.dataset.step = 'any';
      field.dataset.min = '0';
      field.required = true;
    }
    field.value = layer[key] ?? '';
    label.append(field);
    row.append(label);
  }
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'إزالة الطبقة';
  remove.onclick = () => { row.remove(); adjustThermalLayers(); markThermalDraft(); };
  row.append(remove);
  list.append(row);
  adjustThermalLayers();
}

function adjustThermalLayers() {
  const list = $('thermalLayers');
  $('thermalLayerAdd').disabled = list.childElementCount >= 30;
  for (const button of list.querySelectorAll('button')) button.disabled = list.childElementCount <= 1;
}

function readThermalForm() {
  const input = { id: $('thermalSelect').value };
  for (const [key, id] of Object.entries(thermalFields)) {
    input[key] = ['inside','outside','target'].includes(key) ? numberField(id) : $(id).value;
  }
  input.layers = [...$('thermalLayers').children].map(row => Object.fromEntries(
    [...row.querySelectorAll('input')].map(field => [field.dataset.key, field.hasAttribute('data-number') ? numericValue(field) : field.value])));
  return cleanAssembly(input);
}

function renderThermalResult(assembly) {
  const panel = $('thermalResult');
  panel.replaceChildren();
  const result = evaluateAssembly(assembly);
  if (!result) return;
  const values = document.createElement('p');
  values.textContent = 'المقاومة الكلية R = ' + thermalLabel(result.totalResistance) +
    ' م²·K/W · معامل الانتقال U = ' + thermalLabel(result.transmittance) + ' W/m²·K';
  const breakdown = document.createElement('ol');
  assembly.layers.forEach((layer, index) => {
    const item = document.createElement('li');
    item.textContent = (layer.name || 'طبقة ' + (index + 1)) + ': R = ' + thermalLabel(result.resistances[index]) + ' م²·K/W';
    breakdown.append(item);
  });
  const comparison = document.createElement('p');
  comparison.textContent = thermalComparisonText(assembly, S.project.city);
  panel.append(values, breakdown, comparison);
}

function loadThermalForm(selected = '') {
  const list = thermalList();
  const picker = $('thermalSelect');
  picker.replaceChildren(new Option('تجميعة جديدة', ''), ...list.map(entry => new Option(entry.name, entry.id)));
  const assembly = list.find(entry => entry.id === selected);
  picker.value = assembly?.id ?? '';
  for (const [key, id] of Object.entries(thermalFields)) $(id).value = assembly?.[key] ?? (key === 'kind' ? 'wall' : '');
  $('thermalLayers').replaceChildren();
  for (const layer of assembly?.layers ?? [{}]) addThermalLayer(layer);
  $('thermalStatus').textContent = '';
  renderThermalResult(assembly ?? {});
}

function markThermalDraft() {
  $('thermalResult').replaceChildren();
  $('thermalStatus').textContent = 'أعد الحساب لحفظ القيم المعدّلة.';
}
$('thermalLayerAdd').onclick = () => { addThermalLayer(); markThermalDraft(); };
$('thermalSelect').onchange = event => loadThermalForm(event.target.value);
$('thermalForm').oninput = event => { if (event.target.id !== 'thermalSelect') markThermalDraft(); };
$('thermalForm').onsubmit = event => {
  event.preventDefault();
  const assembly = readThermalForm();
  if (!assembly.name || !evaluateAssembly(assembly)) {
    $('thermalStatus').textContent = 'أدخل اسمًا، ومقاومتي السطح، وسماكة وموصلية موجبة لكل طبقة.';
    return;
  }
  if (assembly.target !== null && assembly.target <= 0) {
    $('thermalStatus').textContent = 'أدخل حد U موجبًا أو اتركه فارغًا.';
    return;
  }
  const previous = thermalList();
  if (assembly.id && S.shapes.some(shape => shape.thermalId === assembly.id) &&
    previous.find(entry => entry.id === assembly.id)?.kind !== assembly.kind) {
    $('thermalStatus').textContent = 'نوع التجميعة مستخدم في النموذج. احفظ النوع الجديد كتجميعة مستقلة.';
    return;
  }
  if (!assembly.id && previous.length >= 100) {
    $('thermalStatus').textContent = 'بلغ المشروع الحد الأقصى للتجميعات المحفوظة.';
    return;
  }
  const saved = assembly.id ? previous.map(entry => entry.id === assembly.id ? assembly : entry)
    : [...previous, { ...assembly, id: crypto.randomUUID() }];
  S.project.thermal = saved;
  loadThermalForm(assembly.id || saved.at(-1).id);
  renderThermalAssignment();
  renderEnvelope();
  try {
    localStorage.setItem('hayyanarsum-v2', JSON.stringify(S));
    $('thermalStatus').textContent = 'حُسبت التجميعة وحُفظت في المشروع.';
  } catch {
    $('thermalStatus').textContent = 'تعذّر الحفظ المحلي. يمكنك حفظ التجميعة بتصدير ملف المشروع.';
  }
};
function updateReviewInputs() {
  $('apartmentMeasurements').hidden = $('workType').value !== 'new' ||
    !['apartment','mixed-apartment'].includes($('buildingType').value);
  for (const field of $('apartmentMeasurements').querySelectorAll('input')) {
    field.disabled = $('apartmentMeasurements').hidden;
  }
  $('retailFields').hidden = $('buildingType').value !== 'mixed-apartment';
  $('retailFields').disabled = $('retailFields').hidden || $('apartmentMeasurements').hidden;
  for (const row of $('siteEdges').querySelectorAll('fieldset')) {
    row.disabled = $('apartmentMeasurements').hidden;
    const width = row.querySelector('[data-key="streetWidth"]');
    width.disabled = row.querySelector('[data-key="kind"]').value !== 'street';
    width.parentElement.hidden = width.disabled;
  }
  $('addSiteEdge').disabled = $('siteEdges').childElementCount >= 24;
}
for (const id of ['workType','buildingType']) $(id).onchange = updateReviewInputs;
$('addSiteEdge').onclick = () => addSiteEdge();
$('checkForm').onsubmit = event => {
  event.preventDefault();
  S.project = { ...S.project, city: $('siteCity').value.trim(), saudi: readReviewInputs() };
  $('projectCity').value = S.project.city;
  runChecks();
  try {
    localStorage.setItem('hayyanarsum-v2', JSON.stringify(S));
    $('reviewSaved').textContent = 'حُفظت بيانات التحقق محليًا.';
  } catch {
    $('reviewSaved').textContent = 'تعذّر الحفظ المحلي. يمكنك تصدير ملف المشروع لحفظ البيانات.';
  }
};
$('exportSaudiReview').onclick = () => {
  if (!$('checkForm').reportValidity() || !validateNumericFields($('checkForm'))) return;
  const city = $('siteCity').value.trim();
  const input = readReviewInputs();
  const rows = [
    ['تقرير مراجعة استرشادي', new Date().toISOString()],
    ['المشروع', S.project.name ?? ''], ['المدينة', city], ['البلدية', input.municipality],
    ['مرجع القطعة', input.parcelReference], ['مرجع الاشتراط المحلي', input.localGuide],
    ['نوع المشروع', $('buildingType').selectedOptions[0]?.text ?? ''],
    ['نوع العمل', $('workType').selectedOptions[0]?.text ?? ''],
    [], ['المدخل', 'القيمة'],
  ];
  if (!$('apartmentMeasurements').hidden) {
    saudiNumberFields.filter(id => !$(id).closest('fieldset[hidden]')).forEach(id =>
      rows.push([$(id).labels[0].textContent.trim(), input[id] ?? '']));
    rows.push([], ['الحد', 'النوع', 'عرض الشارع (م)', 'الارتداد المقاس (م)']);
    input.edges.forEach((edge, index) => rows.push([edge.name || 'الحد ' + (index + 1),
      saudiEdgeKinds[edge.kind], edge.kind === 'street' ? edge.streetWidth ?? '' : '', edge.setback ?? '']));
  }
  rows.push([], ['الفحص', 'الحالة', 'النتيجة', 'المرجع', 'الرابط']);
  for (const result of reviewResults(input, city)) {
    rows.push([result.title, reviewLabels[result.status], result.message, result.source, result.url]);
  }
  if (thermalList().length) {
    rows.push([], ['العزل الحراري', 'نوع العنصر', 'R الكلية (م²·K/W)', 'U المحسوب (W/m²·K)', 'المقارنة']);
    for (const assembly of thermalList()) {
      const result = evaluateAssembly(assembly);
      rows.push([assembly.name, thermalKinds[assembly.kind], result.totalResistance,
        result.transmittance, thermalComparisonText(assembly, city)]);
    }
  }
  const envelope = envelopeResults();
  if (envelope.length) {
    const transmission = transmissionFor(envelope);
    const headers = ['عنصر الغلاف', 'التجميعة أو مرجع المنتج', 'المساحة المحسوبة (م²)', 'U (W/m²·K)', 'U × A (W/K)'];
    if (transmission) headers.push('انتقال الحرارة (W)');
    rows.push([], headers);
    for (const [index, entry] of envelope.entries()) {
      const row = [entry.name, entry.reference, entry.area, entry.transmittance, entry.conductance];
      if (transmission) row.push(Math.abs(transmission.watts[index]));
      rows.push(row);
    }
    const solid = conductanceSum(envelope, 'opaque');
    const openings = conductanceSum(envelope, 'opening');
    rows.push(['مجموع الأجزاء المصمتة', '', '', '', solid], ['مجموع الأبواب والنوافذ ذات البيانات', '', '', '', openings],
      ['مجموع العناصر المحسوبة', '', '', '', solid + openings]);
    if (transmission) {
      const { indoorC, outdoorC, reference } = S.project.transmission;
      rows.push([], ['درجة التصميم الداخلية (°C)', indoorC], ['درجة التصميم الخارجية (°C)', outdoorC],
        ['مرجع درجات التصميم', reference], ['فرق الحرارة (K)', Math.abs(transmission.deltaK)],
        ['اتجاه الانتقال', transmissionDirection(transmission.deltaK)],
        ['مجموع انتقال الحرارة للعناصر المعروضة (W)', Math.abs(transmission.totalW)],
        ['نطاق الحساب', $('transmissionScope').textContent]);
    }
  }
  dl('hayyanarsum-saudi-review.csv', '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
};
for (const source of saudiSources) {
  const row = document.createElement('div');
  row.className = 'source';
  const category = document.createElement('b');
  category.textContent = source.category;
  const body = document.createElement('div');
  const link = document.createElement('a');
  link.href = source.url;
  link.textContent = source.title;
  const note = document.createElement('p');
  note.textContent = source.note;
  body.append(link, note);
  row.append(category, body);
  $('sources').append(row);
}
const styles=['النجدية','النجدية الشمالية','ساحل تبوك','المدينة المنورة','ريف المدينة المنورة','الحجازية الساحلية','الطائف','جبال السروات','أصدار عسير','سفوح تهامة','ساحل تهامة','مرتفعات أبها','جزر فرسان','بيشة الصحراوية','نجران','واحات الأحساء','القطيف','الساحل الشرقي','النجدية الشرقية'];$('styles').innerHTML=styles.map(x=>'<span>عمارة '+x+'</span>').join('');const mods=[['الرسم ثنائي الأبعاد','نواة عملية'],['DXF / SVG / JSON','تصدير فعلي'],['الكميات والتكلفة','نواة عملية'],['التحقق السعودي','مقارنات استرشادية'],['IFC4','تصدير الجدران والبلاطات والفراغات'],['التحليل الإنشائي','غير منفذ'],['MEP والمحاكاة','غير منفذ'],['التعاون والحسابات','غير منفذ']];$('modules').innerHTML=mods.map(x=>`<div class="module"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');$('projectForm').onsubmit=e=>{e.preventDefault();S.project={...S.project,name:$('projectName').value,city:$('projectCity').value,revision:$('revision').value,description:$('description').value};localStorage.setItem('hayyanarsum-v2',JSON.stringify(S));$('saved').textContent='تم الحفظ';loadSaudiFields()};
const briefReview = $('briefReviewForm');
const briefField = key => briefReview.elements.namedItem(key);
let briefConflicts = [];
const manuallyEditedBriefFields = new Set();
let manuallyEditedBriefRooms = false;
const manuallyEditedSetbacks = new Set();
let manualSetbackChoice = false;
let setbackConflicts = [];
let invalidSetbacks = [];
const setbackLabels = { front: 'الأمامي', rear: 'الخلفي', left: 'الأيسر', right: 'الأيمن' };

let citySuggestion;
let cityRequest;
const aiCityButton = $('briefAiCity');
const aiCityStatus = $('briefAiStatus');
const aiCityApply = $('briefAiApply');
$('briefAiControls').hidden = !document.querySelector('meta[name="brief-ai"][content="ollama"]');

function clearCitySuggestion() {
  cityRequest?.abort();
  cityRequest = undefined;
  citySuggestion = undefined;
  aiCityButton.disabled = false;
  aiCityStatus.textContent = '';
  aiCityApply.hidden = true;
}

$('briefDescription').oninput = () => {
  clearCitySuggestion();
  renderBriefEvidence();
  clearBriefPlan();
};

aiCityButton.onclick = async () => {
  const description = $('briefDescription').value;
  if (!$('briefDescription').reportValidity() || !description.trim()) return;
  clearCitySuggestion();
  const { data, conflicts } = extractBrief(description);
  const city = briefField('city');
  if (city.value.trim() || data.city || conflicts.includes('city')) {
    aiCityStatus.textContent = 'راجع المدينة في الحقول أدناه أو استخدم الاستخراج المحلي أولًا.';
    return;
  }
  const controller = new AbortController();
  cityRequest = controller;
  aiCityButton.disabled = true;
  aiCityStatus.textContent = 'جارٍ البحث عن اسم المدينة في الوصف.';
  try {
    const response = await fetch('/api/brief-city', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (cityRequest !== controller) return;
    if (!response.ok) {
      if (result.error === 'model-not-installed') {
        aiCityStatus.textContent = 'النموذج المحلي المحدد غير متاح في Ollama. يمكنك متابعة الاستخراج بالقواعد المحلية.';
        return;
      }
      throw new Error('AI unavailable');
    }
    citySuggestion = result.city;
    aiCityStatus.textContent = citySuggestion
      ? 'المدينة المقترحة للمراجعة: ' + citySuggestion + (result.source ? ' · من الوصف: «' + result.source + '»' : '')
      : 'تعذّر ربط اقتراح المدينة بعبارة واضحة عن موقع المشروع. يمكنك كتابة المدينة في الحقل أدناه.';
    aiCityApply.hidden = !citySuggestion;
  } catch {
    if (cityRequest === controller) aiCityStatus.textContent =
      'تعذّر الاتصال بنموذج AI المحلي. يمكنك متابعة الاستخراج المحلي وتعبئة المدينة يدويًا.';
  } finally {
    if (cityRequest === controller) {
      cityRequest = undefined;
      aiCityButton.disabled = false;
    }
  }
};

aiCityApply.onclick = () => {
  if (!citySuggestion || briefField('city').value.trim()) return;
  briefField('city').value = citySuggestion;
  briefField('city').dispatchEvent(new Event('input', { bubbles: true }));
};
function readBriefFields() {
  return cleanBrief(Object.fromEntries(Object.keys(briefFields).map(key => {
    const field = briefField(key);
    return [key, field.hasAttribute('data-number') ? numericValue(field) : field.value];
  })));
}
function renderBriefQuestions() {
  const data = readBriefFields();
  $('briefQuestions').replaceChildren(...missingBriefFields(data).map(key => {
    const item = document.createElement('li');
    item.textContent = (briefConflicts.includes(key) ? 'ذُكرت قيم مختلفة. ' : '') + briefFields[key].question;
    return item;
  }));
}
function renderBriefEvidence(evidence = {}) {
  const labels = { kind: 'نوع المبنى', city: 'المدينة', frontage: 'عرض الأرض',
    depth: 'عمق الأرض', storeys: 'عدد الطوابق', bedrooms: 'عدد غرف النوم' };
  const list = $('briefEvidenceList');
  list.replaceChildren();
  const panel = $('briefEvidence');
  panel.hidden = Object.keys(evidence).length === 0;
  if (panel.hidden) panel.open = false;
  for (const key of Object.keys(briefFields)) {
    const candidates = evidence[key] ?? [];
    for (const { value, line, text } of candidates) {
      const label = typeof value === 'number'
        ? value.toLocaleString('ar-SA', { maximumSignificantDigits: 21 }) + (key === 'frontage' || key === 'depth' ? ' م' : '')
        : key === 'kind' ? Array.from(briefField(key).options).find(option => option.value === value)?.text ?? value
          : value;
      const item = document.createElement('li');
      item.textContent = labels[key] + ' · ' + label + ' · السطر ' + thermalLabel(line) + ' ';
      const quote = document.createElement('bdi');
      quote.textContent = '«' + text + '»';
      item.append(quote);
      if (candidates.length > 1) {
        const select = document.createElement('button');
        select.type = 'button';
        select.textContent = 'استخدم هذه القيمة';
        select.setAttribute('aria-label', 'استخدم ' + label + ' في حقل ' + labels[key]);
        select.onclick = () => {
          const field = briefField(key);
          field.value = String(value);
          field.dispatchEvent(new Event('input', { bubbles: true }));
          $('briefStatus').textContent = 'نُقلت القيمة إلى حقل ' + labels[key] + '.';
          field.focus();
        };
        item.append(' ', select);
      }
      list.append(item);
    }
  }
}

function loadBriefForm() {
  clearCitySuggestion();
  renderBriefEvidence();
  const saved = S.project.brief ?? {};
  $('briefFillPositions').checked = false;
  $('briefUseRoomEdges').checked = false;
  $('briefDescription').value = saved.description ?? '';
  for (const key of Object.keys(briefFields)) briefField(key).value = saved.fields?.[key] ?? '';
  $('briefUseSetbacks').checked = Boolean(saved.setbacks);
  manualSetbackChoice = Boolean(saved.setbacks);
  setbackConflicts = [];
  invalidSetbacks = [];
  manuallyEditedSetbacks.clear();
  for (const side of setbackSides) {
    const value = saved.setbacks?.[side];
    $('briefSetback-' + side).value = value ?? '';
    if (value != null) manuallyEditedSetbacks.add(side);
  }
  updateBriefSetbackFields();
  const rooms = saved.rooms ?? [];
  $('briefRoomList').replaceChildren();
  for (const room of rooms) addBriefRoom(room);
  $('briefLayoutMode').value = rooms.length ? 'custom' : 'bedrooms';
  if (rooms.length && saved.positionRooms) $('briefPlacement').value = 'coordinates';
  else if ($('briefPlacement').value === 'coordinates') $('briefPlacement').value = 'automatic';
  manuallyEditedBriefRooms = rooms.length > 0;
  $('briefAddRoom').disabled = rooms.length >= 100;
  updateBriefLayoutMode();
  briefConflicts = [];
  manuallyEditedBriefFields.clear();
  $('briefStatus').textContent = '';
  clearBriefPlan();
  renderBriefQuestions();
}
$('briefExtractForm').onsubmit = event => {
  event.preventDefault();
  clearCitySuggestion();
  const description = $('briefDescription').value;
  const { data, conflicts, evidence } = extractBrief(description, { includeEvidence: true });
  renderBriefEvidence(evidence);
  const rooms = extractBriefRooms(description);
  const containsPositions = rooms.some(room => Object.hasOwn(room, 'x'));
  const { setbacks, conflicts: disputedSetbacks, invalid } = extractBriefSetbacks(description);
  setbackConflicts = disputedSetbacks.filter(side => !manuallyEditedSetbacks.has(side));
  invalidSetbacks = invalid.filter(side => !manuallyEditedSetbacks.has(side));
  if (!manualSetbackChoice) $('briefUseSetbacks').checked = Boolean(setbacks);
  for (const side of setbackSides) {
    if (!manuallyEditedSetbacks.has(side)) $('briefSetback-' + side).value = setbacks?.[side] ?? '';
  }
  updateBriefSetbackFields();
  if (!manuallyEditedBriefRooms) {
    $('briefRoomList').replaceChildren();
    for (const room of rooms) addBriefRoom(room);
    $('briefLayoutMode').value = rooms.length ? 'custom' : 'bedrooms';
    if (containsPositions) $('briefPlacement').value = 'coordinates';
    else if ($('briefPlacement').value === 'coordinates') $('briefPlacement').value = 'automatic';
    $('briefAddRoom').disabled = rooms.length >= 100;
    updateBriefLayoutMode();
  }
  briefConflicts = conflicts;
  clearBriefPlan();
  for (const key of Object.keys(briefFields)) {
    if (!manuallyEditedBriefFields.has(key)) briefField(key).value = data[key] ?? '';
  }
  renderBriefQuestions();
  const missing = missingBriefFields(readBriefFields());
  if (missing.some(key => conflicts.includes(key))) $('briefEvidence').open = true;
  const summary = missing.length ? 'راجع الحقول الظاهرة وأكمل البيانات المطلوبة.' : 'اكتملت بيانات المشروع الأولية. راجعها قبل الحفظ.';
  const incomplete = rooms.filter(room => !room.w || !room.h).length;
  const setbackSummary = setbacks && $('briefUseSetbacks').checked ? ' راجع الارتدادات في قسم المعاينة.' : '';
  const positionSummary = containsPositions && !manuallyEditedBriefRooms
    ? ' راجع الإحداثيات في قسم المعاينة وأكمل مواقع الفراغات الناقصة.' : '';
  $('briefStatus').textContent = summary + setbackSummary + positionSummary + (!rooms.length ? '' : manuallyEditedBriefRooms
    ? ' احتُفظ بقائمة الفراغات التي عدّلتها أو حفظتها.'
    : ' أُضيفت الفراغات المذكورة إلى المعاينة.' + (incomplete ? ' راجع الأبعاد الناقصة أو المتعارضة في ' + incomplete + ' من الفراغات.' : ''));
};
briefReview.oninput = event => {
  const key = event.target.name;
  if (!Object.hasOwn(briefFields, key)) return;
  manuallyEditedBriefFields.add(key);
  if (key === 'city') clearCitySuggestion();
  briefConflicts = briefConflicts.filter(item => item !== key);
  $('briefStatus').textContent = '';
  clearBriefPlan();
  renderBriefQuestions();
};
briefReview.onsubmit = event => {
  event.preventDefault();
  const fields = readBriefFields();
  for (const key of Object.keys(briefFields)) {
    if (briefField(key).value && !Object.hasOwn(fields, key)) {
      $('briefStatus').textContent = 'راجع القيمة في الحقل المحدد.';
      briefField(key).focus();
      return;
    }
  }
  commit();
  S.project.brief = { description: $('briefDescription').value.trim(), fields,
    rooms: cleanBriefRooms(briefCustomRooms()), setbacks: readBriefSetbacks(),
    positionRooms: $('briefPlacement').value === 'coordinates' };
  try {
    localStorage.setItem('hayyanarsum-v2', JSON.stringify(S));
    $('briefStatus').textContent = 'حُفظت المسودة في المشروع على هذا الجهاز.';
  } catch {
    $('briefStatus').textContent = 'تعذّر الحفظ المحلي. صدّر ملف JSON للاحتفاظ بالمسودة.';
  }
};

let briefPlan;
function clearBriefPlan() {
  briefPlan = undefined;
  $('insertBriefPlan').disabled = true;
  $('briefAppendPanel').hidden = true;
  $('briefAppendRooms').checked = false;
  $('exportBriefDxf').disabled = true;
  $('exportBriefIfc').disabled = true;
  $('exportBriefSchedule').disabled = true;
  $('refineBriefPositions').hidden = true;
  $('briefPlanPreview').hidden = true;
  $('briefPlanPreview').replaceChildren();
  $('briefModelPanel').hidden = true;
  $('briefModel').replaceChildren();
  $('briefPlanRooms').hidden = true;
  $('briefPlanRooms').replaceChildren();
  $('briefWallReview').hidden = true;
  $('briefWallReviewList').replaceChildren();
  $('briefWallReviewOmitted').textContent = '';
  $('briefPlanStatus').textContent = '';
}

function drawBriefPreview(plan) {
  const canvas = $('briefPlanPreview');
  canvas.replaceChildren();
  const scale = Math.min(640 / plan.frontage, 340 / plan.depth);
  const x = (720 - scale * plan.frontage) / 2;
  const y = (420 - scale * plan.depth) / 2;
  canvas.append(el('rect', { x, y, width: plan.frontage * scale, height: plan.depth * scale,
    fill: '#f8f6ef', stroke: '#47677b', 'stroke-width': 2 }));
  for (const room of plan.existingRooms) {
    const left = Math.max(0, room.x), top = Math.max(0, room.y);
    const w = Math.min(plan.frontage, room.x + room.w) - left;
    const h = Math.min(plan.depth, room.y + room.h) - top;
    if (w <= 0 || h <= 0) continue;
    const outline = el('rect', { x: x + left * scale, y: y + top * scale, width: w * scale,
      height: h * scale, fill: '#b8bcc34d', stroke: '#596171', 'stroke-dasharray': '5 3' });
    const title = el('title');
    title.textContent = 'فراغ قائم · ' + room.name;
    outline.append(title);
    canvas.append(outline);
  }
  for (const [index, room] of plan.rooms.entries()) {
    const left = x + room.x * scale, top = y + room.y * scale;
    const w = room.w * scale, h = room.h * scale;
    const wallOverlap = plan.wallReview.overlaps.has(index);
    const rectangle = el('rect', { x: left, y: top, width: w, height: h,
      fill: wallOverlap ? '#f3e0be' : '#dceee4', stroke: wallOverlap ? '#956a28' : '#0e5a40' });
    const title = el('title');
    title.textContent = room.name + ' · ' + thermalLabel(room.w) + ' × ' + thermalLabel(room.h) + ' م';
    rectangle.append(title);
    canvas.append(rectangle);
    if (Math.min(w, h) < 22) continue;
    const label = el('text', { x: left + w / 2, y: top + h / 2, 'text-anchor': 'middle',
      'dominant-baseline': 'middle', fill: '#073b2c', 'font-size': 13 });
    label.textContent = thermalLabel(index + 1);
    canvas.append(label);
  }
  for (const edge of plan.roomEdges ?? []) {
    canvas.append(el('line', { x1: x + edge.x * scale, y1: y + edge.y * scale,
      x2: x + edge.x2 * scale, y2: y + edge.y2 * scale, stroke: '#3e6f8c',
      'stroke-width': 2, 'stroke-dasharray': '4 2' }));
  }
  if (plan.envelope) {
    const { left, front, right, rear } = plan.envelope;
    canvas.append(el('rect', { x: x + left * scale, y: y + front * scale,
      width: (right - left) * scale, height: (rear - front) * scale,
      fill: 'none', stroke: '#956a28', 'stroke-width': 2, 'stroke-dasharray': '6 4' }));
  }
  canvas.setAttribute('aria-label', 'حد الأرض وتوزيع الفراغات بالمقياس النسبي' +
    (plan.envelope ? ' مع الحد المرجعي المتقطع' : '') +
    (plan.existingRooms.length ? ' والفراغات القائمة بالرمادي' : '') +
    (plan.wallReview.overlaps.size ? ' والفراغات ذات تداخل مع مسقط جدار بالذهبي' : ''));
  canvas.hidden = false;
  const legend = $('briefPlanRooms');
  legend.replaceChildren(...plan.rooms.map((room, index) => {
    const item = document.createElement('li');
    item.textContent = thermalLabel(index + 1) + ' · ' + room.name + ' · ' +
      thermalLabel(room.w) + ' × ' + thermalLabel(room.h) + ' م' +
      (validHeight(room.z) ? ' · الارتفاع ' + thermalLabel(room.z) + ' م' : '') +
      (plan.suggestedIndices?.includes(index)
        ? ' · إحداثيات مقترحة ' + thermalLabel(room.x) + ' × ' + thermalLabel(room.y) + ' م' : '');
    return item;
  }));
  legend.hidden = false;
  const { overlaps, omitted, examined } = plan.wallReview;
  const review = $('briefWallReviewList');
  review.replaceChildren(...Array.from(overlaps, ([index, { wall, area }]) => {
    const item = document.createElement('li');
    item.textContent = thermalLabel(index + 1) + ' · ' + plan.rooms[index].name +
      ' · ' + (wall.name || 'جدار') + ' · ' + thermalLabel(area) + ' م²';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'حدّد الجدار في الرسم';
    button.setAttribute('aria-label', 'حدّد الجدار «' + (wall.name || 'جدار') +
      '» المتداخل مع «' + plan.rooms[index].name + '» في الرسم');
    button.onclick = () => openBriefReviewWall(plan, wall);
    item.append(' ', button);
    return item;
  }));
  $('briefWallReview').hidden = !examined && !omitted;
  $('briefWallReviewOmitted').textContent = 'الجدران المفحوصة ' + thermalLabel(examined) + ' · تعذّر فحص ' +
    thermalLabel(omitted) + (examined && !overlaps.size ? ' · لم يظهر تداخل ضمن الجدران المفحوصة' : '');
  const solids = plan.rooms.filter(room => validHeight(room.z));
  $('briefModelPanel').hidden = solids.length === 0;
  $('briefModelNote').textContent = 'فراغات لها ارتفاع محدد: ' + thermalLabel(solids.length) +
    ' من ' + thermalLabel(plan.rooms.length) + '.';
  drawModelFaces($('briefModel'), roomProjection(solids, 35), null);
}

const briefFloorContents = () => ({ shapes: levelShapes(), measurements: levelMeasurements() });

function briefFloorMatches(plan) {
  const level = S.levels.find(item => item.id === S.activeLevel);
  return level?.id === plan.levelId && level.name === plan.level.name &&
    level.elevation === plan.level.elevation && plan.floorSnapshot === JSON.stringify(briefFloorContents());
}

function openBriefReviewWall(plan, wall) {
  if (plan !== briefPlan || !briefFloorMatches(plan)) {
    clearBriefPlan();
    const status = $('briefPlanStatus');
    status.textContent = 'تغيّر طابق الرسم أو محتواه. أعد المعاينة لتحديد الجدار.';
    status.focus();
    return;
  }
  fitDrawing = true;
  document.querySelector('[data-view="workspace"]').click();
  selectDrawingShape(wall);
  $('wallEditor').focus();
}

function updateBriefInsertButton() {
  $('insertBriefPlan').disabled = !briefPlan || Boolean(briefPlan.roomConflict) ||
    (briefPlan.occupied && !$('briefAppendRooms').checked);
}

$('briefAppendRooms').onchange = updateBriefInsertButton;
function updateBriefRoomFeedback(row) {
  const name = row.querySelector('[data-room="name"]').value.trim();
  const dimensions = [
    ['width', 'العرض'],
    ['depth', 'العمق'],
  ];
  const missing = dimensions.filter(([key]) => {
    const value = numericValue(row.querySelector('[data-room="' + key + '"]'));
    return !Number.isFinite(value) || value <= 0;
  }).map(([, label]) => label);
  if ($('briefPlacement').value === 'coordinates' && !$('briefFillPositions').checked) {
    for (const axis of ['x', 'y']) {
      if (!Number.isFinite(numericValue(row.querySelector('[data-room="' + axis + '"]')))) {
        missing.push('موضع ' + axis.toUpperCase());
      }
    }
  }
  row.querySelector('legend').textContent = name || 'فراغ جديد';
  const feedback = row.querySelector('[data-room-feedback]');
  feedback.hidden = missing.length === 0;
  feedback.textContent = missing.length ? 'أدخل ' + missing.join(' و') + ' بالمتر قبل المعاينة.' : '';
}

function addBriefRoom(room = {}) {
  const list = $('briefRoomList');
  if (list.children.length >= 100) return;
  const row = document.createElement('fieldset');
  row.className = 'review-fields';
  row.innerHTML = '<legend>فراغ</legend><div class="two"><label>اسم الفراغ<input data-room="name" maxlength="160" required></label>' +
    '<label>الاستخدام<select data-room="use"><option value="">غير محدد</option></select></label></div>' +
    '<div class="two"><label>العرض (م)<input data-room="width" data-number inputmode="decimal" data-min="0" data-max="1000000" data-step="any" required></label>' +
    '<label>العمق (م)<input data-room="depth" data-number inputmode="decimal" data-min="0" data-max="1000000" data-step="any" required></label></div>' +
    '<label>الارتفاع للعرض الثلاثي (م، اختياري)<input data-room="z" data-number inputmode="decimal" data-min="0.01" data-max="1000" data-step="any"></label>' +
    '<div class="two" data-room-placement hidden>' +
    '<label>موضع X (م)<input data-room="x" data-number inputmode="decimal" data-min="0" data-max="1000000" data-step="any" required disabled></label>' +
    '<label>موضع Y (م)<input data-room="y" data-number inputmode="decimal" data-min="0" data-max="1000000" data-step="any" required disabled></label></div>' +
    '<p data-room-feedback class="muted" hidden></p><button type="button">إزالة الفراغ</button>';
  const use = row.querySelector('select');
  for (const [value, option] of Object.entries(residentialSpaceRules)) use.add(new Option(option.label, value));
  row.querySelector('[data-room="name"]').value = room.name ?? '';
  use.value = room.roomUse ?? '';
  row.querySelector('[data-room="width"]').value = room.w ?? '';
  row.querySelector('[data-room="depth"]').value = room.h ?? '';
  row.querySelector('[data-room="z"]').value = room.z ?? '';
  if (room.z === null) row.querySelector('[data-room="z"]').placeholder = 'راجع الارتفاع المذكور في الوصف';
  row.querySelector('[data-room="x"]').value = room.x ?? '';
  row.querySelector('[data-room="y"]').value = room.y ?? '';
  updateBriefRoomPosition(row, $('briefPlacement').value === 'coordinates');
  row.querySelector('button').onclick = () => {
    row.remove();
    manuallyEditedBriefRooms = true;
    $('briefAddRoom').disabled = false;
    clearBriefPlan();
  };
  list.append(row);
  $('briefAddRoom').disabled = list.children.length >= 100;
  clearBriefPlan();
}

function briefCustomRooms() {
  return [...$('briefRoomList').children].map(row => {
    const field = name => row.querySelector('[data-room="' + name + '"]');
    const coordinate = axis => field(axis).value.trim() ? numericValue(field(axis)) : null;
    return { name: field('name').value, roomUse: field('use').value,
      w: numericValue(field('width')), h: numericValue(field('depth')),
      x: coordinate('x'), y: coordinate('y'), z: numericValue(field('z')) };
  });
}

$('briefAddRoom').onclick = () => { manuallyEditedBriefRooms = true; addBriefRoom(); };
function updateBriefLayoutMode() {
  const custom = $('briefLayoutMode').value === 'custom';
  $('briefBedroomFields').hidden = $('briefBedroomFields').disabled = custom;
  $('briefCustomFields').hidden = $('briefCustomFields').disabled = !custom;
  $('briefPositionOption').hidden = $('briefPositionOption').disabled = !custom;
  if (!custom && $('briefPlacement').value === 'coordinates') $('briefPlacement').value = 'automatic';
  if (custom && !$('briefRoomList').children.length) addBriefRoom();
  updateBriefPlacement();
}
function readBriefSetbacks() {
  if (!$('briefUseSetbacks').checked) return null;
  return cleanSetbacks(Object.fromEntries(setbackSides.map(side => [side, numberField('briefSetback-' + side)])));
}
function updateBriefSetbackFields() {
  const setbacks = readBriefSetbacks();
  $('briefSetbackFields').hidden = $('briefSetbackFields').disabled = !setbacks;
  const missing = setbacks ? ['front', 'rear', 'left', 'right'].filter(side => setbacks[side] === null) : [];
  $('briefSetbackQuestions').replaceChildren(...missing.map(side => {
    const item = document.createElement('li');
    const prefix = setbackConflicts.includes(side) ? 'ذُكرت قيم متعارضة. ' :
      invalidSetbacks.includes(side) ? 'تعذّر قراءة القيمة بالمتر. ' : '';
    item.textContent = prefix + 'كم يبلغ الارتداد ' + setbackLabels[side] + ' بالمتر؟';
    return item;
  }));
}
$('briefUseSetbacks').onchange = () => {
  manualSetbackChoice = true;
  updateBriefSetbackFields();
  clearBriefPlan();
};
$('briefLayoutMode').onchange = updateBriefLayoutMode;
function updateBriefRoomPosition(row, active) {
  const fields = row.querySelector('[data-room-placement]');
  fields.hidden = !active;
  for (const input of fields.querySelectorAll('input')) {
    input.disabled = !active;
    input.required = active && !$('briefFillPositions').checked;
  }
  updateBriefRoomFeedback(row);
}
function updateBriefPlacement() {
  const mode = $('briefPlacement').value;
  $('briefManualPlacement').hidden = $('briefManualPlacement').disabled = mode !== 'manual';
  $('briefPositionHelp').hidden = mode !== 'coordinates';
  $('briefFillPositionsLabel').hidden = $('briefFillPositions').disabled = mode !== 'coordinates';
  for (const row of $('briefRoomList').children) updateBriefRoomPosition(row, mode === 'coordinates');
  clearBriefPlan();
}
$('briefPlacement').onchange = updateBriefPlacement;
$('briefFillPositions').onchange = updateBriefPlacement;
$('briefLayoutForm').oninput = event => {
  if (event.target.matches('[data-room]')) {
    manuallyEditedBriefRooms = true;
    updateBriefRoomFeedback(event.target.closest('fieldset'));
  }
  const side = event.target.dataset.setbackSide;
  if (side) {
    manuallyEditedSetbacks.add(side);
    manualSetbackChoice = true;
    setbackConflicts = setbackConflicts.filter(key => key !== side);
    invalidSetbacks = invalidSetbacks.filter(key => key !== side);
    updateBriefSetbackFields();
  }
  clearBriefPlan();
};
$('briefLayoutForm').onsubmit = event => {
  event.preventDefault();
  clearBriefPlan();
  const brief = readBriefFields();
  const layout = {
    automatic: $('briefPlacement').value === 'automatic',
    coordinates: $('briefPlacement').value === 'coordinates',
    fillMissing: $('briefFillPositions').checked,
    columns: numberField('briefLayoutColumns'), x: numberField('briefLayoutX'), y: numberField('briefLayoutY'),
    setbacks: readBriefSetbacks(),
  };
  const floor = briefFloorContents();
  const plan = $('briefLayoutMode').value === 'custom'
    ? customRoomBlockPlan(brief, layout, briefCustomRooms(), floor.shapes)
    : bedroomBlockPlan(brief, {
      ...layout, count: numberField('briefLayoutCount'),
      width: numberField('briefLayoutWidth'), roomDepth: numberField('briefLayoutDepth'),
    });
  const status = $('briefPlanStatus');
  if (plan.error) {
    if (plan.names && ['outside', 'outside-setbacks'].includes(plan.error)) {
      status.textContent = (plan.error === 'outside-setbacks' ? 'يتجاوز الفراغ حدود الارتدادات: ' :
        'يتجاوز الفراغ حدود الأرض: ') + plan.names[0];
      return;
    }
    status.textContent = {
      brief: 'أكمل عرض الأرض وعمقها. في وضع غرف النوم المتماثلة، أدخل أيضًا عدد غرف النوم في المشروع.',
      'bedroom-count': 'أدخل إجمالي غرف النوم في بيانات المشروع بحيث يشمل غرف هذا الطابق.',
      'partial-fit': 'تعذّر إيجاد موضع للفراغ «' + plan.names?.[0] + '» ضمن الحدود مع مراعاة الفراغات القائمة والإحداثيات المثبتة. عدّل الترتيب أو المواقع.',
      coordinates: 'تحقّق من إحداثيات الفراغ: ' + plan.names?.[0],
      'room-overlap': 'يتداخل الفراغان «' + plan.names?.[0] + '» و«' + plan.names?.[1] + '». عدّل موقع أحدهما.',
      layout: (layout.automatic || layout.coordinates) ? 'تحقق من أسماء الفراغات وأبعادها.' : 'تحقق من أسماء الفراغات وأبعادها والإزاحة وعدد الفراغات في الصف.',
      'auto-fit': 'تعذر ترتيب الفراغات بهذه الأبعاد وبهذا الترتيب ضمن الحدود المتاحة. راجع الأبعاد أو ترتيب الفراغات.',
      setbacks: 'أدخل قيمة صالحة لكل جهة من جهات الارتداد الأربع.',
      'setback-size': 'الارتدادات المدخلة لا تترك مساحة للتوزيع. راجع أبعاد الأرض والقيم المدخلة.',
      'outside-setbacks': 'يتجاوز التوزيع الحدود المرجعية. عدّل أبعاد الفراغات أو عددها في الصف أو إزاحة أول فراغ.',
      outside: 'يتجاوز التوزيع حدود الأرض. عدّل الأبعاد أو عدد الفراغات في الصف أو الإزاحة.',
    }[plan.error];
    return;
  }
  const level = elementLevel({ levelId: S.activeLevel }, S.levels);
  const occupied = floor.shapes.length > 0 || floor.measurements.length > 0;
  const roomConflict = briefRoomConflict(plan.rooms, floor.shapes);
  briefPlan = { ...plan, levelId: level.id, level: { ...level }, occupied, roomConflict,
    existingRooms: floor.shapes.filter(shape => shape.type === 'room'),
    wallReview: roomWallFootprintReview(plan.rooms, floor.shapes),
    floorSnapshot: JSON.stringify(floor),
    rooms: plan.rooms.map(room => ({ ...room, id: crypto.randomUUID() })),
    roomEdges: $('briefUseRoomEdges').checked ? briefRoomEdges(plan.rooms) : undefined };
  drawBriefPreview(briefPlan);
  $('briefAppendPanel').hidden = !occupied || Boolean(roomConflict);
  $('insertBriefPlan').textContent = occupied ? 'إضافة الفراغات إلى الطابق الحالي' : 'إضافة التوزيع إلى طابق الرسم';
  updateBriefInsertButton();
  $('exportBriefDxf').disabled = false;
  $('exportBriefIfc').disabled = !briefPlan.rooms.some(isIfcSpace);
  $('exportBriefSchedule').disabled = false;
  if (plan.suggestedIndices?.length) {
    $('refineBriefPositions').textContent = 'انقل الإحداثيات المقترحة للتعديل';
    $('refineBriefPositions').hidden = false;
  } else if ($('briefLayoutMode').value === 'custom' && !layout.coordinates) {
    const refine = $('refineBriefPositions');
    const existing = Array.from($('briefRoomList').querySelectorAll('[data-room-placement] input'))
      .some(field => field.value.trim());
    refine.textContent = existing ? 'استبدل الإحداثيات بمواقع المعاينة' : 'عدّل مواقع الفراغات المقترحة';
    refine.hidden = false;
  }
  status.textContent = 'الأرض ' + thermalLabel(plan.frontage) + ' × ' + thermalLabel(plan.depth) + ' م · ' +
    thermalLabel(plan.rooms.length) + ' فراغات · مجموع مساحة الفراغات ' +
    thermalLabel(totalArea(plan.rooms)) + ' م². ' +
    (briefPlan.roomEdges ? 'خطوط حدود الفراغات المرجعية ' + thermalLabel(briefPlan.roomEdges.length) + '. ' : '') +
    (layout.automatic ? 'الحد الأقصى للفراغات في الصف المقترح ' + thermalLabel(plan.columns) + '. ' : '') +
    (plan.envelope ? 'المساحة داخل الحدود المرجعية ' +
      thermalLabel((plan.envelope.right - plan.envelope.left) * (plan.envelope.rear - plan.envelope.front)) + ' م². ' : '') +
    'طابق الرسم ' + level.name + '. ' +
    (occupied && briefPlan.existingRooms.length ? 'الفراغات القائمة داخل الأرض تظهر بالرمادي. ' : '') +
    (roomConflict ? 'يتداخل الفراغ المقترح «' + roomConflict.proposed +
      '» مع الفراغ القائم «' + roomConflict.existing + '». عدّل الموقع ثم أعد المعاينة.' : '');
};
$('refineBriefPositions').onclick = () => {
  if (!briefPlan || $('briefLayoutMode').value !== 'custom') return;
  const partial = $('briefPlacement').value === 'coordinates';
  if (partial && !briefPlan.suggestedIndices?.length) return;
  const rows = [...$('briefRoomList').children];
  if (rows.length !== briefPlan.rooms.length) {
    clearBriefPlan();
    $('briefPlanStatus').textContent = 'تغيّرت قائمة الفراغات. أعد المعاينة.';
    return;
  }
  rows.forEach((row, index) => {
    const { x, y } = briefPlan.rooms[index];
    for (const [axis, value] of Object.entries({ x, y })) {
      const field = row.querySelector('[data-room="' + axis + '"]');
      if (!partial || !field.value.trim()) field.value = value;
    }
  });
  manuallyEditedBriefRooms = true;
  $('briefFillPositions').checked = false;
  $('briefPlacement').value = 'coordinates';
  updateBriefPlacement();
  $('briefPlanStatus').textContent = 'نُقلت المواقع كما ظهرت في المعاينة. عدّل الإحداثيات ثم أعد المعاينة قبل الإدراج أو التنزيل.';
  rows[0].querySelector('[data-room="x"]').focus();
};
$('exportBriefDxf').onclick = () => {
  if (!briefPlan) return;
  try {
    dl('hayyanarsum-layout-preview.dxf', briefPreviewDxf(briefPlan), 'application/dxf');
  } catch {
    $('briefPlanStatus').textContent = 'تعذّر تصدير المعاينة. راجع الأبعاد وأعد المعاينة.';
  }
};
$('exportBriefSchedule').onclick = () => {
  if (!briefPlan) return;
  const { name: level, elevation } = briefPlan.level;
  const rows = [
    ['رقم المعاينة', 'الفراغ', 'الاستخدام', 'الطابق', 'المنسوب (م)', 'X (م)', 'Y (م)',
      'العرض (م)', 'العمق (م)', 'الارتفاع (م)', 'المساحة الهندسية (م²)', 'الحجم الهندسي (م³)'],
    ...briefRoomSchedule(briefPlan).map(room => [room.number, room.name,
      residentialSpaceRules[room.roomUse]?.label ?? '', level, elevation, room.x, room.y,
      room.width, room.depth, room.height ?? '', room.areaM2, room.volumeM3 ?? '']),
  ];
  dl('hayyanarsum-layout-preview-rooms.csv',
    '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
};
$('exportBriefWallReview').onclick = () => {
  if (!briefPlan || (!briefPlan.wallReview.examined && !briefPlan.wallReview.omitted)) return;
  if (!briefFloorMatches(briefPlan)) {
    clearBriefPlan();
    $('briefPlanStatus').textContent = 'تغيّر طابق الرسم أو محتواه. أعد المعاينة لتنزيل تقرير الجدران.';
    return;
  }
  const rows = [
    ['رقم المعاينة', 'الفراغ', 'الطابق', 'المنسوب (م)', 'نتيجة المراجعة', 'الجدار صاحب أكبر تداخل',
      'معرّف الجدار', 'مساحة التداخل (م²)', 'الجدران المفحوصة', 'الجدران التي تعذّر فحصها', 'نطاق المراجعة'],
    ...roomWallReviewRows(briefPlan),
  ];
  dl('hayyanarsum-layout-wall-review.csv',
    '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
};
$('exportBriefIfc').onclick = () => {
  if (!briefPlan) return;
  const level = elementLevel(briefPlan, S.levels);
  const status = $('briefPlanStatus');
  if (!level || level.id !== S.activeLevel || level.name !== briefPlan.level.name ||
      level.elevation !== briefPlan.level.elevation) {
    clearBriefPlan();
    status.textContent = 'تغيّر طابق المعاينة أو منسوبه. أعد المعاينة قبل التصدير.';
    return;
  }
  try {
    const title = (S.project.name || 'هيا نرسم') + ' · معاينة التوزيع';
    dl('hayyanarsum-layout-preview.ifc', exportBriefIfc(briefPlan, title, level), 'application/x-step');
    const count = briefPlan.rooms.filter(isIfcSpace).length;
    status.textContent = 'جُهّز ملف IFC4 لعدد ' + thermalLabel(count) + ' من الفراغات ذات الارتفاع المحدد.';
  } catch {
    status.textContent = 'تعذّر تصدير المعاينة بصيغة IFC. راجع أبعاد الفراغات وطابقها.';
  }
};
$('insertBriefPlan').onclick = () => {
  if (!briefPlan || !briefFloorMatches(briefPlan)) {
    clearBriefPlan();
    $('briefPlanStatus').textContent = 'تغيّر طابق الرسم أو محتواه. أعد المعاينة.';
    return;
  }
  if ($('insertBriefPlan').disabled ||
      (briefPlan.occupied && !$('briefAppendRooms').checked)) return;
  const { occupied, rooms, references, roomEdges } = briefPlan;
  const shapes = occupied ? rooms : [...references, ...rooms, ...(roomEdges ?? [])];
  if (S.shapes.length + shapes.length > 5000 || !shapes.every(valid)) {
    $('briefPlanStatus').textContent = 'تعذّر إدراج التوزيع. تحقق من الأبعاد وحدّ عناصر المشروع.';
    return;
  }
  commit();
  S.shapes.push(...shapes.map(shape => ({ ...shape, id: shape.id ?? crypto.randomUUID(), levelId: S.activeLevel })));
  clearBriefPlan();
  fitDrawing = true;
  selectShape(null);
  document.querySelector('[data-view="workspace"]').click();
  $('mode').textContent = occupied ? 'أُضيفت الفراغات إلى الرسم الحالي.' : 'أُضيفت حدود الأرض والفراغات القابلة للتعديل.';
};

function readProject(data) {
  if (data?.schema !== 2 || !Array.isArray(data.shapes) || data.shapes.length > 5000) throw new TypeError('Invalid project');
  const levels = validateLevels(data.levels);
  const identifiers = new Set();
  const shapes = data.shapes.map(shape => {
    if (!valid(shape) || typeof shape.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(shape.id) ||
        identifiers.has(shape.id) || shape.id in Object.prototype || !Object.hasOwn(C, shape.layer) || typeof shape.name !== 'string') {
      throw new TypeError('Invalid project element');
    }
    identifiers.add(shape.id);
    const level = elementLevel(shape, levels);
    if (!level) throw new TypeError('Unknown element storey');
    const levelId = level.id;
    const thermalId = typeof shape.thermalId === 'string' ? shape.thermalId.slice(0, 80) : '';
    const { id, type, name, layer, x, y, w, h, z, x2, y2, thickness, openings, cutouts } = shape;
    if (type === 'cadLine') {
      const cadLayer = typeof shape.cadLayer === 'string' ? shape.cadLayer.slice(0, 160) : '0';
      return { id, type, name: name.slice(0, 160), layer: 'CAD-REF', cadLayer, levelId, x, y, x2, y2 };
    }
    return type !== 'wall' ? { id, type, name: name.slice(0, 160), layer, levelId, x, y, w, h, z, thermalId,
      ...(type === 'room' ? residentialRoomMetadata(shape.roomUse, shape.clearRoom) : {}),
      cutouts: type === 'slab' ? cutouts?.map(cut => ({ x: cut.x, y: cut.y, w: cut.w, h: cut.h, name: cut.name.trim().slice(0, 120) })) : undefined }
      : { id, type, name: name.slice(0, 160), layer, levelId, x, y, x2, y2, z, thickness, thermalId,
          openings: openings?.map(opening => {
            const { kind, offset, width, sill, height } = opening;
            const thermal = evaluateEnvelopeOpening(opening);
            return { kind, offset, width, sill, height,
              ...(thermal ? { thermalU: thermal.transmittance, thermalRef: thermal.reference.slice(0, 180) } : {}) };
          }) };
  });
  const project = {};
  project.saudi = cleanSaudiInputs(data.project?.saudi);
  project.thermal = cleanThermalAssemblies(data.project?.thermal);
  const brief = data.project?.brief;
  if (brief && typeof brief === 'object') {
    project.brief = {
      description: typeof brief.description === 'string' ? brief.description.slice(0, 4000) : '',
      fields: cleanBrief(brief.fields),
      rooms: cleanBriefRooms(brief.rooms),
      positionRooms: brief.positionRooms === true,
      setbacks: cleanSetbacks(brief.setbacks),
    };
  }
  project.transmission = cleanTransmissionScenario(data.project?.transmission);
  for (const key of ['name','city','revision','description']) {
    if (typeof data.project?.[key] === 'string') project[key] = data.project[key].slice(0, 4000);
  }
  const prices = Object.create(null);
  for (const shape of shapes) {
    const price = data.prices?.[shape.id];
    if (Number.isFinite(price) && price >= 0 && price <= 1e12) prices[shape.id] = price;
  }
  const activeLevel = levels.some(level => level.id === data.activeLevel) ? data.activeLevel : levels[0].id;
  return { schema: 2, project, shapes, measurements: cleanMeasurements(data.measurements, levels), prices, levels, activeLevel, selected: null, tool: 'select' };
}
function loadProjectFields() {
  loadBriefForm();
  for (const [id, key] of [['projectName','name'], ['projectCity','city'], ['revision','revision'], ['description','description']]) {
    $(id).value = S.project[key] ?? $(id).defaultValue;
  }
  document.querySelectorAll('[data-tool]').forEach(button => button.classList.toggle('active', button.dataset.tool === S.tool));
  loadSaudiFields();
  loadThermalForm(thermalList()[0]?.id);
  loadTransmissionForm();
}
function loadSaudiFields() {
  const saved = cleanSaudiInputs(S.project.saudi);
  $('siteCity').value = S.project.city ?? '';
  for (const id of [...saudiTextFields, ...saudiNumberFields]) $(id).value = saved[id] ?? '';
  $('siteEdges').replaceChildren();
  for (const edge of saved.edges) addSiteEdge(edge);
  updateReviewInputs();
  runChecks();
}
function updateIfcExport() {
  const count = S.shapes.filter(shape => isIfcWall(shape) || isIfcSlab(shape) || isIfcSpace(shape)).length;
  $('exportIFC').disabled = count === 0;
  $('ifcStatus').textContent = count
    ? 'عناصر الجدران والبلاطات والفراغات المشمولة بالتصدير: ' + count + '.'
    : 'أضف بلاطة، أو أدخل أبعاد جدار، أو حدّد ارتفاع فراغ لتفعيل التصدير.';
}
$('exportIFC').onclick = () => {
  try {
    dl('hayyanarsum.ifc', exportIfc(S.shapes, S.project.name, S.levels, thermalList()), 'application/x-step');
    $('ifcStatus').textContent = 'جُهّز ملف IFC4 لعناصر المبنى.';
  } catch {
    $('ifcStatus').textContent = 'تعذّر إنشاء ملف IFC. تحقق من أبعاد عناصر النموذج وطوابقها.';
  }
};
try {
  const saved = JSON.parse(localStorage.getItem('hayyanarsum-v2'));
  if (saved) S = readProject(saved);
} catch {
  $('mode').textContent = 'تعذّرت قراءة النسخة المحلية المحفوظة.';
}
function render3d() {
  if ($('preview3d').hidden) return;
  const walls = S.shapes.filter(shape => shape.type === 'wall' && validHeight(shape.z));
  const slabs = S.shapes.filter(isIfcSlab);
  const shaped = walls.length || slabs.length ? [...walls, ...slabs] : S.shapes.filter(shape => shape.type === 'room' && validHeight(shape.z));
  const faces = roomProjection(shaped, Number($('azimuth').value), S.levels);
  $('modelNote').textContent = walls.length || slabs.length
    ? 'الجدران: ' + walls.length + ' · البلاطات: ' + slabs.length
    : shaped.length ? 'المساحات المجسّمة: ' + shaped.length
      : 'أدخل ارتفاع المساحة أو حدّد جدارًا وأدخل سماكته وارتفاعه.';
  drawModelFaces($('model3d'), faces, S.selected);
}
function drawModelFaces(canvas, faces, selected) {
  canvas.replaceChildren();
  if (!faces.length) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const face of faces) for (const point of face.points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const scale = Math.min(656 / (maxX - minX), 316 / (maxY - minY));
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  for (const face of faces) {
    const points = face.points.map(point =>
      [360 + (point.x - centerX) * scale, 190 + (point.y - centerY) * scale].join(',')).join(' ');
    const color = C[face.layer];
    canvas.append(el('polygon', { points, fill: color, 'fill-opacity': face.kind === 'top' ? .72 : .92,
      stroke: face.id === selected ? '#d2ab63' : '#233c32', 'stroke-width': face.id === selected ? 2 : 1 }));
  }
}
$('toggle3d').onclick = () => {
  const panel = $('preview3d');
  panel.hidden = !panel.hidden;
  $('toggle3d').setAttribute('aria-expanded', String(!panel.hidden));
  $('toggle3d').textContent = panel.hidden ? 'معاينة 3D' : 'إخفاء معاينة 3D';
  render3d();
};
$('azimuth').oninput = render3d;
loadProjectFields();
render();
