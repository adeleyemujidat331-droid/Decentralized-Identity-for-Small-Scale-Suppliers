(define-constant ERR-ALREADY-REGISTERED u100)
(define-constant ERR-INVALID-HASH u101)
(define-constant ERR-INVALID-PRINCIPAL u102)
(define-constant ERR-NOT-AUTHORIZED u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-ID-NOT-FOUND u105)
(define-constant ERR-HASH-ALREADY-USED u106)
(define-constant ERR-INVALID-PROOF u107)
(define-constant ERR-INVALID-LOCATION u108)
(define-constant ERR-INVALID-CATEGORY u109)
(define-constant ERR-INVALID-STATUS u110)
(define-constant ERR-INVALID-UPDATE u111)
(define-constant ERR-MAX-IDS-EXCEEDED u112)
(define-constant ERR-INVALID-MIN-AGE u113)
(define-constant ERR-INVALID-VERIFIER u114)
(define-constant ERR-VERIFICATION-FAILED u115)
(define-constant ERR-INVALID-BIOMETRIC u116)
(define-constant ERR-INVALID-EMAIL u117)
(define-constant ERR-INVALID-PHONE u118)
(define-constant ERR-INVALID-NAME u119)
(define-constant ERR-INVALID-ADDRESS u120)

(define-data-var registry-admin principal tx-sender)
(define-data-var next-id uint u0)
(define-data-var max-ids uint u1000000)
(define-data-var registration-fee uint u500)
(define-data-var verifier-contract (optional principal) none)

(define-map identities uint 
  {
    owner: principal,
    id-hash: (buff 32),
    registered-at: uint,
    last-updated: uint,
    proof: (buff 64),
    location: (string-utf8 100),
    category: (string-utf8 50),
    status: bool,
    age: uint,
    biometric-hash: (optional (buff 32)),
    email: (optional (string-utf8 100)),
    phone: (optional (string-utf8 50)),
    name: (string-utf8 100),
    address: (string-utf8 200)
  }
)

(define-map identities-by-hash (buff 32) uint)
(define-map identities-by-owner principal uint)

(define-map identity-updates uint 
  {
    update-hash: (buff 32),
    update-timestamp: uint,
    updater: principal,
    update-proof: (buff 64)
  }
)

(define-read-only (get-identity (id uint))
  (map-get? identities id)
)

(define-read-only (get-identity-by-hash (hash (buff 32)))
  (match (map-get? identities-by-hash hash)
    id (get-identity id)
    none
  )
)

(define-read-only (get-identity-by-owner (owner principal))
  (match (map-get? identities-by-owner owner)
    id (get-identity id)
    none
  )
)

(define-read-only (get-identity-updates (id uint))
  (map-get? identity-updates id)
)

(define-read-only (is-identity-registered (hash (buff 32)))
  (is-some (map-get? identities-by-hash hash))
)

(define-private (validate-hash (hash (buff 32)))
  (if (is-eq (len hash) u32)
    (ok true)
    (err ERR-INVALID-HASH)
  )
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p tx-sender))
    (ok true)
    (err ERR-INVALID-PRINCIPAL)
  )
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP)
  )
)

(define-private (validate-proof (proof (buff 64)))
  (if (is-eq (len proof) u64)
    (ok true)
    (err ERR-INVALID-PROOF)
  )
)

(define-private (validate-location (loc (string-utf8 100)))
  (if (and (> (len loc) u0) (<= (len loc) u100))
    (ok true)
    (err ERR-INVALID-LOCATION)
  )
)

(define-private (validate-category (cat (string-utf8 50)))
  (if (or (is-eq cat "farmer") (is-eq cat "artisan") (is-eq cat "supplier"))
    (ok true)
    (err ERR-INVALID-CATEGORY)
  )
)

(define-private (validate-age (age uint))
  (if (>= age u18)
    (ok true)
    (err ERR-INVALID-MIN-AGE)
  )
)

(define-private (validate-biometric (bio (optional (buff 32))))
  (match bio
    b (if (is-eq (len b) u32) (ok true) (err ERR-INVALID-BIOMETRIC))
    (ok true)
  )
)

(define-private (validate-email (em (optional (string-utf8 100))))
  (match em
    e (if (<= (len e) u100) (ok true) (err ERR-INVALID-EMAIL))
    (ok true)
  )
)

(define-private (validate-phone (ph (optional (string-utf8 50))))
  (match ph
    p (if (<= (len p) u50) (ok true) (err ERR-INVALID-PHONE))
    (ok true)
  )
)

(define-private (validate-name (nm (string-utf8 100)))
  (if (and (> (len nm) u0) (<= (len nm) u100))
    (ok true)
    (err ERR-INVALID-NAME)
  )
)

