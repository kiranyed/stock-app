### after-workers: small profile, mixed mix (2026-11-23T04:12:31.286Z)



#### 1 user(s), 60.5 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 9 | 0.15 | 5 | 7 | 7 | 7 | 0 |
| GET /api/group/all | 11 | 0.18 | 4 | 5 | 5 | 5 | 0 |
| GET /api/strategy/all | 24 | 0.4 | 4 | 6 | 6 | 6 | 0 |
| PATCH /api/run/back-test | 14 | 0.23 | 74 | 123 | 123 | 123 | 0 |
| POST /api/strategy | 9 | 0.15 | 6 | 7 | 7 | 7 | 0 |
| probe GET /api/strategy/names | 241 | 3.98 | 4 | 5 | 7 | 13 | 0 |

#### 2 user(s), 60.5 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 27 | 0.45 | 4 | 6 | 7 | 7 | 0 |
| GET /api/group/all | 25 | 0.41 | 4 | 5 | 7 | 7 | 0 |
| GET /api/strategy/all | 30 | 0.5 | 4 | 5 | 5 | 5 | 0 |
| PATCH /api/run/back-test | 33 | 0.55 | 66 | 75 | 108 | 108 | 0 |
| POST /api/strategy | 27 | 0.45 | 5 | 6 | 6 | 6 | 0 |
| probe GET /api/strategy/names | 241 | 3.98 | 4 | 5 | 6 | 7 | 0 |

#### 5 user(s), 61.3 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 59 | 0.96 | 4 | 6 | 6 | 6 | 0 |
| GET /api/group/all | 62 | 1.01 | 4 | 5 | 6 | 6 | 0 |
| GET /api/strategy/all | 119 | 1.94 | 4 | 5 | 5 | 5 | 0 |
| PATCH /api/run/back-test | 58 | 0.95 | 65 | 68 | 86 | 86 | 0 |
| POST /api/strategy | 59 | 0.96 | 5 | 7 | 7 | 7 | 0 |
| probe GET /api/strategy/names | 244 | 3.98 | 4 | 4 | 7 | 24 | 0 |

#### 10 user(s), 61.1 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 128 | 2.1 | 4 | 5 | 5 | 6 | 0 |
| GET /api/group/all | 117 | 1.92 | 4 | 4 | 5 | 5 | 0 |
| GET /api/strategy/all | 232 | 3.8 | 4 | 5 | 5 | 5 | 0 |
| PATCH /api/run/back-test | 122 | 2 | 64 | 73 | 83 | 117 | 0 |
| POST /api/strategy | 128 | 2.1 | 5 | 6 | 7 | 8 | 0 |
| probe GET /api/strategy/names | 243 | 3.98 | 4 | 5 | 6 | 7 | 0 |
