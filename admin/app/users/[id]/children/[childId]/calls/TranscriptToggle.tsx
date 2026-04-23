"use client";

import { useState } from "react";

type Transcript = { role: "user" | "agent"; text: string; time?: number };

export function TranscriptToggle({ transcript }: { transcript: Transcript[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="cursor-pointer text-blue-600 hover:underline"
      >
        View transcript
      </button>
      {open && (
        <div className="mt-2 space-y-1 text-sm">
          {transcript.map((turn, i) => (
            <div key={i}>
              <strong>{turn.role === "user" ? "Child" : "Princess"}:</strong> {turn.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
