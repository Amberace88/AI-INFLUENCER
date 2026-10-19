"use client";

import { useRef, useState, useTransition } from "react";
import { deleteReference, setPrimaryReference, uploadReferences } from "../../actions";

type Ref = { id: string; isPrimary: boolean; url: string };

export function References({ personaId, refs }: { personaId: string; refs: Ref[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const upload = (form: FormData) =>
    start(async () => {
      const r = await uploadReferences(personaId, form);
      setMsg(r.ok ? { ok: true, text: r.message ?? "Uploaded." } : { ok: false, text: r.error });
      if (r.ok) formRef.current?.reset();
    });

  return (
    <section aria-labelledby="refs">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="refs" className="text-2xl font-bold">Face references</h2>
          <p className="mt-1 max-w-[62ch] text-sm text-muted">
            The main photo keeps the face the same in every shot. Best: front-facing, evenly lit, only this person. PNG, JPEG or WebP up to 10 MB.
          </p>
        </div>
        {!refs.length && <p className="text-sm text-warn">No face yet: “Same face, new scene” needs at least one.</p>}
      </div>
      <ul className="mt-5 flex flex-wrap gap-4">
        {refs.map((r, i) => (
          <li key={r.id} className={`frame w-40 ${r.isPrimary ? "ring-2 ring-safelight ring-offset-2 ring-offset-backdrop" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.url} alt={r.isPrimary ? "Main face reference" : `Reference ${i + 1}`} className="aspect-[3/4] w-full rounded-[2px] object-cover" />
            <div className="absolute inset-x-2.5 bottom-1.5 flex items-center justify-between text-[0.72rem]">
              {r.isPrimary ? (
                <span className="font-semibold text-safelight">Main face</span>
              ) : (
                <button disabled={pending} onClick={() => start(() => setPrimaryReference(personaId, r.id))} className="text-[#c9d2dc] hover:text-safelight">
                  Make main
                </button>
              )}
              <button disabled={pending} onClick={() => start(() => deleteReference(personaId, r.id))} className="text-[#9eabb9] hover:text-[#ff9b8f]" aria-label="Delete this reference photo">
                Delete
              </button>
            </div>
          </li>
        ))}
        <li>
          <form ref={formRef} action={upload} className="h-full">
            <label className="grid aspect-[3/4] w-40 cursor-pointer place-items-center rounded-[3px] border-2 border-dashed border-line bg-paper/60 p-3 text-center transition-colors hover:border-accent hover:bg-paper">
              <span>
                <span className="mx-auto grid size-10 place-items-center rounded-full bg-accent/10 text-xl text-accent" aria-hidden>+</span>
                <span className="mt-2 block text-sm font-semibold text-accent">{pending ? "Uploading…" : "Add photos"}</span>
                <span className="block text-xs text-muted">or use a frame from the contact sheet</span>
              </span>
              <input type="file" name="files" accept="image/png,image/jpeg,image/webp" multiple className="sr-only"
                onChange={(e) => e.currentTarget.form?.requestSubmit()} />
            </label>
          </form>
        </li>
      </ul>
      {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </section>
  );
}
