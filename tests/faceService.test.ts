import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase modules
vi.mock('../src/services/firebase', () => ({
  initializeFirebaseApp: vi.fn(),
  getSavedFirebaseConfig: vi.fn(() => ({})),
  getAppFirestore: vi.fn(() => ({})),
}));

const mockDocSnap = {
  exists: vi.fn(),
  data: vi.fn(),
};

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, coll, id) => ({ coll, id })),
  getDoc: vi.fn(() => Promise.resolve(mockDocSnap)),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
  getFirestore: vi.fn(() => ({})),
}));

import { fetchFaceTemplate, checkFaceTemplateStatus } from '../src/services/faceService';

describe('faceService avatar decoupling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when user has no face_templates document, even if they have an avatar', async () => {
    // Face template document does not exist
    mockDocSnap.exists.mockReturnValue(false);

    const result = await fetchFaceTemplate('user-without-face');
    expect(result).toBeNull();
  });

  it('checkFaceTemplateStatus returns hasDoc=false and hasImage=false when face_templates doc does not exist', async () => {
    mockDocSnap.exists.mockReturnValue(false);

    const status = await checkFaceTemplateStatus('user-without-face');
    expect(status.hasDoc).toBe(false);
    expect(status.hasVector).toBe(false);
    expect(status.hasImage).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.image).toBeUndefined();
  });

  it('returns valid template when face_templates document exists with 128D embedding and image', async () => {
    const mockEmbedding = new Array(128).fill(0.123);
    const mockImage = 'data:image/jpeg;base64,mockFaceData';

    mockDocSnap.exists.mockReturnValue(true);
    mockDocSnap.data.mockReturnValue({
      userId: 'user-with-face',
      model: 'opencv_sface_2021dec',
      schema_version: 1,
      sample_count: 5,
      embedding: mockEmbedding,
      enabled: true,
      image: mockImage,
    });

    const result = await fetchFaceTemplate('user-with-face');
    expect(result).not.toBeNull();
    expect(result?.enabled).toBe(true);
    expect(result?.embedding.length).toBe(128);
    expect(result?.image).toBe(mockImage);
  });
});
