// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Daniel Braniewski. See the LICENSE file for rights and obligations.
import test from "node:test";
import assert from "node:assert/strict";
import { validateSocketRequest } from "../scripts/socket.mjs";

test("socket requests reject malformed and unauthorized action envelopes", () => {
  assert.match(validateSocketRequest(null), /Invalid/);
  assert.match(validateSocketRequest({ kind: "request", requestId: "r", fromUserId: "u", action: "delete-world", data: {} }), /Unknown/);
  assert.match(validateSocketRequest({ kind: "request", requestId: "bad id", fromUserId: "u", action: "record-attempt", data: {} }), /request id/i);
  assert.equal(validateSocketRequest({ kind: "request", requestId: "request-1", fromUserId: "user-1", toUserId: "gm-1", action: "record-attempt", data: {} }), null);
});
