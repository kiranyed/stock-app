import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SettingsPage from "./settings-page";
import { StockAppAPI } from "../shared/utilities/stock-app-api";
import { IAppSettings } from "../shared/types";

jest.mock("../shared/utilities/stock-app-api");

const api = StockAppAPI as jest.Mocked<typeof StockAppAPI>;

const settings = (overrides: Partial<IAppSettings> = {}): IAppSettings => ({
  deployment: "self-hosted",
  marketData: { provider: "schwab", schwabSignIn: true },
  alerts: { email: true, sms: false },
  backTests: { workers: 3, perUser: 0, timeoutMs: 600_000 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  api.getSchwabStatus.mockResolvedValue({
    signedIn: false,
    refreshExpiresAt: null,
    accessExpiresAt: null,
  });
});

describe("SettingsPage", () => {
  it("shows the provider, alert channels and back-test settings", async () => {
    api.getSettings.mockResolvedValue(settings());
    render(<SettingsPage />);
    expect(await screen.findByTestId("provider")).toHaveTextContent("Schwab");
    expect(screen.getByTestId("alert-email")).toHaveTextContent("Set up");
    expect(screen.getByTestId("alert-sms")).toHaveTextContent("Not set up");
    expect(screen.getByText("10 minutes")).toBeInTheDocument();
    expect(screen.getByText("no limit")).toBeInTheDocument();
  });

  it("shows the Schwab status, and no Schwab section for Massive", async () => {
    api.getSettings.mockResolvedValue(settings());
    const { unmount } = render(<SettingsPage />);
    expect(await screen.findByTestId("schwab-status")).toHaveTextContent(
      "Not signed in",
    );
    unmount();

    api.getSettings.mockResolvedValue(
      settings({ marketData: { provider: "massive", schwabSignIn: false } }),
    );
    render(<SettingsPage />);
    expect(await screen.findByTestId("provider")).toHaveTextContent("Massive");
    expect(screen.queryByLabelText("Schwab sign-in")).not.toBeInTheDocument();
  });

  it("signs in by opening Schwab's page and posting the pasted address", async () => {
    api.getSettings.mockResolvedValue(settings());
    api.getSchwabAuthorizeUrl.mockResolvedValue({
      url: "https://api.schwabapi.com/v1/oauth/authorize?x=1",
    });
    api.schwabSignIn.mockResolvedValue({
      signedIn: true,
      refreshExpiresAt: Date.UTC(2026, 10, 30),
      accessExpiresAt: null,
    });
    const open = jest.spyOn(window, "open").mockReturnValue(null);

    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in to Schwab" }));
    await waitFor(() =>
      expect(open).toHaveBeenCalledWith(
        "https://api.schwabapi.com/v1/oauth/authorize?x=1",
        "_blank",
        "noopener",
      ),
    );

    fireEvent.change(await screen.findByLabelText("Address Schwab sent you to"), {
      target: { value: " https://127.0.0.1/?code=abc " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish sign-in" }));
    await waitFor(() =>
      expect(api.schwabSignIn).toHaveBeenCalledWith("https://127.0.0.1/?code=abc"),
    );
    expect(await screen.findByTestId("schwab-status")).toHaveTextContent(
      "Signed in until",
    );
  });

  it("shows the server's message when sign-in fails", async () => {
    api.getSettings.mockResolvedValue(settings());
    api.getSchwabAuthorizeUrl.mockResolvedValue({ url: "https://x" });
    api.schwabSignIn.mockRejectedValue({
      response: { data: { message: "Schwab rejected the code." } },
    });
    jest.spyOn(window, "open").mockReturnValue(null);

    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Sign in to Schwab" }));
    fireEvent.change(await screen.findByLabelText("Address Schwab sent you to"), {
      target: { value: "https://127.0.0.1/?code=old" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Finish sign-in" }));
    expect(await screen.findByText("Schwab rejected the code.")).toBeInTheDocument();
  });

  it("shows an error when settings can't load", async () => {
    api.getSettings.mockRejectedValue(new Error("network"));
    render(<SettingsPage />);
    expect(await screen.findByText("Couldn't load settings")).toBeInTheDocument();
  });
});
