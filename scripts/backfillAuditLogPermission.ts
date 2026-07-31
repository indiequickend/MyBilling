/**
 * One-time backfill for the new settings.view_audit_log permission (added alongside the Phase 14
 * Audit Log UI). Role.permissions is a matrix frozen at creation time — Role documents created
 * before this key existed don't have it, and `can()` treats a missing key as false. Grants
 * view_audit_log to every existing role that already has manage_roles or manage_users, since
 * those are the roles a business owner would already trust with this kind of visibility.
 *
 * Run with: pnpm migrate:audit-log-permission
 */
import { connectToDatabase } from "@/lib/db/connect";
import { Role } from "@/lib/db/models/Role";

async function main() {
  await connectToDatabase();

  const roles = await Role.find({
    $or: [{ "permissions.settings.manage_roles": true }, { "permissions.settings.manage_users": true }],
    "permissions.settings.view_audit_log": { $ne: true },
  });

  console.log(`Found ${roles.length} role(s) to backfill.`);

  for (const role of roles) {
    role.permissions.settings = { ...role.permissions.settings, view_audit_log: true };
    role.markModified("permissions");
    await role.save();
    console.log(`  granted view_audit_log to "${role.name}" (business ${role.businessId})`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
