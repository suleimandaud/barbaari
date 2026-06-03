export type Role =
  | "parent"
  | "staff"
  | "teacher"
  | "owner"
  | "manager"
  | "director"
  | "billing_manager"
  | "platform_owner"
  | "super_admin"
  | "support"
  | "finance";

export const roleGroups: Record<"mobile" | "daycareWeb" | "superAdmin", Role[]> = {
  mobile: ["parent", "staff", "teacher"],
  daycareWeb: ["owner", "manager", "director", "billing_manager"],
  superAdmin: ["platform_owner", "super_admin", "support", "finance"]
};

export function canAccessApp(role: Role, app: keyof typeof roleGroups) {
  return roleGroups[app].includes(role);
}
