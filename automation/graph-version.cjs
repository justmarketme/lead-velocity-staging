'use strict';
// One Graph API version for every Meta call (19 Oct 2026). META_GRAPH_VERSION is the name; META_API_VERSION (and the old
// API_VERSION) are read only as fallbacks so an older .env keeps working. n8n Code nodes inline the same chain:
//   $env.META_GRAPH_VERSION || $env.META_API_VERSION || 'v25.0'
// automation/tests/graph-version.test.mjs fails if any reader uses META_API_VERSION without META_GRAPH_VERSION first.
const DEFAULT_GRAPH_VERSION = 'v25.0'; // supported until Jul 2028 (v26.0 is newer; bump deliberately)

function graphVersion(env = process.env) {
  const v = String(env.META_GRAPH_VERSION || env.META_API_VERSION || env.API_VERSION || DEFAULT_GRAPH_VERSION).trim();
  return v.startsWith('v') ? v : 'v' + v;
}

module.exports = { graphVersion, DEFAULT_GRAPH_VERSION };
