# Policy workspace

Access Management → Policies supports time-limited editing delegation to one active employee group per policy. Grant the group **Propose policy edits**, then choose **Manage delegation**, a group, an expiry and a reason. Membership and expiry are read on the server when an editor submits a proposal. The group grants no publishing rights. A manager can revoke a delegation by selecting **No delegated group**.

Proposals store the previous and proposed settings, author, reason and base version. A different policy manager can publish or reject a pending revision. A stale revision cannot overwrite newer settings. A published revision can be rolled back by proposing its previous settings for another review. The old direct policy update endpoint returns a conflict. Group assignments and initial policy creation still follow their existing management paths.

Test access evaluates an employee's permission with a hypothetical resource and department through the existing authorization service. Results include group and condition details. This checks the permission decision; resource-specific validations elsewhere in a business endpoint may impose additional requirements.

Migration 051 introduces auth_policy_editors and auth_policy_proposals in PostgreSQL. Apply it through the existing migration runner before using the workspace. Existing policy definitions and group memberships require no data rewrite. Prior changes in the audit log are not backfilled into the revision history.

Run the policy-editor and policy-workspace scripts under scripts/ using Node 24 with --experimental-test-module-mocks. These are isolated route tests.

Outstanding work in the broader access-control project includes MFA-backed just-in-time activation, cross-module role scopes, independent approval for privileged assignments, and security monitoring and access reviews.
