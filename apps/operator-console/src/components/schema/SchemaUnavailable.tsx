export function SchemaUnavailable() {
  return (
    <section role="status">
      <h2>Schema discovery is not connected yet</h2>
      <p>
        The protected metadata provider is intentionally disabled until its least-privilege database access path is authorized and verified.
      </p>
      <p>No privileged credentials will be moved into the browser to bypass this boundary.</p>
    </section>
  );
}
