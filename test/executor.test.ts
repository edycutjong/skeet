import { describe, test, expect, vi, beforeEach } from "vitest";
import { Executor, AgentState } from "../src/executor.js";

// Setup mock for ethers
const mockWait = vi.fn().mockResolvedValue("mock_receipt");
const mockExecTransactionWithRole = vi
  .fn()
  .mockResolvedValue({ wait: mockWait });

vi.mock("ethers", () => {
  return {
    ethers: {
      JsonRpcProvider: vi.fn().mockImplementation(() => ({})),
      Wallet: vi.fn().mockImplementation((pk) => ({
        address: "0xMockWalletAddress",
        signMessage: vi.fn().mockResolvedValue("mock_signature"),
      })),
      Contract: vi.fn().mockImplementation(() => ({
        execTransactionWithRole: mockExecTransactionWithRole,
      })),
      Interface: vi.fn().mockImplementation(() => ({
        encodeFunctionData: vi.fn().mockReturnValue("0xencoded_calldata"),
      })),
      MaxUint256: 999999999n,
    },
  };
});

describe("Executor class test suite", () => {
  let agentState: AgentState;
  let globalFetchMock: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecTransactionWithRole.mockReset();
    mockExecTransactionWithRole.mockResolvedValue({ wait: mockWait });
    mockWait.mockReset();
    mockWait.mockResolvedValue("mock_receipt");

    agentState = {
      name: "TestAgent",
      pk: "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      address: "0xMockTradingSafeAddress",
      agentJwt: "",
      tradingSafe: "0xMockTradingSafeAddress",
      treasurySafe: "0xMockTreasurySafeAddress",
      rolesMod: "0xMockRolesModAddress",
    };

    // Mock global fetch
    globalFetchMock = vi.fn();
    global.fetch = globalFetchMock;
  });

  test("siweLogin fetches nonce, signs message, and fetches token", async () => {
    // JWT exp in future (eyJleHAiOjIwMDAwMDAwMDB9 = {"exp": 2000000000})
    const futureJwt = "header.eyJleHAiOjIwMDAwMDAwMDB9.signature";

    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/auth/nonce")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: "siwe_nonce_message" }),
        });
      }
      if (url.endsWith("/auth/login")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ token: futureJwt }),
        });
      }
      return Promise.reject(new Error("Unknown url"));
    });

    const executor = new Executor(agentState);
    const token = await executor.getFreshJwt();

    expect(token).toBe(futureJwt);
    expect(agentState.agentJwt).toBe(futureJwt);
    expect(globalFetchMock).toHaveBeenCalledTimes(2);
  });

  test("siweLogin throws on nonce failure", async () => {
    globalFetchMock.mockResolvedValue({
      ok: false,
      statusText: "Internal Server Error",
    });

    const executor = new Executor(agentState);
    await expect(executor.getFreshJwt()).rejects.toThrow(
      "SIWE nonce error: Internal Server Error",
    );
  });

  test("siweLogin throws on login failure", async () => {
    globalFetchMock.mockImplementation((url: string) => {
      if (url.endsWith("/auth/nonce")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: "siwe_nonce_message" }),
        });
      }
      return Promise.resolve({
        ok: false,
        statusText: "Unauthorized",
      });
    });

    const executor = new Executor(agentState);
    await expect(executor.getFreshJwt()).rejects.toThrow(
      "SIWE login error: Unauthorized",
    );
  });

  test("jwtExp parses invalid tokens gracefully", async () => {
    const executor = new Executor(agentState);
    // Invalid token structure
    // @ts-ignore
    const exp = executor.jwtExp("invalid-token");
    expect(exp).toBe(0);

    // Valid structure but missing exp key (e30= is base64 for {})
    // @ts-ignore
    const expMissing = executor.jwtExp("header.e30=.signature");
    expect(expMissing).toBe(0);
  });

  test("getFreshJwt returns current JWT if not expired", async () => {
    // Token that doesn't expire for a long time
    const futureJwt = "header.eyJleHAiOjIwMDAwMDAwMDB9.signature";
    agentState.agentJwt = futureJwt;

    const executor = new Executor(agentState);
    const token = await executor.getFreshJwt();

    expect(token).toBe(futureJwt);
    expect(globalFetchMock).not.toHaveBeenCalled();
  });

  test("approveToken calls rolesContract execTransactionWithRole", async () => {
    const futureJwt = "header.eyJleHAiOjIwMDAwMDAwMDB9.signature";
    agentState.agentJwt = futureJwt;

    const executor = new Executor(agentState);
    const receipt = await executor.approveToken("0xTokenAddress");

    expect(receipt).toBe("mock_receipt");
    expect(mockExecTransactionWithRole).toHaveBeenCalledTimes(1);
  });

  test("executeSwap fetches signature and calls rolesContract execTransactionWithRole", async () => {
    const futureJwt = "header.eyJleHAiOjIwMDAwMDAwMDB9.signature";
    agentState.agentJwt = futureJwt;

    const mockSignatureResponse = {
      signature: "0xsig",
      data: "0xdata",
      expiresAt: 1622548800,
      nonce: 5,
      sqrtPriceLimit: "250000000000000000000",
    };

    globalFetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSignatureResponse),
    });

    const executor = new Executor(agentState);
    const receipt = await executor.executeSwap("0xTokenAddress", 1000n, true);

    expect(receipt).toBe("mock_receipt");
    expect(globalFetchMock).toHaveBeenCalledTimes(1);
    expect(mockExecTransactionWithRole).toHaveBeenCalledTimes(1);
  });

  test("getSwapSignature throws on API failure", async () => {
    const futureJwt = "header.eyJleHAiOjIwMDAwMDAwMDB9.signature";
    agentState.agentJwt = futureJwt;

    globalFetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Invalid params"),
    });

    const executor = new Executor(agentState);
    await expect(
      executor.getSwapSignature("0xTokenAddress", 1000n, true),
    ).rejects.toThrow("Swap signature API error 400: Invalid params");
  });

  test("executeTx retry logic on failure", async () => {
    const futureJwt = "header.eyJleHAiOjIwMDAwMDAwMDB9.signature";
    agentState.agentJwt = futureJwt;

    // First attempt fails, second succeeds
    mockExecTransactionWithRole
      .mockRejectedValueOnce(new Error("Provider failure"))
      .mockResolvedValueOnce({ wait: mockWait });

    const executor = new Executor(agentState);
    const receipt = await executor.approveToken("0xTokenAddress");

    expect(receipt).toBe("mock_receipt");
    expect(mockExecTransactionWithRole).toHaveBeenCalledTimes(2);
  });

  test("executeTx fails after 2 attempts", async () => {
    const futureJwt = "header.eyJleHAiOjIwMDAwMDAwMDB9.signature";
    agentState.agentJwt = futureJwt;

    mockExecTransactionWithRole.mockRejectedValue(
      new Error("Permanent failure"),
    );

    const executor = new Executor(agentState);
    await expect(executor.approveToken("0xTokenAddress")).rejects.toThrow(
      "Permanent failure",
    );
    expect(mockExecTransactionWithRole).toHaveBeenCalledTimes(2);
  });

  test("getWalletAddress returns the wallet address", () => {
    const executor = new Executor(agentState);
    expect(executor.getWalletAddress()).toBe("0xMockWalletAddress");
  });
});
