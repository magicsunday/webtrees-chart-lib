SHELL = /bin/bash

.SILENT:

# Do not print "Entering directory ..."
MAKEFLAGS += --no-print-directory

.DEFAULT_GOAL := help

# Includes
-include Make/*.mk

# Argument fix workaround: lets `make release 1.10.0` treat the version as a
# no-op goal (captured by VERSION in Make/release.mk) instead of a target.
%:
	@:

.PHONY: help
help:
	@echo "webtrees-chart-lib — available targets:"
	@echo ""
	@echo "  make release X.Y.Z [NOTES_FILE=path | NOTES=\"...\"]"
	@echo "      Verify (lint + test + build), bump package.json + package-lock,"
	@echo "      commit \"Release X.Y.Z\", tag, push and create the GitHub release."
	@echo ""
	@echo "  Runs in an environment that has the JS toolchain (git node npm jq gh),"
	@echo "  e.g. the webtrees buildbox. Non-interactive: export GH_TOKEN=<token>."
