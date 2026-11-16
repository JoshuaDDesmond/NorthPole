"use client";

import { BookOpen, Clock, Home, LogOut, Settings, Sparkles, SlidersHorizontal, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/lib/client/api";
import { ToastProvider } from "@/components/ui";

const NAV = [
  { href: "/parent", label: "Overview", icon: Home, exact: true },
  { href: "/parent/children", label: "Children", icon: Users },
  { href: "/parent/memories", label: "Santa's Memory", icon: Sparkles },
  { href: "/parent/personality", label: "Personality", icon: SlidersHorizontal },
  { href: "/parent/history", label: "Call History", icon: Clock },
  { href: "/parent/settings", label: "Settings", icon: Settings },
];

export function DashboardShell({ children, parentName, familyName, pendingMemories, callingEnabled }: {
  children: ReactNode;
  parentName: string;
  familyName: string;
  pendingMemories: number;
  callingEnabled: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname === href || pathname.startsWith(href + "/"));

  async function logout() {
    await api("/api/parent/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/parent/login");
    router.refresh();
  }

  return (
    <ToastProvider>
      <div className="np-backdrop min-h-dvh lg:flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-ink/70 px-4 py-6 backdrop-blur lg:flex">
          <div className="flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-evergreen ring-1 ring-inset ring-line">
              <BookOpen className="h-5 w-5 text-gold" strokeWidth={1.6} />
            </div>
            <div className="min-w-0">
              <p className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.16em] text-gold">Santa&apos;s Secret Book</p>
              <p className="truncate text-sm text-snow">{familyName}</p>
            </div>
          </div>
          <nav className="mt-8 flex flex-col gap-1">
            {NAV.map(({ href, label, icon: Icon, exact }) => (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive(href, exact) ? "bg-white/[0.08] text-snow" : "text-mist hover:bg-white/[0.04] hover:text-snow"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} />
                <span className="flex-1">{label}</span>
                {href === "/parent/memories" && pendingMemories > 0 && (
                  <span className="rounded-full bg-gold px-1.5 text-[11px] font-semibold text-ink">{pendingMemories}</span>
                )}
              </Link>
            ))}
          </nav>
          <div className="mt-auto space-y-3">
            <div className={`rounded-xl border px-3 py-2.5 text-xs ${callingEnabled ? "border-call/25 text-[#8fe0ae]" : "border-berry/40 text-[#ef9ea3]"}`}>
              <span className={`mr-2 inline-block h-1.5 w-1.5 rounded-full ${callingEnabled ? "bg-call" : "bg-berry"}`} />
              {callingEnabled ? "Santa's line is open" : "Calling is turned off"}
            </div>
            <div className="flex items-center justify-between px-2">
              <p className="truncate text-xs text-mist">{parentName}</p>
              <button onClick={logout} className="flex items-center gap-1.5 text-xs text-mist transition hover:text-snow">
                <LogOut className="h-3.5 w-3.5" /> Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ink/85 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur lg:hidden">
          <div className="flex items-center gap-2.5">
            <BookOpen className="h-5 w-5 text-gold" strokeWidth={1.6} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">Santa&apos;s Secret Book</p>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-xs text-mist" aria-label="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-line bg-ink/90 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5 backdrop-blur lg:hidden">
          {NAV.map(({ href, label, icon: Icon, exact }) => (
            <Link key={href} href={href} className={`relative flex flex-col items-center gap-0.5 py-1 text-[10px] ${isActive(href, exact) ? "text-gold" : "text-mist"}`}>
              <Icon className="h-5 w-5" strokeWidth={1.7} />
              <span className="truncate">{label.replace("Santa's ", "").replace("Call ", "")}</span>
              {href === "/parent/memories" && pendingMemories > 0 && <span className="absolute right-[22%] top-0.5 h-2 w-2 rounded-full bg-gold" />}
            </Link>
          ))}
        </nav>
      </div>
    </ToastProvider>
  );
}
