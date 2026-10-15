import type { SchemaRelation } from "@/lib/schema/types";

export function RelationshipSummary({ relation }: { relation: SchemaRelation }) {
  return (
    <section aria-labelledby="relationship-heading">
      <h2 id="relationship-heading">Relationships</h2>
      <h3>References</h3>
      {relation.outboundForeignKeys.length === 0 ? (
        <p>None discovered.</p>
      ) : (
        <ul>
          {relation.outboundForeignKeys.map((foreignKey) => (
            <li key={foreignKey.constraintName}>
              {foreignKey.sourceColumns.join(", ")} → {foreignKey.targetSchema}.{foreignKey.targetRelation} ({foreignKey.targetColumns.join(", ")})
            </li>
          ))}
        </ul>
      )}
      <h3>Referenced by</h3>
      {relation.inboundForeignKeys.length === 0 ? (
        <p>None discovered.</p>
      ) : (
        <ul>
          {relation.inboundForeignKeys.map((foreignKey) => (
            <li key={foreignKey.constraintName}>
              {foreignKey.sourceSchema}.{foreignKey.sourceRelation} ({foreignKey.sourceColumns.join(", ")}) → {foreignKey.targetColumns.join(", ")}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
