// Mis Cuentas — control del salario por bolsillos. Datos en localStorage.
(() => {
  'use strict';

  const KEY = 'mis-cuentas-v1';
  const $ = (id) => document.getElementById(id);

  const fmt = (n) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(Math.round(n || 0));

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const mesDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const fechaDe = (d) => `${mesDe(d)}-${pad(d.getDate())}`;
  const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Conceptos del desprendible de nómina (se usan para cargar meses nuevos)
  const NOMINA_INICIAL = [
    { nombre: 'Apoyo de sostenimiento', tipo: 'devengado', monto: 1750905 },
    { nombre: 'Auxilio de transporte', tipo: 'devengado', monto: 249095 },
    { nombre: 'Aporte salud', tipo: 'deduccion', monto: 70100 },
    { nombre: 'Aporte pensión', tipo: 'deduccion', monto: 70100 },
  ];

  const porDefecto = () => ({
    bolsillos: [
      { id: 'transporte', nombre: 'Transporte', porcentaje: 15, color: '#3b82f6', ahorro: false },
      { id: 'alimentacion', nombre: 'Alimentación', porcentaje: 30, color: '#f59e0b', ahorro: false },
      { id: 'varios', nombre: 'Gastos varios', porcentaje: 15, color: '#8b5cf6', ahorro: false },
      { id: 'moto', nombre: 'Ahorro moto', porcentaje: 40, color: '#10b981', ahorro: true },
    ],
    meta: { nombre: 'Moto', monto: 3000000 },
    nominaBase: NOMINA_INICIAL.map((c) => ({ ...c })),
    meses: {},
  });

  // ---------- Persistencia ----------
  function cargar() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.bolsillos) && s.meses) {
        if (!Array.isArray(s.nominaBase)) s.nominaBase = NOMINA_INICIAL.map((c) => ({ ...c }));
        return s;
      }
    } catch (e) { /* datos corruptos o storage no disponible */ }
    return porDefecto();
  }

  function guardar() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('No se pudo guardar en este navegador'); }
  }

  let state = cargar();
  let mesActual = mesDe(new Date());

  const leerMes = (m) => state.meses[m] || { salario: 0, movimientos: [] };
  const mesEditable = (m) => (state.meses[m] ||= { salario: 0, movimientos: [] });

  // ---------- Cálculos ----------
  function totalesNomina(mes) {
    if (!Array.isArray(mes.conceptos)) return { devengado: mes.salario || 0, deducciones: 0, neto: mes.salario || 0 };
    let devengado = 0, deducciones = 0;
    for (const c of mes.conceptos) {
      if (c.tipo === 'deduccion') deducciones += c.monto || 0; else devengado += c.monto || 0;
    }
    return { devengado, deducciones, neto: devengado - deducciones };
  }
  const netoMes = (mes) => totalesNomina(mes).neto;

  function calcBolsillo(mes, b) {
    const asignado = Math.round(netoMes(mes) * b.porcentaje / 100);
    let ingresos = 0, gastos = 0;
    for (const m of mes.movimientos) {
      if (m.bolsilloId !== b.id) continue;
      if (m.tipo === 'gasto') gastos += m.monto; else ingresos += m.monto;
    }
    return { asignado, ingresos, gastos, saldo: asignado + ingresos - gastos };
  }

  function totalAhorrado() {
    const ahorro = state.bolsillos.filter((b) => b.ahorro);
    let total = 0;
    for (const mes of Object.values(state.meses)) {
      for (const b of ahorro) total += calcBolsillo(mes, b).saldo;
    }
    return total;
  }

  const totalPct = () => state.bolsillos.reduce((s, b) => s + (Number(b.porcentaje) || 0), 0);
  const bolsilloPorId = (id) => state.bolsillos.find((b) => b.id === id);

  // ---------- Render ----------
  function render() {
    renderMes();
    renderResumen();
    renderMeta();
    renderBolsillos();
    renderSelects();
    renderMovimientos();
  }

  function renderMes() {
    $('mesInput').value = mesActual;
    const mes = leerMes(mesActual);
    const tieneNomina = Array.isArray(mes.conceptos) || mes.salario > 0;
    $('nominaVacia').hidden = tieneNomina;
    $('nominaDetalle').hidden = !tieneNomina;
    $('btnCargarNomina').textContent = `Cargar nómina (neto ${fmt(netoMes({ conceptos: state.nominaBase }))})`;
    if (!Array.isArray(mes.conceptos) && mes.salario > 0) {
      mes.conceptos = [{ nombre: 'Salario', tipo: 'devengado', monto: mes.salario }]; // migra datos viejos
    }
    $('conceptos').innerHTML = (mes.conceptos || []).map((c, i) => `
      <div class="concepto" data-i="${i}">
        <select data-c="tipo" aria-label="Tipo">
          <option value="devengado" ${c.tipo !== 'deduccion' ? 'selected' : ''}>+ Devengado</option>
          <option value="deduccion" ${c.tipo === 'deduccion' ? 'selected' : ''}>− Deducción</option>
        </select>
        <input type="text" data-c="nombre" value="${escapar(c.nombre)}" maxlength="50" placeholder="Concepto">
        <input type="number" data-c="monto" value="${c.monto || ''}" min="0" step="1" inputmode="numeric" placeholder="Monto">
        <button type="button" class="btn-borrar" data-quitar-c="${i}" aria-label="Quitar concepto">✕</button>
      </div>`).join('');
    const t = totalesNomina(mes);
    $('totDevengado').textContent = fmt(t.devengado);
    $('totDeducciones').textContent = fmt(t.deducciones);
    $('netoTotal').textContent = fmt(t.neto);
  }

  function guardarNomina() {
    const mes = mesEditable(mesActual);
    mes.salario = netoMes(mes);
    state.nominaBase = mes.conceptos.map(({ nombre, tipo, monto }) => ({ nombre, tipo, monto }));
    guardar();
  }

  function renderResumen() {
    const mes = leerMes(mesActual);
    let asignado = 0, gastado = 0, saldo = 0;
    for (const b of state.bolsillos) {
      const c = calcBolsillo(mes, b);
      asignado += c.asignado;
      if (!b.ahorro) { gastado += c.gastos; saldo += c.saldo; }
    }
    $('resAsignado').textContent = fmt(asignado);
    $('resGastado').textContent = fmt(gastado);
    $('resDisponible').textContent = fmt(saldo);
    $('resDisponible').className = saldo < 0 ? 'neg' : 'pos';

    const pct = totalPct();
    const aviso = $('avisoPct');
    if (pct !== 100) {
      aviso.hidden = false;
      aviso.textContent = pct < 100
        ? `Tienes ${100 - pct}% del salario sin asignar a ningún bolsillo (${fmt(netoMes(mes) * (100 - pct) / 100)}).`
        : `Los bolsillos suman ${pct}%: estás asignando más de lo que ganas.`;
    } else {
      aviso.hidden = true;
    }
  }

  function renderMeta() {
    const { nombre, monto } = state.meta;
    const ahorrado = totalAhorrado();
    const pct = monto > 0 ? Math.min(100, Math.max(0, (ahorrado / monto) * 100)) : 0;
    $('metaTitulo').textContent = `🎯 Meta: ${nombre || 'Ahorro'}`;
    $('metaPct').textContent = `${pct.toFixed(0)}%`;
    $('metaBarra').style.width = `${pct}%`;
    $('metaAhorrado').textContent = fmt(ahorrado);
    $('metaMonto').textContent = fmt(monto);
    $('metaFalta').textContent = ahorrado >= monto ? '¡Nada, meta cumplida! 🎉' : fmt(monto - ahorrado);
  }

  function renderBolsillos() {
    const mes = leerMes(mesActual);
    $('bolsillos').innerHTML = state.bolsillos.map((b) => {
      const c = calcBolsillo(mes, b);
      const base = c.asignado + c.ingresos;
      const usado = base > 0 ? Math.min(100, (c.gastos / base) * 100) : 0;
      return `
        <article class="bolsillo ${c.saldo < 0 ? 'sobregirado' : ''}" style="--color:${escapar(b.color)}">
          <h3>${b.ahorro ? '💾 ' : ''}${escapar(b.nombre)} <small>${b.porcentaje}%</small></h3>
          <div class="saldo">${fmt(c.saldo)}</div>
          <div class="barra"><div class="barra-fill" style="width:${usado}%"></div></div>
          <div class="detalle">
            <span>Asignado: ${fmt(c.asignado)}</span>
            ${c.ingresos ? `<span>Ingresos extra: ${fmt(c.ingresos)}</span>` : ''}
            <span>${b.ahorro ? 'Retirado' : 'Gastado'}: ${fmt(c.gastos)}</span>
          </div>
        </article>`;
    }).join('');
  }

  function renderSelects() {
    const opciones = state.bolsillos.map((b) => `<option value="${escapar(b.id)}">${escapar(b.nombre)}</option>`).join('');
    const sel = $('movBolsillo');
    const prev = sel.value;
    sel.innerHTML = opciones;
    if (bolsilloPorId(prev)) sel.value = prev;

    const filtro = $('filtroBolsillo');
    const prevF = filtro.value;
    filtro.innerHTML = `<option value="">Todos</option>${opciones}`;
    if (bolsilloPorId(prevF)) filtro.value = prevF;
  }

  function renderMovimientos() {
    const filtro = $('filtroBolsillo').value;
    const movs = leerMes(mesActual).movimientos
      .filter((m) => !filtro || m.bolsilloId === filtro)
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.creado - a.creado);

    $('sinMovs').hidden = movs.length > 0;
    $('listaMovs').innerHTML = movs.map((m) => {
      const b = bolsilloPorId(m.bolsilloId);
      const signo = m.tipo === 'gasto' ? '−' : '+';
      const [, mm, dd] = m.fecha.split('-');
      return `
        <li>
          <span class="punto" style="background:${escapar(b ? b.color : '#94a3b8')}"></span>
          <div class="mov-info">
            ${escapar(m.descripcion || (m.tipo === 'gasto' ? 'Gasto' : 'Ingreso extra'))}
            <small>${escapar(b ? b.nombre : 'Bolsillo eliminado')} · ${Number(dd)} de ${NOMBRES_MES[Number(mm) - 1]}</small>
          </div>
          <span class="mov-monto ${m.tipo === 'gasto' ? 'neg' : 'pos'}">${signo}${fmt(m.monto)}</span>
          <button class="btn-borrar" data-id="${escapar(m.id)}" aria-label="Eliminar movimiento">✕</button>
        </li>`;
    }).join('');
  }

  // ---------- Configuración ----------
  let borrador = [];

  function abrirConfig() {
    borrador = state.bolsillos.map((b) => ({ ...b }));
    $('cfgMetaNombre').value = state.meta.nombre;
    $('cfgMetaMonto').value = state.meta.monto;
    renderConfig();
  }

  function renderConfig() {
    $('configBolsillos').innerHTML = borrador.map((b, i) => `
      <div class="cfg-fila" data-i="${i}">
        <input type="color" data-campo="color" value="${escapar(b.color)}" aria-label="Color">
        <input type="text" data-campo="nombre" value="${escapar(b.nombre)}" maxlength="30" placeholder="Nombre">
        <input type="number" data-campo="porcentaje" value="${b.porcentaje}" min="0" max="100" step="1" aria-label="Porcentaje">
        <label><input type="checkbox" data-campo="ahorro" ${b.ahorro ? 'checked' : ''}> 💾 Ahorro</label>
        <button type="button" class="btn-borrar" data-quitar="${i}" aria-label="Quitar bolsillo">✕</button>
      </div>`).join('');
    actualizarTotalPct();
  }

  function actualizarTotalPct() {
    const t = borrador.reduce((s, b) => s + (Number(b.porcentaje) || 0), 0);
    $('totalPct').textContent = `${t}%`;
    $('totalPct').className = t === 100 ? 'pos' : 'neg';
  }

  function guardarConfig() {
    const limpios = borrador
      .map((b) => ({ ...b, nombre: b.nombre.trim(), porcentaje: Math.max(0, Number(b.porcentaje) || 0) }))
      .filter((b) => b.nombre);
    if (!limpios.length) { toast('Debe haber al menos un bolsillo'); return; }
    state.bolsillos = limpios;
    state.meta = {
      nombre: $('cfgMetaNombre').value.trim() || 'Ahorro',
      monto: Math.max(0, Number($('cfgMetaMonto').value) || 0),
    };
    guardar();
    render();
    abrirConfig();
    toast('Configuración guardada');
  }

  // ---------- Respaldo ----------
  function exportar() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `mis-cuentas-${fechaDe(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importar(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!Array.isArray(data.bolsillos) || typeof data.meses !== 'object' || !data.meta) throw new Error();
        if (!confirm('Esto reemplazará todos tus datos actuales. ¿Continuar?')) return;
        state = data;
        guardar();
        abrirConfig();
        render();
        toast('Respaldo importado');
      } catch (e) {
        toast('El archivo no es un respaldo válido');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Utilidades UI ----------
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('visible'), 2200);
  }

  function cambiarMes(delta) {
    const [y, m] = mesActual.split('-').map(Number);
    mesActual = mesDe(new Date(y, m - 1 + delta, 1));
    ajustarFechaForm();
    render();
  }

  function ajustarFechaForm() {
    const hoy = fechaDe(new Date());
    $('movFecha').value = hoy.startsWith(mesActual) ? hoy : `${mesActual}-01`;
  }

  // ---------- Eventos ----------
  $('mesPrev').addEventListener('click', () => cambiarMes(-1));
  $('mesNext').addEventListener('click', () => cambiarMes(1));
  $('mesInput').addEventListener('change', (e) => {
    if (!e.target.value) return;
    mesActual = e.target.value;
    ajustarFechaForm();
    render();
  });

  $('btnCargarNomina').addEventListener('click', () => {
    mesEditable(mesActual).conceptos = state.nominaBase.map((c) => ({ ...c }));
    guardarNomina();
    render();
    toast('Nómina cargada');
  });

  $('btnAddConcepto').addEventListener('click', () => {
    const mes = mesEditable(mesActual);
    (mes.conceptos ||= []).push({ nombre: '', tipo: 'devengado', monto: 0 });
    guardarNomina();
    render();
    $('conceptos').querySelector('.concepto:last-child input[data-c="nombre"]').focus();
  });

  $('conceptos').addEventListener('change', (e) => {
    const fila = e.target.closest('.concepto');
    const campo = e.target.dataset.c;
    if (!fila || !campo) return;
    const c = mesEditable(mesActual).conceptos[Number(fila.dataset.i)];
    c[campo] = campo === 'monto' ? Math.max(0, Math.round(Number(e.target.value) || 0)) : e.target.value;
    guardarNomina();
    render();
  });

  $('conceptos').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quitar-c]');
    if (!btn) return;
    const mes = mesEditable(mesActual);
    mes.conceptos.splice(Number(btn.dataset.quitarC), 1);
    guardarNomina();
    render();
  });

  $('formMov').addEventListener('submit', (e) => {
    e.preventDefault();
    const monto = Number($('movMonto').value);
    const fecha = $('movFecha').value;
    if (!(monto > 0) || !fecha) return;
    const mesMov = fecha.slice(0, 7);
    mesEditable(mesMov).movimientos.push({
      id: uid(),
      tipo: e.target.tipo.value,
      bolsilloId: $('movBolsillo').value,
      monto: Math.round(monto),
      descripcion: $('movDesc').value.trim(),
      fecha,
      creado: Date.now(),
    });
    guardar();
    if (mesMov !== mesActual) { mesActual = mesMov; }
    $('movMonto').value = '';
    $('movDesc').value = '';
    render();
    toast('Movimiento agregado');
    $('movMonto').focus();
  });

  $('filtroBolsillo').addEventListener('change', renderMovimientos);

  $('listaMovs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    const mes = mesEditable(mesActual);
    mes.movimientos = mes.movimientos.filter((m) => m.id !== btn.dataset.id);
    guardar();
    render();
    toast('Movimiento eliminado');
  });

  $('configBolsillos').addEventListener('input', (e) => {
    const fila = e.target.closest('.cfg-fila');
    const campo = e.target.dataset.campo;
    if (!fila || !campo) return;
    const b = borrador[Number(fila.dataset.i)];
    b[campo] = campo === 'ahorro' ? e.target.checked : e.target.value;
    if (campo === 'porcentaje') actualizarTotalPct();
  });

  $('configBolsillos').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quitar]');
    if (!btn) return;
    borrador.splice(Number(btn.dataset.quitar), 1);
    renderConfig();
  });

  $('btnAddBolsillo').addEventListener('click', () => {
    borrador.push({ id: uid(), nombre: 'Nuevo bolsillo', porcentaje: 0, color: '#64748b', ahorro: false });
    renderConfig();
  });

  $('btnGuardarCfg').addEventListener('click', guardarConfig);
  $('btnExport').addEventListener('click', exportar);
  $('fileImport').addEventListener('change', (e) => {
    if (e.target.files[0]) importar(e.target.files[0]);
    e.target.value = '';
  });

  $('btnReset').addEventListener('click', () => {
    if (!confirm('¿Borrar TODOS los datos? Esta acción no se puede deshacer.')) return;
    state = porDefecto();
    guardar();
    abrirConfig();
    render();
    toast('Datos borrados');
  });

  // ---------- Inicio ----------
  ajustarFechaForm();
  abrirConfig();
  render();
})();
