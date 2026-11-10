import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  json: vi.fn((body, init) => ({
    status: init?.status || 200,
    body,
  })),
  cookies: vi.fn(),
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  getDashboardAuthSession: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: { json: mocks.json },
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/lib/localDb", () => ({
  getSettings: mocks.getSettings,
  updateSettings: mocks.updateSettings,
}));

vi.mock("@/lib/auth/dashboardSession", () => ({
  getDashboardAuthSession: mocks.getDashboardAuthSession,
}));

const { GET, POST } = await import("../../src/app/api/theme/route.js");

describe("API /api/theme - Topology Backdrop", () => {
  let mockSettings;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSettings = {
      theme: "glass",
      themeColor: "#E56A4A",
      topologyBg: null,
      topologyBgDim: 0,
      requireLogin: true,
    };
    mocks.getSettings.mockImplementation(async () => ({ ...mockSettings }));
    mocks.updateSettings.mockImplementation(async (updates) => {
      mockSettings = { ...mockSettings, ...updates };
      return mockSettings;
    });
    mocks.cookies.mockResolvedValue({ get: vi.fn(() => ({ value: "session-token" })) });
    mocks.getDashboardAuthSession.mockResolvedValue({ authenticated: true, role: "admin" });
  });

  it("GET /api/theme returns topologyBg and topologyBgDim", async () => {
    mockSettings.topologyBg = "https://example.com/backdrop.png";
    mockSettings.topologyBgDim = 45;

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.body.topologyBg).toBe("https://example.com/backdrop.png");
    expect(res.body.topologyBgDim).toBe(45);
  });

  it("POST /api/theme updates topologyBg with valid data URL", async () => {
    const validDataUrl = "data:image/webp;base64,UklGRkAAAABXRUJQVlA4IDQAAADwAQCdASoBAAEAAQAcJaACdLoAAP7/2QAA";
    const req = {
      json: async () => ({ topologyBg: validDataUrl, topologyBgDim: 60 }),
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.topologyBg).toBe(validDataUrl);
    expect(res.body.topologyBgDim).toBe(60);
    expect(mocks.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        topologyBg: validDataUrl,
        topologyBgDim: 60,
      })
    );
  });

  it("POST /api/theme updates topologyBg with valid image URL", async () => {
    const validUrl = "https://images.unsplash.com/photo-test?auto=format";
    const req = {
      json: async () => ({ topologyBg: validUrl, topologyBgDim: "75" }),
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.topologyBg).toBe(validUrl);
    expect(res.body.topologyBgDim).toBe(75);
  });

  it("POST /api/theme clamps topologyBgDim between 0 and 100", async () => {
    const req = {
      json: async () => ({ topologyBgDim: 150 }),
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.topologyBgDim).toBe(100);

    const reqLow = {
      json: async () => ({ topologyBgDim: -20 }),
    };
    const resLow = await POST(reqLow);
    expect(resLow.body.topologyBgDim).toBe(0);
  });

  it("POST /api/theme rejects invalid or malicious backdrop strings", async () => {
    const badReq = {
      json: async () => ({ topologyBg: 'https://bad.com/test"; background: red;' }),
    };

    const res = await POST(badReq);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid topology background format");
  });

  it("POST /api/theme allows clearing topologyBg", async () => {
    mockSettings.topologyBg = "https://example.com/existing.png";
    const req = {
      json: async () => ({ topologyBg: null }),
    };

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.body.topologyBg).toBe(null);
  });

  it("POST /api/theme rejects unauthenticated sessions", async () => {
    mocks.getDashboardAuthSession.mockResolvedValue(null);
    const req = { json: async () => ({ topologyBg: "https://example.com/bg.png" }) };

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("POST /api/theme refuses apikey-signed sessions", async () => {
    mocks.getDashboardAuthSession.mockResolvedValue({ authenticated: true, role: "apikey" });
    const req = { json: async () => ({ topologyBg: "https://example.com/bg.png" }) };

    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
