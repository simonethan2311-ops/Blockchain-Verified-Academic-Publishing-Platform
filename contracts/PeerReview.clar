(define-constant ERR_REVIEW_EXISTS u3000)
(define-constant ERR_INVALID_REVIEW u3001)
(define-constant ERR_NOT_AUTHORIZED u3002)
(define-constant ERR_INVALID_SCORE u3003)
(define-constant ERR_INVALID_HASH u3004)
(define-constant ERR_REVIEW_NOT_FOUND u3005)
(define-constant ERR_INVALID_TIMESTAMP u3006)
(define-constant ERR_AUTHORITY_NOT_SET u3007)
(define-constant ERR_INVALID_MIN_SCORE u3008)
(define-constant ERR_INVALID_MAX_SCORE u3009)
(define-constant ERR_INVALID_REVIEW_PERIOD u3010)
(define-constant ERR_INVALID_PENALTY u3011)
(define-constant ERR_INVALID_REWARD u3012)
(define-constant ERR_MAX_REVIEWS_EXCEEDED u3013)
(define-constant ERR_INVALID_STATUS u3014)
(define-constant ERR_INVALID_CATEGORY u3015)
(define-constant ERR_INVALID_COMMENT_LENGTH u3016)
(define-constant ERR_INVALID_REVIEW_TYPE u3017)
(define-constant ERR_INVALID_PRIORITY u3018)
(define-constant ERR_INVALID_LOCATION u3019)
(define-constant ERR_INVALID_CURRENCY u3020)

(define-data-var next-review-id uint u0)
(define-data-var max-reviews uint u10000)
(define-data-var review-fee uint u500)
(define-data-var authority-contract (optional principal) none)
(define-data-var min-score uint u0)
(define-data-var max-score uint u10)
(define-data-var review-period uint u144)
(define-data-var penalty-rate uint u5)
(define-data-var reward-amount uint u100)
(define-data-var active-status bool true)

(define-map reviews
  uint
  {
    paper-author: principal,
    paper-id: uint,
    reviewer: principal,
    review-hash: (string-ascii 64),
    score: uint,
    timestamp: uint,
    validated: bool,
    category: (string-utf8 50),
    comment-length: uint,
    review-type: (string-utf8 20),
    priority: uint,
    location: (string-utf8 100),
    currency: (string-utf8 20),
    status: bool
  }
)

(define-map reviews-by-key
  {paper-author: principal, paper-id: uint, reviewer: principal}
  uint
)

(define-map review-updates
  uint
  {
    update-score: uint,
    update-hash: (string-ascii 64),
    update-timestamp: uint,
    updater: principal
  }
)

(define-read-only (get-review (id uint))
  (map-get? reviews id)
)

(define-read-only (get-review-by-key (paper-author principal) (paper-id uint) (reviewer principal))
  (let ((id (map-get? reviews-by-key {paper-author: paper-author, paper-id: paper-id, reviewer: reviewer})))
    (match id review-id (map-get? reviews review-id) none)
  )
)

(define-read-only (get-review-updates (id uint))
  (map-get? review-updates id)
)

(define-read-only (is-review-registered (paper-author principal) (paper-id uint) (reviewer principal))
  (is-some (map-get? reviews-by-key {paper-author: paper-author, paper-id: paper-id, reviewer: reviewer}))
)

(define-private (validate-score (score uint))
  (let ((min (var-get min-score)) (max (var-get max-score)))
    (if (and (>= score min) (<= score max))
      (ok true)
      (err ERR_INVALID_SCORE)
    )
  )
)

(define-private (validate-hash (hash (string-ascii 64)))
  (if (is-eq (len hash) u64)
    (ok true)
    (err ERR_INVALID_HASH)
  )
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR_INVALID_TIMESTAMP)
  )
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (and (> (len cat) u0) (<= (len cat) u50))
    (ok true)
    (err ERR_INVALID_CATEGORY)
  )
)

(define-private (validate-comment-length (length uint))
  (if (<= length u1000)
    (ok true)
    (err ERR_INVALID_COMMENT_LENGTH)
  )
)

(define-private (validate-review-type (type (string-utf8 20)))
  (if (or (is-eq type "peer") (is-eq type "expert") (is-eq type "community"))
    (ok true)
    (err ERR_INVALID_REVIEW_TYPE)
  )
)

(define-private (validate-priority (prio uint))
  (if (<= prio u5)
    (ok true)
    (err ERR_INVALID_PRIORITY)
  )
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
    (ok true)
    (err ERR_INVALID_LOCATION)
  )
)

