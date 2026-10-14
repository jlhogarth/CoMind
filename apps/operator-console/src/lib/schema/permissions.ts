export type RelationAccessState = "visible" | "empty" | "denied" | "unavailable";

export interface RelationAccessResult {
  state: RelationAccessState;
  detail?: string;
}
