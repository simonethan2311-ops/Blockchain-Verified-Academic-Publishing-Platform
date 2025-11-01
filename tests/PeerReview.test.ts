import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_REVIEW_EXISTS = 3000;
const ERR_INVALID_REVIEW = 3001;
const ERR_NOT_AUTHORIZED = 3002;
const ERR_INVALID_SCORE = 3003;
const ERR_INVALID_HASH = 3004;
const ERR_REVIEW_NOT_FOUND = 3005;
const ERR_INVALID_TIMESTAMP = 3006;
const ERR_AUTHORITY_NOT_SET = 3007;
const ERR_INVALID_MIN_SCORE = 3008;
const ERR_INVALID_MAX_SCORE = 3009;
const ERR_INVALID_REVIEW_PERIOD = 3010;
const ERR_INVALID_PENALTY = 3011;
const ERR_INVALID_REWARD = 3012;
const ERR_MAX_REVIEWS_EXCEEDED = 3013;
const ERR_INVALID_STATUS = 3014;
const ERR_INVALID_CATEGORY = 3015;
const ERR_INVALID_COMMENT_LENGTH = 3016;
const ERR_INVALID_REVIEW_TYPE = 3017;
const ERR_INVALID_PRIORITY = 3018;
const ERR_INVALID_LOCATION = 3019;
const ERR_INVALID_CURRENCY = 3020;

interface Review {
  paperAuthor: string;
  paperId: number;
  reviewer: string;
  reviewHash: string;
  score: number;
  timestamp: number;
  validated: boolean;
  category: string;
  commentLength: number;
  reviewType: string;
  priority: number;
  location: string;
  currency: string;
  status: boolean;
}

interface ReviewUpdate {
  updateScore: number;
  updateHash: string;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class PeerReviewMock {
  state: {
    nextReviewId: number;
    maxReviews: number;
    reviewFee: number;
    authorityContract: string | null;
    minScore: number;
    maxScore: number;
    reviewPeriod: number;
    penaltyRate: number;
    rewardAmount: number;
    activeStatus: boolean;
    reviews: Map<number, Review>;
    reviewsByKey: Map<string, number>;
    reviewUpdates: Map<number, ReviewUpdate>;
  } = {
    nextReviewId: 0,
    maxReviews: 10000,
    reviewFee: 500,
    authorityContract: null,
    minScore: 0,
    maxScore: 10,
    reviewPeriod: 144,
    penaltyRate: 5,
    rewardAmount: 100,
    activeStatus: true,
    reviews: new Map(),
    reviewsByKey: new Map(),
    reviewUpdates: new Map(),
  };

  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextReviewId: 0,
      maxReviews: 10000,
      reviewFee: 500,
      authorityContract: null,
      minScore: 0,
      maxScore: 10,
      reviewPeriod: 144,
      penaltyRate: 5,
      rewardAmount: 100,
      activeStatus: true,
      reviews: new Map(),
      reviewsByKey: new Map(),
      reviewUpdates: new Map(),
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

  setMaxReviews(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.maxReviews = newMax;
    return { ok: true, value: true };
  }

  setReviewFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.reviewFee = newFee;
    return { ok: true, value: true };
  }

  setScoreRange(newMin: number, newMax: number): Result<boolean> {
    if (newMin >= newMax) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.minScore = newMin;
    this.state.maxScore = newMax;
    return { ok: true, value: true };
  }

  setReviewPeriod(newPeriod: number): Result<boolean> {
    if (newPeriod <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.reviewPeriod = newPeriod;
    return { ok: true, value: true };
  }

  setPenaltyRate(newRate: number): Result<boolean> {
    if (newRate > 100) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.penaltyRate = newRate;
    return { ok: true, value: true };
  }

  setRewardAmount(newAmount: number): Result<boolean> {
    if (newAmount <= 0) return { ok: false, value: false };
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.rewardAmount = newAmount;
    return { ok: true, value: true };
  }

  toggleStatus(): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    this.state.activeStatus = !this.state.activeStatus;
    return { ok: true, value: this.state.activeStatus };
  }

