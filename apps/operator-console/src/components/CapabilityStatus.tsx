import { operatorConsoleCapabilities } from "@/lib/schema/capabilities";

export function CapabilityStatus() {
  return (
    <dl>
      {Object.entries(operatorConsoleCapabilities).map(([name, enabled]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{enabled ? "implemented" : "not enabled"}</dd>
        </div>
      ))}
    </dl>
  );
}
