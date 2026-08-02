// Demo file for the CI/CD pipeline write-up — deliberately wrong
// assertion so the `unit` job fails on this run. Removed next commit.
const test = require('node:test');
const assert = require('node:assert');

test('placeholder check used to demonstrate a failing CI run', () => {
    assert.strictEqual(1 + 1, 3);
});
