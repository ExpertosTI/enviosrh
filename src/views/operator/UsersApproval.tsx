import { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { AppShell, PageHeader } from '../../components/AppShell';

export function UsersApproval() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    try {
      const data = await api.get<any[]>('/users/pending');
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (id: string, role: string) => {
    try {
      await api.patch(`/users/${id}/approve`, { role });
      // Remover de la lista
      setUsers(users.filter(u => u.id !== id));
    } catch (err: any) {
      alert(err.message || 'Error al aprobar');
    }
  };

  return (
    <AppShell>
      <PageHeader title="Aprobación de Usuarios" />
      <div className="p-4 md:p-6 flex flex-col gap-5">
        <div className="bg-[#1f1f2e] border border-[#2a2a3c] rounded-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-6">Solicitudes Pendientes</h2>
        
        {loading ? (
          <div className="flex justify-center p-8">
            <span className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center p-8 text-[#8c8cb4]">
            <p>No hay solicitudes de registro pendientes.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {users.map(user => (
              <div key={user.id} className="bg-[#14141f] border border-[#2a2a3c] rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4 text-left">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name} className="w-12 h-12 rounded-full object-cover border border-[#5b8af9]/30 shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-[#5b8af9]/10 border border-[#5b8af9]/30 flex items-center justify-center text-[#5b8af9] font-bold text-sm shrink-0">
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-medium text-white">{user.name}</h3>
                    <div className="text-sm text-[#8c8cb4] mt-1 space-x-3">
                      <span>{user.email}</span>
                      <span>•</span>
                      <span>{user.phone}</span>
                    </div>
                    <div className="text-xs text-[#5c5c77] mt-1">
                      Registrado el {new Date(user.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => handleApprove(user.id, 'messenger')}
                    className="px-4 py-2 bg-[#1a2b4c] text-[#5b8af9] border border-[#2a3c6c] hover:bg-[#203660] rounded-lg text-sm font-medium transition-colors"
                  >
                    Aprobar como Mensajero
                  </button>
                  <button 
                    onClick={() => handleApprove(user.id, 'operator')}
                    className="px-4 py-2 bg-[#2a1a4c] text-[#a75bf9] border border-[#3c2a6c] hover:bg-[#362060] rounded-lg text-sm font-medium transition-colors"
                  >
                    Aprobar como Operador
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
    </AppShell>
  );
}
