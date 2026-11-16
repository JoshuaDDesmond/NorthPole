import type { ReactNode } from "react";

/** Full-screen on phones; an elegant centered handset on tablets and desktops. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <main className="np-backdrop flex min-h-dvh items-stretch justify-center sm:items-center sm:p-8">
      <div className="np-phone relative flex min-h-dvh w-full flex-col overflow-hidden sm:min-h-0 sm:h-[min(880px,calc(100dvh-4rem))] sm:w-[440px] sm:rounded-[48px] sm:border sm:border-line sm:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85),0_0_0_10px_rgba(255,255,255,0.02)] lg:w-[460px]">
        {children}
      </div>
    </main>
  );
}
