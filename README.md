# AcadChain: Blockchain-Verified Academic Publishing Platform

## Overview

**AcadChain** is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses critical real-world problems in academic publishing, such as:

- **Authorship Disputes and Plagiarism**: Traditional systems lack immutable proof of originality. AcadChain timestamps paper hashes on-chain, providing verifiable proof of creation date and authorship.
- **Fake or Tampered Peer Reviews**: Reviews can be altered or fabricated. Here, reviews are stored immutably on-chain, linked to verified reviewer identities, ensuring transparency and honesty.
- **Lack of Reviewer Accountability**: Anonymous reviews lead to bias or low-quality feedback. AcadChain ties reviews to a reputation system, incentivizing honest contributions.
- **Centralized Gatekeeping**: Publishers control access, leading to delays and biases. This decentralized platform allows direct submission, global peer review, and community governance.

By leveraging blockchain's immutability, AcadChain ensures "what's written stays written" – confirming who wrote papers and reviews while keeping records honest. Users (authors/reviewers) interact via a simple dApp frontend (not included; can be built with React + Stacks.js), storing paper/review metadata on IPFS and proofs on-chain.

### Key Features
- User registration with roles (author, reviewer, verifier).
- Paper submission with hash-based verification.
- Secure peer review submission and validation.
- Reputation scoring for trust-building.
- Dispute resolution via on-chain voting.
- Optional STX-based incentives for quality reviews.

The system uses 6 solid Clarity smart contracts, each focused on a core function for modularity and security. Contracts are written in Clarity 1.x, deployable on Stacks testnet/mainnet.

## Architecture
- **Frontend**: dApp for uploading papers/reviews (IPFS for content, on-chain for hashes).
- **Backend**: Stacks blockchain for storage and execution.
- **Off-Chain**: IPFS for large files (papers/reviews), oracles for off-chain data if needed (e.g., plagiarism checks).
- **Tokens**: Uses native STX for fees; optional custom token for rewards.

Flow:
1. Authors register and submit paper hashes.
2. Reviewers register, claim reviews, and submit linked hashes.
3. Verifiers validate claims.
4. Reputation updates dynamically.
5. Disputes resolved via on-chain consensus.

## Smart Contracts

Below are the 6 Clarity contracts. Deploy them in order (dependencies noted). Use the Stacks CLI (`clarinet`) for local testing.

### 1. UserManager.clar
Manages user registration, roles, and basic identity verification.

```clarity
(define-constant ERR_UNAUTHORIZED (err u1000))
(define-constant ERR_USER_EXISTS (err u1001))
(define-constant ERR_INVALID_ROLE (err u1002))

(define-data-var admin principal tx-sender) ;; Simple admin for initial setup

(define-map users principal {role: (string-ascii 20), registered: bool, reputation: uint})

(define-public (register-user (role-str (string-ascii 20)))
  (let
    (
      (caller tx-sender)
      (role (if (is-eq role-str "author") u1
                (if (is-eq role-str "reviewer") u2
                    (if (is-eq role-str "verifier") u3 u0))))
    )
    (asserts! (> role u0) ERR_INVALID_ROLE)
    (asserts! (not (get registered (map-get? users caller))) ERR_USER_EXISTS)
    (map-set users caller {role: role-str, registered: true, reputation: u0})
    (ok true)
  )
)

(define-read-only (get-user (user principal))
  (map-get? users user)
)

(define-public (update-reputation (user principal) (new-rep uint))
  (asserts! (is-eq tx-sender (var-get admin)) ERR_UNAUTHORIZED)
  (let ((current (unwrap! (map-get? users user) ERR_UNAUTHORIZED)))
    (map-set users user (merge current {reputation: new-rep}))
    (ok true)
  )
)
```

### 2. PaperSubmission.clar
Handles paper submission with IPFS hash timestamping for plagiarism proof.

