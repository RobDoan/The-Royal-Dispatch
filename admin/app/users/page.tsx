import { listUsers, listChildrenAll, type User, type ChildWithUsers } from '@/lib/api';
import { UsersTable } from '@/components/UsersTable';

export const dynamic = 'force-dynamic';

interface LinkedChildInfo {
  child_id: string;
  child_name: string;
  role: string | null;
}

interface UserWithChildren extends User {
  children: LinkedChildInfo[];
}

export default async function UsersPage() {
  let usersWithChildren: UserWithChildren[] = [];
  try {
    const [users, allChildren] = await Promise.all([listUsers(), listChildrenAll()]);

    const userChildMap: Record<string, LinkedChildInfo[]> = {};
    for (const child of allChildren) {
      for (const u of child.users) {
        if (!userChildMap[u.user_id]) userChildMap[u.user_id] = [];
        userChildMap[u.user_id].push({
          child_id: child.id,
          child_name: child.name,
          role: u.role,
        });
      }
    }

    usersWithChildren = users.map((user) => ({
      ...user,
      children: userChildMap[user.id] ?? [],
    }));
  } catch {
    // backend unreachable during dev — start empty
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <div className="h-13 flex-shrink-0 flex items-center justify-between px-6 border-b"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--topbar-bg)' }}>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-slate-100">Users</h1>
          <span className="text-xs text-slate-500">{usersWithChildren.length} registered</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <UsersTable initialUsers={usersWithChildren} />
      </div>
    </div>
  );
}
