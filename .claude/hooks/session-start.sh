#!/bin/bash
set -euo pipefail

# Only needed in remote/web sessions — local Claude Code installs manage
# plugins themselves.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

claude plugin marketplace add obra/superpowers-marketplace --scope project
claude plugin install superpowers@superpowers-marketplace --scope project

claude plugin marketplace add hex/claude-marketplace --scope project
claude plugin install claude-council@hex-plugins --scope project
