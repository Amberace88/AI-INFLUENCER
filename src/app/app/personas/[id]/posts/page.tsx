import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { textAiConfigured } from "@/lib/ai/text";
import { PLATFORMS } from "@/lib/ai/persona";
import { PostsBoard, type Post } from "./posts-board";

export default async function PostsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const [{ data: persona }, { data: posts }, { data: cost }, { data: ref }] = await Promise.all([
    supabase.from("personas").select("id, name, topics").eq("id", id).maybeSingle(),
    supabase.from("posts").select("*").eq("persona_id", id).neq("status", "discarded").order("created_at", { ascending: false }).limit(100),
    supabase.from("generation_costs").select("credits").eq("kind", "text_posts").maybeSingle(),
    supabase.from("persona_references").select("storage_path").eq("persona_id", id).eq("is_primary", true).limit(1).maybeSingle(),
  ]);
  if (!persona) notFound();
  const avatar = ref ? (await supabase.storage.from("references").createSignedUrl(ref.storage_path, 3600)).data?.signedUrl ?? null : null;

  return (
    <div>
      <PostsBoard
        personaId={id}
        personaName={persona.name}
        avatar={avatar}
        topics={persona.topics ?? []}
        platforms={PLATFORMS.map((p) => ({ id: p.id, label: p.label }))}
        initial={(posts ?? []) as Post[]}
        cost={cost?.credits ?? 2}
        configured={textAiConfigured()}
      />
    </div>
  );
}
