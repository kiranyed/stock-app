### after-pool: small profile, mixed mix (2026-11-23T01:25:18.087Z)



#### 1 user(s), 60.2 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 10 | 0.17 | 4 | 7 | 7 | 7 | 0 |
| GET /api/group/all | 10 | 0.17 | 4 | 6 | 6 | 6 | 0 |
| GET /api/strategy/all | 19 | 0.32 | 4 | 6 | 6 | 6 | 0 |
| PATCH /api/run/back-test | 20 | 0.33 | 67 | 95 | 107 | 107 | 0 |
| POST /api/strategy | 10 | 0.17 | 6 | 7 | 7 | 7 | 0 |
| probe GET /api/strategy/names | 240 | 3.99 | 4 | 5 | 22 | 34 | 0 |

#### 2 user(s), 61.2 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 26 | 0.42 | 4 | 6 | 7 | 7 | 0 |
| GET /api/group/all | 17 | 0.28 | 4 | 5 | 5 | 5 | 0 |
| GET /api/strategy/all | 54 | 0.88 | 4 | 4 | 5 | 5 | 0 |
| PATCH /api/run/back-test | 25 | 0.41 | 63 | 67 | 85 | 85 | 0 |
| POST /api/strategy | 26 | 0.42 | 5 | 6 | 34 | 34 | 0 |
| probe GET /api/strategy/names | 244 | 3.99 | 4 | 5 | 17 | 33 | 0 |

#### 5 user(s), 61.2 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 62 | 1.01 | 4 | 5 | 61 | 61 | 0 |
| GET /api/group/all | 58 | 0.95 | 4 | 39 | 60 | 60 | 0 |
| GET /api/strategy/all | 132 | 2.16 | 4 | 5 | 51 | 54 | 0 |
| PATCH /api/run/back-test | 38 | 0.62 | 63 | 66 | 66 | 66 | 0 |
| POST /api/strategy | 62 | 1.01 | 5 | 7 | 60 | 60 | 0 |
| probe GET /api/strategy/names | 244 | 3.99 | 4 | 5 | 38 | 53 | 0 |

#### 10 user(s), 61.7 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 121 | 1.96 | 4 | 5 | 6 | 62 | 0 |
| GET /api/group/all | 116 | 1.88 | 4 | 47 | 56 | 69 | 0 |
| GET /api/strategy/all | 228 | 3.7 | 4 | 36 | 55 | 63 | 0 |
| PATCH /api/run/back-test | 112 | 1.82 | 64 | 100 | 114 | 116 | 0 |
| POST /api/strategy | 121 | 1.96 | 5 | 47 | 58 | 89 | 0 |
| probe GET /api/strategy/names | 246 | 3.99 | 4 | 25 | 60 | 63 | 0 |
