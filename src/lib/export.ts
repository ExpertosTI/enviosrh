export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n');
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
}

export function exportToPdfHtml(title: string, rows: Record<string, unknown>[]) {
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:system-ui;padding:24px}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:8px;font-size:12px}th{background:#f1f5f9}</style></head>
    <body><h1>${title}</h1><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${headers.map(h=>`<td>${r[h]??''}</td>`).join('')}</tr>`).join('')}</tbody>
    </table><script>window.print()</script></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); }
}

function downloadBlob(filename: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
