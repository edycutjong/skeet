import { ethers } from "ethers";

const TRADER_ABI = [
  "function tradeViaFactory(address factory,(bytes signature,bytes data,uint256 expiresAt,uint256 nonce) signature,(uint160 sqrtPriceLimit,uint256 minAmountOut) tradeLimits,uint256 ethValue) external",
  "function approveFactory(address token, uint256 amount) external",
];

const ROLES_ABI = [
  "function execTransactionWithRole(address to,uint256 value,bytes data,uint8 operation,bytes32 roleKey,bool shouldRevert) returns (bool)",
];

const USDC_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
];

export interface AgentState {
  name: string;
  pk: string;
  address: string;
  agentJwt: string;
  tradingSafe: string;
  treasurySafe: string;
  rolesMod: string;
}

export class Executor {
  private state: AgentState;
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private rolesContract: ethers.Contract;
  private traderInterface: ethers.Interface;
  private transactionQueue: Promise<any> = Promise.resolve();

  private factoryAddress: string;
  private traderHelperAddress: string;
  private roleKey: string;
  private apiEndpoint: string;

  constructor(
    state: AgentState,
    rpcUrl: string = "http://5.161.35.78:8545",
    factory: string = "0xE841bCA5A85C76FA667a968C4fe817Ffa2E220e7",
    traderZh: string = "0x521FAcaAB630E30614617c9ae5f6508cB4213540",
    roleKey: string = "0xfacaf2747a7486cf5730e9265973fb54447d3ace6e7e4711f6360826b0731941",
    apiEndpoint: string = "https://alpha.creator.bid/api",
  ) {
    this.state = state;
    this.provider = new ethers.JsonRpcProvider(rpcUrl, 42069, {
      staticNetwork: true,
    });
    this.wallet = new ethers.Wallet(state.pk, this.provider);
    this.rolesContract = new ethers.Contract(
      state.rolesMod,
      ROLES_ABI,
      this.wallet,
    );
    this.traderInterface = new ethers.Interface(TRADER_ABI);

    this.factoryAddress = factory;
    this.traderHelperAddress = traderZh;
    this.roleKey = roleKey;
    this.apiEndpoint = apiEndpoint;
  }

  // SIWE login refresh jwt
  private async siweLogin(): Promise<string> {
    const resNonce = await fetch(`${this.apiEndpoint}/auth/nonce`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: this.wallet.address }),
    });
    if (!resNonce.ok)
      throw new Error(`SIWE nonce error: ${resNonce.statusText}`);
    const { message } = await resNonce.json();

    const signature = await this.wallet.signMessage(message);
    const resLogin = await fetch(`${this.apiEndpoint}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: this.wallet.address, signature }),
    });
    if (!resLogin.ok)
      throw new Error(`SIWE login error: ${resLogin.statusText}`);
    const { token } = await resLogin.json();

    this.state.agentJwt = token;
    return token;
  }

  private jwtExp(token: string): number {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split(".")[1], "base64").toString(),
      );
      return payload.exp || 0;
    } catch {
      return 0;
    }
  }

  public async getFreshJwt(): Promise<string> {
    const exp = this.jwtExp(this.state.agentJwt);
    const now = Math.floor(Date.now() / 1000);
    // If expires in less than 10 mins (600s), SIWE refresh
    if (!this.state.agentJwt || exp - now < 600) {
      await this.siweLogin();
    }
    return this.state.agentJwt;
  }

  /**
   * Executes a transaction through the Safe Roles modifier module.
   * Serializes transactions on a queue to prevent nonce collisions.
   */
  private async executeTx(
    calldata: string,
    operation: number = 1,
  ): Promise<any> {
    const next = this.transactionQueue
      .catch(() => {})
      .then(async () => {
        // Retry transaction execution once if it fails
        let attempts = 0;
        while (attempts < 2) {
          try {
            const tx = await this.rolesContract.execTransactionWithRole(
              this.traderHelperAddress,
              0n,
              calldata,
              operation,
              this.roleKey,
              true,
            );
            return await tx.wait();
          } catch (e: any) {
            attempts++;
            if (attempts >= 2) throw e;
            // sleep 1s before retry
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      });
    this.transactionQueue = next.catch(() => {});
    return next;
  }

  /**
   * Fetch EIP-712 swap signature from alpha.creator.bid skill/swap API
   */
  public async getSwapSignature(
    tokenAddress: string,
    amountIn: bigint,
    isBuy: boolean,
  ): Promise<any> {
    const token = await this.getFreshJwt();
    const res = await fetch(`${this.apiEndpoint}/skill/swap`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tokenAddress,
        amountIn: amountIn.toString(),
        isBuy,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Swap signature API error ${res.status}: ${errText}`);
    }
    return await res.json();
  }

  /**
   * Approve the token for trade via the factory
   */
  public async approveToken(tokenAddress: string): Promise<any> {
    const data = this.traderInterface.encodeFunctionData("approveFactory", [
      tokenAddress,
      ethers.MaxUint256,
    ]);
    return this.executeTx(data);
  }

  /**
   * Execute a single trade (buy/sell swap) via factory
   */
  public async executeSwap(
    tokenAddress: string,
    amountIn: bigint,
    isBuy: boolean,
  ): Promise<any> {
    const sig = await this.getSwapSignature(tokenAddress, amountIn, isBuy);
    const data = this.traderInterface.encodeFunctionData("tradeViaFactory", [
      this.factoryAddress,
      {
        signature: sig.signature,
        data: sig.data,
        expiresAt: BigInt(sig.expiresAt),
        nonce: BigInt(sig.nonce),
      },
      {
        sqrtPriceLimit: BigInt(sig.sqrtPriceLimit),
        minAmountOut: 0n, // high slippage accepted as standard
      },
      0n,
    ]);
    return this.executeTx(data);
  }

  public getWalletAddress(): string {
    return this.wallet.address;
  }
}
