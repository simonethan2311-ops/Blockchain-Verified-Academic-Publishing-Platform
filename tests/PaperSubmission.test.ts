import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_PAPER_ID = 101;
const ERR_INVALID_HASH = 102;
const ERR_INVALID_TIMESTAMP = 103;
const ERR_INVALID_VERIFICATION = 104;
const ERR_PAPER_ALREADY_EXISTS = 105;
const ERR_PAPER_NOT_FOUND = 106;
const ERR_INVALID_MAX_PAPERS = 107;
const ERR_INVALID_MIN_HASH_LEN = 108;
const ERR_INVALID_VERIFIER = 109;
const ERR_INVALID_STATUS = 110;
const ERR_INVALID_CATEGORY = 111;
const ERR_INVALID_KEYWORDS = 112;
const ERR_INVALID_AUTHOR = 113;
const ERR_MAX_PAPERS_EXCEEDED = 114;
const ERR_INVALID_UPDATE_PARAM = 115;
const ERR_AUTHORITY_NOT_SET = 116;
const ERR_INVALID_CREATION_FEE = 117;
const ERR_INVALID_LICENSE = 118;
const ERR_INVALID_VERSION = 119;
const ERR_INVALID_ABSTRACT_LEN = 120;

interface Paper {
  author: string;
  hash: string;
  timestamp: number;
  verified: boolean;
  category: string;
  keywords: string[];
  status: boolean;
  license: string;
  version: number;
  abstractHash: string;
}

interface PaperUpdate {
  updateHash: string;
  updateTimestamp: number;
  updater: string;
  updateVersion: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class PaperSubmissionMock {
  state: {
    nextPaperId: number;
    maxPapers: number;
    creationFee: number;
    authorityContract: string | null;
    minHashLength: number;
    maxAbstractLength: number;
    papers: Map<number, Paper>;
    papersByAuthor: Map<string, number[]>;
    paperUpdates: Map<number, PaperUpdate>;
  } = {
    nextPaperId: 0,
    maxPapers: 10000,
    creationFee: 500,
    authorityContract: null,
    minHashLength: 64,
    maxAbstractLength: 500,
    papers: new Map(),
    papersByAuthor: new Map(),
    paperUpdates: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextPaperId: 0,
      maxPapers: 10000,
      creationFee: 500,
      authorityContract: null,
      minHashLength: 64,
      maxAbstractLength: 500,
      papers: new Map(),
      papersByAuthor: new Map(),
      paperUpdates: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setCreationFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.creationFee = newFee;
    return { ok: true, value: true };
  }

  setMaxPapers(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.maxPapers = newMax;
    return { ok: true, value: true };
  }

  submitPaper(
    hash: string,
    category: string,
    keywords: string[],
    license: string,
    version: number,
    abstractHash: string
  ): Result<number> {
    if (this.state.nextPaperId >= this.state.maxPapers) return { ok: false, value: ERR_MAX_PAPERS_EXCEEDED };
    if (hash.length !== this.state.minHashLength) return { ok: false, value: ERR_INVALID_HASH };
    if (!category || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (keywords.length > 10) return { ok: false, value: ERR_INVALID_KEYWORDS };
    if (!["CC-BY", "CC-BY-SA", "MIT"].includes(license)) return { ok: false, value: ERR_INVALID_LICENSE };
    if (version <= 0) return { ok: false, value: ERR_INVALID_VERSION };
    if (abstractHash.length !== this.state.minHashLength) return { ok: false, value: ERR_INVALID_HASH };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    this.stxTransfers.push({ amount: this.state.creationFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.nextPaperId;
    const paper: Paper = {
      author: this.caller,
      hash,
      timestamp: this.blockHeight,
      verified: false,
      category,
      keywords,
      status: true,
      license,
      version,
      abstractHash,
    };
    this.state.papers.set(id, paper);
    const authorPapers = this.state.papersByAuthor.get(this.caller) || [];
    this.state.papersByAuthor.set(this.caller, [...authorPapers, id]);
    this.state.nextPaperId++;
    return { ok: true, value: id };
  }

  getPaper(id: number): Paper | null {
    return this.state.papers.get(id) || null;
  }

  verifyPaper(paperId: number): Result<boolean> {
    const paper = this.state.papers.get(paperId);
    if (!paper) return { ok: false, value: false };
    if (this.caller !== this.state.authorityContract) return { ok: false, value: false };
    const updated: Paper = { ...paper, verified: true };
    this.state.papers.set(paperId, updated);
    return { ok: true, value: true };
  }

  updatePaper(id: number, newHash: string, newVersion: number, newAbstractHash: string): Result<boolean> {
    const paper = this.state.papers.get(id);
    if (!paper) return { ok: false, value: false };
    if (paper.author !== this.caller) return { ok: false, value: false };
    if (newHash.length !== this.state.minHashLength) return { ok: false, value: false };
    if (newVersion <= paper.version) return { ok: false, value: false };
    if (newAbstractHash.length !== this.state.minHashLength) return { ok: false, value: false };
    const updated: Paper = {
      ...paper,
      hash: newHash,
      timestamp: this.blockHeight,
      verified: false,
      version: newVersion,
      abstractHash: newAbstractHash,
    };
    this.state.papers.set(id, updated);
    this.state.paperUpdates.set(id, {
      updateHash: newHash,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
      updateVersion: newVersion,
    });
    return { ok: true, value: true };
  }

  getPaperCount(): Result<number> {
    return { ok: true, value: this.state.nextPaperId };
  }

  checkPaperExistence(id: number): Result<boolean> {
    return { ok: true, value: this.state.papers.has(id) };
  }
}

describe("PaperSubmission", () => {
  let contract: PaperSubmissionMock;

  beforeEach(() => {
    contract = new PaperSubmissionMock();
    contract.reset();
  });

  it("submits a paper successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const paper = contract.getPaper(0);
    expect(paper?.hash).toBe("hash123456789012345678901234567890123456789012345678901234567890");
    expect(paper?.category).toBe("Science");
    expect(paper?.keywords).toEqual(["AI", "Blockchain"]);
    expect(paper?.license).toBe("CC-BY");
    expect(paper?.version).toBe(1);
    expect(paper?.abstractHash).toBe("abs1234567890123456789012345678901234567890123456789012345678900");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects submission without authority contract", () => {
    const result = contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("rejects invalid hash length", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitPaper(
      "short",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid category", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_CATEGORY);
  });

  it("rejects too many keywords", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      Array(11).fill("key"),
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_KEYWORDS);
  });

  it("rejects invalid license", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "INVALID",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_LICENSE);
  });

  it("rejects invalid version", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      0,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VERSION);
  });

