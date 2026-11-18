// Frontend del pronóstico. La API entrega las horas en UTC ("...Z");
// aquí todo se muestra en hora de Colombia (America/Bogota, UTC-5).
const ZONA = "America/Bogota";
const $ = (id) => document.getElementById(id);

const fmtHora = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA, weekday: "short", day: "2-digit", month: "short",
  hour: "2-digit", minute: "2-digit", hour12: true,
});
const fmtEje = new Intl.DateTimeFormat("es-CO", {
  timeZone: ZONA, day: "2-digit", month: "short", hour: "2-digit", hour12: true,
});
const fmtNum = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

const aColombia = (iso) => fmtHora.format(new Date(iso));
let unidad = "";        // se completa con el field del modelo (p. ej. "potencia")
let grafica = null;

// ------------------------------------------------------------- controles
const inHoras = $("horas");
const outHoras = $("horas-out");

function marcarRapido(h) {
  document.querySelectorAll(".rapidos button").forEach((b) =>
    b.classList.toggle("activo", Number(b.dataset.h) === Number(h)));
}
inHoras.addEventListener("input", () => {
  outHoras.textContent = `${inHoras.value} h`;
  marcarRapido(inHoras.value);
});
inHoras.addEventListener("change", cargar);
document.querySelectorAll(".rapidos button").forEach((b) =>
  b.addEventListener("click", () => {
    inHoras.value = b.dataset.h;
    outHoras.textContent = `${b.dataset.h} h`;
    marcarRapido(b.dataset.h);
    cargar();
  }));
$("historia").addEventListener("change", cargar);
$("confianza").addEventListener("change", cargar);
$("actualizar").addEventListener("click", cargar);

// ------------------------------------------------------------- utilidades
async function pedir(url) {
  let respuesta;
  try {
    respuesta = await fetch(url);
  } catch {
    throw new Error("No se pudo contactar la API. ¿Está corriendo el servidor en el puerto 8000?");
  }
  let datos = null;
  try { datos = await respuesta.json(); } catch { /* respuesta sin JSON */ }
  if (!respuesta.ok) {
    let detalle = datos && datos.detail;
    if (Array.isArray(detalle)) detalle = detalle.map((d) => d.msg).join("; ");
    throw new Error(`(${respuesta.status}) ${detalle || respuesta.statusText}`);
  }
  return datos;
}

function mostrarError(msg) {
  const caja = $("error");
  if (!msg) { caja.hidden = true; return; }
  caja.innerHTML = `<strong>No fue posible obtener el pronóstico</strong>${msg.replace(/</g, "&lt;")}`;
  caja.hidden = false;
}

function estadoPill(texto, clase) {
  const p = $("pill-estado");
  p.textContent = texto;
  p.className = "pill " + (clase || "");
}

const v = (x) => `${fmtNum.format(x)}${unidad ? " " + unidad : ""}`;

// ------------------------------------------------------------- pintar
function pintarKpis(d) {
  const pred = d.prediccion;
  const prox = pred[0];
  const max = pred.reduce((a, b) => (b.prediccion > a.prediccion ? b : a));
  const min = pred.reduce((a, b) => (b.prediccion < a.prediccion ? b : a));
  const ultimo = d.historico.length ? d.historico[d.historico.length - 1] : null;

  $("k-prox").textContent = v(prox.prediccion);
  $("k-prox-d").textContent = `${aColombia(prox.tiempo)} · ${fmtNum.format(prox.limite_inferior)} – ${fmtNum.format(prox.limite_superior)}`;
  $("k-max").textContent = v(max.prediccion);
  $("k-max-d").textContent = aColombia(max.tiempo);
  $("k-min").textContent = v(min.prediccion);
  $("k-min-d").textContent = aColombia(min.tiempo);
  $("k-ult").textContent = ultimo ? v(ultimo.valor) : "—";
  $("k-ult-d").textContent = aColombia(d.ultima_observacion);

  const aviso = $("aviso-relleno");
  if (d.horas_rellenadas > 0) {
    aviso.textContent = `⚠ ${d.horas_rellenadas} de ${d.horas_contexto_usadas} horas sin dato fueron rellenadas`;
    aviso.hidden = false;
  } else {
    aviso.hidden = true;
  }
}

