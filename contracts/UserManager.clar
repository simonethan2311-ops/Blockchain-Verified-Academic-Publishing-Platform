(define-constant ERR_NOT_AUTHORIZED u100)
(define-constant ERR_USER_EXISTS u101)
(define-constant ERR_INVALID_ROLE u102)
(define-constant ERR_INVALID_REPUTATION u103)
(define-constant ERR_INVALID_STAKE u104)
(define-constant ERR_NOT_ACTIVE u105)
(define-constant ERR_ALREADY_VOTED u106)
(define-constant ERR_VOTE_PERIOD_OVER u107)
(define-constant ERR_INVALID_PROFILE u108)
(define-constant ERR_INVALID_STATUS u109)
(define-constant ERR_INVALID_TIMESTAMP u110)

(define-data-var admin principal tx-sender)
(define-data-var min-stake uint u1000)
(define-data-var max-reputation uint u10000)
(define-data-var voting-period uint u1440)

(define-map users principal
  {
    role: (string-ascii 20),
    reputation: uint,
    stake: uint,
    profile-hash: (string-ascii 64),
    registered-at: uint,
    active: bool
  }
)

(define-map reputation-votes
  { target: principal, voter: principal }
  { score: uint, timestamp: uint }
)

(define-map user-roles principal (list 3 (string-ascii 20)))

(define-read-only (get-user (user principal))
  (map-get? users user)
)

(define-read-only (get-user-roles (user principal))
  (default-to (list) (map-get? user-roles user))
)

(define-read-only (get-reputation-vote (target principal) (voter principal))
  (map-get? reputation-votes { target: target, voter: voter })
)

(define-read-only (get-min-stake)
  (var-get min-stake)
)

(define-read-only (is-trusted-user (user principal))
  (let ((user-data (unwrap! (map-get? users user) false)))
    (and (get active user-data) (>= (get reputation user-data) u5000))
  )
)

(define-private (validate-role (role (string-ascii 20)))
  (if (or (is-eq role "author") (is-eq role "reviewer") (is-eq role "verifier"))
    (ok true)
    (err ERR_INVALID_ROLE)
  )
)

(define-private (validate-stake (amount uint))
  (if (>= amount (var-get min-stake))
    (ok true)
    (err ERR_INVALID_STAKE)
  )
)

(define-private (validate-profile-hash (hash (string-ascii 64)))
  (if (is-eq (len hash) u64)
    (ok true)
    (err ERR_INVALID_PROFILE)
  )
)

(define-private (validate-reputation (rep uint))
  (if (<= rep (var-get max-reputation))
    (ok true)
    (err ERR_INVALID_REPUTATION)
  )
)

(define-public (set-min-stake (new-stake uint))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (asserts! (> new-stake u0) (err ERR_INVALID_STAKE))
    (var-set min-stake new-stake)
    (ok true)
  )
)

(define-public (register-user
  (role (string-ascii 20))
  (profile-hash (string-ascii 64))
  (stake-amount uint)
)
  (let ((caller tx-sender))
    (asserts! (is-none (map-get? users caller)) (err ERR_USER_EXISTS))
    (try! (validate-role role))
    (try! (validate-profile-hash profile-hash))
    (try! (validate-stake stake-amount))
    (try! (stx-transfer? stake-amount caller (as-contract tx-sender)))
    (map-set users caller
      {
        role: role,
        reputation: u0,
        stake: stake-amount,
        profile-hash: profile-hash,
        registered-at: block-height,
        active: true
      }
    )
    (map-set user-roles caller (list role))
    (print { event: "user-registered", user: caller, role: role })
    (ok true)
  )
)

