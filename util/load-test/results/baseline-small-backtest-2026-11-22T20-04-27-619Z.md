### baseline: small profile, backtest mix (2026-11-22T20:04:27.619Z)



#### 1 user(s), 60.4 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| PATCH /api/run/back-test | 61 | 1.01 | 65 | 69 | 92 | 92 | 0 |
| probe GET /api/strategy/names | 241 | 3.99 | 4 | 18 | 55 | 61 | 0 |

#### 2 user(s), 60.6 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| PATCH /api/run/back-test | 114 | 1.88 | 68 | 95 | 135 | 144 | 0 |
| probe GET /api/strategy/names | 242 | 3.99 | 3 | 31 | 56 | 67 | 0 |

#### 5 user(s), 61.4 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| PATCH /api/run/back-test | 278 | 4.53 | 70 | 156 | 183 | 203 | 0 |
| probe GET /api/strategy/names | 245 | 3.99 | 4 | 61 | 118 | 125 | 0 |

#### 10 user(s), 61.2 s

| endpoint | requests | per s | p50 ms | p95 ms | p99 ms | max ms | errors |
|---|---|---|---|---|---|---|---|
| PATCH /api/run/back-test | 542 | 8.86 | 83 | 259 | 365 | 414 | 0 |
| probe GET /api/strategy/names | 244 | 3.99 | 12 | 96 | 168 | 196 | 0 |