(define-private (validate-currency (cur (string-utf8 20)))
  (if (or (is-eq cur "STX") (is-eq cur "USD") (is-eq cur "BTC"))
    (ok true)
    (err ERR_INVALID_CURRENCY)
  )
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR_NOT_AUTHORIZED)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-principal contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR_NOT_AUTHORIZED))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-reviews (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR_INVALID_UPDATE_PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set max-reviews new-max)
    (ok true)
  )
)

(define-public (set-review-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR_INVALID_UPDATE_PARAM))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set review-fee new-fee)
    (ok true)
  )
)

(define-public (set-score-range (new-min uint) (new-max uint))
  (begin
    (asserts! (< new-min new-max) (err ERR_INVALID_SCORE))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set min-score new-min)
    (var-set max-score new-max)
    (ok true)
  )
)

(define-public (set-review-period (new-period uint))
  (begin
    (asserts! (> new-period u0) (err ERR_INVALID_REVIEW_PERIOD))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set review-period new-period)
    (ok true)
  )
)

(define-public (set-penalty-rate (new-rate uint))
  (begin
    (asserts! (<= new-rate u100) (err ERR_INVALID_PENALTY))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set penalty-rate new-rate)
    (ok true)
  )
)

(define-public (set-reward-amount (new-amount uint))
  (begin
    (asserts! (> new-amount u0) (err ERR_INVALID_REWARD))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set reward-amount new-amount)
    (ok true)
  )
)

(define-public (toggle-status)
  (begin
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set active-status (not (var-get active-status)))
    (ok (var-get active-status))
  )
)

(define-public (submit-review
  (paper-author principal)
  (paper-id uint)
  (review-hash (string-ascii 64))
  (score uint)
  (category (string-utf8 50))
  (comment-length uint)
  (review-type (string-utf8 20))
  (priority uint)
  (location (string-utf8 100))
  (currency (string-utf8 20))
)
  (let
    (
      (next-id (var-get next-review-id))
      (current-max (var-get max-reviews))
      (authority (var-get authority-contract))
      (caller tx-sender)
      (key {paper-author: paper-author, paper-id: paper-id, reviewer: caller})
    )
    (asserts! (var-get active-status) (err ERR_INVALID_STATUS))
    (asserts! (< next-id current-max) (err ERR_MAX_REVIEWS_EXCEEDED))
    (try! (validate-score score))
    (try! (validate-hash review-hash))
    (try! (validate-category category))
    (try! (validate-comment-length comment-length))
    (try! (validate-review-type review-type))
    (try! (validate-priority priority))
    (try! (validate-location location))
    (try! (validate-currency currency))
    (asserts! (is-none (map-get? reviews-by-key key)) (err ERR_REVIEW_EXISTS))
    (let ((authority-recipient (unwrap! authority (err ERR_AUTHORITY_NOT_SET))))
      (try! (stx-transfer? (var-get review-fee) caller authority-recipient))
    )
    (map-set reviews next-id
      {
        paper-author: paper-author,
        paper-id: paper-id,
        reviewer: caller,
        review-hash: review-hash,
        score: score,
        timestamp: block-height,
        validated: false,
        category: category,
        comment-length: comment-length,
        review-type: review-type,
        priority: priority,
        location: location,
        currency: currency,
        status: true
      }
    )
    (map-set reviews-by-key key next-id)
    (var-set next-review-id (+ next-id u1))
    (print { event: "review-submitted", id: next-id })
    (ok next-id)
  )
)

(define-public (update-review
  (review-id uint)
  (update-score uint)
  (update-hash (string-ascii 64))
)
  (let ((review (map-get? reviews review-id)))
    (match review
      r
        (begin
          (asserts! (is-eq (get reviewer r) tx-sender) (err ERR_NOT_AUTHORIZED))
          (try! (validate-score update-score))
          (try! (validate-hash update-hash))
          (map-set reviews review-id
            (merge r
              {
                score: update-score,
                review-hash: update-hash,
                timestamp: block-height
              }
            )
          )
          (map-set review-updates review-id
            {
              update-score: update-score,
              update-hash: update-hash,
              update-timestamp: block-height,
              updater: tx-sender
            }
          )
          (print { event: "review-updated", id: review-id })
          (ok true)
        )
      (err ERR_REVIEW_NOT_FOUND)
    )
  )
)

(define-public (validate-review (review-id uint))
  (let ((review (map-get? reviews review-id)))
    (match review
      r
        (begin
          (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR_AUTHORITY_NOT_SET))) (err ERR_NOT_AUTHORIZED))
          (map-set reviews review-id (merge r { validated: true }))
          (print { event: "review-validated", id: review-id })
          (ok true)
        )
      (err ERR_REVIEW_NOT_FOUND)
    )
  )
)

(define-public (get-review-count)
  (ok (var-get next-review-id))
)

(define-public (check-review-existence (paper-author principal) (paper-id uint) (reviewer principal))
  (ok (is-review-registered paper-author paper-id reviewer))
)