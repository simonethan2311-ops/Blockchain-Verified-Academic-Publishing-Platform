import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, principalCV, tupleCV, listCV, boolCV, noneCV, someCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_USER_EXISTS = 101;
const ERR_INVALID_ROLE = 102;
const ERR_INVALID_REPUTATION = 103;
const ERR_INVALID_STAKE = 104;
const ERR_NOT_ACTIVE = 105;
const ERR_ALREADY_VOTED = 106;
const ERR_INVALID_PROFILE = 108;

interface User {
  role: string;
  reputation: number;
  stake: number;
  profileHash: string;
  registeredAt: number;
  active: boolean;
}

interface ReputationVote {
  score: number;
  timestamp: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class UserManagerMock {
  state: {
    admin: string;
    minStake: number;
    maxReputation: number;
    votingPeriod: number;
    users: Map<string, User>;
    userRoles: Map<string, string[]>;
    reputationVotes: Map<string, ReputationVote>;
    stxTransfers: Array<{ amount: number; from: string; to: string }>;
  } = {
    admin: "",
    minStake: 1000,
    maxReputation: 10000,
    votingPeriod: 1440,
    users: new Map(),
    userRoles: new Map(),
    reputationVotes: new Map(),
    stxTransfers: [],
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      admin: "ST1TEST",
      minStake: 1000,
      maxReputation: 10000,
      votingPeriod: 1440,
      users: new Map(),
      userRoles: new Map(),
      reputationVotes: new Map(),
      stxTransfers: [],
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
  }

  getUser(user: string): Result<User | null> {
    return { ok: true, value: this.state.users.get(user) || null };
  }

  getUserRoles(user: string): Result<string[]> {
    return { ok: true, value: this.state.userRoles.get(user) || [] };
  }

  getReputationVote(target: string, voter: string): Result<ReputationVote | null> {
    return { ok: true, value: this.state.reputationVotes.get(`${target}-${voter}`) || null };
  }

  getMinStake(): Result<number> {
    return { ok: true, value: this.state.minStake };
  }

  isTrustedUser(user: string): Result<boolean> {
    const userData = this.state.users.get(user);
    if (!userData) return { ok: true, value: false };
    return { ok: true, value: userData.active && userData.reputation >= 5000 };
  }

  setMinStake(newStake: number): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newStake <= 0) return { ok: false, value: ERR_INVALID_STAKE };
    this.state.minStake = newStake;
    return { ok: true, value: true };
  }

  registerUser(role: string, profileHash: string, stakeAmount: number): Result<boolean> {
    if (this.state.users.has(this.caller)) return { ok: false, value: ERR_USER_EXISTS };
    if (!["author", "reviewer", "verifier"].includes(role)) return { ok: false, value: ERR_INVALID_ROLE };
    if (profileHash.length !== 64) return { ok: false, value: ERR_INVALID_PROFILE };
    if (stakeAmount < this.state.minStake) return { ok: false, value: ERR_INVALID_STAKE };
    this.state.stxTransfers.push({ amount: stakeAmount, from: this.caller, to: "contract" });
    const user: User = {
      role,
      reputation: 0,
      stake: stakeAmount,
      profileHash,
      registeredAt: this.blockHeight,
      active: true,
    };
    this.state.users.set(this.caller, user);
    this.state.userRoles.set(this.caller, [role]);
    return { ok: true, value: true };
  }

  addRole(role: string): Result<boolean> {
    const userData = this.state.users.get(this.caller);
    if (!userData) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!userData.active) return { ok: false, value: ERR_NOT_ACTIVE };
    if (!["author", "reviewer", "verifier"].includes(role)) return { ok: false, value: ERR_INVALID_ROLE };
    const currentRoles = this.state.userRoles.get(this.caller) || [];
    if (currentRoles.length >= 3) return { ok: false, value: ERR_INVALID_ROLE };
    if (currentRoles.includes(role)) return { ok: false, value: ERR_INVALID_ROLE };
    this.state.userRoles.set(this.caller, [...currentRoles, role]);
    return { ok: true, value: true };
  }

  updateProfile(newHash: string): Result<boolean> {
    const userData = this.state.users.get(this.caller);
    if (!userData) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!userData.active) return { ok: false, value: ERR_NOT_ACTIVE };
    if (newHash.length !== 64) return { ok: false, value: ERR_INVALID_PROFILE };
    this.state.users.set(this.caller, { ...userData, profileHash: newHash, registeredAt: this.blockHeight });
    return { ok: true, value: true };
  }

  voteOnReputation(target: string, score: number): Result<boolean> {
    const targetData = this.state.users.get(target);
    const voterData = this.state.users.get(this.caller);
    if (!targetData || !voterData) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!targetData.active || !voterData.active) return { ok: false, value: ERR_NOT_ACTIVE };
    if (score > 100) return { ok: false, value: ERR_INVALID_REPUTATION };
    if (this.state.reputationVotes.has(`${target}-${this.caller}`)) return { ok: false, value: ERR_ALREADY_VOTED };
    this.state.reputationVotes.set(`${target}-${this.caller}`, { score, timestamp: this.blockHeight });
    return { ok: true, value: true };
  }

  finalizeReputation(target: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const targetData = this.state.users.get(target);
    if (!targetData || !targetData.active) return { ok: false, value: ERR_NOT_AUTHORIZED };
    let totalScore = 0;
    for (const [key, vote] of this.state.reputationVotes) {
      if (key.startsWith(`${target}-`) && this.blockHeight - vote.timestamp <= this.state.votingPeriod) {
        totalScore += vote.score;
      }
    }
    const newRep = targetData.reputation + totalScore;
    if (newRep > this.state.maxReputation) return { ok: false, value: ERR_INVALID_REPUTATION };
    this.state.users.set(target, { ...targetData, reputation: newRep });
    return { ok: true, value: true };
  }

  toggleUserStatus(target: string): Result<boolean> {
    if (this.caller !== this.state.admin) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const userData = this.state.users.get(target);
    if (!userData) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.users.set(target, { ...userData, active: !userData.active });
    return { ok: true, value: true };
  }

  withdrawStake(): Result<boolean> {
    const userData = this.state.users.get(this.caller);
    if (!userData) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (userData.active) return { ok: false, value: ERR_NOT_ACTIVE };
    this.state.stxTransfers.push({ amount: userData.stake, from: "contract", to: this.caller });
    this.state.users.set(this.caller, { ...userData, stake: 0 });
    return { ok: true, value: true };
  }
}

