#!/bin/bash
if [ ! -e r ]; then mkdir r ; fi
if [ ! -d r ]; then echo "r exists but is not a directory"; exit 1; fi
if [ ! -e r/trails.html ]; then ( cd r ; ln -s ../trails.html ); fi
if [ ! -e r/trails-client.js ]; then ( cd r ; ln -s ../trails-client.js ); fi
if [ ! -e data ]; then mkdir data ; fi
if [ ! -d data ]; then echo "data exists but is not a directory"; exit 1; fi
if [ ! -e data/users.json ]; then echo '{ "version": 1, "users": [] }' > data/users.json ; fi
if [ ! -f data/users.json ]; then echo "data/users.json exists but is not a file"; exit 1; fi
