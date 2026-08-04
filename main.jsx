import { useState, useEffect } from "react";
import { db } from "./firebase";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getRolInfo, puedeModificar, esAdmin, puedeVerArea, puedeVerAsociacion } from "./auth";

// ─── PALETA ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#F7F4EE", surface: "#FFFFFF", border: "#DDD8CE",
  terra: "#B5522A", terraLight: "#F2E8E3",
  olive: "#5A6B3A", oliveLight: "#EBF0E3",
  slate: "#3B5068", slateLight: "#E3EBF2",
  text: "#1E1E1E", muted: "#6B6660",
  danger: "#C0392B", dangerLight: "#FDECEA",
  gold: "#9A7B2A", goldLight: "#F5EDD9",
  purple: "#6B3A8A", purpleLight: "#F0E8F5",
};

const styles = {
  app: { minHeight:"100vh", background:C.bg, fontFamily:"'Inter',sans-serif", color:C.text },
  sidebar: { width:240, background:C.slate, minHeight:"100vh", display:"flex", flexDirection:"column", padding:"0 0 24px 0", flexShrink:0 },
  sidebarLogo: { padding:"24px 20px 20px", borderBottom:"1px solid rgba(255,255,255,0.1)" },
  sidebarLogoTitle: { color:"#FFF", fontSize:15, fontWeight:700, marginBottom:4 },
  sidebarLogoSub: { color:"rgba(255,255,255,0.5)", fontSize:11 },
  sidebarSection: { padding:"16px 12px 4px", color:"rgba(255,255,255,0.4)", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:1.2 },
  sidebarItem: (a) => ({ display:"flex", alignItems:"center", gap:10, padding:"10px 16px", margin:"2px 8px", borderRadius:8, cursor:"pointer", color:a?"#FFF":"rgba(255,255,255,0.65)", background:a?"rgba(255,255,255,0.12)":"transparent", fontSize:13, fontWeight:a?600:400, transition:"all .15s" }),
  main: { flex:1, overflow:"auto", padding:"32px 36px" },
  header: { marginBottom:28 },
  pageTitle: { fontSize:22, fontWeight:700, marginBottom:4 },
  pageSubtitle: { fontSize:13, color:C.muted },
  card: { background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:20 },
  badge: (color,bg) => ({ background:bg, color, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600, display:"inline-block" }),
  btn: (v="primary") => ({ padding:"9px 18px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:600, background:v==="primary"?C.terra:v==="ghost"?"transparent":v==="olive"?C.olive:v==="purple"?C.purple:v==="slate"?C.slate:C.border, color:v==="primary"||v==="olive"||v==="purple"||v==="slate"?"#FFF":v==="ghost"?C.terra:C.text, display:"inline-flex", alignItems:"center", gap:6, transition:"opacity .15s" }),
  input: { width:"100%", padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, background:C.surface, color:C.text, boxSizing:"border-box", outline:"none" },
  select: { width:"100%", padding:"9px 12px", border:`1px solid ${C.border}`, borderRadius:8, fontSize:13, background:C.surface, color:C.text, boxSizing:"border-box", outline:"none" },
  label: { fontSize:12, fontWeight:600, color:C.muted, marginBottom:5, display:"block", textTransform:"uppercase", letterSpacing:0.5 },
  stat: (color,bg) => ({ background:bg, border:`1px solid ${color}22`, borderRadius:12, padding:"16px 20px" }),
};

// ─── DATOS INICIALES ──────────────────────────────────────────────────────────
const AREAS_DEFAULT = [
  { id:"AR1", asociacionId:"A1", nombre:"Bácum / Campo 77", codigo:"01", coordinador:"" },
  { id:"AR2", asociacionId:"A1", nombre:"Caborca",          codigo:"02", coordinador:"" },
  { id:"AR3", asociacionId:"A2", nombre:"Área Educativa",   codigo:"03", coordinador:"" },
  { id:"AR4", asociacionId:"A2", nombre:"Área Comunitaria", codigo:"04", coordinador:"" },
];

const INITIAL_STATE = {
  asociaciones: [
    { id:"A1", nombre:"Fundación Borquez Schwarzbeck", color:C.terra, colorLight:C.terraLight },
    { id:"A2", nombre:"Comercio Justo Campos Bórquez", color:C.olive, colorLight:C.oliveLight },
  ],
  areas: AREAS_DEFAULT,
  personas: [],
  apoyos: [],
  eventos: [],
  participaciones: [],
  consecutivoGlobal: 0,
};

const TIPO_APOYO    = ["Económico","Material","Alimentario","Médico","Educativo","Jurídico","Otro"];
const TIPO_EVENTO   = ["Taller","Curso","Capacitación","Conferencia","Festejo","Asamblea","Actividad deportiva","Otro"];
const SEXO          = ["Masculino","Femenino","No especificado"];

function uid() { return Math.random().toString(36).slice(2,9); }
function fmtDate(d) { if(!d)return"—"; return new Date(d).toLocaleDateString("es-MX",{day:"2-digit",month:"short",year:"numeric"}); }
function fmtCurrency(n) { return n!=null&&n!==""?"$"+Number(n).toLocaleString("es-MX",{minimumFractionDigits:2}):"—"; }

// ─── LÓGICA DE MATRÍCULA ──────────────────────────────────────────────────────
// Prefijo año: últimos 2 dígitos del año, invertidos (2026 → "26" → "62")
// Código área: 2 dígitos del área
// Consecutivo: global compartido entre áreas, 2 dígitos (01-99) o 3 (100-999)
function calcPrefixYear(fecha) {
  const anio = new Date(fecha).getFullYear();
  const yy = String(anio).slice(-2); // "26"
  return yy.split("").reverse().join(""); // "62"
}
function generarMatricula(fecha, areaCodigo, consecutivo) {
  const prefYear = calcPrefixYear(fecha);
  const consStr = String(consecutivo).padStart(2,"0");
  return `${prefYear}${areaCodigo}${consStr}`;
}

// ─── STORAGE FIREBASE ─────────────────────────────────────────────────────────
const DOC_REF = () => doc(db,"sistema","gestion_data");
async function loadData() {
  try { const s=await getDoc(DOC_REF()); if(s.exists())return s.data(); } catch(e){console.error(e);}
  return INITIAL_STATE;
}
async function saveData(data) {
  try { await setDoc(DOC_REF(),data); } catch(e){console.error(e);}
}

// ─── ICONO ────────────────────────────────────────────────────────────────────
function Icon({name,size=16}) {
  const icons = {
    home:"M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10",
    users:"M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
    plus:"M12 5v14 M5 12h14",
    search:"M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
    folder:"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z",
    heart:"M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
    activity:"M22 12h-4l-3 9L9 3l-3 9H2",
    building:"M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18 M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4",
    x:"M18 6L6 18 M6 6l12 12",
    check:"M20 6L9 17l-5-5",
    edit:"M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    trash:"M3 6h18 M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
    award:"M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M8.21 13.89L7 23l5-3 5 3-1.21-9.12",
    map:"M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z M8 2v16 M16 6v16",
    calendar:"M3 9h18 M3 4h18v18H3z M16 2v4 M8 2v4",
    flag:"M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z M4 22v-7",
    dollar:"M12 1v22 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    clipboard:"M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6v4H9z",
    id:"M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z M12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    lock:"M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4",
    pie:"M21.21 15.89A10 10 0 1 1 8 2.83 M22 12A10 10 0 0 0 12 2v10z",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {icons[name]?.split(" M").map((d,i)=><path key={i} d={i===0?d:"M"+d}/>)}
    </svg>
  );
}

function Modal({title,onClose,children,width=580}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.surface,borderRadius:14,width,maxWidth:"100%",maxHeight:"92vh",overflow:"auto",boxShadow:"0 20px 60px rgba(0,0,0,.25)"}}>
        <div style={{padding:"20px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:C.surface,zIndex:1}}>
          <span style={{fontSize:16,fontWeight:700}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:C.muted}}><Icon name="x"/></button>
        </div>
        <div style={{padding:24}}>{children}</div>
      </div>
    </div>
  );
}

function Field({label,children,span=1}) {
  return <div style={{marginBottom:16,gridColumn:`span ${span}`}}><label style={styles.label}>{label}</label>{children}</div>;
}

