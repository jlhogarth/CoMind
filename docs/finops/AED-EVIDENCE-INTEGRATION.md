# AED evidence integration

FinOps #550 provides an operator-run private reconciliation. It combines the existing read-only AED projection with the AED-007 account meter evidence contract. AED-007 retains collection, monitoring, persistence and recovery. CI-FINOPS #510 retains Actions budget policy.

- [Operator workflow and verification](aed-execution-projection-readme.md)
- [Current read-only SQL projection](aed-execution-readonly-projection.sql)
- [Operational journal](../runbook/FINOPS-550-AED-RECONCILIATION.md)

The earlier `aed_execution_evidence_projection.sql` remains a historical SQL readback. Use the current projection for report generation and the private FinOps Drive structure for account observations and FlowOps records.
