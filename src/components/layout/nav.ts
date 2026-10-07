import {
  Activity,
  BadgeCheck,
  Bot,
  Boxes,
  LayoutDashboard,
  ListTodo,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

export const primaryNav: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/products", label: "Products", icon: Boxes },
  { href: "/work-items", label: "Work Items", icon: ListTodo },
  { href: "/approvals", label: "Approvals", icon: BadgeCheck },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/agents", label: "Agents", icon: Bot },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: Settings, exact: true },
];

export function isNavActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
