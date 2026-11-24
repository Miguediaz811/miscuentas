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

  const TONOS_NOMINA = {
    devengado: ['#1e3a8a', '#93c5fd', '#3b5bdb', '#c7d2fe'],
    deduccion: ['#dc2626', '#f87171', '#b91c1c', '#fca5a5'],
  };

  // Conceptos del desprendible de nómina (se usan para cargar meses nuevos)
  const NOMINA_INICIAL = [
    { nombre: 'Apoyo de sostenimiento', tipo: 'devengado', monto: 1750905 },
    { nombre: 'Auxilio de transporte', tipo: 'devengado', monto: 249095 },
    { nombre: 'Aporte salud', tipo: 'deduccion', monto: 70100 },
    { nombre: 'Aporte pensión', tipo: 'deduccion', monto: 70100 },
  ];

  const porDefecto = () => ({
    bolsillos: [
      { id: 'transporte', nombre: 'Transporte', porcentaje: 15, color: '#0ea5e9', ahorro: false },
      { id: 'alimentacion', nombre: 'Alimentación', porcentaje: 30, color: '#f97316', ahorro: false },
      { id: 'varios', nombre: 'Gastos varios', porcentaje: 15, color: '#64748b', ahorro: false },
      { id: 'moto', nombre: 'Ahorro moto', porcentaje: 40, color: '#2563eb', ahorro: true },
    ],
    meta: { nombre: 'Moto', monto: 3000000 },
    nominaBase: NOMINA_INICIAL.map((c) => ({ ...c })),
    meses: {},
    paletaV3: true,
  });

  // ---------- Persistencia ----------
  function cargar() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.bolsillos) && s.meses) {
        if (!Array.isArray(s.nominaBase)) s.nominaBase = NOMINA_INICIAL.map((c) => ({ ...c }));
        // Migra los colores de las paletas anteriores (verde y violeta) a la azul/naranja
        const viejos = ['#3b82f6', '#38bdf8', '#f59e0b', '#8b5cf6', '#f472b6', '#10b981'];
        if (!s.paletaV3) {
          const nuevos = Object.fromEntries(porDefecto().bolsillos.map((b) => [b.id, b.color]));
          s.bolsillos.forEach((b) => { if (nuevos[b.id] && viejos.includes(b.color)) b.color = nuevos[b.id]; });
          s.paletaV3 = true;
        }
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
    const asignado = asignadoDe(b, netoMes(mes));
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

  // Un bolsillo se asigna por porcentaje del neto (modo 'pct') o por valor fijo (modo 'valor')
  const esValor = (b) => b.modo === 'valor';
  const asignadoDe = (b, neto) => (esValor(b)
    ? Math.max(0, Math.round(Number(b.valor) || 0))
    : Math.round(neto * (Number(b.porcentaje) || 0) / 100));
  const totalAsignado = (lista, neto) => lista.reduce((s, b) => s + asignadoDe(b, neto), 0);
  const etiquetaBolsillo = (b, neto) => (esValor(b)
    ? `$${fmtCorto(Number(b.valor) || 0)}`
    : `${Number(b.porcentaje) || 0}%`);
  const bolsilloPorId = (id) => state.bolsillos.find((b) => b.id === id);

  // ---------- Render ----------
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
    const comp = (mes.conceptos || []).filter((c) => c.monto > 0);
    const totalComp = comp.reduce((s2, c) => s2 + c.monto, 0) || 1;
    const tonos = TONOS_NOMINA;
    const idx = { devengado: 0, deduccion: 0 };
    const segs = comp.map((c) => {
      const k = c.tipo === 'deduccion' ? 'deduccion' : 'devengado';
      const col = tonos[k][idx[k]++ % 4];
      return { c, col, w: (c.monto / totalComp) * 100 };
    });
    $('nominaComp').innerHTML = comp.length ? `
      <div class="comp-barra">${segs.map((s2) => `<span style="width:${s2.w}%;background:${s2.col}" title="${escapar(s2.c.nombre)}: ${fmt(s2.c.monto)}"></span>`).join('')}</div>
      <ul class="comp-leyenda">${segs.map((s2) => `<li><i style="background:${s2.col}"></i>${escapar(s2.c.nombre || 'Concepto')} <b>${s2.c.tipo === 'deduccion' ? '−' : '+'}${fmt(s2.c.monto)}</b></li>`).join('')}</ul>` : '';
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

  function render() {
    renderMes();
    renderResumen();
    renderMeta();
    renderBolsillos();
    renderDistribucion();
    renderBarrasBolsillos();
    renderHistorico();
    renderDiario();
    renderSelects();
    renderMovimientos();
  }

  // ---------- Helpers de gráficos ----------
  const fmtCorto = (n) => {
    const a = Math.abs(n);
    if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.0', '')}M`;
    if (a >= 1e3) return `${Math.round(n / 1e3)}k`;
    return String(Math.round(n));
  };
  const escalaMax = (v) => {
    if (v <= 0) return 1;
    const p = 10 ** Math.floor(Math.log10(v));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v);
  };
  const diasDelMes = (m) => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm, 0).getDate(); };
  const nombreMesCorto = (m) => NOMBRES_MES[Number(m.split('-')[1]) - 1].slice(0, 3);
  const sumarMes = (m, d) => { const [y, mm] = m.split('-').map(Number); return mesDe(new Date(y, mm - 1 + d, 1)); };

  function resumenMes(mes) {
    let asignado = 0, gastado = 0, disponible = 0, presupuesto = 0, ahorro = 0;
    for (const b of state.bolsillos) {
      const c = calcBolsillo(mes, b);
      asignado += c.asignado;
      if (b.ahorro) ahorro += c.saldo;
      else { gastado += c.gastos; disponible += c.saldo; presupuesto += c.asignado + c.ingresos; }
    }
    return { asignado, gastado, disponible, presupuesto, ahorro };
  }

  function renderResumen() {
    const mes = leerMes(mesActual);
    const neto = netoMes(mes);
    const r = resumenMes(mes);
    $('resAsignado').textContent = fmt(r.asignado);
    $('kpiPctAsignado').textContent = `${neto ? Math.round((r.asignado / neto) * 100) : 0}% del neto`;
    $('resGastado').textContent = fmt(r.gastado);
    const pctG = r.presupuesto ? (r.gastado / r.presupuesto) * 100 : 0;
    $('resGastado').style.color = estadoGasto(pctG).color;
    $('kpiPctGastado').textContent = `${r.presupuesto ? Math.round((r.gastado / r.presupuesto) * 100) : 0}% del presupuesto de gastos`;
    $('resDisponible').textContent = fmt(r.disponible);
    $('resDisponible').className = r.disponible < 0 ? 'neg' : 'pos';

    const hoy = new Date();
    if (mesActual === mesDe(hoy) && r.disponible > 0) {
      const restantes = diasDelMes(mesActual) - hoy.getDate() + 1;
      $('kpiDiario').textContent = `≈ ${fmt(r.disponible / restantes)} por día (${restantes} días)`;
    } else {
      $('kpiDiario').textContent = r.disponible < 0 ? 'Te pasaste del presupuesto' : 'Saldo de gastos del mes';
    }
    $('kpiAhorroMes').textContent = fmt(r.ahorro);
    $('kpiAhorroSub').textContent = neto ? `${Math.round((r.ahorro / neto) * 100)}% del neto` : '—';

    const dif = neto - totalAsignado(state.bolsillos, neto);
    const aviso = $('avisoPct');
    aviso.hidden = !neto || Math.abs(dif) < 1;
    if (dif >= 1) aviso.textContent = `Tienes ${fmt(dif)} del neto sin asignar a ningún bolsillo (${Math.round((dif / neto) * 100)}%).`;
    else if (dif <= -1) aviso.textContent = `Los bolsillos suman ${fmt(neto - dif)}: estás asignando ${fmt(-dif)} más de lo que ganas.`;
  }

  function renderMeta() {
    const { nombre, monto } = state.meta;
    const ahorrado = totalAhorrado();
    const pct = monto > 0 ? Math.min(100, Math.max(0, (ahorrado / monto) * 100)) : 0;
    $('metaTitulo').textContent = `🎯 Meta: ${nombre || 'Ahorro'}`;
    $('metaAhorrado').textContent = fmt(ahorrado);
    $('metaMonto').textContent = fmt(monto);
    $('metaFalta').textContent = ahorrado >= monto ? '¡Cumplida! 🎉' : fmt(monto - ahorrado);

    // Ritmo: promedio de ahorro de los meses con nómina
    const meses = Object.values(state.meses).filter((m) => netoMes(m) > 0);
    const prom = meses.length ? meses.reduce((s, m) => s + resumenMes(m).ahorro, 0) / meses.length : 0;
    $('metaEta').textContent = ahorrado >= monto ? '—'
      : prom > 0 ? `${Math.ceil((monto - ahorrado) / prom)} mes(es) más` : 'Sin datos';

    const arco = 'M 20 105 A 80 80 0 0 1 180 105';
    $('chartMeta').innerHTML = `
      <defs><linearGradient id="gMeta" x1="0" x2="1"><stop offset="0" stop-color="#2563eb"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs>
      <path d="${arco}" fill="none" class="svg-track" stroke-width="18" stroke-linecap="round"/>
      <path d="${arco}" fill="none" stroke="url(#gMeta)" stroke-width="18" stroke-linecap="round"
        pathLength="100" stroke-dasharray="${pct} 100" style="transition:stroke-dasharray .6s"/>
      <text x="100" y="92" text-anchor="middle" font-size="30" font-weight="800" class="svg-txt">${pct.toFixed(0)}%</text>
      <text x="100" y="112" text-anchor="middle" class="eje">completado</text>`;
  }

  // Semáforo: verde < 50 %, amarillo < 80 %, rojo ≥ 80 % del bolsillo gastado
  function estadoGasto(pct) {
    if (pct >= 80) return { clase: 'alto', color: 'var(--alto)', txt: pct > 100 ? 'Sobregirado' : 'Gasto alto' };
    if (pct >= 50) return { clase: 'cuidado', color: 'var(--cuidado)', txt: 'Cuidado' };
    return { clase: 'ok', color: 'var(--ok)', txt: 'Vas bien' };
  }

  function anillo(pct, color) {
    return `<svg class="anillo" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="15" fill="none" class="svg-track" stroke-width="5"/>
      <circle cx="18" cy="18" r="15" fill="none" style="stroke:${color}" stroke-width="5" stroke-linecap="round"
        pathLength="100" stroke-dasharray="${Math.max(0, Math.min(100, pct))} 100" transform="rotate(-90 18 18)"/>
      <text x="18" y="21" text-anchor="middle" font-size="8.5" font-weight="700" class="svg-txt">${Math.round(pct)}%</text>
    </svg>`;
  }

  function renderBolsillos() {
    const mes = leerMes(mesActual);
    $('bolsillos').innerHTML = state.bolsillos.map((b) => {
      const c = calcBolsillo(mes, b);
      const base = c.asignado + c.ingresos;
      // Gasto: % usado. Ahorro: % que se conserva.
      const pct = base > 0 ? (b.ahorro ? (c.saldo / base) * 100 : (c.gastos / base) * 100) : 0;
      const est = b.ahorro ? null : estadoGasto(pct);
      const colorAnillo = b.ahorro ? escapar(b.color) : est.color;
      return `
        <article class="bolsillo ${c.saldo < 0 ? 'sobregirado' : ''}" style="--color:${escapar(b.color)}">
          <div class="bolsillo-top"><h3>${b.ahorro ? '💾 ' : ''}${escapar(b.nombre)}</h3><span class="chip">${escapar(etiquetaBolsillo(b))}</span></div>
          <div class="bolsillo-cuerpo">
            ${anillo(pct, colorAnillo)}
            <div>
              <div class="saldo">${fmt(c.saldo)}</div>
              <div class="detalle">de ${fmt(base)} · ${b.ahorro ? 'retirado' : 'gastado'} ${fmt(c.gastos)}</div>
              ${est ? `<span class="estado estado-${est.clase}">${est.txt}</span>` : '<span class="estado" style="color:' + escapar(b.color) + '">Ahorro</span>'}
            </div>
          </div>
        </article>`;
    }).join('');
  }

  // Dos anillos: exterior = de dónde sale la plata (devengados);
  // interior = a dónde va (deducciones, bolsillos y lo que queda sin asignar).
  function renderDistribucion() {
    const mes = leerMes(mesActual);
    const t = totalesNomina(mes);
    const conceptos = (Array.isArray(mes.conceptos) ? mes.conceptos : [{ nombre: 'Salario', tipo: 'devengado', monto: mes.salario || 0 }])
      .filter((c) => c.monto > 0);
    const idx = { devengado: 0, deduccion: 0 };
    const tono = (tipo) => TONOS_NOMINA[tipo][idx[tipo]++ % 4];

    const devengados = conceptos.filter((c) => c.tipo !== 'deduccion')
      .map((c) => ({ nombre: c.nombre || 'Devengado', monto: c.monto, color: tono('devengado') }));
    const deducciones = conceptos.filter((c) => c.tipo === 'deduccion')
      .map((c) => ({ nombre: c.nombre || 'Deducción', monto: c.monto, color: tono('deduccion') }));
    const bolsillos = state.bolsillos.map((b) => ({ nombre: b.nombre, color: b.color, monto: asignadoDe(b, t.neto) }));
    const libre = t.neto - bolsillos.reduce((s2, p) => s2 + p.monto, 0);
    const destino = [...deducciones, ...bolsillos];
    if (libre >= 1) destino.push({ nombre: 'Sin asignar', color: '#9ca3af', monto: libre });

    const anilloSvg = (partes, r, grosor) => {
      const total = partes.reduce((s2, p) => s2 + p.monto, 0);
      if (!total) return `<circle cx="100" cy="100" r="${r}" fill="none" class="svg-track" stroke-width="${grosor}"/>`;
      let off = 0;
      return partes.map((p) => {
        const len = (p.monto / total) * 100;
        const vis = Math.max(0, len - (partes.length > 1 ? 0.6 : 0));
        const seg = `<circle cx="100" cy="100" r="${r}" fill="none" stroke="${escapar(p.color)}" stroke-width="${grosor}"
          pathLength="100" stroke-dasharray="${vis} ${100 - vis}" stroke-dashoffset="${-off}"
          transform="rotate(-90 100 100)"><title>${escapar(p.nombre)}: ${fmt(p.monto)}</title></circle>`;
        off += len;
        return seg;
      }).join('');
    };

    $('chartDistribucion').innerHTML = `
      ${anilloSvg(devengados, 88, 12)}
      ${anilloSvg(destino, 64, 26)}
      <text x="100" y="97" text-anchor="middle" font-size="20" font-weight="800" class="svg-txt">${fmtCorto(t.devengado)}</text>
      <text x="100" y="114" text-anchor="middle" class="eje">devengado</text>`;

    const pctNeto = (m) => (t.neto ? ` <small>${Math.round((m / t.neto) * 1000) / 10}%</small>` : '');
    const fila = (p, signo, extra = '') => `<li><i style="background:${escapar(p.color)}"></i><span>${escapar(p.nombre)}${extra}</span><b>${signo}${fmt(p.monto)}</b></li>`;
    const grupo = (titulo, items) => (items ? `<li class="leyenda-grupo">${titulo}</li>${items}` : '');
    $('leyendaDistribucion').innerHTML =
      grupo('Devengados · anillo externo', devengados.map((p) => fila(p, '+')).join('')) +
      grupo('Deducciones', deducciones.map((p) => fila(p, '−')).join('')) +
      grupo(`Bolsillos · neto ${fmt(t.neto)}`, bolsillos.map((p) => fila(p, '', pctNeto(p.monto))).join('') +
        (libre >= 1 ? fila({ nombre: 'Sin asignar', color: '#9ca3af', monto: libre }, '', pctNeto(libre)) : ''));
  }

  function renderBarrasBolsillos() {
    const mes = leerMes(mesActual);
    $('chartBolsillos').innerHTML = state.bolsillos.map((b) => {
      const c = calcBolsillo(mes, b);
      const base = c.asignado + c.ingresos;
      const pct = base > 0 ? (c.gastos / base) * 100 : 0;
      const color = escapar(b.color);
      return `
        <div class="hbar-fila" title="${escapar(b.nombre)}: ${fmt(c.gastos)} de ${fmt(base)}">
          <span class="hbar-nombre">${escapar(b.nombre)}</span>
          <div class="hbar-track" style="background:var(--track)">
            <div class="hbar-fill" style="width:${Math.min(100, pct)}%;background:${b.ahorro ? color : estadoGasto(pct).color}"></div>
            <span class="hbar-txt">${fmt(c.gastos)} / ${fmt(base)}</span>
          </div>
          <span class="hbar-pct" style="color:${b.ahorro ? 'inherit' : estadoGasto(pct).color}">${Math.round(pct)}%</span>
        </div>`;
    }).join('');
  }

  function renderHistorico() {
    const W = 600, H = 230, L = 48, R = 8, T = 10, B = 28;
    const meses = Array.from({ length: 6 }, (_, i) => sumarMes(mesActual, i - 5));
    const datos = meses.map((m) => {
      const mes = leerMes(m);
      const r = resumenMes(mes);
      return { m, neto: netoMes(mes), gastado: r.gastado, ahorro: Math.max(0, r.ahorro) };
    });
    const max = escalaMax(Math.max(...datos.flatMap((d) => [d.neto, d.gastado, d.ahorro]), 1));
    const ph = H - T - B, gw = (W - L - R) / datos.length, bw = Math.min(22, gw / 4.2);
    const y = (v) => T + ph - (v / max) * ph;
    let svg = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      svg += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>
        <text class="eje" x="${L - 6}" y="${yy + 4}" text-anchor="end">${fmtCorto(v)}</text>`;
    }
    const series = [['neto', '#94a3b8'], ['gastado', '#ef4444'], ['ahorro', '#2563eb']];
    datos.forEach((d, i) => {
      const cx = L + gw * i + gw / 2;
      series.forEach(([k, color], j) => {
        const x = cx - (3 * bw + 6) / 2 + j * (bw + 3);
        const h = (d[k] / max) * ph;
        svg += `<rect x="${x}" y="${y(d[k])}" width="${bw}" height="${h}" rx="4" fill="${color}"
          opacity="${d.m === mesActual ? 1 : 0.75}"><title>${nombreMesCorto(d.m)} · ${k}: ${fmt(d[k])}</title></rect>`;
      });
      svg += `<text class="eje" x="${cx}" y="${H - 8}" text-anchor="middle"
        ${d.m === mesActual ? 'font-weight="700" style="fill:var(--texto)"' : ''}>${nombreMesCorto(d.m)} ${d.m.slice(2, 4)}</text>`;
    });
    $('chartHistorico').innerHTML = svg;
  }

  function renderDiario() {
    const W = 620, H = 220, L = 44, R = 8, T = 10, B = 26;
    const n = diasDelMes(mesActual);
    const dias = Array.from({ length: n }, () => ({}));
    let total = 0;
    for (const m of leerMes(mesActual).movimientos) {
      if (m.tipo !== 'gasto') continue;
      const d = Number(m.fecha.slice(8, 10)) - 1;
      if (!dias[d]) continue;
      dias[d][m.bolsilloId] = (dias[d][m.bolsilloId] || 0) + m.monto;
      total += m.monto;
    }
    const sumas = dias.map((d) => Object.values(d).reduce((s, v) => s + v, 0));
    const hoy = new Date();
    const diasTranscurridos = mesActual === mesDe(hoy) ? hoy.getDate() : (mesActual < mesDe(hoy) ? n : 0);
    const prom = diasTranscurridos ? total / diasTranscurridos : 0;
    $('promedioDiario').textContent = prom ? `Promedio: ${fmt(prom)}/día` : '';

    const max = escalaMax(Math.max(...sumas, prom, 1));
    const ph = H - T - B, cw = (W - L - R) / n, bw = Math.max(3, cw * 0.62);
    const y = (v) => T + ph - (v / max) * ph;
    let svg = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, yy = y(v);
      svg += `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/>
        <text class="eje" x="${L - 6}" y="${yy + 4}" text-anchor="end">${fmtCorto(v)}</text>`;
    }
    dias.forEach((d, i) => {
      const x = L + cw * i + (cw - bw) / 2;
      let base = 0;
      for (const b of state.bolsillos) {
        const v = d[b.id];
        if (!v) continue;
        const h = (v / max) * ph;
        svg += `<rect x="${x}" y="${y(base + v)}" width="${bw}" height="${h}" fill="${escapar(b.color)}">
          <title>Día ${i + 1} · ${escapar(b.nombre)}: ${fmt(v)}</title></rect>`;
        base += v;
      }
      const otros = sumas[i] - base; // bolsillos eliminados
      if (otros > 0) svg += `<rect x="${x}" y="${y(base + otros)}" width="${bw}" height="${(otros / max) * ph}" fill="#94a3b8"/>`;
      if (i === 0 || (i + 1) % 5 === 0) {
        svg += `<text class="eje" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${i + 1}</text>`;
      }
    });
    if (prom) {
      svg += `<line x1="${L}" x2="${W - R}" y1="${y(prom)}" y2="${y(prom)}" style="stroke:var(--texto)" stroke-dasharray="4 4" opacity=".5"/>
        <text x="${W - R}" y="${y(prom) - 5}" text-anchor="end" font-size="11" class="svg-txt" opacity=".7">prom. ${fmtCorto(prom)}</text>`;
    }
    if (!total) svg += `<text x="${(W + L) / 2}" y="${H / 2}" text-anchor="middle" class="eje" font-size="13">Sin gastos registrados este mes</text>`;
    $('chartDiario').innerHTML = svg;
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
        <select data-campo="modo" aria-label="Tipo de asignación">
          <option value="pct" ${esValor(b) ? '' : 'selected'}>%</option>
          <option value="valor" ${esValor(b) ? 'selected' : ''}>$</option>
        </select>
        <input type="number" data-campo="cantidad" value="${esValor(b) ? (b.valor || 0) : (b.porcentaje || 0)}"
          min="0" ${esValor(b) ? 'step="1000"' : 'max="100" step="0.5"'} inputmode="numeric"
          aria-label="${esValor(b) ? 'Valor fijo' : 'Porcentaje'}" placeholder="${esValor(b) ? 'Valor' : '%'}">
        <label><input type="checkbox" data-campo="ahorro" ${b.ahorro ? 'checked' : ''}> 💾 Ahorro</label>
        <button type="button" class="btn-borrar" data-quitar="${i}" aria-label="Quitar bolsillo">✕</button>
      </div>`).join('');
    actualizarTotalPct();
  }

  function actualizarTotalPct() {
    const neto = netoMes(leerMes(mesActual));
    const t = totalAsignado(borrador, neto);
    const pct = neto ? Math.round((t / neto) * 1000) / 10 : 0;
    $('totalPct').textContent = neto ? `${fmt(t)} de ${fmt(neto)} (${pct}%)` : fmt(t);
    $('totalPct').className = neto && Math.abs(neto - t) < 1 ? 'pos' : 'neg';
  }

  function guardarConfig() {
    const limpios = borrador
      .map((b) => ({
        ...b,
        nombre: b.nombre.trim(),
        modo: esValor(b) ? 'valor' : 'pct',
        porcentaje: Math.max(0, Number(b.porcentaje) || 0),
        valor: Math.max(0, Math.round(Number(b.valor) || 0)),
      }))
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
    if (campo === 'modo') {
      // Convierte el valor actual al nuevo modo usando el neto del mes visible
      const neto = netoMes(leerMes(mesActual));
      const monto = asignadoDe(b, neto);
      b.modo = e.target.value;
      if (esValor(b)) b.valor = monto;
      else b.porcentaje = neto ? Math.round((monto / neto) * 1000) / 10 : 0;
      renderConfig();
      return;
    }
    if (campo === 'cantidad') {
      if (esValor(b)) b.valor = e.target.value; else b.porcentaje = e.target.value;
      actualizarTotalPct();
      return;
    }
    b[campo] = campo === 'ahorro' ? e.target.checked : e.target.value;
  });

  $('configBolsillos').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quitar]');
    if (!btn) return;
    borrador.splice(Number(btn.dataset.quitar), 1);
    renderConfig();
  });

  $('btnAddBolsillo').addEventListener('click', () => {
    borrador.push({ id: uid(), nombre: 'Nuevo bolsillo', modo: 'pct', porcentaje: 0, valor: 0, color: '#64748b', ahorro: false });
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

  // ---------- Tema claro / oscuro ----------
  const TEMA_KEY = 'mis-cuentas-tema';
  function aplicarTema(t) {
    document.documentElement.dataset.theme = t;
    $('btnTema').textContent = t === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
    document.querySelector('meta[name="theme-color"]').content = t === 'dark' ? '#0b1a3a' : '#1e40af';
  }
  $('btnTema').addEventListener('click', () => {
    const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(TEMA_KEY, t); } catch (e) { /* sin storage */ }
    aplicarTema(t);
  });
  let temaGuardado = null;
  try { temaGuardado = localStorage.getItem(TEMA_KEY); } catch (e) { /* sin storage */ }
  aplicarTema(temaGuardado || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

  // ---------- Inicio ----------
  ajustarFechaForm();
  abrirConfig();
  render();
})();
