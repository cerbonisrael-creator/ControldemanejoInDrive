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
  req.onerror = reject;
});

const dbOp = (store, mode, fn) => new Promise((resolve, reject) => {
  const tx = db.transaction(store, mode);
  const req = fn(tx.objectStore(store));
  req.onsuccess = () => resolve(req.result);
  req.onerror = reject;
});

document.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  await loadParams();
  await loadRides();
  renderTable(); updateDashboard(); setupTabs(); checkStatus();
  window.addEventListener('online', checkStatus);
  window.addEventListener('offline', checkStatus);
});

function checkStatus() {
  const el = document.getElementById('status');
  el.textContent = navigator.onLine ? '🟢 En línea' : '🟡 Sin red (guardado local)';
  el.className = `status ${navigator.onLine ? '' : 'offline'}`;
}

async function loadParams() {
  const p = await dbOp('params', 'readonly', s => s.get('config'));
  if (p?.value) params = p.value;
  Object.keys(params).forEach(k => {
    const el = document.getElementById(`p-${k === 'ivaCom' ? 'iva-com' : k}`);
    if (el) el.value = params[k];
  });
}

async function saveParams() {
  params.gasolina = parseFloat(document.getElementById('p-gasolina').value);
  params.rendimiento = parseFloat(document.getElementById('p-rendimiento').value);
  params.comision = parseFloat(document.getElementById('p-comision').value);
  params.ivaCom = parseFloat(document.getElementById('p-iva-com').value);
  params.isr = parseFloat(document.getElementById('p-isr').value);
  params.ivaSat = parseFloat(document.getElementById('p-iva-sat').value);
  await dbOp('params', 'readwrite', s => s.put({ key: 'config', value: params }));
  renderTable(); updateDashboard();
  alert('✅ Parámetros guardados');
}

async function loadRides() {
  rides = await dbOp('rides', 'readonly', s => s.getAll()) || [];
}

