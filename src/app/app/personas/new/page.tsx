import Link from "next/link";
import { PersonaForm } from "../persona-form";

export default function NewPersonaPage() {
  return (
    <div className="max-w-4xl">
      <Link href="/app/personas" className="text-sm text-muted hover:text-ink">Personas</Link>
      <h1 className="mt-2 mb-8 text-4xl font-bold">New persona</h1>
      <PersonaForm />
    </div>
  );
}
