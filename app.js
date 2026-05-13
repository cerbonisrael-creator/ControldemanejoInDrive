const DB_NAME = 'indriveDB';
const DB_VERSION = 1;
let db, rides = [], params = { gasolina: 23.99, rendimiento: 10, comision: 14.49, ivaCom: 16, isr: 10, ivaSat: 16 };

const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = e => {
    const d = e.target.result;
    if (!d.objectStoreNames.contains('rides')) d.createObjectStore('rides', { keyPath: 'id' });
    if (!d.objectStoreNames.contains('params')) d.createObjectStore('params', { keyPath: 'key' });
  };
  req.onsuccess = e => { db = e.target.result; resolve(); };
  req.onerror = e => { console.error('DB Error:', e); reject(e); };
});

const dbOp = (store, mode, fn) => new Promise((resolve, reject) => {
  try {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e);
  } catch(e) { reject(e); }
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await openDB();
    await loadParams();
    await loadRides();
    renderTable();
    updateDashboard();
    setupTabs();
    checkStatus();
  } catch(e) {
    console.error('Error init:', e);
    alert('⚠️ Error al cargar la app. Revisa la consola (F12) o limpia el caché.');
  }
  window.addEventListener('online', checkStatus);
  window.addEventListener('offline', checkStatus);
});

function checkStatus() {
  const el = document.getElementById('status');
  if(!el) return;
  el.textContent = navigator.onLine ? '🟢 En línea' : '🟡 Sin red (guardado local)';
  el.className = `status ${navigator.onLine ? '' : 'offline'}`;
}

async function loadParams() {
  try {
    const p = await dbOp('params', 'readonly', s => s.get('config'));
    if (p?.value) params = { ...params, ...p.value };
    document.getElementById('p-gasolina').value = params.gasolina;
    document.getElementById('p-rendimiento').value = params.rendimiento;
    document.getElementById('p-comision').value = params.comision;
    document.getElementById('p-iva-com').value = params.ivaCom;
    document.getElementById('p-isr').value = params.isr;
    document.getElementById('p-iva-sat').value = params.ivaSat;
  } catch(e) { console.warn('Params default'); }
}

async function saveParams() {
  params = {
    gasolina: parseFloat(document.getElementById('p-gasolina').value) || 23.99,
    rendimiento: parseFloat(document.getElementById('p-rendimiento').value) || 10,
    comision: parseFloat(document.getElementById('p-comision').value) || 14.49,
    ivaCom: parseFloat(document.getElementById('p-iva-com').value) || 16,
    isr: parseFloat(document.getElementById('p-isr').value) || 10,
    ivaSat: parseFloat(document.getElementById('p-iva-sat').value) || 16
  };
  await dbOp('params', 'readwrite', s => s.put({ key: 'config', value: params }));
  renderTable(); updateDashboard();
  alert('✅ Parámetros guardados');
}

async function loadRides() {
  rides = await dbOp('rides', 'readonly', s => s.getAll()) || [];
}

// 🔢 Cálculo automático de duración
function calcDuracion() {
  const ini = document.getElementById('hraInicio').value;
  const fin = document.getElementById('hraFinal').value;
  const display = document.getElementById('duracionDisplay');
  if (ini && fin) {
    const [h1, m1] = ini.split(':').map(Number);
    let [h2, m2] = fin.split(':').map(Number);
    let min1 = h1 * 60 + m1;
    let min2 = h2 * 60 + m2;
    if (min2 < min1) min2 += 24 * 60; // Cruza medianoche
    const diff = min2 - min1;
    const hrs = Math.floor(diff / 60);
    const mins = diff % 60;
    display.value = `${String(hrs).padStart(2,'0')}:${String(mins).padStart(2,'0')}`;
  } else {
    display.value = '';
  }
}

document.getElementById('rideForm').addEventListener('submit', async e => {
  e.preventDefault();
  const r = {
    id: Date.now(),
    fecha: document.getElementById('fecha').value,
    hraInicio: document.getElementById('hraInicio').value,
    hraFinal: document.getElementById('hraFinal').value,
    origen: document.getElementById('origen').value,
    destino: document.getElementById('destino').value,
    distancia: parseFloat(document.getElementById('distancia').value) || 0,
    duracion: document.getElementById('duracionDisplay').value || '00:00',
    tarifa: parseFloat(document.getElementById('tarifa').value) || 0,
    seguro: 0, mantenimiento: 0, tenencia: 0, multas: 0, otros: 0
  };
  const c = calculate(r);
  rides.unshift(c);
  await dbOp('rides', 'readwrite', s => s.put(c));
  renderTable(); updateDashboard();
  e.target.reset();
  document.getElementById('fecha').valueAsDate = new Date();
});

