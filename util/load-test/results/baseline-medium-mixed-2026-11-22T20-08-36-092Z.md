### baseline: medium profile, mixed mix (2026-11-22T20:08:36.092Z)



#### 1 user(s), 60.9 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 13 | 0.21 | 4 | 4 | 4 | 4 | 0 |
| GET /api/group/all | 13 | 0.21 | 4 | 5 | 5 | 5 | 0 |
| GET /api/strategy/all | 19 | 0.31 | 4 | 5 | 5 | 5 | 0 |
| PATCH /api/run/back-test | 9 | 0.15 | 406 | 451 | 451 | 451 | 0 |
| POST /api/strategy | 13 | 0.21 | 5 | 6 | 6 | 6 | 0 |
| probe GET /api/strategy/names | 240 | 3.94 | 4 | 6 | 365 | 387 | 0 |

#### 2 user(s), 61.3 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 23 | 0.38 | 3 | 5 | 5 | 5 | 0 |
| GET /api/group/all | 17 | 0.28 | 3 | 330 | 330 | 330 | 0 |
| GET /api/strategy/all | 45 | 0.73 | 4 | 153 | 270 | 270 | 0 |
| PATCH /api/run/back-test | 26 | 0.42 | 393 | 728 | 746 | 746 | 0 |
| POST /api/strategy | 23 | 0.38 | 4 | 388 | 605 | 605 | 0 |
| probe GET /api/strategy/names | 237 | 3.87 | 4 | 328 | 409 | 534 | 0 |

#### 5 user(s), 61.2 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 47 | 0.77 | 4 | 11 | 419 | 419 | 0 |
| GET /api/group/all | 71 | 1.16 | 4 | 308 | 450 | 450 | 0 |
| GET /api/strategy/all | 89 | 1.45 | 4 | 473 | 822 | 822 | 0 |
| PATCH /api/run/back-test | 52 | 0.85 | 416 | 1096 | 1516 | 1516 | 0 |
| POST /api/strategy | 47 | 0.77 | 12 | 335 | 464 | 464 | 0 |
| probe GET /api/strategy/names | 225 | 3.68 | 4 | 383 | 642 | 885 | 0 |

#### 10 user(s), 62.2 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 89 | 1.43 | 5 | 17 | 399 | 399 | 0 |
| GET /api/group/all | 87 | 1.4 | 84 | 801 | 1681 | 1681 | 0 |
| GET /api/strategy/all | 170 | 2.73 | 68 | 735 | 1638 | 1675 | 0 |
| PATCH /api/run/back-test | 99 | 1.59 | 811 | 2090 | 2477 | 2477 | 0 |
| POST /api/strategy | 89 | 1.43 | 114 | 744 | 1204 | 1204 | 0 |
| probe GET /api/strategy/names | 192 | 3.09 | 5 | 765 | 1295 | 1573 | 0 |
