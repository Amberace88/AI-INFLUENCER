// Re-mounts on every navigation inside the app: a short, quiet entrance.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="panel-in">{children}</div>;
}
