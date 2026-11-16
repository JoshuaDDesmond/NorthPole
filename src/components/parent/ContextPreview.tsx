"use client";

import { Eye, Loader2 } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { Button, Card, CardHeader, ErrorText } from "@/components/ui";

type Preview = { instructions: string; talkingPointCount: number; memoryCount: number };

/** Shows exactly what will be sent to the voice service for this child's next call. */
export function ContextPreview({ childId }: { childId: string }) {
  const [data, setData] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setData(await api<Preview>(`/api/parent/children/${childId}/preview`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title="What Santa will know"
        description="The exact briefing sent to the voice service when this child calls. Only this child's approved information is included."
        action={
          <Button size="sm" onClick={load} loading={loading}>
            <Eye className="h-3.5 w-3.5" /> {data ? "Refresh" : "Preview"}
          </Button>
        }
      />
      <div className="p-5 sm:p-6">
        <ErrorText>{error}</ErrorText>
        {!data && !loading && !error && <p className="text-sm text-mist">Press Preview to see Santa&apos;s briefing for the next call.</p>}
        {loading && !data && <Loader2 className="h-5 w-5 animate-spin text-mist" />}
        {data && (
          <>
            <p className="mb-3 text-xs text-mist">
              Includes {data.talkingPointCount} talking point{data.talkingPointCount === 1 ? "" : "s"} and {data.memoryCount} approved memor{data.memoryCount === 1 ? "y" : "ies"}.
            </p>
            <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-ink/70 p-4 font-sans text-[13px] leading-relaxed text-snow/90">
              {data.instructions}
            </pre>
          </>
        )}
      </div>
    </Card>
  );
}