```clarity
(define-constant ERR_PAPER_EXISTS (err u2000))
(define-constant ERR_INVALID_HASH (err u2001))

(define-map papers {author: principal, paper-id: uint}
  {hash: (string-ascii 64), timestamp: uint, verified: bool})

(define-public (submit-paper (paper-id uint) (ipfs-hash (string-ascii 64)))
  (let
    (
      (caller tx-sender)
      (key {author: caller, paper-id: paper-id})
    )
    (asserts! (is-eq (len ipfs-hash) u64) ERR_INVALID_HASH) ;; SHA256 hash length
    (asserts! (is-none (map-get? papers key)) ERR_PAPER_EXISTS)
    (map-set papers key
      {hash: ipfs-hash, timestamp: block-height, verified: false})
    (ok {paper-id: paper-id, hash: ipfs-hash})
  )
)

(define-read-only (get-paper (author principal) (paper-id uint))
  (map-get? papers {author: author, paper-id: paper-id})
)

(define-public (verify-paper (author principal) (paper-id uint))
  (let
    (
      (caller tx-sender)
      (user-role (get role (unwrap! (contract-call? .UserManager get-user caller) ERR_UNAUTHORIZED)))
    )
    (asserts! (is-eq user-role "verifier") ERR_UNAUTHORIZED)
    (let ((paper (unwrap! (map-get? papers {author: author, paper-id: paper-id}) ERR_UNAUTHORIZED)))
      (map-set papers {author: author, paper-id: paper-id}
        (merge paper {verified: true}))
      (ok true)
    )
  )
)
```

### 3. PeerReview.clar
Submits immutable reviews linked to papers.

```clarity
(define-constant ERR_REVIEW_EXISTS (err u3000))
(define-constant ERR_INVALID_REVIEW (err u3001))

(define-map reviews {paper-author: principal, paper-id: uint, reviewer: principal}
  {review-hash: (string-ascii 64), score: uint, timestamp: uint, validated: bool})

(define-public (submit-review (paper-author principal) (paper-id uint) (review-hash (string-ascii 64)) (score uint))
  (let
    (
      (caller tx-sender)
      (key {paper-author: paper-author, paper-id: paper-id, reviewer: caller})
    )
    (asserts! (and (<= score u10) (>= score u0)) ERR_INVALID_REVIEW)
    (asserts! (is-eq (len review-hash) u64) ERR_INVALID_REVIEW)
    (asserts! (is-none (map-get? reviews key)) ERR_REVIEW_EXISTS)
    (map-set reviews key
      {review-hash: review-hash, score: score, timestamp: block-height, validated: false})
    (ok {score: score, hash: review-hash})
  )
)

(define-read-only (get-review (paper-author principal) (paper-id uint) (reviewer principal))
  (map-get? reviews {paper-author: paper-author, paper-id: paper-id, reviewer: reviewer})
)
```

### 4. ReviewValidation.clar
Validates reviews by verifiers, ensuring quality.

```clarity
(define-constant ERR_NOT_REVIEWER (err u4000))

(define-public (validate-review (paper-author principal) (paper-id uint) (reviewer principal))
  (let
    (
      (caller tx-sender)
      (user-role (get role (unwrap! (contract-call? .UserManager get-user caller) ERR_UNAUTHORIZED)))
    )
    (asserts! (is-eq user-role "verifier") ERR_UNAUTHORIZED)
    (let ((review (unwrap! (contract-call? .PeerReview get-review paper-author paper-id reviewer) ERR_NOT_REVIEWER)))
      (map-set reviews {paper-author: paper-author, paper-id: paper-id, reviewer: reviewer}
        (merge review {validated: true}))
      ;; Trigger reputation update
      (try! (contract-call? .ReputationSystem update-reviewer-rep reviewer (+ (get score review) u1))) ;; Simple boost
      (ok true)
    )
  )
)
```

### 5. ReputationSystem.clar
Tracks and updates user reputation based on verifications and reviews.

```clarity
(define-constant ERR_LOW_REP (err u5000))

(define-map reputations principal uint)

(define-public (update-author-rep (author principal) (verified-papers uint))
  (let ((current (+ (default-to u0 (map-get? reputations author)) verified-papers)))
    (map-set reputations author current)
    (ok current)
  )
)

(define-public (update-reviewer-rep (reviewer principal) (delta uint))
  (let ((current (+ (default-to u0 (map-get? reputations reviewer)) delta)))
    (map-set reputations reviewer current)
    (ok current)
  )
)

(define-read-only (get-reputation (user principal))
  (default-to u0 (map-get? reputations user))
)

(define-read-only (is-trusted (user principal))
  (>= (get-reputation user) u50)
)
```

