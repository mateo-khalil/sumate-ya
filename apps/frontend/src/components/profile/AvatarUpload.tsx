/**
 * AvatarUpload — React island for selecting, previewing, and uploading a profile avatar
 *
 * Decision Context:
 * - Why React (not Astro): the component manages local state (selected file, preview URL,
 *   upload progress, error messages) that requires reactivity. An Astro component cannot
 *   do this without JS frameworks.
 * - Upload flow: file → client-side compression (browser-image-compression, max 512×512,
 *   quality 0.85) → FileReader.readAsDataURL → base64 POST to /api/profile/avatar (Astro
 *   proxy route) → backend avatarService. This avoids multer / multipart on the backend
 *   while keeping the payload small after compression.
 * - Auth: the Astro proxy route at /api/profile/avatar reads the sumateya-access-token
 *   HttpOnly cookie server-side and forwards it to the backend. The React component never
 *   touches the token — it just POSTs to a same-origin endpoint.
 * - Reload after success: window.location.reload() is the simplest way to refresh the
 *   ProfileCard avatar without wiring a nanostore for a single transient state update.
 *   The 1.5 s delay gives the user time to read the success message.
 * - Validation: file type and size are validated client-side BEFORE compression to give
 *   instant feedback. The backend validates again as the authoritative check.
 * - Previously fixed bugs: none relevant.
 */

import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';

// =====================================================
// Constants
// =====================================================

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB pre-compression client guard

const COMPRESSION_OPTIONS = {
  maxWidthOrHeight: 512,
  maxSizeMB: 1.5,
  useWebWorker: true,
  initialQuality: 0.85,
  fileType: undefined as string | undefined, // preserve original format
};

// =====================================================
// Types
// =====================================================

type UploadStatus = 'idle' | 'compressing' | 'uploading' | 'success' | 'error';

// =====================================================
// Component
// =====================================================

export default function AvatarUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const isWorking = status === 'compressing' || status === 'uploading';
  const canUpload = selectedFile !== null && status === 'idle';

  function handleOpenPicker() {
    if (!isWorking) {
      inputRef.current?.click();
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setErrorMsg(null);
    setPreviewUrl(null);
    setSelectedFile(null);
    setStatus('idle');

    if (!file) return;

    // Client-side type validation (authoritative check is on the backend)
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMsg('Formato no permitido. Solo se aceptan JPG, PNG y WebP.');
      return;
    }

    // Client-side size guard — reject obviously large files before compression
    if (file.size > MAX_SIZE_BYTES * 3) {
      setErrorMsg('El archivo es demasiado grande. Elegí una imagen menor a 6MB.');
      return;
    }

    setSelectedFile(file);

    // Show preview before upload
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPreviewUrl(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  async function handleUpload() {
    if (!selectedFile) return;

    setErrorMsg(null);

    try {
      // Step 1: Compress & resize client-side
      setStatus('compressing');
      const compressed = await imageCompression(selectedFile, COMPRESSION_OPTIONS);

      if (compressed.size > MAX_SIZE_BYTES) {
        setErrorMsg('La imagen sigue siendo mayor a 2MB después de comprimir. Usá una imagen más pequeña.');
        setStatus('idle');
        return;
      }

      // Step 2: Convert to base64 data URL
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
        reader.readAsDataURL(compressed);
      });

      // Step 3: POST to Astro proxy → backend
      setStatus('uploading');
      const response = await fetch('/api/profile/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });

      const data = (await response.json().catch(() => null)) as
        | { avatarUrl?: string; error?: string }
        | null;

      if (!response.ok || !data) {
        throw new Error(data?.error ?? 'Error al subir la imagen. Intentá de nuevo.');
      }

      setStatus('success');

      // Reload page after short delay so ProfileCard shows the new avatar
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error inesperado al subir la imagen.';
      setErrorMsg(message);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 200);
    }
  }

  return (
    <div className="avatar-upload-container">
      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        style={{ display: 'none' }}
        aria-label="Seleccionar imagen de perfil"
      />

      {/* Preview area — click to open picker */}
      <button
        type="button"
        className="preview-area"
        onClick={handleOpenPicker}
        disabled={isWorking}
        aria-label={previewUrl ? 'Cambiar imagen seleccionada' : 'Seleccionar imagen'}
        title="Clic para elegir imagen"
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Vista previa de tu nueva foto"
            className="avatar-preview"
          />
        ) : (
          <div className="upload-placeholder">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
              Elegir imagen
            </span>
          </div>
        )}
      </button>

      {/* Status / progress indicator */}
      {status === 'compressing' && (
        <p style={{ color: 'hsl(216 85% 65%)', fontSize: '0.875rem', margin: 0 }}>
          Comprimiendo imagen...
        </p>
      )}
      {status === 'uploading' && (
        <p style={{ color: 'hsl(216 85% 65%)', fontSize: '0.875rem', margin: 0 }}>
          Subiendo...
        </p>
      )}
      {status === 'success' && (
        <p style={{ color: 'hsl(142 72% 50%)', fontSize: '0.875rem', margin: 0 }}>
          ¡Foto actualizada! Recargando...
        </p>
      )}

      {/* Error message */}
      {errorMsg && (
        <p className="error-message" role="alert">
          {errorMsg}
        </p>
      )}

      {/* Upload button */}
      <button
        type="button"
        className="upload-btn"
        onClick={handleUpload}
        disabled={!canUpload || isWorking}
        style={{
          background: canUpload && !isWorking
            ? 'hsl(35 100% 48%)'
            : 'hsl(220 30% 20%)',
          color: canUpload && !isWorking
            ? 'hsl(220 72% 7%)'
            : 'hsl(215 20% 40%)',
          border: 'none',
          borderRadius: '6px',
          fontFamily: "'Barlow Condensed', sans-serif",
          fontWeight: 700,
          fontSize: '0.9rem',
          letterSpacing: '0.1em',
          textTransform: 'uppercase' as const,
          cursor: canUpload && !isWorking ? 'pointer' : 'not-allowed',
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        {isWorking ? 'Procesando...' : 'Subir foto'}
      </button>

      <p
        style={{
          fontSize: '0.75rem',
          color: 'hsl(215 20% 40%)',
          margin: 0,
          fontFamily: "'Barlow', sans-serif",
        }}
      >
        JPG · PNG · WebP · máx 2MB
      </p>
    </div>
  );
}