  it("rejects invalid abstract hash", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "short"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("verifies a paper successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    contract.caller = "ST2TEST";
    const result = contract.verifyPaper(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const paper = contract.getPaper(0);
    expect(paper?.verified).toBe(true);
  });

  it("rejects verification by non-authority", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    const result = contract.verifyPaper(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("updates a paper successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitPaper(
      "oldhash123456789012345678901234567890123456789012345678901234567",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "oldabs1234567890123456789012345678901234567890123456789012345678"
    );
    const result = contract.updatePaper(
      0,
      "newhash123456789012345678901234567890123456789012345678901234567",
      2,
      "newabs1234567890123456789012345678901234567890123456789012345678"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const paper = contract.getPaper(0);
    expect(paper?.hash).toBe("newhash123456789012345678901234567890123456789012345678901234567");
    expect(paper?.version).toBe(2);
    expect(paper?.abstractHash).toBe("newabs1234567890123456789012345678901234567890123456789012345678");
    expect(paper?.verified).toBe(false);
    const update = contract.state.paperUpdates.get(0);
    expect(update?.updateHash).toBe("newhash123456789012345678901234567890123456789012345678901234567");
    expect(update?.updateVersion).toBe(2);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent paper", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updatePaper(
      99,
      "newhash123456789012345678901234567890123456789012345678901234567",
      2,
      "newabs1234567890123456789012345678901234567890123456789012345678"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-author", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    contract.caller = "ST3FAKE";
    const result = contract.updatePaper(
      0,
      "newhash123456789012345678901234567890123456789012345678901234567",
      2,
      "newabs1234567890123456789012345678901234567890123456789012345678"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update with lower version", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    const result = contract.updatePaper(
      0,
      "newhash123456789012345678901234567890123456789012345678901234567",
      1,
      "newabs1234567890123456789012345678901234567890123456789012345678"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets creation fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setCreationFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.creationFee).toBe(1000);
    contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects creation fee change without authority", () => {
    const result = contract.setCreationFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("checks paper existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitPaper(
      "hash123456789012345678901234567890123456789012345678901234567890",
      "Science",
      ["AI", "Blockchain"],
      "CC-BY",
      1,
      "abs1234567890123456789012345678901234567890123456789012345678900"
    );
    const result = contract.checkPaperExistence(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkPaperExistence(99);
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses paper parameters with Clarity types", () => {
    const hash = stringAsciiCV("hash123456789012345678901234567890123456789012345678901234567890");
    const version = uintCV(1);
    expect(hash.value).toBe("hash123456789012345678901234567890123456789012345678901234567890");
    expect(version.value).toEqual(BigInt(1));
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});