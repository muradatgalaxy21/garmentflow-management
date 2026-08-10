import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "@/components/auth/ProtectedRoute";

const mockAuth = vi.hoisted(() => ({ user: null as any, roles: [] as string[], loading: false }));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuth,
}));

function renderGuarded(requireRoles?: ("admin" | "staff" | "client" | "worker" | "manager")[]) {
  return render(
    <MemoryRouter initialEntries={["/target"]}>
      <Routes>
        <Route
          path="/target"
          element={
            <ProtectedRoute requireRoles={requireRoles}>
              <div>secret content</div>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<div>home redirect</div>} />
        <Route path="/auth" element={<div>auth redirect</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute role gating", () => {
  it("blocks a worker from a client-only route", () => {
    mockAuth.user = { id: "1" };
    mockAuth.roles = ["worker"];
    renderGuarded(["client"]);
    expect(screen.queryByText("secret content")).toBeNull();
    expect(screen.getByText("home redirect")).toBeInTheDocument();
  });

  it("allows a client into a client-only route", () => {
    mockAuth.user = { id: "1" };
    mockAuth.roles = ["client"];
    renderGuarded(["client"]);
    expect(screen.getByText("secret content")).toBeInTheDocument();
  });

  it("blocks a worker from an admin-only route", () => {
    mockAuth.user = { id: "1" };
    mockAuth.roles = ["worker"];
    renderGuarded(["admin", "staff", "manager"]);
    expect(screen.queryByText("secret content")).toBeNull();
  });
});
