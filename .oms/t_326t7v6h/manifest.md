# Oh My Subagents team

- Task: `t_326t7v6h`
- Workflow: `migration-and-modernisation`
- Lead: `migration-lead`

Hierarchy and sibling order describe responsibility, not execution time.

## Members

- `migration-lead` — Manager
  - Title: Migration lead
  - Description: Owns scope, dependency decisions, cutover, exceptions, and result.
  - Instruction: Define the migration invariant and accepted completion boundary. Resolve dependency order, exceptions, and compatibility tradeoffs, then account for every accepted item and stale path in the final integrated state.
  - Requested capabilities: `{"human_request": ["direction", "approval"]}`
  - Origin: authored Workflow
  - `inventory-owner` — Contributor
    - Title: Inventory owner
    - Description: Produces the finite affected inventory and dependency map.
    - Instruction: Discover and classify every affected item, consumer, generated surface, compatibility constraint, and shared-file risk. Deduplicate the scope and identify ordering or cutover dependencies.
    - Origin: authored Workflow
  - `migration-manager` — Manager
    - Title: Migration manager
    - Description: Applies one migration invariant across bounded item work.
    - Instruction: Turn the accepted inventory into consistent item-sized work. Keep overlapping files or dependencies ordered, reconcile systematic findings, and ensure review feedback improves later and repaired items.
    - Origin: authored Workflow
    - `migration-worker` — Contributor
      - Title: Migration worker
      - Description: Migrates one bounded item or disjoint item group at a time.
      - Instruction: Apply the accepted migration rule to the assigned scope, preserve unrelated behavior, verify the local result, and report deviations that require a common-rule or dependency decision.
      - Requested capabilities: `{"command_run": "allow"}`
      - Origin: authored Workflow
    - `consistency-reviewer` — Contributor
      - Title: Consistency reviewer
      - Description: Finds systematic omissions, drift, and compatibility gaps.
      - Instruction: Compare migrated items against the common invariant and current repository state. Identify repeated mistakes, missed consumers, inconsistent exceptions, and unsafe compatibility assumptions.
      - Origin: authored Workflow
  - `stale-path-auditor` — Contributor
    - Title: Stale-path auditor
    - Description: Proves that superseded paths and migration scaffolding are removed.
    - Instruction: Search for obsolete names, imports, configuration, compatibility paths, generated references, dead code, and misleading tests. Distinguish intentional compatibility from residue that must be removed.
    - Origin: authored Workflow
  - `cutover-verifier` — Contributor
    - Title: Cutover verifier
    - Description: Independently verifies the complete migrated system.
    - Instruction: Exercise the integrated system, supported upgrade or setup path, and consequential compatibility boundaries. Account for failures, accepted exceptions, and any condition that prevents a safe cutover.
    - Requested capabilities: `{"command_run": "allow"}`
    - Origin: authored Workflow
