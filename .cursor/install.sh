#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the Jayden S2K report tooling.
# Creates a local virtualenv and installs pinned Python dependencies.
set -euo pipefail

cd "$(dirname "$0")/.."

# The scripts need a working `python3 -m venv` + pip. The base image ships
# python3 but not always ensurepip/venv, so install them when missing.
if ! python3 -c "import ensurepip" >/dev/null 2>&1; then
  echo "Installing python3-venv / python3-pip ..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq python3-venv python3-pip
fi

if [ ! -x ".venv/bin/python" ]; then
  echo "Creating virtualenv at .venv ..."
  python3 -m venv .venv
fi

echo "Installing Python dependencies ..."
.venv/bin/python -m pip install --upgrade pip -q
.venv/bin/pip install -q -r requirements.txt

echo "Environment ready. Activate with: source .venv/bin/activate"
.venv/bin/pip show pdfplumber openpyxl requests | grep -E "^(Name|Version)"
