import { readFile } from 'node:fs/promises';
import { z } from 'zod';

const severitySchema = z.enum(['warning', 'fail']);
const primitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const baseControlSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  severity: severitySchema,
  remediation: z.string().min(1),
});

const controlSchema = z.discriminatedUnion('kind', [
  baseControlSchema.extend({
    kind: z.literal('required_columns'),
    schema: z.string().min(1),
    relation: z.string().min(1),
    columns: z.array(z.string().min(1)).min(1),
  }),
  baseControlSchema.extend({
    kind: z.literal('concept_count'),
    expected: z.number().int().nonnegative(),
  }),
  baseControlSchema.extend({
    kind: z.literal('concept_relationship_counts'),
    expected: z.object({
      active: z.number().int().nonnegative(),
      retired: z.number().int().nonnegative(),
      weighted: z.number().int().nonnegative(),
    }),
  }),
  baseControlSchema.extend({
    kind: z.literal('noncanonical_active_edges'),
    expected: z.number().int().nonnegative(),
  }),
  baseControlSchema.extend({
    kind: z.literal('entity_version'),
    trackingKey: z.string().min(1),
    expected: z.number().int().nonnegative(),
  }),
  baseControlSchema.extend({
    kind: z.literal('entity_payload_equals'),
    trackingKey: z.string().min(1),
    expected: z.record(z.string().min(1), primitiveSchema),
  }),
  baseControlSchema.extend({
    kind: z.literal('orphan_relationships'),
    expected: z.number().int().nonnegative(),
  }),
  baseControlSchema.extend({
    kind: z.literal('orphan_artifacts'),
    expected: z.number().int().nonnegative(),
  }),
  baseControlSchema.extend({
    kind: z.literal('rls_states'),
    expected: z.array(z.object({
      schema: z.string().min(1),
      relation: z.string().min(1),
      enabled: z.boolean(),
    })).min(1),
  }),
  baseControlSchema.extend({
    kind: z.literal('journal_verified'),
    trackingKey: z.string().min(1),
    expected: z.string().min(1),
  }),
  baseControlSchema.extend({
    kind: z.literal('research_session'),
    sessionKey: z.string().min(1),
    expected: z.string().min(1),
  }),
]);

const impactRuleSchema = z.object({
  id: z.string().min(1),
  status: z.enum(['current', 'candidate', 'retired']),
  triggerKinds: z.array(z.string().min(1)).min(1),
  affectedArtifacts: z.array(z.string().min(1)).min(1),
  requiredChecks: z.array(z.string().min(1)).min(1),
  severityIfStale: severitySchema,
  rationale: z.string().min(1),
});

export const maintenanceControlConfigSchema = z.object({
  schemaVersion: z.literal(1),
  controlSet: z.string().min(1),
  environment: z.string().min(1),
  authorityBoundary: z.literal('read_only_audit'),
  controls: z.array(controlSchema).min(1),
  impactRules: z.array(impactRuleSchema).min(1),
}).superRefine((config, ctx) => {
  const ids = new Set<string>();
  for (const control of config.controls) {
    if (ids.has(control.id)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate control id: ${control.id}` });
    }
    ids.add(control.id);
  }

  const impactIds = new Set<string>();
  for (const rule of config.impactRules) {
    if (impactIds.has(rule.id)) {
      ctx.addIssue({ code: 'custom', message: `Duplicate impact rule id: ${rule.id}` });
    }
    impactIds.add(rule.id);
    for (const checkId of rule.requiredChecks) {
      if (!ids.has(checkId)) {
        ctx.addIssue({
          code: 'custom',
          message: `Impact rule ${rule.id} references unknown control ${checkId}`,
        });
      }
    }
  }
});

export type MaintenanceControlConfig = z.infer<typeof maintenanceControlConfigSchema>;
export type MaintenanceControl = MaintenanceControlConfig['controls'][number];
export type ImpactRule = MaintenanceControlConfig['impactRules'][number];

export async function loadMaintenanceControlConfig(path: string): Promise<MaintenanceControlConfig> {
  const raw = await readFile(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Maintenance control configuration is not valid JSON: ${path}`);
  }
  return maintenanceControlConfigSchema.parse(parsed);
}
