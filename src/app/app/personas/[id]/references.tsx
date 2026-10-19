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
    <section>
      <h2 className="text-2xl font-bold">Reference photos</h2>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        The main photo is what reference workflows use. A clear, front-facing, evenly lit face works best. PNG, JPEG or WebP, up to 10 MB.
      </p>
      <div className="mt-5 flex flex-wrap gap-4">
        {refs.map((r) => (
          <figure key={r.id} className={`w-36 rounded-lg bg-paper p-2 ring-1 ${r.isPrimary ? "ring-2 ring-accent" : "ring-line"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.url} alt="" className="aspect-[3/4] w-full rounded object-cover" />
            <figcaption className="mt-2 flex items-center justify-between text-xs">
              {r.isPrimary ? (
                <span className="font-semibold text-accent">Main</span>
              ) : (
                <button disabled={pending} onClick={() => start(() => setPrimaryReference(personaId, r.id))} className="text-muted hover:text-ink">
                  Make main
                </button>
              )}
              <button disabled={pending} onClick={() => start(() => deleteReference(personaId, r.id))} className="text-muted hover:text-bad" aria-label="Delete reference">
                Delete
              </button>
            </figcaption>
          </figure>
        ))}
        <form ref={formRef} action={upload} className="grid w-36 place-items-center rounded-lg border border-dashed border-line bg-paper p-3 text-center">
          <label className="cursor-pointer text-sm">
            <span className="block font-semibold text-accent">{pending ? "Uploading…" : "Add photos"}</span>
            <input
              type="file"
              name="files"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </label>
        </form>
      </div>
      {msg && <p role="status" className={`mt-3 text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
    </section>
  );
}