### 6. DisputeResolution.clar
Handles disputes via on-chain voting (simple majority).

```clarity
(define-constant ERR_NOT_AUTHORIZED (err u6000))
(define-constant ERR_VOTE_PERIOD_OVER (err u6001))

(define-map disputes {dispute-id: uint}
  {target-user: principal, type: (string-ascii 20), votes-yes: uint, votes-no: uint, resolved: bool})

(define-data-var current-dispute-id uint u0)
(define-data-var vote-period uint u10) ;; Blocks for voting

(define-public (raise-dispute (target principal) (dispute-type (string-ascii 20)))
  (let
    (
      (caller tx-sender)
      (new-id (var-get current-dispute-id))
    )
    (asserts! (contract-call? .UserManager is-trusted caller) ERR_NOT_AUTHORIZED)
    (map-set disputes {dispute-id: new-id}
      {target-user: target, type: dispute-type, votes-yes: u0, votes-no: u0, resolved: false})
    (var-set current-dispute-id (+ new-id u1))
    (ok new-id)
  )
)

(define-public (vote-on-dispute (dispute-id uint) (vote-yes bool))
  (let
    (
      (caller tx-sender)
      (dispute (unwrap! (map-get? disputes {dispute-id: dispute-id}) ERR_NOT_AUTHORIZED))
      (current-height block-height)
      (start-height (- current-height (mod current-height (var-get vote-period))))
    )
    (asserts! (not (get resolved dispute)) ERR_VOTE_PERIOD_OVER)
    (asserts! (> (- current-height start-height) (var-get vote-period)) ERR_VOTE_PERIOD_OVER)
    (if vote-yes
      (map-set disputes {dispute-id: dispute-id}
        (merge dispute {votes-yes: (+ (get votes-yes dispute) u1)}))
      (map-set disputes {dispute-id: dispute-id}
        (merge dispute {votes-no: (+ (get votes-no dispute) u1)}))
    )
    (ok true)
  )
)

(define-public (resolve-dispute (dispute-id uint))
  (let ((dispute (unwrap! (map-get? disputes {dispute-id: dispute-id}) ERR_NOT_AUTHORIZED)))
    (if (> (get votes-yes dispute) (get votes-no dispute))
      ;; Penalize reputation
      (try! (contract-call? .ReputationSystem update-reviewer-rep (get target-user dispute) (- u10)))
      ;; Uphold
      (ok true)
    )
    (map-set disputes {dispute-id: dispute-id} (merge dispute {resolved: true}))
    (ok true)
  )
)
```

## Deployment and Usage

### Prerequisites
- [Clarinet CLI](https://docs.stacks.co/clarinet) for testing.
- Stacks wallet (e.g., Leather) for deployment.
- Node.js for frontend (optional).

### Local Development
1. Install Clarinet: `cargo install clarinet`.
2. Create project: `clarinet new acadchain && cd acadchain`.
3. Replace `contracts/` with above files (adjust imports, e.g., `use .UserManager::*`).
4. Test: `clarinet test` (add tests in `tests/`).
5. Run locally: `clarinet integrate`.

### Deployment to Stacks
1. Compile: `clarinet contract-instantiate`.
2. Deploy via Stacks Explorer or CLI: Set admin to your principal.
   - Order: UserManager → PaperSubmission → PeerReview → ReviewValidation → ReputationSystem → DisputeResolution.
3. Frontend Integration: Use `@stacks/transactions` to call contracts.

### Example Usage
- Register: Call `register-user("author")`.
- Submit Paper: `submit-paper(1, "QmHashHere")`.
- Submit Review: `submit-review(author, 1, "ReviewHash", 8)`.
- Validate: Verifiers call `validate-review(...)`.
- Check Rep: `get-reputation(user)`.

### Security Notes
- Use multisig for admin in production.
- Hash sensitive data; store full content off-chain.
- Audit contracts before mainnet.

## Contributing
Fork, PR improvements. Focus on adding incentives (e.g., SIP-009 token) or oracle integrations.

## License
MIT. Built with ❤️ for academic integrity.