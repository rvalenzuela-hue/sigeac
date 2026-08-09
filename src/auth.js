// ─── CONFIGURACIÓN DE ROLES ───────────────────────────────────────────────────
// Cada correo tiene asignado un rol y el área a la que pertenece
export const ROLES_CONFIG = {
  "rvalenzuela@fundacionborquezschwarzbeck.org": {
    rol: "admin",
    nombre: "Administrador",
    areas: ["AR1","AR2","AR3","AR4"],
    asociaciones: ["A1","A2"],
  },
  "charo@camposborquez.com": {
    rol: "direccion",
    nombre: "Dirección General / Tesorería",
    areas: ["AR1","AR2","AR3","AR4"],
    asociaciones: ["A1","A2"],
    soloLectura: true,
    verGastos: true,
  },
  "acomerciojusto@camposborquez.com": {
    rol: "admin_acj",
    nombre: "Administrador ACJ",
    areas: ["AR3","AR4"],
    asociaciones: ["A2"],
  },
  "ybautista@fundacionborquezschwarzbeck.org": {
    rol: "coordinador",
    nombre: "Coordinador Caborca",
    areas: ["AR2"],
    asociaciones: ["A1"],
  },
  "preventivocaborca@fundacionborquezschwarzbeck.org": {
    rol: "coordinador",
    nombre: "Coordinador Caborca",
    areas: ["AR2"],
    asociaciones: ["A1"],
  },
  "contacto@fundacionborquezschwarzbeck.org": {
    rol: "coordinador",
    nombre: "Coordinador Bácum / Campo 77",
    areas: ["AR1"],
    asociaciones: ["A1"],
  },
  "itomnawam@fundacionborquezschwarzbeck.org": {
    rol: "coordinador",
    nombre: "Coordinador Bácum / Campo 77",
    areas: ["AR1"],
    asociaciones: ["A1"],
  },
};

export function getRolInfo(email) {
  return ROLES_CONFIG[email] || null;
}

export function puedeModificar(rolInfo) {
  return !rolInfo?.soloLectura;
}

export function esAdmin(rolInfo) {
  return rolInfo?.rol === "admin";
}

export function puedeVerArea(rolInfo, areaId) {
  if (!rolInfo) return false;
  if (rolInfo.rol === "admin") return true;
  return rolInfo.areas?.includes(areaId);
}

export function puedeVerAsociacion(rolInfo, asociacionId) {
  if (!rolInfo) return false;
  if (rolInfo.rol === "admin") return true;
  return rolInfo.asociaciones?.includes(asociacionId);
}
