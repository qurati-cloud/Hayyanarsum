import { exportIfc, isIfcSlab, isIfcWall } from './ifc.js';
import { wallVolumeSummary } from './wall-volume.js';
import{snap,area,slabArea,slabVolume,length,totalArea,valid,validHeight,wallFootprint,wallSpans,wallQuantities,roomProjection,groundLevel,validateLevels,elementLevel,compliance,dxf}from'./engine.js';const $=x=>document.getElementById(x),NS='http://www.w3.org/2000/svg',PX=40,C={'A-WALL':'#0e5a40','S-COLS':'#a8792a','S-SLAB':'#91754a','E-POWR':'#d8831d','M-HVAC':'#3486a7','P-WATR':'#326ad1'};let S={schema:2,levels:[groundLevel],activeLevel:'ground',project:{},shapes:[],prices:{},selected:null,tool:'select'},past=[],next=[],start=null;
const esc=x=>String(x).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])),el=(n,a={})=>{const e=document.createElementNS(NS,n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v));return e},commit=()=>{past.push(JSON.stringify(S));if(past.length>60)past.shift();next=[]};
function dimension(s){const g=$('dims'),t=el('text',{x:(s.type!=='wall'?s.x+s.w/2:(s.x+s.x2)/2)*PX,y:(s.type!=='wall'?s.y:(s.y+s.y2)/2)*PX-8,'text-anchor':'middle',class:'dim'});t.textContent=(s.type!=='wall'?s.w:length(s)).toFixed(2)+' m';g.append(t)}
function render(){const visibleShapes = S.shapes.filter(shape => elementLevel(shape, S.levels)?.id === S.activeLevel);const g=$('shapes');g.replaceChildren();$('dims').replaceChildren();for(const s of visibleShapes){if(s.type==='wall'&&s.thickness!=null){drawWall(g,s);dimension(s);continue}const e=s.type!=='wall'?el('rect',{x:s.x*PX,y:s.y*PX,width:s.w*PX,height:s.h*PX,fill:C[s.layer]+'18',stroke:C[s.layer],'stroke-width':2,class:'shape'+(s.id===S.selected?' selected':'')}):el('line',{x1:s.x*PX,y1:s.y*PX,x2:s.x2*PX,y2:s.y2*PX,stroke:C[s.layer],'stroke-width':6,class:'shape'+(s.id===S.selected?' selected':'')});e.dataset.id=s.id;g.append(e);dimension(s)}$('count').childNodes[0].nodeValue=S.shapes.length;$('area').childNodes[0].nodeValue=totalArea(S.shapes).toFixed(2);$('selected').textContent=S.selected?'عنصر محدد':'لا يوجد تحديد';$('objects').innerHTML=visibleShapes.map(s=>`<div class="object ${s.id===S.selected?'active':''}" data-id="${s.id}"><b>${esc(s.name)}</b><br>${quantityFor(s).toFixed(2)+' '+(s.type==='wall'?'م':'م²')}</div>`).join('')||'<p>لا توجد عناصر.</p>';$('layers').innerHTML=Object.keys(C).map(l=>`<div class="layer"><i style="background:${C[l]}"></i>${l} · ${visibleShapes.filter(s=>s.layer===l).length}</div>`).join('');$('editRoom').disabled = !S.shapes.some(shape => shape.id === S.selected && shape.type !== 'wall'); syncRectangleEditor(); boq(); render3d(); renderWallEditor(); updateIfcExport();renderLevels()}
const levelShapes = () => S.shapes.filter(shape => elementLevel(shape, S.levels)?.id === S.activeLevel);
const itemLabel = shape => S.levels.length === 1 ? shape.name : shape.name + ' · ' + elementLevel(shape, S.levels)?.name;
const quantityFor = shape => shape.type === 'wall' ? length(shape) : shape.type === 'slab' ? slabArea(shape) : area(shape);
function boq(){$('boq').innerHTML=S.shapes.map(s=>{const q=quantityFor(s),r=Number(S.prices[s.id]||0);return`<tr><td>${esc(itemLabel(s))}</td><td>${s.layer}</td><td>${q.toFixed(2)}</td><td>${s.type==='wall'?'م ط':(s.type==='slab'?'م² · '+slabVolume(s).toFixed(3)+' م³':'م²')}</td><td><input class="rate" data-id="${s.id}" type="number" min="0" value="${r}"></td><td>${(q*r).toLocaleString('ar-SA')}</td></tr>`}).join('')||'<tr><td colspan="6">أضف عناصر ليظهر الحصر.</td></tr>';$('total').textContent=S.shapes.reduce((n,s)=>n+quantityFor(s)*Number(S.prices[s.id]||0),0).toLocaleString('ar-SA')+' ر.س'}
function addRectangle(type, x, y, w = numberField('shapeW'), h = numberField('shapeH'), name = $('shapeName').value) {
  const heightInput = $(type === 'slab' ? 'slabThickness' : 'roomZ').value;
  const z = heightInput === '' ? null : Number(heightInput);
  const shape = { id: crypto.randomUUID(), type, name: name.trim().slice(0, 160) || (type === 'slab' ? 'بلاطة' : 'مساحة'),
    x, y, w, h, z, levelId: S.activeLevel, layer: type === 'slab' ? 'S-SLAB' : $('layer').value };
  if (!valid(shape)) {
    $('mode').textContent = type === 'slab' ? 'أدخل سماكة وأبعادًا صالحة للبلاطة.' : 'أدخل أبعادًا موجبة وصالحة.';
    return false;
  }
  commit();
  S.shapes.push(shape);
  selectShape(shape.id);
  return true;
}
function pt(e){const r=$('svg').getBoundingClientRect();return{x:snap((e.clientX-r.left)*1200/r.width/PX),y:snap((e.clientY-r.top)*700/r.height/PX)}}
$('svg').onpointerdown=e=>{if(S.tool==='select'){selectShape(e.target.dataset.id || null)}else start=pt(e)};$('svg').onpointermove=e=>{const p=pt(e);$('cursor').textContent=`X ${p.x.toFixed(2)} · Y ${p.y.toFixed(2)}`;if(!start)return;const q=$('preview');q.replaceChildren();q.append(['room','slab'].includes(S.tool)?el('rect',{x:Math.min(start.x,p.x)*PX,y:Math.min(start.y,p.y)*PX,width:Math.abs(p.x-start.x)*PX,height:Math.abs(p.y-start.y)*PX,fill:'#c39a4a22',stroke:'#c39a4a'}):el('line',{x1:start.x*PX,y1:start.y*PX,x2:p.x*PX,y2:p.y*PX,stroke:'#c39a4a','stroke-width':3}))};$('svg').onpointerup=e=>{if(!start)return;const a=start,p=pt(e);start=null;$('preview').replaceChildren();if(['room','slab'].includes(S.tool)&&a.x!==p.x&&a.y!==p.y)addRoom(Math.min(a.x,p.x),Math.min(a.y,p.y),Math.abs(a.x-p.x),Math.abs(a.y-p.y));else if(S.tool==='wall'&&(a.x!==p.x||a.y!==p.y)){commit();const wall={id:crypto.randomUUID(),type:'wall',levelId:S.activeLevel,name:'جدار',x:a.x,y:a.y,x2:p.x,y2:p.y,layer:$('layer').value};S.shapes.push(wall);selectShape(wall.id)}else if(S.tool==='measure')$('mode').textContent='القياس: '+Math.hypot(p.x-a.x,p.y-a.y).toFixed(2)+' م'};
document.onclick=e=>{const t=e.target.closest('[data-tool]');if(t){S.tool=t.dataset.tool;document.querySelectorAll('[data-tool]').forEach(x=>x.classList.toggle('active',x===t));syncRectangleEditor();$('mode').textContent='وضع '+t.textContent.trim()}const o=e.target.closest('.object');if(o){selectShape(o.dataset.id)}const v=e.target.closest('[data-view]');if(v){document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===v));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===v.dataset.view))}};
function selectShape(id) {
  S.selected = id;
  const shape = S.shapes.find(item => item.id === id);
  if (shape) {
    $('shapeName').value = shape.name;
    $('layer').value = shape.layer;
    if (shape.type !== 'wall') {
      $('shapeW').value = shape.w;
      $('shapeH').value = shape.h;
      if (shape.type === 'slab') {
        $('slabX').value = shape.x;
        $('slabY').value = shape.y;
        $('slabThickness').value = shape.z;
      } else {
        $('roomZ').value = shape.z ?? '';
      }
    }
  }
  render();
}