function pintarGrafica(d) {
  const hist = d.historico.map((p) => ({ x: p.tiempo, y: p.valor }));
  const pred = d.prediccion;
  // El pronóstico arranca desde el último dato real para que la línea sea continua
  const ancla = hist.length ? [hist[hist.length - 1]] : [];
  const etiquetas = [...d.historico.map((p) => p.tiempo), ...pred.map((p) => p.tiempo)];
  const nivel = Math.round(d.confianza * 100);

  const datasets = [
    { label: `Límite superior (${nivel} %)`, data: [...ancla, ...pred.map((p) => ({ x: p.tiempo, y: p.limite_superior }))],
      borderWidth: 0, pointRadius: 0, fill: "+1", backgroundColor: "rgba(31,111,235,.15)" },
    { label: `Límite inferior (${nivel} %)`, data: [...ancla, ...pred.map((p) => ({ x: p.tiempo, y: p.limite_inferior }))],
      borderWidth: 0, pointRadius: 0, fill: false },
    { label: "Pronóstico", data: [...ancla, ...pred.map((p) => ({ x: p.tiempo, y: p.prediccion }))],
      borderColor: "#1f6feb", borderDash: [6, 4], borderWidth: 2, pointRadius: 2, fill: false, tension: .25 },
    { label: "Histórico", data: hist, borderColor: "#2b3446", borderWidth: 2, pointRadius: 0, fill: false, tension: .25 },
  ];

  const opciones = {
    responsive: true, maintainAspectRatio: false, parsing: { xAxisKey: "x", yAxisKey: "y" },
    interaction: { mode: "index", intersect: false },
    scales: {
      x: { type: "category", labels: etiquetas,
           ticks: { maxTicksLimit: 10, callback(val) { return fmtEje.format(new Date(this.getLabelForValue(val))); } },
           grid: { display: false } },
      y: { title: { display: !!unidad, text: unidad }, grid: { color: "#eef0f3" } },
    },
    plugins: {
      legend: { labels: { filter: (item) => !item.text.startsWith("Límite inferior"), usePointStyle: true },
                position: "bottom" },
      tooltip: { callbacks: {
        title: (items) => aColombia(items[0].label),
        label: (c) => ` ${c.dataset.label}: ${fmtNum.format(c.parsed.y)}`,
      } },
    },
  };

  if (grafica) grafica.destroy();
  grafica = new Chart($("grafica"), { type: "line", data: { datasets }, options: opciones });
}

function pintarTabla(d) {
  $("filas").innerHTML = d.prediccion.map((p) => `
    <tr><td>${aColombia(p.tiempo)}</td><td><strong>${fmtNum.format(p.prediccion)}</strong></td>
    <td>${fmtNum.format(p.limite_inferior)}</td><td>${fmtNum.format(p.limite_superior)}</td></tr>`).join("");
}

// ------------------------------------------------------------- carga
async function cargar() {
  const boton = $("actualizar");
  boton.disabled = true;
  estadoPill("Consultando…");
  const q = new URLSearchParams({
    horas: inHoras.value, historia: $("historia").value, confianza: $("confianza").value,
  });
  try {
    const d = await pedir(`/api/prediccion?${q}`);
    mostrarError(null);
    pintarKpis(d);
    pintarGrafica(d);
    pintarTabla(d);
    estadoPill("En línea", "ok");
  } catch (e) {
    mostrarError(e.message);
    estadoPill("Error", "mal");
  } finally {
    boton.disabled = false;
  }
}

async function cargarInfo() {
  try {
    const s = await pedir("/api/salud");
    const partes = [`Serie: ${s.measurement || "?"} / ${s.field || "?"}`];
    if (s.modo_demo) partes.push("MODO DEMO (datos sintéticos)");
    $("subtitulo").textContent = `${partes.join(" · ")} · hora de Colombia (UTC−5)`;
    $("pie").textContent = `Atendido por: ${s.atendido_por}`;
  } catch { /* el error principal lo muestra cargar() */ }
  try {
    const m = await pedir("/api/modelo");
    const o = m.order || m.config?.order, so = m.seasonal_order || m.config?.seasonal_order;
    if (o && so) $("pie").textContent += ` · SARIMA(${o.join(",")})(${so.join(",")})`;
  } catch { /* sin modelo: lo informa cargar() */ }
}

cargarInfo().then(cargar);