function calculate(r) {
  const p = params;
  const tarifa = r.tarifa || 0;
  const distancia = r.distancia || 0;
  const com = tarifa * (p.comision / 100);
  const ivaC = com * (p.ivaCom / 100);
  const neto = tarifa - (com + ivaC);
  const gas = (distancia / (p.rendimiento || 1)) * (p.gasolina || 23.99);
  const costo = gas + (r.seguro||0) + (r.mantenimiento||0) + (r.tenencia||0) + (r.multas||0) + (r.otros||0);
  const util = neto - costo;
  return { 
    ...r, com, ivaC, neto, gas, costo, util, 
    isr: util * (p.isr / 100), 
    ivaSat: util * (p.ivaSat / 100),
    rentable: util >= 0 ? 'SI' : 'NO' 
  };
}

function renderTable() {
  const tbody = document.getElementById('ridesTable');
  if(!tbody) return;
  tbody.innerHTML = rides.map(r => `
    <tr>
      <td>${r.fecha||''}</td><td>${r.hraInicio||''}</td><td>${r.hraFinal||''}</td>
      <td>${r.origen||''}</td><td>${r.destino||''}</td><td>${r.distancia||0}</td>
      <td>${r.duracion||'00:00'}</td>
      <td>$${(r.tarifa||0).toFixed(2)}</td><td>$${(r.neto||0).toFixed(2)}</td>
      <td>$${(r.gas||0).toFixed(2)}</td><td>$${(r.costo||0).toFixed(2)}</td>
      <td>$${(r.util||0).toFixed(2)}</td>
      <td class="${(r.rentable||'SI') === 'SI' ? 'si' : 'no'}">${r.rentable||'SI'}</td>
      <td class="no-print"><button onclick="delRide(${r.id})" style="background:#dc2626;padding:4px 8px;font-size:12px;">🗑️</button></td>
    </tr>`).join('');
}

async function delRide(id) {
  if (!confirm('¿Eliminar este viaje?')) return;
  rides = rides.filter(r => r.id !== id);
  await dbOp('rides', 'readwrite', s => s.delete(id));
  renderTable(); updateDashboard();
}

function parseDurationToMinutes(durationStr) {
  if (!durationStr || typeof durationStr !== 'string') return 0;
  const parts = durationStr.split(':').map(p => parseFloat(p.trim()) || 0);
  return (parts[0] || 0) * 60 + (parts[1] || 0);
}

