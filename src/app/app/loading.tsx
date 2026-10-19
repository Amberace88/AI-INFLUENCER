export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-10 w-64 rounded-lg bg-line/70" />
      <div className="mt-3 h-4 w-96 max-w-full rounded bg-line/60" />
      <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[2/3] rounded-xl bg-line/50" />)}
      </div>
    </div>
  );
}