describe("UserManager", () => {
  let contract: UserManagerMock;

  beforeEach(() => {
    contract = new UserManagerMock();
    contract.reset();
  });

  it("registers a user successfully", () => {
    const result = contract.registerUser("author", "a".repeat(64), 1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const user = contract.getUser("ST1TEST");
    expect(user.value).toEqual({
      role: "author",
      reputation: 0,
      stake: 1000,
      profileHash: "a".repeat(64),
      registeredAt: 0,
      active: true,
    });
    expect(contract.state.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "contract" }]);
    const roles = contract.getUserRoles("ST1TEST");
    expect(roles.value).toEqual(["author"]);
  });

  it("rejects duplicate user registration", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    const result = contract.registerUser("reviewer", "b".repeat(64), 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_USER_EXISTS);
  });

  it("rejects invalid role", () => {
    const result = contract.registerUser("invalid", "a".repeat(64), 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("rejects invalid profile hash", () => {
    const result = contract.registerUser("author", "short", 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PROFILE);
  });

  it("rejects insufficient stake", () => {
    contract.setMinStake(2000);
    const result = contract.registerUser("author", "a".repeat(64), 1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_STAKE);
  });

  it("adds a role successfully", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    const result = contract.addRole("reviewer");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const roles = contract.getUserRoles("ST1TEST");
    expect(roles.value).toEqual(["author", "reviewer"]);
  });

  it("rejects adding role to non-registered user", () => {
    const result = contract.addRole("reviewer");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects adding duplicate role", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    contract.addRole("reviewer");
    const result = contract.addRole("reviewer");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("rejects adding role when max roles reached", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    contract.addRole("reviewer");
    contract.addRole("verifier");
    const result = contract.addRole("author");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_ROLE);
  });

  it("updates profile successfully", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    const result = contract.updateProfile("b".repeat(64));
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const user = contract.getUser("ST1TEST");
    expect(user.value?.profileHash).toBe("b".repeat(64));
  });

  it("rejects profile update for inactive user", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    contract.toggleUserStatus("ST1TEST");
    const result = contract.updateProfile("b".repeat(64));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_ACTIVE);
  });

  it("votes on reputation successfully", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    contract.caller = "ST2TEST";
    contract.registerUser("reviewer", "b".repeat(64), 1000);
    const result = contract.voteOnReputation("ST1TEST", 50);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const vote = contract.getReputationVote("ST1TEST", "ST2TEST");
    expect(vote.value).toEqual({ score: 50, timestamp: 0 });
  });

  it("rejects reputation vote for non-registered target", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    const result = contract.voteOnReputation("ST2TEST", 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects duplicate reputation vote", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    contract.caller = "ST2TEST";
    contract.registerUser("reviewer", "b".repeat(64), 1000);
    contract.voteOnReputation("ST1TEST", 50);
    const result = contract.voteOnReputation("ST1TEST", 50);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VOTED);
  });

  it("finalizes reputation successfully", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    contract.caller = "ST2TEST";
    contract.registerUser("reviewer", "b".repeat(64), 1000);
    contract.voteOnReputation("ST1TEST", 50);
    contract.caller = "ST1TEST";
    const result = contract.finalizeReputation("ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const user = contract.getUser("ST1TEST");
    expect(user.value?.reputation).toBe(50);
  });

  it("rejects finalize reputation by non-admin", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    contract.caller = "ST2TEST";
    contract.registerUser("reviewer", "b".repeat(64), 1000);
    const result = contract.finalizeReputation("ST1TEST");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("toggles user status successfully", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    const result = contract.toggleUserStatus("ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const user = contract.getUser("ST1TEST");
    expect(user.value?.active).toBe(false);
  });

  it("withdraws stake successfully", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    contract.toggleUserStatus("ST1TEST");
    const result = contract.withdrawStake();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const user = contract.getUser("ST1TEST");
    expect(user.value?.stake).toBe(0);
    expect(contract.state.stxTransfers).toEqual([
      { amount: 1000, from: "ST1TEST", to: "contract" },
      { amount: 1000, from: "contract", to: "ST1TEST" },
    ]);
  });

  it("rejects stake withdrawal for active user", () => {
    contract.registerUser("author", "a".repeat(64), 1000);
    const result = contract.withdrawStake();
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_ACTIVE);
  });

  it("sets min stake successfully", () => {
    const result = contract.setMinStake(2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.minStake).toBe(2000);
  });
});