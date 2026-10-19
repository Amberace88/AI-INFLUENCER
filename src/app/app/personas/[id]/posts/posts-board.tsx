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

type Who = { name: string; avatar: string | null; handle: string };
const FILTERS: { id: "all" | Post["status"]; label: string }[] = [
  { id: "all", label: "All" }, { id: "draft", label: "Drafts" }, { id: "approved", label: "Approved" }, { id: "published", label: "Published" },
];

export function PostsBoard({ personaId, personaName, avatar, topics, platforms, initial, cost, configured }: {
  personaId: string; personaName: string; avatar: string | null; topics: string[]; platforms: { id: string; label: string }[];
  initial: Post[]; cost: number; configured: boolean;
}) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const who: Who = { name: personaName, avatar, handle: personaName.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "") };
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
    <div className="grid gap-10 lg:grid-cols-[340px_minmax(0,1fr)]">
      <form onSubmit={write} className="space-y-5 rounded-2xl bg-paper p-5 ring-1 ring-line lg:sticky lg:top-8 lg:self-start">
        <h2 className="text-xl font-bold">Write as {personaName.split(" ")[0]}</h2>
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
          <button className="btn btn-primary" disabled={pending || !configured}>{pending ? "Writing…" : `Write ${count} post${count === 1 ? "" : "s"}`}</button>
          <span className="text-sm tabular-nums text-muted">{cost} credits</span>
        </div>
        {!configured && <p className="text-sm text-warn">AI text is not connected yet. Add the Cloudflare keys to .env.local.</p>}
        {msg && <p role="status" className={`text-sm ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>}
      </form>

      <section aria-label="Posts" className="min-w-0">
        {!posts.length ? (
          <div className="grid max-w-xl place-items-center rounded-2xl border-2 border-dashed border-line p-10 text-center">
            <p className="text-lg font-semibold">No posts yet</p>
            <p className="mt-1 max-w-[42ch] text-sm text-muted">Pick a topic on the left and {personaName.split(" ")[0]} writes the first ones in their own voice, with an idea for the photo.</p>
          </div>
        ) : (
          <>
            <div role="tablist" aria-label="Filter posts" className="mb-5 flex flex-wrap gap-1">
              {FILTERS.map((f) => {
                const n = f.id === "all" ? posts.length : posts.filter((p) => p.status === f.id).length;
                return (
                  <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                    className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${filter === f.id ? "bg-ink text-paper" : "text-muted hover:bg-paper hover:text-ink"}`}>
                    {f.label} <span className="tabular-nums opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>
            <ul className="max-w-xl space-y-6">
              {posts.filter((p) => filter === "all" || p.status === filter).map((p) => (
                <PostCard key={p.id} post={p} personaId={personaId} who={who}
                  onChange={(patch) => setPosts((all) => all.map((x) => (x.id === p.id ? { ...x, ...patch } : x)))}
                  onRemove={() => setPosts((all) => all.filter((x) => x.id !== p.id))} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function PostCard({ post, personaId, who, onChange, onRemove }: { post: Post; personaId: string; who: Who; onChange: (p: Partial<Post>) => void; onRemove: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(post.caption);
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();
  const full = `${post.caption}${post.hashtags.length ? `\n\n${post.hashtags.join(" ")}` : ""}`;

  const setStatus = (status: Post["status"]) => { onChange({ status }); start(async () => { await updatePost(post.id, { status }); }); };
  const save = () => { onChange({ caption: text }); setEditing(false); start(async () => { await updatePost(post.id, { caption: text }); }); };
  const statusTone = post.status === "approved" ? "bg-ok/12 text-ok" : post.status === "published" ? "bg-accent/12 text-accent" : "bg-backdrop text-muted";

  return (
    <li className="post-preview panel-in overflow-hidden rounded-2xl bg-paper">
      <header className="flex items-center gap-3 px-4 pt-4">
        <span className="size-10 shrink-0 overflow-hidden rounded-full bg-backdrop ring-2 ring-paper outline outline-1 outline-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {who.avatar ? <img src={who.avatar} alt="" className="h-full w-full object-cover object-top" /> : <span className="grid h-full place-items-center font-bold text-muted">{who.name[0]}</span>}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate font-semibold">{who.name}</span>
          <span className="block truncate text-xs capitalize text-muted">@{who.handle} on {post.platform}</span>
        </span>
        <span className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone}`}>{STATUS_LABEL[post.status]}</span>
      </header>

      {post.image_idea && (
        <div className="mx-4 mt-4 grid aspect-[4/3] place-items-center rounded-xl border-2 border-dashed border-line bg-backdrop/60 p-5 text-center">
          <div>
            <p className="text-xs text-muted">Photo for this post</p>
            <p className="mx-auto mt-1 max-w-[38ch] text-sm leading-relaxed">{post.image_idea}</p>
            <Link className="btn btn-primary mt-3 py-1.5 text-sm"
              href={`/app/studio?persona=${personaId}&scene=${encodeURIComponent(post.image_idea)}`}>Shoot this photo</Link>
          </div>
        </div>
      )}

      <div className="px-4 pb-2 pt-4">
        {editing ? (
          <div>
            <textarea rows={8} className="field" value={text} onChange={(e) => setText(e.target.value)} aria-label="Post text" />
            <div className="mt-2 flex gap-2">
              <button className="btn btn-primary" onClick={save}>Save text</button>
              <button className="btn btn-ghost" onClick={() => { setText(post.caption); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-line leading-relaxed">{post.caption}</p>
        )}
        {!!post.hashtags.length && <p className="mt-3 text-sm text-accent">{post.hashtags.join(" ")}</p>}
      </div>

      <footer className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-line px-2 py-1.5 text-sm">
        <button className="rounded-lg px-2.5 py-1.5 font-semibold hover:bg-backdrop" onClick={() => { void navigator.clipboard.writeText(full); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "Copied" : "Copy text"}
        </button>
        {!editing && <button className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-backdrop hover:text-ink" onClick={() => setEditing(true)}>Edit</button>}
        {post.status === "draft" && <button className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-backdrop hover:text-ok" onClick={() => setStatus("approved")}>Approve</button>}
        {post.status !== "published" && <button className="rounded-lg px-2.5 py-1.5 text-muted hover:bg-backdrop hover:text-accent" onClick={() => setStatus("published")}>Mark published</button>}
        <button className="ml-auto rounded-lg px-2.5 py-1.5 text-muted hover:bg-bad/10 hover:text-bad" onClick={() => { onRemove(); start(async () => { await deletePost(post.id, personaId); }); }}>Delete</button>
      </footer>
    </li>
  );
}
