(define-constant ERR_NOT_AUTHORIZED u100)
(define-constant ERR_INVALID_PAPER_ID u101)
(define-constant ERR_INVALID_HASH u102)
(define-constant ERR_INVALID_TIMESTAMP u103)
(define-constant ERR_INVALID_VERIFICATION u104)
(define-constant ERR_PAPER_ALREADY_EXISTS u105)
(define-constant ERR_PAPER_NOT_FOUND u106)
(define-constant ERR_INVALID_MAX_PAPERS u107)
(define-constant ERR_INVALID_MIN_HASH_LEN u108)
(define-constant ERR_INVALID_VERIFIER u109)
(define-constant ERR_INVALID_STATUS u110)
(define-constant ERR_INVALID_CATEGORY u111)
(define-constant ERR_INVALID_KEYWORDS u112)
(define-constant ERR_INVALID_AUTHOR u113)
(define-constant ERR_MAX_PAPERS_EXCEEDED u114)
(define-constant ERR_INVALID_UPDATE_PARAM u115)
(define-constant ERR_AUTHORITY_NOT_SET u116)
(define-constant ERR_INVALID_CREATION_FEE u117)
(define-constant ERR_INVALID_LICENSE u118)
(define-constant ERR_INVALID_VERSION u119)
(define-constant ERR_INVALID_ABSTRACT_LEN u120)

(define-data-var next-paper-id uint u0)
(define-data-var max-papers uint u10000)
(define-data-var creation-fee uint u500)
(define-data-var authority-contract (optional principal) none)
(define-data-var min-hash-length uint u64)
(define-data-var max-abstract-length uint u500)

(define-map papers
  uint
  {
    author: principal,
    hash: (string-ascii 64),
    timestamp: uint,
    verified: bool,
    category: (string-utf8 50),
    keywords: (list 10 (string-utf8 20)),
    status: bool,
    license: (string-utf8 20),
    version: uint,
    abstract-hash: (string-ascii 64)
  }
)

(define-map papers-by-author
  principal
  (list 100 uint)
)

(define-map paper-updates
  uint
  {
    update-hash: (string-ascii 64),
    update-timestamp: uint,
    updater: principal,
    update-version: uint
  }
)

(define-read-only (get-paper (id uint))
  (map-get? papers id)
)

(define-read-only (get-paper-updates (id uint))
  (map-get? paper-updates id)
)

(define-read-only (get-papers-by-author (author principal))
  (default-to (list) (map-get? papers-by-author author))
)

(define-private (validate-paper-id (id uint))
  (if (> id u0)
    (ok true)
    (err ERR_INVALID_PAPER_ID)
  )
)

