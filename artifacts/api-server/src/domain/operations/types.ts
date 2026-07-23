import type { AdminSession } from "@/lib/admin";
export type AdminActor = AdminSession & { correlationId:string };
export type AuditInput = {action:string;targetType:string;targetId:string;before?:unknown;after?:unknown;reason:string};
