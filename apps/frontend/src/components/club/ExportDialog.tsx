/**
 * ExportDialog — modal for exporting the match report as CSV or JSON
 *
 * Decision Context:
 * - Why modal: lets the admin configure the export format before triggering the
 *   download. The export query is bounded by the current filter range (shown in the
 *   dialog for confirmation).
 * - Download mechanism: creates a Blob URL from the returned string and triggers an
 *   anchor click — no server-side file storage needed.
 * - File naming: includes startDate/endDate so the admin can identify the export later.
 * - Error handling: shows an inline error if the export query fails (e.g., 90-day limit).
 * - Previously fixed bugs: none relevant (new feature).
 */

import { useState } from 'react';
import { Download, X, FileText } from 'lucide-react';
import type { ClubDashboardFilters } from '../../graphql/operations/club-dashboard';

interface Props {
  filters: ClubDashboardFilters;
  onExport: (format: 'csv' | 'json') => Promise<string>;
  onClose: () => void;
}

export default function ExportDialog({ filters, onExport, onClose }: Props) {
  const [format, setFormat] = useState<'csv' | 'json'>('csv');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError(null);
    try {
      const data = await onExport(format);
      const mime = format === 'csv' ? 'text/csv' : 'application/json';
      const blob = new Blob([data], { type: mime });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const dateRange = `${filters.startDate ?? 'inicio'}_${filters.endDate ?? 'fin'}`;
      anchor.href = url;
      anchor.download = `dashboard_${dateRange}.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al exportar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="export-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Exportar reporte">
      <div className="export-panel" onClick={(e) => e.stopPropagation()}>
        <div className="export-header">
          <div className="export-title">
            <FileText size={18} strokeWidth={2} aria-hidden="true" />
            Exportar reporte
          </div>
          <button className="export-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>

        <div className="export-range">
          Rango: <strong>{filters.startDate ?? '—'}</strong> a <strong>{filters.endDate ?? '—'}</strong>
        </div>

        <div className="format-group">
          <div className="format-label">Formato</div>
          <div className="format-options">
            {(['csv', 'json'] as const).map((f) => (
              <label key={f} className={`format-opt ${format === f ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="export-format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                {f.toUpperCase()}
                <span className="format-hint">
                  {f === 'csv' ? 'Compatible con Excel' : 'Para integraciones'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {error && <div className="export-error">{error}</div>}

        <div className="export-actions">
          <button className="btn-cancel" onClick={onClose}>Cancelar</button>
          <button className="btn-download" onClick={handleDownload} disabled={loading}>
            <Download size={14} strokeWidth={2} aria-hidden="true" />
            {loading ? 'Generando...' : 'Descargar'}
          </button>
        </div>

        <style>{`
          .export-backdrop {
            position: fixed; inset: 0; z-index: 100;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
            display: flex; align-items: center; justify-content: center;
          }
          .export-panel {
            background: hsl(220 60% 9%); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 14px; padding: 1.5rem; width: min(400px, 96vw);
            display: flex; flex-direction: column; gap: 1.25rem;
          }
          .export-header { display: flex; justify-content: space-between; align-items: center; }
          .export-title {
            display: flex; align-items: center; gap: 0.5rem;
            font-family: 'Bebas Neue', sans-serif; font-size: 1.3rem;
            letter-spacing: 0.06em; color: #fff;
          }
          .export-close {
            background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
            border-radius: 6px; padding: 0.35rem; cursor: pointer; color: hsl(215 20% 55%);
            display: inline-flex; transition: background 0.12s;
          }
          .export-close:hover { background: rgba(255,255,255,0.1); }
          .export-range { font-family: 'Barlow', sans-serif; font-size: 0.84rem; color: hsl(215 20% 55%); }
          .export-range strong { color: hsl(210 20% 80%); }
          .format-group { display: flex; flex-direction: column; gap: 0.5rem; }
          .format-label {
            font-family: 'Barlow Condensed', sans-serif; font-size: 0.7rem; font-weight: 700;
            letter-spacing: 0.15em; color: hsl(215 20% 45%); text-transform: uppercase;
          }
          .format-options { display: flex; gap: 0.625rem; }
          .format-opt {
            flex: 1; display: flex; flex-direction: column; gap: 3px; cursor: pointer;
            background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09);
            border-radius: 8px; padding: 0.625rem 0.875rem;
            font-family: 'Barlow Condensed', sans-serif; font-size: 0.9rem; font-weight: 700;
            letter-spacing: 0.06em; color: hsl(215 20% 65%); transition: all 0.12s;
          }
          .format-opt input[type=radio] { display: none; }
          .format-opt.selected { background: rgba(246,164,0,0.1); border-color: rgba(246,164,0,0.3); color: hsl(42 100% 65%); }
          .format-hint { font-size: 0.7rem; font-weight: 400; letter-spacing: 0; color: hsl(215 20% 45%); text-transform: none; }
          .export-error {
            background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
            border-radius: 8px; padding: 0.625rem 0.875rem; font-family: 'Barlow', sans-serif;
            font-size: 0.82rem; color: hsl(0 72% 65%);
          }
          .export-actions { display: flex; gap: 0.625rem; justify-content: flex-end; }
          .btn-cancel {
            background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
            padding: 0.45rem 1rem; font-family: 'Barlow', sans-serif; font-size: 0.84rem;
            color: hsl(215 20% 60%); cursor: pointer; transition: background 0.12s;
          }
          .btn-cancel:hover { background: rgba(255,255,255,0.05); }
          .btn-download {
            display: flex; align-items: center; gap: 6px;
            background: hsl(35 100% 48%); border: none; border-radius: 8px;
            padding: 0.45rem 1rem; font-family: 'Barlow Condensed', sans-serif;
            font-size: 0.88rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
            color: #fff; cursor: pointer; transition: background 0.12s;
          }
          .btn-download:hover { background: hsl(35 100% 42%); }
          .btn-download:disabled { opacity: 0.6; cursor: not-allowed; }
          /* ── Responsive: bottom-sheet on mobile ── */
          @media (max-width: 600px) {
            .export-backdrop { align-items: flex-end; padding: 0; }
            .export-panel {
              width: 100%; border-radius: 16px 16px 0 0;
              padding: 1.25rem 1rem;
            }
            .export-close { min-width: 44px; min-height: 44px; justify-content: center; }
            .export-actions { flex-direction: column-reverse; }
            .btn-cancel, .btn-download {
              width: 100%; justify-content: center; min-height: 44px;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
