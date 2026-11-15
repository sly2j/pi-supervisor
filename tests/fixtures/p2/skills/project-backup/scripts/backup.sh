#!/bin/sh
# Test stand-in for the real backup script: reports where it ran.
echo "=== BACKUP REPORT ==="
pwd -P
exit "${STUB_EXIT:-0}"