(define-private (validate-address (addr (string-utf8 200)))
  (if (<= (len addr) u200)
    (ok true)
    (err ERR-INVALID-ADDRESS)
  )
)

(define-public (set-verifier-contract (contract-principal principal))
  (begin
    (asserts! (is-eq tx-sender (var-get registry-admin)) (err ERR-NOT-AUTHORIZED))
    (var-set verifier-contract (some contract-principal))
    (ok true)
  )
)

(define-public (set-max-ids (new-max uint))
  (begin
    (asserts! (is-eq tx-sender (var-get registry-admin)) (err ERR-NOT-AUTHORIZED))
    (asserts! (> new-max u0) (err ERR-MAX-IDS-EXCEEDED))
    (var-set max-ids new-max)
    (ok true)
  )
)

(define-public (set-registration-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get registry-admin)) (err ERR-NOT-AUTHORIZED))
    (var-set registration-fee new-fee)
    (ok true)
  )
)

(define-public (register-identity 
  (id-hash (buff 32))
  (proof (buff 64))
  (location (string-utf8 100))
  (category (string-utf8 50))
  (age uint)
  (biometric-hash (optional (buff 32)))
  (email (optional (string-utf8 100)))
  (phone (optional (string-utf8 50)))
  (name (string-utf8 100))
  (address (string-utf8 200))
)
  (let (
    (next (var-get next-id))
    (current-max (var-get max-ids))
    (verifier (var-get verifier-contract))
  )
    (asserts! (< next current-max) (err ERR-MAX-IDS-EXCEEDED))
    (try! (validate-hash id-hash))
    (try! (validate-proof proof))
    (try! (validate-location location))
    (try! (validate-category category))
    (try! (validate-age age))
    (try! (validate-biometric biometric-hash))
    (try! (validate-email email))
    (try! (validate-phone phone))
    (try! (validate-name name))
    (try! (validate-address address))
    (asserts! (not (is-identity-registered id-hash)) (err ERR-HASH-ALREADY-USED))
    (asserts! (is-none (map-get? identities-by-owner tx-sender)) (err ERR-ALREADY-REGISTERED))
    (match verifier
      v (try! (as-contract (contract-call? v verify-proof tx-sender proof)))
      (err ERR-VERIFICATION-FAILED)
    )
    (try! (stx-transfer? (var-get registration-fee) tx-sender (var-get registry-admin)))
    (map-set identities next
      {
        owner: tx-sender,
        id-hash: id-hash,
        registered-at: block-height,
        last-updated: block-height,
        proof: proof,
        location: location,
        category: category,
        status: true,
        age: age,
        biometric-hash: biometric-hash,
        email: email,
        phone: phone,
        name: name,
        address: address
      }
    )
    (map-set identities-by-hash id-hash next)
    (map-set identities-by-owner tx-sender next)
    (var-set next-id (+ next u1))
    (print { event: "identity-registered", id: next })
    (ok next)
  )
)

(define-public (update-identity 
  (id uint)
  (new-hash (buff 32))
  (new-proof (buff 64))
)
  (let ((identity (map-get? identities id)))
    (match identity
      i
      (begin
        (asserts! (is-eq (get owner i) tx-sender) (err ERR-NOT-AUTHORIZED))
        (try! (validate-hash new-hash))
        (try! (validate-proof new-proof))
        (asserts! (not (is-identity-registered new-hash)) (err ERR-HASH-ALREADY-USED))
        (map-set identities id
          (merge i 
            {
              id-hash: new-hash,
              last-updated: block-height,
              proof: new-proof
            }
          )
        )
        (map-delete identities-by-hash (get id-hash i))
        (map-set identities-by-hash new-hash id)
        (map-set identity-updates id
          {
            update-hash: new-hash,
            update-timestamp: block-height,
            updater: tx-sender,
            update-proof: new-proof
          }
        )
        (print { event: "identity-updated", id: id })
        (ok true)
      )
      (err ERR-ID-NOT-FOUND)
    )
  )
)

(define-public (deactivate-identity (id uint))
  (let ((identity (map-get? identities id)))
    (match identity
      i
      (begin
        (asserts! (is-eq (get owner i) tx-sender) (err ERR-NOT-AUTHORIZED))
        (map-set identities id (merge i { status: false }))
        (ok true)
      )
      (err ERR-ID-NOT-FOUND)
    )
  )
)

(define-public (get-identity-count)
  (ok (var-get next-id))
)

(define-public (check-identity-existence (hash (buff 32)))
  (ok (is-identity-registered hash))
)