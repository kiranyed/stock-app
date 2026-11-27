### after-workers: medium profile, mixed mix (2026-11-23T04:16:41.975Z)



#### 1 user(s), 60.8 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 17 | 0.28 | 4 | 5 | 5 | 5 | 0 |
| GET /api/group/all | 8 | 0.13 | 4 | 5 | 5 | 5 | 0 |
| GET /api/strategy/all | 22 | 0.36 | 4 | 4 | 5 | 5 | 0 |
| PATCH /api/run/back-test | 8 | 0.13 | 361 | 420 | 420 | 420 | 0 |
| POST /api/strategy | 17 | 0.28 | 5 | 6 | 6 | 6 | 0 |
| probe GET /api/strategy/names | 242 | 3.98 | 4 | 5 | 5 | 6 | 0 |

#### 2 user(s), 61.1 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 21 | 0.34 | 4 | 5 | 5 | 5 | 0 |
| GET /api/group/all | 18 | 0.29 | 4 | 5 | 5 | 5 | 0 |
| GET /api/strategy/all | 42 | 0.69 | 4 | 5 | 5 | 5 | 0 |
| PATCH /api/run/back-test | 26 | 0.43 | 349 | 421 | 429 | 429 | 0 |
| POST /api/strategy | 21 | 0.34 | 5 | 6 | 6 | 6 | 0 |
| probe GET /api/strategy/names | 243 | 3.98 | 4 | 4 | 5 | 9 | 0 |

#### 5 user(s), 61 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 72 | 1.18 | 4 | 5 | 7 | 7 | 0 |
| GET /api/group/all | 51 | 0.84 | 3 | 4 | 4 | 4 | 0 |
| GET /api/strategy/all | 114 | 1.87 | 4 | 5 | 6 | 9 | 0 |
| PATCH /api/run/back-test | 43 | 0.7 | 348 | 429 | 445 | 445 | 0 |
| POST /api/strategy | 72 | 1.18 | 5 | 6 | 8 | 8 | 0 |
| probe GET /api/strategy/names | 243 | 3.98 | 4 | 4 | 5 | 8 | 0 |

#### 10 user(s), 61.8 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 82 | 1.33 | 4 | 4 | 5 | 5 | 0 |
| GET /api/group/all | 133 | 2.15 | 3 | 4 | 6 | 8 | 0 |
| GET /api/strategy/all | 199 | 3.22 | 3 | 4 | 6 | 6 | 0 |
| PATCH /api/run/back-test | 134 | 2.17 | 351 | 433 | 477 | 478 | 0 |
| POST /api/strategy | 82 | 1.33 | 4 | 5 | 7 | 7 | 0 |
| probe GET /api/strategy/names | 246 | 3.98 | 3 | 4 | 7 | 18 | 0 |
