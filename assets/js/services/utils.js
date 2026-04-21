export const ROLES = [
  "Gerente",
  "Vendedor",
  "Estoque",
  "Entregador"
];

export const ACCESS_LEVELS = [
  "master",
  "admin",
  "manager",
  "standard"
];

export const AREAS = [
  "dashboard",
  "sales",
  "products",
  "reports",
  "deliveries",
  "clients",
  "suppliers",
  "purchases",
  "payables",
  "users",
  "settings"
];

export const paymentMethods = [
  "Dinheiro",
  "PIX",
  "Cartão",
  "Transferência",
  "Vale",
  "Outro"
];

export const deliveryStatuses = [
  "Agendado",
  "Em rota",
  "Concluído",
  "Cancelado",
  "Reagendado",
  "Recolhimento"
];

export function currency(value = 0) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

export function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDate(value) {
  const date = value?.toDate ? value.toDate() : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

export function formatDateTime(value) {
  const date = value?.toDate ? value.toDate() : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
}

export function formatRole(role) {
  return role || "-";
}

export function ensurePermissionsByRole(role, accessLevel = "standard") {
  if (accessLevel === "master" || accessLevel === "admin") {
    return [...AREAS];
  }

  if (accessLevel === "manager" || role === "Gerente") {
    return [
      "dashboard",
      "sales",
      "products",
      "reports",
      "deliveries",
      "clients",
      "suppliers",
      "purchases",
      "payables"
    ];
  }

  if (role === "Vendedor") {
    return ["sales", "products", "deliveries", "clients"];
  }

  if (role === "Estoque") {
    return ["products", "suppliers", "purchases", "payables"];
  }

  if (role === "Entregador") {
    return ["deliveries"];
  }

  return [];
}

export function hasPermission(user, area) {
  if (!user || user.active === false || user.deleted === true) {
    return false;
  }

  if (user.accessLevel === "master" || user.accessLevel === "admin") {
    return true;
  }

  return Array.isArray(user.permissions) && user.permissions.includes(area);
}

export function isMaster(user) {
  return user?.accessLevel === "master";
}

export function isAdmin(user) {
  return user?.accessLevel === "master" || user?.accessLevel === "admin";
}

export function isManager(user) {
  return isAdmin(user) || user?.accessLevel === "manager";
}

export function canManageUsers(user) {
  return isAdmin(user);
}

export function canImportBackup(user) {
  return isMaster(user);
}

export function canEditTargetUser(actor, target) {
  if (!actor || !target || actor.active === false) return false;
  if (isMaster(actor)) return true;
  if (actor.uid === target.uid) return false;
  if (actor.accessLevel === "admin") {
    return target.accessLevel !== "master";
  }
  return false;
}

export function canInactivateTargetUser(actor, target) {
  if (!actor || !target || actor.active === false) return false;
  if (actor.uid === target.uid) return false;
  if (isMaster(actor)) return true;
  if (actor.accessLevel === "admin") {
    return target.accessLevel !== "master";
  }
  return false;
}

export function canAssignAccessLevel(actor, targetAccessLevel) {
  if (!actor) return false;

  if (isMaster(actor)) {
    return ["master", "admin", "manager", "standard"].includes(targetAccessLevel);
  }

  if (actor.accessLevel === "admin") {
    return ["admin", "manager", "standard"].includes(targetAccessLevel);
  }

  return false;
}

export function timestampFromDateTime(dateValue, timeValue) {
  const dateTime = new Date(`${dateValue}T${timeValue || "00:00"}`);
  return Number.isNaN(dateTime.getTime()) ? new Date() : dateTime;
}