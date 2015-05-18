.SUFFIXES: .ts

trails-server.js: trails-server.ts
	tsc typings/node/node.d.ts trails-server.ts