function syncRectangleEditor() {
  const selected = S.shapes.find(shape => shape.id === S.selected);
  $('slabFields').hidden = S.tool !== 'slab' && selected?.type !== 'slab';
  $('editRoom').textContent = selected?.type === 'slab' ? 'تحديث البلاطة المحددة' : 'تحديث المساحة المحددة';
  $('insert').textContent = S.tool === 'slab' ? 'إدراج البلاطة بالأبعاد' : 'إدراج المساحة بالأبعاد';
}
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
  $('levelRemove').disabled = S.levels.length < 2 || levelShapes().length > 0;
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
  if (S.levels.length < 2 || levelShapes().length) return;
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
const numberField = id => $(id).value === '' ? NaN : Number($(id).value);
const selectedWall = () => S.shapes.find(shape => shape.id === S.selected && shape.type === 'wall');
const openingLabel = kind => kind === 'door' ? 'باب' : 'نافذة';

function drawWall(group, wall) {
  for (const { start, end, opening } of wallSpans(wall)) {
    const points = wallFootprint(wall, start, end).map(point => point.map(value => value * PX).join(',')).join(' ');
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
  $('openingRemove').disabled = !opening;
  configureOpeningSill();
}

function configureOpeningSill() {
  const isDoor = $('openingKind').value === 'door';
  $('openingSill').disabled = isDoor;
  if (isDoor) $('openingSill').value = 0;
}

function renderWallEditor() {
  const wall = selectedWall();
  $('wallEditor').hidden = !wall;
  if (wall) {
    for (const [key, id] of Object.entries(wallFields)) $(id).value = wall[key] ?? '';
    $('openingPanel').hidden = wall.thickness == null;
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
  const wall = selectedWall();
  if (!wall) return;
  const values = Object.fromEntries(Object.entries(wallFields).map(([key, id]) => [key, numberField(id)]));
  saveWall({ ...wall, ...values, name: $('shapeName').value.trim().slice(0, 160) || 'جدار',
    layer: $('layer').value, openings: wall.openings ?? [] }, 'حُدّث الجدار.');
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
  openings[index] = { ...values, kind: $('openingKind').value };
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
  const current = S.shapes.find(shape => shape.id === S.selected && shape.type !== 'wall');
  if (!current) return;
  const updated = { ...current, name: $('shapeName').value.slice(0, 160) || 'مساحة',
    w: Number($('shapeW').value), h: Number($('shapeH').value),
    z: $('roomZ').value === '' ? null : Number($('roomZ').value), layer: $('layer').value };
  if (current.type === 'slab') {
    Object.assign(updated, { x: numberField('slabX'), y: numberField('slabY'), z: numberField('slabThickness'),
      layer: 'S-SLAB', name: $('shapeName').value.trim().slice(0, 160) || 'بلاطة' });
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
$('insert').onclick=()=>S.tool==='slab'?addRectangle('slab',numberField('slabX'),numberField('slabY')):addRectangle('room',2,2);$('remove').onclick=()=>{if(!S.selected)return;commit();S.shapes=S.shapes.filter(x=>x.id!==S.selected);S.selected=null;render()};$('undo').onclick=()=>{if(past.length){next.push(JSON.stringify(S));S=JSON.parse(past.pop());render()}};$('redo').onclick=()=>{if(next.length){past.push(JSON.stringify(S));S=JSON.parse(next.pop());render()}};$('gridBtn').onclick=()=>{$('gridRect').hidden=!$('gridRect').hidden;$('gridBtn').classList.toggle('active',!$('gridRect').hidden)};
function dl(n,t,m){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([t],{type:m}));a.download=n;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500)}$('save').onclick=()=>{localStorage.setItem('hayyanarsum-v2',JSON.stringify(S));$('mode').textContent='تم الحفظ على هذا الجهاز'};$('exportJSON').onclick=()=>dl('hayyanarsum-project.json',JSON.stringify(S,null,2),'application/json');$('exportDXF').onclick=()=>dl('hayyanarsum.dxf',dxf(levelShapes()),'application/dxf');$('exportSVG').onclick=()=>dl('hayyanarsum.svg',new XMLSerializer().serializeToString($('svg')),'image/svg+xml');$('importJSON').onchange=async e=>{try{const x=JSON.parse(await e.target.files[0].text());const project = readProject(x); commit(); S = project; loadProjectFields(); render()}catch{alert('ملف غير صالح')}finally{e.target.value=''}};$('boq').onchange=e=>{if(e.target.classList.contains('rate')){const rate=Number(e.target.value); if(Number.isFinite(rate)&&rate>=0&&rate<=1e12){commit();S.prices[e.target.dataset.id]=rate}boq()}};
const csvCell = value => {
  const raw = String(value);
  const safeValue = typeof value === 'string' && /^[\s\uFEFF]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safeValue.replaceAll('"', '""') + '"';
};
$('csv').onclick = () => {
  const rows = [['العنصر','الطبقة','الكمية','الوحدة','سعر الوحدة','الإجمالي']];
  for (const shape of S.shapes) {
    const quantity = quantityFor(shape);
    const rate = S.prices[shape.id] ?? 0;
    const label = itemLabel(shape);
    rows.push([label,shape.layer,quantity,shape.type === 'wall' ? 'م' : 'م²',rate,quantity * rate]);
    if (shape.type === 'slab') rows.push([label + ' · الحجم', shape.layer, slabVolume(shape), 'م³', '', '']);
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
  $('commandResult').textContent = addRectangle('room', origin, origin, Number(width), Number(height), name ? 'غرفة نوم' : 'مساحة')
    ? 'أُضيفت مساحة بأبعاد ' + width + ' × ' + height + ' م.'
    : 'أدخل أبعادًا موجبة وصالحة.';
};
function runChecks() {
  const ids = ['landArea','groundArea','upperArea','roofArea','roofBaseArea'];
  const input = { buildingType: $('buildingType').value };
  for (const id of ids) input[id] = $(id).value === '' ? NaN : Number($(id).value);
  const results = compliance(input);
  const drafts = results.filter(result => result.status === 'draft').length;
  $('checks').childNodes[0].nodeValue = drafts;
  $('summary').textContent = drafts ? 'نتائج استرشادية قيد المراجعة: ' + drafts : 'خارج نطاق المقارنة';
  $('results').replaceChildren();
  for (const result of results) {
    const card = document.createElement('article');
    card.className = 'result';
    const heading = document.createElement('h3');
    heading.textContent = result.title;
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
$('checkForm').onsubmit = event => { event.preventDefault(); runChecks(); };
const balady='https://balady.gov.sa/sites/default/files/2024-12/ashtratat%20a%27nsha%20almbany%20alsknyt%20almnshwrt%20%60ly%20mwq%60%20alwzart%20.pdf';$('sources').innerHTML=`<div class="source"><b>مسودة استرشادية</b><div><strong>اشتراطات إنشاء المباني السكنية</strong><p>النطاق: العمائر السكنية والسكنية التجارية، 4-2. لم يوثّق الإصدار وتاريخ النفاذ أو انطباق الاشتراطات المحلية بعد.</p><a href="${balady}" target="_blank">المصدر الرسمي</a></div><span>منصة بلدي</span></div><div class="source"><b>مرجع غير محوّل</b><div><strong>كود البناء السعودي 2024</strong><p>مسجل للمتابعة ولم تتحول مواده إلى قواعد حسابية بعد.</p><a href="https://www.sbc.gov.sa/ar/BC/Pages/BuildingCode/live_browsinghome.aspx" target="_blank">الاستعراض الرسمي</a></div><span>مراجعة مادة بمادة</span></div><div class="source"><b>موجهات مكانية</b><div><strong>العمارة السعودية</strong><p>19 طرازًا؛ لا تعامل كقانون إنشائي.</p><a href="https://architsaudi.dasc.gov.sa/ar/design-guidelines" target="_blank">الموجهات الرسمية</a></div><span>تصميمية</span></div>`;
const styles=['النجدية','النجدية الشمالية','ساحل تبوك','المدينة المنورة','ريف المدينة المنورة','الحجازية الساحلية','الطائف','جبال السروات','أصدار عسير','سفوح تهامة','ساحل تهامة','مرتفعات أبها','جزر فرسان','بيشة الصحراوية','نجران','واحات الأحساء','القطيف','الساحل الشرقي','النجدية الشرقية'];$('styles').innerHTML=styles.map(x=>'<span>عمارة '+x+'</span>').join('');const mods=[['الرسم ثنائي الأبعاد','نواة عملية'],['DXF / SVG / JSON','تصدير فعلي'],['الكميات والتكلفة','نواة عملية'],['التحقق السعودي','مقارنات استرشادية'],['IFC4','تصدير الجدران والفتحات'],['التحليل الإنشائي','غير منفذ'],['MEP والمحاكاة','غير منفذ'],['التعاون والحسابات','غير منفذ']];$('modules').innerHTML=mods.map(x=>`<div class="module"><b>${x[0]}</b><span>${x[1]}</span></div>`).join('');$('projectForm').onsubmit=e=>{e.preventDefault();S.project={name:$('projectName').value,city:$('projectCity').value,revision:$('revision').value,description:$('description').value};localStorage.setItem('hayyanarsum-v2',JSON.stringify(S));$('saved').textContent='تم الحفظ'};
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
    const { id, type, name, layer, x, y, w, h, z, x2, y2, thickness, openings } = shape;
    return type !== 'wall' ? { id, type, name: name.slice(0, 160), layer, levelId, x, y, w, h, z }
      : { id, type, name: name.slice(0, 160), layer, levelId, x, y, x2, y2, z, thickness,
          openings: openings?.map(({ kind, offset, width, sill, height }) => ({ kind, offset, width, sill, height })) };
  });
  const project = {};
  for (const key of ['name','city','revision','description']) {
    if (typeof data.project?.[key] === 'string') project[key] = data.project[key].slice(0, 4000);
  }
  const prices = Object.create(null);
  for (const shape of shapes) {
    const price = data.prices?.[shape.id];
    if (Number.isFinite(price) && price >= 0 && price <= 1e12) prices[shape.id] = price;
  }
  const activeLevel = levels.some(level => level.id === data.activeLevel) ? data.activeLevel : levels[0].id;
  return { schema: 2, project, shapes, prices, levels, activeLevel, selected: null, tool: 'select' };
}
function loadProjectFields() {
  for (const [id, key] of [['projectName','name'], ['projectCity','city'], ['revision','revision'], ['description','description']]) {
    $(id).value = S.project[key] ?? $(id).defaultValue;
  }
  document.querySelectorAll('[data-tool]').forEach(button => button.classList.toggle('active', button.dataset.tool === S.tool));
}
function updateIfcExport() {
  const count = S.shapes.filter(shape => isIfcWall(shape) || isIfcSlab(shape)).length;
  $('exportIFC').disabled = count === 0;
  $('ifcStatus').textContent = count
    ? 'عناصر الجدران والبلاطات المشمولة بالتصدير: ' + count + '.'
    : 'أضف بلاطة أو أدخل سماكة جدار وارتفاعه لتفعيل التصدير.';
}
$('exportIFC').onclick = () => {
  try {
    dl('hayyanarsum.ifc', exportIfc(S.shapes, S.project.name, S.levels), 'application/x-step');
    $('ifcStatus').textContent = 'جُهّز ملف IFC4 لعناصر المبنى.';
  } catch {
    $('ifcStatus').textContent = 'تعذّر إنشاء ملف IFC. تحقق من أبعاد الجدران والفتحات.';
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
  const canvas = $('model3d');
  canvas.replaceChildren();
  const walls = S.shapes.filter(shape => shape.type === 'wall' && validHeight(shape.z));
  const slabs = S.shapes.filter(isIfcSlab);
  const shaped = walls.length || slabs.length ? [...walls, ...slabs] : S.shapes.filter(shape => shape.type === 'room' && validHeight(shape.z));
  const faces = roomProjection(shaped, Number($('azimuth').value), S.levels);
  $('modelNote').textContent = walls.length || slabs.length
    ? 'الجدران: ' + walls.length + ' · البلاطات: ' + slabs.length
    : shaped.length ? 'المساحات المجسّمة: ' + shaped.length
      : 'أدخل ارتفاع المساحة أو حدّد جدارًا وأدخل سماكته وارتفاعه.';
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
      stroke: face.id === S.selected ? '#d2ab63' : '#233c32', 'stroke-width': face.id === S.selected ? 2 : 1 }));
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
runChecks();
