import { useState, useEffect } from "react";
import { db, auth } from "./firebase";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getRolInfo, puedeModificar, esAdmin, puedeVerArea, puedeVerAsociacion } from "./auth";

// ─── PALETA ───────────────────────────────────────────────────────────────────
const C = {
  bg: "#F7F4EE", surface: "#FFFFFF", border: "#DDD8CE",
  terra: "#B5522A", terraLight: "#F2E8E3",
  olive: "#5A6B3A", oliveLight: "#EBF0E3",
  slate: "#3B5068", slateLight: "#E3EBF2",
  text: "#1E1E1E", muted: "#6B6660",
  danger: "#C0392B", dangerLight: "#FDECEA",
  gold: "#9A7B2A", goldLight: "#F5EDD9",
};

// ─── CONSTANTES ───────────────────────────────────────────────────────────────
const EMAILJS_SERVICE = "service_pcjaz5g";
const EMAILJS_TEMPLATE = "template_wgi8z9n";
const EMAILJS_KEY = "bW0siuepAncPncYKm";

const LOGOS_ASOC = { A1: "/logo-fbs.png", A2: "/logo-acj.png" };
const LOGOS_AREA = { AR1: "/logo-bacum.png", AR2: "/logo-caborca.png" };

const INITIAL_STATE = {
  asociaciones: [
    { id: "A1", nombre: "Fundación Borquez Schwarzbeck", color: C.terra, colorLight: C.terraLight },
    { id: "A2", nombre: "Comercio Justo Campos Bórquez", color: C.olive, colorLight: C.oliveLight },
  ],
  areas: [
    { id: "AR1", asociacionId: "A1", nombre: "Bácum / Campo 77" },
    { id: "AR2", asociacionId: "A1", nombre: "Caborca" },
    { id: "AR3", asociacionId: "A2", nombre: "Área Educativa" },
    { id: "AR4", asociacionId: "A2", nombre: "Área Comunitaria" },
  ],
  personas: [],
  eventos: [],
  gastos: [],
  proveedores: [],
  programasACJ: [],
  consecutivoGlobal: 0,
};

const CENTROS_COSTO = [
  "Operación General","Programa Preventivo","Becas Escolares",
  "Consulta Dental","Capacitación","Eventos Culturales",
  "Infraestructura","Prima Fairtrade","Otro",
];
const TIPO_EVENTO = ["Taller","Curso","Capacitación","Conferencia","Festejo","Asamblea","Actividad deportiva","Otro"];
const SEXO = ["Masculino","Femenino","No especificado"];
const MUNICIPIOS_SONORA = ["Etchojoa","Huatabampo","Navojoa","Cajeme","Álamos","Guaymas","Hermosillo","Caborca","Altar","Otro"];

// ─── FIREBASE ─────────────────────────────────────────────────────────────────
const DOC_REF = () => doc(db, "sigeac", "datos");

async function loadData() {
  try {
    const s = await getDoc(DOC_REF());
    if (s.exists()) return s.data();
  } catch(e) { console.error(e); }
  return INITIAL_STATE;
}

function cleanData(obj) {
  if (Array.isArray(obj)) return obj.map(cleanData);
  if (obj && typeof obj === "object") {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) clean[k] = cleanData(v);
    }
    return clean;
  }
  return obj;
}

async function saveData(data) {
  try {
    await setDoc(DOC_REF(), cleanData(data));
  } catch(e) {
    console.error("Firebase saveData error:", e);
  }
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("es-MX", { day:"2-digit", month:"short", year:"numeric" });
}

function calcEdad(fechaNac) {
  if (!fechaNac) return null;
  const hoy = new Date();
  const nac = new Date(fechaNac + "T12:00:00");
  let edad = hoy.getFullYear() - nac.getFullYear();
  if (hoy.getMonth() < nac.getMonth() || (hoy.getMonth() === nac.getMonth() && hoy.getDate() < nac.getDate())) edad--;
  return edad;
}

function grupoEdad(edad) {
  if (edad === null) return "No especificado";
  if (edad <= 12) return "6-12 años";
  if (edad <= 17) return "13-17 años";
  if (edad <= 25) return "18-25 años";
  if (edad <= 59) return "26-59 años";
  return "60+ años";
}

function generarID(año, areaId, consecutivo) {
  const prefijo = String(año).slice(-2).split("").reverse().join("");
  const areaMap = { AR1: "01", AR2: "02", AR3: "03", AR4: "04" };
  const areaCod = areaMap[areaId] || "00";
  const consec = String(consecutivo).padStart(2, "0");
  return prefijo + areaCod + consec;
}

async function enviarCorreoTesoreria(solicitud) {
  try {
    await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE,
        template_id: EMAILJS_TEMPLATE,
        user_id: EMAILJS_KEY,
        template_params: {
          solicitante: solicitud.solicitante || "—",
          asociacion: solicitud.asociacionNombre || "—",
          centro_costo: solicitud.centroCosto || "—",
          proveedor: solicitud.proveedor || "—",
          descripcion: solicitud.descripcion || "—",
          finalidad: solicitud.finalidad || "—",
          monto_mxn: solicitud.montoMXN ? "$" + solicitud.montoMXN + " MXN" : "—",
          monto_usd: solicitud.montoUSD ? "$" + solicitud.montoUSD + " USD" : "—",
          fecha: new Date().toLocaleDateString("es-MX"),
        }
      })
    });
  } catch(e) { console.error("EmailJS error:", e); }
}

// ─── ESTILOS ──────────────────────────────────────────────────────────────────
const S = {
  app: { minHeight:"100vh", background:C.bg, fontFamily:"'Inter',sans-serif", color:C.text },
  sidebar: { width:240, background:C.slate, minHeight:"100vh", display:"flex", flexDirection:"column", flexShrink:0 },
  sidebarHeader: { padding:"20px 16px 16px", borderBottom:"1px solid rgba(255,255,255,.1)" },
  sidebarLogo: { width:"100%", maxHeight:56, objectFit:"contain", marginBottom:8 },
  sidebarTitle: { color:"#FFF", fontSize:13, fontWeight:700, marginBottom:2 },
  sidebarSub: { color:"rgba(255,255,255,.45)", fontSize:10 },
  sidebarSection: { padding:"14px 12px 4px", color:"rgba(255,255,255,.35)", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.2 },
  sidebarItem: (active) => ({ display:"flex", alignItems:"center", gap:8, padding:"9px 14px", margin:"2px 8px", borderRadius:7, cursor:"pointer", color: active?"#FFF":"rgba(255,255,255,.6)", background: active?"rgba(255,255,255,.13)":"transparent", fontSize:13, fontWeight: active?600:400 }),
  main: { flex:1, overflow:"auto", padding:"28px 32px" },
  card: { background:C.surface, border:"1px solid "+C.border, borderRadius:12, padding:20 },
  badge: (color, bg) => ({ background:bg, color, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600, display:"inline-block" }),
  btn: (v="primary") => ({
    padding:"9px 16px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600,
    background: v==="primary"?C.terra: v==="olive"?C.olive: v==="slate"?C.slate: v==="ghost"?"transparent":C.border,
    color: ["primary","olive","slate"].includes(v)?"#FFF": v==="ghost"?C.terra:C.text,
    display:"inline-flex", alignItems:"center", gap:6,
  }),
  input: { width:"100%", padding:"9px 12px", border:"1px solid "+C.border, borderRadius:8, fontSize:13, background:C.surface, color:C.text, boxSizing:"border-box" },
  select: { width:"100%", padding:"9px 12px", border:"1px solid "+C.border, borderRadius:8, fontSize:13, background:C.surface, color:C.text, boxSizing:"border-box" },
  label: { fontSize:11, fontWeight:700, color:C.muted, marginBottom:5, display:"block", textTransform:"uppercase", letterSpacing:0.5 },
};

// ─── COMPONENTES BASE ─────────────────────────────────────────────────────────
function Icon({ name, size=16 }) {
  const icons = {
    home:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
    users:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    folder:"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    calendar:"M3 4h18v18H3z M16 2v4 M8 2v4 M3 10h18",
    dollar:"M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    plus:"M12 5v14 M5 12h14",
    search:"M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
    edit:"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    trash:"M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    x:"M18 6L6 18 M6 6l12 12",
    check:"M20 6L9 17l-5-5",
    logout:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
    menu:"M3 12h18 M3 6h18 M3 18h18",
    building:"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18 M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4",
    gift:"M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z",
    settings:"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    eye:"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  };
  const d = icons[name] || "";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {d.split(" M").map((seg, i) => <path key={i} d={i===0 ? seg : "M"+seg} />)}
    </svg>
  );
}

