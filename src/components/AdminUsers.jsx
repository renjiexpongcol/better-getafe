import AdminAccessManagement from './AdminAccessManagement';

// Both administrator entry points use the same transactional employee workflow.
export default function AdminUsers({ currentUser }) {
  return <AdminAccessManagement currentUser={currentUser} initialTab="users" />;
}
