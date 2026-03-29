import { listUsers } from '@/lib/api';
import { UsersTable } from '@/components/UsersTable';

export const dynamic = 'force-dynamic';

export default async function UsersPage() {
  let users = [];
  try {
    users = await listUsers();
  } catch {
    // backend unreachable during dev — start empty
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <div className="h-13 flex-shrink-0 flex items-center justify-between px-6 border-b"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--topbar-bg)' }}>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-slate-100">Connected Users</h1>
          <span className="text-xs text-slate-500">{users.length} registered</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <UsersTable initialUsers={users} />
      </div>
    </div>
  );
}