function Modal({ title, onClose, children, width=580 }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.surface, borderRadius:14, width, maxWidth:"100%", maxHeight:"92vh", overflow:"auto", boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ padding:"18px 22px", borderBottom:"1px solid "+C.border, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:15, fontWeight:700 }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:C.muted }}><Icon name="x" /></button>
        </div>
        <div style={{ padding:22 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, col }) {
  return (
    <div style={{ marginBottom:14, gridColumn: col }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon, color, bg }) {
  return (
    <div style={{ background:bg, border:"1px solid "+color+"33", borderRadius:12, padding:"16px 18px" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color, textTransform:"uppercase", letterSpacing:0.8, marginBottom:6 }}>{label}</div>
          <div style={{ fontSize:26, fontWeight:800, color }}>{value}</div>
        </div>
        <div style={{ color, opacity:0.45 }}><Icon name={icon} size={22} /></div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────────────────────
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !pass) return;
    setLoading(true);
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const rolInfo = getRolInfo(cred.user.email);
      if (!rolInfo) {
        await signOut(auth);
        setError("Este correo no tiene acceso al sistema.");
        setLoading(false);
        return;
      }
      onLogin(cred.user, rolInfo);
    } catch(e) {
      setError("Correo o contraseña incorrectos.");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div style={{ background:C.surface, borderRadius:16, padding:40, width:400, maxWidth:"100%", boxShadow:"0 8px 40px rgba(0,0,0,.12)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <img src="/logo-sgac.png" alt="SGAC" style={{ height:72, objectFit:"contain", marginBottom:16 }} onError={(e)=>{e.target.style.display="none"}} />
          <div style={{ fontSize:20, fontWeight:800, color:C.slate }}>SIGEAC</div>
          <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>Sistema de Gestión de Asociaciones Civiles</div>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={S.label}>Correo electrónico</label>
          <input style={S.input} type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="correo@ejemplo.com" />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={S.label}>Contraseña</label>
          <input style={S.input} type="password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()} placeholder="••••••••" />
        </div>
        {error && <div style={{ background:C.dangerLight, color:C.danger, padding:"10px 14px", borderRadius:8, fontSize:13, marginBottom:14 }}>{error}</div>}
        <button style={{ ...S.btn("slate"), width:"100%", justifyContent:"center", padding:12 }} onClick={handleLogin} disabled={loading}>
          {loading ? "Ingresando..." : "Ingresar"}
        </button>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({ data, rolInfo }) {
  const { personas, eventos, gastos, areas, asociaciones } = data;
  const asocsFiltradas = asociaciones.filter(a => puedeVerAsociacion(rolInfo, a.id));

  const totalPersonas = personas.filter(p => puedeVerAsociacion(rolInfo, p.asociacionId)).length;
  const totalEventos = eventos.filter(e => puedeVerAsociacion(rolInfo, e.asociacionId)).length;
  const totalGastos = gastos.filter(g => puedeVerAsociacion(rolInfo, g.asociacionId)).length;

  return (
    <div>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:22, fontWeight:800 }}>Panel General</div>
        <div style={{ fontSize:13, color:C.muted }}>Vista en tiempo real</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
        <StatCard label="Personas registradas" value={totalPersonas} icon="users" color={C.terra} bg={C.terraLight} />
        <StatCard label="Eventos realizados" value={totalEventos} icon="calendar" color={C.slate} bg={C.slateLight} />
        <StatCard label="Solicitudes de gasto" value={totalGastos} icon="dollar" color={C.gold} bg={C.goldLight} />
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        {asocsFiltradas.map(asoc => {
          const pAreas = areas.filter(a => a.asociacionId===asoc.id && puedeVerArea(rolInfo, a.id));
          const pPersonas = personas.filter(p => p.asociacionId===asoc.id && puedeVerAsociacion(rolInfo, p.asociacionId));
          const pEventos = eventos.filter(e => e.asociacionId===asoc.id && puedeVerAsociacion(rolInfo, e.asociacionId));
          return (
            <div key={asoc.id} style={{ ...S.card, borderTop:"4px solid "+asoc.color }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
                <img src={LOGOS_ASOC[asoc.id]} alt={asoc.nombre} style={{ height:32, objectFit:"contain" }} onError={e=>{e.target.style.display="none"}} />
                <span style={{ fontSize:14, fontWeight:700 }}>{asoc.nombre}</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
                {[{l:"Personas",v:pPersonas.length},{l:"Eventos",v:pEventos.length}].map(s=>(
                  <div key={s.l} style={{ background:asoc.colorLight, borderRadius:8, padding:"10px 14px" }}>
                    <div style={{ fontSize:22, fontWeight:800, color:asoc.color }}>{s.v}</div>
                    <div style={{ fontSize:11, color:C.muted }}>{s.l}</div>
                  </div>
                ))}
              </div>
              {pAreas.map(a=>{
                const cnt = personas.filter(p=>p.areaId===a.id).length;
                return (
                  <div key={a.id} style={{ display:"flex", justifyContent:"space-between", padding:"7px 10px", background:C.bg, borderRadius:7, marginBottom:4 }}>
                    <span style={{ fontSize:13 }}>{a.nombre}</span>
                    <span style={{ ...S.badge(asoc.color, asoc.colorLight), fontSize:10 }}>{cnt} personas</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PERSONAS (FBS) ───────────────────────────────────────────────────────────
function Personas({ data, setData, rolInfo }) {
  const [search, setSearch] = useState("");
  const [filtroArea, setFiltroArea] = useState("todas");
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({});
  const canEdit = puedeModificar(rolInfo);

  const { personas, areas, asociaciones } = data;
  const areasVisible = areas.filter(a => puedeVerArea(rolInfo, a.id) && puedeVerAsociacion(rolInfo, a.asociacionId));

  const lista = personas.filter(p => {
    if (!puedeVerArea(rolInfo, p.areaId)) return false;
    const txt = (p.nombre+" "+p.apellido+" "+(p.curp||"")+" "+(p.id||"")).toLowerCase();
    const matchSearch = txt.includes(search.toLowerCase());
    const matchArea = filtroArea==="todas" || p.areaId===filtroArea;
    return matchSearch && matchArea;
  });

  function abrirNuevo() {
    const area = areasVisible[0];
    setForm({ sexo:"No especificado", areaId: area?.id, asociacionId: area?.asociacionId });
    setEditando(null);
    setShowModal(true);
  }

  function abrirEditar(p) {
    setForm({ ...p });
    setEditando(p);
    setShowModal(true);
  }

  function guardar() {
    if (!form.nombre?.trim() || !form.apellido?.trim() || !form.areaId) {
      alert("Nombre, apellido y área son obligatorios.");
      return;
    }
    setData(prev => {
      let ps;
      if (editando) {
        ps = prev.personas.map(p => p.id===editando.id ? { ...form } : p);
      } else {
        const año = new Date().getFullYear();
        const consec = (prev.consecutivoGlobal || 0) + 1;
        const newId = generarID(año, form.areaId, consec);
        const area = prev.areas.find(a => a.id===form.areaId);
        ps = [...prev.personas, { ...form, id: newId, idInterno: uid(), asociacionId: area?.asociacionId, fechaRegistro: new Date().toISOString() }];
        const next = { ...prev, personas: ps, consecutivoGlobal: consec };
        saveData(next);
        setShowModal(false);
        return next;
      }
      const next = { ...prev, personas: ps };
      saveData(next);
      setShowModal(false);
      return next;
    });
  }

  function eliminar(id) {
    if (!confirm("¿Eliminar esta persona?")) return;
    setData(prev => {
      const next = { ...prev, personas: prev.personas.filter(p => p.idInterno!==id && p.id!==id) };
      saveData(next);
      return next;
    });
  }

  const asocOf = id => asociaciones.find(a=>a.id===id);
  const areaOf = id => areas.find(a=>a.id===id);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Personas registradas</div>
          <div style={{ fontSize:13, color:C.muted }}>{lista.length} registros</div>
        </div>
        {canEdit && <button style={S.btn()} onClick={abrirNuevo}><Icon name="plus" size={15}/> Nueva persona</button>}
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:16 }}>
        <div style={{ flex:1, position:"relative" }}>
          <input style={{ ...S.input, paddingLeft:36 }} placeholder="Buscar por nombre, CURP o ID..." value={search} onChange={e=>setSearch(e.target.value)} />
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:C.muted }}><Icon name="search" size={14}/></span>
        </div>
        <select style={{ ...S.select, width:180 }} value={filtroArea} onChange={e=>setFiltroArea(e.target.value)}>
          <option value="todas">Todas las áreas</option>
          {areasVisible.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>
      <div style={S.card}>
        {lista.length===0 ? (
          <div style={{ textAlign:"center", padding:40, color:C.muted }}>No hay personas con esos filtros.</div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:"2px solid "+C.border }}>
                {["ID","Nombre","Área","Sexo","Edad","Municipio",""].map(h=>(
                  <th key={h} style={{ textAlign:"left", padding:"8px 10px", fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(p=>{
                const asoc = asocOf(p.asociacionId);
                const area = areaOf(p.areaId);
                const edad = calcEdad(p.fechaNac);
                return (
                  <tr key={p.id} style={{ borderBottom:"1px solid "+C.border }}>
                    <td style={{ padding:"10px 10px", fontFamily:"monospace", fontWeight:700, color:C.slate, fontSize:14 }}>{p.id}</td>
                    <td style={{ padding:"10px 10px", fontWeight:600 }}>{p.nombre} {p.apellido}</td>
                    <td style={{ padding:"10px 10px" }}>
                      {asoc && <span style={{ ...S.badge(asoc.color, asoc.colorLight), fontSize:10 }}>{area?.nombre}</span>}
                    </td>
                    <td style={{ padding:"10px 10px", color:C.muted }}>{p.sexo}</td>
                    <td style={{ padding:"10px 10px", color:C.muted }}>{edad!==null ? edad+" años" : "—"}</td>
                    <td style={{ padding:"10px 10px", color:C.muted }}>{p.municipio||"—"}</td>
                    <td style={{ padding:"10px 10px" }}>
                      {canEdit && (
                        <div style={{ display:"flex", gap:4 }}>
                          <button style={{ ...S.btn("ghost"), padding:"5px 8px" }} onClick={()=>abrirEditar(p)}><Icon name="edit" size={13}/></button>
                          <button style={{ ...S.btn("ghost"), padding:"5px 8px", color:C.danger }} onClick={()=>eliminar(p.idInterno||p.id)}><Icon name="trash" size={13}/></button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title={editando?"Editar persona":"Nueva persona"} onClose={()=>setShowModal(false)}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="Nombre(s) *"><input style={S.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
            <Field label="Apellido(s) *"><input style={S.input} value={form.apellido||""} onChange={e=>setForm(f=>({...f,apellido:e.target.value}))}/></Field>
            <Field label="Área *">
              <select style={S.select} value={form.areaId||""} onChange={e=>{
                const area = data.areas.find(a=>a.id===e.target.value);
                setForm(f=>({...f,areaId:e.target.value,asociacionId:area?.asociacionId}));
              }}>
                <option value="">Seleccionar...</option>
                {areasVisible.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
            <Field label="Sexo">
              <select style={S.select} value={form.sexo||"No especificado"} onChange={e=>setForm(f=>({...f,sexo:e.target.value}))}>
                {SEXO.map(s=><option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Fecha de nacimiento"><input type="date" style={S.input} value={form.fechaNac||""} onChange={e=>setForm(f=>({...f,fechaNac:e.target.value}))}/></Field>
            <Field label="CURP"><input style={S.input} value={form.curp||""} onChange={e=>setForm(f=>({...f,curp:e.target.value.toUpperCase()}))} maxLength={18}/></Field>
            <Field label="Teléfono"><input style={S.input} value={form.telefono||""} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))}/></Field>
            <Field label="Localidad"><input style={S.input} value={form.localidad||""} onChange={e=>setForm(f=>({...f,localidad:e.target.value}))}/></Field>
            <Field label="Municipio">
              <select style={S.select} value={form.municipio||""} onChange={e=>setForm(f=>({...f,municipio:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {MUNICIPIOS_SONORA.map(m=><option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Observaciones">
            <textarea style={{ ...S.input, minHeight:64, resize:"vertical" }} value={form.observaciones||""} onChange={e=>setForm(f=>({...f,observaciones:e.target.value}))}/>
          </Field>
          {!editando && (
            <div style={{ background:C.slateLight, borderRadius:8, padding:"10px 14px", marginBottom:14, fontSize:13 }}>
              <strong>ID que se asignará:</strong> {form.areaId ? generarID(new Date().getFullYear(), form.areaId, (data.consecutivoGlobal||0)+1) : "—"}
            </div>
          )}
          <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
            <button style={S.btn("neutral")} onClick={()=>setShowModal(false)}>Cancelar</button>
            <button style={S.btn()} onClick={guardar}><Icon name="check" size={14}/> Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── EXPEDIENTES ──────────────────────────────────────────────────────────────
function Expedientes({ data, rolInfo }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const { personas, areas, asociaciones, eventos } = data;

  const lista = personas.filter(p => {
    if (!puedeVerArea(rolInfo, p.areaId)) return false;
    const txt = (p.nombre+" "+p.apellido+" "+(p.id||"")).toLowerCase();
    return txt.includes(search.toLowerCase());
  });

  const persona = selected ? personas.find(p => p.id===selected || p.idInterno===selected) : null;

  const eventosParticipando = persona ? eventos.filter(e =>
    e.participantes?.some(pp => pp.id===persona.id || pp.id===persona.idInterno)
  ) : [];

  const inversionTotal = eventosParticipando.reduce((sum, e) => {
    const part = e.participantes?.find(pp => pp.id===persona?.id || pp.id===persona?.idInterno);
    return sum + (part?.costoPorParticipante || 0);
  }, 0);

  const asocOf = id => asociaciones.find(a=>a.id===id);
  const areaOf = id => areas.find(a=>a.id===id);

  return (
    <div style={{ display:"flex", gap:20, height:"calc(100vh - 120px)" }}>
      <div style={{ width:260, flexShrink:0, display:"flex", flexDirection:"column" }}>
        <div style={{ position:"relative", marginBottom:12 }}>
          <input style={{ ...S.input, paddingLeft:34 }} placeholder="Buscar persona..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <span style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)", color:C.muted }}><Icon name="search" size={14}/></span>
        </div>
        <div style={{ flex:1, overflow:"auto", display:"flex", flexDirection:"column", gap:6 }}>
          {lista.map(p => {
            const isSelected = selected===p.id || selected===p.idInterno;
            const asoc = asocOf(p.asociacionId);
            return (
              <div key={p.id} onClick={()=>setSelected(p.id)} style={{ background:isSelected?C.terra:C.surface, border:"1px solid "+(isSelected?C.terra:C.border), borderRadius:10, padding:"11px 13px", cursor:"pointer" }}>
                <div style={{ fontWeight:600, fontSize:13, color:isSelected?"#FFF":C.text }}>{p.nombre} {p.apellido}</div>
                <div style={{ fontSize:11, color:isSelected?"rgba(255,255,255,.65)":C.muted, marginTop:2 }}>{p.id} · {areaOf(p.areaId)?.nombre}</div>
              </div>
            );
          })}
          {lista.length===0 && <div style={{ color:C.muted, fontSize:13, textAlign:"center", marginTop:20 }}>Sin resultados</div>}
        </div>
      </div>
      <div style={{ flex:1, overflow:"auto" }}>
        {!persona ? (
          <div style={{ ...S.card, height:"100%", display:"flex", alignItems:"center", justifyContent:"center", color:C.muted, flexDirection:"column", gap:12 }}>
            <Icon name="folder" size={40}/>
            <span>Selecciona una persona para ver su expediente</span>
          </div>
        ) : (
          <div>
            <div style={{ ...S.card, marginBottom:16, borderLeft:"5px solid "+(asocOf(persona.asociacionId)?.color||C.terra) }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:20, fontWeight:800 }}>{persona.nombre} {persona.apellido}</div>
                  <div style={{ fontSize:13, color:C.muted, marginTop:4 }}>
                    ID: <strong style={{ fontFamily:"monospace" }}>{persona.id}</strong> · {areaOf(persona.areaId)?.nombre}
                  </div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:11, color:C.muted }}>Inversión total</div>
                  <div style={{ fontSize:22, fontWeight:800, color:C.gold }}>${inversionTotal.toFixed(2)}</div>
                </div>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                {[
                  {l:"Sexo",v:persona.sexo||"—"},
                  {l:"Edad",v:persona.fechaNac?calcEdad(persona.fechaNac)+" años":"—"},
                  {l:"Municipio",v:persona.municipio||"—"},
                  {l:"Teléfono",v:persona.telefono||"—"},
                ].map(f=>(
                  <div key={f.l}>
                    <div style={{ fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase" }}>{f.l}</div>
                    <div style={{ fontSize:13, marginTop:2 }}>{f.v}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ ...S.card }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Participación en eventos ({eventosParticipando.length})</div>
              {eventosParticipando.length===0 ? (
                <div style={{ color:C.muted, fontSize:13 }}>Sin participación en eventos registrados.</div>
              ) : eventosParticipando.map(e => {
                const part = e.participantes?.find(pp => pp.id===persona.id || pp.id===persona.idInterno);
                return (
                  <div key={e.id} style={{ padding:"12px 0", borderBottom:"1px solid "+C.border, display:"flex", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13 }}>{e.nombre}</div>
                      <div style={{ fontSize:12, color:C.muted, marginTop:3 }}>{e.tipo} · {fmtDate(e.fechaInicio)}</div>
                    </div>
                    {part?.costoPorParticipante > 0 && (
                      <span style={S.badge(C.gold, C.goldLight)}>${part.costoPorParticipante.toFixed(2)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── EVENTOS (FBS) ────────────────────────────────────────────────────────────
function Eventos({ data, setData, rolInfo }) {
  const [step, setStep] = useState(null); // null = lista, "nuevo" = form
  const [form, setForm] = useState({});
  const [sesiones, setSesiones] = useState([]);
  const [conceptos, setConceptos] = useState([]);
  const [participantes, setParticipantes] = useState([]);
  const [buscarID, setBuscarID] = useState("");
  const [viewEvento, setViewEvento] = useState(null);
  const canEdit = puedeModificar(rolInfo);

  const { eventos, personas, areas, asociaciones } = data;
  const areasVisible = areas.filter(a => puedeVerArea(rolInfo, a.id) && puedeVerAsociacion(rolInfo, a.asociacionId));
  const eventosVisible = eventos.filter(e => puedeVerAsociacion(rolInfo, e.asociacionId));

  function iniciarNuevo() {
    const area = areasVisible[0];
    setForm({ tipo:"Taller", asociacionId: area?.asociacionId, areaId: area?.id });
    setSesiones([]);
    setConceptos([]);
    setParticipantes([]);
    setStep("nuevo");
  }

  function agregarSesion() {
    setSesiones(s => [...s, { id:uid(), fecha:"", duracion:60 }]);
  }

  function agregarConcepto() {
    setConceptos(c => [...c, { id:uid(), descripcion:"", cantidad:1, precio:0 }]);
  }

  function buscarParticipante() {
    const found = personas.find(p => (p.id===buscarID.trim() || p.idInterno===buscarID.trim()) && puedeVerArea(rolInfo, p.areaId));
    if (!found) { alert("ID no encontrado."); return; }
    if (participantes.find(p => p.id===found.id)) { alert("Ya está inscrito."); return; }
    setParticipantes(prev => [...prev, { id: found.id, nombre: found.nombre+" "+found.apellido }]);
    setBuscarID("");
  }

  function guardarEvento() {
    if (!form.nombre?.trim() || !form.tipo || !form.asociacionId) {
      alert("Nombre, tipo y asociación son obligatorios.");
      return;
    }
    const totalMinutos = sesiones.reduce((s, ses) => s + Number(ses.duracion||0), 0);
    const costoTotal = conceptos.reduce((s, c) => s + Number(c.cantidad||0)*Number(c.precio||0), 0);
    const costoPorParticipante = participantes.length > 0 ? costoTotal / participantes.length : 0;

    const participantesConCosto = participantes.map(p => ({ ...p, costoPorParticipante }));

    const evento = {
      ...form,
      id: uid(),
      sesiones,
      conceptos,
      participantes: participantesConCosto,
      totalSesiones: sesiones.length,
      totalHoras: (totalMinutos/60).toFixed(1),
      costoTotal,
      costoPorParticipante,
      fechaCreacion: new Date().toISOString(),
      finalizado: false,
    };

    setData(prev => {
      const next = { ...prev, eventos: [...prev.eventos, evento] };
      saveData(next);
      return next;
    });
    setStep(null);
  }

  function finalizarEvento(id) {
    setData(prev => {
      const next = { ...prev, eventos: prev.eventos.map(e => e.id===id ? { ...e, finalizado:true } : e) };
      saveData(next);
      return next;
    });
  }

  function eliminarEvento(id) {
    if (!confirm("¿Eliminar este evento?")) return;
    setData(prev => {
      const next = { ...prev, eventos: prev.eventos.filter(e => e.id!==id) };
      saveData(next);
      return next;
    });
  }

  if (viewEvento) {
    const e = eventos.find(ev => ev.id===viewEvento);
    if (!e) { setViewEvento(null); return null; }
    const generosCount = {};
    const edadesCount = {};
    (e.participantes||[]).forEach(p => {
      const persona = personas.find(pp => pp.id===p.id);
      if (persona) {
        const g = persona.sexo||"No especificado";
        generosCount[g] = (generosCount[g]||0)+1;
        const gr = grupoEdad(calcEdad(persona.fechaNac));
        edadesCount[gr] = (edadesCount[gr]||0)+1;
      }
    });
    return (
      <div>
        <button style={{ ...S.btn("ghost"), marginBottom:16 }} onClick={()=>setViewEvento(null)}>← Volver</button>
        <div style={{ ...S.card, marginBottom:16 }}>
          <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>{e.nombre}</div>
          <div style={{ fontSize:13, color:C.muted, marginBottom:14 }}>{e.tipo} · {fmtDate(e.fechaInicio)}</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            {[
              {l:"Sesiones",v:e.totalSesiones||0},
              {l:"Horas totales",v:e.totalHoras||0},
              {l:"Participantes",v:(e.participantes||[]).length},
              {l:"Costo total",v:"$"+(e.costoTotal||0).toFixed(2)},
            ].map(s=>(
              <div key={s.l} style={{ background:C.bg, borderRadius:8, padding:"12px 14px" }}>
                <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", fontWeight:700 }}>{s.l}</div>
                <div style={{ fontSize:20, fontWeight:800, color:C.slate }}>{s.v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <div style={S.card}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Por género</div>
            {Object.entries(generosCount).map(([g,n])=>(
              <div key={g} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid "+C.border, fontSize:13 }}>
                <span>{g}</span><strong>{n}</strong>
              </div>
            ))}
            {Object.keys(generosCount).length===0 && <div style={{ color:C.muted, fontSize:12 }}>Sin datos de género</div>}
          </div>
          <div style={S.card}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>Por grupo de edad</div>
            {["6-12 años","13-17 años","18-25 años","26-59 años","60+ años"].map(gr=>(
              <div key={gr} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:"1px solid "+C.border, fontSize:13 }}>
                <span>{gr}</span><strong>{edadesCount[gr]||0}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (step==="nuevo") {
    const costoTotal = conceptos.reduce((s,c) => s+Number(c.cantidad||0)*Number(c.precio||0), 0);
    return (
      <div>
        <button style={{ ...S.btn("ghost"), marginBottom:16 }} onClick={()=>setStep(null)}>← Cancelar</button>
        <div style={{ ...S.card, marginBottom:16 }}>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:14 }}>Datos del evento</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="Nombre del evento *"><input style={S.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
            <Field label="Tipo *">
              <select style={S.select} value={form.tipo||""} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))}>
                {TIPO_EVENTO.map(t=><option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Área">
              <select style={S.select} value={form.areaId||""} onChange={e=>{
                const area = data.areas.find(a=>a.id===e.target.value);
                setForm(f=>({...f,areaId:e.target.value,asociacionId:area?.asociacionId}));
              }}>
                {areasVisible.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
            <Field label="Responsable"><input style={S.input} value={form.responsable||""} onChange={e=>setForm(f=>({...f,responsable:e.target.value}))}/></Field>
            <Field label="Fecha inicio"><input type="date" style={S.input} value={form.fechaInicio||""} onChange={e=>setForm(f=>({...f,fechaInicio:e.target.value}))}/></Field>
            <Field label="Fecha fin"><input type="date" style={S.input} value={form.fechaFin||""} onChange={e=>setForm(f=>({...f,fechaFin:e.target.value}))}/></Field>
            <Field label="Lugar"><input style={S.input} value={form.lugar||""} onChange={e=>setForm(f=>({...f,lugar:e.target.value}))}/></Field>
          </div>
          <Field label="Descripción">
            <textarea style={{ ...S.input, minHeight:60, resize:"vertical" }} value={form.descripcion||""} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/>
          </Field>
        </div>

        <div style={{ ...S.card, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:16, fontWeight:700 }}>Sesiones</div>
            <button style={S.btn("olive")} onClick={agregarSesion}><Icon name="plus" size={13}/> Agregar sesión</button>
          </div>
          {sesiones.map((ses,i)=>(
            <div key={ses.id} style={{ display:"grid", gridTemplateColumns:"1fr 1fr auto", gap:10, marginBottom:10, alignItems:"end" }}>
              <div>
                <label style={S.label}>Fecha sesión {i+1}</label>
                <input type="date" style={S.input} value={ses.fecha} onChange={e=>setSesiones(s=>s.map(ss=>ss.id===ses.id?{...ss,fecha:e.target.value}:ss))}/>
              </div>
              <div>
                <label style={S.label}>Duración (minutos)</label>
                <input type="number" style={S.input} value={ses.duracion} onChange={e=>setSesiones(s=>s.map(ss=>ss.id===ses.id?{...ss,duracion:e.target.value}:ss))}/>
              </div>
              <button style={{ ...S.btn("ghost"), color:C.danger, padding:"9px 10px" }} onClick={()=>setSesiones(s=>s.filter(ss=>ss.id!==ses.id))}><Icon name="x" size={14}/></button>
            </div>
          ))}
          {sesiones.length===0 && <div style={{ color:C.muted, fontSize:13 }}>Sin sesiones agregadas.</div>}
        </div>

        <div style={{ ...S.card, marginBottom:16 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:16, fontWeight:700 }}>Presupuesto</div>
            <button style={S.btn("olive")} onClick={agregarConcepto}><Icon name="plus" size={13}/> Agregar concepto</button>
          </div>
          {conceptos.map((c,i)=>(
            <div key={c.id} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr auto", gap:10, marginBottom:10, alignItems:"end" }}>
              <div>
                <label style={S.label}>Descripción</label>
                <input style={S.input} value={c.descripcion} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,descripcion:e.target.value}:cc))}/>
              </div>
              <div>
                <label style={S.label}>Cantidad</label>
                <input type="number" style={S.input} value={c.cantidad} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,cantidad:e.target.value}:cc))}/>
              </div>
              <div>
                <label style={S.label}>Precio unit.</label>
                <input type="number" style={S.input} value={c.precio} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,precio:e.target.value}:cc))}/>
              </div>
              <button style={{ ...S.btn("ghost"), color:C.danger, padding:"9px 10px" }} onClick={()=>setConceptos(cs=>cs.filter(cc=>cc.id!==c.id))}><Icon name="x" size={14}/></button>
            </div>
          ))}
          {conceptos.length>0 && (
            <div style={{ textAlign:"right", fontSize:14, fontWeight:700, color:C.terra, marginTop:8 }}>
              Total: ${costoTotal.toFixed(2)}
            </div>
          )}
        </div>

        <div style={{ ...S.card, marginBottom:20 }}>
          <div style={{ fontSize:16, fontWeight:700, marginBottom:12 }}>Inscripción de participantes</div>
          <div style={{ display:"flex", gap:10, marginBottom:14 }}>
            <input style={{ ...S.input, flex:1 }} placeholder="Buscar por ID del participante..." value={buscarID} onChange={e=>setBuscarID(e.target.value)} onKeyDown={e=>e.key==="Enter"&&buscarParticipante()}/>
            <button style={S.btn("olive")} onClick={buscarParticipante}><Icon name="plus" size={14}/> Agregar</button>
          </div>
          {participantes.length===0 ? (
            <div style={{ color:C.muted, fontSize:13 }}>Sin participantes inscritos.</div>
          ) : participantes.map(p=>(
            <div key={p.id} style={{ display:"flex", justifyContent:"space-between", padding:"8px 12px", background:C.bg, borderRadius:7, marginBottom:6 }}>
              <span style={{ fontSize:13 }}><strong style={{ fontFamily:"monospace" }}>{p.id}</strong> — {p.nombre}</span>
              <button style={{ ...S.btn("ghost"), padding:"3px 8px", color:C.danger }} onClick={()=>setParticipantes(pp=>pp.filter(x=>x.id!==p.id))}><Icon name="x" size={13}/></button>
            </div>
          ))}
          <div style={{ marginTop:12, fontSize:13, color:C.muted }}>{participantes.length} participantes · Costo por participante: ${participantes.length>0?(costoTotal/participantes.length).toFixed(2):"—"}</div>
        </div>

        <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
          <button style={S.btn("neutral")} onClick={()=>setStep(null)}>Cancelar</button>
          <button style={S.btn()} onClick={guardarEvento}><Icon name="check" size={14}/> Crear evento</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Eventos</div>
          <div style={{ fontSize:13, color:C.muted }}>{eventosVisible.length} eventos</div>
        </div>
        {canEdit && <button style={S.btn()} onClick={iniciarNuevo}><Icon name="plus" size={15}/> Nuevo evento</button>}
      </div>
      {eventosVisible.length===0 ? (
        <div style={{ ...S.card, textAlign:"center", padding:40, color:C.muted }}>No hay eventos registrados.</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          {eventosVisible.map(e=>{
            const asoc = asociaciones.find(a=>a.id===e.asociacionId);
            return (
              <div key={e.id} style={{ ...S.card, borderLeft:"4px solid "+(asoc?.color||C.border) }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{e.nombre}</div>
                    <div style={{ display:"flex", gap:8, marginTop:6 }}>
                      <span style={S.badge(C.slate, C.slateLight)}>{e.tipo}</span>
                      {e.finalizado && <span style={S.badge(C.olive, C.oliveLight)}>Finalizado</span>}
                    </div>
                    <div style={{ fontSize:12, color:C.muted, marginTop:6 }}>{fmtDate(e.fechaInicio)}</div>
                    <div style={{ fontSize:12, color:C.muted }}>
                      {(e.participantes||[]).length} participantes · ${(e.costoTotal||0).toFixed(2)}
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                    <button style={{ ...S.btn("ghost"), padding:"5px 8px" }} onClick={()=>setViewEvento(e.id)}><Icon name="eye" size={13}/></button>
                    {canEdit && !e.finalizado && (
                      <button style={{ ...S.btn("olive"), padding:"5px 10px", fontSize:11 }} onClick={()=>finalizarEvento(e.id)}>Finalizar</button>
                    )}
                    {canEdit && (
                      <button style={{ ...S.btn("ghost"), padding:"5px 8px", color:C.danger }} onClick={()=>eliminarEvento(e.id)}><Icon name="trash" size={13}/></button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── GASTOS ───────────────────────────────────────────────────────────────────
function Gastos({ data, setData, rolInfo, userEmail }) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({});
  const [conceptos, setConceptos] = useState([{ id:uid(), descripcion:"", cantidad:1, precio:0 }]);
  const [proveedorQuery, setProveedorQuery] = useState("");
  const [showSugestiones, setShowSugestiones] = useState(false);
  const canEdit = puedeModificar(rolInfo);
  const canCreate = canEdit && rolInfo?.rol !== "direccion";

  const { gastos, proveedores, asociaciones } = data;
  const gastosVisible = gastos.filter(g => puedeVerAsociacion(rolInfo, g.asociacionId) || rolInfo?.verGastos);

  const sugerenciasProveedor = proveedores.filter(p =>
    p.nombre?.toLowerCase().includes(proveedorQuery.toLowerCase()) ||
    p.rfc?.toLowerCase().includes(proveedorQuery.toLowerCase())
  );

  function seleccionarProveedor(p) {
    setForm(f => ({ ...f, proveedor:p.nombre, rfc:p.rfc, banco:p.banco, clabe:p.clabe }));
    setProveedorQuery(p.nombre);
    setShowSugestiones(false);
  }

  async function guardar() {
    if (!form.asociacionId || !form.descripcion?.trim()) {
      alert("Asociación y descripción son obligatorios.");
      return;
    }
    const costoTotal = conceptos.reduce((s,c) => s+Number(c.cantidad||0)*Number(c.precio||0), 0);
    const asoc = asociaciones.find(a=>a.id===form.asociacionId);
    const solicitud = {
      ...form,
      id: uid(),
      conceptos,
      montoTotal: costoTotal,
      asociacionNombre: asoc?.nombre,
      solicitante: userEmail,
      estatus: "Pendiente",
      fecha: new Date().toISOString(),
    };

    // Guardar proveedor si es nuevo
    if (form.proveedor && !proveedores.find(p=>p.nombre===form.proveedor)) {
      const newProv = { id:uid(), nombre:form.proveedor, rfc:form.rfc||"", banco:form.banco||"", clabe:form.clabe||"" };
      setData(prev => {
        const next = { ...prev, gastos:[...prev.gastos, solicitud], proveedores:[...prev.proveedores, newProv] };
        saveData(next);
        return next;
      });
    } else {
      setData(prev => {
        const next = { ...prev, gastos:[...prev.gastos, solicitud] };
        saveData(next);
        return next;
      });
    }

    await enviarCorreoTesoreria(solicitud);
    setShowModal(false);
    setForm({});
    setConceptos([{ id:uid(), descripcion:"", cantidad:1, precio:0 }]);
    setProveedorQuery("");
  }

  function cambiarEstatus(id, estatus) {
    setData(prev => {
      const next = { ...prev, gastos: prev.gastos.map(g => g.id===id ? {...g, estatus} : g) };
      saveData(next);
      return next;
    });
  }

  const ESTATUSES = ["Pendiente","Aprobado","Pagado","Rechazado"];
  const estatusColor = { Pendiente:[C.gold,C.goldLight], Aprobado:[C.olive,C.oliveLight], Pagado:[C.slate,C.slateLight], Rechazado:[C.danger,C.dangerLight] };

  const costoModal = conceptos.reduce((s,c)=>s+Number(c.cantidad||0)*Number(c.precio||0),0);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Solicitudes de gasto</div>
          <div style={{ fontSize:13, color:C.muted }}>{gastosVisible.length} solicitudes</div>
        </div>
        {canCreate && <button style={S.btn()} onClick={()=>setShowModal(true)}><Icon name="plus" size={15}/> Nueva solicitud</button>}
      </div>
      <div style={S.card}>
        {gastosVisible.length===0 ? (
          <div style={{ textAlign:"center", padding:40, color:C.muted }}>Sin solicitudes registradas.</div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:"2px solid "+C.border }}>
                {["Fecha","Solicitante","Asociación","Proveedor","Descripción","Total","Estatus",""].map(h=>(
                  <th key={h} style={{ textAlign:"left", padding:"8px 10px", fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gastosVisible.map(g=>{
                const [sc,bg] = estatusColor[g.estatus]||[C.muted,C.bg];
                return (
                  <tr key={g.id} style={{ borderBottom:"1px solid "+C.border }}>
                    <td style={{ padding:"10px 10px", color:C.muted }}>{fmtDate(g.fecha)}</td>
                    <td style={{ padding:"10px 10px", fontSize:12 }}>{g.solicitante}</td>
                    <td style={{ padding:"10px 10px" }}><span style={S.badge(C.slate,C.slateLight)}>{g.asociacionNombre}</span></td>
                    <td style={{ padding:"10px 10px" }}>{g.proveedor||"—"}</td>
                    <td style={{ padding:"10px 10px", maxWidth:200 }}>{g.descripcion}</td>
                    <td style={{ padding:"10px 10px", fontWeight:700 }}>${(g.montoTotal||g.montoMXN||0).toFixed(2)}</td>
                    <td style={{ padding:"10px 10px" }}>
                      {canEdit ? (
                        <select style={{ ...S.select, width:"auto", padding:"4px 8px", fontSize:12, background:bg, color:sc, fontWeight:600 }}
                          value={g.estatus} onChange={e=>cambiarEstatus(g.id,e.target.value)}>
                          {ESTATUSES.map(s=><option key={s}>{s}</option>)}
                        </select>
                      ) : (
                        <span style={S.badge(sc,bg)}>{g.estatus}</span>
                      )}
                    </td>
                    <td style={{ padding:"10px 10px" }}></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <Modal title="Nueva solicitud de gasto" onClose={()=>setShowModal(false)} width={640}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Field label="Asociación *">
              <select style={S.select} value={form.asociacionId||""} onChange={e=>setForm(f=>({...f,asociacionId:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {asociaciones.filter(a=>puedeVerAsociacion(rolInfo,a.id)).map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
            <Field label="Centro de costo">
              <select style={S.select} value={form.centroCosto||""} onChange={e=>setForm(f=>({...f,centroCosto:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {CENTROS_COSTO.map(c=><option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Finalidad / descripción del gasto *">
            <textarea style={{ ...S.input, minHeight:56, resize:"vertical" }} value={form.descripcion||""} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/>
          </Field>
          <Field label="Finalidad específica (programa)">
            <input style={S.input} placeholder="¿Para qué programa o proyecto es?" value={form.finalidad||""} onChange={e=>setForm(f=>({...f,finalidad:e.target.value}))}/>
          </Field>

          <div style={{ borderTop:"1px solid "+C.border, paddingTop:14, marginTop:4, marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <label style={{ ...S.label, marginBottom:0 }}>Conceptos del gasto</label>
              <button style={{ ...S.btn("olive"), padding:"5px 12px", fontSize:12 }} onClick={()=>setConceptos(cs=>[...cs,{id:uid(),descripcion:"",cantidad:1,precio:0}])}>+ Concepto</button>
            </div>
            {conceptos.map(c=>(
              <div key={c.id} style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr auto", gap:8, marginBottom:8, alignItems:"end" }}>
                <input style={S.input} placeholder="Descripción" value={c.descripcion} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,descripcion:e.target.value}:cc))}/>
                <input type="number" style={S.input} placeholder="Cant." value={c.cantidad} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,cantidad:e.target.value}:cc))}/>
                <input type="number" style={S.input} placeholder="Precio" value={c.precio} onChange={e=>setConceptos(cs=>cs.map(cc=>cc.id===c.id?{...cc,precio:e.target.value}:cc))}/>
                <button style={{ ...S.btn("ghost"), color:C.danger, padding:"9px 8px" }} onClick={()=>setConceptos(cs=>cs.filter(cc=>cc.id!==c.id))}><Icon name="x" size={13}/></button>
              </div>
            ))}
            <div style={{ textAlign:"right", fontWeight:700, color:C.terra, fontSize:14 }}>Total: ${costoModal.toFixed(2)}</div>
          </div>

          <div style={{ borderTop:"1px solid "+C.border, paddingTop:14, marginBottom:4 }}>
            <label style={S.label}>Proveedor</label>
            <div style={{ position:"relative", marginBottom:12 }}>
              <input style={S.input} placeholder="Nombre o RFC del proveedor..." value={proveedorQuery}
                onChange={e=>{ setProveedorQuery(e.target.value); setForm(f=>({...f,proveedor:e.target.value})); setShowSugestiones(true); }}
                onFocus={()=>setShowSugestiones(true)}/>
              {showSugestiones && sugerenciasProveedor.length>0 && (
                <div style={{ position:"absolute", top:"100%", left:0, right:0, background:C.surface, border:"1px solid "+C.border, borderRadius:8, zIndex:100, boxShadow:"0 4px 16px rgba(0,0,0,.1)" }}>
                  {sugerenciasProveedor.map(p=>(
                    <div key={p.id} style={{ padding:"10px 14px", cursor:"pointer", fontSize:13, borderBottom:"1px solid "+C.border }}
                      onClick={()=>seleccionarProveedor(p)}>
                      <strong>{p.nombre}</strong> <span style={{ color:C.muted }}>RFC: {p.rfc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field label="RFC"><input style={S.input} value={form.rfc||""} onChange={e=>setForm(f=>({...f,rfc:e.target.value.toUpperCase()}))}/></Field>
              <Field label="No. Factura"><input style={S.input} value={form.noFactura||""} onChange={e=>setForm(f=>({...f,noFactura:e.target.value}))}/></Field>
              <Field label="Banco"><input style={S.input} value={form.banco||""} onChange={e=>setForm(f=>({...f,banco:e.target.value}))}/></Field>
              <Field label="CLABE / No. cuenta"><input style={S.input} value={form.clabe||""} onChange={e=>setForm(f=>({...f,clabe:e.target.value}))}/></Field>
            </div>
          </div>

          <div style={{ display:"flex", justifyContent:"flex-end", gap:10, marginTop:8 }}>
            <button style={S.btn("neutral")} onClick={()=>setShowModal(false)}>Cancelar</button>
            <button style={S.btn()} onClick={guardar}><Icon name="check" size={14}/> Enviar solicitud</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── PROGRAMAS ACJ ────────────────────────────────────────────────────────────
function ProgramasACJ({ data, setData, rolInfo }) {
  const [showPrograma, setShowPrograma] = useState(false);
  const [formPrograma, setFormPrograma] = useState({});
  const [viewPrograma, setViewPrograma] = useState(null);
  const [showBeneficio, setShowBeneficio] = useState(false);
  const [formBeneficio, setFormBeneficio] = useState({});
  const canEdit = puedeModificar(rolInfo);

  const { programasACJ } = data;

  function guardarPrograma() {
    if (!formPrograma.nombre?.trim()) { alert("El nombre es obligatorio."); return; }
    const programa = { ...formPrograma, id:uid(), asociacionId:"A2", beneficiarios:[], fechaCreacion:new Date().toISOString() };
    setData(prev => {
      const next = { ...prev, programasACJ:[...prev.programasACJ, programa] };
      saveData(next);
      return next;
    });
    setShowPrograma(false);
    setFormPrograma({});
  }

  function guardarBeneficio() {
    if (!formBeneficio.trabajadorNombre?.trim() || !formBeneficio.beneficiarioNombre?.trim()) {
      alert("Nombre del trabajador y beneficiario son obligatorios.");
      return;
    }
    const beneficio = { ...formBeneficio, id:uid(), fecha:new Date().toISOString() };
    setData(prev => {
      const next = { ...prev, programasACJ: prev.programasACJ.map(p => p.id===viewPrograma ? { ...p, beneficiarios:[...(p.beneficiarios||[]), beneficio] } : p) };
      saveData(next);
      return next;
    });
    setShowBeneficio(false);
    setFormBeneficio({});
  }

  const programa = viewPrograma ? programasACJ.find(p=>p.id===viewPrograma) : null;

  if (programa) {
    return (
      <div>
        <button style={{ ...S.btn("ghost"), marginBottom:16 }} onClick={()=>setViewPrograma(null)}>← Volver a programas</button>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:800 }}>{programa.nombre}</div>
            <div style={{ fontSize:13, color:C.muted }}>{programa.descripcion} · {(programa.beneficiarios||[]).length} beneficiarios</div>
          </div>
          {canEdit && (
            <button style={S.btn("olive")} onClick={()=>setShowBeneficio(true)}><Icon name="plus" size={14}/> Registrar beneficiario</button>
          )}
        </div>
        <div style={S.card}>
          {(programa.beneficiarios||[]).length===0 ? (
            <div style={{ textAlign:"center", padding:40, color:C.muted }}>Sin beneficiarios registrados.</div>
          ) : (
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ borderBottom:"2px solid "+C.border }}>
                  {["Trabajador titular","Beneficiario","Parentesco","Beneficio recibido","Monto","Fecha"].map(h=>(
                    <th key={h} style={{ textAlign:"left", padding:"8px 10px", fontSize:10, fontWeight:700, color:C.muted, textTransform:"uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(programa.beneficiarios||[]).map(b=>(
                  <tr key={b.id} style={{ borderBottom:"1px solid "+C.border }}>
                    <td style={{ padding:"10px 10px", fontWeight:600 }}>{b.trabajadorNombre}</td>
                    <td style={{ padding:"10px 10px" }}>{b.beneficiarioNombre}</td>
                    <td style={{ padding:"10px 10px", color:C.muted }}>{b.parentesco||"—"}</td>
                    <td style={{ padding:"10px 10px" }}>{b.beneficio||"—"}</td>
                    <td style={{ padding:"10px 10px", fontWeight:700 }}>{b.monto ? "$"+b.monto : "—"}</td>
                    <td style={{ padding:"10px 10px", color:C.muted }}>{fmtDate(b.fecha?.slice(0,10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {showBeneficio && (
          <Modal title="Registrar beneficiario" onClose={()=>setShowBeneficio(false)}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
              <Field label="Nombre del trabajador *"><input style={S.input} value={formBeneficio.trabajadorNombre||""} onChange={e=>setFormBeneficio(f=>({...f,trabajadorNombre:e.target.value}))}/></Field>
              <Field label="CURP del trabajador"><input style={S.input} value={formBeneficio.trabajadorCURP||""} onChange={e=>setFormBeneficio(f=>({...f,trabajadorCURP:e.target.value.toUpperCase()}))}/></Field>
              <Field label="Nombre del beneficiario *"><input style={S.input} value={formBeneficio.beneficiarioNombre||""} onChange={e=>setFormBeneficio(f=>({...f,beneficiarioNombre:e.target.value}))}/></Field>
              <Field label="Parentesco"><input style={S.input} placeholder="Ej: Hijo, Cónyuge, Trabajador mismo..." value={formBeneficio.parentesco||""} onChange={e=>setFormBeneficio(f=>({...f,parentesco:e.target.value}))}/></Field>
              <Field label="Beneficio recibido"><input style={S.input} placeholder="Ej: Beca nivel primaria, Consulta dental..." value={formBeneficio.beneficio||""} onChange={e=>setFormBeneficio(f=>({...f,beneficio:e.target.value}))}/></Field>
              <Field label="Monto (si aplica)"><input type="number" style={S.input} value={formBeneficio.monto||""} onChange={e=>setFormBeneficio(f=>({...f,monto:e.target.value}))}/></Field>
            </div>
            <Field label="Observaciones">
              <textarea style={{ ...S.input, minHeight:56, resize:"vertical" }} value={formBeneficio.observaciones||""} onChange={e=>setFormBeneficio(f=>({...f,observaciones:e.target.value}))}/>
            </Field>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
              <button style={S.btn("neutral")} onClick={()=>setShowBeneficio(false)}>Cancelar</button>
              <button style={S.btn()} onClick={guardarBeneficio}><Icon name="check" size={14}/> Guardar</button>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:22, fontWeight:800 }}>Programas ACJ</div>
          <div style={{ fontSize:13, color:C.muted }}>Beneficios de la prima Fairtrade</div>
        </div>
        {canEdit && (
          <button style={S.btn()} onClick={()=>setShowPrograma(true)}><Icon name="plus" size={15}/> Nuevo programa</button>
        )}
      </div>
      {programasACJ.length===0 ? (
        <div style={{ ...S.card, textAlign:"center", padding:40, color:C.muted }}>
          <Icon name="gift" size={36}/>
          <div style={{ marginTop:12 }}>Sin programas registrados. Crea el primer programa de beneficios.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          {programasACJ.map(p=>(
            <div key={p.id} style={{ ...S.card, borderLeft:"4px solid "+C.olive, cursor:"pointer" }} onClick={()=>setViewPrograma(p.id)}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:15 }}>{p.nombre}</div>
                  {p.descripcion && <div style={{ fontSize:12, color:C.muted, marginTop:4 }}>{p.descripcion}</div>}
                  <div style={{ marginTop:10 }}>
                    <span style={S.badge(C.olive, C.oliveLight)}>{(p.beneficiarios||[]).length} beneficiarios</span>
                  </div>
                </div>
                <Icon name="folder" size={20} />
              </div>
            </div>
          ))}
        </div>
      )}

      {showPrograma && (
        <Modal title="Nuevo programa" onClose={()=>setShowPrograma(false)}>
          <Field label="Nombre del programa *">
            <input style={S.input} placeholder="Ej: Becas 2026, Consulta Dental 2026..." value={formPrograma.nombre||""} onChange={e=>setFormPrograma(f=>({...f,nombre:e.target.value}))}/>
          </Field>
          <Field label="Descripción">
            <textarea style={{ ...S.input, minHeight:64, resize:"vertical" }} value={formPrograma.descripcion||""} onChange={e=>setFormPrograma(f=>({...f,descripcion:e.target.value}))}/>
          </Field>
          <Field label="Periodo">
            <input style={S.input} placeholder="Ej: Diciembre 2026 - Enero 2027" value={formPrograma.periodo||""} onChange={e=>setFormPrograma(f=>({...f,periodo:e.target.value}))}/>
          </Field>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
            <button style={S.btn("neutral")} onClick={()=>setShowPrograma(false)}>Cancelar</button>
            <button style={S.btn()} onClick={guardarPrograma}><Icon name="check" size={14}/> Crear programa</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
function Configuracion({ data, setData, rolInfo }) {
  const { areas, asociaciones } = data;
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({});

  function guardarArea() {
    if (!form.nombre?.trim() || !form.asociacionId) { alert("Nombre y asociación son obligatorios."); return; }
    setData(prev => {
      const next = { ...prev, areas:[...prev.areas, { ...form, id:uid() }] };
      saveData(next);
      return next;
    });
    setShowModal(false);
    setForm({});
  }

  return (
    <div>
      <div style={{ fontSize:22, fontWeight:800, marginBottom:4 }}>Configuración</div>
      <div style={{ fontSize:13, color:C.muted, marginBottom:20 }}>Gestión de áreas y centros</div>
      {asociaciones.map(asoc=>(
        <div key={asoc.id} style={{ ...S.card, marginBottom:20, borderTop:"4px solid "+asoc.color }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:15, fontWeight:700 }}>{asoc.nombre}</div>
            {esAdmin(rolInfo) && (
              <button style={S.btn("olive")} onClick={()=>{ setForm({asociacionId:asoc.id}); setShowModal(true); }}>
                <Icon name="plus" size={13}/> Nueva área
              </button>
            )}
          </div>
          {areas.filter(a=>a.asociacionId===asoc.id).map(a=>(
            <div key={a.id} style={{ display:"flex", justifyContent:"space-between", padding:"9px 12px", background:C.bg, borderRadius:8, marginBottom:6 }}>
              <span style={{ fontSize:13, fontWeight:600 }}>{a.nombre}</span>
              <span style={{ ...S.badge(asoc.color, asoc.colorLight), fontSize:10 }}>{data.personas.filter(p=>p.areaId===a.id).length} personas</span>
            </div>
          ))}
        </div>
      ))}

      {showModal && (
        <Modal title="Nueva área" onClose={()=>setShowModal(false)}>
          <Field label="Asociación">
            <select style={S.select} value={form.asociacionId||""} onChange={e=>setForm(f=>({...f,asociacionId:e.target.value}))}>
              {asociaciones.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </Field>
          <Field label="Nombre del área *"><input style={S.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
          <div style={{ display:"flex", justifyContent:"flex-end", gap:10 }}>
            <button style={S.btn("neutral")} onClick={()=>setShowModal(false)}>Cancelar</button>
            <button style={S.btn()} onClick={guardarArea}><Icon name="check" size={14}/> Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(null);
  const [rolInfo, setRolInfo] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const ri = getRolInfo(u.email);
        if (ri) {
          setUser(u);
          setRolInfo(ri);
          const d = await loadData();
          setData(d);
        } else {
          await signOut(auth);
        }
      } else {
        setUser(null);
        setRolInfo(null);
        setData(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  function handleLogin(u, ri) {
    setUser(u);
    setRolInfo(ri);
    loadData().then(d => setData(d));
  }

  async function handleLogout() {
    await signOut(auth);
    setUser(null);
    setRolInfo(null);
    setData(null);
    setView("dashboard");
  }

  if (loading) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:C.bg, color:C.muted }}>Cargando...</div>;
  }

  if (!user || !rolInfo) {
    return <Login onLogin={handleLogin} />;
  }

  if (!data) {
    return <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:C.bg, color:C.muted }}>Cargando datos...</div>;
  }

  // Navegación según rol
  const esACJ = rolInfo.asociaciones?.length===1 && rolInfo.asociaciones[0]==="A2";
  const esFBS = rolInfo.asociaciones?.length===1 && rolInfo.asociaciones[0]==="A1";
  const verGastos = rolInfo.rol==="admin" || rolInfo.rol==="admin_acj" || rolInfo.rol==="direccion" || rolInfo.rol==="coordinador";

  const NAV = [
    { id:"dashboard", label:"Panel general", icon:"home", section:"Principal" },
    ...(!esACJ ? [
      { id:"personas", label:"Personas", icon:"users", section:"FBS" },
      { id:"expedientes", label:"Expedientes", icon:"folder", section:"FBS" },
      { id:"eventos", label:"Eventos", icon:"calendar", section:"FBS" },
    ] : []),
    ...(esACJ || rolInfo.rol==="admin" ? [
      { id:"acj", label:"Programas ACJ", icon:"gift", section:"ACJ" },
    ] : []),
    ...(verGastos ? [{ id:"gastos", label:"Solicitudes de gasto", icon:"dollar", section:"Sistema" }] : []),
    ...(rolInfo.rol==="admin" || rolInfo.rol==="admin_acj" ? [{ id:"config", label:"Configuración", icon:"settings", section:"Sistema" }] : []),
  ];

  const sections = [...new Set(NAV.map(n=>n.section))];

  // Logo sidebar
  const logoSidebar = rolInfo.rol==="admin" ? "/logo-sgac.png"
    : esACJ ? "/logo-acj.png"
    : esFBS ? "/logo-fbs.png"
    : "/logo-sgac.png";

  const isMobile = typeof window!=="undefined" && window.innerWidth < 768;

  return (
    <div style={{ ...S.app, display:"flex" }}>
      {/* Botón hamburguesa móvil */}
      {isMobile && (
        <button onClick={()=>setMenuOpen(o=>!o)} style={{ position:"fixed", top:12, left:12, zIndex:2000, background:C.slate, border:"none", borderRadius:8, padding:"8px 10px", cursor:"pointer", color:"#FFF" }}>
          <Icon name="menu" size={20}/>
        </button>
      )}

      {/* Overlay móvil */}
      {isMobile && menuOpen && (
        <div onClick={()=>setMenuOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:999 }}/>
      )}

      {/* Sidebar */}
      <div style={{ ...S.sidebar, position: isMobile?"fixed":"relative", left: isMobile?(menuOpen?"0":"-260px"):"auto", top:0, height:"100vh", zIndex:1000, transition:"left .25s" }}>
        <div style={S.sidebarHeader}>
          <img src={logoSidebar} alt="Logo" style={S.sidebarLogo} onError={e=>{e.target.style.display="none"}}/>
          <div style={S.sidebarTitle}>{rolInfo.nombre}</div>
          {rolInfo.soloLectura && <span style={{ ...S.badge("#FFF","rgba(255,255,255,.2)"), fontSize:10, marginTop:4 }}>Solo lectura</span>}
        </div>
        <div style={{ flex:1, padding:"8px 0", overflow:"auto" }}>
          {sections.map(sec=>(
            <div key={sec}>
              <div style={S.sidebarSection}>{sec}</div>
              {NAV.filter(n=>n.section===sec).map(n=>(
                <div key={n.id} style={S.sidebarItem(view===n.id)} onClick={()=>{ setView(n.id); setMenuOpen(false); }}>
                  <Icon name={n.icon} size={14}/>
                  {n.label}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ padding:"12px 16px", borderTop:"1px solid rgba(255,255,255,.1)" }}>
          <div style={{ fontSize:11, color:"rgba(255,255,255,.4)", marginBottom:8 }}>{user.email}</div>
          <button style={{ ...S.btn("ghost"), color:"rgba(255,255,255,.6)", fontSize:12, padding:"6px 0" }} onClick={handleLogout}>
            <Icon name="logout" size={13}/> Cerrar sesión
          </button>
        </div>
      </div>

      {/* Main */}
      <div style={{ ...S.main, marginLeft: isMobile?"0":"auto" }}>
        {view==="dashboard" && <Dashboard data={data} rolInfo={rolInfo}/>}
        {view==="personas" && <Personas data={data} setData={setData} rolInfo={rolInfo}/>}
        {view==="expedientes" && <Expedientes data={data} rolInfo={rolInfo}/>}
        {view==="eventos" && <Eventos data={data} setData={setData} rolInfo={rolInfo}/>}
        {view==="acj" && <ProgramasACJ data={data} setData={setData} rolInfo={rolInfo}/>}
        {view==="gastos" && <Gastos data={data} setData={setData} rolInfo={rolInfo} userEmail={user.email}/>}
        {view==="config" && <Configuracion data={data} setData={setData} rolInfo={rolInfo}/>}
      </div>
    </div>
  );
}