function formatMinutesToTime(minutes) {
  if (isNaN(minutes) || minutes < 0) return "00:00";
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function updateDashboard() {
  if (!rides.length) {
    ['d-brutos','d-netos','d-gastos','d-utilidad','d-rentables','d-promedio','d-duracion','d-km-total','d-tiempo-total','d-costo-km','d-tarifa-min','d-rentable-bool']
      .forEach(id => { const el = document.getElementById(id); if(el) el.textContent = id==='d-rentable-bool'?'--':(id==='d-rentables'?'0':'$0.00'); });
    return;
  }
  const t = rides.reduce((a, r) => ({
    bruto: a.bruto + (r.tarifa || 0),
    neto: a.neto + (r.neto || 0),
    gas: a.gas + (r.gas || 0),
    costo: a.costo + (r.costo || 0),
    util: a.util + (r.util || 0),
    km: a.km + (r.distancia || 0),
    duracionMin: a.duracionMin + parseDurationToMinutes(r.duracion)
  }), { bruto: 0, neto: 0, gas: 0, costo: 0, util: 0, km: 0, duracionMin: 0 });

  const costoKm = t.km > 0 ? t.gas / t.km : 0;
  const tarifaMinKm = costoKm * 1.2;
  const tarifaPromKm = t.km > 0 ? t.neto / t.km : 0;
  const duracionPromMin = t.duracionMin / rides.length;

  const set = (id, val) => { const el = document.getElementById(id); if(el) el.textContent = val; };
  set('d-brutos', `$${t.bruto.toFixed(2)}`);
  set('d-netos', `$${t.neto.toFixed(2)}`);
  set('d-gastos', `$${t.costo.toFixed(2)}`);
  set('d-utilidad', `$${t.util.toFixed(2)}`);
  set('d-rentables', `${rides.filter(r=>r.rentable==='SI').length} de ${rides.length}`);
  set('d-promedio', `$${(t.util/rides.length).toFixed(2)}`);
  set('d-duracion', formatMinutesToTime(duracionPromMin));
  set('d-km-total', `${t.km.toFixed(2)} km`);
  set('d-tiempo-total', formatMinutesToTime(t.duracionMin));
  set('d-costo-km', `$${costoKm.toFixed(2)}`);
  set('d-tarifa-min', `$${tarifaMinKm.toFixed(2)}`);
  set('d-rentable-bool', tarifaPromKm > tarifaMinKm ? '✅ SÍ' : '❌ NO');
}

// 📄 REPORTES MENSUALES
function generarReporte() {
  const mes = parseInt(document.getElementById('rep-mes').value);
  const anio = parseInt(document.getElementById('rep-anio').value);
  const filtrados = rides.filter(r => {
    if(!r.fecha) return false;
    const [y, m] = r.fecha.split('-');
    return parseInt(y) === anio && parseInt(m) === mes + 1;
  });

  if (filtrados.length === 0) {
    alert('No hay viajes registrados para este mes.');
    document.getElementById('reporte-container').style.display = 'none';
    return;
  }

  const totales = filtrados.reduce((acc, r) => ({
    bruto: acc.bruto + (r.tarifa||0), neto: acc.neto + (r.neto||0),
    gas: acc.gas + (r.gas||0), costo: acc.costo + (r.costo||0),
    utilidad: acc.utilidad + (r.util||0), km: acc.km + (r.distancia||0),
    isr: acc.isr + (r.isr||0), ivaSat: acc.ivaSat + (r.ivaSat||0),
    duracionMin: acc.duracionMin + parseDurationToMinutes(r.duracion)
  }), { bruto: 0, neto: 0, gas: 0, costo: 0, utilidad: 0, km: 0, isr: 0, ivaSat: 0, duracionMin: 0 });

  const rentables = filtrados.filter(r => r.rentable === 'SI').length;
  const costoKm = totales.km > 0 ? totales.gas / totales.km : 0;
  const tarifaMinKm = costoKm * 1.2;
  const tarifaPromKm = totales.km > 0 ? totales.neto / totales.km : 0;
  const rentableBool = tarifaPromKm > tarifaMinKm ? '✅ SÍ' : '❌ NO';
  const mesNombre = new Date(anio, mes).toLocaleString('es-MX', { month: 'long' });
  const hoy = new Date().toLocaleString('es-MX');
  
  const avgKm = totales.km / filtrados.length;
  const avgTimeMin = totales.duracionMin / filtrados.length;

  const html = `
    <h2>📊 REPORTE MENSUAL - ${mesNombre.toUpperCase()} ${anio}</h2>
    <div class="reporte-grid">
      <div class="reporte-item"><h4>Viajes Realizados</h4><p>${filtrados.length}</p></div>
      <div class="reporte-item"><h4>Ingresos Brutos</h4><p>$${totales.bruto.toFixed(2)}</p></div>
      <div class="reporte-item"><h4>Ingresos Netos</h4><p>$${totales.neto.toFixed(2)}</p></div>
      <div class="reporte-item"><h4>Gastos Totales</h4><p>$${totales.costo.toFixed(2)}</p></div>
      <div class="reporte-item"><h4>Utilidad Real</h4><p>$${totales.utilidad.toFixed(2)}</p></div>
      <div class="reporte-item"><h4>Viajes Rentables</h4><p>${rentables} / ${filtrados.length}</p></div>
      <div class="reporte-item"><h4>ISR Estimado (10%)</h4><p>$${totales.isr.toFixed(2)}</p></div>
      <div class="reporte-item"><h4>IVA Estimado (16%)</h4><p>$${totales.ivaSat.toFixed(2)}</p></div>
      <div class="reporte-item"><h4>KM Totales Mes</h4><p>${totales.km.toFixed(2)} km</p></div>
      <div class="reporte-item"><h4>Promedio KM/Viaje</h4><p>${avgKm.toFixed(2)} km</p></div>
      <div class="reporte-item"><h4>Tiempo Total Mes</h4><p>${formatMinutesToTime(totales.duracionMin)}</p></div>
      <div class="reporte-item"><h4>Promedio Tiempo/Viaje</h4><p>${formatMinutesToTime(avgTimeMin)}</p></div>
      <div class="reporte-item"><h4>Costo por KM</h4><p>$${costoKm.toFixed(2)}</p></div>
      <div class="reporte-item"><h4>Tarifa Mínima Rentable/KM</h4><p>$${tarifaMinKm.toFixed(2)}</p></div>
      <div class="reporte-item"><h4>¿Es Rentable?</h4><p>${rentableBool}</p></div>
    </div>
    <h3>📋 Detalle de Viajes</h3>
    <table class="reporte-tabla">
      <thead><tr><th>Fecha</th><th>Km</th><th>Duración</th><th>Tarifa</th><th>Neto</th><th>Utilidad</th><th>Rentable</th></tr></thead>
      <tbody>${filtrados.map(r => `<tr><td>${r.fecha||''}</td><td>${r.distancia||0}</td><td>${r.duracion||'00:00'}</td><td>$${(r.tarifa||0).toFixed(2)}</td><td>$${(r.neto||0).toFixed(2)}</td><td>$${(r.util||0).toFixed(2)}</td><td class="${(r.rentable||'SI')==='SI'?'si':'no'}">${r.rentable||'SI'}</td></tr>`).join('')}</tbody>
    </table>
    <p style="margin-top:1.5rem; font-size:0.75rem; color:#6b7280;">Generado el ${hoy} | InDrive Tracker CDMX (Local)</p>
  `;

  document.getElementById('reporte-content').innerHTML = html;
  document.getElementById('reporte-container').style.display = 'block';
}

function imprimirReporte() { window.print(); }

// 📥 EXPORTAR/IMPORTAR
function exportJSON() {
  const blob = new Blob([JSON.stringify({ version: 1, params, rides }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `indrive_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
}

function exportCSV() {
  const h = ['Fecha','Inicio','Fin','Origen','Destino','Km','Duración','Tarifa','Comisión','IVA Com','Neto','Gasolina','Seguro','Mantenimiento','Tenencia','Multas','Otros','Costo Total','Utilidad','Rentable'];
  const rows = rides.map(r => [r.fecha,r.hraInicio,r.hraFinal,r.origen,r.destino,r.distancia,r.duracion,r.tarifa,r.com,r.ivaC,r.neto,r.gas,r.seguro,r.mantenimiento,r.tenencia,r.multas,r.otros,r.costo,r.util,r.rentable]);
  const csv = [h.join(','), ...rows.map(r => r.map(v => typeof v === 'string' ? `"${v.replace(/"/g,'""')}"` : (v===null||v===undefined?'':v)).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv;charset=utf-8;'}));
  a.download = `indrive_${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

async function importData(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      if (file.name.endsWith('.json')) {
        const d = JSON.parse(e.target.result);
        if (d.params) { params = { ...params, ...d.params }; await saveParams(); }
        if (d.rides) {
          rides = d.rides.map(r => calculate(r)).filter(r => r && r.tarifa);
          await dbOp('rides', 'readwrite', s => { s.clear(); rides.forEach(r => s.put(r)); });
        }
      } else if (file.name.endsWith('.csv')) {
        const lines = e.target.result.split('\n').filter(l => l.trim());
        lines.shift();
        rides = lines.map(l => {
          const parts = l.split(',').map(v => v.replace(/^"|"$/g, ''));
          return calculate({
            id: Date.now() + Math.random(),
            fecha: parts[0], hraInicio: parts[1], hraFinal: parts[2],
            origen: parts[3], destino: parts[4], distancia: parseFloat(parts[5])||0,
            duracion: parts[6], tarifa: parseFloat(parts[7])||0,
            gasolina: parseFloat(parts[10])||0, seguro: parseFloat(parts[11])||0,
            mantenimiento: parseFloat(parts[12])||0, tenencia: parseFloat(parts[13])||0,
            multas: parseFloat(parts[14])||0, otros: parseFloat(parts[15])||0,
            costo: parseFloat(parts[16])||0, util: parseFloat(parts[17])||0,
            rentable: parts[18]
          });
        }).filter(r => r.tarifa > 0);
        await dbOp('rides', 'readwrite', s => { s.clear(); rides.forEach(r => s.put(r)); });
      }
      renderTable(); updateDashboard();
      alert('✅ Datos importados correctamente');
    } catch (err) { 
      console.error('Import error:', err);
      alert('❌ Error al importar: ' + err.message); 
    }
  };
  reader.readAsText(file);
  input.value = '';
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if(target) target.classList.add('active');
    });
  });
}