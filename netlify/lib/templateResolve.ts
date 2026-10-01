// Finds a template by id: one of the four built-ins, or a person's own saved
// template ("custom:<uuid>"). A saved template is only ever returned to its
// owner, and is re-validated on read.
import { getTemplate, isCustomTemplateId, CUSTOM_TEMPLATE_PREFIX, type ProjectTemplate } from "../../src/lib/projectTemplates.ts";
import { sanitizeStored } from "./templateFromProject.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveTemplate(database: any, userId: string, id: string): Promise<ProjectTemplate | null> {
  if (!isCustomTemplateId(id)) return getTemplate(id) ?? null;
  const uuid = id.slice(CUSTOM_TEMPLATE_PREFIX.length);
  if (!UUID.test(uuid)) return null;
  const [row] = await database.sql`SELECT id, name, description, data FROM user_templates WHERE id = ${uuid} AND owner_id = ${userId}`;
  if (!row) return null;
  const data = sanitizeStored(row.data);
  if (!data) return null;
  return {
    id,
    name: row.name,
    blurb: row.description || "Your saved template.",
    bestFor: "",
    suggestedApproach: data.approach,
    phases: data.phases, milestones: data.milestones, tasks: data.tasks, risks: data.risks,
    stakeholders: data.stakeholders, assumptions: data.assumptions,
  };
}