function StatCard({label,value,icon,color,bg}) {
  return (
    <div style={styles.stat(color,bg)}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{fontSize:11,fontWeight:600,color,textTransform:"uppercase",letterSpacing:0.8,marginBottom:6}}>{label}</div>
          <div style={{fontSize:28,fontWeight:800,color}}>{value}</div>
        </div>
        <div style={{color,opacity:0.5}}><Icon name={icon} size={22}/></div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
function Dashboard({data}) {
  const {personas,apoyos,eventos,participaciones,areas,asociaciones} = data;
  const totalInversion = participaciones.reduce((s,p)=>s+(Number(p.costoParticipante)||0),0);

  return (
    <div>
      <div style={styles.header}>
        <div style={styles.pageTitle}>Panel General</div>
        <div style={styles.pageSubtitle}>Vista global de ambas asociaciones en tiempo real</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:28}}>
        <StatCard label="Personas registradas" value={personas.length} icon="users" color={C.terra} bg={C.terraLight}/>
        <StatCard label="Apoyos otorgados" value={apoyos.length} icon="heart" color={C.olive} bg={C.oliveLight}/>
        <StatCard label="Eventos realizados" value={eventos.length} icon="calendar" color={C.slate} bg={C.slateLight}/>
        <StatCard label="Inversión total" value={fmtCurrency(totalInversion)} icon="dollar" color={C.gold} bg={C.goldLight}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        {asociaciones.map(asoc=>{
          const pAreas=areas.filter(a=>a.asociacionId===asoc.id);
          const pPersonas=personas.filter(p=>p.asociacionId===asoc.id);
          const pApoyos=apoyos.filter(a=>pPersonas.some(pp=>pp.id===a.personaId));
          const pEventos=eventos.filter(e=>e.asociacionId===asoc.id);
          return (
            <div key={asoc.id} style={{...styles.card,borderTop:`4px solid ${asoc.color}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:16}}>
                <Icon name="building" size={18}/>
                <span style={{fontSize:15,fontWeight:700}}>{asoc.nombre}</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16}}>
                {[{l:"Personas",v:pPersonas.length},{l:"Apoyos",v:pApoyos.length},{l:"Eventos",v:pEventos.length}].map(s=>(
                  <div key={s.l} style={{background:asoc.colorLight,borderRadius:8,padding:"10px 14px"}}>
                    <div style={{fontSize:20,fontWeight:800,color:asoc.color}}>{s.v}</div>
                    <div style={{fontSize:11,color:C.muted}}>{s.l}</div>
                  </div>
                ))}
              </div>
              {pAreas.map(a=>{
                const cnt=personas.filter(p=>p.areaId===a.id).length;
                return (
                  <div key={a.id} style={{display:"flex",justifyContent:"space-between",padding:"7px 10px",background:C.bg,borderRadius:7,marginBottom:4}}>
                    <span style={{fontSize:13}}>{a.nombre}</span>
                    <span style={styles.badge(asoc.color,asoc.colorLight)}>{cnt} personas</span>
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

// ─── PERSONAS ─────────────────────────────────────────────────────────────────
function Personas({data,setData}) {
  const [search,setSearch]=useState("");
  const [filtroAsoc,setFiltroAsoc]=useState("todas");
  const [filtroArea,setFiltroArea]=useState("todas");
  const [showModal,setShowModal]=useState(false);
  const [selected,setSelected]=useState(null);
  const [form,setForm]=useState({});
  const {personas,areas,asociaciones}=data;

  const areasFiltered=filtroAsoc!=="todas"?areas.filter(a=>a.asociacionId===filtroAsoc):areas;
  const lista=personas.filter(p=>{
    const txt=`${p.nombre} ${p.apellido} ${p.matricula||""} ${p.curp||""} ${p.telefono||""}`.toLowerCase();
    return txt.includes(search.toLowerCase())&&(filtroAsoc==="todas"||p.asociacionId===filtroAsoc)&&(filtroArea==="todas"||p.areaId===filtroArea);
  });

  function openAdd() { setForm({sexo:"No especificado",asociacionId:asociaciones[0]?.id,fechaRegistro:new Date().toISOString().slice(0,10)}); setSelected(null); setShowModal(true); }
  function openEdit(p) { setForm({...p}); setSelected(p); setShowModal(true); }

  // Preview matrícula en tiempo real
  const previewMatricula = ()=>{
    if(!form.fechaRegistro||!form.areaId) return "—";
    const area=areas.find(a=>a.id===form.areaId);
    if(!area?.codigo) return "—";
    const siguiente=(data.consecutivoGlobal||0)+1;
    return generarMatricula(form.fechaRegistro, area.codigo, siguiente);
  };

  function save() {
    if(!form.nombre?.trim()||!form.apellido?.trim()||!form.asociacionId||!form.areaId) return alert("Nombre, apellido, asociación y área son obligatorios.");
    setData(prev=>{
      let ps,nuevoConsec=prev.consecutivoGlobal||0;
      if(selected){
        ps=prev.personas.map(p=>p.id===selected.id?{...form}:p);
      } else {
        nuevoConsec=nuevoConsec+1;
        const area=prev.areas.find(a=>a.id===form.areaId);
        const matricula=generarMatricula(form.fechaRegistro||new Date().toISOString().slice(0,10), area?.codigo||"00", nuevoConsec);
        ps=[...prev.personas,{...form,id:uid(),matricula,consecutivo:nuevoConsec}];
      }
      const next={...prev,personas:ps,consecutivoGlobal:nuevoConsec};
      saveData(next); return next;
    });
    setShowModal(false);
  }

  function remove(id){
    if(!confirm("¿Eliminar esta persona y todos sus registros?"))return;
    setData(prev=>{
      const next={...prev,personas:prev.personas.filter(p=>p.id!==id),apoyos:prev.apoyos.filter(a=>a.personaId!==id),participaciones:prev.participaciones.filter(p=>p.personaId!==id)};
      saveData(next);return next;
    });
  }

  const asocOf=id=>asociaciones.find(a=>a.id===id);
  const areaOf=id=>areas.find(a=>a.id===id);

  return (
    <div>
      <div style={{...styles.header,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div><div style={styles.pageTitle}>Personas registradas</div><div style={styles.pageSubtitle}>{lista.length} de {personas.length} personas</div></div>
        <button style={styles.btn()} onClick={openAdd}><Icon name="plus" size={15}/> Agregar persona</button>
      </div>
      <div style={{display:"flex",gap:12,marginBottom:20}}>
        <div style={{flex:1,position:"relative"}}>
          <input style={{...styles.input,paddingLeft:36}} placeholder="Buscar por nombre, matrícula, CURP..." value={search} onChange={e=>setSearch(e.target.value)}/>
          <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted}}><Icon name="search" size={15}/></span>
        </div>
        <select style={{...styles.select,width:200}} value={filtroAsoc} onChange={e=>{setFiltroAsoc(e.target.value);setFiltroArea("todas");}}>
          <option value="todas">Todas las asociaciones</option>
          {asociaciones.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select style={{...styles.select,width:170}} value={filtroArea} onChange={e=>setFiltroArea(e.target.value)}>
          <option value="todas">Todas las áreas</option>
          {areasFiltered.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>

      {lista.length===0?(
        <div style={{...styles.card,textAlign:"center",padding:40,color:C.muted}}><Icon name="users" size={32}/><div style={{marginTop:12}}>No se encontraron personas.</div></div>
      ):(
        <div style={styles.card}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:`2px solid ${C.border}`}}>
                {["Matrícula","Nombre completo","Asociación / Área","Sexo","Teléfono","Reg.",""].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(p=>{
                const asoc=asocOf(p.asociacionId);
                const area=areaOf(p.areaId);
                return (
                  <tr key={p.id} style={{borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:"11px 12px"}}>
                      <span style={{...styles.badge(C.slate,C.slateLight),fontFamily:"monospace",fontSize:12,letterSpacing:1}}>{p.matricula||"—"}</span>
                    </td>
                    <td style={{padding:"11px 12px",fontWeight:600}}>{p.nombre} {p.apellido}</td>
                    <td style={{padding:"11px 12px"}}>
                      {asoc&&<span style={styles.badge(asoc.color,asoc.colorLight)}>{asoc.nombre}</span>}
                      <div style={{fontSize:11,color:C.muted,marginTop:3}}>{area?.nombre}</div>
                    </td>
                    <td style={{padding:"11px 12px",color:C.muted}}>{p.sexo}</td>
                    <td style={{padding:"11px 12px",color:C.muted}}>{p.telefono||"—"}</td>
                    <td style={{padding:"11px 12px",color:C.muted}}>{fmtDate(p.fechaRegistro)}</td>
                    <td style={{padding:"11px 12px"}}>
                      <div style={{display:"flex",gap:6}}>
                        <button style={{...styles.btn("ghost"),padding:"5px 10px"}} onClick={()=>openEdit(p)}><Icon name="edit" size={13}/></button>
                        <button style={{...styles.btn("ghost"),padding:"5px 10px",color:C.danger}} onClick={()=>remove(p.id)}><Icon name="trash" size={13}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal&&(
        <Modal title={selected?"Editar persona":"Nueva persona"} onClose={()=>setShowModal(false)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Nombre(s) *"><input style={styles.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
            <Field label="Apellido(s) *"><input style={styles.input} value={form.apellido||""} onChange={e=>setForm(f=>({...f,apellido:e.target.value}))}/></Field>
            <Field label="Asociación *">
              <select style={styles.select} value={form.asociacionId||""} onChange={e=>setForm(f=>({...f,asociacionId:e.target.value,areaId:""}))}>
                <option value="">Seleccionar...</option>
                {asociaciones.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
            <Field label="Área *">
              <select style={styles.select} value={form.areaId||""} onChange={e=>setForm(f=>({...f,areaId:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {areas.filter(a=>a.asociacionId===form.asociacionId).map(a=><option key={a.id} value={a.id}>{a.nombre} (cod. {a.codigo})</option>)}
              </select>
            </Field>
            <Field label="Sexo">
              <select style={styles.select} value={form.sexo||"No especificado"} onChange={e=>setForm(f=>({...f,sexo:e.target.value}))}>
                {SEXO.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Fecha de registro">
              <input type="date" style={styles.input} value={form.fechaRegistro||""} onChange={e=>setForm(f=>({...f,fechaRegistro:e.target.value}))} disabled={!!selected}/>
            </Field>
            <Field label="Fecha de nacimiento"><input type="date" style={styles.input} value={form.fechaNac||""} onChange={e=>setForm(f=>({...f,fechaNac:e.target.value}))}/></Field>
            <Field label="CURP"><input style={styles.input} value={form.curp||""} onChange={e=>setForm(f=>({...f,curp:e.target.value.toUpperCase()}))} maxLength={18}/></Field>
            <Field label="Teléfono"><input style={styles.input} value={form.telefono||""} onChange={e=>setForm(f=>({...f,telefono:e.target.value}))}/></Field>
            <Field label="Localidad / Comunidad"><input style={styles.input} value={form.localidad||""} onChange={e=>setForm(f=>({...f,localidad:e.target.value}))}/></Field>
          </div>
          {!selected&&(
            <div style={{background:C.slateLight,border:`1px solid ${C.slate}33`,borderRadius:8,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:10}}>
              <Icon name="id" size={16} color={C.slate}/>
              <div>
                <div style={{fontSize:11,color:C.muted,fontWeight:600,textTransform:"uppercase"}}>Matrícula que se asignará</div>
                <div style={{fontFamily:"monospace",fontSize:18,fontWeight:800,color:C.slate,letterSpacing:2}}>{previewMatricula()}</div>
              </div>
            </div>
          )}
          <Field label="Observaciones">
            <textarea style={{...styles.input,minHeight:64,resize:"vertical"}} value={form.observaciones||""} onChange={e=>setForm(f=>({...f,observaciones:e.target.value}))}/>
          </Field>
          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <button style={styles.btn("neutral")} onClick={()=>setShowModal(false)}>Cancelar</button>
            <button style={styles.btn()} onClick={save}><Icon name="check" size={14}/> Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── EXPEDIENTES ──────────────────────────────────────────────────────────────
function Expedientes({data,setData}) {
  const [search,setSearch]=useState("");
  const [selected,setSelected]=useState(null);
  const [tab,setTab]=useState("apoyos");
  const [showApoyo,setShowApoyo]=useState(false);
  const [formA,setFormA]=useState({});
  const {personas,areas,asociaciones,apoyos,eventos,participaciones}=data;

  const lista=personas.filter(p=>`${p.nombre} ${p.apellido} ${p.matricula||""}`.toLowerCase().includes(search.toLowerCase()));
  const persona=selected?personas.find(p=>p.id===selected):null;
  const misApoyos=persona?apoyos.filter(a=>a.personaId===persona.id):[];
  const misPartic=persona?participaciones.filter(p=>p.personaId===persona.id):[];
  const inversionTotal=misPartic.reduce((s,p)=>s+(Number(p.costoParticipante)||0),0);

  function saveApoyo(){
    if(!formA.tipo||!formA.descripcion?.trim()||!formA.fecha)return alert("Completa todos los campos.");
    setData(prev=>{
      const next={...prev,apoyos:[...prev.apoyos,{...formA,id:uid(),personaId:persona.id}]};
      saveData(next);return next;
    });
    setShowApoyo(false);
  }
  function removeApoyo(id){
    if(!confirm("¿Eliminar este apoyo?"))return;
    setData(prev=>{const next={...prev,apoyos:prev.apoyos.filter(a=>a.id!==id)};saveData(next);return next;});
  }
  function removePartic(id){
    if(!confirm("¿Eliminar esta participación?"))return;
    setData(prev=>{const next={...prev,participaciones:prev.participaciones.filter(p=>p.id!==id)};saveData(next);return next;});
  }

  const asocOf=id=>asociaciones.find(a=>a.id===id);
  const areaOf=id=>areas.find(a=>a.id===id);
  const eventoOf=id=>eventos.find(e=>e.id===id);

  return (
    <div style={{display:"flex",gap:20,height:"calc(100vh - 100px)"}}>
      <div style={{width:280,flexShrink:0,display:"flex",flexDirection:"column"}}>
        <div style={{marginBottom:12}}>
          <div style={{position:"relative"}}>
            <input style={{...styles.input,paddingLeft:34}} placeholder="Nombre o matrícula..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <span style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:C.muted}}><Icon name="search" size={14}/></span>
          </div>
        </div>
        <div style={{flex:1,overflow:"auto",display:"flex",flexDirection:"column",gap:6}}>
          {lista.map(p=>{
            const asoc=asocOf(p.asociacionId);
            const cntA=apoyos.filter(a=>a.personaId===p.id).length;
            const cntP=participaciones.filter(x=>x.personaId===p.id).length;
            const isSel=selected===p.id;
            return (
              <div key={p.id} onClick={()=>setSelected(p.id)} style={{background:isSel?C.terra:C.surface,border:`1px solid ${isSel?C.terra:C.border}`,borderRadius:10,padding:"12px 14px",cursor:"pointer"}}>
                <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,color:isSel?"rgba(255,255,255,.7)":C.muted,letterSpacing:1,marginBottom:2}}>{p.matricula||"—"}</div>
                <div style={{fontWeight:600,fontSize:13,color:isSel?"#FFF":C.text}}>{p.nombre} {p.apellido}</div>
                <div style={{fontSize:11,color:isSel?"rgba(255,255,255,.6)":C.muted,marginTop:2}}>{areaOf(p.areaId)?.nombre}</div>
                <div style={{display:"flex",gap:8,marginTop:6}}>
                  <span style={{...styles.badge(isSel?"#FFF":asoc?.color,isSel?"rgba(255,255,255,.2)":asoc?.colorLight),fontSize:10}}>{cntA} apoyos</span>
                  <span style={{...styles.badge(isSel?"#FFF":C.slate,isSel?"rgba(255,255,255,.2)":C.slateLight),fontSize:10}}>{cntP} eventos</span>
                </div>
              </div>
            );
          })}
          {lista.length===0&&<div style={{color:C.muted,fontSize:13,textAlign:"center",marginTop:30}}>Sin resultados</div>}
        </div>
      </div>

      <div style={{flex:1,overflow:"auto"}}>
        {!persona?(
          <div style={{...styles.card,height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",color:C.muted}}>
            <Icon name="folder" size={40}/><div style={{marginTop:12}}>Selecciona una persona para ver su expediente</div>
          </div>
        ):(
          <div>
            <div style={{...styles.card,marginBottom:16,borderLeft:`5px solid ${asocOf(persona.asociacionId)?.color}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div>
                  <div style={{fontFamily:"monospace",fontSize:13,color:C.muted,letterSpacing:2,marginBottom:4}}>{persona.matricula}</div>
                  <div style={{fontSize:20,fontWeight:800}}>{persona.nombre} {persona.apellido}</div>
                  <div style={{color:C.muted,fontSize:13,marginTop:4}}>{asocOf(persona.asociacionId)?.nombre} · {areaOf(persona.areaId)?.nombre}</div>
                </div>
                <div style={{textAlign:"right"}}>
                  <div style={{fontSize:11,color:C.muted,textTransform:"uppercase",fontWeight:600}}>Inversión acumulada</div>
                  <div style={{fontSize:22,fontWeight:800,color:C.gold}}>{fmtCurrency(inversionTotal)}</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginTop:16}}>
                {[{l:"Sexo",v:persona.sexo||"—"},{l:"Teléfono",v:persona.telefono||"—"},{l:"Localidad",v:persona.localidad||"—"},{l:"Fecha registro",v:fmtDate(persona.fechaRegistro)}].map(f=>(
                  <div key={f.l}><div style={{fontSize:10,fontWeight:700,color:C.muted,textTransform:"uppercase"}}>{f.l}</div><div style={{fontSize:13,marginTop:2}}>{f.v}</div></div>
                ))}
              </div>
            </div>

            <div style={{display:"flex",gap:4,marginBottom:16}}>
              {[{id:"apoyos",label:`Apoyos (${misApoyos.length})`,icon:"heart"},{id:"eventos",label:`Eventos (${misPartic.length})`,icon:"calendar"}].map(t=>(
                <button key={t.id} style={styles.btn(tab===t.id?"primary":"neutral")} onClick={()=>setTab(t.id)}><Icon name={t.icon} size={13}/>{t.label}</button>
              ))}
            </div>

            {tab==="apoyos"&&(
              <div>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                  <button style={styles.btn("olive")} onClick={()=>{setFormA({fecha:new Date().toISOString().slice(0,10)});setShowApoyo(true);}}><Icon name="plus" size={13}/> Registrar apoyo</button>
                </div>
                {misApoyos.length===0?<div style={{...styles.card,textAlign:"center",padding:30,color:C.muted}}>Sin apoyos registrados.</div>
                :misApoyos.map(a=>(
                  <div key={a.id} style={{...styles.card,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:600,fontSize:14}}>{a.descripcion}</div>
                      <div style={{display:"flex",gap:8,marginTop:6}}>
                        <span style={styles.badge(C.olive,C.oliveLight)}>{a.tipo}</span>
                        <span style={{fontSize:12,color:C.muted}}>{fmtDate(a.fecha)}</span>
                        {a.monto&&<span style={styles.badge(C.gold,C.goldLight)}>{fmtCurrency(a.monto)}</span>}
                      </div>
                      {a.notas&&<div style={{fontSize:12,color:C.muted,marginTop:6}}>📝 {a.notas}</div>}
                    </div>
                    <button style={{...styles.btn("ghost"),padding:"5px 10px",color:C.danger}} onClick={()=>removeApoyo(a.id)}><Icon name="trash" size={13}/></button>
                  </div>
                ))}
              </div>
            )}

            {tab==="eventos"&&(
              <div>
                {misPartic.length===0?<div style={{...styles.card,textAlign:"center",padding:30,color:C.muted}}>Sin eventos registrados. Las participaciones se registran desde la sección Eventos.</div>
                :misPartic.map(p=>{
                  const ev=eventoOf(p.eventoId);
                  return (
                    <div key={p.id} style={{...styles.card,marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div>
                        <div style={{fontWeight:600,fontSize:14}}>{ev?.nombre||"Evento eliminado"}</div>
                        <div style={{display:"flex",gap:8,marginTop:6}}>
                          {ev&&<span style={styles.badge(C.purple,C.purpleLight)}>{ev.tipo}</span>}
                          <span style={{fontSize:12,color:C.muted}}>{fmtDate(p.fechaRegistro)}</span>
                          {p.costoParticipante&&<span style={styles.badge(C.gold,C.goldLight)}>Costo: {fmtCurrency(p.costoParticipante)}</span>}
                        </div>
                      </div>
                      <button style={{...styles.btn("ghost"),padding:"5px 10px",color:C.danger}} onClick={()=>removePartic(p.id)}><Icon name="trash" size={13}/></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showApoyo&&(
        <Modal title="Registrar apoyo" onClose={()=>setShowApoyo(false)}>
          <Field label="Tipo de apoyo *">
            <select style={styles.select} value={formA.tipo||""} onChange={e=>setFormA(f=>({...f,tipo:e.target.value}))}>
              <option value="">Seleccionar...</option>
              {TIPO_APOYO.map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="Descripción *"><input style={styles.input} placeholder="Describe brevemente el apoyo..." value={formA.descripcion||""} onChange={e=>setFormA(f=>({...f,descripcion:e.target.value}))}/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Fecha *"><input type="date" style={styles.input} value={formA.fecha||""} onChange={e=>setFormA(f=>({...f,fecha:e.target.value}))}/></Field>
            <Field label="Monto (si aplica)"><input type="number" style={styles.input} value={formA.monto||""} onChange={e=>setFormA(f=>({...f,monto:e.target.value}))}/></Field>
          </div>
          <Field label="Notas"><textarea style={{...styles.input,minHeight:64,resize:"vertical"}} value={formA.notas||""} onChange={e=>setFormA(f=>({...f,notas:e.target.value}))}/></Field>
          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <button style={styles.btn("neutral")} onClick={()=>setShowApoyo(false)}>Cancelar</button>
            <button style={styles.btn()} onClick={saveApoyo}><Icon name="check" size={14}/> Guardar apoyo</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── EVENTOS ──────────────────────────────────────────────────────────────────
function Eventos({data,setData}) {
  const [showModal,setShowModal]=useState(false);
  const [showReporte,setShowReporte]=useState(null);
  const [form,setForm]=useState({sesiones:[{fecha:"",duracionMin:60}]});
  const [inputMatricula,setInputMatricula]=useState("");
  const [inscritosForm,setInscritosForm]=useState([]);
  const [step,setStep]=useState(1);
  const {eventos,participaciones,personas,asociaciones,areas}=data;

  function personaByMatricula(m){return personas.find(p=>p.matricula===m.trim().toUpperCase());}

  function agregarMatricula(){
    const p=personaByMatricula(inputMatricula);
    if(!p)return alert(`No se encontró ninguna persona con la matrícula "${inputMatricula}"`);
    if(inscritosForm.some(i=>i.id===p.id))return alert("Esta persona ya está inscrita.");
    setInscritosForm(prev=>[...prev,p]);
    setInputMatricula("");
  }

  function agregarSesion(){setForm(f=>({...f,sesiones:[...f.sesiones,{fecha:"",duracionMin:60}]}));}
  function removeSesion(i){setForm(f=>({...f,sesiones:f.sesiones.filter((_,idx)=>idx!==i)}));}
  function updateSesion(i,field,val){setForm(f=>({...f,sesiones:f.sesiones.map((s,idx)=>idx===i?{...s,[field]:val}:s)}));}

  function calcularReporte(evento){
    const partics=participaciones.filter(p=>p.eventoId===evento.id);
    const sesiones=evento.sesiones||[];
    const numSesiones=sesiones.length;
    const duraciones=sesiones.map(s=>Number(s.duracionMin)||0);
    const totalMinutos=duraciones.reduce((a,b)=>a+b,0);
    const totalHoras=totalMinutos/60;
    const costoTotal=Number(evento.costoTotal)||0;
    const numParticipantes=partics.length||1;
    const costoParticipante=costoTotal/numParticipantes;
    const porcentajeParticipacion=sesiones.map((s,i)=>{
      const asistieron=partics.filter(p=>p.sesionesAsistidas&&p.sesionesAsistidas.includes(i)).length;
      return numParticipantes>0?Math.round((asistieron/numParticipantes)*100):0;
    });
    return {numSesiones,duraciones,totalHoras,costoTotal,costoParticipante,numParticipantes,porcentajeParticipacion};
  }

  function finalizarEvento(eventoId){
    if(!confirm("¿Marcar este evento como finalizado? Se calcularán los costos por participante automáticamente."))return;
    setData(prev=>{
      const evento=prev.eventos.find(e=>e.id===eventoId);
      if(!evento)return prev;
      const partics=prev.participaciones.filter(p=>p.eventoId===eventoId);
      const costoTotal=Number(evento.costoTotal)||0;
      const costoParticipante=partics.length>0?costoTotal/partics.length:0;
      const nuevasPartic=prev.participaciones.map(p=>
        p.eventoId===eventoId?{...p,costoParticipante}:p
      );
      const nuevosEventos=prev.eventos.map(e=>e.id===eventoId?{...e,finalizado:true,costoParticipanteCalculado:costoParticipante}:e);
      const next={...prev,eventos:nuevosEventos,participaciones:nuevasPartic};
      saveData(next);return next;
    });
  }

  function saveEvento(){
    if(!form.nombre?.trim()||!form.tipo||!form.asociacionId)return alert("Nombre, tipo y asociación son obligatorios.");
    const eventoId=uid();
    const nuevasPartic=inscritosForm.map(p=>({
      id:uid(), personaId:p.id, eventoId, fechaRegistro:new Date().toISOString().slice(0,10), costoParticipante:0
    }));
    setData(prev=>{
      const next={...prev,eventos:[...prev.eventos,{...form,id:eventoId,finalizado:false,inscritosIds:inscritosForm.map(p=>p.id)}],participaciones:[...prev.participaciones,...nuevasPartic]};
      saveData(next);return next;
    });
    setShowModal(false);
    setForm({sesiones:[{fecha:"",duracionMin:60}]});
    setInscritosForm([]);
    setStep(1);
  }

  function removeEvento(id){
    if(!confirm("¿Eliminar este evento y todas sus participaciones?"))return;
    setData(prev=>{const next={...prev,eventos:prev.eventos.filter(e=>e.id!==id),participaciones:prev.participaciones.filter(p=>p.eventoId!==id)};saveData(next);return next;});
  }

  const asocOf=id=>asociaciones.find(a=>a.id===id);

  return (
    <div>
      <div style={{...styles.header,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div><div style={styles.pageTitle}>Eventos</div><div style={styles.pageSubtitle}>Talleres, cursos, conferencias, festejos y más</div></div>
        <button style={styles.btn("purple")} onClick={()=>{setShowModal(true);setStep(1);setForm({sesiones:[{fecha:"",duracionMin:60}],asociacionId:asociaciones[0]?.id});setInscritosForm([]);}}><Icon name="plus" size={15}/> Crear evento</button>
      </div>

      {eventos.length===0?(
        <div style={{...styles.card,textAlign:"center",padding:40,color:C.muted}}><Icon name="calendar" size={32}/><div style={{marginTop:12}}>No hay eventos registrados.</div></div>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}}>
          {eventos.map(ev=>{
            const asoc=asocOf(ev.asociacionId);
            const partics=participaciones.filter(p=>p.eventoId===ev.id);
            const reporte=ev.finalizado?calcularReporte(ev):null;
            return (
              <div key={ev.id} style={{...styles.card,borderLeft:`4px solid ${asoc?.color||C.border}`,opacity:ev.finalizado?.8:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                  <div>
                    <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                      <span style={styles.badge(C.purple,C.purpleLight)}>{ev.tipo}</span>
                      {ev.finalizado&&<span style={styles.badge(C.olive,C.oliveLight)}>✓ Finalizado</span>}
                    </div>
                    <div style={{fontWeight:700,fontSize:15}}>{ev.nombre}</div>
                    {asoc&&<div style={{fontSize:11,color:C.muted,marginTop:2}}>{asoc.nombre}</div>}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    {!ev.finalizado&&<button style={{...styles.btn("olive"),padding:"6px 12px",fontSize:12}} onClick={()=>finalizarEvento(ev.id)}><Icon name="flag" size={12}/> Finalizar</button>}
                    <button style={{...styles.btn("ghost"),padding:"5px 10px",color:C.danger}} onClick={()=>removeEvento(ev.id)}><Icon name="trash" size={13}/></button>
                  </div>
                </div>

                <div style={{display:"flex",gap:12,marginBottom:10}}>
                  <div style={{textAlign:"center",background:C.bg,borderRadius:8,padding:"8px 14px"}}>
                    <div style={{fontSize:18,fontWeight:800,color:C.purple}}>{partics.length}</div>
                    <div style={{fontSize:10,color:C.muted}}>participantes</div>
                  </div>
                  <div style={{textAlign:"center",background:C.bg,borderRadius:8,padding:"8px 14px"}}>
                    <div style={{fontSize:18,fontWeight:800,color:C.slate}}>{ev.sesiones?.length||0}</div>
                    <div style={{fontSize:10,color:C.muted}}>sesiones</div>
                  </div>
                  {ev.costoTotal&&<div style={{textAlign:"center",background:C.goldLight,borderRadius:8,padding:"8px 14px"}}>
                    <div style={{fontSize:18,fontWeight:800,color:C.gold}}>{fmtCurrency(ev.costoTotal)}</div>
                    <div style={{fontSize:10,color:C.muted}}>costo total</div>
                  </div>}
                </div>

                {ev.descripcion&&<div style={{fontSize:12,color:C.muted,marginBottom:10}}>📋 {ev.descripcion}</div>}

                {ev.finalizado&&reporte&&(
                  <div style={{marginTop:8}}>
                    <button style={{...styles.btn("slate"),fontSize:12,width:"100%",justifyContent:"center",marginBottom:8}} onClick={()=>setShowReporte(ev)}>
                      <Icon name="pie" size={13}/> Ver reporte completo
                    </button>
                    <EstadisticasEvento evento={ev} data={data}/>
                  </div>
                )}

                {/* Lista de inscritos */}
                <div style={{marginTop:10}}>
                  <div style={{fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",marginBottom:6}}>Inscritos</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                    {partics.slice(0,10).map(p=>{
                      const persona=personas.find(x=>x.id===p.personaId);
                      return persona?<span key={p.id} style={{...styles.badge(C.slate,C.slateLight),fontFamily:"monospace",fontSize:10}}>{persona.matricula}</span>:null;
                    })}
                    {partics.length>10&&<span style={styles.badge(C.muted,"#eee")}>+{partics.length-10} más</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL CREAR EVENTO */}
      {showModal&&(
        <Modal title="Crear nuevo evento" onClose={()=>setShowModal(false)} width={680}>
          {/* Steps */}
          <div style={{display:"flex",gap:0,marginBottom:24}}>
            {["Datos generales","Sesiones y recursos","Inscripción"].map((s,i)=>(
              <div key={s} style={{flex:1,textAlign:"center"}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:step>i+1?C.olive:step===i+1?C.terra:C.border,color:step>=i+1?"#FFF":C.muted,display:"inline-flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,marginBottom:4}}>{step>i+1?"✓":i+1}</div>
                <div style={{fontSize:11,color:step===i+1?C.terra:C.muted,fontWeight:step===i+1?700:400}}>{s}</div>
              </div>
            ))}
          </div>

          {step===1&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <Field label="Nombre del evento *" span={2}><input style={styles.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
              <Field label="Tipo *">
                <select style={styles.select} value={form.tipo||""} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))}>
                  <option value="">Seleccionar...</option>
                  {TIPO_EVENTO.map(t=><option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Asociación *">
                <select style={styles.select} value={form.asociacionId||""} onChange={e=>setForm(f=>({...f,asociacionId:e.target.value}))}>
                  {asociaciones.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </Field>
              <Field label="Lugar"><input style={styles.input} value={form.lugar||""} onChange={e=>setForm(f=>({...f,lugar:e.target.value}))}/></Field>
              <Field label="Responsable"><input style={styles.input} value={form.responsable||""} onChange={e=>setForm(f=>({...f,responsable:e.target.value}))}/></Field>
              <Field label="Descripción" span={2}><textarea style={{...styles.input,minHeight:72,resize:"vertical"}} value={form.descripcion||""} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/></Field>
              <div style={{gridColumn:"span 2",display:"flex",justifyContent:"flex-end"}}>
                <button style={styles.btn()} onClick={()=>setStep(2)}>Siguiente →</button>
              </div>
            </div>
          )}

          {step===2&&(
            <div>
              <div style={{marginBottom:16}}>
                <div style={{fontWeight:700,marginBottom:12}}>Sesiones del evento</div>
                {form.sesiones.map((s,i)=>(
                  <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:10,marginBottom:10,alignItems:"end"}}>
                    <div>
                      <label style={styles.label}>Fecha sesión {i+1}</label>
                      <input type="date" style={styles.input} value={s.fecha} onChange={e=>updateSesion(i,"fecha",e.target.value)}/>
                    </div>
                    <div>
                      <label style={styles.label}>Duración (minutos)</label>
                      <input type="number" style={styles.input} value={s.duracionMin} onChange={e=>updateSesion(i,"duracionMin",e.target.value)} min={1}/>
                    </div>
                    <button style={{...styles.btn("ghost"),color:C.danger,padding:"9px 12px"}} onClick={()=>removeSesion(i)}><Icon name="trash" size={14}/></button>
                  </div>
                ))}
                <button style={styles.btn("neutral")} onClick={agregarSesion}><Icon name="plus" size={13}/> Agregar sesión</button>
              </div>

              <div style={{borderTop:`1px solid ${C.border}`,paddingTop:16,marginTop:16}}>
                <div style={{fontWeight:700,marginBottom:12}}>Solicitud de recursos</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Field label="Costo total estimado ($)"><input type="number" style={styles.input} value={form.costoTotal||""} onChange={e=>setForm(f=>({...f,costoTotal:e.target.value}))}/></Field>
                  <Field label="Concepto del gasto"><input style={styles.input} value={form.conceptoGasto||""} onChange={e=>setForm(f=>({...f,conceptoGasto:e.target.value}))}/></Field>
                </div>
                <Field label="Justificación del recurso"><textarea style={{...styles.input,minHeight:64,resize:"vertical"}} value={form.justificacion||""} onChange={e=>setForm(f=>({...f,justificacion:e.target.value}))}/></Field>
              </div>

              <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                <button style={styles.btn("neutral")} onClick={()=>setStep(1)}>← Atrás</button>
                <button style={styles.btn()} onClick={()=>setStep(3)}>Siguiente →</button>
              </div>
            </div>
          )}

          {step===3&&(
            <div>
              <div style={{fontWeight:700,marginBottom:12}}>Inscribir participantes por matrícula</div>
              <div style={{display:"flex",gap:10,marginBottom:16}}>
                <input style={{...styles.input,fontFamily:"monospace",letterSpacing:2,textTransform:"uppercase"}} placeholder="Ingresa matrícula (ej. 620101)" value={inputMatricula} onChange={e=>setInputMatricula(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&agregarMatricula()}/>
                <button style={styles.btn("slate")} onClick={agregarMatricula}><Icon name="plus" size={14}/> Agregar</button>
              </div>

              {inscritosForm.length===0?(
                <div style={{textAlign:"center",padding:"24px",color:C.muted,background:C.bg,borderRadius:10,marginBottom:16}}>Aún no hay personas inscritas. Ingresa matrículas arriba.</div>
              ):(
                <div style={{marginBottom:16,maxHeight:220,overflow:"auto"}}>
                  {inscritosForm.map(p=>(
                    <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"9px 14px",background:C.bg,borderRadius:8,marginBottom:6}}>
                      <div style={{display:"flex",gap:12,alignItems:"center"}}>
                        <span style={{fontFamily:"monospace",fontWeight:700,color:C.slate,fontSize:13}}>{p.matricula}</span>
                        <span style={{fontSize:13}}>{p.nombre} {p.apellido}</span>
                      </div>
                      <button style={{background:"none",border:"none",cursor:"pointer",color:C.danger}} onClick={()=>setInscritosForm(prev=>prev.filter(x=>x.id!==p.id))}><Icon name="x" size={14}/></button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{background:C.terraLight,border:`1px solid ${C.terra}33`,borderRadius:10,padding:"12px 16px",marginBottom:16}}>
                <div style={{fontSize:13,fontWeight:600,color:C.terra}}>Resumen del evento</div>
                <div style={{fontSize:13,color:C.text,marginTop:6}}>
                  <b>{form.nombre}</b> · {form.tipo} · {form.sesiones?.length} sesión(es) · {inscritosForm.length} participantes inscritos
                  {form.costoTotal&&<> · Costo total: {fmtCurrency(form.costoTotal)}</>}
                </div>
              </div>

              <div style={{display:"flex",justifyContent:"space-between"}}>
                <button style={styles.btn("neutral")} onClick={()=>setStep(2)}>← Atrás</button>
                <button style={styles.btn("olive")} onClick={saveEvento}><Icon name="check" size={14}/> Crear evento</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* MODAL REPORTE */}
      {showReporte&&(()=>{
        const ev=showReporte;
        const r=calcularReporte(ev);
        return (
          <Modal title={`Reporte: ${ev.nombre}`} onClose={()=>setShowReporte(null)} width={620}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:20}}>
              {[
                {l:"Sesiones",v:r.numSesiones,c:C.slate,bg:C.slateLight},
                {l:"Total de horas",v:`${r.totalHoras.toFixed(1)} hrs`,c:C.purple,bg:C.purpleLight},
                {l:"Participantes",v:r.numParticipantes,c:C.olive,bg:C.oliveLight},
                {l:"Costo total",v:fmtCurrency(r.costoTotal),c:C.gold,bg:C.goldLight},
                {l:"Costo por participante",v:fmtCurrency(r.costoParticipante),c:C.terra,bg:C.terraLight},
              ].map(s=>(
                <div key={s.l} style={{background:s.bg,borderRadius:10,padding:"12px 16px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:s.c,textTransform:"uppercase"}}>{s.l}</div>
                  <div style={{fontSize:20,fontWeight:800,color:s.c,marginTop:4}}>{s.v}</div>
                </div>
              ))}
            </div>

            <div style={{marginBottom:20}}>
              <div style={{fontWeight:700,marginBottom:10}}>Detalle por sesión</div>
              {ev.sesiones?.map((s,i)=>(
                <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"8px 14px",background:C.bg,borderRadius:8,marginBottom:6}}>
                  <span style={{fontWeight:600}}>Sesión {i+1} — {fmtDate(s.fecha)}</span>
                  <span style={{color:C.muted}}>{s.duracionMin} min ({(s.duracionMin/60).toFixed(1)} hrs)</span>
                </div>
              ))}
            </div>

            <div style={{background:C.goldLight,border:`1px solid ${C.gold}33`,borderRadius:10,padding:14}}>
              <div style={{fontWeight:700,color:C.gold,marginBottom:4}}>📊 Costo registrado por participante</div>
              <div style={{fontSize:13,color:C.text}}>Se ha registrado automáticamente <b>{fmtCurrency(r.costoParticipante)}</b> en el expediente de cada uno de los {r.numParticipantes} participantes.</div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
function Configuracion({data,setData}) {
  const [showModal,setShowModal]=useState(null);
  const [form,setForm]=useState({});
  const {areas,asociaciones}=data;

  function saveArea(){
    if(!form.nombre?.trim()||!form.asociacionId||!form.codigo?.trim())return alert("Nombre, código y asociación son obligatorios.");
    if(areas.some(a=>a.codigo===form.codigo))return alert("Ese código de área ya existe. Usa un código distinto.");
    setData(prev=>{const next={...prev,areas:[...prev.areas,{...form,id:uid()}]};saveData(next);return next;});
    setShowModal(null);
  }
  function removeArea(id){
    if(!confirm("¿Eliminar esta área?"))return;
    setData(prev=>{const next={...prev,areas:prev.areas.filter(a=>a.id!==id)};saveData(next);return next;});
  }

  return (
    <div>
      <div style={styles.header}><div style={styles.pageTitle}>Configuración</div><div style={styles.pageSubtitle}>Gestiona asociaciones, áreas y códigos</div></div>
      {asociaciones.map(asoc=>(
        <div key={asoc.id} style={{...styles.card,marginBottom:20,borderTop:`4px solid ${asoc.color}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontSize:16,fontWeight:700}}>{asoc.nombre}</div>
            <button style={styles.btn("olive")} onClick={()=>{setForm({asociacionId:asoc.id});setShowModal("area");}}><Icon name="plus" size={13}/> Nueva área</button>
          </div>
          {areas.filter(a=>a.asociacionId===asoc.id).map(a=>(
            <div key={a.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 14px",background:C.bg,borderRadius:8,marginBottom:6}}>
              <div>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <span style={{...styles.badge(asoc.color,asoc.colorLight),fontFamily:"monospace",fontSize:12}}>cod. {a.codigo}</span>
                  <span style={{fontWeight:600,fontSize:13}}>{a.nombre}</span>
                </div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>Coordinador: {a.coordinador||"No asignado"}</div>
              </div>
              <button style={{...styles.btn("ghost"),padding:"5px 10px",color:C.danger}} onClick={()=>removeArea(a.id)}><Icon name="trash" size={13}/></button>
            </div>
          ))}
          {areas.filter(a=>a.asociacionId===asoc.id).length===0&&<div style={{color:C.muted,fontSize:13}}>Sin áreas configuradas.</div>}
        </div>
      ))}
      <div style={{...styles.card,background:C.slateLight,border:`1px solid ${C.slate}33`}}>
        <div style={{fontWeight:700,marginBottom:8,color:C.slate}}>🔢 Consecutivo global actual</div>
        <div style={{fontSize:24,fontWeight:800,color:C.slate}}>{data.consecutivoGlobal||0}</div>
        <div style={{fontSize:12,color:C.muted,marginTop:4}}>El siguiente registro recibirá el consecutivo #{(data.consecutivoGlobal||0)+1}, compartido entre todas las áreas.</div>
      </div>
      {showModal==="area"&&(
        <Modal title="Nueva área" onClose={()=>setShowModal(null)}>
          <Field label="Asociación">
            <select style={styles.select} value={form.asociacionId||""} onChange={e=>setForm(f=>({...f,asociacionId:e.target.value}))}>
              {asociaciones.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:12}}>
            <Field label="Nombre del área *"><input style={styles.input} value={form.nombre||""} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))}/></Field>
            <Field label="Código (2 dígitos) *"><input style={{...styles.input,fontFamily:"monospace",letterSpacing:2,textAlign:"center"}} value={form.codigo||""} maxLength={2} onChange={e=>setForm(f=>({...f,codigo:e.target.value.replace(/\D/g,"").slice(0,2)}))}/></Field>
          </div>
          <Field label="Nombre del coordinador"><input style={styles.input} value={form.coordinador||""} onChange={e=>setForm(f=>({...f,coordinador:e.target.value}))}/></Field>
          <div style={{display:"flex",justifyContent:"flex-end",gap:10}}>
            <button style={styles.btn("neutral")} onClick={()=>setShowModal(null)}>Cancelar</button>
            <button style={styles.btn()} onClick={saveArea}><Icon name="check" size={14}/> Guardar área</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
const NAV=[
  {id:"dashboard",label:"Panel general",icon:"home",section:"Principal"},
  {id:"personas",label:"Personas",icon:"users",section:"Gestión"},
  {id:"expedientes",label:"Expedientes",icon:"folder",section:"Gestión"},
  {id:"eventos",label:"Eventos",icon:"calendar",section:"Gestión"},
  {id:"gastos",label:"Solicitudes de gasto",icon:"dollar",section:"Gestión"},
  {id:"config",label:"Configuración",icon:"map",section:"Sistema"},
];

// ─── PANTALLA DE LOGIN ────────────────────────────────────────────────────────
function Login({onLogin}) {
  const [email,setEmail]=useState("");
  const [pass,setPass]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  async function handleLogin() {
    if(!email.trim()||!pass.trim()) return setError("Ingresa tu correo y contraseña.");
    setLoading(true); setError("");
    try {
      const auth=getAuth();
      const cred=await signInWithEmailAndPassword(auth,email,pass);
      const rolInfo=getRolInfo(cred.user.email);
      if(!rolInfo) { await signOut(auth); return setError("Tu cuenta no tiene acceso configurado. Contacta al administrador."); }
      onLogin(cred.user, rolInfo);
    } catch(e) {
      setError("Correo o contraseña incorrectos.");
    }
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:C.slate,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.surface,borderRadius:16,padding:"40px 36px",width:"100%",maxWidth:400,boxShadow:"0 24px 60px rgba(0,0,0,.3)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:28,fontWeight:800,color:C.slate,marginBottom:4}}>SIGEAC</div>
          <div style={{fontSize:13,color:C.muted}}>Sistema de Gestión de Asociaciones Civiles</div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={styles.label}>Correo electrónico</label>
          <input style={styles.input} type="email" placeholder="tu@correo.com" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={styles.label}>Contraseña</label>
          <input style={styles.input} type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
        </div>
        {error&&<div style={{background:C.dangerLight,color:C.danger,borderRadius:8,padding:"10px 14px",fontSize:13,marginBottom:16}}>{error}</div>}
        <button style={{...styles.btn(),width:"100%",justifyContent:"center",padding:"12px"}} onClick={handleLogin} disabled={loading}>
          {loading?"Ingresando...":"Ingresar →"}
        </button>
        <div style={{textAlign:"center",marginTop:20,fontSize:11,color:C.muted}}>
          Fundación Borquez Schwarzbeck · Comercio Justo Campos Bórquez
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [view,setView]=useState("dashboard");
  const [data,setData]=useState(null);
  const [loading,setLoading]=useState(true);
  const [menuOpen,setMenuOpen]=useState(false);
  const [usuario,setUsuario]=useState(null);
  const [rolInfo,setRolInfo]=useState(null);
  const [authChecked,setAuthChecked]=useState(false);

  useEffect(()=>{
    // Cargar EmailJS
    const script=document.createElement("script");
    script.src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js";
    script.onload=()=>window.emailjs.init("bW0siuepAncPncYKm");
    document.head.appendChild(script);

    // Verificar sesión activa
    const auth=getAuth();
    const unsub=onAuthStateChanged(auth,user=>{
      if(user){
        const ri=getRolInfo(user.email);
        if(ri){ setUsuario(user); setRolInfo(ri); loadData().then(d=>{setData(d);setLoading(false);}); }
        else { signOut(auth); }
      } else {
        setLoading(false);
      }
      setAuthChecked(true);
    });
    return ()=>unsub();
  },[]);

  function handleLogin(user,ri){
    setUsuario(user); setRolInfo(ri);
    loadData().then(d=>{setData(d);setLoading(false);});
  }

  async function handleLogout(){
    const auth=getAuth();
    await signOut(auth);
    setUsuario(null); setRolInfo(null); setData(null); setLoading(true);
  }

  if(!authChecked||loading) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,color:C.muted,fontSize:14}}>Cargando SIGEAC...</div>;
  if(!usuario||!rolInfo) return <Login onLogin={handleLogin}/>;
  if(!data) return <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:C.bg,color:C.muted,fontSize:14}}>Cargando datos...</div>;

  // Filtrar nav según rol
  const navVisible = NAV.filter(n=>{
    if(n.id==="gastos") return rolInfo.rol==="admin"||rolInfo.verGastos||rolInfo.rol==="admin_acj"||rolInfo.rol==="coordinador";
    if(n.id==="config") return rolInfo.rol==="admin"||rolInfo.rol==="admin_acj";
    return true;
  });

  const sections=[...new Set(navVisible.map(n=>n.section))];
  const puedeEditar=puedeModificar(rolInfo);

  // Sidebar responsive
  const sidebarStyle = {
    ...styles.sidebar,
    position: window.innerWidth<768?"fixed":"relative",
    left: window.innerWidth<768?(menuOpen?"0":"-260px"):"auto",
    top:0, zIndex:200,
    transition:"left .25s",
    height:"100vh",
    overflowY:"auto",
  };

  return (
    <div style={{...styles.app,display:"flex"}}>
      {/* Overlay móvil */}
      {menuOpen&&window.innerWidth<768&&(
        <div onClick={()=>setMenuOpen(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:199}}/>
      )}

      {/* Botón hamburguesa móvil */}
      {window.innerWidth<768&&(
        <button onClick={()=>setMenuOpen(m=>!m)} style={{position:"fixed",top:12,left:12,zIndex:300,background:C.slate,border:"none",borderRadius:8,padding:"8px 10px",cursor:"pointer",color:"#fff"}}>
          <Icon name="home" size={18}/>
        </button>
      )}

      <div style={sidebarStyle}>
        <div style={styles.sidebarLogo}>
          <div style={styles.sidebarLogoTitle}>SIGEAC</div>
          <div style={styles.sidebarLogoSub}>Sistema de Gestión AC</div>
        </div>
        <div style={{flex:1,padding:"12px 0"}}>
          {sections.map(sec=>(
            <div key={sec}>
              <div style={styles.sidebarSection}>{sec}</div>
              {navVisible.filter(n=>n.section===sec).map(n=>(
                <div key={n.id} style={styles.sidebarItem(view===n.id)} onClick={()=>{setView(n.id);setMenuOpen(false);}}>
                  <Icon name={n.icon} size={15}/>{n.label}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{padding:"12px 16px"}}>
          <div style={{fontSize:11,color:"rgba(255,255,255,.5)",marginBottom:4}}>{rolInfo.nombre}</div>
          <div style={{fontSize:10,color:"rgba(255,255,255,.3)",marginBottom:10,wordBreak:"break-all"}}>{usuario.email}</div>
          {!puedeEditar&&<div style={{...styles.badge(C.gold,C.goldLight),fontSize:10,marginBottom:10}}>Solo lectura</div>}
          <button onClick={handleLogout} style={{...styles.btn("ghost"),color:"rgba(255,255,255,.5)",fontSize:12,padding:"6px 0",width:"100%",justifyContent:"flex-start"}}>
            <Icon name="lock" size={13}/> Cerrar sesión
          </button>
        </div>
      </div>

      <div style={{...styles.main,paddingTop:window.innerWidth<768?"56px":"32px"}}>
        {view==="dashboard"&&<Dashboard data={data}/>}
        {view==="personas"&&<Personas data={data} setData={setData}/>}
        {view==="expedientes"&&<Expedientes data={data} setData={setData}/>}
        {view==="eventos"&&<Eventos data={data} setData={setData}/>}
        {view==="gastos"&&<Gastos data={data} setData={setData}/>}
        {view==="config"&&<Configuracion data={data} setData={setData}/>}
      </div>
    </div>
  );
}

// ─── MÓDULO: SOLICITUDES DE GASTO ────────────────────────────────────────────
const CENTROS_COSTO = [
  "Programa de Becas","Área Cultural","Área Social","Área Educativa",
  "Área Comunitaria","Operación General","Administración","Otro"
];
const ESTATUS_GASTO = ["Pendiente","Aprobado","Pagado","Rechazado"];
const BANCOS = ["BBVA","Banamex / Citibanamex","Santander","Banorte","HSBC",
  "Inbursa","Scotiabank","BanBajío","Otro"];

async function enviarCorreoTesoreria(solicitud) {
  try {
    await window.emailjs.send(
      "service_pcjaz5g",
      "template_wgi8z9n",
      {
        asociacion: solicitud.asociacion,
        proveedor: solicitud.proveedor,
        descripcion: solicitud.descripcion,
        monto_mxn: solicitud.montoMXN ? `$${Number(solicitud.montoMXN).toLocaleString("es-MX")}` : "—",
        monto_usd: solicitud.montoUSD ? `$${solicitud.montoUSD} USD` : "—",
        rfc: solicitud.rfcProveedor || "—",
        "clave-interbancaria": solicitud.clabe || solicitud.cuenta || "—",
        "centrode-costo": solicitud.centroCosto,
        solicitante: solicitud.solicitante,
        finalidad: solicitud.finalidad,
        fecha: new Date().toLocaleDateString("es-MX"),
      },
      "bW0siuepAncPncYKm"
    );
  } catch(e) { console.error("Error enviando correo:", e); }
}

function Gastos({data, setData}) {
  const [showModal, setShowModal] = useState(false);
  const [showProv, setShowProv] = useState(false);
  const [filtroEstatus, setFiltroEstatus] = useState("todos");
  const [filtroAsoc, setFiltroAsoc] = useState("todas");
  const [form, setForm] = useState({});
  const [busqProv, setBusqProv] = useState("");
  const [conceptos, setConceptos] = useState([{desc:"",cantidad:0,precio:0}]);
  const [enviandoCorreo, setEnviandoCorreo] = useState(false);
  const { gastos=[], proveedores=[], asociaciones, areas } = data;

  const provsFiltrados = proveedores.filter(p =>
    p.nombre?.toLowerCase().includes(busqProv.toLowerCase()) ||
    p.rfc?.toLowerCase().includes(busqProv.toLowerCase())
  );

  function seleccionarProveedor(prov) {
    setForm(f => ({
      ...f,
      proveedor: prov.nombre,
      rfcProveedor: prov.rfc,
      banco: prov.banco,
      clabe: prov.clabe,
      cuenta: prov.cuenta,
    }));
    setShowProv(false);
    setBusqProv("");
  }

  function calcTotal() {
    return conceptos.reduce((s,c) => s + (Number(c.cantidad)||0)*(Number(c.precio)||0), 0);
  }

  function agregarConcepto() {
    setConceptos(prev => [...prev, {desc:"",cantidad:0,precio:0}]);
  }
  function removeConcepto(i) {
    setConceptos(prev => prev.filter((_,idx) => idx !== i));
  }
  function updateConcepto(i, field, val) {
    setConceptos(prev => prev.map((c,idx) => idx===i ? {...c,[field]:val} : c));
  }

  async function save() {
    if (!form.solicitante?.trim()) return alert("Ingresa el nombre del solicitante.");
    if (!form.asociacionId) return alert("Selecciona la asociación.");
    if (!form.proveedor?.trim()) return alert("Ingresa el nombre del proveedor.");
    if (!form.descripcion?.trim()) return alert("Ingresa la descripción del gasto.");
    if (!form.centroCosto) return alert("Selecciona el centro de costo.");
    if (conceptos.length === 0) return alert("Agrega al menos un concepto.");

    const total = calcTotal();
    const asoc = asociaciones.find(a => a.id === form.asociacionId);

    const solicitud = {
      ...form,
      id: uid(),
      fecha: new Date().toISOString(),
      estatus: "Pendiente",
      conceptos,
      montoMXN: total,
      asociacion: asoc?.nombre,
    };

    // Guardar proveedor si es nuevo
    const provExiste = proveedores.some(p =>
      p.rfc === form.rfcProveedor || p.nombre === form.proveedor
    );

    setData(prev => {
      const nuevosProvs = provExiste ? prev.proveedores||[] : [
        ...(prev.proveedores||[]),
        {
          id: uid(),
          nombre: form.proveedor,
          rfc: form.rfcProveedor||"",
          banco: form.banco||"",
          clabe: form.clabe||"",
          cuenta: form.cuenta||"",
        }
      ];
      const next = {
        ...prev,
        gastos: [...(prev.gastos||[]), solicitud],
        proveedores: nuevosProvs,
      };
      saveData(next);
      return next;
    });

    setEnviandoCorreo(true);
    await enviarCorreoTesoreria(solicitud);
    setEnviandoCorreo(false);

    setShowModal(false);
    setForm({});
    setConceptos([{desc:"",cantidad:0,precio:0}]);
    alert("✓ Solicitud registrada. Se envió notificación a tesorería.");
  }

  function cambiarEstatus(id, estatus) {
    setData(prev => {
      const next = {
        ...prev,
        gastos: prev.gastos.map(g => g.id===id ? {...g,estatus} : g)
      };
      saveData(next); return next;
    });
  }

  const lista = gastos.filter(g => {
    const matchE = filtroEstatus==="todos" || g.estatus===filtroEstatus;
    const matchA = filtroAsoc==="todas" || g.asociacionId===filtroAsoc;
    return matchE && matchA;
  });

  const statusColor = {
    Pendiente: {c:C.gold, bg:C.goldLight},
    Aprobado: {c:C.olive, bg:C.oliveLight},
    Pagado: {c:C.slate, bg:C.slateLight},
    Rechazado: {c:C.danger, bg:C.dangerLight},
  };

  return (
    <div>
      <div style={{...styles.header,display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={styles.pageTitle}>Solicitudes de Gasto</div>
          <div style={styles.pageSubtitle}>{lista.length} solicitudes · Total: {fmtCurrency(lista.reduce((s,g)=>s+(Number(g.montoMXN)||0),0))}</div>
        </div>
        <button style={styles.btn("purple")} onClick={()=>{setForm({asociacionId:asociaciones[0]?.id});setConceptos([{desc:"",cantidad:0,precio:0}]);setShowModal(true);}}>
          <Icon name="plus" size={15}/> Nueva solicitud
        </button>
      </div>

      {/* Filtros */}
      <div style={{display:"flex",gap:12,marginBottom:20}}>
        <select style={{...styles.select,width:200}} value={filtroAsoc} onChange={e=>setFiltroAsoc(e.target.value)}>
          <option value="todas">Todas las asociaciones</option>
          {asociaciones.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select style={{...styles.select,width:160}} value={filtroEstatus} onChange={e=>setFiltroEstatus(e.target.value)}>
          <option value="todos">Todos los estatus</option>
          {ESTATUS_GASTO.map(e=><option key={e} value={e}>{e}</option>)}
        </select>
      </div>

      {/* Tabla de solicitudes */}
      {lista.length===0 ? (
        <div style={{...styles.card,textAlign:"center",padding:40,color:C.muted}}>
          <Icon name="dollar" size={32}/><div style={{marginTop:12}}>No hay solicitudes registradas.</div>
        </div>
      ) : (
        <div style={styles.card}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{borderBottom:`2px solid ${C.border}`}}>
                {["Fecha","Solicitante","Proveedor","Descripción","Centro de Costo","Monto MXN","Estatus",""].map(h=>(
                  <th key={h} style={{textAlign:"left",padding:"8px 12px",fontSize:11,fontWeight:700,color:C.muted,textTransform:"uppercase",letterSpacing:0.5}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map(g=>{
                const sc = statusColor[g.estatus]||{c:C.muted,bg:C.bg};
                return (
                  <tr key={g.id} style={{borderBottom:`1px solid ${C.border}`}}>
                    <td style={{padding:"10px 12px",color:C.muted,whiteSpace:"nowrap"}}>{fmtDate(g.fecha)}</td>
                    <td style={{padding:"10px 12px",fontWeight:600}}>{g.solicitante}</td>
                    <td style={{padding:"10px 12px"}}>{g.proveedor}</td>
                    <td style={{padding:"10px 12px",color:C.muted,maxWidth:180}}>{g.descripcion}</td>
                    <td style={{padding:"10px 12px"}}><span style={styles.badge(C.slate,C.slateLight)}>{g.centroCosto}</span></td>
                    <td style={{padding:"10px 12px",fontWeight:700}}>{fmtCurrency(g.montoMXN)}</td>
                    <td style={{padding:"10px 12px"}}>
                      <select
                        style={{...styles.select,width:"auto",padding:"4px 8px",background:sc.bg,color:sc.c,fontWeight:700,border:`1px solid ${sc.c}33`}}
                        value={g.estatus}
                        onChange={e=>cambiarEstatus(g.id,e.target.value)}
                      >
                        {ESTATUS_GASTO.map(e=><option key={e} value={e}>{e}</option>)}
                      </select>
                    </td>
                    <td style={{padding:"10px 12px"}}>
                      <button style={{...styles.btn("ghost"),padding:"5px 10px",fontSize:11}} onClick={()=>window.print()}>
                        <Icon name="clipboard" size={12}/>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL NUEVA SOLICITUD */}
      {showModal && (
        <Modal title="Nueva solicitud de gasto" onClose={()=>setShowModal(false)} width={700}>
          {/* Datos generales */}
          <div style={{fontWeight:700,fontSize:13,color:C.slate,marginBottom:12,textTransform:"uppercase",letterSpacing:0.5}}>Datos generales</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:16}}>
            <Field label="Solicitante *"><input style={styles.input} value={form.solicitante||""} onChange={e=>setForm(f=>({...f,solicitante:e.target.value}))}/></Field>
            <Field label="Asociación *">
              <select style={styles.select} value={form.asociacionId||""} onChange={e=>setForm(f=>({...f,asociacionId:e.target.value}))}>
                {asociaciones.map(a=><option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </Field>
            <Field label="Centro de costo *">
              <select style={styles.select} value={form.centroCosto||""} onChange={e=>setForm(f=>({...f,centroCosto:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {CENTROS_COSTO.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Finalidad del gasto *"><input style={styles.input} placeholder="¿Para qué programa o actividad?" value={form.finalidad||""} onChange={e=>setForm(f=>({...f,finalidad:e.target.value}))}/></Field>
          </div>
          <Field label="Descripción del gasto *"><input style={styles.input} placeholder="Describe el gasto..." value={form.descripcion||""} onChange={e=>setForm(f=>({...f,descripcion:e.target.value}))}/></Field>

          {/* Proveedor */}
          <div style={{fontWeight:700,fontSize:13,color:C.slate,margin:"20px 0 12px",textTransform:"uppercase",letterSpacing:0.5}}>Datos del proveedor</div>
          <div style={{display:"flex",gap:10,marginBottom:12}}>
            <div style={{flex:1,position:"relative"}}>
              <input style={styles.input} placeholder="Nombre o RFC del proveedor..." value={busqProv} onChange={e=>{setBusqProv(e.target.value);setForm(f=>({...f,proveedor:e.target.value}));}} onFocus={()=>setShowProv(true)}/>
              {showProv && busqProv && provsFiltrados.length>0 && (
                <div style={{position:"absolute",top:"100%",left:0,right:0,background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,zIndex:100,boxShadow:"0 4px 16px rgba(0,0,0,.1)"}}>
                  {provsFiltrados.map(p=>(
                    <div key={p.id} style={{padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${C.border}`}} onClick={()=>seleccionarProveedor(p)}>
                      <div style={{fontWeight:600,fontSize:13}}>{p.nombre}</div>
                      <div style={{fontSize:11,color:C.muted}}>RFC: {p.rfc} · {p.banco}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="RFC del proveedor"><input style={styles.input} value={form.rfcProveedor||""} onChange={e=>setForm(f=>({...f,rfcProveedor:e.target.value.toUpperCase()}))}/></Field>
            <Field label="No. de factura"><input style={styles.input} value={form.noFactura||""} onChange={e=>setForm(f=>({...f,noFactura:e.target.value}))}/></Field>
            <Field label="Banco">
              <select style={styles.select} value={form.banco||""} onChange={e=>setForm(f=>({...f,banco:e.target.value}))}>
                <option value="">Seleccionar...</option>
                {BANCOS.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="CLABE interbancaria"><input style={{...styles.input,fontFamily:"monospace"}} value={form.clabe||""} maxLength={18} onChange={e=>setForm(f=>({...f,clabe:e.target.value}))}/></Field>
            <Field label="No. de cuenta (si no hay CLABE)"><input style={{...styles.input,fontFamily:"monospace"}} value={form.cuenta||""} onChange={e=>setForm(f=>({...f,cuenta:e.target.value}))}/></Field>
            <Field label="Monto en USD (si aplica)"><input type="number" style={styles.input} value={form.montoUSD||""} onChange={e=>setForm(f=>({...f,montoUSD:e.target.value}))}/></Field>
          </div>

          {/* Conceptos */}
          <div style={{fontWeight:700,fontSize:13,color:C.slate,margin:"20px 0 12px",textTransform:"uppercase",letterSpacing:0.5}}>Conceptos del gasto</div>
          {conceptos.map((c,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr auto",gap:10,marginBottom:10,alignItems:"end"}}>
              <div><label style={styles.label}>Descripción</label><input style={styles.input} value={c.desc} onChange={e=>updateConcepto(i,"desc",e.target.value)} placeholder="Concepto..."/></div>
              <div><label style={styles.label}>Cantidad</label><input type="number" style={styles.input} value={c.cantidad} onChange={e=>updateConcepto(i,"cantidad",e.target.value)} min={0}/></div>
              <div><label style={styles.label}>Precio unitario</label><input type="number" style={styles.input} value={c.precio} onChange={e=>updateConcepto(i,"precio",e.target.value)} min={0}/></div>
              <button style={{...styles.btn("ghost"),color:C.danger,padding:"9px 10px"}} onClick={()=>removeConcepto(i)}><Icon name="trash" size={14}/></button>
            </div>
          ))}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:4}}>
            <button style={styles.btn("neutral")} onClick={agregarConcepto}><Icon name="plus" size={13}/> Agregar concepto</button>
            <div style={{background:C.goldLight,border:`1px solid ${C.goldLight}`,borderRadius:8,padding:"8px 16px"}}>
              <span style={{fontSize:12,color:C.muted,marginRight:8}}>TOTAL MXN</span>
              <span style={{fontSize:18,fontWeight:800,color:C.gold}}>{fmtCurrency(calcTotal())}</span>
            </div>
          </div>

          <div style={{display:"flex",justifyContent:"flex-end",gap:10,marginTop:20}}>
            <button style={styles.btn("neutral")} onClick={()=>setShowModal(false)}>Cancelar</button>
            <button style={styles.btn()} onClick={save} disabled={enviandoCorreo}>
              {enviandoCorreo ? "Enviando..." : <><Icon name="check" size={14}/> Registrar solicitud</>}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── ESTADÍSTICAS POR EVENTO ──────────────────────────────────────────────────
function EstadisticasEvento({evento, data}) {
  const { participaciones, personas } = data;
  const partics = participaciones.filter(p => p.eventoId === evento.id);
  const personasEvento = partics.map(p => personas.find(x => x.id === p.personaId)).filter(Boolean);

  // Grupos de edad
  function getEdad(fechaNac) {
    if (!fechaNac) return null;
    const hoy = new Date();
    const nac = new Date(fechaNac);
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
  }
  function getGrupoEdad(edad) {
    if (edad === null) return "No especificado";
    if (edad >= 6 && edad <= 12) return "6–12 años";
    if (edad >= 13 && edad <= 17) return "13–17 años";
    if (edad >= 18 && edad <= 25) return "18–25 años";
    if (edad >= 26 && edad <= 59) return "26–59 años";
    if (edad >= 60) return "60+ años";
    return "Otro";
  }

  const grupos = {};
  const generos = { Masculino:0, Femenino:0, "No especificado":0 };

  personasEvento.forEach(p => {
    const edad = getEdad(p.fechaNac);
    const grupo = getGrupoEdad(edad);
    grupos[grupo] = (grupos[grupo]||0) + 1;
    const gen = p.sexo || "No especificado";
    generos[gen] = (generos[gen]||0) + 1;
  });

  const totalSesiones = evento.sesiones?.length || 0;
  const totalMinutos = evento.sesiones?.reduce((s,x)=>s+(Number(x.duracionMin)||0),0)||0;
  const costoTotal = Number(evento.costoTotal)||0;
  const costoParticipante = partics.length>0 ? costoTotal/partics.length : 0;

  const COLORES_EDAD = ["#B5522A","#5A6B3A","#3B5068","#9A7B2A","#6B3A8A","#888"];
  const GRUPOS_ORDEN = ["6–12 años","13–17 años","18–25 años","26–59 años","60+ años","No especificado"];
  const maxGrupo = Math.max(...Object.values(grupos), 1);

  return (
    <div style={{marginTop:16}}>
      {/* Métricas principales */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:16}}>
        {[
          {l:"Participantes",v:partics.length,c:C.terra,bg:C.terraLight},
          {l:"Sesiones",v:totalSesiones,c:C.slate,bg:C.slateLight},
          {l:"Horas totales",v:`${(totalMinutos/60).toFixed(1)}h`,c:C.purple,bg:C.purpleLight},
          {l:"Costo total",v:fmtCurrency(costoTotal),c:C.gold,bg:C.goldLight},
          {l:"Costo por participante",v:fmtCurrency(costoParticipante),c:C.olive,bg:C.oliveLight},
        ].map(s=>(
          <div key={s.l} style={{background:s.bg,borderRadius:10,padding:"12px 16px"}}>
            <div style={{fontSize:10,fontWeight:700,color:s.c,textTransform:"uppercase",letterSpacing:0.5}}>{s.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:s.c,marginTop:4}}>{s.v}</div>
          </div>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Género */}
        <div style={styles.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:14,color:C.slate}}>Por género</div>
          {Object.entries(generos).map(([gen,cnt])=>{
            if(cnt===0) return null;
            const pct = partics.length>0?Math.round((cnt/partics.length)*100):0;
            const color = gen==="Masculino"?C.slate:gen==="Femenino"?C.terra:C.muted;
            return (
              <div key={gen} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:13}}>{gen}</span>
                  <span style={{fontWeight:700,color}}>{cnt} ({pct}%)</span>
                </div>
                <div style={{height:8,background:C.bg,borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:4,transition:"width .5s"}}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Grupos de edad */}
        <div style={styles.card}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:14,color:C.slate}}>Por grupo de edad</div>
          {GRUPOS_ORDEN.map((g,i)=>{
            const cnt = grupos[g]||0;
            if(cnt===0) return null;
            const pct = Math.round((cnt/partics.length)*100);
            return (
              <div key={g} style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:12}}>{g}</span>
                  <span style={{fontWeight:700,color:COLORES_EDAD[i]}}>{cnt} ({pct}%)</span>
                </div>
                <div style={{height:8,background:C.bg,borderRadius:4,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${pct}%`,background:COLORES_EDAD[i],borderRadius:4}}/>
                </div>
              </div>
            );
          })}
          {Object.keys(grupos).length===0&&<div style={{color:C.muted,fontSize:13}}>Sin datos de edad registrados.</div>}
        </div>
      </div>
    </div>
  );
}
