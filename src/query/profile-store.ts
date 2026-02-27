import type { QueryConnectionMode, QueryProfile } from './types';

const PROFILES_STORAGE_KEY = 'appledax-query-profiles';
const ACTIVE_PROFILE_STORAGE_KEY = 'appledax-query-active-profile';

interface ProfileCollection {
  profiles: QueryProfile[];
}

export function loadProfiles(): QueryProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProfileCollection | QueryProfile[];
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || !Array.isArray(parsed.profiles)) return [];
    return parsed.profiles;
  } catch {
    return [];
  }
}

export function saveProfiles(profiles: QueryProfile[]): void {
  try {
    localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify({ profiles }));
  } catch {
    // ignore
  }
}

export function getActiveProfileId(): string {
  return localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) ?? '';
}

export function setActiveProfileId(profileId: string): void {
  try {
    localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, profileId);
  } catch {
    // ignore
  }
}

export function createProfile(name: string, mode: QueryConnectionMode, redirectUri: string): QueryProfile {
  const now = Date.now();
  return {
    id: createId(),
    name: name.trim() || 'Default profile',
    mode,
    tenantId: '',
    clientId: '',
    redirectUri,
    workspaceId: '',
    datasetId: '',
    accessToken: '',
    sessionId: '',
    expiresAt: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertProfile(profile: QueryProfile): QueryProfile[] {
  const profiles = loadProfiles();
  const existingIndex = profiles.findIndex((item) => item.id === profile.id);
  const next: QueryProfile = {
    ...profile,
    updatedAt: Date.now(),
  };
  if (existingIndex === -1) {
    profiles.push(next);
  } else {
    profiles[existingIndex] = next;
  }
  saveProfiles(profiles);
  return profiles;
}

export function deleteProfile(profileId: string): QueryProfile[] {
  const next = loadProfiles().filter((profile) => profile.id !== profileId);
  saveProfiles(next);
  if (getActiveProfileId() === profileId) {
    const fallback = next[0]?.id ?? '';
    setActiveProfileId(fallback);
  }
  return next;
}

export function ensureProfiles(defaultRedirectUri: string): QueryProfile[] {
  const profiles = loadProfiles();
  if (profiles.length > 0) return profiles;
  const seed = createProfile('Default profile', 'delegated', defaultRedirectUri);
  saveProfiles([seed]);
  setActiveProfileId(seed.id);
  return [seed];
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2);
}