(define-public (add-role (role (string-ascii 20)))
  (let
    (
      (caller tx-sender)
      (user-data (unwrap! (map-get? users caller) (err ERR_NOT_AUTHORIZED)))
      (current-roles (default-to (list) (map-get? user-roles caller)))
    )
    (asserts! (get active user-data) (err ERR_NOT_ACTIVE))
    (try! (validate-role role))
    (asserts! (< (len current-roles) u3) (err ERR_INVALID_ROLE))
    (asserts! (not (is-some (index-of current-roles role))) (err ERR_INVALID_ROLE))
    (map-set user-roles caller (unwrap! (as-max-len? (append current-roles role) u3) (err ERR_INVALID_ROLE)))
    (print { event: "role-added", user: caller, role: role })
    (ok true)
  )
)

(define-public (update-profile (new-hash (string-ascii 64)))
  (let
    (
      (caller tx-sender)
      (user-data (unwrap! (map-get? users caller) (err ERR_NOT_AUTHORIZED)))
    )
    (asserts! (get active user-data) (err ERR_NOT_ACTIVE))
    (try! (validate-profile-hash new-hash))
    (map-set users caller
      (merge user-data { profile-hash: new-hash, registered-at: block-height })
    )
    (print { event: "profile-updated", user: caller, hash: new-hash })
    (ok true)
  )
)

(define-public (vote-on-reputation (target principal) (score uint))
  (let
    (
      (caller tx-sender)
      (target-data (unwrap! (map-get? users target) (err ERR_NOT_AUTHORIZED)))
      (voter-data (unwrap! (map-get? users caller) (err ERR_NOT_AUTHORIZED)))
      (vote-key { target: target, voter: caller })
    )
    (asserts! (get active target-data) (err ERR_NOT_ACTIVE))
    (asserts! (get active voter-data) (err ERR_NOT_ACTIVE))
    (asserts! (<= score u100) (err ERR_INVALID_REPUTATION))
    (asserts! (is-none (map-get? reputation-votes vote-key)) (err ERR_ALREADY_VOTED))
    (map-set reputation-votes vote-key { score: score, timestamp: block-height })
    (print { event: "reputation-voted", target: target, voter: caller, score: score })
    (ok true)
  )
)

(define-public (finalize-reputation (target principal))
  (let
    (
      (caller tx-sender)
      (target-data (unwrap! (map-get? users target) (err ERR_NOT_AUTHORIZED)))
      (current-rep (get reputation target-data))
    )
    (asserts! (is-eq caller (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (asserts! (get active target-data) (err ERR_NOT_ACTIVE))
    (let
      (
        (total-score (fold sum-votes (map-get? reputation-votes { target: target }) u0))
        (new-rep (+ current-rep total-score))
      )
      (try! (validate-reputation new-rep))
      (map-set users target
        (merge target-data { reputation: new-rep })
      )
      (print { event: "reputation-finalized", target: target, new-rep: new-rep })
      (ok true)
    )
  )
)

(define-public (toggle-user-status (target principal))
  (let
    (
      (caller tx-sender)
      (user-data (unwrap! (map-get? users target) (err ERR_NOT_AUTHORIZED)))
    )
    (asserts! (is-eq caller (var-get admin)) (err ERR_NOT_AUTHORIZED))
    (map-set users target
      (merge user-data { active: (not (get active user-data)) })
    )
    (print { event: "status-toggled", target: target, active: (not (get active user-data)) })
    (ok true)
  )
)

(define-public (withdraw-stake)
  (let
    (
      (caller tx-sender)
      (user-data (unwrap! (map-get? users caller) (err ERR_NOT_AUTHORIZED)))
    )
    (asserts! (not (get active user-data)) (err ERR_NOT_ACTIVE))
    (try! (as-contract (stx-transfer? (get stake user-data) tx-sender caller)))
    (map-set users caller
      (merge user-data { stake: u0 })
    )
    (print { event: "stake-withdrawn", user: caller, amount: (get stake user-data) })
    (ok true)
  )
)

(define-private (sum-votes (vote (tuple (score uint) (timestamp uint))) (acc uint))
  (if (<= (- block-height (get timestamp vote)) (var-get voting-period))
    (+ acc (get score vote))
    acc
  )
)