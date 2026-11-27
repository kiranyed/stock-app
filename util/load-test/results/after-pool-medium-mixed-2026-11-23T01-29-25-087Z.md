### after-pool: medium profile, mixed mix (2026-11-23T01:29:25.087Z)



#### 1 user(s), 60.3 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 6 | 0.1 | 4 | 5 | 5 | 5 | 0 |
| GET /api/group/all | 15 | 0.25 | 4 | 5 | 5 | 5 | 0 |
| GET /api/strategy/all | 23 | 0.38 | 4 | 5 | 6 | 6 | 0 |
| PATCH /api/run/back-test | 10 | 0.17 | 344 | 408 | 408 | 408 | 0 |
| POST /api/strategy | 6 | 0.1 | 5 | 6 | 6 | 6 | 0 |
| probe GET /api/strategy/names | 240 | 3.98 | 4 | 6 | 266 | 272 | 0 |

#### 2 user(s), 60.6 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 24 | 0.4 | 4 | 6 | 6 | 6 | 0 |
| GET /api/group/all | 30 | 0.5 | 4 | 5 | 5 | 5 | 0 |
| GET /api/strategy/all | 41 | 0.68 | 4 | 5 | 267 | 267 | 0 |
| PATCH /api/run/back-test | 21 | 0.35 | 345 | 486 | 493 | 493 | 0 |
| POST /api/strategy | 24 | 0.4 | 5 | 6 | 6 | 6 | 0 |
| probe GET /api/strategy/names | 238 | 3.93 | 4 | 222 | 346 | 433 | 0 |

#### 5 user(s), 61.5 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 50 | 0.81 | 4 | 5 | 423 | 423 | 0 |
| GET /api/group/all | 52 | 0.85 | 4 | 518 | 676 | 676 | 0 |
| GET /api/strategy/all | 115 | 1.87 | 4 | 295 | 493 | 629 | 0 |
| PATCH /api/run/back-test | 46 | 0.75 | 348 | 683 | 781 | 781 | 0 |
| POST /api/strategy | 50 | 0.81 | 5 | 338 | 564 | 564 | 0 |
| probe GET /api/strategy/names | 233 | 3.79 | 4 | 323 | 573 | 746 | 0 |

#### 10 user(s), 61.6 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 105 | 1.71 | 4 | 337 | 746 | 1083 | 0 |
| GET /api/group/all | 97 | 1.58 | 4 | 521 | 758 | 758 | 0 |
| GET /api/strategy/all | 211 | 3.43 | 8 | 566 | 939 | 1004 | 0 |
| PATCH /api/run/back-test | 82 | 1.33 | 440 | 1132 | 1420 | 1420 | 0 |
| POST /api/strategy | 105 | 1.71 | 6 | 421 | 536 | 638 | 0 |
| probe GET /api/strategy/names | 212 | 3.44 | 4 | 581 | 689 | 1112 | 0 |
