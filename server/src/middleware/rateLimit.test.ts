import test from "node:test";
import assert from "node:assert/strict";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { rateLimit } from "./rateLimit";

process.env.NODE_ENV = "test";

type FakeResponse = {
  res: Response;
  headers: Map<string, string>;
  statusCode: number;
  body: unknown;
};

function fakeResponse(): FakeResponse {
  const headers = new Map<string, string>();
  const state = { statusCode: 200, body: undefined as unknown };

  const res = {
    setHeader(name: string, value: string | number) {
      headers.set(name.toLowerCase(), String(value));
      return res;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
  };

  return {
    res: res as unknown as Response,
    headers,
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
  };
}

function invoke(
  middleware: RequestHandler,
  req: Partial<Request>,
): { nextCalled: boolean; res: FakeResponse } {
  const response = fakeResponse();
  let nextCalled = false;
  middleware(
    req as Request,
    response.res,
    (() => {
      nextCalled = true;
    }) as NextFunction,
  );
  return { nextCalled, res: response };
}

test("in test mode it bypasses the limit unless enforceInTest is set", () => {
  const bypassing = rateLimit({ windowMs: 1_000, max: 1, key: () => "ip" });
  assert.equal(invoke(bypassing, {}).nextCalled, true);
  assert.equal(invoke(bypassing, {}).nextCalled, true);
  assert.equal(bypassing.size, 0);

  const enforced = rateLimit({ windowMs: 1_000, max: 1, key: () => "ip", enforceInTest: true });
  assert.equal(invoke(enforced, {}).nextCalled, true);
  const blocked = invoke(enforced, {});
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 429);
});

test("allows up to max, then blocks with Retry-After", () => {
  let clock = 0;
  const limiter = rateLimit({
    windowMs: 60_000,
    max: 2,
    key: () => "ip",
    now: () => clock,
    enforceInTest: true,
  });

  assert.equal(invoke(limiter, {}).nextCalled, true);
  assert.equal(invoke(limiter, {}).nextCalled, true);

  const blocked = invoke(limiter, {});
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.statusCode, 429);
  assert.deepEqual(blocked.res.body, { error: "Too many attempts. Try again later." });
  assert.equal(blocked.res.headers.get("retry-after"), "60");
});

test("resets after the window and reports the remaining seconds", () => {
  let clock = 0;
  const limiter = rateLimit({
    windowMs: 60_000,
    max: 1,
    key: () => "ip",
    now: () => clock,
    enforceInTest: true,
  });

  assert.equal(invoke(limiter, {}).nextCalled, true);

  clock = 30_000;
  const blocked = invoke(limiter, {});
  assert.equal(blocked.nextCalled, false);
  assert.equal(blocked.res.headers.get("retry-after"), "30");

  clock = 60_000;
  assert.equal(invoke(limiter, {}).nextCalled, true);
});

test("keeps different keys in separate buckets", () => {
  const limiter = rateLimit({
    windowMs: 60_000,
    max: 1,
    key: (req) => String(req.headers["x-key"] ?? ""),
    enforceInTest: true,
  });

  assert.equal(invoke(limiter, { headers: { "x-key": "a" } }).nextCalled, true);
  assert.equal(invoke(limiter, { headers: { "x-key": "b" } }).nextCalled, true);
  assert.equal(invoke(limiter, { headers: { "x-key": "a" } }).nextCalled, false);
  assert.equal(invoke(limiter, { headers: { "x-key": "b" } }).nextCalled, false);
});

test("prunes expired buckets so the map cannot grow forever", () => {
  let clock = 0;
  const limiter = rateLimit({
    windowMs: 1_000,
    max: 1,
    key: (req) => String(req.headers["x-key"] ?? ""),
    now: () => clock,
    enforceInTest: true,
  });

  invoke(limiter, { headers: { "x-key": "a" } });
  invoke(limiter, { headers: { "x-key": "b" } });
  assert.equal(limiter.size, 2);

  clock = 1_000;
  invoke(limiter, { headers: { "x-key": "a" } });
  assert.equal(limiter.size, 1, "the expired bucket should be removed");
});
