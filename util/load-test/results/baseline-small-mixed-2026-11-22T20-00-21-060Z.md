### baseline: small profile, mixed mix (2026-11-22T20:00:21.060Z)



#### 1 user(s), 60.7 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 12 | 0.2 | 3 | 4 | 4 | 4 | 0 |
| GET /api/group/all | 17 | 0.28 | 4 | 4 | 4 | 4 | 0 |
| GET /api/strategy/all | 24 | 0.4 | 4 | 5 | 6 | 6 | 0 |
| PATCH /api/run/back-test | 6 | 0.1 | 76 | 96 | 96 | 96 | 0 |
| POST /api/strategy | 12 | 0.2 | 5 | 6 | 6 | 6 | 0 |
| probe GET /api/strategy/names | 242 | 3.99 | 4 | 5 | 5 | 62 | 0 |

#### 2 user(s), 61.4 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 23 | 0.37 | 4 | 5 | 5 | 5 | 0 |
| GET /api/group/all | 29 | 0.47 | 4 | 31 | 49 | 49 | 0 |
| GET /api/strategy/all | 42 | 0.68 | 4 | 5 | 5 | 5 | 0 |
| PATCH /api/run/back-test | 24 | 0.39 | 68 | 73 | 75 | 75 | 0 |
| POST /api/strategy | 23 | 0.37 | 5 | 6 | 6 | 6 | 0 |
| probe GET /api/strategy/names | 245 | 3.99 | 4 | 4 | 26 | 56 | 0 |

#### 5 user(s), 61.4 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 55 | 0.9 | 3 | 5 | 6 | 6 | 0 |
| GET /api/group/all | 56 | 0.91 | 4 | 42 | 52 | 52 | 0 |
| GET /api/strategy/all | 115 | 1.87 | 4 | 10 | 44 | 56 | 0 |
| PATCH /api/run/back-test | 58 | 0.94 | 66 | 107 | 177 | 177 | 0 |
| POST /api/strategy | 55 | 0.9 | 5 | 12 | 43 | 43 | 0 |
| probe GET /api/strategy/names | 245 | 3.99 | 4 | 8 | 69 | 87 | 0 |

#### 10 user(s), 61.7 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| DELETE /api/strategy/:id | 129 | 2.09 | 3 | 4 | 6 | 64 | 0 |
| GET /api/group/all | 106 | 1.72 | 4 | 47 | 54 | 65 | 0 |
| GET /api/strategy/all | 220 | 3.57 | 4 | 25 | 62 | 66 | 0 |
| PATCH /api/run/back-test | 130 | 2.11 | 67 | 124 | 146 | 147 | 0 |
| POST /api/strategy | 129 | 2.09 | 5 | 41 | 68 | 84 | 0 |
| probe GET /api/strategy/names | 246 | 3.99 | 4 | 31 | 56 | 64 | 0 |
