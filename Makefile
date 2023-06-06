CURR_DIR:=$(dir $(realpath $(lastword $(MAKEFILE_LIST))))

NAME ?= rollup-worker
VERSION ?= 2.0.1
SED := sed
DEST_NAME ?= release/$(NAME)-$(VERSION).tgz

BUNDLE_OBJS := \
	bin \
	lib

BIN_CLI=bin/cli.js

.DEFAULT_GOAL := usage

usage:
	@echo "Usage: "
	@echo "> make build	- bundle stuffs"
	@echo "> make clean	- cleanup build files"

$(BUNDLE_OBJS):
	# Build with rollup
	@rollup -c

$(BIN_CLI): $(BUNDLE_OBJS)
	# Fixup $@
	@$(SED) -i'' '1s@^@#!/usr/bin/env node\n@' $@ \
		&& chmod +x $@

$(DEST_NAME):
	mkdir -p $(@D)
	tar czf $@ $(BUNDLE_OBJS)

build: $(BIN_CLI)

.PHONY: rebuild

rebuild: clean build

.PHONY: clean

clean:
	# Cleanup dists
	@rm -rf $(BUNDLE_OBJS)
	@echo 'cleanup done.'
