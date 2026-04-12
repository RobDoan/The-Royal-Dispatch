import { listChildrenAll, listUsers, listPersonas, type ChildWithUsers, type User, type Persona } from '@/lib/api';
import { ChildrenTable } from '@/components/ChildrenTable';

export const dynamic = 'force-dynamic';

export default async function ChildrenPage() {
  let children: ChildWithUsers[] = [];
  let users: User[] = [];
  let personas: Persona[] = [];
  try {
    [children, users, personas] = await Promise.all([
      listChildrenAll(),
      listUsers(),
      listPersonas(),
    ]);
  } catch {
    // backend unreachable during dev — start empty
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Topbar */}
      <div className="h-13 flex-shrink-0 flex items-center justify-between px-6 border-b"
        style={{ borderColor: 'var(--sidebar-border)', background: 'var(--topbar-bg)' }}>
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold text-slate-100">Children</h1>
          <span className="text-xs text-slate-500">{children.length} registered</span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <ChildrenTable initialChildren={children} allUsers={users} personas={personas} />
      </div>
    </div>
  );
}
