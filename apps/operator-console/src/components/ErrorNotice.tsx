import type { OperatorConsoleError } from "@/lib/errors";

export function ErrorNotice({ error }: { error: OperatorConsoleError }) {
  return (
    <section role="alert">
      <h2>{error.title}</h2>
      <p>{error.detail}</p>
      {error.permissionRelated ? (
        <p>The console will not bypass Row Level Security or retry with privileged browser credentials.</p>
      ) : null}
    </section>
  );
}
