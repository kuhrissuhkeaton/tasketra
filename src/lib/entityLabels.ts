// The one label map for activity/feed entity types. Feed (ProjectHome),
// My Activity, and Trash all read from here, so a type can never render as a
// raw database value like "ROADMAP_ITEM" on one surface and "Roadmap item"
// on another. Labels are sentence case; surfaces that want small caps get
// them from CSS, not from the string.
export const ENTITY_LABELS: Record<string, string> = {
  task: "Task",
  issue: "Issue",
  risk: "Risk",
  stakeholder: "Stakeholder",
  decision: "Decision",
  decision_request: "Decision request",
  decision_record: "Decision response",
  assumption: "Assumption",
  dependency: "Dependency",
  change_request: "Change request",
  lesson: "Lesson",
  meeting: "Meeting",
  document: "Document",
  roadmap_item: "Roadmap item",
  quality_item: "Quality item",
  procurement_item: "Vendor / procurement item",
  comm_plan_item: "Comms plan item",
  compliance_item: "Compliance item",
  objective: "Objective",
  key_result: "Key result",
  project: "Project",
  status_update: "Check-in",
};

/** Label for an entity type. Unknown types are humanized (underscores to
 *  spaces, first letter capitalized) so a new type degrades gracefully
 *  instead of leaking snake_case into the UI. */
export function entityLabel(entityType: string): string {
  const known = ENTITY_LABELS[entityType];
  if (known) return known;
  const spaced = entityType.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : "Item";
}
