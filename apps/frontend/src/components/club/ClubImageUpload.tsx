/**
 * ClubImageUpload — React island for selecting and uploading a club profile image
 *
 * Decision Context:
 * - Why React: manages upload state (progress, error, preview) that requires reactivity.
 * - Upload flow: file → client-side compression (browser-image-compression, 800×800 max,
 *   quality 0.85) → FileReader.readAsDataURL → POST to /api/club/image (Astro proxy) →
 *   backend clubImageService.
 * - Auto-upload on selection: no separate "SUBIR FOTO" button. The upload starts immediately
 *   after the user selects a file, which is the expected UX pattern for profile image pickers.
 * - File picker trigger: <label htmlFor> for the initial click (native browser association,
 *   no JS required). After selection, a "Cambiar imagen" label lets the user pick a different
 *   file at any time (except while uploading).
 * - Native change listener via useEffect: the hidden input also registers a native DOM
 *   'change' event listener as a belt-and-suspenders backup for React synthetic onChange.
 *   In some SSR-hydrated Astro islands, synthetic events on hidden inputs can miss the
 *   first file-selection cycle; the native listener ensures the upload always starts.
 * - Auth: the Astro proxy at /api/club/image reads the HttpOnly cookie — component never
 *   touches the access token.
 * - currentImageUrl: passed server-side from the Astro frontmatter so the current image
 *   renders on first paint without a client-side fetch.
 * - Page reload on success: simplest way to reflect the new image in all server-rendered
 *   references. 1.5 s delay lets the user read the success message.
 * - Previously fixed bugs:
 *   - ref.current.click() didn't open file dialog in SSR-hydrated context → switched to
 *     label/htmlFor association.
 *   - React synthetic onChange didn't fire reliably on the hidden input in some browsers
 *     after label-triggered selection → added native DOM 'change' listener via useEffect.
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import imageCompression from 'browser-image-compression';
import { ImagePlus, Loader2, CheckCircle, TriangleAlert } from 'lucide-react';

// =====================================================
// Constants
// =====================================================

const FILE_INPUT_ID = 'club-img-file-input';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024;

const COMPRESSION_OPTIONS = {
  maxWidthOrHeight: 800,
  maxSizeMB: 1.5,
  useWebWorker: true,
  initialQuality: 0.85,
  fileType: undefined as string | undefined,
};

// =====================================================
// Types
// =====================================================

type UploadStatus = 'idle' | 'compressing' | 'uploading' | 'success' | 'error';

export interface ClubImageUploadProps {
  currentImageUrl: string | null;
}

// =====================================================
// Component
// =====================================================

export default function ClubImageUpload({ currentImageUrl }: ClubImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isWorking = status === 'compressing' || status === 'uploading';
  const displayUrl = previewUrl ?? currentImageUrl;

  // ── Upload logic ────────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setErrorMsg(null);
    setStatus('idle');

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg('Formato no permitido. Solo se aceptan JPG, PNG o WebP.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES * 3) {
      setErrorMsg('El archivo es demasiado grande. Elegí una imagen menor a 6MB.');
      return;
    }

    // Show local preview immediately before upload
    const previewReader = new FileReader();
    previewReader.onload = (ev) => setPreviewUrl(ev.target?.result as string);
    previewReader.readAsDataURL(file);

    try {
      setStatus('compressing');
      const compressed = await imageCompression(file, COMPRESSION_OPTIONS);

      if (compressed.size > MAX_SIZE_BYTES) {
        setErrorMsg('La imagen sigue siendo mayor a 2MB después de comprimir. Usá una imagen más pequeña.');
        setStatus('error');
        setTimeout(() => setStatus('idle'), 200);
        return;
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(compressed);
      });

      setStatus('uploading');
      const response = await fetch('/api/club/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });

      const data = (await response.json().catch(() => null)) as
        | { imageUrl?: string; error?: string }
        | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? 'Error al subir la imagen. Intentá de nuevo.');
      }

      setStatus('success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado al subir la imagen.';
      setErrorMsg(message);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 200);
    }
  }, []);

  // ── Native DOM listener — belt-and-suspenders for SSR-hydrated islands ──
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const handleNativeChange = () => {
      const file = input.files?.[0];
      if (file) processFile(file);
    };

    input.addEventListener('change', handleNativeChange);
    return () => input.removeEventListener('change', handleNativeChange);
  }, [processFile]);

  // ── React synthetic onChange (primary path) ─────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="club-img-upload">
      {/* Hidden file input */}
      <input
        id={FILE_INPUT_ID}
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        disabled={isWorking}
        style={{ display: 'none' }}
        aria-label="Seleccionar imagen del club"
      />

      {/* Preview area */}
      <label
        htmlFor={isWorking ? undefined : FILE_INPUT_ID}
        className={`club-img-preview-btn${isWorking ? ' club-img-preview-btn--working' : ''}`}
        title={isWorking ? undefined : 'Clic para elegir imagen'}
      >
        {displayUrl ? (
          <img src={displayUrl} alt="Imagen del club" className="club-img-preview" />
        ) : (
          <div className="club-img-placeholder">
            <ImagePlus size={32} strokeWidth={1.5} aria-hidden="true" />
            <span>Elegir imagen</span>
          </div>
        )}

        {/* Overlay shown while uploading */}
        {isWorking && (
          <div className="club-img-overlay" aria-live="polite">
            <Loader2 size={28} strokeWidth={2} className="club-img-spinner" aria-hidden="true" />
            <span>{status === 'compressing' ? 'Comprimiendo...' : 'Subiendo...'}</span>
          </div>
        )}
      </label>

      {/* Success / error feedback */}
      {status === 'success' && (
        <p className="club-img-status club-img-status--success" role="status">
          <CheckCircle size={14} strokeWidth={2.5} aria-hidden="true" />
          Imagen actualizada. Recargando...
        </p>
      )}
      {errorMsg && (
        <p className="club-img-status club-img-status--error" role="alert">
          <TriangleAlert size={14} strokeWidth={2.25} aria-hidden="true" />
          {errorMsg}
        </p>
      )}

      {/* Action button */}
      <label
        htmlFor={isWorking ? undefined : FILE_INPUT_ID}
        className="club-img-select-btn"
        style={{ cursor: isWorking ? 'not-allowed' : 'pointer', opacity: isWorking ? 0.5 : 1 }}
        aria-disabled={isWorking}
        tabIndex={isWorking ? -1 : 0}
        role="button"
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isWorking) {
            inputRef.current?.click();
          }
        }}
      >
        <ImagePlus size={15} strokeWidth={2} aria-hidden="true" />
        {displayUrl ? 'Cambiar imagen' : 'Elegir imagen'}
      </label>

      <p className="club-img-hint">JPG · PNG · WebP · máx 2MB · se sube automáticamente al elegir</p>
    </div>
  );
}