document.getElementById('rideForm').addEventListener('submit', async e => {
  e.preventDefault();
  const r = {
    id: Date.now(),
    fecha: document.getElementById('fecha').value,
    hraInicio: `${document.getElementById('hraInicio').value} ${document.getElementById('amPmInicio').value}`,
    hraFinal: `${document.getElementById('hraFinal').value} ${document.getElementById('amPmFinal').value}`,
    origen: document.getElementById('origen').value,
    destino: document.getElementById('destino').value,
    distancia: parseFloat(document.getElementById('distancia').value),
    duracion: document.getElementById('duracion').value || '00:00',
    tarifa: parseFloat(document.getElementById('tarifa').value),
    seguro: parseFloat(document.getElementById('seguro').value) || 0,
    mantenimiento: parseFloat(document.getElementById('mantenimiento').value) || 0,
    tenencia: parseFloat(document.getElementById('tenencia').value) || 0,
    multas: parseFloat(document.getElementById('multas').value) || 0,
    otros: parseFloat(document.getElementById('otros').value) || 0
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
  const com = r.tarifa * (p.comision / 100);
  const ivaC = com * (p.ivaCom / 100);
  const neto = r.tarifa - (com + ivaC);
  const gas = (r.distancia / p.rendimiento) * p.gasolina;
  const costo = gas + r.seguro + r.mantenimiento + r.tenencia + r.multas + r.otros;
  const util = neto - costo;
  return { 
    ...r, com, ivaC, neto, gas, costo, util, 
    isr: util * (p.isr / 100), 
    ivaSat: util * (p.ivaSat / 100),
    rentable: util >= 0 ? 'SI' : 'NO' 
  };
}

function renderTable() {
  document.getElementById('ridesTable').innerHTML = rides.map(r => `
    <tr>
      <td>${r.fecha}</td><td>${r.hraInicio}</td><td>${r.hraFinal}</td>
      <td>${r.origen}</td><td>${r.destino}</td><td>${r.distancia}</td>
      <td>${r.duracion}</td>
      <td>$${r.tarifa.toFixed(2)}</td><td>$${r.neto.toFixed(2)}</td>
      <td>$${r.gas.toFixed(2)}</td><td>$${r.costo.toFixed(2)}</td>
      <td>$${r.util.toFixed(2)}</td>
      <td class="${r.rentable === 'SI' ? 'si' : 'no'}">${r.rentable}</td>
      <td class="no-print"><button onclick="delRide(${r.id})" style="background:#dc2626;padding:4px 8px;font-size:12px;">🗑️</button></td>
    </tr>`).join('');
}

async function delRide(id) {
  if (!confirm('¿Eliminar este viaje?')) return;
  rides = rides.filter(r => r.id !== id);
  await dbOp('rides', 'readwrite', s => s.delete(id));
  renderTable(); updateDashboard();
}

function updateDashboard() {
  if (!rides.length) return;
  const t = rides.reduce((a, r) => ({
    bruto: a.bruto + r.tarifa, neto: a.neto + r.neto,
    gas: a.gas + r.gas, costo: a.costo + r.costo,
    util: a.util + r.util, km: a.km + r.distancia,
    duracionMin: a.duracionMin + parseDurationToMinutes(r.duracion)
  }), { bruto: 0, neto: 0, gas: 0, costo: 0, util: 0, km: 0, duracionMin: 0 });

  const costoKm = t.km ? t.gas / t.km : 0;
  const tarifaMinKm = costoKm * 1.2;
  const tarifaPromKm = t.km ? t.neto / t.km : 0;
  const duracionPromMin = t.duracionMin / rides.length;

  document.getElementById('d-brutos').textContent = `$${t.bruto.toFixed(2)}`;
  document.getElementById('d-netos').textContent = `$${t.neto.toFixed(2)}`;
  document.getElementById('d-gastos').textContent = `$${t.costo.toFixed(2)}`;
  document.getElementById('d-utilidad').textContent = `$${t.util.toFixed(2)}`;
  document.getElementById('d-rentables').textContent = `${rides.filter(r=>r.rentable==='SI').length} de ${rides.length}`;
  document.getElementById('d-promedio').textContent = `$${(t.util/rides.length).toFixed(2)}`;
  document.getElementById('d-duracion').textContent = formatMinutesToTime(duracionPromMin);
  
  // Nuevos indicadores Dashboard
  document.getElementById('d-km-total').textContent = `${t.km.toFixed(2)} km`;
  document.getElementById('d-tiempo-total').textContent = formatMinutesToTime(t.duracionMin);
  
  document.getElementById('d-costo-km').textContent = `$${costoKm.toFixed(2)}`;
  document.getElementById('d-tarifa-min').textContent = `$${tarifaMinKm.toFixed(2)}`;
  document.getElementById('d-rentable-bool').textContent = tarifaPromKm > tarifaMinKm ? '✅ SÍ' : ' NO';
}

// 📄 REPORTES MENSUALES
function generarReporte() {
  const mes = parseInt(document.getElementById('rep-mes').value);
  const anio = parseInt(document.getElementById('rep-anio').value);
  const filtrados = rides.filter(r => {
    const [y, m] = r.fecha.split('-');
    return parseInt(y) === anio && parseInt(m) === mes + 1;
  });

  if (filtrados.length === 0) {
    alert('No hay viajes registrados para este mes.');
    document.getElementById('reporte-container').style.display = 'none';
    return;
  }

  const totales = filtrados.reduce((acc, r) => ({
    bruto: acc.bruto + r.tarifa, neto: acc.neto + r.neto,
    gas: acc.gas + r.gas, costo: acc.costo + r.costo,
    utilidad: acc.utilidad + r.util, km: acc.km + r.distancia,
    isr: acc.isr + r.isr, ivaSat: acc.ivaSat + r.ivaSat,
    duracionMin: acc.duracionMin + parseDurationToMinutes(r.duracion)
  }), { bruto: 0, neto: 0, gas: 0, costo: 0, utilidad: 0, km: 0, isr: 0, ivaSat: 0, duracionMin: 0 });

  const rentables = filtrados.filter(r => r.rentable === 'SI').length;
  const costoKm = totales.km ? totales.gas / totales.km : 0;
  const tarifaMinKm = costoKm * 1.2;
  const tarifaPromKm = totales.km ? totales.neto / totales.km : 0;
  const rentableBool = tarifaPromKm > tarifaMinKm ? '✅ SÍ' : '❌ NO';
  const mesNombre = new Date(anio, mes).toLocaleString('es-MX', { month: 'long' });
  const hoy = new Date().toLocaleString('es-MX');
  
  // Cálculos de KM y Tiempo para Reportes
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
      <tbody>${filtrados.map(r => `<tr><td>${r.fecha}</td><td>${r.distancia}</td><td>${r.duracion}</td><td>$${r.tarifa.toFixed(2)}</td><td>$${r.neto.toFixed(2)}</td><td>$${r.util.toFixed(2)}</td><td class="${r.rentable==='SI'?'si':'no'}">${r.rentable}</td></tr>`).join('')}</tbody>
    </table>
    <p style="margin-top:1.5rem; font-size:0.75rem; color:#6b7280;">Generado el ${hoy} | InDrive Tracker CDMX (Local)</p>
  `;

  document.getElementById('reporte-content').innerHTML = html;
  document.getElementById('reporte-container').style.display = 'block';
}

function imprimirReporte() { window.print(); }

//  EXPORTAR/IMPORTAR
function exportJSON() {
  const blob = new Blob([JSON.stringify({ version: 1, params, rides }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `indrive_backup_${new Date().toISOString().slice(0,10)}.json`; a.click();
}

function exportCSV() {
  const h = ['Fecha','Inicio','Fin','Origen','Destino','Km','Duración','Tarifa','Comisión','IVA Com','Neto','Gasolina','Seguro','Mantenimiento','Tenencia','Multas','Otros','Costo Total','Utilidad','Rentable'];
  const rows = rides.map(r => [r.fecha,r.hraInicio,r.hraFinal,r.origen,r.destino,r.distancia,r.duracion,r.tarifa,r.com,r.ivaC,r.neto,r.gas,r.seguro,r.mantenimiento,r.tenencia,r.multas,r.otros,r.costo,r.util,r.rentable]);
  const csv = [h.join(','), ...rows.map(r => r.map(v => typeof v === 'string' ? `"${v.replace(/"/g,'""')}"` : v).join(','))].join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'}));
  a.download = `indrive_${new Date().toISOString().slice(0,10)}.csv`; a.click();
}

