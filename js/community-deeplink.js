// Lädt einen Community-Eintrag vollständig, bevor ein Deep-Link ihn rendert.
// Das verhindert, dass ein späterer Netzwerk-Refresh einen bereits geöffneten
// Eintrag wieder durch eine neue, geschlossene Liste ersetzt.
export async function loadCommunityGameForDeepLink(id, {
  isCommunityId,
  load,
  getById,
} = {}) {
  if (typeof isCommunityId !== 'function' || !isCommunityId(id)) return false;
  if (typeof load !== 'function' || typeof getById !== 'function') return false;
  try {
    await load({ force: true });
  } catch {
    return false;
  }
  return Boolean(getById(id));
}
