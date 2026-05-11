/**
 * PrivacySettingsContainer — orchestrates PrivacySettingsForm + ProfilePreviewModal
 *
 * Decision Context:
 * - Why a container: PrivacySettingsForm needs to open ProfilePreviewModal and pass it
 *   the current (unsaved) settings. Both components share modal-open state and the
 *   profile data — lifting state here keeps each child focused on a single concern.
 * - profile prop is fetched SSR and passed from /ajustes.astro so the preview has data
 *   immediately without an additional client-side fetch.
 * - Previously fixed bugs: none relevant.
 */

import { useState } from 'react';
import type { PrivacySettings, Profile } from '../../graphql/operations/profile';
import PrivacySettingsForm from './PrivacySettingsForm';
import ProfilePreviewModal from './ProfilePreviewModal';

interface Props {
  initialSettings: PrivacySettings;
  profile: Profile | null;
  accessToken: string;
  backendUrl: string;
}

export default function PrivacySettingsContainer({
  initialSettings,
  profile,
  accessToken,
  backendUrl,
}: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<PrivacySettings>(initialSettings);

  function handlePreview(settings: PrivacySettings) {
    setPreviewSettings(settings);
    setPreviewOpen(true);
  }

  return (
    <>
      <PrivacySettingsForm
        initialSettings={initialSettings}
        accessToken={accessToken}
        backendUrl={backendUrl}
        onPreview={handlePreview}
      />
      <ProfilePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        settings={previewSettings}
        profile={profile}
      />
    </>
  );
}