(define-private (validate-hash (hash (string-ascii 64)))
  (if (is-eq (len hash) (var-get min-hash-length))
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

(define-private (validate-keywords (kws (list 10 (string-utf8 20))))
  (if (<= (len kws) u10)
    (ok true)
    (err ERR_INVALID_KEYWORDS)
  )
)

(define-private (validate-license (lic (string-utf8 20)))
  (if (or (is-eq lic "CC-BY") (is-eq lic "CC-BY-SA") (is-eq lic "MIT"))
    (ok true)
    (err ERR_INVALID_LICENSE)
  )
)

(define-private (validate-version (ver uint))
  (if (> ver u0)
    (ok true)
    (err ERR_INVALID_VERSION)
  )
)

(define-private (validate-abstract-hash (abs-hash (string-ascii 64)))
  (try! (validate-hash abs-hash))
  (ok true)
)

(define-private (validate-author (auth principal))
  (if (not (is-eq auth 'SP000000000000000000002Q6VF78))
    (ok true)
    (err ERR_INVALID_AUTHOR)
  )
)

(define-public (set-authority-contract (contract-principal principal))
  (begin
    (try! (validate-author contract-principal))
    (asserts! (is-none (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set authority-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-papers (new-max uint))
  (begin
    (asserts! (> new-max u0) (err ERR_INVALID_MAX_PAPERS))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set max-papers new-max)
    (ok true)
  )
)

(define-public (set-creation-fee (new-fee uint))
  (begin
    (asserts! (>= new-fee u0) (err ERR_INVALID_CREATION_FEE))
    (asserts! (is-some (var-get authority-contract)) (err ERR_AUTHORITY_NOT_SET))
    (var-set creation-fee new-fee)
    (ok true)
  )
)

(define-public (submit-paper
  (hash (string-ascii 64))
  (category (string-utf8 50))
  (keywords (list 10 (string-utf8 20)))
  (license (string-utf8 20))
  (version uint)
  (abstract-hash (string-ascii 64))
)
  (let (
    (next-id (var-get next-paper-id))
    (current-max (var-get max-papers))
    (authority (var-get authority-contract))
    (author tx-sender)
    (author-papers (get-papers-by-author author))
  )
    (asserts! (< next-id current-max) (err ERR_MAX_PAPERS_EXCEEDED))
    (try! (validate-hash hash))
    (try! (validate-category category))
    (try! (validate-keywords keywords))
    (try! (validate-license license))
    (try! (validate-version version))
    (try! (validate-abstract-hash abstract-hash))
    (let ((authority-recipient (unwrap! authority (err ERR_AUTHORITY_NOT_SET))))
      (try! (stx-transfer? (var-get creation-fee) tx-sender authority-recipient))
    )
    (map-set papers next-id
      {
        author: author,
        hash: hash,
        timestamp: block-height,
        verified: false,
        category: category,
        keywords: keywords,
        status: true,
        license: license,
        version: version,
        abstract-hash: abstract-hash
      }
    )
    (map-set papers-by-author author (cons next-id author-papers))
    (var-set next-paper-id (+ next-id u1))
    (print { event: "paper-submitted", id: next-id })
    (ok next-id)
  )
)

(define-public (verify-paper (paper-id uint))
  (let ((paper (map-get? papers paper-id)))
    (match paper
      p
      (begin
        (asserts! (is-eq tx-sender (unwrap! (var-get authority-contract) (err ERR_AUTHORITY_NOT_SET))) (err ERR_NOT_AUTHORIZED))
        (map-set papers paper-id
          (merge p { verified: true })
        )
        (print { event: "paper-verified", id: paper-id })
        (ok true)
      )
      (err ERR_PAPER_NOT_FOUND)
    )
  )
)

(define-public (update-paper
  (paper-id uint)
  (new-hash (string-ascii 64))
  (new-version uint)
  (new-abstract-hash (string-ascii 64))
)
  (let ((paper (map-get? papers paper-id)))
    (match paper
      p
      (begin
        (asserts! (is-eq (get author p) tx-sender) (err ERR_NOT_AUTHORIZED))
        (try! (validate-hash new-hash))
        (try! (validate-version new-version))
        (try! (validate-abstract-hash new-abstract-hash))
        (asserts! (> new-version (get version p)) (err ERR_INVALID_VERSION))
        (map-set papers paper-id
          {
            author: (get author p),
            hash: new-hash,
            timestamp: block-height,
            verified: false,
            category: (get category p),
            keywords: (get keywords p),
            status: (get status p),
            license: (get license p),
            version: new-version,
            abstract-hash: new-abstract-hash
          }
        )
        (map-set paper-updates paper-id
          {
            update-hash: new-hash,
            update-timestamp: block-height,
            updater: tx-sender,
            update-version: new-version
          }
        )
        (print { event: "paper-updated", id: paper-id })
        (ok true)
      )
      (err ERR_PAPER_NOT_FOUND)
    )
  )
)

(define-public (get-paper-count)
  (ok (var-get next-paper-id))
)

(define-public (check-paper-existence (id uint))
  (ok (is-some (map-get? papers id)))
)