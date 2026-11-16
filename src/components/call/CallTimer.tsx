"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/time";

/** Real elapsed time since the WebRTC connection was established. */
export function CallTimer({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tabular-nums tracking-wide" aria-label="Call duration">
      {formatDuration((now - since) / 1000)}
    </span>
  );
}