async function importData(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      if (file.name.endsWith('.json')) {
        const d = JSON.parse(e.target.result);
        if (d.params) { params = d.params; await saveParams(); }
        if (d.rides) {
          rides = d.rides.map(r => calculate(r));
          await dbOp('rides', 'readwrite', s => { s.clear(); rides.forEach(r => s.put(r)); });
        }
      } else if (file.name.endsWith('.csv')) {
        const lines = e.target.result.split('\n').filter(l => l.trim());
        lines.shift();
        rides = lines.map(l => {
          const [fecha,hi,hf,o,d,km,dur,tar,_,__,neto,gas,seg,man,ten,mul,otr,cost,util,rent] = l.split(',').map(v => v.replace(/^"|"$/g, ''));
          return calculate({id:Date.now()+Math.random(), fecha, hraInicio:hi, hraFinal:hf, origen:o, destino:d, distancia:+km, duracion:dur, tarifa:+tar, gasolina:+gas, seguro:+seg, mantenimiento:+man, tenencia:+ten, multas:+mul, otros:+otr, costo:+cost, util:+util, rentable:rent});
        }).filter(r => r.tarifa);
        await dbOp('rides', 'readwrite', s => { s.clear(); rides.forEach(r => s.put(r)); });
      }
      renderTable(); updateDashboard();
      alert('✅ Datos importados correctamente');
    } catch (err) { alert('❌ Error: ' + err.message); }
  };
  reader.readAsText(file);
  input.value = '';
}

// ️ UTILIDADES DE TIEMPO
function parseDurationToMinutes(durationStr) {
  if (!durationStr) return 0;
  const parts = durationStr.split(':');
  if (parts.length >= 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return 0;
}

function formatMinutesToTime(minutes) {
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}