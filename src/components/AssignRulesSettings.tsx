import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function AssignRulesSettings() {
  const [form, setForm] = useState({
    strategy: 'nearest',
    zone_priority: false,
    max_active_load: 5,
    schedule_start: '',
    schedule_end: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.get<typeof form>('/assign-rules').then(setForm).catch(() => {});
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await api.put('/assign-rules', {
        ...form,
        schedule_start: form.schedule_start || null,
        schedule_end: form.schedule_end || null,
      });
      setMsg('Reglas guardadas');
    } catch {
      setMsg('Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="card p-4 flex flex-col gap-3 mb-4">
      <div className="card-title mb-0">Reglas de auto-asignación</div>
      <label className="text-xs text-[#6b6b8a]">
        Estrategia
        <select className="input mt-1" value={form.strategy} onChange={e => setForm({ ...form, strategy: e.target.value })}>
          <option value="nearest">Más cercano</option>
          <option value="least_load">Menor carga</option>
          <option value="round_robin">Rotativo</option>
          <option value="zone">Por zona</option>
        </select>
      </label>
      <label className="flex items-center gap-2 text-xs text-[#e8e8f4]">
        <input type="checkbox" checked={form.zone_priority} onChange={e => setForm({ ...form, zone_priority: e.target.checked })} />
        Priorizar zona de cobertura
      </label>
      <label className="text-xs text-[#6b6b8a]">
        Máx. envíos activos por mensajero
        <input type="number" min={1} max={20} className="input mt-1" value={form.max_active_load}
          onChange={e => setForm({ ...form, max_active_load: Number(e.target.value) })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-[#6b6b8a]">Horario desde<input type="time" className="input mt-1" value={form.schedule_start} onChange={e => setForm({ ...form, schedule_start: e.target.value })} /></label>
        <label className="text-xs text-[#6b6b8a]">Hasta<input type="time" className="input mt-1" value={form.schedule_end} onChange={e => setForm({ ...form, schedule_end: e.target.value })} /></label>
      </div>
      {msg && <p className="text-xs text-[#22c55e]">{msg}</p>}
      <button type="submit" disabled={saving} className="btn-primary text-xs w-full">Guardar reglas</button>
    </form>
  );
}
