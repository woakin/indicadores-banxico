import { fmtValue, fmtDate, escapeHTML } from './utils.js';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || "Assertion failed");
    }
}

console.log("Running manual tests...");

// escapeHTML tests
assert(escapeHTML('<b>"Hello" & \'World\'</b>') === '&lt;b&gt;&quot;Hello&quot; &amp; &#039;World&#039;&lt;/b&gt;', "escapeHTML fails basic escape");
assert(escapeHTML(null) === '', "escapeHTML fails null");
assert(escapeHTML(undefined) === '', "escapeHTML fails undefined");
assert(escapeHTML('Plain text') === 'Plain text', "escapeHTML fails plain text");
assert(escapeHTML(123) === '123', "escapeHTML fails numeric");

console.log("escapeHTML tests passed!");

// Simple fmtValue test to ensure utils.js is still working
assert(fmtValue({}, 1234.56).includes('1,234.56') || fmtValue({}, 1234.56).includes('1.234,56'), "fmtValue failed basic check");

console.log("All manual tests passed!");