  submitReview(
    paperAuthor: string,
    paperId: number,
    reviewHash: string,
    score: number,
    category: string,
    commentLength: number,
    reviewType: string,
    priority: number,
    location: string,
    currency: string
  ): Result<number> {
    if (!this.state.activeStatus) return { ok: false, value: ERR_INVALID_STATUS };
    if (this.state.nextReviewId >= this.state.maxReviews) return { ok: false, value: ERR_MAX_REVIEWS_EXCEEDED };
    if (score < this.state.minScore || score > this.state.maxScore) return { ok: false, value: ERR_INVALID_SCORE };
    if (reviewHash.length !== 64) return { ok: false, value: ERR_INVALID_HASH };
    if (category.length === 0 || category.length > 50) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (commentLength > 1000) return { ok: false, value: ERR_INVALID_COMMENT_LENGTH };
    if (!["peer", "expert", "community"].includes(reviewType)) return { ok: false, value: ERR_INVALID_REVIEW_TYPE };
    if (priority > 5) return { ok: false, value: ERR_INVALID_PRIORITY };
    if (location.length === 0 || location.length > 100) return { ok: false, value: ERR_INVALID_LOCATION };
    if (!["STX", "USD", "BTC"].includes(currency)) return { ok: false, value: ERR_INVALID_CURRENCY };
    const key = `${paperAuthor}-${paperId}-${this.caller}`;
    if (this.state.reviewsByKey.has(key)) return { ok: false, value: ERR_REVIEW_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_SET };
    this.stxTransfers.push({ amount: this.state.reviewFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.nextReviewId;
    const review: Review = {
      paperAuthor,
      paperId,
      reviewer: this.caller,
      reviewHash,
      score,
      timestamp: this.blockHeight,
      validated: false,
      category,
      commentLength,
      reviewType,
      priority,
      location,
      currency,
      status: true,
    };
    this.state.reviews.set(id, review);
    this.state.reviewsByKey.set(key, id);
    this.state.nextReviewId++;
    return { ok: true, value: id };
  }

  getReview(id: number): Review | null {
    return this.state.reviews.get(id) || null;
  }

  updateReview(id: number, updateScore: number, updateHash: string): Result<boolean> {
    const review = this.state.reviews.get(id);
    if (!review) return { ok: false, value: false };
    if (review.reviewer !== this.caller) return { ok: false, value: false };
    if (updateScore < this.state.minScore || updateScore > this.state.maxScore) return { ok: false, value: false };
    if (updateHash.length !== 64) return { ok: false, value: false };
    const updated: Review = {
      ...review,
      score: updateScore,
      reviewHash: updateHash,
      timestamp: this.blockHeight,
    };
    this.state.reviews.set(id, updated);
    this.state.reviewUpdates.set(id, {
      updateScore,
      updateHash,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  validateReview(id: number): Result<boolean> {
    const review = this.state.reviews.get(id);
    if (!review) return { ok: false, value: false };
    if (this.caller !== this.state.authorityContract) return { ok: false, value: false };
    const updated: Review = {
      ...review,
      validated: true,
    };
    this.state.reviews.set(id, updated);
    return { ok: true, value: true };
  }

  getReviewCount(): Result<number> {
    return { ok: true, value: this.state.nextReviewId };
  }

  checkReviewExistence(paperAuthor: string, paperId: number, reviewer: string): Result<boolean> {
    const key = `${paperAuthor}-${paperId}-${reviewer}`;
    return { ok: true, value: this.state.reviewsByKey.has(key) };
  }
}

describe("PeerReview", () => {
  let contract: PeerReviewMock;

  beforeEach(() => {
    contract = new PeerReviewMock();
    contract.reset();
  });

  it("submits a review successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const review = contract.getReview(0);
    expect(review?.paperAuthor).toBe("ST3AUTHOR");
    expect(review?.paperId).toBe(1);
    expect(review?.reviewer).toBe("ST1TEST");
    expect(review?.score).toBe(5);
    expect(review?.category).toBe("Science");
    expect(review?.commentLength).toBe(200);
    expect(review?.reviewType).toBe("peer");
    expect(review?.priority).toBe(3);
    expect(review?.location).toBe("LabX");
    expect(review?.currency).toBe("STX");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate reviews", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    const result = contract.submitReview(
      "ST3AUTHOR",
      1,
      "b".repeat(64),
      6,
      "Tech",
      300,
      "expert",
      4,
      "OfficeY",
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_REVIEW_EXISTS);
  });

  it("rejects submission without authority contract", () => {
    const result = contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_SET);
  });

  it("rejects invalid score", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      11,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_SCORE);
  });

  it("rejects invalid hash length", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitReview(
      "ST3AUTHOR",
      1,
      "short",
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("rejects invalid review type", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "invalid",
      3,
      "LabX",
      "STX"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_REVIEW_TYPE);
  });

  it("updates a review successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    const result = contract.updateReview(0, 7, "b".repeat(64));
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const review = contract.getReview(0);
    expect(review?.score).toBe(7);
    expect(review?.reviewHash).toBe("b".repeat(64));
    const update = contract.state.reviewUpdates.get(0);
    expect(update?.updateScore).toBe(7);
    expect(update?.updateHash).toBe("b".repeat(64));
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent review", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateReview(99, 7, "b".repeat(64));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("rejects update by non-reviewer", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    contract.caller = "ST3FAKE";
    const result = contract.updateReview(0, 7, "b".repeat(64));
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("validates a review successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    contract.caller = "ST2TEST";
    const result = contract.validateReview(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const review = contract.getReview(0);
    expect(review?.validated).toBe(true);
  });

  it("rejects validation by non-authority", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    const result = contract.validateReview(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets review fee successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setReviewFee(1000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.reviewFee).toBe(1000);
    contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects review fee change without authority", () => {
    const result = contract.setReviewFee(1000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("returns correct review count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    contract.submitReview(
      "ST4AUTHOR",
      2,
      "b".repeat(64),
      6,
      "Tech",
      300,
      "expert",
      4,
      "OfficeY",
      "USD"
    );
    const result = contract.getReviewCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks review existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    const result = contract.checkReviewExistence("ST3AUTHOR", 1, "ST1TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkReviewExistence("ST3AUTHOR", 1, "ST3FAKE");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("parses review parameters with Clarity types", () => {
    const paperId = uintCV(1);
    const score = uintCV(5);
    expect(paperId.value).toEqual(BigInt(1));
    expect(score.value).toEqual(BigInt(5));
  });

  it("rejects submission with max reviews exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxReviews = 1;
    contract.submitReview(
      "ST3AUTHOR",
      1,
      "a".repeat(64),
      5,
      "Science",
      200,
      "peer",
      3,
      "LabX",
      "STX"
    );
    const result = contract.submitReview(
      "ST4AUTHOR",
      2,
      "b".repeat(64),
      6,
      "Tech",
      300,
      "expert",
      4,
      "OfficeY",
      "USD"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_REVIEWS_EXCEEDED);
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

  it("toggles status successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.toggleStatus();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
    expect(contract.state.activeStatus).toBe(false);
  });

  it("rejects toggle without authority", () => {
    const result = contract.toggleStatus();
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});