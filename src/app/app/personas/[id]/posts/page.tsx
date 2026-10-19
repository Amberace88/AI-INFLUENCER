import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { textAiConfigured } from "@/lib/ai/text";
import { PLATFORMS } from "@/lib/ai/persona";
import { PersonaTabs } from "../tabs";
import { PostsBoard, type Post } from "./posts-board";

export default async function PostsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: persona }, { data: posts }, { data: cost }] = await Promise.all([
    supabase.from("personas").select("id, name, topics").eq("id", id).maybeSingle(),
    supabase.from("posts").select("*").eq("persona_id", id).neq("status", "discarded").order("created_at", { ascending: false }).limit(100),
    supabase.from("generation_costs").select("credits").eq("kind", "text_posts").maybeSingle(),
  ]);
  if (!persona) notFound();

  return (
    <div className="max-w-5xl">
      <Link href="/app/personas" className="text-sm text-muted hover:text-ink">Personas</Link>
      <h1 className="mt-2 text-5xl font-extrabold">{persona.name}</h1>
      <PersonaTabs id={id} />
      <PostsBoard
        personaId={id}
        personaName={persona.name}
        topics={persona.topics ?? []}
        platforms={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))}
        initial={(posts ?? []) as Post[]}
        cost={cost?.credits ?? 2}
        configured={textAiConfigured()}
      />
    </div>
  );
}
