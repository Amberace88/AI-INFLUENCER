"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { deletePost, generatePosts, updatePost } from "../../../actions";

export type Post = {
  id: string;
  platform: string;
  topic: string | null;
  caption: string;
  hashtags: string[];
  image_idea: string | null;
  status: "draft" | "approved" | "published" | "discarded";
  created_at: string;
};

const STATUS_LABEL: Record<Post["status"], string> = { draft: "Draft", approved: "Approved", published: "Published", discarded: "Discarded" };

export function PostsBoard({ personaId, personaName, topics, platforms, initial, cost, configured }: {
  personaId: string; personaName: string; topics: string[]; platforms: { id: string; label: string }[];
  initial: Post[]; cost: number; configured: boolean;
}) {
  const [posts, setPosts] = useState(initial);
  const [topic, setTopic] = useState("");
  const [platform, setPlatform] = useState(platforms[0].id);
  const [count, setCount] = useState(3);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => setPosts(initial), [initial]);

  const write = (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    start(async () => {
      const r = await generatePosts(personaId, { topic, platform, count });
      setMsg(r.ok ? { ok: true, text: r.message ?? "Done." } : { ok: false, text: r.error });
    });
  };

  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[360px_minmax(0,1fr)]">
      <form onSubmit={write} className="space-y-5 lg:sticky lg:top-8 lg:self-start">
        <h2 className="text-2xl font-bold">Write as {personaName}</h2>
        <div>
          <label className="label" htmlFor="topic">What about?</label>
          <textarea id="topic" rows={3} className="field" value={topic} onChange={(e) => setTopic(e.target.value)}
            placeholder={topics.length ? `e.g. ${topics.slice(0, 2).join(" or ")}` : "New summer menu, opening hours, a tip of the week…"} />
          {!!topics.length && (
            <div className="mt-2 flex flex-wrap gap-1">
              {topics.map((t) => (
                <button type="button" key={t} onClick={() => setTopic(t)} className="rounded-full bg-paper px-2.5 py-0.5 text-xs text-muted ring-1 ring-line hover:text-ink hover:ring-ink">{t}</button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="label" htmlFor="platform">For</label>
          <select id="platform" className="field" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {platforms.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <fieldset>
          <legend className="label">How many</legend>
          <div className="flex gap-1 rounded-full border border-line bg-paper p-1 text-sm sm:w-fit">
            {[1, 3, 5].map((n) => (
              <button type="button" key={n} onClick={() => setCount(n)} aria-pressed={n === count}
                className={`w-10 rounded-full py-1 tabular-nums ${n === count ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}>{n}</button>
            ))}
          </div>
        </fieldset>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={pending || !configured}>{pending ? "Writing…" : "Write posts"}</button>
          <span className="text-sm tabular-nums text-muted">{cost} credits</span>
        </div>
        {!configured && <p className="text-sm text-warn">AI text is not connected yet. Add the Cloudflare keys to .env.local.</p>}
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      </form>

      <section aria-label="Posts">
        {!posts.length ? (
          <p className="rounded-xl border border-dashed border-line bg-paper p-6 text-muted">
            No posts yet. Pick a topic and {personaName} will write the first ones in their own voice.
          </p>
        ) : (
          <ul className="space-y-4">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} personaId={personaId}
                onChange={(patch) => setPosts((all) => all.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))}
                onRemove={() => setPosts((all) => all.filter((x) => x.id !== p.id))} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PostCard({ post, personaId, onChange, onRemove }: { post: Post; personaId: string; onChange: (p: Partial<Post>) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post.caption);
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();
  const full = `${post.caption}${post.hashtags.length ? `\n\n${post.hashtags.join(" ")}` : ""}`;

  const setStatus = (status: Post["status"]) => { onChange({ status }); start(async () => { await updatePost(post.id, { status }); }); };
  const save = () => { onChange({ caption: text }); setEditing(false); start(async () => { await updatePost(post.id, { caption: text }); }); };

  return (
    <li className="rounded-xl bg-paper p-5 ring-1 ring-line">
      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <span className="font-semibold capitalize text-ink">{post.platform}</span>
        <span className={post.status === "approved" ? "text-ok" : post.status === "published" ? "text-accent" : ""}>{STATUS_LABEL[post.status]}</span>
      </div>
      {editing ? (
        <div className="mt-3">
          <textarea rows={8} className="field" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="mt-2 flex gap-2">
            <button className="btn btn-primary" onClick={save}>Save text</button>
            <button className="btn btn-ghost" onClick={() => { setText(post.caption); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <p className="mt-3 whitespace-pre-line leading-relaxed">{post.caption}</p>
      )}
      {!!post.hashtags.length && <p className="mt-3 text-sm text-accent">{post.hashtags.join(" ")}</p>}
      {post.image_idea && (
        <p className="mt-4 rounded-lg bg-backdrop p-3 text-sm">
          <span className="text-muted">Photo: </span>{post.image_idea}{" "}
          <Link className="font-semibold text-accent underline-offset-2 hover:underline"
            href={`/app/studio?persona=${personaId}&scene=${encodeURIComponent(post.image_idea)}`}>Shoot it</Link>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <button className="font-semibold hover:text-accent" onClick={() => { void navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "Copied" : "Copy"}
        </button>
        {!editing && <button className="text-muted hover:text-ink" onClick={() => setEditing(true)}>Edit</button>}
        {post.status !== "approved" && <button className="text-muted hover:text-ok" onClick={() => setStatus("approved")}>Approve</button>}
        {post.status !== "published" && <button className="text-muted hover:text-accent" onClick={() => setStatus("published")}>Mark published</button>}
        <button className="ml-auto text-muted hover:text-bad" onClick={() => { onRemove(); start(async () => { await deletePost(post.id, personaId); }); }}>Delete</button>
      </div>
    </li>
  );
}
